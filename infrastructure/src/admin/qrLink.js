import { createHash, timingSafeEqual } from 'node:crypto';
import { Router, json } from 'express';
import { AppError } from '../errors.js';
import { USER_PREFIX } from './usage.js';

const digest = (s) => createHash('sha256').update(s).digest();
export const MAX_DELETE = 200;

/** `[{ user }]` or `['abcd1234']` from a request body → short IDs, or null when malformed. */
export function userPrefixes(list) {
  if (!Array.isArray(list) || !list.length || list.length > MAX_DELETE) return null;
  const prefixes = list.map((entry) => (typeof entry === 'string' ? entry : entry?.user));
  return prefixes.every((prefix) => typeof prefix === 'string' && USER_PREFIX.test(prefix)) ? prefixes : null;
}

/**
 * Routes the API calls on the QR backend over the private Docker network. The
 * website's proxy forwards only the QR usage and analysis paths, so these are
 * not public; the shared token is a second lock. Without a token nothing is mounted.
 */
export function qrInternalRouter({ token, usage, monitoring, budget }) {
  const router = Router();
  if (!token) return router;
  const expected = digest(token);
  router.use('/internal', (req, res, next) => {
    const header = req.get('Authorization') ?? '';
    const given = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!given || given.length > 512 || !timingSafeEqual(digest(given), expected)) {
      return next(new AppError(404, 'not_found', 'This endpoint does not exist.'));
    }
    next();
  });
  router.get('/internal/usage', (req, res) => res.json(usage.snapshot()));
  router.get('/internal/monitoring', (req, res) => res.json({ ...monitoring.snapshot(), budget: budget?.usage() ?? null }));
  router.post('/internal/usage/delete', json({ limit: '16kb', type: 'application/json' }), (req, res) => {
    const prefixes = userPrefixes(req.body?.users);
    if (!prefixes) throw new AppError(400, 'invalid_delete_request', `Send {"users": ["abcd1234"]} with 1 to ${MAX_DELETE} users.`);
    res.json(usage.deleteUsers(prefixes));
  });
  return router;
}

/** The API's side of the link. Null when the QR backend is not configured. */
export function qrClient({ url, token, fetchImpl = fetch, timeoutMs = 3000 }) {
  if (!url || !token) return null;
  const call = async (path, body) => {
    const response = await fetchImpl(new URL(path, url), {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`QR backend answered ${response.status}`);
    return response.json();
  };
  return {
    usage: () => call('/internal/usage'),
    monitoring: () => call('/internal/monitoring'),
    deleteUsers: (prefixes) => call('/internal/usage/delete', { users: prefixes }),
  };
}
