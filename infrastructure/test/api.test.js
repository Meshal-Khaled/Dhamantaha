import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AnalysisResponse, ErrorResponse, HealthResponse } from '../src/contracts/receipt.js';
import { AppError } from '../src/errors.js';
import { createDailyBudget } from '../src/http/protection.js';
import {
  RECEIPT_LINES,
  UNREADABLE_RESPONSE,
  analyze,
  fakeProvider,
  makeHeicLikeBytes,
  makeImage,
  makePdf,
  sampleProviderResponse,
  uploadForm,
  wait,
  waitFor,
  withServer,
} from './helpers.js';

const CLIENT_KEY = 'android-test-key-0123456789';

function assertError(result, status, code) {
  assert.equal(result.response.status, status, JSON.stringify(result.body));
  assert.equal(result.body.error.code, code);
  assert.ok(ErrorResponse.safeParse(result.body).success, 'error body matches the contract');
  assert.equal(result.body.error.requestId, result.response.headers.get('x-request-id'));
}

function assertAnalysis(result, processingMethod) {
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.processingMethod, processingMethod);
  assert.ok(AnalysisResponse.safeParse(result.body).success, 'response matches the contract');
  assert.equal(result.body.requestId, result.response.headers.get('x-request-id'));
  assert.equal(result.response.headers.get('cache-control'), 'no-store');
}

describe('service endpoints', () => {
  it('reports health and limits without calling the provider', async () => {
    const provider = fakeProvider();
    await withServer({ provider }, async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/health`);
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.ok(HealthResponse.safeParse(body).success);
      assert.equal(body.provider, 'mock');
      assert.equal(body.clientKeyRequired, false);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('x-powered-by'), null);
      assert.equal(provider.calls.length, 0);
    });
  });

  it('serves the OpenAPI document and the browser docs', async () => {
    await withServer({}, async ({ baseUrl }) => {
      const spec = await (await fetch(`${baseUrl}/openapi.json`)).json();
      assert.equal(spec.openapi, '3.1.0');
      assert.ok(spec.paths['/v1/receipts/analyze'].post);
      assert.ok(spec.components.schemas.AnalysisResponse);
      const docs = await fetch(`${baseUrl}/docs/`);
      assert.equal(docs.status, 200);
      assert.match(await docs.text(), /swagger-ui/);
    });
  });

  it('can turn the docs off', async () => {
    await withServer({ env: { ENABLE_API_DOCS: 'false' } }, async ({ baseUrl }) => {
      assert.equal((await fetch(`${baseUrl}/docs/`)).status, 404);
      assert.equal((await fetch(`${baseUrl}/openapi.json`)).status, 404);
    });
  });

  it('returns JSON 404s', async () => {
    await withServer({}, async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/v1/receipts`);
      assertError({ response, body: await response.json() }, 404, 'not_found');
    });
  });
});

describe('upload validation', () => {
  it('requires a configured provider', async () => {
    await withServer({ provider: null }, async ({ baseUrl }) => {
      assertError(await analyze(baseUrl, uploadForm(await makeImage())), 503, 'analysis_not_configured');
    });
  });

  it('requires a file', async () => {
    await withServer({}, async ({ baseUrl }) => {
      assertError(await analyze(baseUrl, new FormData()), 400, 'no_file');
    });
  });

  it('rejects a file under another field name', async () => {
    await withServer({}, async ({ baseUrl }) => {
      assertError(await analyze(baseUrl, uploadForm(await makeImage(), { field: 'photo' })), 400, 'invalid_upload');
    });
  });

  it('rejects unsupported contents whatever the declared type', async () => {
    const provider = fakeProvider();
    await withServer({ provider }, async ({ baseUrl }) => {
      const form = uploadForm(Buffer.from('GIF89a not a receipt'), { name: 'receipt.jpg', type: 'image/jpeg' });
      assertError(await analyze(baseUrl, form), 415, 'unsupported_file_type');
      assert.equal(provider.calls.length, 0);
    });
  });

  it('applies the overall size limit while reading', async () => {
    const provider = fakeProvider();
    await withServer({ provider, env: { MAX_IMAGE_BYTES: '2048', MAX_PDF_BYTES: '1024' } }, async ({ baseUrl }) => {
      assertError(await analyze(baseUrl, uploadForm(Buffer.alloc(4096, 1))), 413, 'file_too_large');
      assert.equal(provider.calls.length, 0);
    });
  });

  it('applies the PDF size limit separately from the photo limit', async () => {
    const provider = fakeProvider();
    await withServer({ provider, env: { MAX_PDF_BYTES: '1024' } }, async ({ baseUrl }) => {
      const pdf = makePdf([RECEIPT_LINES, RECEIPT_LINES, RECEIPT_LINES]);
      assert.ok(pdf.length > 1024);
      const result = await analyze(baseUrl, uploadForm(pdf));
      assertError(result, 413, 'file_too_large');
      assert.match(result.body.error.message, /PDF/);
      assertAnalysis(await analyze(baseUrl, uploadForm(await makeImage())), 'image');
    });
  });
});

