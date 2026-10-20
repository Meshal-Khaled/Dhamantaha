/**
 * Development stand-in for Gemini (ANALYSIS_PROVIDER=mock). Uploads still go
 * through every check and preparation step; only the AI call is replaced by a
 * fixed bilingual receipt, so the app can be built without spending quota.
 */
export function createMockProvider({ delayMs = 800 } = {}) {
  return {
    name: 'mock',
    async analyze({ signal }) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, delayMs);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(signal.reason);
        });
      });
      return {
        readable: true,
        receipt: {
          merchantName: 'مكتبة جرير - Jarir Bookstore',
          purchaseDate: '2026-10-01',
          receiptNumber: 'MOCK-0001',
          currency: 'SAR',
          total: 4148.5,
          warrantyNotes: null,
        },
        items: [
          {
            description: 'Laptop 14"',
            quantity: 1,
            unitPrice: 3999,
            totalPrice: 3999,
            productIdentifier: 'SN-MOCK-123',
            warranty: {
              statedOnReceipt: true,
              sourceText: 'ضمان سنتين / 2 years warranty',
              durationValue: 2,
              durationUnit: 'years',
              expirationDate: null,
            },
          },
          {
            description: 'حقيبة لابتوب',
            quantity: 1,
            unitPrice: 149.5,
            totalPrice: 149.5,
            productIdentifier: null,
            warranty: { statedOnReceipt: false, sourceText: null, durationValue: null, durationUnit: null, expirationDate: null },
          },
        ],
        uncertainties: [{ field: 'receipt', note: 'Mock data: this result did not come from the uploaded file.' }],
      };
    },
  };
}
