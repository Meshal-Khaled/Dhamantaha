import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createQrPacer } from '../src/http/qrPacing.js';

test('QR admission permits five per five seconds and never admits a sixth early', () => {
  let time = 0;
  const pacer = createQrPacer({ now: () => time });
  for (let batch = 0; batch < 5; batch++) {
    time = batch * 5000;
    for (let i = 0; i < 5; i++) pacer.admit();
    assert.throws(() => pacer.admit(), { code: 'server_busy', retryAfterSeconds: 5 });
    time += 4999;
    assert.throws(() => pacer.admit(), { retryAfterSeconds: 1 });
  }
});

test('an explicit project cooldown blocks admissions until its deadline', () => {
  let time = 0;
  const pacer = createQrPacer({ now: () => time });
  pacer.admit(); pacer.pause();
  assert.throws(() => pacer.ready(), { code: 'server_busy', category: 'provider_cooldown', retryAfterSeconds: 60 });
  time = 59_999;
  assert.throws(() => pacer.admit(), { retryAfterSeconds: 1 });
  time = 60_000;
  assert.doesNotThrow(() => pacer.ready());
  for (let i = 0; i < 5; i++) pacer.admit();
});