describe('processing paths', () => {
  it('cleans up photos and analyzes them visually', async () => {
    const provider = fakeProvider();
    await withServer({ provider }, async ({ baseUrl }) => {
      const result = await analyze(baseUrl, uploadForm(await makeImage({ format: 'png' }), { name: 'photo.png' }));
      assertAnalysis(result, 'image');
      assert.equal(provider.calls[0].mimeType, 'image/jpeg');
      const [item] = result.body.items;
      assert.equal(item.warranty.expirationDate, '2028-10-01');
      assert.equal(item.warranty.expirationBasis, 'calculated');
      assert.deepEqual(result.body.review.missingFields, []);
    });
  });

  for (const format of ['webp', 'avif']) {
    it(`accepts ${format.toUpperCase()} photos and converts them to JPEG`, async () => {
      const provider = fakeProvider();
      await withServer({ provider }, async ({ baseUrl }) => {
        assertAnalysis(await analyze(baseUrl, uploadForm(await makeImage({ format }))), 'image');
        assert.equal(provider.calls[0].mimeType, 'image/jpeg');
      });
    });
  }

  it('passes HEIC photos that cannot be decoded straight to the provider', async () => {
    const provider = fakeProvider();
    const logLines = [];
    await withServer({ provider, logLines }, async ({ baseUrl }) => {
      assertAnalysis(await analyze(baseUrl, uploadForm(makeHeicLikeBytes())), 'image');
      assert.equal(provider.calls[0].mimeType, 'image/heic');
      await wait(20);
      assert.equal(logLines.find((l) => l.event === 'request' && l.processingMethod).imagePrepared, 'passthrough');
    });
  });

  it('sends extracted text, not the file, for readable PDFs', async () => {
    const provider = fakeProvider();
    await withServer({ provider }, async ({ baseUrl }) => {
      assertAnalysis(await analyze(baseUrl, uploadForm(makePdf([RECEIPT_LINES]))), 'pdf_text');
      assert.deepEqual(provider.calls.map((c) => c.kind), ['text']);
      assert.match(provider.calls[0].text, /Invoice No: INV-20261001-77/);
    });
  });

  it('analyzes scanned PDFs visually', async () => {
    const provider = fakeProvider();
    await withServer({ provider }, async ({ baseUrl }) => {
      assertAnalysis(await analyze(baseUrl, uploadForm(makePdf([null]))), 'pdf_visual');
      assert.equal(provider.calls[0].mimeType, 'application/pdf');
    });
  });

  it('keeps scanned pages of mixed PDFs by analyzing the whole PDF visually', async () => {
    const provider = fakeProvider();
    await withServer({ provider }, async ({ baseUrl }) => {
      assertAnalysis(await analyze(baseUrl, uploadForm(makePdf([RECEIPT_LINES, null]))), 'pdf_visual');
      assert.deepEqual(provider.calls.map((c) => c.kind), ['file']);
    });
  });

  it('falls back to visual analysis when the text yields no receipt', async () => {
    const provider = fakeProvider((input) => (input.text !== undefined ? UNREADABLE_RESPONSE : sampleProviderResponse()));
    await withServer({ provider }, async ({ baseUrl }) => {
      assertAnalysis(await analyze(baseUrl, uploadForm(makePdf([RECEIPT_LINES]))), 'pdf_visual');
      assert.deepEqual(provider.calls.map((c) => c.kind), ['text', 'file']);
    });
  });

  it('rejects PDFs over the page limit before analysis', async () => {
    const provider = fakeProvider();
    await withServer({ provider, env: { MAX_PDF_PAGES: '2' } }, async ({ baseUrl }) => {
      assertError(await analyze(baseUrl, uploadForm(makePdf([RECEIPT_LINES, RECEIPT_LINES, RECEIPT_LINES]))), 422, 'too_many_pages');
      assert.equal(provider.calls.length, 0);
    });
  });

  it('rejects damaged PDFs and images', async () => {
    await withServer({}, async ({ baseUrl }) => {
      assertError(await analyze(baseUrl, uploadForm(Buffer.from('%PDF-1.7\nbroken'))), 422, 'invalid_file');
      assertError(await analyze(baseUrl, uploadForm(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]))), 422, 'invalid_file');
    });
  });

  it('rejects images with too many pixels', async () => {
    await withServer({ env: { MAX_IMAGE_PIXELS: '10000' } }, async ({ baseUrl }) => {
      assertError(await analyze(baseUrl, uploadForm(await makeImage({ width: 200, height: 200 }))), 422, 'image_too_large');
    });
  });

  it('returns an actionable error when nothing can be read', async () => {
    await withServer({ provider: fakeProvider(() => UNREADABLE_RESPONSE) }, async ({ baseUrl }) => {
      assertError(await analyze(baseUrl, uploadForm(await makeImage())), 422, 'unreadable_receipt');
    });
  });
});

