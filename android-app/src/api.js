// Talks to The Ring. Pure functions, no React, so they run under `node --test`.
import { localizeError } from './format.js';

export const DEFAULT_API_BASE = 'https://dhamantaha.arc-homlab.com/v1';
const REQUEST_TIMEOUT_MS = 95_000; // Cloudflare cuts requests at 100 s.

export class ApiError extends Error {
  constructor({ code, message, status = 0, requestId = null, retryAfterSeconds = null }) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const trimBase = (baseUrl) => baseUrl.trim().replace(/\/+$/, '');

function headersFor(clientKey) {
  return clientKey ? { 'X-Client-Key': clientKey } : {};
}

async function send(url, init, { fetchImpl = fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (cause) {
    const timedOut = controller.signal.aborted;
    throw new ApiError({
      code: timedOut ? 'client_timeout' : 'network_error',
      message: timedOut
        ? 'The Ring took too long to answer. Try again.'
        : 'Could not reach The Ring. Check the internet connection.',
    });
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null; // e.g. an HTML page from a proxy in front of the API
  }
  return {
    url,
    status: response.status,
    ok: response.ok,
    durationMs: Date.now() - started,
    requestId: response.headers.get('X-Request-Id') ?? body?.requestId ?? body?.error?.requestId ?? null,
    retryAfterSeconds: Number(response.headers.get('Retry-After')) || null,
    body,
    raw: text,
  };
}

function failure(result) {
  const error = result.body?.error;
  return new ApiError({
    code: error?.code ?? (result.body ? 'unexpected_response' : 'non_json_response'),
    message: error?.message ?? `The Ring answered with HTTP ${result.status}.`,
    status: result.status,
    requestId: result.requestId,
    retryAfterSeconds: result.retryAfterSeconds,
  });
}

/** GET /health: reachability, provider, whether a client key is needed, upload limits. */
export async function checkHealth({ baseUrl, clientKey }, options) {
  const result = await send(`${trimBase(baseUrl)}/health`, { headers: headersFor(clientKey) }, options);
  if (!result.ok || result.body?.status !== 'ok') throw failure(result);
  return { health: result.body, result };
}

/** Rejects a file before upload using the limits from /health. Returns an error message or null. */
export function checkFileAgainstLimits(file, limits) {
  if (!limits) return null;
  const isPdf = file.type === 'application/pdf';
  const max = isPdf ? limits.maxPdfBytes : limits.maxImageBytes;
  if (file.type && !limits.acceptedTypes.includes(file.type)) {
    return `${file.type} files are not supported. Use a photo or a PDF.`;
  }
  if (max && file.size > max) {
    return `The ${isPdf ? 'PDF' : 'photo'} is larger than the ${Math.round(max / 1048576)} MB limit.`;
  }
  return null;
}

/** POST /receipts/analyze with one file. Resolves with the response; rejects with ApiError. */
export async function analyzeReceipt({ baseUrl, clientKey, file, filename }, options) {
  const form = new FormData();
  form.append('file', file, filename ?? file.name ?? 'receipt');
  // No Content-Type header: fetch adds the multipart boundary itself.
  const result = await send(
    `${trimBase(baseUrl)}/receipts/analyze`,
    { method: 'POST', body: form, headers: headersFor(clientKey) },
    options,
  );
  if (!result.ok || !result.body?.receipt || !Array.isArray(result.body.items)) throw failure(result);
  return result;
}

/** What to tell the user for an error, by code. Falls back to the server's own message. */
export function describeError(error, arabic = false) {
  if (arabic) return localizeError(error, true);
  const wait = error.retryAfterSeconds ? ` Try again in ${error.retryAfterSeconds} s.` : '';
  switch (error.code) {
    case 'unauthorized_client':
      return 'The Ring rejected this app\'s client key. Check it in Settings.';
    case 'rate_limited':
    case 'daily_limit_reached':
    case 'server_busy':
    case 'analysis_quota_exceeded':
      return `${error.message}${wait}`;
    case 'analysis_unavailable':
    case 'analysis_malformed':
    case 'analysis_timeout':
      return `${error.message} This is on The Ring's side; try again shortly.`;
    case 'non_json_response':
      return 'Something other than The Ring answered (a proxy or captive portal). Check the API address in Settings.';
    default:
      return error.message;
  }
}
