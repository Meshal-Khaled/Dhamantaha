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
    });
    assert.deepEqual(result.review, { missingFields: [], uncertainties: [] });
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
