import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deviceId, pendingUsage, reportUsage, trackVisits } from '../src/usage.js';

const memory = () => { const map = new Map(); return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) }; };
const settings = { baseUrl: 'https://ring.test/v1/', clientKey: 'k-123' };

test('the device ID is random, made once, and reused', () => {
  const storage = memory();
  const id = deviceId(storage);
  assert.match(id, /^[A-Za-z0-9-]{16,64}$/);
  assert.equal(deviceId(storage), id);
  assert.notEqual(deviceId(memory()), id);
});

test('reportUsage sends only counts and the install ID, with the client key', async () => {
  const storage = memory();
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return new Response('{"ok":true}', { status: 202 }); };
  assert.equal(await reportUsage('receipt_refetch', settings, { storage, fetchImpl }), true);
  assert.equal(seen.url, 'https://ring.test/v1/usage');
  assert.equal(seen.init.headers['X-Client-Key'], 'k-123');
  assert.deepEqual(JSON.parse(seen.init.body), { deviceId: deviceId(storage), events: { receipt_refetch: 1 } });
  assert.deepEqual(pendingUsage(storage), { receipt_refetch: 0, original_download: 0, app_visit: 0 });
});

test('counts made offline are kept and delivered together later', async () => {
  const storage = memory();
  const offline = async () => { throw new TypeError('network'); };
  assert.equal(await reportUsage('original_download', settings, { storage, fetchImpl: offline }), false);
  assert.equal(await reportUsage('receipt_refetch', settings, { storage, fetchImpl: offline }), false);
  assert.equal(await reportUsage('receipt_refetch', settings, { storage, fetchImpl: async () => new Response('', { status: 503 }) }), false);
  assert.deepEqual(pendingUsage(storage), { receipt_refetch: 2, original_download: 1, app_visit: 0 });
  let body;
  const online = async (url, init) => { body = JSON.parse(init.body); return new Response('{"ok":true}', { status: 202 }); };
  assert.equal(await reportUsage('receipt_refetch', settings, { storage, fetchImpl: online }), true);
  assert.deepEqual(body.events, { receipt_refetch: 3, original_download: 1 });
  assert.deepEqual(pendingUsage(storage), { receipt_refetch: 0, original_download: 0, app_visit: 0 });
});

test('unknown events are ignored and failures never throw', async () => {
  const storage = memory();
  assert.equal(await reportUsage('receipt_name', settings, { storage, fetchImpl: async () => { throw new Error('should not send'); } }), false);
  assert.equal(await reportUsage('receipt_refetch', settings, { storage: null, fetchImpl: async () => new Response('', { status: 202 }) }), false);
});

test('overlapping reports send each count once while preserving events added during a request', async () => {
  const storage = memory();
  const sent = [];
  let release;
  const fetchImpl = async (_url, init) => {
    sent.push(JSON.parse(init.body).events);
    if (sent.length === 1) await new Promise((resolve) => { release = resolve; });
    return new Response('{"ok":true}', { status: 202 });
  };
  const first = reportUsage('app_visit', settings, { storage, fetchImpl });
  await new Promise(setImmediate);
  const second = reportUsage('receipt_refetch', settings, { storage, fetchImpl });
  release();
  await Promise.all([first, second]);
  assert.deepEqual(sent, [{ app_visit: 1 }, { receipt_refetch: 1 }]);
});

test('visits ignore duplicate mounts and short camera returns, and count a return after 30 minutes', () => {
  const storage = memory();
  const documentRef = new EventTarget();
  documentRef.hidden = false;
  let time = 1000;
  let visits = 0;
  const attach = () => trackVisits(() => visits++, { storage, documentRef, now: () => time });
  let stop = attach();
  stop(); stop = attach(); // React StrictMode effect replay.
  assert.equal(visits, 1);
  documentRef.hidden = true; documentRef.dispatchEvent(new Event('visibilitychange'));
  time += 10000;
  documentRef.hidden = false; documentRef.dispatchEvent(new Event('visibilitychange'));
  assert.equal(visits, 1);
  documentRef.hidden = true; documentRef.dispatchEvent(new Event('visibilitychange'));
  time += 30 * 60000;
  documentRef.hidden = false; documentRef.dispatchEvent(new Event('visibilitychange'));
  assert.equal(visits, 2);
  stop();
});
