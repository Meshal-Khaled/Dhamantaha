import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeReceipt, ApiError, checkFileAgainstLimits, checkHealth, describeError } from '../src/lib/api.js';

const reply = (status, body, headers = {}) => async () =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });

const settings = { baseUrl: 'https://ring.test/v1/', clientKey: 'k-123' };
const limits = { acceptedTypes: ['application/pdf', 'image/jpeg'], maxImageBytes: 100, maxPdfBytes: 50, maxPdfPages: 10 };

test('analyzeReceipt posts one multipart file with the client key', async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return new Response(JSON.stringify({ requestId: 'r1', receipt: {}, items: [] }), { status: 200, headers: { 'X-Request-Id': 'r1' } });
  };
  const file = new File([new Uint8Array([1, 2, 3])], 'bill.jpg', { type: 'image/jpeg' });
  const result = await analyzeReceipt({ ...settings, file }, { fetchImpl });

  assert.equal(seen.url, 'https://ring.test/v1/receipts/analyze');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers['X-Client-Key'], 'k-123');
  assert.equal(seen.init.headers['Content-Type'], undefined);
  assert.equal(seen.init.body.getAll('file').length, 1);
  assert.equal(seen.init.body.get('file').name, 'bill.jpg');
  assert.equal(result.requestId, 'r1');
});

test('analyzeReceipt omits the key header when none is set', async () => {
  let headers;
  const fetchImpl = async (url, init) => ((headers = init.headers), new Response('{"receipt":{},"items":[]}', { status: 200 }));
  await analyzeReceipt({ baseUrl: 'https://x/v1', clientKey: '', file: new File(['a'], 'a.pdf') }, { fetchImpl });
  assert.deepEqual(headers, {});
});

test('server errors become ApiError with code, request id and retry-after', async () => {
  const body = { error: { code: 'rate_limited', message: 'Slow down.', requestId: 'r9' } };
  await assert.rejects(
    analyzeReceipt({ ...settings, file: new File(['a'], 'a.pdf') }, { fetchImpl: reply(429, body, { 'Retry-After': '30' }) }),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, 'rate_limited');
      assert.equal(error.status, 429);
      assert.equal(error.requestId, 'r9');
      assert.equal(error.retryAfterSeconds, 30);
      assert.match(describeError(error), /Try again in 30 s/);
      return true;
    },
  );
});

test('a non-JSON answer (proxy page) is reported as such', async () => {
  await assert.rejects(
    analyzeReceipt({ ...settings, file: new File(['a'], 'a.pdf') }, { fetchImpl: reply(200, '<html>login</html>') }),
    { code: 'non_json_response' },
  );
  const error = await checkHealth(settings, { fetchImpl: reply(502, '<html>bad gateway</html>') }).catch((e) => e);
  assert.equal(error.code, 'non_json_response');
  assert.match(describeError(error), /proxy|captive/);
});

test('network failures and timeouts are distinguished', async () => {
  const offline = await checkHealth(settings, { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }).catch((e) => e);
  assert.equal(offline.code, 'network_error');

  const hang = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const slow = await checkHealth(settings, { fetchImpl: hang, timeoutMs: 20 }).catch((e) => e);
  assert.equal(slow.code, 'client_timeout');
});

test('checkHealth returns the limits and surfaces a rejected key', async () => {
  const ok = await checkHealth(settings, { fetchImpl: reply(200, { status: 'ok', provider: 'gemini', clientKeyRequired: true, limits }) });
  assert.equal(ok.health.limits.maxPdfPages, 10);

  const body = { error: { code: 'unauthorized_client', message: 'Unknown key.', requestId: 'r2' } };
  const rejected = await checkHealth(settings, { fetchImpl: reply(401, body) }).catch((e) => e);
  assert.equal(rejected.code, 'unauthorized_client');
  assert.match(describeError(rejected), /access key/);
});

test('checkFileAgainstLimits rejects wrong types and oversize files before upload', () => {
  const big = new File([new Uint8Array(101)], 'big.jpg', { type: 'image/jpeg' });
  assert.match(checkFileAgainstLimits(big, limits), /larger than/);
  const pdf = new File([new Uint8Array(51)], 'a.pdf', { type: 'application/pdf' });
  assert.match(checkFileAgainstLimits(pdf, limits), /PDF is larger/);
  const gif = new File(['x'], 'a.gif', { type: 'image/gif' });
  assert.match(checkFileAgainstLimits(gif, limits), /not supported/);
  const fine = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
  assert.equal(checkFileAgainstLimits(fine, limits), null);
  assert.equal(checkFileAgainstLimits(fine, null), null);
});
