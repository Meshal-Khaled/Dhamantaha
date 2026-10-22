import test from 'node:test';
import assert from 'node:assert/strict';
import { merchantGroup, searchKey, spendingAnalytics } from '../src/spending-analytics.js';
const today = new Date(2026, 9, 22, 12);
const record = (id, date, total, merchantName = 'Jarir Bookstore', currency = 'SAR', branchName = 'Riyadh') => ({ id, name: 'receipt.png', analysis: { receipt: { purchaseDate: date, total, merchantName, currency, branchName }, items: [{ displayName: 'Wireless battery', category: 'Electronics', productIdentifier: 'SKU-123' }] } });

test('daily, weekly, monthly, yearly have inclusive boundaries and exact chart/store reconciliation', () => {
  const records = [record('today', '2026-10-22', 100), record('seven', '2026-10-16', 20), record('eight', '2026-10-15', 30), record('thirty', '2026-09-23', 40), record('old', '2025-10-22', 70), record('usd', '2026-10-22', 5, 'Shop', 'USD')];
  const before = structuredClone(records);
  for (const [days, total, count] of [[1, 100, 1], [7, 120, 2], [30, 190, 4], [365, 190, 4]]) {
    const data = spendingAnalytics(records, { days, currency: 'SAR', today });
    assert.equal(data.total, total); assert.equal(data.rows.length, count);
    assert.equal(data.buckets.reduce((sum, row) => sum + row.total, 0), total);
    assert.equal(data.groups.reduce((sum, row) => sum + row.total, 0), total);
    assert.deepEqual(data.currencies, ['SAR', 'USD']);
  }
  assert.deepEqual(records, before);
});

test('known bilingual Jarir variants merge while unrelated similar names remain distinct; user aliases override', () => {
  const names = ['Jarir Bookstore', 'JARIR MARKETING COMPANY', 'مكتبة جرير', 'شركة جرير للتسويق'];
  assert.ok(names.every(name => merchantGroup(name).key === 'jarir'));
  assert.notEqual(merchantGroup('Jarir Electronics Repairs').key, 'jarir');
  assert.equal(merchantGroup('Cafe North', { [searchKey('Cafe North')]: 'My cafe' }).key, merchantGroup('North Coffee', { [searchKey('North Coffee')]: 'My cafe' }).key);
  const data = spendingAnalytics(names.map((name, index) => record(String(index), '2026-10-22', 10, name, 'SAR', `Branch ${index}`)), { today });
  assert.equal(data.groups.length, 1); assert.equal(data.groups[0].total, 40);
  assert.equal(data.groups[0].variants.length, 4); assert.equal(data.groups[0].branches.length, 4);
});

test('search finds original merchant, grouped merchant, branches, categories and product codes', () => {
  const records = [record('a', '2026-10-22', 25, 'Jarir Marketing Company', 'SAR', 'Hayat Riyadh')];
  for (const query of ['Jarir', 'marketing', 'Hayat', 'Electronics', 'SKU-123', 'wireless battery']) assert.equal(spendingAnalytics(records, { query, today }).total, 25);
  assert.equal(spendingAnalytics(records, { query: 'unmatched', today }).rows.length, 0);
  assert.equal(spendingAnalytics(records, { store: 'another store', today }).rows.length, 0);
  assert.ok(spendingAnalytics(records, { today }).keywords.some(([word]) => word === 'electronics'));
});

test('exclusions explain invalid values and future dates without hiding valid older receipts', () => {
  const records = [{ id: 'raw' }, record('date', '2026-02-30', 1), record('future', '2026-10-23', 1), record('amount', '2026-10-22', null), record('currency', '2026-10-22', 1, 'Shop', 'BAD'), record('old', '2020-01-01', 1)];
  const data = spendingAnalytics(records, { today });
  assert.deepEqual(data.excluded, { unanalyzed: 1, date: 1, future: 1, amount: 1, currency: 1 });
  assert.equal(data.allValidCount, 1); assert.equal(data.inPeriodCount, 0);
  assert.equal(data.average, null); assert.equal(data.currency, '');
});

test('fractional totals, zero purchases, unknown stores, and leap-year monthly buckets remain valid', () => {
  const data = spendingAnalytics([record('a', '2026-10-22', .1, ''), record('b', '2026-10-22', .2, ''), record('zero', '2026-10-22', 0, '')], { today, days: 1 });
  assert.equal(data.total, .3); assert.equal(data.average, .1); assert.equal(data.groups[0].key, '__unknown');
  const leap = spendingAnalytics([record('leap', '2024-02-29', 8)], { today: new Date(2024, 2, 1, 12), days: 365 });
  assert.equal(leap.buckets.find(row => row.key === '2024-02').total, 8);
  assert.equal(leap.buckets.reduce((sum, row) => sum + row.count, 0), 1);
});
