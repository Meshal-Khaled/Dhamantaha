import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDuration, resolveExpiration, todayIn, warrantyStatus } from '../src/wallet/warranty.js';

describe('addDuration', () => {
  it('adds days, weeks, months, and years', () => {
    assert.equal(addDuration('2026-10-01', 30, 'days'), '2026-10-31');
    assert.equal(addDuration('2026-12-25', 2, 'weeks'), '2027-01-08');
    assert.equal(addDuration('2026-10-01', 6, 'months'), '2027-04-01');
    assert.equal(addDuration('2026-10-01', 2, 'years'), '2028-10-01');
  });

  it('clamps to the end of shorter months', () => {
    assert.equal(addDuration('2027-01-31', 1, 'months'), '2027-02-28');
    assert.equal(addDuration('2028-01-31', 1, 'months'), '2028-02-29');
    assert.equal(addDuration('2028-02-29', 1, 'years'), '2029-02-28');
  });

  it('returns null for incomplete or invalid input', () => {
    assert.equal(addDuration(null, 1, 'years'), null);
    assert.equal(addDuration('2026-02-30', 1, 'years'), null);
    assert.equal(addDuration('2026-10-01', 0, 'years'), null);
    assert.equal(addDuration('2026-10-01', 1.5, 'years'), null);
    assert.equal(addDuration('2026-10-01', 1, 'decades'), null);
  });
});

describe('resolveExpiration', () => {
  it('prefers an explicit date, then calculates, else stays unknown', () => {
    const terms = { purchaseDate: '2026-10-01', durationValue: 1, durationUnit: 'years' };
    assert.deepEqual(resolveExpiration({ ...terms, expirationDate: '2027-06-01' }), { expirationDate: '2027-06-01', basis: 'explicit' });
    assert.deepEqual(resolveExpiration({ ...terms, expirationDate: null }), { expirationDate: '2027-10-01', basis: 'calculated' });
    assert.deepEqual(resolveExpiration({ ...terms, purchaseDate: null, expirationDate: null }), { expirationDate: null, basis: null });
  });
});

describe('warrantyStatus', () => {
  it('covers the expiration day itself', () => {
    assert.equal(warrantyStatus('2026-10-20', '2026-10-20'), 'expiring_soon');
    assert.equal(warrantyStatus('2026-10-19', '2026-10-20'), 'expired');
  });

  it('flags warranties ending within 30 days', () => {
    assert.equal(warrantyStatus('2026-11-19', '2026-10-20'), 'expiring_soon');
    assert.equal(warrantyStatus('2026-11-20', '2026-10-20'), 'active');
  });

  it('is unknown without an expiration date', () => {
    assert.equal(warrantyStatus(null, '2026-10-20'), 'unknown');
  });
});

describe('todayIn', () => {
  it('uses the wallet time zone, not UTC', () => {
    // 22:30 UTC on Oct 19 is already Oct 20 in Riyadh (UTC+3).
    const instant = new Date('2026-10-19T22:30:00Z');
    assert.equal(todayIn('Asia/Riyadh', instant), '2026-10-20');
    assert.equal(todayIn('UTC', instant), '2026-10-19');
  });
});
