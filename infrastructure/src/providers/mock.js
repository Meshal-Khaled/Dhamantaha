/**
 * Development stand-in for Gemini (ANALYSIS_PROVIDER=mock). Uploads still go
 * through every check and preparation step; only the AI call is replaced by a
 * fixed bilingual receipt, so the app can be built without spending quota.
 */
export function createMockProvider({ delayMs = 800 } = {}) {
  return {
    name: 'mock',
    async analyze({ signal, purpose }) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, delayMs);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(signal.reason);
        });
      });
      if (purpose === 'coverage') return { readable: true, coverage: { sourceText: 'Mock example: manufacturing defects are covered. Accidental damage is excluded.', covered: [{ summary: 'Mock example: manufacturing defects appear covered.', quote: 'manufacturing defects are covered.', reference: null }], excluded: [{ summary: 'Mock example: accidental damage is excluded.', quote: 'Accidental damage is excluded.', reference: null }], unclear: [] } };
      return {
        readable: true,
        receipt: {
          merchantName: 'مكتبة جرير - Jarir Bookstore',
          merchantEvidence: 'Mock data: the header prints the seller name; no mall is involved.',
          branchName: 'فرع العليا',
          customerServicePhone: '920000089',
          purchaseDate: '2026-10-01',
          receiptNumber: 'MOCK-0001',
          currency: 'SAR',
          total: 4148.5,
          warrantyNotes: null,
          returnPolicy: {
            sourceText: 'الاستبدال خلال ٧ أيام والاسترجاع خلال ٣ أيام مع الفاتورة الأصلية',
            returnDurationValue: 3,
            returnDurationUnit: 'days',
            exchangeDurationValue: 7,
            exchangeDurationUnit: 'days',
          },
        },
        items: [
          {
            description: 'LAPTOP 14" ULTRABOOK LN#UB@14 أجهزة الكمبيوتر',
            displayName: 'Laptop 14" Ultrabook',
            category: 'أجهزة الكمبيوتر',
            quantity: 1,
            unitPrice: 3999,
            totalPrice: 3999,
            productIdentifier: 'LN#UB@14',
            warranty: {
              statedOnReceipt: true,
              sourceText: 'ضمان سنتين / 2 years warranty',
              durationValue: 2,
              durationUnit: 'years',
              expirationDate: null,
              provider: 'Lenovo',
            },
          },
          {
            description: 'حقيبة لابتوب',
            displayName: 'حقيبة لابتوب',
            category: null,
            quantity: 2,
            unitPrice: 74.75,
            totalPrice: 149.5,
            productIdentifier: null,
            warranty: { statedOnReceipt: false, sourceText: null, durationValue: null, durationUnit: null, expirationDate: null, provider: null },
          },
        ],
        uncertainties: [{ field: 'receipt', note: 'Mock data: this result did not come from the uploaded file.' }],
      };
    },
  };
}
