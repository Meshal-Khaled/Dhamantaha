// What the teams page asks for, and what makes a request acceptable. Pure functions, tested without a browser.
import { receiptMime } from './receipt-store.js';
import { receiptWallet } from './receipt-store.js';

/** The QR trial uses its dedicated shared backend, with provider credentials kept on The Ring. */
export const REQUESTS_LIVE = true;
let memoryId;
export function qrDeviceId() {
  try {
    let id = localStorage.getItem('dhamantaha-qr-install');
    if (!/^[a-zA-Z0-9-]{16,64}$/.test(id ?? '')) { id = crypto.randomUUID(); localStorage.setItem('dhamantaha-qr-install', id); }
    return id;
  } catch { return memoryId ??= crypto.randomUUID(); }
}

let visitPending;
export async function reportQrVisit() {
  if (visitPending) return visitPending;
  try { if (Date.now() - Number(sessionStorage.getItem('dhamantaha-qr-visit')) < 30 * 60_000) return; } catch {}
  visitPending = (async () => {
    const response = await fetch('/v1/qr/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: qrDeviceId(), events: { app_visit: 1 } }), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('Visit report failed');
    try { sessionStorage.setItem('dhamantaha-qr-visit', String(Date.now())); } catch {}
  })();
  try { await visitPending; } finally { visitPending = null; }
}

export const TEAM_LIMITS = { files: 10, bytes: 10 * 1024 * 1024, note: 500, text: 60 };

// The types The Ring can read. (The wallet also keeps GIF and BMP, but those cannot be analyzed.)
const READABLE = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif|avif))$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s().-]{7,20}$/;

export const FIELD_ORDER = ['team', 'name', 'contact', 'files', 'note', 'consent'];

const clean = (value) => String(value ?? '').trim();

/** Problems with a request, by field. An empty object means it can be sent. Codes: required, long, invalid, none. */
export function validateRequest({ team, name, contact, note, consent }, files, limits = TEAM_LIMITS) {
  const errors = {};
  if (clean(team).length < 2) errors.team = 'required';
  else if (clean(team).length > limits.text) errors.team = 'long';
  if (clean(name).length < 2) errors.name = 'required';
  else if (clean(name).length > limits.text) errors.name = 'long';
  const reach = clean(contact);
  if (reach && !EMAIL.test(reach) && !(PHONE.test(reach) && reach.replace(/\D/g, '').length >= 7)) errors.contact = 'invalid';
  if (clean(note).length > limits.note) errors.note = 'long';
  if (!files.length) errors.files = 'none';
  if (!consent) errors.consent = 'required';
  return errors;
}

/**
 * Adds chosen files to the ones already chosen. Anything that cannot be added comes back in `rejected` with a
 * reason: type, empty, size or count. The same file chosen twice is quietly ignored.
 */
export function addFiles(current, incoming, limits = TEAM_LIMITS) {
  const files = [...current];
  const rejected = [];
  const same = (a, b) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
  for (const file of incoming) {
    if (files.some((existing) => same(existing, file))) continue;
    if (!READABLE.test(receiptMime(file))) rejected.push({ name: file.name, reason: 'type' });
    else if (!file.size) rejected.push({ name: file.name, reason: 'empty' });
    else if (file.size > limits.bytes) rejected.push({ name: file.name, reason: 'size' });
    else if (files.length >= limits.files) rejected.push({ name: file.name, reason: 'count' });
    else files.push(file);
  }
  return { files, rejected };
}

/** Save locally first, then analyze. Form names/contact/notes stay in the browser. */
export async function sendRequest(request, files, { fetchImpl = fetch, wallet = receiptWallet, deviceId = qrDeviceId(), onProgress = () => {}, waitImpl = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  if (Object.keys(validateRequest(request, files)).length) throw new Error('Check the form before sending.');
  const registration = await fetchImpl('/v1/qr/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId, events: {}, profile: { name: request.name.trim(), team: request.team.trim() } }), signal: AbortSignal.timeout(10_000) });
  if (!registration.ok) throw new Error('Could not register the request. Please try again.');
  const results = [];
  // One receipt at a time per visitor bounds uploads and keeps each request below the proxy deadline.
  for (const [index, file] of files.entries()) {
    onProgress(index + 1, files.length);
    let id;
    try {
      const saved = await wallet.save(file);
      id = saved.id;
      const form = new FormData(); form.append('file', file, file.name);
      let body;
      const queueDeadline = Date.now() + 5 * 60_000;
      for (let attempt = 0; ; attempt++) {
        const response = await fetchImpl('/v1/qr/receipts/analyze', { method: 'POST', headers: { 'X-Install-Id': deviceId }, body: form, signal: AbortSignal.timeout(95_000) });
        body = await response.json();
        if (!response.ok && body.error?.code === 'server_busy' && attempt < 20 && Date.now() < queueDeadline) {
          const seconds = Math.max(5, Math.min(60, Number(response.headers?.get('Retry-After')) || 5));
          onProgress(index + 1, files.length, seconds);
          await waitImpl(seconds * 1000 + Math.floor(Math.random() * 500));
          continue;
        }
        if (!response.ok) throw new Error(body.error?.message || 'Receipt analysis failed.');
        break;
      }
      await wallet.saveAnalysis(id, body);
      results.push({ id, name: file.name, analysis: body });
    } catch (error) { results.push({ id, name: file.name, error: error.message }); }
  }
  return { preview: false, results };
}
