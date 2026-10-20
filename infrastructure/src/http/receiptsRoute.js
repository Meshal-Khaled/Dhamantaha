import { Router } from 'express';
import { analyzeReceipt } from '../analysis/analyzeReceipt.js';
import { AnalysisResponse } from '../contracts/receipt.js';
import { AppError, ClientClosedError } from '../errors.js';
import { todayIn } from '../wallet/warranty.js';
import { analysisRateLimit, clientKeyCheck, concurrencyLimit } from './protection.js';
import { receiptUpload } from './upload.js';

/** POST /v1/receipts/analyze. Each check runs before the upload is read into memory. */
export function receiptsRouter({ config, provider, budget, logger }) {
  const router = Router();

  const requireProvider = (req, res, next) => {
    if (provider) return next();
    next(new AppError(503, 'analysis_not_configured', 'Receipt analysis is not configured on this server.'));
  };

  router.post(
    '/receipts/analyze',
    analysisRateLimit(config.limits.rateLimitPerMinute),
    clientKeyCheck(config.clientKeys),
    requireProvider,
    budget.middleware,
    concurrencyLimit(config.limits.maxConcurrentAnalyses),
    receiptUpload(config.limits),
    async (req, res) => {
      if (!req.file) throw new AppError(400, 'no_file', 'Attach the receipt in the "file" field.');
      // Hold the only reference to the upload in this scope so it is released
      // when the request ends, whatever the outcome.
      const { buffer } = req.file;
      req.file = undefined;

      const controller = new AbortController();
      const onClose = () => {
        if (!res.writableEnded) controller.abort(new ClientClosedError());
      };
      res.on('close', onClose);

      try {
        const result = await analyzeReceipt(buffer, {
          provider,
          limits: config.limits,
          today: todayIn(config.walletTimeZone),
          signal: controller.signal,
          meta: res.locals.logFields,
        });
        res.locals.logFields.processingMethod = result.processingMethod;

        const body = { requestId: req.id, ...result };
        const checked = AnalysisResponse.safeParse(body);
        if (!checked.success) {
          // Paths only: issue messages can echo values.
          logger.error({ event: 'contract_violation', requestId: req.id, paths: checked.error.issues.map((i) => i.path.join('.')) });
          throw new AppError(500, 'internal_error', 'Something went wrong on the server. Try again.', { category: 'contract_violation' });
        }
        res.json(checked.data);
      } finally {
        res.off('close', onClose);
      }
    },
  );

  return router;
}
