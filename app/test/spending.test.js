import test from 'node:test';
import assert from 'node:assert/strict';
import { spendingSummary } from '../src/spending.js';
const today = new Date(2026, 9, 22, 12);
const record = (date, total = 10, currency = 'SAR') => ({ analysis: { receipt: { purchaseDate: date, total, currency }, items: [{ totalPrice: 999 }] } });
test('rolling spending uses purchase dates, inclusive boundaries, and separate currencies once per receipt', () => {
  const { periods, excluded } = spendingSummary([
    record('2026-10-22', 100), record('2026-10-16', 20), record('2026-10-15', 30),
    record('2026-09-23', 40), record('2026-09-22', 50), record('2025-10-23', 60), record('2025-10-22', 70),
    record('2026-10-22', 5, 'USD'), record('2026-10-22', 0),
  ], today);
  assert.equal(excluded, 0);
  assert.deepEqual(periods.map(p => p.count), [4, 6, 8]);
  assert.deepEqual(periods.map(p => p.currencies), [
    [{ currency: 'SAR', total: 120 }, { currency: 'USD', total: 5 }],
    [{ currency: 'SAR', total: 190 }, { currency: 'USD', total: 5 }],
    [{ currency: 'SAR', total: 300 }, { currency: 'USD', total: 5 }],
  ]);
});
test('unknown, unanalyzed, invalid and future records are excluded without using save dates or guessing currency', () => {
  const records = [{ createdAt: today.getTime() }, record(null), record('2026-02-30'), record('2026-10-23'), record('2026-10-22', null), record('2026-10-22', -2), record('2026-10-22', Infinity), record('2026-10-22', 1, ''), record('2026-10-22', 1, 'BAD')];
  const summary = spendingSummary(records, today);
  assert.equal(summary.excluded, records.length);
  assert.ok(summary.periods.every(p => !p.count && !p.currencies.length));
});
test('editing, deletion, empty wallets and fractional amounts recompute without mutating records', () => {
  const records = [record('2026-10-22', 0.1), record('2026-10-22', 0.2)];
  const before = structuredClone(records);
  assert.equal(spendingSummary(records, today).periods[0].currencies[0].total, 0.3);
  assert.deepEqual(records, before);
  records[0].analysis.receipt.total = 5;
  assert.equal(spendingSummary(records, today).periods[0].currencies[0].total, 5.2);
  assert.equal(spendingSummary(records.slice(1), today).periods[0].currencies[0].total, 0.2);
  assert.ok(spendingSummary([], today).periods.every(p => !p.count));
});
