import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createProvider } from './providers/index.js';

const config = loadConfig();
const logger = createLogger({ level: config.logLevel });

const { provider, missing } = createProvider(config);
if (!provider) logger.warn({ event: 'analysis_not_configured', missing });
if (provider?.name === 'mock') logger.warn({ event: 'mock_provider_enabled' });
if (config.host !== '127.0.0.1' && config.clientKeys.length === 0) {
  logger.warn({ event: 'exposed_without_client_keys', host: config.host });
}

const app = createApp({ config, provider, logger });
const server = app.listen(config.port, config.host, () => {
  logger.info({ event: 'server_started', host: config.host, port: config.port, provider: provider?.name ?? null });
});

// Mobile uploads can be slow, but headers must arrive promptly.
server.headersTimeout = 30_000;
// Upload + up to two provider calls (PDF text, then visual fallback).
server.requestTimeout = config.gemini.timeoutMs * 2 + 60_000;

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    logger.info({ event: 'server_stopping', signal });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
