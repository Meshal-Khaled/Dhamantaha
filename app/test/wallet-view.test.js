import test from 'node:test';
import assert from 'node:assert/strict';
import { endDate, products, walletSummary, editAnalysis, warrantyProgress, warrantyTone, receiptCards, linePrice, itemName, cardSearchText } from '../src/wallet-view.js';

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
  assert.equal(result.upcoming[0].nextDeadline, 0);
  assert.equal(result.upcoming[0].returnEntry.returnDays, 0);
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

test('warranty progress shrinks with remaining days and clamps at the start and expiry', () => {
  const progress = (day) => warrantyProgress('2026-10-01', '2026-10-21', new Date(2026, 9, day));
  assert.equal(progress(1), 100);
  assert.equal(progress(11), 50);
  assert.equal(progress(16), 25);
  assert.equal(progress(21), 0);
  assert.equal(progress(25), 0);
  assert.equal(warrantyProgress('2026-10-01', '2026-10-21', new Date(2026, 8, 20)), 100);
  assert.equal(warrantyProgress(null, '2026-10-21'), null);
  assert.equal(warrantyProgress('2026-10-01', null), null);
  assert.equal(warrantyProgress('2026-02-30', '2026-10-21'), null);
  assert.equal(warrantyProgress('2026-10-21', '2026-10-21'), 0);
});

test('warranty colors reflect the remaining fraction and imminent deadlines', () => {
  assert.equal(warrantyTone(324, 89), 'healthy');
  assert.equal(warrantyTone(135, 37), 'warning');
  assert.equal(warrantyTone(53, 7.3), 'critical');
  assert.equal(warrantyTone(100, 50), 'warning');
  assert.equal(warrantyTone(100, 20), 'critical');
  assert.equal(warrantyTone(30, 90), 'warning');
  assert.equal(warrantyTone(7, 90), 'critical');
  assert.equal(warrantyTone(0, 0), 'critical');
  assert.equal(warrantyTone(-1, 0), 'ended');
  assert.equal(warrantyTone(null, null), 'unknown');
  assert.equal(warrantyTone(NaN, 50), 'unknown');
  assert.equal(warrantyTone(100, null), 'healthy');
});

test('a receipt with several items is one card that leads with the next warranty to end', () => {
  const records = [{ id: 'multi', name: 'receipt.pdf', analysis: { receipt: { merchantName: 'Jarir', purchaseDate: '2026-10-01', total: null, currency: 'SAR' }, items: [
    { displayName: 'Laptop', totalPrice: 3999, warranty: { expirationDate: '2028-10-01' } },
    { description: 'CABLE USB-C', quantity: 2, unitPrice: 25, warranty: { expirationDate: '2026-11-01' } },
    { description: 'Bag', totalPrice: 149.5, warranty: { expirationDate: '2026-10-10' } },
  ] } }, { id: 'offline', name: 'photo.jpg', analysis: null }];
  const [card, offline] = receiptCards(records, new Date(2026, 9, 20));
  assert.equal(receiptCards(records).length, 2);
  assert.equal(card.itemCount, 3);
  assert.deepEqual(card.names, ['Laptop', 'CABLE USB-C', 'Bag']);
  assert.equal(card.lead.item.description, 'CABLE USB-C');
  assert.equal(card.coveredCount, 2);
  assert.equal(card.total, 4198.5, 'a missing receipt total is the sum of the line totals');
  assert.equal(offline.analyzed, false);
  assert.equal(offline.itemCount, 0);
  const summary = walletSummary(records, new Date(2026, 9, 20));
  assert.equal(summary.upcoming.length, 1, 'one receipt, not one entry per item');
  assert.equal(summary.active, 2);
});

test('line prices derive the missing unit price or total and round to cents', () => {
  assert.deepEqual(linePrice({ quantity: 2, unitPrice: 50 }), { quantity: 2, unitPrice: 50, total: 100 });
  assert.deepEqual(linePrice({ quantity: 3, totalPrice: 100 }), { quantity: 3, unitPrice: 33.33, total: 100 });
  assert.deepEqual(linePrice({ totalPrice: 20 }), { quantity: null, unitPrice: 20, total: 20 });
  assert.deepEqual(linePrice({ quantity: 0, unitPrice: null, totalPrice: null }), { quantity: null, unitPrice: null, total: null });
});

