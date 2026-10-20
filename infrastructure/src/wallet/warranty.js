/**
 * Warranty calculation rule shared by the infrastructure and the app.
 * Pure JavaScript with no dependencies, so the frontend can import the same
 * file and recalculate after the user edits a wallet entry.
 *
 * - An explicit expiration date (printed on the receipt or entered by the
 *   user) takes precedence.
 * - Otherwise expiration = purchase date + duration. Month and year additions
 *   clamp to the last day of a shorter month (Jan 31 + 1 month = Feb 28/29).
 * - Coverage includes the expiration date itself.
 * - Without an explicit date, or a purchase date plus duration, the
 *   expiration is unknown.
 */

export const DURATION_UNITS = ['days', 'weeks', 'months', 'years'];
export const EXPIRING_SOON_DAYS = 30;

const DAY_MS = 86_400_000;

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid ? date : null;
}

const formatDate = (date) => date.toISOString().slice(0, 10);

export function isValidDate(value) {
  return parseDate(value) !== null;
}

export function addDuration(startDate, value, unit) {
  const start = parseDate(startDate);
  if (!start || !Number.isInteger(value) || value <= 0 || !DURATION_UNITS.includes(unit)) return null;

  if (unit === 'days' || unit === 'weeks') {
    return formatDate(new Date(start.getTime() + (unit === 'weeks' ? value * 7 : value) * DAY_MS));
  }

  const monthIndex = start.getUTCMonth() + (unit === 'years' ? value * 12 : value);
  const year = start.getUTCFullYear() + Math.floor(monthIndex / 12);
  const month = monthIndex % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return formatDate(new Date(Date.UTC(year, month, Math.min(start.getUTCDate(), lastDay))));
}

/** Returns `{ expirationDate, basis }` with basis 'explicit', 'calculated', or null. */
export function resolveExpiration({ purchaseDate, durationValue, durationUnit, expirationDate }) {
  if (isValidDate(expirationDate)) return { expirationDate, basis: 'explicit' };
  const calculated = addDuration(purchaseDate, durationValue, durationUnit);
  return calculated ? { expirationDate: calculated, basis: 'calculated' } : { expirationDate: null, basis: null };
}

/** 'active' | 'expiring_soon' | 'expired' | 'unknown', relative to a YYYY-MM-DD `today`. */
export function warrantyStatus(expirationDate, today, soonDays = EXPIRING_SOON_DAYS) {
  const end = parseDate(expirationDate);
  const now = parseDate(today);
  if (!end || !now) return 'unknown';
  const daysLeft = Math.round((end.getTime() - now.getTime()) / DAY_MS);
  if (daysLeft < 0) return 'expired';
  return daysLeft <= soonDays ? 'expiring_soon' : 'active';
}

/** Today's date (YYYY-MM-DD) in an IANA time zone, e.g. 'Asia/Riyadh'. */
export function todayIn(timeZone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
