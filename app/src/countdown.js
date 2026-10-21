// How long a warranty has left, counted in whole days from today (the phone's local date).

const DAY_MS = 86_400_000;

const utcDay = (year, month, day) => Date.UTC(year, month - 1, day);

/** Whole days from `today` to `expirationDate` (YYYY-MM-DD). Negative once it has ended. Null if unreadable. */
export function daysUntil(expirationDate, today = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expirationDate ?? '');
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  return Math.round((utcDay(year, month, day) - utcDay(today.getFullYear(), today.getMonth() + 1, today.getDate())) / DAY_MS);
}

/** "41 days left", "Last day", "Ended 12 days ago". The expiration day itself is covered, as on The Ring. */
export function countdownLabel(expirationDate, today = new Date()) {
  const days = daysUntil(expirationDate, today);
  if (days === null) return null;
  if (days > 1) return `${days} days left`;
  if (days === 1) return '1 day left';
  if (days === 0) return 'Last day';
  if (days === -1) return 'Ended yesterday';
  return `Ended ${-days} days ago`;
}
