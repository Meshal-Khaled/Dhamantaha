import express from 'express';
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
export function createApp({ config, provider, logger = createLogger({ level: config.logLevel }), budget }) {
  const dailyBudget = budget ?? createDailyBudget(config.limits.dailyProviderCallLimit);
  const budgetedProvider = provider ? withBudget(provider, dailyBudget) : null;

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(requestContext(logger));
  app.use(securityHeaders());
  app.use(corsPolicy(config.corsOrigins));

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      provider: provider?.name ?? null,
      clientKeyRequired: config.clientKeys.length > 0,
      limits: {
        acceptedTypes: ACCEPTED_TYPES,
        maxImageBytes: config.limits.maxImageBytes,
        maxPdfBytes: config.limits.maxPdfBytes,
        maxPdfPages: config.limits.maxPdfPages,
      },
    });
  });

  app.use('/v1', receiptsRouter({ config, provider: budgetedProvider, budget: dailyBudget, logger }));

  if (config.enableApiDocs) {
    const openApi = buildOpenApi(config);
    app.get('/openapi.json', (req, res) => res.json(openApi));
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApi, { customSiteTitle: 'Dhamantaha infrastructure' }));
  }

  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
