/**
 * An error whose code and message are safe to return to the client.
 * `category` is the metadata-only label written to logs.
 */
export class AppError extends Error {
  constructor(status, code, message, { category = code, retryAfterSeconds, cause } = {}) {
    super(message, { cause });
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.category = category;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** The client disconnected before the analysis finished; nothing is sent back. */
export class ClientClosedError extends Error {
  constructor() {
    super('Client closed the request.');
    this.name = 'ClientClosedError';
  }
}

export function errorBody(code, message, requestId) {
  return { error: { code, message, requestId } };
}
