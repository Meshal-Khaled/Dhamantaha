// Local receipt totals only: currencies stay separate and each receipt is counted once.
const DAY = 86400000;
export function spendingSummary(records, today = new Date()) {
  const end = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const periods = [7, 30, 365].map(days => ({ days, currencies: new Map(), count: 0 }));
  let excluded = 0;
  for (const record of records) {
    const receipt = record.analysis?.receipt;
    const date = receipt?.purchaseDate;
    const parsed = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
    const currency = receipt?.currency?.trim().toUpperCase();
    if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || parsed.getTime() > end || typeof receipt.total !== 'number' || !Number.isFinite(receipt.total) || receipt.total < 0 || !/^[A-Z]{3}$/.test(currency ?? '') || (Intl.supportedValuesOf && !Intl.supportedValuesOf('currency').includes(currency))) {
      excluded++; continue;
    }
    for (const period of periods) if (parsed.getTime() >= end - (period.days - 1) * DAY) {
      period.currencies.set(currency, (period.currencies.get(currency) ?? 0) + receipt.total);
      period.count++;
    }
  }
  return { excluded, periods: periods.map(period => ({ ...period, currencies: [...period.currencies].sort(([a], [b]) => a.localeCompare(b)).map(([currency, total]) => ({ currency, total: Math.round(total * 100) / 100 })) })) };
}
