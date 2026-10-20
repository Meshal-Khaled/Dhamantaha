import { z } from 'zod';
import { ACCEPTED_TYPES } from '../intake/fileType.js';
import { DURATION_UNITS } from '../wallet/warranty.js';

const text = (description) => z.string().nullable().describe(description);
const amount = (description) => z.number().nullable().describe(description);
const isoDate = (description) => z.iso.date().nullable().describe(description);

// ---------------------------------------------------------------- provider output

/** The shape Gemini must answer with. Validated again field by field in normalize.js. */
export const ProviderReceipt = z.object({
  readable: z.boolean().describe('True only if the document is a legible purchase receipt or invoice.'),
  receipt: z.object({
    merchantName: text('Store or seller name as printed.'),
    merchantEvidence: text('Printed text that identifies the seller, and why it is the seller rather than a mall or location. For debugging only; not returned to apps.'),
    purchaseDate: text('Gregorian purchase date as YYYY-MM-DD.'),
    receiptNumber: text('Receipt, invoice, or transaction number as printed.'),
    currency: text('ISO 4217 code such as SAR or USD.'),
    total: amount('Final amount paid.'),
    warrantyNotes: text('Warranty statements that apply to the whole receipt, quoted from the receipt.'),
  }),
  items: z.array(
    z.object({
      description: text('Product name or description as printed.'),
      quantity: amount('Quantity purchased.'),
      unitPrice: amount('Price per unit.'),
      totalPrice: amount('Line total.'),
      productIdentifier: text('SKU, model, serial number, or barcode as printed.'),
      warranty: z.object({
        statedOnReceipt: z.boolean().describe('True only if the receipt explicitly states a warranty for this item.'),
        sourceText: text('The exact receipt text that states the warranty.'),
        durationValue: amount('Warranty length as a number, only if stated.'),
        durationUnit: z.enum(DURATION_UNITS).nullable().describe('Unit of the warranty length.'),
        expirationDate: text('Warranty end date as YYYY-MM-DD, only if printed.'),
      }),
    }),
  ),
  uncertainties: z.array(
    z.object({
      field: z.string().describe('Field path, for example receipt.purchaseDate or items[0].unitPrice.'),
      note: z.string().describe('Why the value needs review.'),
    }),
  ),
});

/**
 * Gemini's JSON Schema support documents `anyOf` with `{ type: 'null' }` for
 * nullable values; Zod emits `type: [X, 'null']`. Rewrites the schema into
 * the documented form and drops `$schema`.
 */
export function toProviderJsonSchema(schema) {
  const visit = (node) => {
    if (Array.isArray(node)) return node.map(visit);
    if (node === null || typeof node !== 'object') return node;
    const { $schema, ...rest } = node;
    const out = Object.fromEntries(Object.entries(rest).map(([key, value]) => [key, visit(value)]));
    if (Array.isArray(out.type) && out.type.includes('null')) {
      const { type, description, ...constraints } = out;
      const nonNull = type.filter((t) => t !== 'null');
      return {
        ...(description ? { description } : {}),
        anyOf: [{ type: nonNull.length === 1 ? nonNull[0] : nonNull, ...constraints }, { type: 'null' }],
      };
    }
    return out;
  };
  return visit(z.toJSONSchema(schema));
}

export const providerResponseSchema = toProviderJsonSchema(ProviderReceipt);

// ---------------------------------------------------------------- API responses

const Uncertainty = z.object({ field: z.string(), note: z.string() });

export const WalletItem = z.object({
  description: text('Product name as printed.'),
  quantity: z.number().positive().nullable(),
  unitPrice: z.number().nullable(),
  totalPrice: z.number().nullable(),
  productIdentifier: text('SKU, model, serial number, or barcode.'),
  warranty: z.object({
    statedOnReceipt: z.boolean().describe('True only when the receipt explicitly states a warranty; the wording is in sourceText.'),
    sourceText: text('Exact receipt wording of the warranty.'),
    durationValue: z.number().int().positive().nullable(),
    durationUnit: z.enum(DURATION_UNITS).nullable(),
    expirationDate: isoDate('Printed, or calculated from purchaseDate + duration.'),
    expirationBasis: z.enum(['printed', 'calculated']).nullable(),
    status: z.enum(['active', 'expiring_soon', 'expired', 'unknown']),
  }),
});

export const AnalysisResponse = z.object({
  requestId: z.uuid(),
  processingMethod: z.enum(['image', 'pdf_text', 'pdf_visual']),
  receipt: z.object({
    merchantName: text('Store or seller name.'),
    purchaseDate: isoDate('Purchase date.'),
    receiptNumber: text('Receipt or invoice number.'),
    currency: z.string().regex(/^[A-Z]{3}$/).nullable().describe('ISO 4217 code.'),
    total: amount('Final amount paid.'),
    warrantyNotes: text('Receipt-wide warranty wording.'),
  }),
  items: z.array(WalletItem),
  review: z.object({
    missingFields: z.array(z.string()).describe('Field paths that are still null and need the user.'),
    uncertainties: z.array(Uncertainty).describe('Values the user should double-check.'),
  }),
});

export const ErrorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string().describe('Safe to show to the user.'),
    requestId: z.uuid(),
  }),
});

export const HealthResponse = z.object({
  status: z.literal('ok'),
  provider: z.enum(['gemini', 'mock']).nullable(),
  clientKeyRequired: z.boolean(),
  limits: z.object({
    acceptedTypes: z.array(z.enum(ACCEPTED_TYPES)),
    maxImageBytes: z.number().int(),
    maxPdfBytes: z.number().int(),
    maxPdfPages: z.number().int(),
  }),
});

/** Response schemas published as OpenAPI components. */
export const apiSchemas = z.registry();
AnalysisResponse.register(apiSchemas, { id: 'AnalysisResponse' });
ErrorResponse.register(apiSchemas, { id: 'ErrorResponse' });
HealthResponse.register(apiSchemas, { id: 'HealthResponse' });
