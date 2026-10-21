// What the teams page asks for, and what makes a request acceptable. Pure functions, tested without a browser.
import { receiptMime } from './receipt-store.js';

/**
 * Whether requests really go to The Ring. Until the plan for handling them is agreed this stays false: the page
 * works and can be reviewed, shows a "design preview" notice, and sends nothing anywhere.
 */
export const REQUESTS_LIVE = false;

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

/**
 * Sends a request. While REQUESTS_LIVE is false this only waits a moment and says it was a preview, so the page
 * can be reviewed end to end. The real thing is added here once the plan for handling requests is agreed.
 */
export async function sendRequest(request, files) {
  if (!REQUESTS_LIVE) {
    await new Promise((resolve) => setTimeout(resolve, 900));
    return { preview: true };
  }
  throw new Error(`Requests are not connected yet (${request.team}, ${files.length} files).`);
}
