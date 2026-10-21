// Counts how often saved receipts are reopened and originals downloaded, and reports
// the counts to The Ring. Counters only: no receipt, file name, or item ever leaves the phone.
// Pure functions with injectable storage and fetch so they run under `node --test`.

const DEVICE_KEY = 'dhamantaha.device.v1';
const PENDING_KEY = 'dhamantaha.usage.pending.v1';
export const USAGE_EVENTS = ['receipt_refetch', 'original_download'];

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
export async function flushUsage({ baseUrl, clientKey }, { storage = globalThis.localStorage, fetchImpl = globalThis.fetch } = {}) {
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
    return Object.values(left).every((n) => n === 0) ? true : flushUsage({ baseUrl, clientKey }, { storage, fetchImpl });
  } catch {
    return false;
  }
}
