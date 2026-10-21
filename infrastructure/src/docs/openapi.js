import { z } from 'zod';
import { apiSchemas } from '../contracts/receipt.js';
import { ACCEPTED_TYPES } from '../intake/fileType.js';

const ref = (id) => ({ $ref: `#/components/schemas/${id}` });
const json = (schema, description) => ({ description, content: { 'application/json': { schema } } });
const error = (description) => json(ref('ErrorResponse'), description);

/** OpenAPI 3.1 document built from the Zod contracts, served at /openapi.json and /docs. */
export function buildOpenApi(config) {
  const { schemas } = z.toJSONSchema(apiSchemas, { uri: (id) => `#/components/schemas/${id}` });
  for (const schema of Object.values(schemas)) {
    delete schema.$schema;
    delete schema.$id;
  }
  const keyRequired = config.clientKeys.length > 0;

  return {
    openapi: '3.1.0',
    info: {
      title: 'Dhamantaha infrastructure',
      version: '1.0.0',
      description:
        'Turns a photo or PDF of a bill into wallet-ready receipt and warranty data. Nothing is stored on the server; the app saves the reviewed result on the phone.',
    },
    components: {
      schemas,
      ...(keyRequired ? { securitySchemes: { clientKey: { type: 'apiKey', in: 'header', name: 'X-Client-Key' } } } : {}),
    },
    paths: {
      '/v1/warranty/explain': {
        post: {
          summary: 'Explain attached warranty terms with supporting quotations',
          description: 'One terms photo or PDF. Summaries use only supplied terms; uploads are processed in memory. Same authentication, rate, file, concurrency and daily provider limits as receipt analysis.',
          ...(keyRequired ? { security: [{ clientKey: [] }] } : {}),
          requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' }, product: { type: 'string', maxLength: 150 }, language: { type: 'string', enum: ['en', 'ar'] } } } } } },
          responses: { 200: json(ref('CoverageResponse'), 'Covered, excluded, and unclear points with exact source quotes.'), 401: error('Unauthorized client.'), 413: error('File too large.'), 422: error('Unreadable terms or invalid file.'), 429: error('Rate limited.'), 502: error('Analysis unavailable.'), 503: error('Budget reached or busy.'), 504: error('Analysis timeout.') },
        },
      },
      '/v1/usage': {
        post: {
          summary: 'Report app usage counts',
          description: 'The app reports visits (`app_visit`), saved receipt reopens (`receipt_refetch`) and original-file opens/downloads (`original_download`). Counters only, tied to a random install ID, shown on the Users dashboard. Receipt analysis counts are recorded by the server instead.',
          ...(keyRequired ? { security: [{ clientKey: [] }] } : {}),
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['deviceId', 'events'], properties: { deviceId: { type: 'string', pattern: '^[A-Za-z0-9-]{16,64}$' }, events: { type: 'object', additionalProperties: false, minProperties: 1, properties: { app_visit: { type: 'integer', minimum: 1, maximum: 100 }, receipt_refetch: { type: 'integer', minimum: 1, maximum: 100 }, original_download: { type: 'integer', minimum: 1, maximum: 100 } } } } } } } },
          responses: { 202: json({ type: 'object', properties: { ok: { type: 'boolean' } } }, 'Counts recorded.'), 400: error('Invalid report.'), 401: error('Unauthorized client.'), 429: error('Rate limited.') },
        },
      },
      '/health': {
        get: {
          summary: 'Check that the service is running',
          description: 'Does not call the analysis provider.',
          responses: { 200: json(ref('HealthResponse'), 'Service is up.') },
        },
      },
      '/v1/receipts/analyze': {
        post: {
          summary: 'Analyze a receipt',
          parameters: [{ name: 'X-Install-Id', in: 'header', required: false, description: 'Anonymous app install ID for per-user analysis counting. Without it, the request contributes to the unassigned total.', schema: { type: 'string', pattern: '^[A-Za-z0-9-]{16,64}$' } }],
          description: `Upload one receipt photo or PDF. Accepted: ${ACCEPTED_TYPES.join(', ')}. The type is detected from the file contents.`,
          ...(keyRequired ? { security: [{ clientKey: [] }] } : {}),
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['file'],
                  properties: { file: { type: 'string', format: 'binary', description: 'The receipt photo or PDF.' } },
                },
              },
            },
          },
          responses: {
            200: json(ref('AnalysisResponse'), 'Wallet-ready draft for the user to review.'),
            400: error('`no_file` or `invalid_upload`.'),
            401: error('`unauthorized_client`: missing or unknown X-Client-Key.'),
            413: error('`file_too_large`.'),
            415: error('`unsupported_file_type`.'),
            422: error('`invalid_file`, `pdf_password_protected`, `too_many_pages`, `image_too_large`, or `unreadable_receipt`.'),
            429: error('`rate_limited`; see Retry-After.'),
            502: error('`analysis_malformed` or `analysis_unavailable`.'),
            503: error('`analysis_quota_exceeded`, `daily_limit_reached`, `server_busy`, or `analysis_not_configured`; see Retry-After.'),
            504: error('`analysis_timeout`.'),
          },
        },
      },
    },
  };
}
