const DAY = 86400000;
const round = value => Math.round(value * 100) / 100;
const currencyCodes = typeof Intl.supportedValuesOf === 'function' ? new Set(Intl.supportedValuesOf('currency')) : null;
export const ANALYST_PERIODS = [1, 7, 30, 365];

export function searchKey(value = '') {
  return String(value).normalize('NFKC').toLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
const jarirNames = new Set(['Jarir', 'Jarir Bookstore', 'Jarir Bookstores', 'Jarir Marketing Company', 'Jarir Marketing Co', 'مكتبة جرير', 'مكتبه جرير', 'جرير', 'شركة جرير للتسويق'].map(searchKey));

/** Explicit aliases only: never fuzzy-merge unrelated stores or rewrite receipt evidence. */
export function merchantGroup(name, aliases = {}, arabic = false) {
  const original = typeof name === 'string' ? name.trim() : '';
  const normalized = searchKey(original);
  const override = Object.hasOwn(aliases, normalized) && typeof aliases[normalized] === 'string' ? aliases[normalized].trim() : '';
  const key = searchKey(override || original);
  if (!key) return { key: '__unknown', name: arabic ? 'متجر غير معروف' : 'Unknown store', original };
  if (jarirNames.has(key)) return { key: 'jarir', name: arabic ? 'جرير' : 'Jarir', original };
  return { key, name: override || original, original };
}

export function analystRecords(records, aliases = {}, arabic = false, today = new Date()) {
  const end = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const rows = [], excluded = { unanalyzed: 0, date: 0, future: 0, amount: 0, currency: 0 };
  for (const record of records) {
    const receipt = record.analysis?.receipt;
    if (!receipt) { excluded.unanalyzed++; continue; }
    const date = receipt.purchaseDate;
    const at = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : NaN;
    if (!Number.isFinite(at) || new Date(at).toISOString().slice(0, 10) !== date) { excluded.date++; continue; }
    if (at > end) { excluded.future++; continue; }
    if (typeof receipt.total !== 'number' || !Number.isFinite(receipt.total) || receipt.total < 0) { excluded.amount++; continue; }
    const currency = typeof receipt.currency === 'string' ? receipt.currency.trim().toUpperCase() : '';
    if (!/^[A-Z]{3}$/.test(currency) || (currencyCodes && !currencyCodes.has(currency))) { excluded.currency++; continue; }
    const merchant = merchantGroup(receipt.merchantName, aliases, arabic);
    const items = record.analysis.items ?? [];
    rows.push({ record, receipt, at, currency, total: receipt.total, merchant,
      search: searchKey([merchant.name, merchant.original, receipt.branchName, record.name, ...items.flatMap(item => [item.displayName, item.description, item.productIdentifier, item.category])].filter(Boolean).join(' ')) });
  }
  return { rows, excluded, end };
}

export function spendingAnalytics(records, { days = 30, currency = '', store = '', query = '', aliases = {}, arabic = false, today = new Date() } = {}) {
  const valid = analystRecords(records, aliases, arabic, today);
  const period = ANALYST_PERIODS.includes(days) ? days : 30;
  const start = valid.end - (period - 1) * DAY;
  const inPeriod = valid.rows.filter(row => row.at >= start);
  const stores = [...new Map(valid.rows.map(row => [row.merchant.key, row.merchant])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const terms = searchKey(query).split(' ').filter(Boolean);
  const matches = inPeriod.filter(row => (!store || row.merchant.key === store) && terms.every(term => row.search.includes(term)));
  const currencies = [...new Set(matches.map(row => row.currency))].sort();
  const selectedCurrency = currencies.includes(currency) ? currency : currencies[0] || '';
  const rows = matches.filter(row => row.currency === selectedCurrency).sort((a, b) => b.at - a.at || Number(b.record.createdAt) - Number(a.record.createdAt));
  const total = round(rows.reduce((sum, row) => sum + row.total, 0));
  const groups = new Map(), buckets = new Map();
  for (let at = start; at <= valid.end; at += DAY) {
    const key = new Date(at).toISOString().slice(0, period === 365 ? 7 : 10);
    if (!buckets.has(key)) buckets.set(key, { key, at, total: 0, count: 0 });
  }
  for (const row of rows) {
    const key = row.receipt.purchaseDate.slice(0, period === 365 ? 7 : 10);
    const bucket = buckets.get(key); bucket.total += row.total; bucket.count++;
    if (!groups.has(row.merchant.key)) groups.set(row.merchant.key, { ...row.merchant, total: 0, count: 0, variants: new Set(), branches: new Set() });
    const group = groups.get(row.merchant.key); group.total += row.total; group.count++;
    if (row.merchant.original) group.variants.add(row.merchant.original);
    if (row.receipt.branchName) group.branches.add(row.receipt.branchName);
  }
  const keywords = new Map();
  const stop = new Set(['the', 'and', 'with', 'for', 'item', 'product', 'منتج', 'فاتورة']);
  for (const row of inPeriod.filter(row => !store || row.merchant.key === store)) {
    const tokens = new Set((row.record.analysis.items ?? []).flatMap(item => [item.category, ...String(item.displayName || item.description || '').split(/\s+/)]).filter(Boolean).map(searchKey).filter(word => word.length >= 3 && word.length <= 28 && !stop.has(word) && !/^\p{N}/u.test(word)));
    for (const word of tokens) keywords.set(word, (keywords.get(word) || 0) + 1);
  }
  return { ...valid, allValidCount: valid.rows.length, start, days: period, inPeriodCount: inPeriod.length, currencies, currency: selectedCurrency, stores, rows, total,
    average: rows.length ? round(total / rows.length) : null, largest: rows.length ? rows.reduce((max, row) => Math.max(max, row.total), 0) : null,
    buckets: [...buckets.values()].map(bucket => ({ ...bucket, total: round(bucket.total) })),
    groups: [...groups.values()].map(group => ({ ...group, total: round(group.total), variants: [...group.variants], branches: [...group.branches] })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
    keywords: [...keywords].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8),
  };
}
