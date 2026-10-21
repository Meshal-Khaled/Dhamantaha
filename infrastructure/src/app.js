import express from 'express';
import { fileURLToPath } from 'node:url';
import { adminRouter } from './admin/routes.js';
import { createRuntime } from './admin/runtime.js';
import { createMonitoring } from './admin/monitoring.js';
import { createDebugCapture } from './admin/debugCapture.js';
import { createUsage } from './admin/usage.js';
import { usageRouter } from './http/usageRoute.js';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApi } from './docs/openapi.js';
import { errorHandler, notFound } from './http/errorHandler.js';
import { createDailyBudget } from './http/protection.js';
import { receiptsRouter } from './http/receiptsRoute.js';
import { requestContext } from './http/requestContext.js';
import { corsPolicy, securityHeaders } from './http/security.js';
import { ACCEPTED_TYPES } from './intake/fileType.js';
import { createLogger } from './logger.js';
import { withBudget } from './providers/index.js';

/**
 * Builds the infrastructure app. `provider` is Gemini, the mock, a test fake,
 * or null when analysis is not configured.
 */
export function createApp({ config, provider, logger = createLogger({ level: config.logLevel }), budget, runtime: suppliedRuntime, usage: suppliedUsage, debug = createDebugCapture({ enabled: config.admin.debugCapture }) }) {
  const dailyBudget = budget ?? createDailyBudget(config.limits.dailyProviderCallLimit);
  const runtime = suppliedRuntime ?? createRuntime(config, { provider });
  const monitoring = createMonitoring();
  const usage = suppliedUsage ?? createUsage({ directory: config.admin.stateDirectory });
  const budgetedProvider = withBudget(runtime.provider, dailyBudget);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(requestContext(logger, monitoring.record));
  app.use(securityHeaders());
  app.use(corsPolicy(config.corsOrigins));
  app.use(monitoring.begin);
  app.use(debug.middleware.bind(debug));

  app.get(['/', '/dashboard'], (req, res) => res.redirect('/dashboard/api-settings'));
  const dashboard = fileURLToPath(new URL('./admin/public/', import.meta.url));
  app.use('/dashboard/assets', express.static(dashboard, { index: false, cacheControl: false }));
  app.get('/dashboard/monitoring', (req, res) => res.redirect('/dashboard/api-monitoring'));
  app.get(['/dashboard/login', '/dashboard/api-settings', '/dashboard/api-monitoring', '/dashboard/users', '/dashboard/logs'], (req, res) => res.sendFile('index.html', { root: dashboard }));
  app.use('/admin/api', adminRouter({ config, runtime, monitoring, usage, budget: dailyBudget, debug }));
  app.get('/v1', (req, res) => res.json({ service: 'Dhamantaha receipt API', version: 'v1',
    endpoints: { health: '/v1/health', analyzeReceipt: '/v1/receipts/analyze', explainWarranty: '/v1/warranty/explain', reportUsage: '/v1/usage' }, dashboard: '/dashboard/api-settings' }));

  app.get(['/health', '/v1/health'], (req, res) => {
    res.json({
      status: 'ok',
      provider: runtime.provider.name,
      clientKeyRequired: config.clientKeys.length > 0,
      limits: {
        acceptedTypes: ACCEPTED_TYPES,
        maxImageBytes: config.limits.maxImageBytes,
        maxPdfBytes: config.limits.maxPdfBytes,
        maxPdfPages: config.limits.maxPdfPages,
      },
    });
  });

  app.use('/v1', usageRouter({ config, usage }));
  app.use('/v1', receiptsRouter({ config, provider: budgetedProvider, budget: dailyBudget, logger, usage }));

  if (config.enableApiDocs) {
    const openApi = buildOpenApi(config);
    app.get('/openapi.json', (req, res) => res.json(openApi));
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApi, { customSiteTitle: 'Dhamantaha infrastructure' }));
  }

  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