test('items show the short display name and repair Arabic presentation forms in older analyses', () => {
  assert.equal(itemName({ description: 'MAGSAFE PHONE GRIP/STAND BL#WP@7', displayName: 'MagSafe Phone Grip/Stand' }), 'MagSafe Phone Grip/Stand');
  assert.equal(itemName({ description: 'ﻣﻠﺤﻘﺎﺕ ﺍﻟﻬﻮﺍﺗﻒ' }), 'ملحقات الهواتف');
  assert.equal(itemName({ description: '  ' }), null);
  const [card] = receiptCards([{ id: 'r', name: 'r.pdf', analysis: { receipt: { merchantName: 'eXtra', branchName: 'فرع العليا' }, items: [{ description: 'ﻣﻠﺤﻘﺎﺕ', category: 'Accessories' }] } }]);
  for (const query of ['extra', 'العليا', 'ملحقات', 'accessories', 'r.pdf']) assert.ok(cardSearchText(card).includes(query), query);
});

test('a printed return policy sets return deadlines unless the owner entered one for that item', () => {
  const analysis = { receipt: { purchaseDate: '2026-10-18', returnPolicy: { sourceText: 'Refund within 3 days, exchange within 7 days.', returnDurationValue: 3, returnDurationUnit: 'days', exchangeDurationValue: 7, exchangeDurationUnit: 'days' } }, items: [
    { description: 'Printed policy' },
    { description: 'Owner policy', localPolicy: { returns: { amount: 14, unit: 'days' } } },
  ] };
  const [printed, owner] = products([{ id: 'p', analysis }], new Date(2026, 9, 20));
  assert.equal(printed.returnEnd, '2026-10-21');
  assert.equal(printed.returnSource, 'receipt');
  assert.equal(owner.returnEnd, '2026-11-01');
  assert.equal(owner.returnSource, 'local');
  const [card] = receiptCards([{ id: 'p', analysis }], new Date(2026, 9, 20));
  assert.equal(card.returnEntry.returnDays, 1);
});

test('editing a name keeps the printed line, and editing a total re-derives the unit price', () => {
  const previous = { receipt: { currency: 'SAR' }, items: [{ description: 'CABLE USB-C 1M', displayName: 'USB-C Cable', quantity: 2, unitPrice: 25, totalPrice: 50 }], review: { missingFields: [], uncertainties: [] } };
  const values = { description: 'Charging cable', merchant: '', price: '50', date: '', warrantyAmount: '', warrantyUnit: 'months', returnAmount: '', returnUnit: 'days' };
  const renamed = editAnalysis(previous, values);
  assert.equal(renamed.items[0].displayName, 'Charging cable');
  assert.equal(renamed.items[0].description, 'CABLE USB-C 1M');
  assert.equal(renamed.items[0].unitPrice, 25);
  const repriced = editAnalysis(previous, { ...values, price: '60' });
  assert.deepEqual(linePrice(repriced.items[0]), { quantity: 2, unitPrice: 30, total: 60 });
});

test('receipt filters handle mixed coverage, last-day returns, and unknown policies; code search and sorting stay receipt-based', async () => {
  const { filterReceiptCards, sortReceiptCards, cardSearchText } = await import('../src/wallet-view.js');
  const cards = receiptCards([
    { id: 'mixed', name: 'shop.pdf', createdAt: 100, analysis: { receipt: { merchantName: 'Shop', purchaseDate: '2026-10-01', returnPolicy: { returnDurationValue: 20, returnDurationUnit: 'days' } }, items: [{ productIdentifier: 'SKU-123', warranty: { expirationDate: '2026-12-01' } }, { warranty: { expirationDate: '2026-10-01' } }] } },
    { id: 'unread', name: 'new.pdf', createdAt: 99 },
    { id: 'unknown', name: 'unknown.pdf', createdAt: 101, analysis: { items: [{}] } },
  ], new Date('2026-10-21T12:00:00'));
  assert.deepEqual(filterReceiptCards(cards, 'active').map(c => c.record.id), ['mixed']);
  assert.deepEqual(filterReceiptCards(cards, 'expired').map(c => c.record.id), ['mixed']);
  assert.deepEqual(filterReceiptCards(cards, 'soon').map(c => c.record.id), ['mixed']);
  assert.deepEqual(filterReceiptCards(cards, 'unread').map(c => c.record.id), ['unread']);
  assert.ok(cardSearchText(cards[0]).includes('sku-123'));
  assert.deepEqual(sortReceiptCards(cards, 'newest').map(c => c.record.id), ['unknown', 'mixed', 'unread']);
  assert.equal(sortReceiptCards(cards, 'deadline')[0].record.id, 'mixed');
  assert.equal(cards[0].record.id, 'mixed');
});
