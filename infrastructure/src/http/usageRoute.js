import { Router, json } from 'express';
import { rateLimit } from 'express-rate-limit';
import { USAGE_EVENTS } from '../admin/usage.js';
import { AppError } from '../errors.js';
import { clientKeyCheck } from './protection.js';

const DEVICE_ID = /^[A-Za-z0-9-]{16,64}$/;
const MAX_PER_REPORT = 100;
const invalid = () => new AppError(400, 'invalid_usage_report', 'Send {"deviceId": "...", "events": {"receipt_refetch": 1}}.');

/** POST /v1/usage: the app reports how often a saved receipt was reopened or its original downloaded. */
export function usageRouter({ config, usage }) {
  const router = Router();
  router.post(
    '/usage',
    rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false,
      handler: (req, res, next) => next(new AppError(429, 'rate_limited', 'Too many usage reports. Try again in a minute.', { retryAfterSeconds: 60 })) }),
    clientKeyCheck(config.clientKeys),
    json({ limit: '1kb', type: 'application/json' }),
    (req, res) => {
      const { deviceId, events } = req.body ?? {};
      if (typeof deviceId !== 'string' || !DEVICE_ID.test(deviceId) || !events || typeof events !== 'object' || Array.isArray(events)) throw invalid();
      const counts = {};
      for (const [name, value] of Object.entries(events)) {
        if (!USAGE_EVENTS.includes(name) || !Number.isSafeInteger(value) || value < 1 || value > MAX_PER_REPORT) throw invalid();
        counts[name] = value;
      }
      if (!Object.keys(counts).length) throw invalid();
      usage.record(deviceId, counts);
      res.status(202).json({ ok: true });
    },
  );
  router.use((err, req, res, next) => {
    if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') return next(invalid());
    next(err);
  });
  return router;
}
