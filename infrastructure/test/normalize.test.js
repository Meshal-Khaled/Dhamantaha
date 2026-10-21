import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeProviderResponse } from '../src/analysis/normalize.js';
import { providerResponseSchema } from '../src/contracts/receipt.js';
import { sampleProviderResponse } from './helpers.js';

const TODAY = '2026-10-20';
const normalize = (raw) => normalizeProviderResponse(raw, { today: TODAY });
const withReceipt = (receipt) => sampleProviderResponse({ receipt: { ...sampleProviderResponse().receipt, ...receipt } });
const withWarranty = (warranty) => {
  const response = sampleProviderResponse();
  response.items[0].warranty = { ...response.items[0].warranty, ...warranty };
  return response;
};
const flagged = (result) => result.review.uncertainties.map((u) => u.field);

describe('normalizeProviderResponse', () => {
  it('turns a valid response into a wallet-ready entry', () => {
    const result = normalize(sampleProviderResponse());
    assert.equal(result.readable, true);
    assert.deepEqual(result.receipt, sampleProviderResponse().receipt);
    assert.deepEqual(result.items[0].warranty, {
      statedOnReceipt: true,
      sourceText: 'Warranty: 2 years manufacturer warranty',
      durationValue: 2,
      durationUnit: 'years',
      expirationDate: '2028-10-01',
      expirationBasis: 'calculated',
      status: 'active',
      provider: null,
      coverage: null,
    });
    assert.deepEqual(result.review, { missingFields: [], uncertainties: [] });
  });

  it('separates the readable product name from codes and category labels', () => {
    const response = sampleProviderResponse();
    response.items[0] = {
      ...response.items[0],
      // Arabic presentation forms, as PDF text extraction often yields them.
      description: 'MAGSAFE PHONE GRIP/STAND BL#WP@7 ﻣﻠﺤﻘﺎﺕ ﺍﻟﻬﻮﺍﺗﻒ ﺍﻟﺬﻛﻴﺔ',
      displayName: ' MagSafe Phone Grip/Stand‏ ',
      category: 'ﻣﻠﺤﻘﺎﺕ ﺍﻟﻬﻮﺍﺗﻒ ﺍﻟﺬﻛﻴﺔ',
      productIdentifier: 'BL#WP@7',
    };
    const [item] = normalize(response).items;
    assert.equal(item.displayName, 'MagSafe Phone Grip/Stand');
    assert.equal(item.category, 'ملحقات الهواتف الذكية');
    assert.equal(item.description, 'MAGSAFE PHONE GRIP/STAND BL#WP@7 ملحقات الهواتف الذكية');
    assert.equal(item.productIdentifier, 'BL#WP@7');
  });

  it('falls back to the printed description when no display name is given', () => {
    const response = sampleProviderResponse();
    delete response.items[0].displayName;
    assert.equal(normalize(response).items[0].displayName, 'Galaxy Phone S99');
  });

  it('keeps branch and customer service details, and drops a branch that repeats the merchant', () => {
    const result = normalize(withReceipt({ customerServicePhone: 'هاتف: ٩٢٠٠٠٠٠٠٠ / 0112345678' }));
    assert.equal(result.receipt.branchName, 'Riyadh Park Branch');
    assert.equal(result.receipt.customerServicePhone, '920000000');
    assert.equal(normalize(withReceipt({ branchName: 'EXTRA electronics' })).receipt.branchName, null);
    assert.equal(normalize(withReceipt({ customerServicePhone: '+966 11 234-5678' })).receipt.customerServicePhone, '+966 11 234-5678');
  });

  it('nulls a customer service value that is not a phone number', () => {
    const result = normalize(withReceipt({ customerServicePhone: 'Visit our website' }));
    assert.equal(result.receipt.customerServicePhone, null);
    assert.deepEqual(flagged(result), ['receipt.customerServicePhone']);
  });

  it('keeps a printed return policy with its return and exchange periods', () => {
    assert.deepEqual(normalize(sampleProviderResponse()).receipt.returnPolicy, sampleProviderResponse().receipt.returnPolicy);
  });

  it('drops return periods without printed policy text, and incomplete periods', () => {
    const invented = normalize(withReceipt({ returnPolicy: { sourceText: null, returnDurationValue: 14, returnDurationUnit: 'days' } }));
    assert.deepEqual(invented.receipt.returnPolicy, {
      sourceText: null,
      returnDurationValue: null,
      returnDurationUnit: null,
      exchangeDurationValue: null,
      exchangeDurationUnit: null,
    });
    assert.deepEqual(flagged(invented), ['receipt.returnPolicy']);
    const partial = normalize(withReceipt({ returnPolicy: { sourceText: 'No refunds after 3 days.', returnDurationValue: 3, returnDurationUnit: null } }));
    assert.equal(partial.receipt.returnPolicy.sourceText, 'No refunds after 3 days.');
    assert.equal(partial.receipt.returnPolicy.returnDurationValue, null);
    assert.equal(normalize(withReceipt({ returnPolicy: null })).receipt.returnPolicy.sourceText, null);
  });

  it('names a warranty provider only when it is not the seller', () => {
    assert.equal(normalize(withWarranty({ provider: 'Samsung Saudi Arabia' })).items[0].warranty.provider, 'Samsung Saudi Arabia');
    assert.equal(normalize(withWarranty({ provider: 'eXtra' })).items[0].warranty.provider, null);
    assert.equal(normalize(withWarranty({ provider: 'Samsung', statedOnReceipt: false })).items[0].warranty.provider, null);
  });

  it('prefers a printed expiration date', () => {
    const result = normalize(withWarranty({ durationValue: null, durationUnit: null, expirationDate: '2026-11-01' }));
    assert.equal(result.items[0].warranty.expirationDate, '2026-11-01');
    assert.equal(result.items[0].warranty.expirationBasis, 'printed');
    assert.equal(result.items[0].warranty.status, 'expiring_soon');
  });

  it('rejects responses without the expected structure', () => {
    for (const raw of [null, 'text', [], { receipt: 'x' }, { items: {} }]) {
      assert.throws(() => normalize(raw), { code: 'analysis_malformed' });
    }
  });

  it('nulls impossible dates and flags them', () => {
    const result = normalize(withReceipt({ purchaseDate: '2026-02-30' }));
    assert.equal(result.receipt.purchaseDate, null);
    assert.deepEqual(flagged(result), ['receipt.purchaseDate']);
    assert.ok(result.review.missingFields.includes('receipt.purchaseDate'));
    // No purchase date means no calculated expiration.
    assert.equal(result.items[0].warranty.expirationDate, null);
    assert.equal(result.items[0].warranty.status, 'unknown');
  });

  it('converts Arabic-Indic digits in numbers and dates', () => {
    const result = normalize(withReceipt({ total: '٣٬٤٩٩٫٥٠', purchaseDate: '٢٠٢٦-١٠-٠١' }));
    assert.equal(result.receipt.total, 3499.5);
    assert.equal(result.receipt.purchaseDate, '2026-10-01');
  });

  it('accepts only ISO currency codes', () => {
    assert.equal(normalize(withReceipt({ currency: 'sar' })).receipt.currency, 'SAR');
    const result = normalize(withReceipt({ currency: 'ر.س' }));
    assert.equal(result.receipt.currency, null);
    assert.deepEqual(flagged(result), ['receipt.currency']);
  });

  it('keeps warranty terms only when the receipt states them', () => {
    const result = normalize(withWarranty({ statedOnReceipt: false }));
    assert.equal(result.items[0].warranty.statedOnReceipt, false);
    assert.equal(result.items[0].warranty.durationValue, null);
    assert.equal(result.items[0].warranty.status, 'unknown');
    assert.ok(result.review.missingFields.includes('items[0].warranty'));
  });

  it('discards a warranty claim without supporting receipt text', () => {
    const result = normalize(withWarranty({ sourceText: '  ' }));
    assert.equal(result.items[0].warranty.statedOnReceipt, false);
    assert.equal(result.items[0].warranty.expirationDate, null);
    assert.deepEqual(flagged(result), ['items[0].warranty']);
  });

  it('drops incomplete or fractional warranty lengths', () => {
    assert.equal(normalize(withWarranty({ durationUnit: null })).items[0].warranty.durationValue, null);
    const fractional = normalize(withWarranty({ durationValue: 1.5 })).items[0].warranty;
    assert.equal(fractional.durationValue, null);
    assert.equal(fractional.durationUnit, null);
  });

  it('flags non-positive quantities', () => {
    const response = sampleProviderResponse();
    response.items[0].quantity = 0;
    const result = normalize(response);
    assert.equal(result.items[0].quantity, null);
    assert.ok(flagged(result).includes('items[0].quantity'));
  });

  it('keeps provider uncertainties and tidies text', () => {
    const response = withReceipt({ merchantName: '  مكتبة   جرير  ' });
    response.uncertainties = [{ field: 'receipt.total', note: 'Total is smudged.' }, { field: '', note: 'ignored' }];
    const result = normalize(response);
    assert.equal(result.receipt.merchantName, 'مكتبة جرير');
    assert.deepEqual(result.review.uncertainties, [{ field: 'receipt.total', note: 'Total is smudged.' }]);
  });

  it('treats a response with no content as unreadable', () => {
    const result = normalize({ readable: true, receipt: {}, items: [], uncertainties: [] });
    assert.equal(result.readable, false);
    assert.ok(result.review.missingFields.includes('items'));
  });
});

describe('providerResponseSchema', () => {
  it('uses anyOf for nullable values and no $schema keyword', () => {
    const text = JSON.stringify(providerResponseSchema);
    assert.doesNotMatch(text, /"type":\[/);
    assert.doesNotMatch(text, /\$schema/);
    assert.deepEqual(providerResponseSchema.properties.receipt.properties.total.anyOf, [{ type: 'number' }, { type: 'null' }]);
    assert.deepEqual(providerResponseSchema.required, ['readable', 'receipt', 'items', 'uncertainties']);
  });
});
