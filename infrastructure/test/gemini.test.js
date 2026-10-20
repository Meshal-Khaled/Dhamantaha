import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiError } from '@google/genai';
import { providerResponseSchema } from '../src/contracts/receipt.js';
import { ClientClosedError } from '../src/errors.js';
import { createGeminiProvider } from '../src/providers/gemini.js';
import { sampleProviderResponse } from './helpers.js';

const config = { apiKey: 'test-key', model: 'test-model', timeoutMs: 1000 };

function fakeClient(generateContent) {
  const requests = [];
  return {
    requests,
    models: {
      generateContent: async (request) => {
        requests.push(request);
        return generateContent(request);
      },
    },
  };
}

const ok = (body = sampleProviderResponse()) => ({ text: JSON.stringify(body), candidates: [{ finishReason: 'STOP' }] });
const hang = (request) =>
  new Promise((resolve, reject) => {
    request.config.abortSignal.addEventListener('abort', () => reject(new Error('aborted')));
  });

describe('Gemini provider', () => {
  it('sends photos inline with the response schema', async () => {
    const client = fakeClient(() => ok());
    const result = await createGeminiProvider(config, { client }).analyze({ data: Buffer.from('img'), mimeType: 'image/jpeg' });
    assert.deepEqual(result, sampleProviderResponse());

    const [request] = client.requests;
    assert.equal(request.model, 'test-model');
    assert.deepEqual(request.contents[0].parts[0], { inlineData: { mimeType: 'image/jpeg', data: Buffer.from('img').toString('base64') } });
    assert.equal(request.config.responseMimeType, 'application/json');
    assert.equal(request.config.responseJsonSchema, providerResponseSchema);
    assert.equal(request.config.temperature, 0);
  });

  it('sends extracted PDF text as text only', async () => {
    const client = fakeClient(() => ok());
    await createGeminiProvider(config, { client }).analyze({ text: 'Total: 10 SAR' });
    const { parts } = client.requests[0].contents[0];
    assert.equal(parts.length, 1);
    assert.match(parts[0].text, /<receipt_text>\nTotal: 10 SAR\n<\/receipt_text>/);
  });

  it('times out slow calls', async () => {
    const provider = createGeminiProvider({ ...config, timeoutMs: 50 }, { client: fakeClient(hang) });
    await assert.rejects(provider.analyze({ text: 'x' }), { status: 504, code: 'analysis_timeout' });
  });

  it('reports disconnects separately from timeouts', async () => {
    const controller = new AbortController();
    const pending = createGeminiProvider(config, { client: fakeClient(hang) }).analyze({ text: 'x', signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, ClientClosedError);
  });

  for (const [providerStatus, status, code] of [
    [429, 503, 'analysis_quota_exceeded'],
    [400, 422, 'unreadable_receipt'],
    [403, 502, 'analysis_unavailable'],
    [404, 502, 'analysis_unavailable'],
    [500, 502, 'analysis_unavailable'],
  ]) {
    it(`maps HTTP ${providerStatus} to ${code} without forwarding the provider message`, async () => {
      const client = fakeClient(() => {
        throw new ApiError({ message: '{"error":"PROVIDER-SECRET"}', status: providerStatus });
      });
      const error = await createGeminiProvider(config, { client })
        .analyze({ text: 'x' })
        .catch((err) => err);
      assert.equal(error.status, status);
      assert.equal(error.code, code);
      assert.doesNotMatch(error.message, /PROVIDER-SECRET/);
    });
  }

  it('maps network failures to analysis_unavailable', async () => {
    const client = fakeClient(() => {
      throw new TypeError('fetch failed');
    });
    await assert.rejects(createGeminiProvider(config, { client }).analyze({ text: 'x' }), {
      code: 'analysis_unavailable',
      category: 'provider_network',
    });
  });

  it('rejects truncated output', async () => {
    const client = fakeClient(() => ({ text: '{"readable":', candidates: [{ finishReason: 'MAX_TOKENS' }] }));
    await assert.rejects(createGeminiProvider(config, { client }).analyze({ text: 'x' }), {
      code: 'analysis_malformed',
      category: 'provider_finish_max_tokens',
    });
  });

  it('rejects output that is not JSON', async () => {
    const client = fakeClient(() => ({ text: 'Sure! Here it is.', candidates: [{ finishReason: 'STOP' }] }));
    await assert.rejects(createGeminiProvider(config, { client }).analyze({ text: 'x' }), { code: 'analysis_malformed' });
  });

  it('treats blocked prompts as unreadable', async () => {
    const client = fakeClient(() => ({ promptFeedback: { blockReason: 'OTHER' } }));
    await assert.rejects(createGeminiProvider(config, { client }).analyze({ text: 'x' }), { code: 'unreadable_receipt' });
  });
});