describe('provider failures', () => {
  it('returns 502 for malformed output', async () => {
    await withServer({ provider: fakeProvider(() => ['not', 'an', 'object']) }, async ({ baseUrl }) => {
      assertError(await analyze(baseUrl, uploadForm(await makeImage())), 502, 'analysis_malformed');
    });
  });

  it('passes quota errors through with Retry-After', async () => {
    const provider = fakeProvider(() => {
      throw new AppError(503, 'analysis_quota_exceeded', 'Usage limit reached.', { retryAfterSeconds: 60 });
    });
    await withServer({ provider }, async ({ baseUrl }) => {
      const result = await analyze(baseUrl, uploadForm(await makeImage()));
      assertError(result, 503, 'analysis_quota_exceeded');
      assert.equal(result.response.headers.get('retry-after'), '60');
    });
  });

  it('hides unexpected errors behind a generic 500', async () => {
    const provider = fakeProvider(() => {
      throw new Error('SECRET internal detail');
    });
    await withServer({ provider }, async ({ baseUrl }) => {
      const result = await analyze(baseUrl, uploadForm(await makeImage()));
      assertError(result, 500, 'internal_error');
      assert.doesNotMatch(JSON.stringify(result.body), /SECRET/);
    });
  });
});

describe('protection', () => {
  it('requires a known client key when keys are configured', async () => {
    const provider = fakeProvider();
    const logLines = [];
    await withServer({ provider, logLines, env: { CLIENT_KEYS: `android:${CLIENT_KEY}` } }, async ({ baseUrl }) => {
      const image = await makeImage();
      assertError(await analyze(baseUrl, uploadForm(image)), 401, 'unauthorized_client');
      assertError(await analyze(baseUrl, uploadForm(image), { headers: { 'X-Client-Key': 'wrong-key-0123456789' } }), 401, 'unauthorized_client');
      assert.equal(provider.calls.length, 0);

      assertAnalysis(await analyze(baseUrl, uploadForm(image), { headers: { 'X-Client-Key': CLIENT_KEY } }), 'image');
      await wait(20);
      const entry = logLines.find((l) => l.event === 'request' && l.status === 200);
      assert.equal(entry.client, 'android');
      assert.doesNotMatch(JSON.stringify(logLines), new RegExp(CLIENT_KEY));
    });
  });

  it('rate-limits each network', async () => {
    await withServer({ env: { RATE_LIMIT_PER_MINUTE: '2' } }, async ({ baseUrl }) => {
      const image = await makeImage();
      assertAnalysis(await analyze(baseUrl, uploadForm(image)), 'image');
      assertAnalysis(await analyze(baseUrl, uploadForm(image)), 'image');
      const limited = await analyze(baseUrl, uploadForm(image));
      assertError(limited, 429, 'rate_limited');
      assert.ok(Number(limited.response.headers.get('retry-after')) > 0);
    });
  });

  it('rate-limits by the real client address behind the tunnel', async () => {
    await withServer({ env: { RATE_LIMIT_PER_MINUTE: '1', TRUST_PROXY: 'loopback,uniquelocal' } }, async ({ baseUrl }) => {
      const image = await makeImage();
      const from = (ip) => ({ headers: { 'X-Forwarded-For': ip } });
      assertAnalysis(await analyze(baseUrl, uploadForm(image), from('203.0.113.7')), 'image');
      assertError(await analyze(baseUrl, uploadForm(image), from('203.0.113.7')), 429, 'rate_limited');
      // A different phone keeps its own allowance, and a spoofed earlier hop doesn't help.
      assertAnalysis(await analyze(baseUrl, uploadForm(image), from('198.51.100.20')), 'image');
      assertError(await analyze(baseUrl, uploadForm(image), from('1.2.3.4, 198.51.100.20')), 429, 'rate_limited');
    });
  });

  it('stops calling the provider once the daily budget is used', async () => {
    const provider = fakeProvider();
    const budget = createDailyBudget(1);
    await withServer({ provider, budget }, async ({ baseUrl }) => {
      const image = await makeImage();
      assertAnalysis(await analyze(baseUrl, uploadForm(image)), 'image');
      const refused = await analyze(baseUrl, uploadForm(image));
      assertError(refused, 503, 'daily_limit_reached');
      assert.ok(Number(refused.response.headers.get('retry-after')) > 0);
      assert.equal(provider.calls.length, 1);
      assert.deepEqual(budget.usage(), { limit: 1, used: 1 });
    });
  });

  it('refuses work over the concurrency limit without reading the upload', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const provider = fakeProvider(async () => {
      await gate;
      return sampleProviderResponse();
    });
    await withServer({ provider, env: { MAX_CONCURRENT_ANALYSES: '1' } }, async ({ baseUrl }) => {
      const image = await makeImage();
      const first = analyze(baseUrl, uploadForm(image));
      await waitFor(() => provider.calls.length === 1);

      assertError(await analyze(baseUrl, uploadForm(image)), 503, 'server_busy');
      release();
      assertAnalysis(await first, 'image');
      assertAnalysis(await analyze(baseUrl, uploadForm(image)), 'image');
    });
  });

  it('aborts the provider call and frees the slot when the phone disconnects', async () => {
    let providerSignal;
    const provider = fakeProvider((input, callNumber) =>
      callNumber > 1
        ? sampleProviderResponse()
        : new Promise((resolve, reject) => {
            providerSignal = input.signal;
            input.signal.addEventListener('abort', () => reject(input.signal.reason));
          }),
    );
    const logLines = [];
    await withServer({ provider, logLines, env: { MAX_CONCURRENT_ANALYSES: '1' } }, async ({ baseUrl }) => {
      const image = await makeImage();
      const controller = new AbortController();
      const pending = analyze(baseUrl, uploadForm(image), { signal: controller.signal });
      await waitFor(() => providerSignal);
      controller.abort();
      await assert.rejects(pending);

      await waitFor(() => providerSignal.aborted);
      assertAnalysis(await analyze(baseUrl, uploadForm(image)), 'image');
      assert.ok(logLines.some((l) => l.event === 'request' && l.aborted === true));
    });
  });

  it('allows only configured browser origins', async () => {
    await withServer({ env: { CORS_ORIGINS: 'https://localhost,http://localhost:5173' } }, async ({ baseUrl }) => {
      const allowed = await fetch(`${baseUrl}/health`, { headers: { Origin: 'https://localhost' } });
      assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://localhost');
      assert.match(allowed.headers.get('access-control-expose-headers'), /X-Request-Id/);

      const preflight = await fetch(`${baseUrl}/v1/receipts/analyze`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://localhost', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-client-key' },
      });
      assert.match(preflight.headers.get('access-control-allow-headers'), /X-Client-Key/i);

      const blocked = await fetch(`${baseUrl}/health`, { headers: { Origin: 'https://evil.example' } });
      assert.equal(blocked.headers.get('access-control-allow-origin'), null);
    });
  });
});

describe('privacy', () => {
  it('logs metadata only, never receipt content', async () => {
    const logLines = [];
    const provider = fakeProvider(() =>
      sampleProviderResponse({ receipt: { ...sampleProviderResponse().receipt, merchantName: 'SECRET-MERCHANT' } }),
    );
    await withServer({ provider, logLines }, async ({ baseUrl }) => {
      await analyze(baseUrl, uploadForm(makePdf([[...RECEIPT_LINES, 'SECRET-RECEIPT-LINE']]), { name: 'SECRET-NAME.pdf' }));
      await analyze(baseUrl, uploadForm(Buffer.from('SECRET-BAD-UPLOAD')));
      await wait(20);

      assert.doesNotMatch(JSON.stringify(logLines), /SECRET/);
      const requests = logLines.filter((l) => l.event === 'request');
      assert.equal(requests[0].processingMethod, 'pdf_text');
      assert.equal(requests[0].pdfPages, 1);
      assert.equal(requests[1].failure, 'unsupported_file_type');
    });
  });
});
