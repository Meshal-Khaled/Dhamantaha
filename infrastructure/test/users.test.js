import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUsage } from '../src/admin/usage.js';
import { analyze, makeImage, uploadForm, withServer } from './helpers.js';

test('user counters migrate existing state, keep all four activities, and persist unassigned analyses', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'users-migrate-'));
  try {
    const id = 'a'.repeat(32);
    await writeFile(join(dir, 'usage.json'), JSON.stringify({ totals: { refetches: 4, downloads: 2 }, users: { [id]: { refetches: 4, downloads: 2, firstSeen: 1000, lastSeen: 2000 } } }));
    const usage = createUsage({ directory: dir, now: () => 3000 });
    usage.record(id, { app_visit: 2 });
    usage.recordAnalysis(id);
    usage.recordAnalysis(undefined);
    await usage.flush();
    const state = createUsage({ directory: dir, now: () => 3000 }).snapshot();
    assert.deepEqual([state.refetches, state.visits, state.analyses, state.downloads, state.unattributedAnalyses], [4, 2, 2, 2, 1]);
    assert.deepEqual(state.recentUsers[0], { user: 'aaaaaaaa', refetches: 4, visits: 2, analyses: 1, downloads: 2, firstSeen: new Date(1000).toISOString(), lastSeen: new Date(3000).toISOString() });
    assert.equal(JSON.parse(await readFile(join(dir, 'usage.json'))).totals.visits, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('analysis counts are server-side, authenticated, separate from users reports and warranty explanations', async () => {
  await withServer({ env: { ADMIN_KEY: 'users-test-admin', CLIENT_KEYS: 'android:users-test-app-key-1234' } }, async ({ baseUrl }) => {
    const headers = { 'Content-Type': 'application/json', 'X-Dashboard-Request': '1' };
    const login = await fetch(`${baseUrl}/admin/api/login`, { method: 'POST', headers, body: JSON.stringify({ key: 'users-test-admin' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const report = (events) => fetch(`${baseUrl}/v1/usage`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Client-Key': 'users-test-app-key-1234' }, body: JSON.stringify({ deviceId: 'a'.repeat(32), events }) });
    assert.equal((await report({ app_visit: 1 })).status, 202);
    assert.equal((await report({ receipt_analysis: 99 })).status, 400);
    const file = await makeImage();
    await analyze(baseUrl, uploadForm(file), { headers: { 'X-Install-Id': 'a'.repeat(32) } }); // Unauthorized.
    await analyze(baseUrl, uploadForm(file), { headers: { 'X-Client-Key': 'users-test-app-key-1234', 'X-Install-Id': 'a'.repeat(32) } });
    await analyze(baseUrl, uploadForm(file), { headers: { 'X-Client-Key': 'users-test-app-key-1234' } });
    await fetch(`${baseUrl}/v1/warranty/explain`, { method: 'POST', headers: { 'X-Client-Key': 'users-test-app-key-1234', 'X-Install-Id': 'a'.repeat(32) }, body: uploadForm(file) });
    const users = await (await fetch(`${baseUrl}/admin/api/users`, { headers: { Cookie: cookie } })).json();
    assert.equal(users.visits, 1);
    assert.equal(users.analyses, 2);
    assert.equal(users.unattributedAnalyses, 1);
    assert.equal(users.recentUsers[0].analyses, 1);
    assert.equal((await (await fetch(`${baseUrl}/admin/api/monitoring`, { headers: { Cookie: cookie } })).json()).usage, undefined);
  });
});
