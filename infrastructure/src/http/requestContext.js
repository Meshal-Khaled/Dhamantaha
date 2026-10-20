import { randomUUID } from 'node:crypto';

/**
 * Assigns a request ID and writes one metadata-only log line per request.
 * Handlers add labels such as the processing method to `res.locals.logFields`.
 */
export function requestContext(logger) {
  return (req, res, next) => {
    req.id = randomUUID();
    res.locals.logFields = {};
    res.setHeader('X-Request-Id', req.id);

    // The path only: query strings stay out of logs.
    const path = req.originalUrl.split('?')[0].slice(0, 120);
    const started = process.hrtime.bigint();
    let logged = false;
    const logOnce = (aborted) => {
      if (logged) return;
      logged = true;
      logger.info({
        event: 'request',
        requestId: req.id,
        method: req.method,
        path,
        status: aborted ? null : res.statusCode,
        aborted,
        durationMs: Number((process.hrtime.bigint() - started) / 1_000_000n),
        ...res.locals.logFields,
      });
    };
    res.on('finish', () => logOnce(false));
    res.on('close', () => logOnce(!res.writableFinished));
    next();
  };
}
