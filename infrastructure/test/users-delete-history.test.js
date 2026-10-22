import assert from 'node:assert/strict';
import { it } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { createUsage } from '../src/admin/usage.js';
import { createMonitoring } from '../src/admin/monitoring.js';
import { qrClient, qrInternalRouter } from '../src/admin/qrLink.js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';
import { createDailyBudget } from '../src/http/protection.js';

const DAY = 24 * 60 * 60 * 1000;
// Noon in Riyadh, so day boundaries are never close.
const NOON = Date.parse('2026-10-22T09:00:00Z');
const TOKEN = 'q'.repeat(40);
const ADMIN = 'delete-test-admin-key';

async function listen(app) {
  // Bare test apps answer errors with their status, without Express printing them.
  app.use((err, req, res, next) => res.status(err.status ?? 500).end()); // eslint-disable-line no-unused-vars
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }) };
}

it('deletes users with their share of the totals and their request rows, and keeps the deletion after a restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'users-delete-'));
  try {
    const usage = createUsage({ directory: dir, allowProfiles: true, now: () => NOON });
    usage.record('test-install-aaaa1', { app_visit: 2, receipt_refetch: 1 }, { name: 'TEST One', team: 'TEST Team' });
    usage.recordAnalysis('test-install-aaaa1');
    usage.record('keep-install-bbbb1', { app_visit: 1 });
    usage.record('twin-install-cccc1', { app_visit: 1 });
    usage.record('twin-install-cccc2', { app_visit: 1 });
    usage.beginRequest('test-install-aaaa1', 'request-1');
    usage.beginRequest('keep-install-bbbb1', 'request-2');
    const result = usage.deleteUsers(['test-ins', 'twin-ins', 'missing1']);
    assert.deepEqual(result, { deleted: ['test-ins'], notFound: ['missing1'], ambiguous: ['twin-ins'] });
    const state = usage.snapshot();
    assert.deepEqual([state.users, state.visits, state.refetches, state.analyses], [3, 3, 0, 0]);
    assert.equal(state.recentUsers.some((user) => user.user === 'test-ins'), false);
    assert.equal(state.history.at(-1).visits, 3);
    await usage.flush();
    const saved = JSON.parse(await readFile(join(dir, 'usage.json'), 'utf8'));
    assert.deepEqual(saved.requests.map((row) => row.requestId), ['request-2']);
    assert.equal(createUsage({ directory: dir, allowProfiles: true, now: () => NOON }).snapshot().users, 3);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('keeps 30 days of daily history and places counters saved before history on their only day', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'users-history-'));
  try {
    // Saved by the earlier version: no per-day history.
    await writeFile(join(dir, 'usage.json'), JSON.stringify({ totals: { visits: 5, analyses: 2 }, users: {
      ['one-day-user-0001']: { visits: 3, analyses: 2, firstSeen: NOON - 2 * DAY, lastSeen: NOON - 2 * DAY + 3600_000 },
      ['many-day-user-001']: { visits: 2, firstSeen: NOON - 5 * DAY, lastSeen: NOON - DAY },
    } }));
    let clock = NOON;
    const usage = createUsage({ directory: dir, now: () => clock });
    usage.record('new-user-install-1', { app_visit: 1, original_download: 2 });
    usage.recordAnalysis(undefined);
    const { history, historyStart } = usage.snapshot();
    assert.equal(history.length, 30);
    assert.equal(history.at(-1).date, '2026-10-22');
    assert.deepEqual(history.at(-1), { date: '2026-10-22', refetches: 0, visits: 1, analyses: 1, downloads: 2, active: 1, newUsers: 1 });
    assert.deepEqual(history.at(-3), { date: '2026-10-20', refetches: 0, visits: 3, analyses: 2, downloads: 0, active: 1, newUsers: 1 });
    // The user seen over several days has no reconstructed history, only its first day.
    assert.deepEqual([history.at(-6).visits, history.at(-6).newUsers], [0, 1]);
    assert.equal(historyStart, '2026-10-20');
    await usage.flush();
    clock = NOON + 40 * DAY;
    const later = createUsage({ directory: dir, now: () => clock }).snapshot();
    assert.equal(later.history.every((day) => day.visits === 0), true);
    assert.equal(later.visits, 6);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('keeps request monitoring across restarts with seven days of hourly activity', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'monitoring-persist-'));
  try {
    let clock = NOON;
    const first = createMonitoring({ directory: dir, now: () => clock });
    first.record({ method: 'POST', path: '/v1/receipts/analyze', status: 200, durationMs: 100, requestId: 'a' });
    clock += 3 * 60 * 60 * 1000;
    first.record({ method: 'POST', path: '/v1/receipts/analyze', status: 503, durationMs: 300, requestId: 'b', failure: 'provider_unavailable' });
    first.record({ method: 'POST', path: '/v1/usage', status: 202, durationMs: 1, requestId: 'c' });
    await first.flush();
    clock += 60_000;
    const second = createMonitoring({ directory: dir, now: () => clock }).snapshot();
    assert.deepEqual([second.totalRequests, second.successfulRequests, second.averageDurationMs], [2, 1, 200]);
    assert.equal(second.persistent, true);
    assert.equal(second.countingSince, new Date(NOON).toISOString());
    assert.equal(second.hourly.length, 168);
    assert.deepEqual(second.hourly.slice(-4).map((b) => [b.requests, b.errors]), [[1, 0], [0, 0], [0, 0], [1, 1]]);
    assert.deepEqual(second.recent.map((r) => r.requestId), ['b', 'a']);
    await writeFile(join(dir, 'monitoring.json'), 'broken');
    assert.equal(createMonitoring({ directory: dir }).snapshot().totalRequests, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('serves QR usage and deletion only to callers with the internal token', async () => {
  const usage = createUsage({ allowProfiles: true });
  usage.record('qr-test-install-01', { app_visit: 1 }, { name: 'TEST QR', team: 'TEST Team' });
  const app = express();
  app.use(qrInternalRouter({ token: TOKEN, usage, monitoring: createMonitoring(), budget: createDailyBudget(10) }));
  const server = await listen(app);
  try {
    assert.equal((await fetch(`${server.url}/internal/usage`)).status, 404);
    assert.equal((await fetch(`${server.url}/internal/usage`, { headers: { Authorization: 'Bearer wrong' } })).status, 404);
    const client = qrClient({ url: server.url, token: TOKEN });
    assert.equal((await client.usage()).recentUsers[0].name, 'TEST QR');
    assert.deepEqual((await client.monitoring()).budget, { used: 0, limit: 10 });
    assert.deepEqual(await client.deleteUsers(['qr-test-']), { deleted: ['qr-test-'], notFound: [], ambiguous: [] });
    assert.equal(usage.snapshot().users, 0);
    assert.equal(qrClient({ url: server.url, token: '' }), null);
  } finally { await server.close(); }
  // Without a token nothing is mounted.
  const bare = express();
  bare.use(qrInternalRouter({ token: '', usage, monitoring: createMonitoring() }));
  const open = await listen(bare);
  try { assert.equal((await fetch(`${open.url}/internal/usage`)).status, 404); } finally { await open.close(); }
});

it('the dashboard lists app and QR users together, deletes from each, and shows QR monitoring', async () => {
  const qrUsage = createUsage({ allowProfiles: true });
  qrUsage.record('qr-test-install-01', { app_visit: 2 }, { name: 'TEST QR', team: 'TEST Team' });
  qrUsage.recordAnalysis('qr-test-install-01');
  const qrApp = express();
  qrApp.use(qrInternalRouter({ token: TOKEN, usage: qrUsage, monitoring: createMonitoring(), budget: createDailyBudget(10) }));
  const qrServer = await listen(qrApp);
  const config = loadConfig({ ADMIN_KEY: ADMIN, QR_INTERNAL_URL: qrServer.url, QR_INTERNAL_TOKEN: TOKEN, RATE_LIMIT_PER_MINUTE: '1000' });
  const appUsage = createUsage();
  appUsage.record('app-install-000001', { app_visit: 1 });
  const api = await listen(createApp({ config, provider: null, usage: appUsage, logger: createLogger({ level: 'silent' }) }));
  try {
    const headers = { 'Content-Type': 'application/json', 'X-Dashboard-Request': '1' };
    const login = await fetch(`${api.url}/admin/api/login`, { method: 'POST', headers, body: JSON.stringify({ key: ADMIN }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const get = async (path) => (await fetch(`${api.url}/admin/api${path}`, { headers: { Cookie: cookie } })).json();
    const users = await get('/users');
    assert.equal(users.qrStatus, 'live');
    assert.deepEqual([users.users, users.visits, users.analyses], [2, 3, 1]);
    assert.deepEqual(users.recentUsers.map((u) => u.source).sort(), ['app', 'qr']);
    assert.deepEqual([users.sources.app.users, users.sources.qr.users], [1, 1]);
    assert.equal(users.history.at(-1).visits, 3);
    assert.equal(users.history.at(-1).active, 2);
    const remove = (body) => fetch(`${api.url}/admin/api/users/delete`, { method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify(body) });
    assert.equal((await remove({ users: [{ user: 'qr-test-', source: 'elsewhere' }] })).status, 400);
    assert.equal((await fetch(`${api.url}/admin/api/users/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: '{}' })).status, 403);
    const result = await (await remove({ users: [{ user: 'qr-test-', source: 'qr' }, { user: 'app-inst', source: 'app' }] })).json();
    assert.deepEqual(result.deleted.sort(), ['app-inst', 'qr-test-']);
    const after = await get('/users');
    assert.deepEqual([after.users, after.visits, after.analyses, after.recentUsers.length], [0, 0, 0, 0]);
    const monitoring = await get('/monitoring');
    assert.equal(monitoring.qr.totalRequests, 0);
    assert.equal(monitoring.qr.budget.limit, 10);
  } finally { await api.close(); await qrServer.close(); }
  // Not linked: QR deletions are refused, app data still works.
  const lone = await listen(createApp({ config: loadConfig({ ADMIN_KEY: ADMIN }), provider: null, logger: createLogger({ level: 'silent' }) }));
  try {
    const headers = { 'Content-Type': 'application/json', 'X-Dashboard-Request': '1' };
    const cookie = (await fetch(`${lone.url}/admin/api/login`, { method: 'POST', headers, body: JSON.stringify({ key: ADMIN }) })).headers.get('set-cookie').split(';')[0];
    const response = await fetch(`${lone.url}/admin/api/users/delete`, { method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ users: [{ user: 'qr-test-', source: 'qr' }] }) });
    assert.equal(response.status, 503);
    assert.equal((await (await fetch(`${lone.url}/admin/api/monitoring`, { headers: { Cookie: cookie } })).json()).qr, null);
  } finally { await lone.close(); }
});

it('requires a long QR link token', () => {
  assert.throws(() => loadConfig({ QR_INTERNAL_TOKEN: 'short' }), /at least 32/);
  assert.throws(() => loadConfig({ QR_INTERNAL_URL: 'qr:3100' }), /QR_INTERNAL_URL/);
  assert.deepEqual(loadConfig({ QR_INTERNAL_URL: 'http://qr:3100', QR_INTERNAL_TOKEN: TOKEN }).qrLink, { url: 'http://qr:3100', token: TOKEN });
});
