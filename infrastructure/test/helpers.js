import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';

// ---------------------------------------------------------------- fixtures

export function makeImage({ width = 400, height = 600, format = 'jpeg', alpha = false, exif } = {}) {
  let image = sharp({
    create: { width, height, channels: alpha ? 4 : 3, background: alpha ? { r: 0, g: 0, b: 0, alpha: 0 } : '#f4f4f4' },
  });
  if (exif) image = image.withExif(exif);
  return image.toFormat(format).toBuffer();
}

/** Bytes that identify as HEIC but that sharp's prebuilt build cannot decode. */
export function makeHeicLikeBytes() {
  const ftyp = Buffer.alloc(24);
  ftyp.writeUInt32BE(24, 0);
  ftyp.write('ftypheic', 4, 'latin1');
  ftyp.write('mif1heic', 16, 'latin1');
  return Buffer.concat([ftyp, Buffer.alloc(64, 0x11)]);
}

function escapePdfString(value) {
  return value.replace(/[\\()]/g, (ch) => `\\${ch}`);
}

/**
 * Builds a small valid PDF. Each page is an array of text lines, or null for a
 * page with drawing operations but no text (standing in for a scanned page).
 */
export function makePdf(pages) {
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const catalogId = add(null);
  const pagesId = add(null);
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds = pages.map((lines) => {
    const content = lines
      ? `BT /F1 12 Tf 50 780 Td 16 TL ${lines.map((line) => `(${escapePdfString(line)}) Tj T*`).join(' ')} ET`
      : '0.5 g 50 400 300 300 re f';
    const contentId = add(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`);
    return add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
  });
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let output = '%PDF-1.4\n';
  const offsets = objects.map((body, index) => {
    const offset = Buffer.byteLength(output, 'latin1');
    output += `${index + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xrefOffset = Buffer.byteLength(output, 'latin1');
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(output, 'latin1');
}

export const RECEIPT_LINES = [
  'eXtra Electronics - Riyadh',
  'Invoice No: INV-20261001-77',
  'Date: 2026-10-01',
  'Galaxy Phone S99   1 x 3,499.00 SAR',
  'Serial: SN-ABC-123',
  'Warranty: 2 years manufacturer warranty',
  'Total: 3,499.00 SAR',
];

export function sampleProviderResponse(overrides = {}) {
  return {
    readable: true,
    receipt: {
      merchantName: 'eXtra Electronics',
      branchName: 'Riyadh Park Branch',
      customerServicePhone: '920000000',
      purchaseDate: '2026-10-01',
      receiptNumber: 'INV-20261001-77',
      currency: 'SAR',
      total: 3499,
      warrantyNotes: null,
      returnPolicy: {
        sourceText: 'Exchange within 7 days, refund within 3 days with the original receipt.',
        returnDurationValue: 3,
        returnDurationUnit: 'days',
        exchangeDurationValue: 7,
        exchangeDurationUnit: 'days',
      },
    },
    items: [
      {
        description: 'Galaxy Phone S99',
        displayName: 'Galaxy Phone S99',
        category: null,
        quantity: 1,
        unitPrice: 3499,
        totalPrice: 3499,
        productIdentifier: 'SN-ABC-123',
        warranty: {
          statedOnReceipt: true,
          sourceText: 'Warranty: 2 years manufacturer warranty',
          durationValue: 2,
          durationUnit: 'years',
          expirationDate: null,
          provider: null,
        },
      },
    ],
    uncertainties: [],
    ...overrides,
  };
}

export const UNREADABLE_RESPONSE = {
  readable: false,
  receipt: { merchantName: null, purchaseDate: null, receiptNumber: null, currency: null, total: null, warrantyNotes: null },
  items: [],
  uncertainties: [],
};

// ---------------------------------------------------------------- server

/** A provider stand-in that records what it was sent. */
export function fakeProvider(handler = () => sampleProviderResponse()) {
  const calls = [];
  return {
    name: 'mock',
    calls,
    async analyze(input) {
      calls.push(
        input.text !== undefined
          ? { kind: 'text', text: input.text }
          : { kind: 'file', mimeType: input.mimeType, data: input.data },
      );
      return handler(input, calls.length);
    },
  };
}

/** Starts the app on an ephemeral port. `logLines` collects parsed log entries. */
export async function startServer({ env = {}, provider = fakeProvider(), logLines, budget } = {}) {
  const config = loadConfig({ GEMINI_TIMEOUT_MS: '5000', RATE_LIMIT_PER_MINUTE: '1000', ...env });
  const logger = createLogger({
    level: 'info',
    destination: { write: (line) => logLines?.push(JSON.parse(line)) },
  });
  const app = createApp({ config, provider, logger, budget });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}

export async function withServer(options, run) {
  const server = await startServer(options);
  try {
    await run(server);
  } finally {
    await server.close();
  }
}

export function uploadForm(bytes, { name = 'receipt.bin', type = 'application/octet-stream', field = 'file' } = {}) {
  const form = new FormData();
  form.append(field, new Blob([bytes], { type }), name);
  return form;
}

export async function analyze(baseUrl, form, { headers, signal } = {}) {
  const response = await fetch(`${baseUrl}/v1/receipts/analyze`, { method: 'POST', body: form, headers, signal });
  return { response, body: await response.json() };
}

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitFor(condition, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for condition.');
    await wait(5);
  }
}
