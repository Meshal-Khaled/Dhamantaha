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

export function products(records, today = new Date()) {
  return records.flatMap((record) => {
    const body = record.analysis;
    const items = body?.items?.length ? body.items : [{ description: record.name }];
    return items.map((item, index) => {
      const policy = item.localPolicy;
      const warrantyEnd = policy?.warranty ? endDate(body?.receipt?.purchaseDate, policy.warranty.amount, policy.warranty.unit)
        : item.warranty?.expirationBasis === 'calculated' ? endDate(body?.receipt?.purchaseDate, item.warranty.durationValue, item.warranty.durationUnit) : item.warranty?.expirationDate;
      const returnEnd = policy?.returns ? endDate(body?.receipt?.purchaseDate, policy.returns.amount, policy.returns.unit) : null;
      return { record, index, item, receipt: body?.receipt ?? {}, warrantyEnd, returnEnd, warrantyDays: daysUntil(warrantyEnd, today), returnDays: daysUntil(returnEnd, today) };
    });
  });
}

export function walletSummary(records, today = new Date()) {
  const entries = products(records, today);
  const upcoming = entries.filter((entry) => [entry.warrantyDays, entry.returnDays].some((days) => days !== null && days >= 0 && days <= 30));
  upcoming.sort((a, b) => {
    const nearest = (entry) => Math.min(...[entry.warrantyDays, entry.returnDays].filter((days) => days !== null && days >= 0));
    return nearest(a) - nearest(b);
  });
  return { entries, upcoming, active: entries.filter((entry) => entry.warrantyDays !== null && entry.warrantyDays >= 0).length };
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
  body.items[index] = { ...existing, description: values.description.trim() || null, totalPrice: price, localPolicy: { warranty: policy(values.warrantyAmount, values.warrantyUnit), returns: policy(values.returnAmount, values.returnUnit) } };
  body.locallyEdited = true;
  return body;
}
