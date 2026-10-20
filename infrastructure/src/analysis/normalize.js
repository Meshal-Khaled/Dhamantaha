import { AppError } from '../errors.js';
import { DURATION_UNITS, isValidDate, resolveExpiration, warrantyStatus } from '../wallet/warranty.js';

const MAX_ITEMS = 200;
const MAX_UNCERTAINTIES = 50;
const MAX_TEXT_LENGTH = 500;

// Arabic-Indic (U+0660–0669) and Extended Arabic-Indic (U+06F0–06F9) digits.
const ARABIC_INDIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;
const toWesternDigits = (value) => value.replace(ARABIC_INDIC_DIGITS, (d) => String(d.codePointAt(0) & 0x0f));

function cleanText(value, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed === '' ? null : trimmed.slice(0, maxLength);
}

function cleanNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  // Drop thousands separators (including U+066C) and accept the Arabic decimal separator (U+066B).
  const normalized = toWesternDigits(value).replace(/[,\s\u066C]/g, '').replace('\u066B', '.');
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : null;
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Validates the provider's JSON and turns it into wallet-ready data.
 * Leaf values that fail validation become null and are flagged for review;
 * a response without the expected structure is rejected. `today` (YYYY-MM-DD)
 * sets each warranty's status.
 */
export function normalizeProviderResponse(raw, { today }) {
  if (!isObject(raw)) throw malformed();
  if (raw.receipt !== undefined && !isObject(raw.receipt)) throw malformed();
  if (raw.items !== undefined && !Array.isArray(raw.items)) throw malformed();

  const uncertainties = [];
  const flag = (field, note) => uncertainties.push({ field, note });
  const date = (value, field) => {
    if (value === null || value === undefined) return null;
    const candidate = typeof value === 'string' ? toWesternDigits(value.trim()) : value;
    if (isValidDate(candidate)) return candidate;
    flag(field, 'The date could not be read as YYYY-MM-DD; please enter it.');
    return null;
  };

  const source = raw.receipt ?? {};
  const currencyRaw = cleanText(source.currency, 10);
  const currency = currencyRaw && /^[A-Za-z]{3}$/.test(currencyRaw) ? currencyRaw.toUpperCase() : null;
  if (currencyRaw && !currency) flag('receipt.currency', `The currency "${currencyRaw}" is not an ISO code; please confirm it.`);

  const receipt = {
    merchantName: cleanText(source.merchantName),
    purchaseDate: date(source.purchaseDate, 'receipt.purchaseDate'),
    receiptNumber: cleanText(source.receiptNumber, 100),
    currency,
    total: cleanNumber(source.total),
    warrantyNotes: cleanText(source.warrantyNotes, 1000),
  };

  const sourceItems = raw.items ?? [];
  if (sourceItems.length > MAX_ITEMS) flag('items', `Only the first ${MAX_ITEMS} items were kept.`);
  const items = sourceItems
    .slice(0, MAX_ITEMS)
    .map((item, index) => normalizeItem(item, `items[${index}]`, { flag, date, purchaseDate: receipt.purchaseDate, today }));

  for (const entry of Array.isArray(raw.uncertainties) ? raw.uncertainties.slice(0, MAX_UNCERTAINTIES) : []) {
    const field = cleanText(entry?.field, 100);
    const note = cleanText(entry?.note);
    if (field && note) flag(field, note);
  }

  const hasContent =
    receipt.merchantName !== null || receipt.total !== null || items.some((item) => item.description !== null);
  return {
    readable: (raw.readable ?? true) === true && hasContent,
    receipt,
    items,
    review: { missingFields: findMissingFields(receipt, items), uncertainties },
  };
}

function normalizeItem(item, path, context) {
  const source = isObject(item) ? item : {};
  const quantity = cleanNumber(source.quantity);
  if (quantity !== null && quantity <= 0) context.flag(`${path}.quantity`, 'The quantity is not positive; please check it.');
  return {
    description: cleanText(source.description),
    quantity: quantity !== null && quantity > 0 ? quantity : null,
    unitPrice: cleanNumber(source.unitPrice),
    totalPrice: cleanNumber(source.totalPrice),
    productIdentifier: cleanText(source.productIdentifier, 100),
    warranty: normalizeWarranty(source.warranty, `${path}.warranty`, context),
  };
}

function normalizeWarranty(warranty, path, { flag, date, purchaseDate, today }) {
  const unknown = {
    statedOnReceipt: false,
    sourceText: null,
    durationValue: null,
    durationUnit: null,
    expirationDate: null,
    expirationBasis: null,
    status: 'unknown',
  };
  if (!isObject(warranty) || warranty.statedOnReceipt !== true) return unknown;

  const sourceText = cleanText(warranty.sourceText, 1000);
  if (!sourceText) {
    // A warranty claim without supporting receipt text may be invented.
    flag(path, 'A warranty was suggested without supporting receipt text; please confirm the terms.');
    return unknown;
  }

  let durationValue = cleanNumber(warranty.durationValue);
  let durationUnit = DURATION_UNITS.includes(warranty.durationUnit) ? warranty.durationUnit : null;
  if (durationValue !== null && !(Number.isInteger(durationValue) && durationValue > 0)) {
    flag(`${path}.durationValue`, 'The warranty length is not a whole positive number; please check it.');
    durationValue = null;
  }
  if ((durationValue === null) !== (durationUnit === null)) {
    flag(path, 'The warranty length is incomplete; please enter it.');
    durationValue = null;
    durationUnit = null;
  }

  const printed = date(warranty.expirationDate, `${path}.expirationDate`);
  const { expirationDate, basis } = resolveExpiration({ purchaseDate, durationValue, durationUnit, expirationDate: printed });
  return {
    statedOnReceipt: true,
    sourceText,
    durationValue,
    durationUnit,
    expirationDate,
    // On the server, an explicit expiration date can only come from the receipt.
    expirationBasis: basis === 'explicit' ? 'printed' : basis,
    status: warrantyStatus(expirationDate, today),
  };
}

function findMissingFields(receipt, items) {
  const missing = ['merchantName', 'purchaseDate', 'receiptNumber', 'currency', 'total']
    .filter((key) => receipt[key] === null)
    .map((key) => `receipt.${key}`);
  if (items.length === 0) missing.push('items');
  items.forEach((item, index) => {
    for (const key of ['description', 'quantity', 'totalPrice']) {
      if (item[key] === null) missing.push(`items[${index}].${key}`);
    }
    if (item.warranty.expirationDate === null) missing.push(`items[${index}].warranty`);
  });
  return missing;
}

function malformed() {
  return new AppError(502, 'analysis_malformed', 'The analysis service returned an unexpected result. Try again.', {
    category: 'provider_malformed_output',
  });
}
