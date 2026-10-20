import { AppError } from '../errors.js';
import { DURATION_UNITS, isValidDate, resolveExpiration, warrantyStatus } from '../wallet/warranty.js';

const MAX_ITEMS = 200;
const MAX_UNCERTAINTIES = 50;
const MAX_TEXT_LENGTH = 500;

// Arabic-Indic (U+0660–0669) and Extended Arabic-Indic (U+06F0–06F9) digits.
const ARABIC_INDIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;
const toWesternDigits = (value) => value.replace(ARABIC_INDIC_DIGITS, (d) => String(d.codePointAt(0) & 0x0f));
// Zero-width spaces, bidi marks, and byte-order marks that PDF text and OCR leave behind.
const INVISIBLE = /[\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

function cleanText(value, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== 'string') return null;
  // NFKC turns Arabic presentation forms (ﻣﻠﺤﻘﺎﺕ, common in PDF text) into ordinary letters.
  const trimmed = value.normalize('NFKC').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
  return trimmed === '' ? null : trimmed.slice(0, maxLength);
}

const nameKey = (value) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** True when two printed names refer to the same company, ignoring case, spacing, and punctuation. */
function sameCompany(a, b, { partial = false } = {}) {
  if (!a || !b) return false;
  const [x, y] = [nameKey(a), nameKey(b)];
  if (!x || !y) return false;
  if (x === y) return true;
  const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x];
  return partial && shorter.length >= 3 && longer.includes(shorter);
}

function cleanPhone(value, flag) {
  const printed = cleanText(value, 60);
  if (!printed) return null;
  // Keep the first number when several are printed together ("920000000 / 0112345678").
  const first = toWesternDigits(printed).split(/[/,|،;]| or | أو /)[0];
  const phone = first.replace(/[^\d+-]+/g, ' ').trim().replace(/^-+|-+$/g, '').trim();
  const digits = phone.replace(/\D/g, '').length;
  if (digits >= 4 && digits <= 15 && /^\+?\d[\d\s-]*$/.test(phone)) return phone;
  flag('receipt.customerServicePhone', `"${printed}" does not look like a phone number; please check it.`);
  return null;
}

/** A whole positive length with its unit, or both null. `label` names it in review notes. */
function cleanDuration(rawValue, rawUnit, { path, valuePath, label }, flag) {
  let value = cleanNumber(rawValue);
  const unit = DURATION_UNITS.includes(rawUnit) ? rawUnit : null;
  if (value !== null && !(Number.isInteger(value) && value > 0)) {
    flag(valuePath, `The ${label} is not a whole positive number; please check it.`);
    value = null;
  }
  if ((value === null) !== (unit === null)) {
    flag(path, `The ${label} is incomplete; please enter it.`);
    return { value: null, unit: null };
  }
  return { value, unit };
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

  const merchantName = cleanText(source.merchantName);
  const branchName = cleanText(source.branchName, 150);
  const receipt = {
    merchantName,
    branchName: sameCompany(branchName, merchantName) ? null : branchName,
    customerServicePhone: cleanPhone(source.customerServicePhone, flag),
    purchaseDate: date(source.purchaseDate, 'receipt.purchaseDate'),
    receiptNumber: cleanText(source.receiptNumber, 100),
    currency,
    total: cleanNumber(source.total),
    warrantyNotes: cleanText(source.warrantyNotes, 1000),
    returnPolicy: normalizeReturnPolicy(source.returnPolicy, flag),
  };

  const sourceItems = raw.items ?? [];
  if (sourceItems.length > MAX_ITEMS) flag('items', `Only the first ${MAX_ITEMS} items were kept.`);
  const context = { flag, date, merchantName, purchaseDate: receipt.purchaseDate, today };
  const items = sourceItems.slice(0, MAX_ITEMS).map((item, index) => normalizeItem(item, `items[${index}]`, context));

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
  const description = cleanText(source.description);
  return {
    description,
    displayName: cleanText(source.displayName, 150) ?? description,
    category: cleanText(source.category, 100),
    quantity: quantity !== null && quantity > 0 ? quantity : null,
    unitPrice: cleanNumber(source.unitPrice),
    totalPrice: cleanNumber(source.totalPrice),
    productIdentifier: cleanText(source.productIdentifier, 100),
    warranty: normalizeWarranty(source.warranty, `${path}.warranty`, context),
  };
}

function normalizeWarranty(warranty, path, { flag, date, merchantName, purchaseDate, today }) {
  const unknown = {
    statedOnReceipt: false,
    sourceText: null,
    durationValue: null,
    durationUnit: null,
    expirationDate: null,
    expirationBasis: null,
    status: 'unknown',
    provider: null,
  };
  if (!isObject(warranty) || warranty.statedOnReceipt !== true) return unknown;

  const sourceText = cleanText(warranty.sourceText, 1000);
  if (!sourceText) {
    // A warranty claim without supporting receipt text may be invented.
    flag(path, 'A warranty was suggested without supporting receipt text; please confirm the terms.');
    return unknown;
  }

  const { value: durationValue, unit: durationUnit } = cleanDuration(
    warranty.durationValue,
    warranty.durationUnit,
    { path, valuePath: `${path}.durationValue`, label: 'warranty length' },
    flag,
  );
  const printed = date(warranty.expirationDate, `${path}.expirationDate`);
  const { expirationDate, basis } = resolveExpiration({ purchaseDate, durationValue, durationUnit, expirationDate: printed });
  const provider = cleanText(warranty.provider, 150);
  return {
    statedOnReceipt: true,
    sourceText,
    durationValue,
    durationUnit,
    expirationDate,
    // On the server, an explicit expiration date can only come from the receipt.
    expirationBasis: basis === 'explicit' ? 'printed' : basis,
    status: warrantyStatus(expirationDate, today),
    // The app shows a provider only when someone other than the seller gives the warranty.
    provider: sameCompany(provider, merchantName, { partial: true }) ? null : provider,
  };
}

function normalizeReturnPolicy(policy, flag) {
  const none = {
    sourceText: null,
    returnDurationValue: null,
    returnDurationUnit: null,
    exchangeDurationValue: null,
    exchangeDurationUnit: null,
  };
  if (!isObject(policy)) return none;
  const sourceText = cleanText(policy.sourceText, 1000);
  if (!sourceText) {
    // As with warranties, a period without the printed policy may be invented.
    if (cleanNumber(policy.returnDurationValue) !== null || cleanNumber(policy.exchangeDurationValue) !== null) {
      flag('receipt.returnPolicy', 'A return period was suggested without supporting receipt text; please confirm the policy.');
    }
    return none;
  }
  const period = (kind) => cleanDuration(
    policy[`${kind}DurationValue`],
    policy[`${kind}DurationUnit`],
    { path: 'receipt.returnPolicy', valuePath: `receipt.returnPolicy.${kind}DurationValue`, label: `${kind} period` },
    flag,
  );
  const returns = period('return');
  const exchange = period('exchange');
  return {
    sourceText,
    returnDurationValue: returns.value,
    returnDurationUnit: returns.unit,
    exchangeDurationValue: exchange.value,
    exchangeDurationUnit: exchange.unit,
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
