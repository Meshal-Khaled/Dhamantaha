import assert from 'node:assert/strict';
import { it } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { containerSnapshot } from '../src/admin/containers.js';
import { withServer } from './helpers.js';

it('requires admin authentication for container snapshots and serves the logs page', async () => {
  await withServer({}, async ({ baseUrl }) => {
    assert.equal((await fetch(`${baseUrl}/admin/api/containers`)).status, 401);
    const page = await fetch(`${baseUrl}/dashboard/logs`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Containers &amp; logs/);
  });
});

it('marks stale snapshots and reflects live dashboard overrides without keys', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'container-status-'));
  const filename = join(dir, 'containers.json');
  try {
    const data = { collectedAt: new Date(Date.now() - 60_000).toISOString(), containers: [{ name: 'dhamantaha-infrastructure-1', logs: [] }] };
    await writeFile(filename, JSON.stringify(data));
    const provider = { activeProvider: 'gemini', label: 'Gemini', keyCount: 3, keySource: 'dashboard', model: 'test' };
    const result = await containerSnapshot({ filename, provider });
    assert.equal(result.stale, true);
    assert.deepEqual(result.containers[0].keyAssignments, ['Key 1 · dashboard override', 'Key 2 · gemini.2.key', 'Key 3 · gemini.3.key']);
    data.collectedAt = new Date().toISOString();
    await writeFile(filename, JSON.stringify(data));
    assert.equal((await containerSnapshot({ filename, provider })).stale, false);
    const switched = await containerSnapshot({ filename, provider: { ...provider, activeProvider: 'other', label: 'Saved Gemini' } });
    assert.deepEqual(switched.containers[0].keyAssignments, ['Saved Gemini · saved provider key']);
    await writeFile(filename, 'broken');
    assert.equal((await containerSnapshot({ filename, provider })).available, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
