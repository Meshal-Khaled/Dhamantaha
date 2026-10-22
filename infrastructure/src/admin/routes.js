import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Router, json } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../errors.js';
import { containerSnapshot, qrUsers } from './containers.js';
import { MAX_DELETE, userPrefixes } from './qrLink.js';

const COUNTS = ['users', 'refetches', 'visits', 'analyses', 'downloads', 'activeLast24h', 'unattributedAnalyses'];
const DAY_COUNTS = ['visits', 'refetches', 'analyses', 'downloads', 'active', 'newUsers'];
const SNAPSHOT_STALE_MS = 45_000;

const digest = (s) => createHash('sha256').update(s).digest();
const COOKIE = 'dhamantaha_admin';
const SESSION_MS = 8 * 60 * 60 * 1000;

export function adminRouter({ config, runtime, monitoring, usage, budget, debug, qr = null }) {
  const router = Router();
  const sessions = new Map();
  const adminHash = config.admin.key ? digest(config.admin.key) : null;
  const cookieOptions = { httpOnly: true, secure: config.admin.secureCookie, sameSite: 'strict', path: '/admin', maxAge: SESSION_MS };
  router.use(json({ limit: '16kb', type: 'application/json' }));
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
  router.post('/providers', async (req, res) => res.status(201).json(await runtime.addProfile(req.body ?? {})));
  router.post('/providers/:id/activate', async (req, res) => res.json(await runtime.activate(req.params.id)));
  router.delete('/providers/:id', async (req, res) => res.json(await runtime.removeProfile(req.params.id)));
  router.delete('/settings/key', async (req, res) => res.json(await runtime.useRingKey()));
  router.post('/settings/check', rateLimit({ windowMs: 60_000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (req, res, next) => next(new AppError(429, 'admin_rate_limited', 'Wait a minute before checking the provider again.')) }), async (req, res) => res.json(await runtime.check(req.body?.providerId)));
  /** QR trial users: live from the QR backend, else the host collector's snapshot. */
  const qrUsage = async () => {
    if (qr) {
      try { return { data: await qr.usage(), status: 'live' }; } catch { /* Fall back to the snapshot. */ }
    }
    const snapshot = await qrUsers();
    if (!snapshot) return { data: null, status: qr ? 'unreachable' : 'none' };
    return { data: snapshot, status: Date.now() - Date.parse(snapshot.collectedAt) > SNAPSHOT_STALE_MS ? 'stale' : 'snapshot', collectedAt: snapshot.collectedAt };
  };
  router.get('/users', async (req, res) => {
    const current = usage.snapshot();
    const { data: found, status, collectedAt } = await qrUsage();
    const pick = (data) => Object.fromEntries(COUNTS.map((key) => [key, data[key] ?? 0]));
    current.sources = { app: pick(current), qr: found ? pick(found) : null };
    current.qrStatus = status;
    if (collectedAt) current.qrCollectedAt = collectedAt;
    current.recentUsers = current.recentUsers.map((user) => ({ ...user, source: 'app' }));
    if (!found) return res.json(current);
    for (const key of COUNTS) current[key] += found[key] ?? 0;
    current.recentUsers = [...current.recentUsers, ...found.recentUsers.map((user) => ({ ...user, source: 'qr' }))]
      .sort((a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen));
    // A snapshot from the collector carries no daily history.
    const byDate = new Map((found.history ?? []).map((day) => [day.date, day]));
    current.history = current.history.map((day) => {
      const other = byDate.get(day.date);
      return other ? Object.fromEntries(Object.entries(day).map(([key, value]) => [key, DAY_COUNTS.includes(key) ? value + (other[key] ?? 0) : value])) : day;
    });
    if (found.historyStart && (!current.historyStart || found.historyStart < current.historyStart)) current.historyStart = found.historyStart;
    current.qrHistory = Boolean(found.history);
    res.json(current);
  });
  router.post('/users/delete', async (req, res) => {
    const list = req.body?.users;
    const prefixes = userPrefixes(list);
    if (!prefixes || list.some((entry) => !['app', 'qr'].includes(entry?.source))) {
      throw new AppError(400, 'invalid_delete_request', `Send {"users": [{"user": "abcd1234", "source": "app"}]} with 1 to ${MAX_DELETE} users.`);
    }
    const fromApp = list.filter((entry) => entry.source === 'app').map((entry) => entry.user);
    const fromQr = list.filter((entry) => entry.source === 'qr').map((entry) => entry.user);
    if (fromQr.length && !qr) throw new AppError(503, 'qr_backend_unavailable', 'QR trial users can only be deleted when the API is linked to the QR backend.');
    const results = [fromApp.length ? usage.deleteUsers(fromApp) : null];
    if (fromQr.length) {
      try { results.push(await qr.deleteUsers(fromQr)); }
      catch { throw new AppError(502, 'qr_backend_unavailable', 'The QR backend did not answer. Nothing was deleted from the QR trial; try again.'); }
    }
    const merged = { deleted: [], notFound: [], ambiguous: [] };
    for (const result of results.filter(Boolean)) for (const key of Object.keys(merged)) merged[key].push(...(result[key] ?? []));
    res.json(merged);
  });
  router.get('/containers', async (req, res) => res.json(await containerSnapshot({ provider: runtime.summary() })));
  router.get('/monitoring', async (req, res) => {
    let qrMonitoring = null;
    if (qr) { try { qrMonitoring = await qr.monitoring(); } catch { qrMonitoring = { unavailable: true }; } }
    res.json({ ...monitoring.snapshot(), provider: runtime.summary(), budget: budget.usage(),
      limits: { maxConcurrentAnalyses: config.limits.maxConcurrentAnalyses, maxImageBytes: config.limits.maxImageBytes,
        maxPdfBytes: config.limits.maxPdfBytes, maxPdfPages: config.limits.maxPdfPages },
      qr: qrMonitoring });
  });
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
