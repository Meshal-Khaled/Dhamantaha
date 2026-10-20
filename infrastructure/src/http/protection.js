import { createHash, timingSafeEqual } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../errors.js';

const digest = (value) => createHash('sha256').update(value).digest();

/**
 * Requires a known `X-Client-Key` when CLIENT_KEYS is configured. Keys
 * identify app builds (android, web-test); a key shipped inside an app can be
 * extracted, so this limits casual use rather than authenticating users.
 */
export function clientKeyCheck(clientKeys) {
  const known = clientKeys.map(({ name, key }) => ({ name, hash: digest(key) }));
  return (req, res, next) => {
    if (known.length === 0) return next();
    const presented = req.get('X-Client-Key');
    const hash = presented ? digest(presented) : null;
    const match = hash && known.find((entry) => timingSafeEqual(entry.hash, hash));
    if (!match) {
      next(new AppError(401, 'unauthorized_client', 'This app is not allowed to use the analysis service.'));
      return;
    }
    res.locals.logFields.client = match.name;
    next();
  };
}

/** Per-IP request limit for analysis, checked before anything is buffered. */
export function analysisRateLimit(perMinute) {
  return rateLimit({
    windowMs: 60_000,
    limit: perMinute,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res, next) => {
      const resetTime = req.rateLimit?.resetTime;
      const retryAfterSeconds = resetTime ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000)) : 60;
      next(new AppError(429, 'rate_limited', 'Too many receipts were sent from this network. Wait a minute and try again.', {
        retryAfterSeconds,
      }));
    },
  });
}

/**
 * Caps provider calls per UTC day to bound spending. `consume` is called once
 * per provider call; the middleware refuses new analyses once the cap is hit.
 */
export function createDailyBudget(limit, now = () => new Date()) {
  let day = now().toISOString().slice(0, 10);
  let used = 0;
  const roll = () => {
    const today = now().toISOString().slice(0, 10);
    if (today !== day) {
      day = today;
      used = 0;
    }
  };

  return {
    middleware(req, res, next) {
      if (limit === 0) return next();
      roll();
      if (used >= limit) {
        const current = now();
        const nextDay = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + 1);
        next(new AppError(503, 'daily_limit_reached', 'The daily analysis limit has been reached. Try again tomorrow.', {
          retryAfterSeconds: Math.ceil((nextDay - current.getTime()) / 1000),
        }));
        return;
      }
      next();
    },
    consume() {
      roll();
      used += 1;
    },
    usage() {
      roll();
      return { limit, used };
    },
  };
}

/**
 * Caps in-flight analyses so buffered uploads stay within the memory budget.
 * Mounted before the upload parser, so rejected requests are never read.
 */
export function concurrencyLimit(max) {
  let active = 0;
  const middleware = (req, res, next) => {
    if (active >= max) {
      next(new AppError(503, 'server_busy', 'The server is busy analyzing other receipts. Try again in a moment.', {
        retryAfterSeconds: 5,
      }));
      return;
    }
    active += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      active -= 1;
    };
    res.on('finish', release);
    res.on('close', release);
    next();
  };
  middleware.activeCount = () => active;
  return middleware;
}
