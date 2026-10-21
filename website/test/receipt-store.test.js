import test from 'node:test';
import assert from 'node:assert/strict';
import { createReceiptWallet, MAX_LOCAL_BYTES, receiptMime } from '../src/lib/receipt-store.js';

test('stores an original without making an analysis request, including unknown PDF MIME types', async () => {
  const calls = [];
  const wallet = createReceiptWallet({ save: async (...args) => { calls.push(args); return { id: 'saved' }; } });
  const file = new File(['original PDF bytes'], 'bill.pdf', { type: 'application/octet-stream' });
  assert.equal((await wallet.save(file)).id, 'saved');
  assert.deepEqual(calls, [[file, 'bill.pdf', 'application/pdf']]);
});

test('rejects empty, oversized and unsupported files before writing to storage', async () => {
  const wallet = createReceiptWallet({ save: () => assert.fail('must not write') });
  await assert.rejects(wallet.save(new File([], 'empty.pdf', { type: 'application/pdf' })), /nonempty/);
  await assert.rejects(wallet.save({ name: 'large.png', type: 'image/png', size: MAX_LOCAL_BYTES + 1 }), /20 MB/);
  await assert.rejects(wallet.save(new File(['script'], 'receipt.html', { type: 'text/html' })), /photo or PDF/);
  assert.equal(receiptMime(new File(['x'], 'receipt.JPG')), 'image/jpeg');
  assert.equal(receiptMime(new File(['x'], 'receipt.pdf', { type: 'text/html' })), '');
});

test('analysis reads the saved original and updates that receipt instead of creating a duplicate', async () => {
  const file = new File(['photo'], 'receipt.jpg', { type: 'image/jpeg' });
  const original = { id: 'one', name: 'receipt.jpg', analysis: null };
  const body = { receipt: { merchantName: 'Shop' }, items: [] };
  const updates = [];
  const wallet = createReceiptWallet({
    get: async (id) => { assert.equal(id, 'one'); return { record: original, file }; },
    updateAnalysis: async (id, analysis) => { updates.push([id, analysis]); return { ...original, analysis }; },
  });
  const result = await wallet.analyze('one', { baseUrl: 'https://example.test', clientKey: 'private' }, async (input) => {
    assert.equal(input.file, file);
    assert.equal(input.filename, 'receipt.jpg');
    assert.equal(input.clientKey, 'private');
    return { body };
  });
  assert.deepEqual(updates, [['one', body]]);
  assert.deepEqual(result.record.analysis, body);
  assert.equal('clientKey' in result.record, false);
});

test('a failed analysis leaves the original and previous analysis untouched', async () => {
  const previous = { receipt: { merchantName: 'Previous result' }, items: [] };
  const wallet = createReceiptWallet({
    get: async () => ({ record: { name: 'receipt.pdf', analysis: previous }, file: new Blob(['pdf']) }),
    updateAnalysis: () => assert.fail('must not overwrite'),
    delete: () => assert.fail('must not delete'),
  });
  await assert.rejects(wallet.analyze('one', {}, async () => { throw new Error('offline'); }), /offline/);
  assert.equal(previous.receipt.merchantName, 'Previous result');
});

test('a full disk preserves the successful response for a save retry', async () => {
  const result = { body: { receipt: {}, items: [] } };
  const wallet = createReceiptWallet({
    get: async () => ({ record: { name: 'receipt.pdf' }, file: new Blob(['pdf']) }),
    updateAnalysis: async () => { throw new Error('disk full'); },
  });
  await assert.rejects(wallet.analyze('one', {}, async () => result), (error) => error.result === result && /could not be saved/.test(error.message));
});

test('whole-wallet metadata includes receipts beyond the first page without opening originals', async () => {
  const rows = Array.from({ length: 121 }, (_, id) => ({ id: String(id), name: `receipt-${id}` }));
  const offsets = [];
  const wallet = createReceiptWallet({
    list: async (offset, limit) => { offsets.push(offset); return rows.slice(offset, offset + limit); },
    get: () => assert.fail('search must not read original bytes'),
  });
  const result = await wallet.listAll();
  assert.equal(result.length, 121);
  assert.equal(result.at(-1).name, 'receipt-120');
  assert.deepEqual(offsets, [0, 50, 100]);
});

test('re-analysis keeps item attachments aligned and refuses ambiguous matches without overwriting', async () => {
  const previous = { items: [{ description: 'Laptop' }, { description: 'Bag' }] };
  let saved;
  const wallet = createReceiptWallet({ get: async () => ({ record: { name: 'bill.pdf', analysis: previous, assets: [{ index: 0, kind: 'photo' }] }, file: new Blob(['pdf']) }), updateAnalysis: async (id, body) => { saved = body; return { analysis: body }; } });
  await wallet.analyze('one', {}, async () => ({ body: { items: [{ description: 'Bag' }, { description: 'Laptop' }] } }));
  assert.deepEqual(saved.items.map(item => item.description), ['Laptop', 'Bag']);
  saved = null;
  await assert.rejects(wallet.analyze('one', {}, async () => ({ body: { items: [{ description: 'New laptop' }, { description: 'Bag' }] } })), /could not match/);
  assert.equal(saved, null);
});

test('item attachments validate size and type and never become new receipts', async () => {
  const calls = [];
  const wallet = createReceiptWallet({ saveAsset: (...args) => calls.push(args), save: () => assert.fail('not a receipt') });
  const photo = new File(['photo'], 'laptop.jpg', { type: 'image/jpeg' });
  await wallet.saveAsset('one', 0, 'photo', photo);
  assert.deepEqual(calls[0], ['one', 0, 'photo', photo, 'image/jpeg']);
  await assert.rejects(wallet.saveAsset('one', 0, 'photo', new File(['pdf'], 'terms.pdf', { type: 'application/pdf' })), /photo or a PDF/);
  await assert.rejects(wallet.saveAsset('one', 0, 'terms', new File([], 'terms.pdf', { type: 'application/pdf' })), /nonempty/);
});
