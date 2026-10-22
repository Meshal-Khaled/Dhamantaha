// Dedicated shared backend for the public QR trial. No admin routes are proxied to it.
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createRuntime } from './admin/runtime.js';
import { createUsage } from './admin/usage.js';
import { createMonitoring } from './admin/monitoring.js';
import { qrInternalRouter } from './admin/qrLink.js';
import { createDailyBudget } from './http/protection.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createQrPacer } from './http/qrPacing.js';
import { AppError } from './errors.js';

const config = loadConfig();
const logger = createLogger({ level: config.logLevel });
const budget = createDailyBudget(config.limits.dailyProviderCallLimit);
const requestScope = new AsyncLocalStorage();
const pacer = createQrPacer();
const keyCount = new Set([config.gemini.apiKey, ...config.gemini.fallbackKeys].filter(Boolean)).size;
const keyCooldowns = Array(keyCount).fill(0);
const keyAvailable = slot => keyCooldowns[slot] <= Date.now();
const unavailable = () => keyCooldowns.every(until => until > Date.now())
  ? new AppError(503, 'server_busy', 'Your receipt is waiting for provider quota. It will retry automatically.', { category: 'provider_cooldown', retryAfterSeconds: Math.max(1, Math.ceil((Math.min(...keyCooldowns) - Date.now()) / 1000)) }) : undefined;
const runtime = createRuntime(config, { hooks: { onAttempt: attempt => {
  requestScope.getStore()?.attempts.push(attempt);
  if (attempt.category === 'provider_quota') keyCooldowns[Number(attempt.key.slice(4)) - 1] = Date.now() + 60_000;
  logger.info({ event: 'provider_attempt', ...attempt });
}, isKeyAvailable: keyAvailable, onKeysUnavailable: unavailable, beforeRetry: () => budget.consume() } });
const usage = createUsage({ directory: config.admin.stateDirectory, containers: ['dhamantaha-website-website-1', 'dhamantaha-qr-1'], allowProfiles: true, timeZone: config.walletTimeZone });
const monitoring = createMonitoring({ directory: config.admin.stateDirectory });
// Read by the API's dashboard over the private Docker network.
const routes = qrInternalRouter({ token: config.qrLink.token, usage, monitoring, budget });
const app = createApp({ config, runtime, logger, budget, usage, monitoring, routes, qr: null, requestMiddleware: (req, res, next) => {
  if (req.method !== 'POST' || req.path !== '/v1/receipts/analyze') return next();
  const scope = { attempts: [] };
  const started = Date.now();
  usage.beginRequest(req.get('X-Install-Id'), req.id);
  let finished = false;
  const finish = () => {
    if (finished) return; finished = true;
    usage.finishRequest(req.id, { status: res.writableFinished ? res.statusCode : 499, durationMs: Date.now() - started, attempts: scope.attempts, waiting: ['qr_pacing', 'provider_cooldown', 'server_busy'].includes(res.locals.logFields.failure) });
  };
  res.on('finish', finish); res.on('close', finish);
  try { const error = unavailable(); if (error) throw error; pacer.admit(); } catch (error) { return next(error); }
  requestScope.run(scope, next);
} });
const server = app.listen(config.port, config.host, () => logger.info({ event: 'server_started' }));
server.headersTimeout = 30_000;
server.requestTimeout = config.gemini.totalTimeoutMs + 60_000;
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  Promise.allSettled([usage.flush(), monitoring.flush()]).then(() => server.close(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
});
