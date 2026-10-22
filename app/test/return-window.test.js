import test from 'node:test';
import assert from 'node:assert/strict';
import { returnWindowText } from '../src/policy-labels.js';
import { receiptCards } from '../src/wallet-view.js';

test('return countdown uses actual policy days and distinguishes unknown, last day and expired', () => {
  const record = { analysis: { receipt: { purchaseDate: '2026-10-22', returnPolicy: { returnDurationValue: 3, returnDurationUnit: 'days' } }, items: [{}] } };
  const [card] = receiptCards([record], new Date('2026-10-22T12:00:00'));
  assert.equal(card.returnEntry.returnDays, 3);
  assert.equal(returnWindowText(card.returnEntry.returnDays, true), '٣ أيام للاسترجاع');
  assert.equal(returnWindowText(1, true), 'يوم واحد للاسترجاع');
  assert.equal(returnWindowText(2, true), 'يومان للاسترجاع');
  assert.equal(returnWindowText(0, true), 'اليوم الأخير للاسترجاع');
  assert.equal(returnWindowText(-1, true), 'انتهت مدة الاسترجاع');
  assert.equal(returnWindowText(null, true), 'مدة الاسترجاع غير معروفة');
  assert.equal(returnWindowText(undefined), 'Return period unknown');
  assert.equal(returnWindowText(3), '3 days to return');
});
