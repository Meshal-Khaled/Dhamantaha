// How the receipt pages describe, filter and order what the wallet holds. Pure functions, tested without a browser.
import { formatNumber } from './format.js';

export const SOON_DAYS = 30;
export const FILTERS = ['all', 'active', 'soon', 'expired', 'unread'];
export const SORTS = ['newest', 'oldest', 'ending', 'price'];

/** The heading for a receipt: the store, else the only product, else the file name. */
export const receiptTitle = (card) => card.receipt.merchantName || (card.itemCount === 1 && card.names[0]) || card.record.name;

/** Which status a receipt shows: unread, review (no warranty dates yet), expired, soon (30 days or less) or active. */
export function receiptStatus(card) {
  if (!card.analyzed) return 'unread';
  const days = card.lead?.warrantyDays ?? null;
  if (days === null) return 'review';
  if (days < 0) return 'expired';
  if (days <= SOON_DAYS) return 'soon';
  return 'active';
}

/** "Ending soon" counts return windows as well as warranties, the same as the Home count. */
export function matchesFilter(card, filter) {
  const days = card.lead?.warrantyDays ?? null;
  switch (filter) {
    case 'active': return card.analyzed && days !== null && days >= 0;
    case 'soon': return card.nextDeadline !== null && card.nextDeadline <= SOON_DAYS;
    case 'expired': return card.analyzed && days !== null && days < 0;
    case 'unread': return !card.analyzed;
    default: return true;
  }
}

const purchaseTime = (card) => {
  const date = card.receipt.purchaseDate;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ? Date.parse(`${date}T12:00:00Z`) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : card.record.createdAt;
};

export function sortCards(cards, sort) {
  const list = [...cards];
  switch (sort) {
    case 'oldest': return list.sort((a, b) => purchaseTime(a) - purchaseTime(b));
    case 'ending': return list.sort((a, b) => (a.nextDeadline ?? Number.MAX_SAFE_INTEGER) - (b.nextDeadline ?? Number.MAX_SAFE_INTEGER));
    case 'price': return list.sort((a, b) => (b.total ?? -Number.MAX_SAFE_INTEGER) - (a.total ?? -Number.MAX_SAFE_INTEGER));
    default: return list.sort((a, b) => purchaseTime(b) - purchaseTime(a));
  }
}

export const itemCountText = (count, arabic) => !arabic
  ? `${formatNumber(count)} ${count === 1 ? 'item' : 'items'}`
  : count === 1 ? 'منتج واحد' : count === 2 ? 'منتجان' : `${formatNumber(count, true)} ${count <= 10 ? 'منتجات' : 'منتجًا'}`;

export function formatBytes(bytes, arabic = false) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return '—';
  const large = bytes >= 1048576;
  const value = large ? Math.round((bytes / 1048576) * 10) / 10 : Math.max(1, Math.round(bytes / 1024));
  return `${formatNumber(value, arabic)} ${large ? (arabic ? 'ميغابايت' : 'MB') : (arabic ? 'كيلوبايت' : 'KB')}`;
}
