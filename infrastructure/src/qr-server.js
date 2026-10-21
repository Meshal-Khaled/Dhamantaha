// Dedicated shared backend for the public QR trial. No admin routes are proxied to it.
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createRuntime } from './admin/runtime.js';
import { createUsage } from './admin/usage.js';
import { createDailyBudget } from './http/protection.js';
import { AsyncLocalStorage } from 'node:async_hooks';

const config = loadConfig();
const logger = createLogger({ level: config.logLevel });
const budget = createDailyBudget(config.limits.dailyProviderCallLimit);
const requestScope = new AsyncLocalStorage();
const runtime = createRuntime(config, { hooks: { onAttempt: attempt => { requestScope.getStore()?.attempts.push(attempt); logger.info({ event: 'provider_attempt', ...attempt }); }, beforeRetry: () => budget.consume() } });
const usage = createUsage({ directory: config.admin.stateDirectory, containers: ['dhamantaha-website-website-1', 'dhamantaha-qr-1'], allowProfiles: true });
const app = createApp({ config, runtime, logger, budget, usage, requestMiddleware: (req, res, next) => {
  if (req.method !== 'POST' || req.path !== '/v1/receipts/analyze') return next();
  const scope = { attempts: [] };
  const started = Date.now();
  usage.beginRequest(req.get('X-Install-Id'), req.id);
  let finished = false;
  const finish = () => {
    if (finished) return; finished = true;
    usage.finishRequest(req.id, { status: res.writableFinished ? res.statusCode : 499, durationMs: Date.now() - started, attempts: scope.attempts });
  };
  res.on('finish', finish); res.on('close', finish);
  requestScope.run(scope, next);
} });
const server = app.listen(config.port, config.host, () => logger.info({ event: 'server_started' }));
server.headersTimeout = 30_000;
server.requestTimeout = config.gemini.totalTimeoutMs + 60_000;
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  usage.flush().finally(() => server.close(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
});
