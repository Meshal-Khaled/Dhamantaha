import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { createRuntime } from '../src/admin/runtime.js';
import { createMonitoring } from '../src/admin/monitoring.js';
import { analyze, fakeProvider, makeImage, makePdf, RECEIPT_LINES, sampleProviderResponse, uploadForm, withServer } from './helpers.js';

const ADMIN = 'test-private-ring-admin-key';
const SECRET = 'test-private-provider-key';
async function admin(baseUrl, path, { cookie, method = 'GET', body, csrf = true } = {}) {
  return fetch(`${baseUrl}/admin/api${path}`, { method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-Dashboard-Request': '1' } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
async function login(baseUrl) {
  const response = await admin(baseUrl, '/login', { method: 'POST', body: { key: ADMIN } });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}

describe('private dashboard', () => {
  it('serves the dashboard at root and identifies the v1 base URL', async () => {
    await withServer({}, async ({ baseUrl }) => {
      const response = await fetch(baseUrl);
      assert.equal(response.status, 200);
      assert.ok(response.url.endsWith('/dashboard/api-settings'));
      assert.match(await response.text(), /API settings/);
      assert.equal((await fetch(`${baseUrl}/dashboard/monitoring`)).status, 200);
      assert.equal((await fetch(`${baseUrl}/dashboard/monitoring`)).url, `${baseUrl}/dashboard/api-monitoring`);
      assert.equal((await fetch(`${baseUrl}/dashboard/users`)).status, 200);
      const api = await (await fetch(`${baseUrl}/v1`)).json();
      assert.equal(api.endpoints.analyzeReceipt, '/v1/receipts/analyze');
      assert.equal((await fetch(`${baseUrl}/v1/health`)).status, 200);
    });
  });

  it('requires admin authentication and does not accept an app key', async () => {
    await withServer({ env: { ADMIN_KEY: ADMIN, CLIENT_KEYS: `android:${ADMIN}` } }, async ({ baseUrl }) => {
      assert.equal((await admin(baseUrl, '/settings')).status, 401);
      assert.equal((await admin(baseUrl, '/monitoring')).status, 401);
      assert.equal((await admin(baseUrl, '/users')).status, 401);
      const rejected = await fetch(`${baseUrl}/admin/api/settings`, { headers: { 'X-Client-Key': ADMIN } });
      assert.equal(rejected.status, 401);
      assert.equal((await admin(baseUrl, '/login', { method: 'POST', body: { key: 'wrong-key' } })).status, 401);
      const response = await admin(baseUrl, '/login', { method: 'POST', body: { key: ADMIN } });
      const header = response.headers.get('set-cookie');
      assert.match(header, /HttpOnly/);
      assert.match(header, /SameSite=Strict/);
      assert.doesNotMatch(await response.text(), new RegExp(ADMIN));
    });
  });

  it('rejects missing CSRF headers and invalidates sessions on logout', async () => {
    await withServer({ env: { ADMIN_KEY: ADMIN } }, async ({ baseUrl }) => {
      const cookie = await login(baseUrl);
      assert.equal((await admin(baseUrl, '/settings', { cookie, method: 'PUT', body: { model: 'gemini-test' }, csrf: false })).status, 403);
      assert.equal((await admin(baseUrl, '/settings', { cookie })).status, 200);
      assert.equal((await admin(baseUrl, '/logout', { cookie, method: 'POST' })).status, 200);
      assert.equal((await admin(baseUrl, '/settings', { cookie })).status, 401);
    });
  });

  it('saves private settings without returning or logging the key', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dhamantaha-admin-'));
    const logLines = [];
    try {
      await withServer({ env: { ADMIN_KEY: ADMIN, ADMIN_STATE_DIRECTORY: dir, GEMINI_API_KEY: 'ring-original-key', GEMINI_MODEL: 'gemini-original' }, logLines }, async ({ baseUrl }) => {
        const cookie = await login(baseUrl);
        const saved = await admin(baseUrl, '/settings', { cookie, method: 'PUT', body: { model: 'gemini-new', apiKey: SECRET } });
        assert.equal(saved.status, 200);
        const summary = await saved.json();
        assert.equal(summary.model, 'gemini-new');
        assert.equal(summary.keySource, 'dashboard');
        assert.equal(summary.keyConfigured, true);
        assert.doesNotMatch(JSON.stringify(summary), new RegExp(SECRET));
        assert.equal(JSON.parse(await readFile(join(dir, 'provider.json'), 'utf8')).apiKey, SECRET);
        if (process.platform !== 'win32') assert.equal((await stat(join(dir, 'provider.json'))).mode & 0o777, 0o600);
        await admin(baseUrl, '/settings', { cookie, method: 'PUT', body: { model: 'gemini-next', apiKey: '' } });
        assert.equal(JSON.parse(await readFile(join(dir, 'provider.json'), 'utf8')).apiKey, SECRET);
        assert.equal((await admin(baseUrl, '/settings/key', { cookie, method: 'DELETE' })).status, 200);
        const reset = await (await admin(baseUrl, '/settings', { cookie })).json();
        assert.equal(reset.keySource, 'ring');
        assert.equal(JSON.parse(await readFile(join(dir, 'provider.json'), 'utf8')).apiKey, undefined);
      });
      assert.doesNotMatch(JSON.stringify(logLines), new RegExp(`${ADMIN}|${SECRET}`));
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('rejects invalid settings without changing the provider', async () => {
    await withServer({ env: { ADMIN_KEY: ADMIN } }, async ({ baseUrl }) => {
      const cookie = await login(baseUrl);
      assert.equal((await admin(baseUrl, '/settings', { cookie, method: 'PUT', body: { model: 'https://attacker.invalid', apiKey: SECRET } })).status, 400);
      assert.equal((await admin(baseUrl, '/settings', { cookie, method: 'PUT', body: { model: 'gemini-test', apiKey: 'bad\nkey' } })).status, 400);
      assert.equal((await admin(baseUrl, '/settings', { cookie, method: 'PUT', body: { model: 'gemini-test' } })).status, 503);
    });
  });

  it('reports real analysis outcomes without receipt details', async () => {
    await withServer({ env: { ADMIN_KEY: ADMIN } }, async ({ baseUrl }) => {
      const cookie = await login(baseUrl);
      await analyze(baseUrl, uploadForm(await makeImage()));
      await fetch(`${baseUrl}/v1/receipts/analyze`, { method: 'POST' });
      const response = await admin(baseUrl, '/monitoring', { cookie });
      const data = await response.json();
      assert.equal(data.totalRequests, 2);
      assert.equal(data.successfulRequests, 1);
      assert.equal(data.failedRequests, 1);
      assert.equal(data.successRate, 50);
      assert.equal(data.budget.used, 1);
      assert.equal(data.recent.length, 2);
      assert.equal(data.activeRequests, 0);
      assert.equal(data.timeline.length, 60);
      assert.equal(data.timeline.reduce((n, b) => n + b.requests, 0), 2);
      assert.doesNotMatch(JSON.stringify(data), /eXtra|Galaxy|SN-ABC|3499|sourceText|apiKey/);
    });
  });
});

describe('debug capture', () => {
  const evidence = { merchantEvidence: 'Header: "Jarir Bookstore", VAT 300000000000003. Hayat Mall is only the address line.' };
  const provider = () => fakeProvider(() => {
    const base = sampleProviderResponse();
    return { ...base, receipt: { ...base.receipt, ...evidence, merchantName: 'Jarir Bookstore' } };
  });

  it('keeps nothing when started off (DEBUG_CAPTURE=false) until an admin switches it on', async () => {
    await withServer({ env: { ADMIN_KEY: ADMIN, DEBUG_CAPTURE: 'false' }, provider: provider() }, async ({ baseUrl }) => {
      const cookie = await login(baseUrl);
      await analyze(baseUrl, uploadForm(await makeImage()));
      const state = await (await admin(baseUrl, '/debug', { cookie })).json();
      assert.deepEqual([state.enabled, state.count, state.captures], [false, 0, []]);
      assert.equal((await admin(baseUrl, '/debug')).status, 401);
      assert.equal((await admin(baseUrl, '/debug', { cookie, method: 'PUT', body: { enabled: 'yes' } })).status, 400);
    });
  });

  it('records what was sent and received for photos, without changing the app response', async () => {
    await withServer({ env: { ADMIN_KEY: ADMIN }, provider: provider() }, async ({ baseUrl }) => {
      const cookie = await login(baseUrl);
      await admin(baseUrl, '/debug', { cookie, method: 'PUT', body: { enabled: true } });
      const { response, body } = await analyze(baseUrl, uploadForm(await makeImage(), { name: 'bill.jpg', type: 'image/jpeg' }));
      assert.equal(response.status, 200);
      assert.equal(body.receipt.merchantName, 'Jarir Bookstore');
      assert.equal(body.receipt.merchantEvidence, undefined);

      const { captures } = await (await admin(baseUrl, '/debug', { cookie })).json();
      assert.equal(captures.length, 1);
      const [capture] = captures;
      assert.equal(capture.requestId, body.requestId);
      assert.equal(capture.status, 200);
      assert.equal(capture.request.method, 'POST');
      assert.equal(capture.request.path, '/v1/receipts/analyze');
      assert.equal(capture.request.headers.clientKey, 'missing');
      assert.match(capture.request.headers.contentType, /^multipart\/form-data/);
      assert.equal(capture.request.upload.filename, 'bill.jpg');
      assert.equal(capture.request.upload.detectedType, 'image/jpeg');
      assert.equal(capture.modelCalls.length, 1);
      assert.equal(capture.modelCalls[0].sent.kind, 'image');
      assert.match(capture.modelCalls[0].sent.preview, /^data:image\/jpeg;base64,/);
      assert.equal(capture.modelCalls[0].rawOutput.receipt.merchantEvidence, evidence.merchantEvidence);
      assert.equal(capture.response.body.receipt.merchantName, 'Jarir Bookstore');

      const monitoring = JSON.stringify(await (await admin(baseUrl, '/monitoring', { cookie })).json());
      assert.doesNotMatch(monitoring, /Jarir|Hayat|merchantEvidence/);
    });
  });

  it('shows the extracted PDF text sent to the model and records failures', async () => {
    await withServer({ env: { ADMIN_KEY: ADMIN }, provider: provider() }, async ({ baseUrl }) => {
      const cookie = await login(baseUrl);
      await admin(baseUrl, '/debug', { cookie, method: 'PUT', body: { enabled: true } });
      await analyze(baseUrl, uploadForm(makePdf([RECEIPT_LINES]), { name: 'bill.pdf', type: 'application/pdf' }));
      await analyze(baseUrl, uploadForm(Buffer.from('not a receipt'), { name: 'x.txt' }));
      const { captures } = await (await admin(baseUrl, '/debug', { cookie })).json();
      assert.equal(captures.length, 2);
      assert.equal(captures[0].status, 415);
      assert.equal(captures[0].response.body.error.code, 'unsupported_file_type');
      assert.equal(captures[1].processing.processingMethod, 'pdf_text');
      assert.equal(captures[1].modelCalls[0].sent.kind, 'pdf_text');
      assert.match(captures[1].modelCalls[0].sent.text, /eXtra Electronics/);
    });
  });

  it('records requests rejected before analysis without keeping the client key', async () => {
    const env = { ADMIN_KEY: ADMIN, CLIENT_KEYS: 'android:app-secret-key-1234' };
    await withServer({ env, provider: provider() }, async ({ baseUrl }) => {
      const cookie = await login(baseUrl);
      await analyze(baseUrl, uploadForm(await makeImage()), { headers: { 'X-Client-Key': 'wrong-key-value' } });
      await analyze(baseUrl, uploadForm(await makeImage()));
      const { captures } = await (await admin(baseUrl, '/debug', { cookie })).json();
      assert.deepEqual(captures.map((c) => [c.status, c.request.headers.clientKey]), [[401, 'missing'], [401, 'sent']]);
      assert.equal(captures[0].response.body.error.code, 'unauthorized_client');
      assert.deepEqual(captures[0].modelCalls, []);
      assert.doesNotMatch(JSON.stringify(captures), /wrong-key-value|app-secret-key/);
    });
  });

  it('empties the captures when switched off or cleared', async () => {
    await withServer({ env: { ADMIN_KEY: ADMIN }, provider: provider() }, async ({ baseUrl }) => {
      const cookie = await login(baseUrl);
      await admin(baseUrl, '/debug', { cookie, method: 'PUT', body: { enabled: true } });
      await analyze(baseUrl, uploadForm(await makeImage()));
      assert.equal((await (await admin(baseUrl, '/debug', { cookie, method: 'DELETE' })).json()).count, 0);
      await analyze(baseUrl, uploadForm(await makeImage()));
      const off = await (await admin(baseUrl, '/debug', { cookie, method: 'PUT', body: { enabled: false } })).json();
      assert.deepEqual([off.enabled, off.count], [false, 0]);
    });
  });
});

describe('provider settings runtime', () => {
  it('applies updates immediately and reloads saved settings after restart', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dhamantaha-runtime-'));
    const env = { ADMIN_STATE_DIRECTORY: dir, GEMINI_API_KEY: 'original-key', GEMINI_MODEL: 'gemini-old' };
    const factory = (cfg) => {
      const selected = { ...cfg.gemini };
      return { provider: { name: 'gemini', analyze: async () => selected } };
    };
    try {
      const runtime = createRuntime(loadConfig(env), { providerFactory: factory });
      await runtime.save({ model: 'models/gemini-new', apiKey: SECRET });
      assert.deepEqual(await runtime.provider.analyze({}), { apiKey: SECRET, model: 'gemini-new', timeoutMs: 60000, fallbackModels: [], fallbackKeys: [], totalTimeoutMs: 85000, hedgeAfterMs: 12000 });
      const restarted = createRuntime(loadConfig(env), { providerFactory: factory });
      assert.equal((await restarted.provider.analyze({})).apiKey, SECRET);
      assert.equal(restarted.summary().model, 'gemini-new');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('bounds recent monitoring metadata to 60 entries', () => {
    const monitor = createMonitoring();
    for (let i = 0; i < 80; i += 1) monitor.record({ method: 'POST', path: '/v1/receipts/analyze', status: 200, durationMs: 20, requestId: String(i), receipt: SECRET });
    const data = monitor.snapshot();
    assert.equal(data.totalRequests, 80);
    assert.equal(data.recent.length, 60);
    assert.doesNotMatch(JSON.stringify(data), new RegExp(SECRET));
  });

  it('counts receipt reopens and original downloads per anonymous install', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dhamantaha-usage-'));
    const report = (baseUrl, body, headers = {}) => fetch(`${baseUrl}/v1/usage`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const env = { ADMIN_KEY: ADMIN, ADMIN_STATE_DIRECTORY: dir, CLIENT_KEYS: 'android:android-usage-test-key' };
    const key = { 'X-Client-Key': 'android-usage-test-key' };
    try {
      await withServer({ env }, async ({ baseUrl }) => {
        const cookie = await login(baseUrl);
        const empty = await (await admin(baseUrl, '/users', { cookie })).json();
        assert.deepEqual([empty.refetches, empty.downloads, empty.users], [0, 0, 0]);
        assert.equal((await report(baseUrl, { deviceId: 'a'.repeat(32), events: { receipt_refetch: 1 } })).status, 401);
        assert.equal((await report(baseUrl, { deviceId: 'a'.repeat(32), events: { receipt_refetch: 2, original_download: 1 } }, key)).status, 202);
        assert.equal((await report(baseUrl, { deviceId: 'a'.repeat(32), events: { receipt_refetch: 1 } }, key)).status, 202);
        assert.equal((await report(baseUrl, { deviceId: 'b'.repeat(32), events: { original_download: 3 } }, key)).status, 202);
        for (const bad of [{}, { deviceId: 'short', events: { receipt_refetch: 1 } }, { deviceId: 'c'.repeat(32), events: {} },
          { deviceId: 'c'.repeat(32), events: { receipt_refetch: 0 } }, { deviceId: 'c'.repeat(32), events: { receipt_refetch: 1.5 } },
          { deviceId: 'c'.repeat(32), events: { receipt_refetch: 1000 } }, { deviceId: 'c'.repeat(32), events: { receipt_name: 1 } }]) {
          const rejected = await report(baseUrl, bad, key);
          assert.equal(rejected.status, 400, JSON.stringify(bad));
          assert.equal((await rejected.json()).error.code, 'invalid_usage_report');
        }
        assert.equal((await fetch(`${baseUrl}/v1/usage`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...key }, body: '{nope' })).status, 400);
        const usage = await (await admin(baseUrl, '/users', { cookie })).json();
        assert.deepEqual([usage.refetches, usage.downloads, usage.users, usage.activeLast24h], [3, 4, 2, 2]);
        const first = usage.recentUsers.find((user) => user.user === 'aaaaaaaa');
        assert.deepEqual([first.refetches, first.downloads], [3, 1]);
        assert.doesNotMatch(JSON.stringify(usage), /aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);
        // Usage reports are not analysis requests.
        assert.equal((await (await admin(baseUrl, '/monitoring', { cookie })).json()).totalRequests, 0);
        assert.equal((await (await admin(baseUrl, '/monitoring', { cookie })).json()).usage, undefined);
      });
      // Closing the server does not flush; the counters were written by the debounce or on stop.
      const { createUsage } = await import('../src/admin/usage.js');
      const usage = createUsage({ directory: dir });
      usage.record('d'.repeat(32), { receipt_refetch: 1 });
      await usage.flush();
      const restored = createUsage({ directory: dir }).snapshot();
      assert.equal(restored.refetches, 1);
      assert.equal(restored.users, 1);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
