import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countdownLabel, daysUntil } from '../src/lib/countdown.js';

const on = (y, m, d) => new Date(y, m - 1, d, 23, 59); // late in the day: only the date counts

test('counts whole days to the expiration date', () => {
  assert.equal(daysUntil('2026-10-30', on(2026, 9, 19)), 41);
  assert.equal(daysUntil('2027-09-09', on(2026, 10, 20)), 324);
  assert.equal(daysUntil('2026-10-20', on(2026, 10, 20)), 0);
  assert.equal(daysUntil('2026-10-08', on(2026, 10, 20)), -12);
});

test('counts across month, year and leap-day boundaries', () => {
  assert.equal(daysUntil('2028-03-01', on(2028, 2, 27)), 3);
  assert.equal(daysUntil('2027-01-01', on(2026, 12, 31)), 1);
  assert.equal(daysUntil('2026-11-01', on(2026, 3, 29)), 217); // across the spring clock change
});

test('words the countdown for the phone', () => {
  const today = on(2026, 10, 20);
  assert.equal(countdownLabel('2026-12-01', today), '42 days left');
  assert.equal(countdownLabel('2026-10-21', today), '1 day left');
  assert.equal(countdownLabel('2026-10-20', today), 'Last day');
  assert.equal(countdownLabel('2026-10-19', today), 'Ended yesterday');
  assert.equal(countdownLabel('2026-10-01', today), 'Ended 19 days ago');
});

test('returns null for missing or unreadable dates', () => {
  assert.equal(countdownLabel(null), null);
  assert.equal(countdownLabel('soon'), null);
  assert.equal(daysUntil(undefined), null);
});
