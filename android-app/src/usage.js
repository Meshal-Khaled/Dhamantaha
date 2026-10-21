// Counts app visits, saved receipt reopens and original downloads, and reports
// the counts to The Ring. Counters only: no receipt, file name, or item ever leaves the phone.
// Pure functions with injectable storage and fetch so they run under `node --test`.

const DEVICE_KEY = 'dhamantaha.device.v1';
const PENDING_KEY = 'dhamantaha.usage.pending.v1';
export const USAGE_EVENTS = ['receipt_refetch', 'original_download', 'app_visit'];
const inFlight = new WeakMap();
const VISIT_KEY = 'dhamantaha.usage.visit.v1';
const VISIT_GAP_MS = 30 * 60_000;

/** A visit begins on first open or after at least 30 minutes away from the app. */
export function trackVisits(onVisit, { documentRef = globalThis.document, storage = globalThis.localStorage, now = () => Date.now() } = {}) {
  let lastActive;
  try { lastActive = Number(storage.getItem(VISIT_KEY)) || null; } catch { lastActive = null; }
  const stamp = () => {
    lastActive = now();
    try { storage.setItem(VISIT_KEY, String(lastActive)); } catch { /* Tracking never blocks the wallet. */ }
  };
  const visible = () => {
    if (documentRef.hidden && lastActive === null) return;
    if (!documentRef.hidden && (lastActive === null || now() - lastActive >= VISIT_GAP_MS)) onVisit();
    stamp();
  };
  visible();
  documentRef.addEventListener('visibilitychange', visible);
  return () => documentRef.removeEventListener('visibilitychange', visible);
}

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`);

/** A random ID made on first run. It is not tied to a name, account, or receipt. */
export function deviceId(storage = globalThis.localStorage) {
  try {
    const saved = storage.getItem(DEVICE_KEY);
    if (saved) return saved;
    const created = newId();
    storage.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    return null;
  }
}

function readPending(storage) {
  try {
    const saved = JSON.parse(storage.getItem(PENDING_KEY) ?? '{}');
    return Object.fromEntries(USAGE_EVENTS.map((event) => [event, Number.isSafeInteger(saved[event]) && saved[event] > 0 ? saved[event] : 0]));
  } catch {
    return Object.fromEntries(USAGE_EVENTS.map((event) => [event, 0]));
  }
}

export function pendingUsage(storage = globalThis.localStorage) {
  return readPending(storage);
}

/**
 * Adds one event and tries to send everything not yet delivered. Counts stay on
 * the phone until The Ring accepts them, so offline use is still counted. Never throws.
 */
export async function reportUsage(event, { baseUrl, clientKey }, { storage = globalThis.localStorage, fetchImpl = globalThis.fetch } = {}) {
  if (!USAGE_EVENTS.includes(event)) return false;
  try {
    const pending = readPending(storage);
    pending[event] += 1;
    storage.setItem(PENDING_KEY, JSON.stringify(pending));
    return await flushUsage({ baseUrl, clientKey }, { storage, fetchImpl });
  } catch {
    return false;
  }
}

/** Sends the undelivered counts, if any. Resolves true when nothing is left to send. */
export function flushUsage(settings, { storage = globalThis.localStorage, fetchImpl = globalThis.fetch } = {}) {
  if (!storage || (typeof storage !== 'object' && typeof storage !== 'function')) return Promise.resolve(false);
  const running = inFlight.get(storage);
  if (running) return running;
  // Defer sending until this promise is registered, so simultaneous actions share one sender.
  const operation = Promise.resolve().then(() => sendPending(settings, { storage, fetchImpl }));
  inFlight.set(storage, operation);
  operation.finally(() => { if (inFlight.get(storage) === operation) inFlight.delete(storage); });
  return operation;
}

async function sendPending({ baseUrl, clientKey }, { storage, fetchImpl }) {
  try {
    const id = deviceId(storage);
    const sent = readPending(storage);
    const events = Object.fromEntries(Object.entries(sent).filter(([, n]) => n > 0).map(([name, n]) => [name, Math.min(n, 100)]));
    if (!id || !Object.keys(events).length) return true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let response;
    try {
      response = await fetchImpl(`${baseUrl.trim().replace(/\/+$/, '')}/usage`, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(clientKey ? { 'X-Client-Key': clientKey } : {}) },
        body: JSON.stringify({ deviceId: id, events }),
      });
    } finally { clearTimeout(timer); }
    if (!response.ok) return false;
    // Subtract only what was delivered; events that happened meanwhile stay pending.
    const left = readPending(storage);
    for (const [name, n] of Object.entries(events)) left[name] = Math.max(0, left[name] - n);
    storage.setItem(PENDING_KEY, JSON.stringify(left));
    return Object.values(left).every((n) => n === 0) ? true : sendPending({ baseUrl, clientKey }, { storage, fetchImpl });
  } catch {
    return false;
  }
}
