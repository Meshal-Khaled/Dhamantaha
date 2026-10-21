import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Router, json } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../errors.js';

const digest = (s) => createHash('sha256').update(s).digest();
const COOKIE = 'dhamantaha_admin';
const SESSION_MS = 8 * 60 * 60 * 1000;

export function adminRouter({ config, runtime, monitoring, usage, budget, debug }) {
  const router = Router();
  const sessions = new Map();
  const adminHash = config.admin.key ? digest(config.admin.key) : null;
  const cookieOptions = { httpOnly: true, secure: config.admin.secureCookie, sameSite: 'strict', path: '/admin', maxAge: SESSION_MS };
  router.use(json({ limit: '4kb', type: 'application/json' }));
  router.use((req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-Dashboard-Request') !== '1') {
      return next(new AppError(403, 'invalid_admin_request', 'Use the dashboard to make this change.'));
    }
    next();
  });
  const tokenOf = (req) => {
    const cookie = req.headers.cookie?.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE}=`));
    return cookie?.slice(COOKIE.length + 1) ?? '';
  };
  const authenticated = (req) => {
    const now = Date.now();
    for (const [key, expiry] of sessions) if (expiry <= now) sessions.delete(key);
    const token = tokenOf(req);
    return token.length <= 128 && Boolean(sessions.get(digest(token).toString('hex')) > now);
  };
  router.get('/session', (req, res) => res.json({ authenticated: authenticated(req), available: Boolean(adminHash) }));
  router.post('/login', rateLimit({ windowMs: 15 * 60_000, limit: 10, skipSuccessfulRequests: true, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (req, res, next) => next(new AppError(429, 'admin_rate_limited', 'Too many sign-in attempts. Try again in 15 minutes.')) }), (req, res) => {
    if (!adminHash) throw new AppError(503, 'admin_not_configured', 'Dashboard sign-in is not configured on the server.');
    const key = req.body?.key;
    if (typeof key !== 'string' || key.length > 1024 || !timingSafeEqual(digest(key), adminHash)) {
      throw new AppError(401, 'invalid_admin_key', 'The admin key is incorrect.');
    }
    const token = randomBytes(32).toString('base64url');
    if (sessions.size >= 32) sessions.delete(sessions.keys().next().value);
    sessions.set(digest(token).toString('hex'), Date.now() + SESSION_MS);
    res.cookie(COOKIE, token, cookieOptions).json({ authenticated: true });
  });
  router.use((req, res, next) => authenticated(req) ? next() : next(new AppError(401, 'admin_required', 'Sign in with your Ring admin key.')));
  router.post('/logout', (req, res) => {
    sessions.delete(digest(tokenOf(req)).toString('hex'));
    res.clearCookie(COOKIE, { ...cookieOptions, maxAge: undefined }).json({ ok: true });
  });
  router.get('/settings', (req, res) => res.json({ ...runtime.summary(), apiBaseUrl: `${req.protocol}://${req.get('host')}/v1` }));
  router.put('/settings', async (req, res) => res.json(await runtime.save(req.body ?? {})));
  router.delete('/settings/key', async (req, res) => res.json(await runtime.useRingKey()));
  router.post('/settings/check', rateLimit({ windowMs: 60_000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (req, res, next) => next(new AppError(429, 'admin_rate_limited', 'Wait a minute before checking the provider again.')) }), async (req, res) => res.json(await runtime.check()));
  router.get('/monitoring', (req, res) => res.json({ ...monitoring.snapshot(), usage: usage.snapshot(), provider: runtime.summary(), budget: budget.usage(),
    limits: { maxConcurrentAnalyses: config.limits.maxConcurrentAnalyses, maxImageBytes: config.limits.maxImageBytes,
      maxPdfBytes: config.limits.maxPdfBytes, maxPdfPages: config.limits.maxPdfPages } }));
  router.get('/debug', (req, res) => res.json({ ...debug.summary(), captures: debug.list() }));
  router.put('/debug', (req, res) => {
    if (typeof req.body?.enabled !== 'boolean') throw new AppError(400, 'invalid_debug_request', 'Send {"enabled": true} or {"enabled": false}.');
    debug.setEnabled(req.body.enabled);
    res.json({ ...debug.summary(), captures: debug.list() });
  });
  router.delete('/debug', (req, res) => {
    debug.clear();
    res.json({ ...debug.summary(), captures: [] });
  });
  router.use((err, req, res, next) => {
    if (err?.type === 'entity.parse.failed') return next(new AppError(400, 'invalid_json', 'Send valid JSON.'));
    if (err?.type === 'entity.too.large') return next(new AppError(413, 'settings_too_large', 'These settings are too large.'));
    next(err);
  });
  return router;
}
