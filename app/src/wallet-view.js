import { daysUntil } from './countdown.js';

// Local policy dates are entered by the owner, never inferred from a store name.
export function endDate(start, amount, unit) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start ?? '') || !Number.isInteger(Number(amount)) || Number(amount) <= 0 || Number(amount) > 3650) return null;
  const date = new Date(`${start}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== start) return null;
  const count = Number(amount);
  if (unit === 'days' || unit === 'weeks') date.setUTCDate(date.getUTCDate() + count * (unit === 'weeks' ? 7 : 1));
  else if (unit === 'months' || unit === 'years') {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + count * (unit === 'years' ? 12 : 1));
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
  } else return null;
  return date.toISOString().slice(0, 10);
}

export function warrantyProgress(purchaseDate, expirationDate, today = new Date()) {
  if (!endDate(purchaseDate, 1, 'days') || !endDate(expirationDate, 1, 'days')) return null;
  const total = daysUntil(expirationDate, new Date(`${purchaseDate}T12:00:00`));
  const remaining = daysUntil(expirationDate, today);
  if (total <= 0) return 0;
  return Math.round(Math.max(0, Math.min(1, remaining / total)) * 1000) / 10;
}

// Match the remaining bar to its urgency, including short policies near expiry.
export function warrantyTone(days, percent) {
  if (!Number.isFinite(days)) return 'unknown';
  if (days < 0) return 'ended';
  if (days <= 7 || (Number.isFinite(percent) && percent <= 20)) return 'critical';
  if (days <= 30 || (Number.isFinite(percent) && percent <= 50)) return 'warning';
  return 'healthy';
}

const isAmount = (value) => typeof value === 'number' && Number.isFinite(value);
const cents = (value) => Math.round(value * 100) / 100;

/** The name to show: the API's short display name, else the line as printed. */
export function itemName(item) {
  const name = item?.displayName || item?.description;
  // NFKC repairs Arabic presentation forms (ﻣﻠﺤﻘﺎﺕ) in receipts analyzed before the API cleaned them.
  return typeof name === 'string' && name.trim() ? name.normalize('NFKC').trim() : null;
}

/** Quantity, unit price, and line total, deriving whichever one the receipt left out. */
export function linePrice(item) {
  const quantity = isAmount(item?.quantity) && item.quantity > 0 ? item.quantity : null;
  const count = quantity ?? 1;
  const unitPrice = isAmount(item?.unitPrice) ? item.unitPrice : isAmount(item?.totalPrice) ? cents(item.totalPrice / count) : null;
  const total = isAmount(item?.totalPrice) ? item.totalPrice : unitPrice !== null ? cents(unitPrice * count) : null;
  return { quantity, unitPrice, total };
}

/** Receipt-wide return and exchange deadlines from the printed policy. */
export function receiptPolicy(receipt, today = new Date()) {
  const policy = receipt?.returnPolicy;
  const returnEnd = endDate(receipt?.purchaseDate, policy?.returnDurationValue, policy?.returnDurationUnit);
  const exchangeEnd = endDate(receipt?.purchaseDate, policy?.exchangeDurationValue, policy?.exchangeDurationUnit);
  return { text: policy?.sourceText || null, returnEnd, returnDays: daysUntil(returnEnd, today), exchangeEnd, exchangeDays: daysUntil(exchangeEnd, today) };
}

export function products(records, today = new Date()) {
  return records.flatMap((record) => {
    const body = record.analysis;
    const items = body?.items?.length ? body.items : [{ description: record.name }];
    const printed = receiptPolicy(body?.receipt, today);
    return items.map((item, index) => {
      const policy = item.localPolicy;
      const warrantyEnd = policy?.warranty ? endDate(body?.receipt?.purchaseDate, policy.warranty.amount, policy.warranty.unit)
        : item.warranty?.expirationBasis === 'calculated' ? endDate(body?.receipt?.purchaseDate, item.warranty.durationValue, item.warranty.durationUnit) : item.warranty?.expirationDate;
      // A return period the owner entered for this item replaces the receipt's printed policy.
      const returnEnd = policy?.returns ? endDate(body?.receipt?.purchaseDate, policy.returns.amount, policy.returns.unit) : printed.returnEnd;
      const returnSource = policy?.returns ? 'local' : printed.returnEnd ? 'receipt' : null;
      return { record, index, item, receipt: body?.receipt ?? {}, warrantyEnd, returnEnd, returnSource, warrantyDays: daysUntil(warrantyEnd, today), warrantyProgress: warrantyProgress(body?.receipt?.purchaseDate, warrantyEnd, today), returnDays: daysUntil(returnEnd, today) };
    });
  });
}

const soonest = (days) => {
  const open = days.filter((value) => value !== null && value >= 0);
  return open.length ? Math.min(...open) : null;
};

/** One card per receipt, however many items it lists. */
export function receiptCards(records, today = new Date()) {
  return records.map((record) => {
    const body = record.analysis;
    const items = body?.items ?? [];
    const entries = products([record], today);
    const known = entries.filter((entry) => entry.warrantyDays !== null);
    const covered = known.filter((entry) => entry.warrantyDays >= 0).sort((a, b) => a.warrantyDays - b.warrantyDays);
    const ended = known.filter((entry) => entry.warrantyDays < 0).sort((a, b) => b.warrantyDays - a.warrantyDays);
    const prices = items.map(linePrice);
    const total = isAmount(body?.receipt?.total) ? body.receipt.total
      : prices.length && prices.every((price) => price.total !== null) ? cents(prices.reduce((sum, price) => sum + price.total, 0)) : null;
    const returnDays = soonest(entries.map((entry) => entry.returnDays));
    return {
      record,
      receipt: body?.receipt ?? {},
      entries,
      analyzed: Boolean(body),
      itemCount: items.length,
      names: items.map(itemName).filter(Boolean),
      total,
      // The warranty that ends next; once every warranty has ended, the most recent one.
      lead: covered[0] ?? ended[0] ?? entries[0],
      coveredCount: covered.length,
      returnEntry: returnDays === null ? null : entries.find((entry) => entry.returnDays === returnDays),
      nextDeadline: soonest(entries.flatMap((entry) => [entry.warrantyDays, entry.returnDays])),
    };
  });
}

/** Everything the search box matches: store, branch, file name, and every item's names. */
export function cardSearchText(card) {
  const items = card.record.analysis?.items ?? [];
  return [card.receipt.merchantName, card.receipt.branchName, card.record.name, ...items.flatMap((item) => [itemName(item), item.description, item.category, item.productIdentifier])]
    .filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase();
}

export function walletSummary(records, today = new Date()) {
  const cards = receiptCards(records, today);
  const entries = cards.flatMap((card) => card.entries);
  const upcoming = cards.filter((card) => card.nextDeadline !== null && card.nextDeadline <= 30).sort((a, b) => a.nextDeadline - b.nextDeadline);
  return { cards, entries, upcoming, active: entries.filter((entry) => entry.warrantyDays !== null && entry.warrantyDays >= 0).length };
}

export function editAnalysis(previous, values, index = 0) {
  const body = structuredClone(previous ?? { receipt: {}, items: [], review: { missingFields: [], uncertainties: [] } });
  const price = values.price === '' ? null : Number(values.price);
  if (price !== null && (!Number.isFinite(price) || price < 0)) throw new Error('Enter a valid price.');
  if (values.date && !endDate(values.date, 1, 'days')) throw new Error('Enter a valid purchase date.');
  const policy = (amount, unit) => {
    if (amount === '') return null;
    const n = Number(amount);
    if (!Number.isInteger(n) || n < 0 || n > 3650 || (n > 0 && !endDate(values.date, n, unit))) throw new Error('Choose a purchase date and a valid duration (0–3650).');
    return { amount: n, unit };
  };
  const existing = body.items[index] ?? { quantity: 1, warranty: { statedOnReceipt: false } };
  body.receipt = { ...body.receipt, merchantName: values.merchant.trim() || null, purchaseDate: values.date || null, currency: body.receipt.currency || 'SAR' };
  if (body.items.length <= 1) body.receipt.total = price;
  // The printed line stays in `description`; the owner's name replaces only the display name.
  // A changed line total makes the printed unit price stale, so it is derived again from the total.
  const priceChanged = price !== linePrice(existing).total;
  body.items[index] = { ...existing, displayName: values.description.trim() || null, totalPrice: price, ...(priceChanged ? { unitPrice: null } : {}), localPolicy: { warranty: policy(values.warrantyAmount, values.warrantyUnit), returns: policy(values.returnAmount, values.returnUnit) } };
  body.locallyEdited = true;
  return body;
}

/** Filters apply to receipts: a mixed receipt may contain both active and expired products. */
export function filterReceiptCards(cards, filter) {
  return cards.filter(card => filter === 'unread' ? !card.analyzed
    : filter === 'active' ? card.coveredCount > 0
    : filter === 'soon' ? card.nextDeadline !== null && card.nextDeadline <= 30
    : filter === 'expired' ? card.entries.some(entry => entry.warrantyDays !== null && entry.warrantyDays < 0)
    : true);
}

export function sortReceiptCards(cards, sort) {
  return [...cards].sort((a, b) => sort === 'deadline'
    ? (a.nextDeadline ?? Infinity) - (b.nextDeadline ?? Infinity) || Number(b.record.createdAt) - Number(a.record.createdAt)
    : sort === 'store' ? (a.receipt.merchantName || a.record.name).localeCompare(b.receipt.merchantName || b.record.name)
    : Number(b.record.createdAt) - Number(a.record.createdAt));
}
