import { z } from 'zod';

export const ITEM_ICONS = ['package', 'laptop', 'phone', 'tablet', 'headphones', 'watch', 'camera', 'tv', 'printer', 'gamepad', 'appliance', 'shirt', 'bag', 'shoes', 'jewelry', 'furniture', 'tool', 'cable'];
const point = z.object({
  summary: z.string().describe('Short plain-language explanation, preserving all conditions and qualifications.'),
  quote: z.string().describe('An exact verbatim quote from sourceText supporting this point.'),
  reference: z.string().nullable().describe('Printed clause heading or page label, only if present; otherwise null.'),
});
export const Coverage = z.object({
  sourceText: z.string().describe('Verbatim warranty terms, with no invented text.'),
  covered: z.array(point),
  excluded: z.array(point),
  unclear: z.array(point),
});
export const ProviderCoverage = z.object({ readable: z.boolean(), coverage: Coverage.nullable() });
export const CoverageResponse = z.object({ requestId: z.uuid(), processingMethod: z.enum(['image', 'pdf_text', 'pdf_visual']), coverage: Coverage });
