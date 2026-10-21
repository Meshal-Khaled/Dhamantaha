import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_ORDER, REQUESTS_LIVE, TEAM_LIMITS, addFiles, sendRequest, validateRequest } from '../src/lib/team-request.js';

const file = (name, size = 1000, type = '', modified = 1) => {
  const result = new File([new Uint8Array(size)], name, { type, lastModified: modified });
  return result;
};
const good = { team: 'Team Falcon', name: 'Sara Ali', contact: '', note: '', consent: true };
const one = [file('receipt.jpg', 1000, 'image/jpeg')];

test('a complete request has no problems', () => {
  assert.deepEqual(validateRequest(good, one), {});
  assert.deepEqual(validateRequest({ ...good, contact: 'sara@example.com', note: 'Electronics receipts' }, one), {});
  assert.deepEqual(validateRequest({ ...good, contact: '+966 55 123 4567' }, one), {});
});

test('each missing or wrong field is reported by its own code', () => {
  assert.deepEqual(validateRequest({ team: ' ', name: '', contact: 'x', note: 'a'.repeat(501), consent: false }, []), {
    team: 'required', name: 'required', contact: 'invalid', note: 'long', files: 'none', consent: 'required',
  });
  assert.equal(validateRequest({ ...good, team: 'a'.repeat(61) }, one).team, 'long');
  assert.equal(validateRequest({ ...good, contact: '12345' }, one).contact, 'invalid', 'too short to be a phone number');
  assert.equal(validateRequest({ ...good, contact: 'sara@' }, one).contact, 'invalid');
  assert.deepEqual(FIELD_ORDER, ['team', 'name', 'contact', 'files', 'note', 'consent']);
});

test('photos and PDFs are added, anything else is turned away with a reason', () => {
  const { files, rejected } = addFiles([], [
    file('a.jpg', 100, 'image/jpeg'), file('b.PDF', 100), file('c.heic', 100), file('d.png', 100, 'image/png'),
    file('notes.txt', 100, 'text/plain'), file('anim.gif', 100, 'image/gif'), file('empty.jpg', 0, 'image/jpeg'),
    file('huge.jpg', TEAM_LIMITS.bytes + 1, 'image/jpeg'),
  ]);
  assert.deepEqual(files.map((entry) => entry.name), ['a.jpg', 'b.PDF', 'c.heic', 'd.png']);
  assert.deepEqual(rejected, [
    { name: 'notes.txt', reason: 'type' }, { name: 'anim.gif', reason: 'type' },
    { name: 'empty.jpg', reason: 'empty' }, { name: 'huge.jpg', reason: 'size' },
  ]);
});

test('the same file chosen twice is added once, and the limit on files is enforced', () => {
  const first = addFiles([], [file('a.jpg', 100, 'image/jpeg', 5)]).files;
  assert.equal(addFiles(first, [file('a.jpg', 100, 'image/jpeg', 5)]).files.length, 1);
  assert.equal(addFiles(first, [file('a.jpg', 100, 'image/jpeg', 6)]).files.length, 2, 'a different file with the same name counts');
  const many = Array.from({ length: 12 }, (_, i) => file(`r${i}.jpg`, 100, 'image/jpeg', i));
  const { files, rejected } = addFiles([], many);
  assert.equal(files.length, TEAM_LIMITS.files);
  assert.deepEqual(rejected.map((entry) => entry.reason), ['count', 'count']);
});

test('live QR uploads use only the QR endpoint and preserve per-file results', async () => {
  assert.equal(REQUESTS_LIVE, true);
  const calls = [];
  const wallet = { save: async file => ({ id: file.name }), saveAnalysis: async (id, body) => calls.push(['saved', id, body.merchant]) };
  const fetchImpl = async (url, init) => { calls.push([url, init.headers]); return { ok: true, json: async () => ({ merchant: 'Demo Store', items: [] }) }; };
  const result = await sendRequest(good, one, { fetchImpl, wallet, deviceId: 'qr-test-install-1234' });
  assert.equal(result.results[0].analysis.merchant, 'Demo Store');
  assert.equal(calls[0][0], '/v1/qr/usage');
  assert.deepEqual(calls[1], ['/v1/qr/receipts/analyze', { 'X-Install-Id': 'qr-test-install-1234' }]);
  assert.deepEqual(calls[2], ['saved', 'receipt.jpg', 'Demo Store']);
});

test('QR failures preserve saved originals and are reported per receipt', async () => {
  const wallet = { save: async () => ({ id: 'saved' }), saveAnalysis: () => assert.fail('failed analysis must not replace saved data') };
  const fetchImpl = async url => url.endsWith('/usage') ? { ok: true } : ({ ok: false, json: async () => ({ error: { message: 'Overloaded' } }) });
  const result = await sendRequest(good, one, { fetchImpl, wallet, deviceId: 'qr-test-install-1234' });
  assert.equal(result.results[0].id, 'saved');
  assert.equal(result.results[0].error, 'Overloaded');
});

test('QR clients wait for a busy backend without duplicating local originals', async () => {
  let saves = 0; let attempts = 0; let waits = 0;
  const wallet = { save: async () => { saves++; return { id: 'same-original' }; }, saveAnalysis: async () => {} };
  const fetchImpl = async url => url.endsWith('/usage') ? { ok: true } : ++attempts < 3
    ? { ok: false, json: async () => ({ error: { code: 'server_busy' } }) }
    : { ok: true, json: async () => ({ receipt: { merchantName: 'Demo' }, items: [] }) };
  const result = await sendRequest(good, one, { wallet, fetchImpl, deviceId: 'qr-test-install-1234', waitImpl: async () => { waits++; } });
  assert.equal(saves, 1); assert.equal(attempts, 3); assert.equal(waits, 2);
  assert.equal(result.results[0].analysis.receipt.merchantName, 'Demo');
});
