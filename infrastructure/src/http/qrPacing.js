import { AppError } from '../errors.js';

/** QR clients wait outside the upload request, keeping bodies out of memory while queued. */
export function createQrPacer({ batchSize = 5, intervalMs = 5000, now = () => Date.now() } = {}) {
  let windowStart = now();
  let admitted = 0;
  let pausedUntil = 0;
  const busy = (until, category) => new AppError(503, 'server_busy', 'Your receipt is waiting for an analysis slot. It will retry automatically.', {
    category, retryAfterSeconds: Math.max(1, Math.ceil((until - now()) / 1000)),
  });
  const ready = () => {
    if (pausedUntil > now()) throw busy(pausedUntil, 'provider_cooldown');
  };
  return {
    ready,
    pause(ms = 60_000) { pausedUntil = Math.max(pausedUntil, now() + ms); },
    admit() {
      ready();
      if (now() - windowStart >= intervalMs) { windowStart = now(); admitted = 0; }
      if (admitted >= batchSize) throw busy(windowStart + intervalMs, 'qr_pacing');
      admitted++;
    },
  };
}
