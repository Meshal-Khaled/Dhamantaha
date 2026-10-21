import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney, formatDate, formatNumber, fieldLabel, localizeError } from '../src/format.js';
import { describeError } from '../src/api.js';

test('money formats real currency and zero without inventing a missing or invalid denomination', () => {
  assert.equal(formatMoney(0, null), '0');
  assert.equal(formatMoney(59, null), '59');
  assert.equal(formatMoney(59, 'not-currency'), '59');
  assert.equal(formatMoney(59, 'ZZZ'), '59');
  assert.equal(formatMoney(59, ' usd '), new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'USD' }).format(59));
  assert.match(formatMoney(59, 'SAR', true), /٥٩/);
  assert.equal(formatMoney(null, 'SAR'), '—');
  assert.equal(formatMoney(NaN, 'SAR'), '—');
});

test('Gregorian receipt dates keep their calendar day regardless of the current timezone', () => {
  const previousTimezone = process.env.TZ;
  try {
    for (const timezone of ['Pacific/Honolulu', 'Pacific/Kiritimati']) {
      process.env.TZ = timezone;
      assert.equal(formatDate('2026-09-09'), '9 Sept 2026');
      assert.match(formatDate('2026-09-09', true), /٢٠٢٦/);
      assert.doesNotMatch(formatDate('2026-09-09', true), /١٤٤/);
    }
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
  assert.equal(formatDate('2026-02-30'), '—');
  assert.equal(formatDate('bad date'), '—');
  assert.equal(formatDate(null), '—');
  assert.equal(formatDate(new Date('invalid')), '—');
  assert.notEqual(formatDate(0), '—');
});

test('number and review-field labels are localized without exposing internal field paths', () => {
  assert.equal(formatNumber(0, true), '٠');
  assert.equal(formatNumber(324), '324');
  assert.equal(formatNumber(Infinity), '—');
  assert.equal(fieldLabel('receipt.purchaseDate', true), 'تاريخ الشراء');
  assert.equal(fieldLabel('items[0].warranty.durationValue'), 'Product 1 · Warranty duration');
  assert.equal(fieldLabel('items[1].description', true), 'المنتج ٢ · اسم المنتج');
  assert.equal(fieldLabel('receipt.unknownInternalPath', true), 'بيانات الشراء');
});

test('known API, local validation and storage errors get actionable Arabic while unknown messages survive', () => {
  assert.match(localizeError({ code: 'network_error', message: 'Could not reach The Ring.' }, true), /تحقق من الإنترنت/);
  assert.match(describeError({ code: 'rate_limited', message: 'Slow down.', retryAfterSeconds: 30 }, true), /٣٠ ثانية/);
  assert.match(describeError({ code: 'rejected_locally', message: 'photo is larger than limit' }, true), /أكبر من الحجم/);
  assert.match(localizeError('Enter a valid price.', true), /سعرًا صحيحًا/);
  assert.match(localizeError(new Error('Could not access device storage. Free some space and try again.'), true), /حرّر بعض المساحة/);
  assert.equal(localizeError({ code: 'future_error', message: 'A safe future error.' }, true), 'A safe future error.');
  assert.equal(localizeError(new Error('English message.')), 'English message.');
});
