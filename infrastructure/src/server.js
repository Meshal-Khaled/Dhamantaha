import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createRuntime } from './admin/runtime.js';
import { createUsage } from './admin/usage.js';
import { createDailyBudget } from './http/protection.js';

const config = loadConfig();
const logger = createLogger({ level: config.logLevel });

const budget = createDailyBudget(config.limits.dailyProviderCallLimit);
const runtime = createRuntime(config, {
  hooks: {
    // Slot and model only; keys never appear in logs.
    onAttempt: (attempt) => logger.info({ event: 'provider_attempt', ...attempt }),
    // A fallback attempt is another billed call.
    beforeRetry: () => budget.consume(),
  },
});
if (!runtime.provider.configured) logger.warn({ event: 'analysis_not_configured' });
if (runtime.provider.name === 'mock') logger.warn({ event: 'mock_provider_enabled' });
if (config.host !== '127.0.0.1' && config.clientKeys.length === 0) {
  logger.warn({ event: 'exposed_without_client_keys', host: config.host });
}

const usage = createUsage({ directory: config.admin.stateDirectory });
const app = createApp({ config, runtime, logger, budget, usage });
const server = app.listen(config.port, config.host, () => {
  logger.info({ event: 'server_started', host: config.host, port: config.port, provider: runtime.provider.name });
});

// Mobile uploads can be slow, but headers must arrive promptly.
server.headersTimeout = 30_000;
// Upload + every provider call of one request, which share one deadline.
server.requestTimeout = config.gemini.totalTimeoutMs + 60_000;

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    logger.info({ event: 'server_stopping', signal });
    usage.flush().catch(() => {}).then(() => server.close(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
