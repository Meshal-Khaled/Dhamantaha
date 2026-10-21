import assert from 'node:assert/strict';
import { it } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { containerSnapshot } from '../src/admin/containers.js';
import { withServer } from './helpers.js';
import { createUsage } from '../src/admin/usage.js';

it('keeps QR names, teams and request outcomes in private metadata, preserving them on restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qr-named-activity-'));
  try {
    const usage = createUsage({ directory: dir, allowProfiles: true });
    await withServer({ usage }, async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/v1/usage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: 'test-install-12345', events: {}, profile: { name: 'TEST User', team: 'TEST Team' } }) });
      assert.equal(response.status, 202);
    });
    usage.beginRequest('test-install-12345', 'request-a');
    usage.finishRequest('request-a', { status: 200, durationMs: 123, attempts: [{ key: 'key 2', ok: true }] });
    await usage.flush();
    const reloaded = createUsage({ directory: dir, allowProfiles: true });
    assert.equal(reloaded.snapshot().recentUsers[0].name, 'TEST User');
    assert.equal(reloaded.snapshot().recentUsers[0].team, 'TEST Team');
    const { readFile } = await import('node:fs/promises');
    const saved = JSON.parse(await readFile(join(dir, 'usage.json'), 'utf8'));
    assert.equal(saved.requests[0].name, 'TEST User');
    assert.equal(saved.requests[0].winningKey, 'key 2');
    assert.equal(saved.requests[0].state, 'success');
    assert.equal(saved.requests[0].durationMs, 123);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('records only observed container usage and preserves it across restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qr-attribution-'));
  try {
    const old = createUsage({ directory: dir });
    old.record('legacy-install-1234', { app_visit: 1 });
    await old.flush();
    const qr = createUsage({ directory: dir, containers: ['dhamantaha-website-website-1', 'dhamantaha-qr-1'] });
    assert.deepEqual(qr.snapshot().recentUsers[0].containers, []);
    qr.record('qr-new-install-1234', { app_visit: 1 });
    qr.recordAnalysis('qr-new-install-1234');
    await qr.flush();
    const reloaded = createUsage({ directory: dir }).snapshot();
    const user = reloaded.recentUsers.find(u => u.user === 'qr-new-i');
    assert.equal(user.analyses, 1);
    assert.deepEqual(user.containers, ['dhamantaha-website-website-1', 'dhamantaha-qr-1']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('requires admin authentication for container snapshots and serves the logs page', async () => {
  await withServer({}, async ({ baseUrl }) => {
    assert.equal((await fetch(`${baseUrl}/admin/api/containers`)).status, 401);
    const page = await fetch(`${baseUrl}/dashboard/logs`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Containers &amp; logs/);
  });
});

it('limits snapshots to the QR website and QR backend, including stale detection', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'container-status-'));
  const filename = join(dir, 'containers.json');
  try {
    const data = { collectedAt: new Date(Date.now() - 60_000).toISOString(), containers: [
      { name: 'magic-db', logs: [] }, { name: 'dhamantaha-infrastructure-1', logs: [] },
      { name: 'dhamantaha-qr-1', logs: [], keyAssignments: ['gemini.key', 'gemini.2.key', 'gemini.3.key'] },
      { name: 'dhamantaha-website-website-1', logs: [], keyAssignments: [] }
    ] };
    await writeFile(filename, JSON.stringify(data));
    const result = await containerSnapshot({ filename });
    assert.equal(result.stale, true);
    assert.deepEqual(result.containers.map(c => c.name), ['dhamantaha-qr-1', 'dhamantaha-website-website-1']);
    assert.equal(result.containers[0].keyAssignments.length, 3);
    data.collectedAt = new Date().toISOString();
    await writeFile(filename, JSON.stringify(data));
    assert.equal((await containerSnapshot({ filename })).stale, false);
    await writeFile(filename, 'broken');
    assert.equal((await containerSnapshot({ filename })).available, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
