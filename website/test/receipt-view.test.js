import test from 'node:test';
import assert from 'node:assert/strict';
import { FILTERS, formatBytes, itemCountText, matchesFilter, receiptStatus, receiptTitle, sortCards } from '../src/lib/receipt-view.js';
import { receiptCards } from '../src/lib/wallet-view.js';

const today = new Date(2026, 9, 21); // 21 October 2026

const record = (id, createdAt, analysis, name = `${id}.pdf`) => ({ id, name, mime: 'application/pdf', size: 1000, createdAt, analysis });
const analysis = (merchantName, purchaseDate, total, expirationDate, product = 'Kettle') => ({
  receipt: { merchantName, purchaseDate, currency: 'SAR', total, returnPolicy: { sourceText: null } },
  items: [{ description: product, quantity: 1, totalPrice: total, warranty: { statedOnReceipt: Boolean(expirationDate), expirationDate, expirationBasis: 'printed' } }],
});

const cards = receiptCards([
  record('far', Date.UTC(2026, 0, 11), analysis('Far Store', '2026-01-10', 900, '2028-01-10')),
  record('soon', Date.UTC(2026, 5, 2), analysis('Soon Store', '2026-06-01', 300, '2026-11-05')),
  record('gone', Date.UTC(2025, 0, 2), analysis('Gone Store', '2025-01-01', 100, '2026-01-01')),
  record('plain', Date.UTC(2026, 8, 2), analysis('Plain Store', '2026-09-01', 50, null)),
  record('raw', Date.UTC(2026, 9, 20), null, 'scan.jpg'),
], today);
const byId = Object.fromEntries(cards.map((card) => [card.record.id, card]));
const idsOf = (list) => list.map((card) => card.record.id);

test('each receipt reports one status', () => {
  assert.equal(receiptStatus(byId.far), 'active');
  assert.equal(receiptStatus(byId.soon), 'soon');
  assert.equal(receiptStatus(byId.gone), 'expired');
  assert.equal(receiptStatus(byId.plain), 'review');
  assert.equal(receiptStatus(byId.raw), 'unread');
});

test('filters pick the receipts they describe', () => {
  const pick = (filter) => idsOf(cards.filter((card) => matchesFilter(card, filter))).sort();
  assert.deepEqual(FILTERS, ['all', 'active', 'soon', 'expired', 'unread']);
  assert.deepEqual(pick('all'), ['far', 'gone', 'plain', 'raw', 'soon']);
  assert.deepEqual(pick('active'), ['far', 'soon']);
  assert.deepEqual(pick('soon'), ['soon']);
  assert.deepEqual(pick('expired'), ['gone']);
  assert.deepEqual(pick('unread'), ['raw']);
});

test('sorting orders by purchase date, deadline and price, with unknown values last', () => {
  // An unread receipt has no purchase date, so the day it was saved counts.
  assert.deepEqual(idsOf(sortCards(cards, 'newest')), ['raw', 'plain', 'soon', 'far', 'gone']);
  assert.deepEqual(idsOf(sortCards(cards, 'oldest')), ['gone', 'far', 'soon', 'plain', 'raw']);
  // Only upcoming deadlines count; receipts with none keep their order at the end.
  assert.deepEqual(idsOf(sortCards(cards, 'ending')), ['soon', 'far', 'gone', 'plain', 'raw']);
  assert.deepEqual(idsOf(sortCards(cards, 'price')), ['far', 'soon', 'gone', 'plain', 'raw']);
  assert.deepEqual(idsOf(cards), ['far', 'soon', 'gone', 'plain', 'raw'], 'sorting leaves the original list alone');
});

test('titles fall back from the store to the only product to the file name', () => {
  assert.equal(receiptTitle(byId.far), 'Far Store');
  assert.equal(receiptTitle(byId.raw), 'scan.jpg');
  const unnamed = receiptCards([record('x', 1, analysis(null, '2026-01-01', 10, null, 'Kettle'))], today)[0];
  assert.equal(receiptTitle(unnamed), 'Kettle');
});

test('item counts and file sizes read naturally in both languages', () => {
  assert.equal(itemCountText(1, false), '1 item');
  assert.equal(itemCountText(3, false), '3 items');
  assert.equal(itemCountText(1, true), 'منتج واحد');
  assert.equal(itemCountText(2, true), 'منتجان');
  assert.match(itemCountText(5, true), /منتجات/);
  assert.equal(formatBytes(512), '1 KB');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(1572864), '1.5 MB');
  assert.equal(formatBytes(undefined), '—');
  assert.match(formatBytes(1572864, true), /ميغابايت/);
});
