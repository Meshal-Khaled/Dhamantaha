import { readFileSync } from 'node:fs';

const MB = 1024 * 1024;
const PROVIDERS = ['gemini', 'mock'];
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];

function readInt(env, name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function readBool(env, name, fallback) {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  if (/^(1|true|yes)$/i.test(raw)) return true;
  if (/^(0|false|no)$/i.test(raw)) return false;
  throw new Error(`${name} must be true or false.`);
}

function readChoice(env, name, choices, fallback) {
  const value = env[name]?.trim().toLowerCase() || fallback;
  if (!choices.includes(value)) throw new Error(`${name} must be one of: ${choices.join(', ')}.`);
  return value;
}

function readList(env, name) {
  return (env[name] ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

// Express "trust proxy" accepts booleans, hop counts, or named/CIDR subnets.
function readTrustProxy(env) {
  const raw = env.TRUST_PROXY?.trim() ?? '';
  if (raw === '' || /^false$/i.test(raw)) return false;
  if (/^true$/i.test(raw)) return true;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}

/** CLIENT_KEYS="android:<key>,web-test:<key>" → [{ name, key }]. Empty means keys are not required. */
function readClientKeys(env) {
  return readList(env, 'CLIENT_KEYS').map((entry) => {
    const separator = entry.indexOf(':');
    const name = entry.slice(0, separator).trim();
    const key = entry.slice(separator + 1).trim();
    if (separator < 1 || !/^[a-z0-9-]{1,32}$/i.test(name) || key.length < 16) {
      throw new Error('CLIENT_KEYS entries must look like name:key, with a key of at least 16 characters.');
    }
    return { name, key };
  });
}

function readTimeZone(env) {
  const timeZone = env.WALLET_TIME_ZONE?.trim() || 'Asia/Riyadh';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
  } catch {
    throw new Error('WALLET_TIME_ZONE must be an IANA time zone such as Asia/Riyadh.');
  }
  return timeZone;
}

function readGeminiKey(env) {
  const inline = env.GEMINI_API_KEY?.trim();
  if (inline) return inline;
  const filename = env.GEMINI_API_KEY_FILE?.trim();
  if (!filename) return '';
  try {
    const key = readFileSync(filename, 'utf8').trim();
    if (!key) throw new Error('Empty key file.');
    return key;
  } catch {
    throw new Error('GEMINI_API_KEY_FILE must point to a readable, nonempty key file.');
  }
}

/** GEMINI_FALLBACK_KEY_FILES="/run/secrets/a,/run/secrets/b" → the keys inside those files, in order. */
function readFallbackKeys(env) {
  return readList(env, 'GEMINI_FALLBACK_KEY_FILES').map((filename) => {
    try {
      const key = readFileSync(filename, 'utf8').trim();
      if (!key) throw new Error('Empty key file.');
      return key;
    } catch {
      throw new Error('GEMINI_FALLBACK_KEY_FILES must list readable, nonempty key files.');
    }
  });
}

function readModelList(env, name) {
  const models = readList(env, name).map((entry) => entry.replace(/^models\//, ''));
  if (models.some((model) => !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(model))) {
    throw new Error(`${name} must list Gemini model IDs separated by commas.`);
  }
  return models;
}

function readAdminKey(env) {
  if (env.ADMIN_KEY?.trim()) return env.ADMIN_KEY.trim();
  if (!env.ADMIN_KEY_FILE?.trim()) return '';
  try {
    const key = readFileSync(env.ADMIN_KEY_FILE.trim(), 'utf8').trim();
    if (key.length < 16) throw new Error('Invalid key.');
    return key;
  } catch {
    throw new Error('ADMIN_KEY_FILE must point to a readable admin key of at least 16 characters.');
  }
}

/**
 * The private link between the API and the QR backend: the QR backend's
 * internal address and a shared token of at least 32 characters.
 */
function readQrLink(env) {
  const url = env.QR_INTERNAL_URL?.trim() || '';
  let token = env.QR_INTERNAL_TOKEN?.trim() || '';
  if (!token && env.QR_INTERNAL_TOKEN_FILE?.trim()) {
    try {
      token = readFileSync(env.QR_INTERNAL_TOKEN_FILE.trim(), 'utf8').trim();
    } catch {
      throw new Error('QR_INTERNAL_TOKEN_FILE must point to a readable token file.');
    }
  }
  if (token && token.length < 32) throw new Error('QR_INTERNAL_TOKEN must be at least 32 characters.');
  if (url && !/^https?:\/\/[^\s/]+(:\d+)?\/?$/.test(url)) throw new Error('QR_INTERNAL_URL must look like http://qr:3100.');
  return { url, token };
}

export function loadConfig(env = process.env) {
  const maxImageBytes = readInt(env, 'MAX_IMAGE_BYTES', 20 * MB, { max: 50 * MB });
  const maxPdfBytes = readInt(env, 'MAX_PDF_BYTES', 10 * MB, { max: 50 * MB });

  return {
    // Loopback by default: paid analysis stays private until it is deliberately exposed.
    host: env.HOST?.trim() || '127.0.0.1',
    port: readInt(env, 'PORT', 3100, { max: 65535 }),
    trustProxy: readTrustProxy(env),
    corsOrigins: readList(env, 'CORS_ORIGINS'),
    clientKeys: readClientKeys(env),
    enableApiDocs: readBool(env, 'ENABLE_API_DOCS', true),
    admin: {
      key: readAdminKey(env),
      stateDirectory: env.ADMIN_STATE_DIRECTORY?.trim() || '',
      secureCookie: readBool(env, 'ADMIN_COOKIE_SECURE', env.NODE_ENV === 'production'),
      debugCapture: readBool(env, 'DEBUG_CAPTURE', true),
    },
    logLevel: readChoice(env, 'LOG_LEVEL', LOG_LEVELS, 'info'),
    walletTimeZone: readTimeZone(env),
    qrLink: readQrLink(env),
    analysisProvider: readChoice(env, 'ANALYSIS_PROVIDER', PROVIDERS, 'gemini'),
    gemini: {
      apiKey: readGeminiKey(env),
      model: env.GEMINI_MODEL?.trim() || '',
      timeoutMs: readInt(env, 'GEMINI_TIMEOUT_MS', 60_000, { min: 1000, max: 600_000 }),
      // Fallbacks when the primary key/model fails: other models on each key, then the next key.
      fallbackModels: readModelList(env, 'GEMINI_FALLBACK_MODELS'),
      fallbackKeys: readFallbackKeys(env),
      // Everything one request may spend on provider calls, fallbacks included.
      totalTimeoutMs: readInt(env, 'GEMINI_TOTAL_TIMEOUT_MS', 85_000, { min: 5000, max: 95_000 }),
      // A call still unanswered after this long starts the next fallback alongside it (0 turns this off).
      hedgeAfterMs: readInt(env, 'GEMINI_HEDGE_AFTER_MS', 12_000, { min: 0, max: 60_000 }),
    },
    limits: {
      maxImageBytes,
      maxPdfBytes,
      maxUploadBytes: Math.max(maxImageBytes, maxPdfBytes),
      maxPdfPages: readInt(env, 'MAX_PDF_PAGES', 10, { max: 100 }),
      maxImagePixels: readInt(env, 'MAX_IMAGE_PIXELS', 50_000_000, { min: 10_000, max: 268_402_689 }),
      imageMaxDimension: readInt(env, 'IMAGE_MAX_DIMENSION', 3072, { min: 512, max: 8192 }),
      maxConcurrentAnalyses: readInt(env, 'MAX_CONCURRENT_ANALYSES', 4, { max: 100 }),
      rateLimitPerMinute: readInt(env, 'RATE_LIMIT_PER_MINUTE', 10, { max: 10_000 }),
      // 0 disables the daily cap.
      dailyProviderCallLimit: readInt(env, 'DAILY_PROVIDER_CALL_LIMIT', 500, { min: 0, max: 10_000_000 }),
    },
  };
}
