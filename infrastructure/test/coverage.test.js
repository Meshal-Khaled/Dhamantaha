import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCoverage } from '../src/analysis/coverage.js';
import { normalizeProviderResponse } from '../src/analysis/normalize.js';
import { CoverageResponse } from '../src/contracts/coverage.js';
import { createGeminiProvider } from '../src/providers/gemini.js';
import { sampleProviderResponse, withServer, fakeProvider, makeImage, makePdf, uploadForm } from './helpers.js';

const sourceText = 'Clause 1: Manufacturing defects are covered for two years. Clause 2: Accidental damage is excluded. The original receipt is required.';
const coverage = { sourceText, covered: [{ summary: 'Manufacturing defects appear covered for two years.', quote: 'Manufacturing defects are covered for two years.', reference: 'Clause 1' }], excluded: [{ summary: 'Accidental damage is excluded.', quote: 'Accidental damage is excluded.', reference: 'Clause 2' }], unclear: [] };
const raw = { readable: true, coverage };

test('coverage drops fabricated quotes and references and preserves conditions and original source', () => {
  const checked = normalizeCoverage({ ...coverage, covered: [...coverage.covered, { summary: 'Water damage covered', quote: 'Water is covered' }], unclear: [{ summary: 'Check with provider', quote: 'The original receipt is required.', reference: 'Page 900' }] }, sourceText);
  assert.equal(checked.covered.length, 1);
  assert.equal(checked.unclear[0].reference, null);
  assert.equal(checked.sourceText, sourceText);
  assert.equal(normalizeCoverage(null), null);
});

test('receipt payload supports icons and coverage only with matching warranty evidence', () => {
  const response = sampleProviderResponse();
  response.items[0].icon = 'laptop';
  response.items[0].warranty.sourceText = sourceText;
  response.items[0].warranty.coverage = coverage;
  const checked = normalizeProviderResponse(response, { today: '2026-10-21' });
  assert.equal(checked.items[0].icon, 'laptop');
  assert.equal(checked.items[0].warranty.coverage.covered.length, 1);
  response.items[0].icon = '<script>';
  response.items[0].warranty.statedOnReceipt = false;
  const unknown = normalizeProviderResponse(response, { today: '2026-10-21' }).items[0];
  assert.equal(unknown.icon, 'package');
  assert.equal(unknown.warranty.coverage, null);
});

test('terms endpoint handles image and PDF, authenticates, and retains shared daily budget', async () => {
  let purpose;
  const provider = fakeProvider(input => { purpose = input.purpose; return raw; });
  await withServer({ provider, env: { CLIENT_KEYS: 'phone:abcdefghijklmnop12345678', DAILY_PROVIDER_CALL_LIMIT: '2' } }, async ({ baseUrl }) => {
    const post = async (file, key = 'abcdefghijklmnop12345678') => {
      const response = await fetch(`${baseUrl}/v1/warranty/explain`, { method: 'POST', headers: { 'X-Client-Key': key }, body: uploadForm(file) });
      return { status: response.status, body: await response.json() };
    };
    assert.equal((await post(await makeImage(), 'wrong-key')).status, 401);
    const image = await post(await makeImage());
    assert.equal(image.status, 200, JSON.stringify(image.body));
    assert.equal(purpose, 'coverage');
    assert.ok(CoverageResponse.safeParse(image.body).success);
    const pdf = await post(makePdf([[sourceText]]));
    assert.equal(pdf.status, 200, JSON.stringify(pdf.body));
    assert.equal(pdf.body.processingMethod, 'pdf_text');
    assert.equal(pdf.body.coverage.covered.length, 1);
    assert.equal((await post(await makeImage())).status, 503);
  });
});

test('terms endpoint falls back from unreadable PDF text and never invents missing coverage', async () => {
  const provider = fakeProvider((input, count) => count === 1 ? { readable: false, coverage: null } : raw);
  await withServer({ provider }, async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/v1/warranty/explain`, { method: 'POST', body: uploadForm(makePdf([[sourceText]])) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).processingMethod, 'pdf_visual');
  });
  await withServer({ provider: fakeProvider(() => ({ readable: false, coverage: null })) }, async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/v1/warranty/explain`, { method: 'POST', body: uploadForm(await makeImage()) });
    assert.equal(response.status, 422);
    assert.equal((await response.json()).error.code, 'unreadable_terms');
  });
});

test('Gemini terms mode uses its own instructions and schema rather than receipt extraction', async () => {
  let sent;
  const client = { models: { generateContent: async request => { sent = request; return { text: JSON.stringify(raw) }; } } };
  await createGeminiProvider({ apiKey: 'test', model: 'test', timeoutMs: 1000 }, { client }).analyze({ purpose: 'coverage', text: sourceText, product: 'Laptop', language: 'ar' });
  assert.match(sent.config.systemInstruction, /Do not use outside knowledge/);
  assert.match(sent.contents[0].parts[0].text, /Arabic/);
  assert.ok(sent.config.responseJsonSchema.properties.coverage);
});
