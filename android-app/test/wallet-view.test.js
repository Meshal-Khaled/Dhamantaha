import test from 'node:test';
import assert from 'node:assert/strict';
import { endDate, products, walletSummary, editAnalysis } from '../src/wallet-view.js';

test('policy dates clamp month ends and leap years, and reject invalid input', () => {
  assert.equal(endDate('2026-01-31', 1, 'months'), '2026-02-28');
  assert.equal(endDate('2024-02-29', 1, 'years'), '2025-02-28');
  assert.equal(endDate('2026-10-20', 2, 'weeks'), '2026-11-03');
  assert.equal(endDate('2026-02-30', 1, 'months'), null);
  assert.equal(endDate('2026-10-20', 0, 'days'), null);
  assert.equal(endDate('2026-10-20', -1, 'days'), null);
});

test('dashboard uses real deadlines, includes the final day, and excludes unknown and expired dates', () => {
  const records = [{ id: 'one', name: 'invoice.pdf', analysis: { receipt: { purchaseDate: '2026-10-10' }, items: [
    { description: 'Soon', warranty: { expirationDate: '2026-11-05' }, localPolicy: { returns: { amount: 10, unit: 'days' } } },
    { description: 'Expired', warranty: { expirationDate: '2026-10-19' } },
    { description: 'Unknown', warranty: {} },
    { description: 'Later', warranty: { expirationDate: '2027-10-20' } },
  ] } }];
  const result = walletSummary(records, new Date(2026, 9, 20));
  assert.equal(result.active, 2);
  assert.equal(result.upcoming.length, 1);
  assert.equal(result.upcoming[0].returnDays, 0);
  assert.equal(result.entries[2].warrantyDays, null);
});

test('manual edits preserve other products and receipt evidence, and never claim a user policy was printed', () => {
  const previous = { receipt: { total: 250, receiptNumber: 'invoice', currency: 'SAR' }, items: [
    { description: 'First', warranty: { statedOnReceipt: false } },
    { description: 'Second', totalPrice: 50 },
  ], review: { missingFields: [], uncertainties: [] } };
  const values = { description: 'Changed', merchant: 'Store', price: '200', date: '2026-10-20', warrantyAmount: '12', warrantyUnit: 'months', returnAmount: '14', returnUnit: 'days' };
  const body = editAnalysis(previous, values);
  assert.equal(previous.items[0].description, 'First');
  assert.deepEqual(body.items[1], previous.items[1]);
  assert.equal(body.receipt.total, 250);
  assert.equal(body.receipt.receiptNumber, 'invoice');
  assert.equal(body.items[0].warranty.statedOnReceipt, false);
  const view = products([{ analysis: body }], new Date(2026, 9, 20))[0];
  assert.equal(view.warrantyEnd, '2027-10-20');
  assert.equal(view.returnDays, 14);
  assert.throws(() => editAnalysis(previous, { ...values, price: '-1' }), /price/);
  assert.throws(() => editAnalysis(previous, { ...values, date: '' }), /date/);
});

test('an unanalysed receipt stays visible and unknown policies do not invent dates', () => {
  const record = { id: 'offline', name: 'receipt.jpg', analysis: null };
  assert.equal(products([record])[0].item.description, 'receipt.jpg');
  const body = editAnalysis(null, { description: 'Product', merchant: 'Shop', price: '0', date: '', warrantyAmount: '', warrantyUnit: 'months', returnAmount: '', returnUnit: 'days' });
  assert.equal(body.receipt.total, 0);
  assert.equal(products([{ analysis: body }])[0].warrantyEnd, undefined);
});

test('editing a purchase date recalculates duration-based warranties but keeps printed expiration dates', () => {
  const record = { analysis: { receipt: { purchaseDate: '2026-10-20' }, items: [
    { warranty: { expirationBasis: 'calculated', expirationDate: '2027-01-01', durationValue: 12, durationUnit: 'months' } },
    { warranty: { expirationBasis: 'printed', expirationDate: '2027-01-01' } },
  ] } };
  assert.equal(products([record])[0].warrantyEnd, '2027-10-20');
  assert.equal(products([record])[1].warrantyEnd, '2027-01-01');
});
