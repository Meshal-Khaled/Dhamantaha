import { AppError, ClientClosedError, errorBody } from '../errors.js';

export function notFound(req, res, next) {
  next(new AppError(404, 'not_found', 'This endpoint does not exist.'));
}

export function errorHandler(logger) {
  // Express recognizes error handlers by their four parameters.
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (err instanceof ClientClosedError) {
      res.locals.logFields.failure = 'client_closed';
      if (!res.headersSent) res.destroy();
      return;
    }

    const appError = err instanceof AppError ? err : null;
    res.locals.logFields.failure = appError?.category ?? 'internal_error';
    if (!appError) {
      // The class name only: messages and stacks can contain request data.
      logger.error({ event: 'unhandled_error', requestId: req.id, errorName: err?.name ?? typeof err });
    }

    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (appError?.retryAfterSeconds) res.setHeader('Retry-After', String(appError.retryAfterSeconds));
    res
      .status(appError?.status ?? 500)
      .json(
        errorBody(
          appError?.code ?? 'internal_error',
          appError?.message ?? 'Something went wrong on the server. Try again.',
          req.id,
        ),
      );
  };
}
