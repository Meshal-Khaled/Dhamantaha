import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request } from 'node:https';
import { AppError, ClientClosedError } from '../errors.js';
import { SYSTEM_INSTRUCTION, VISUAL_PROMPT, textPrompt } from '../analysis/prompts.js';
import { COVERAGE_INSTRUCTION } from '../analysis/coverage.js';
import { ProviderCoverage } from '../contracts/coverage.js';
import { providerResponseSchema, toProviderJsonSchema } from '../contracts/receipt.js';
import { presetFor } from './catalog.js';

const invalidUrl = () => new AppError(400, 'invalid_settings', 'Use a public HTTPS API base URL without credentials, query, or fragment.');
export function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99)))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  // Only global-unicast IPv6; mapped IPv4, local, link-local and multicast are excluded.
  return isIP(address) === 6 && /^[23]/.test(address) && !/^2001:(db8|0:|1[0-9]:|2:)/i.test(address) && !/^2002:/i.test(address);
}
export function cleanBaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw invalidUrl(); }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || !host.includes('.') && !isIP(host) || (isIP(host) && !publicAddress(host))) throw invalidUrl();
  return url.href.replace(/\/+$/, '');
}

/** Resolve once and pin the checked address for this TLS connection. Never follow redirects. */
export async function providerJson(url, { apiKey, protocol, body, signal, resolve = lookup, requestImpl = request } = {}) {
  const target = new URL(cleanBaseUrl(url));
  signal?.throwIfAborted();
  const addresses = await new Promise((done, fail) => {
    const aborted = () => fail(signal.reason);
    signal?.addEventListener('abort', aborted, { once: true });
    Promise.resolve().then(() => resolve(target.hostname.replace(/^\[|\]$/g, ''), { all: true, verbatim: true }))
      .then(done, fail).finally(() => signal?.removeEventListener('abort', aborted));
  });
  if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) throw invalidUrl();
  const chosen = addresses[0];
  return new Promise((done, fail) => {
    const req = requestImpl(target, {
      method: body === undefined ? 'GET' : 'POST', signal,
      lookup: (_host, options, cb) => options?.all ? cb(null, [chosen]) : cb(null, chosen.address, chosen.family),
      headers: { 'Content-Type': 'application/json', ...(protocol === 'anthropic'
        ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } : { Authorization: `Bearer ${apiKey}` }) },
    }, (res) => {
      let length = 0;
      const chunks = [];
      res.on('error', fail);
      res.on('data', (chunk) => {
        length += chunk.length;
        if (length > 2 * 1024 * 1024) req.destroy(new Error('Provider response exceeded limit'));
        else chunks.push(chunk);
      });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const status = res.statusCode;
          return fail(new AppError(status === 429 ? 503 : 502, status === 429 ? 'analysis_quota_exceeded' : 'analysis_unavailable',
            'The analysis provider could not complete this request. Check its key, model, and availability.',
            { category: [401, 403].includes(status) ? 'provider_auth' : `provider_http_${status}` }));
        }
        try { done(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { fail(new AppError(502, 'analysis_malformed', 'The analysis provider returned invalid JSON.')); }
      });
    });
    req.on('error', fail);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

export function createRemoteProvider(settings, { send = providerJson, timeoutMs = 60000 } = {}) {
  const preset = presetFor(settings.type);
  const { baseUrl, apiKey, model } = settings;
  const protocol = preset.protocol;
  const call = async (path, body, signal, deadlineAt) => {
    const timeout = AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, (deadlineAt ?? Infinity) - Date.now())));
    try {
      return await send(`${baseUrl}${path}`, { apiKey, protocol, body, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    } catch (error) {
      if (signal?.aborted) throw new ClientClosedError();
      if (timeout.aborted) throw new AppError(504, 'analysis_timeout', 'The analysis took too long. Try again.', { category: 'provider_timeout' });
      if (error instanceof AppError) throw error;
      throw new AppError(502, 'analysis_unavailable', 'Could not reach the analysis provider.', { category: 'provider_network' });
    }
  };
  return {
    name: settings.type === 'custom' ? settings.id : settings.type,
    async check() {
      const response = await call('/models', undefined);
      const models = response.data;
      if (!Array.isArray(models) || !models.some((entry) => entry.id === model)) {
        throw new AppError(502, 'provider_check_failed', 'This model was not listed for the saved key. Check the model ID.');
      }
      return { ok: true, message: 'The provider accepted the key and lists this model. Input support depends on the selected model.' };
    },
    async analyze({ text, data, mimeType, purpose, product, language, signal, deadlineAt }) {
      const coverage = purpose === 'coverage';
      const schema = coverage ? toProviderJsonSchema(ProviderCoverage) : providerResponseSchema;
      const instruction = `${coverage ? COVERAGE_INSTRUCTION : SYSTEM_INSTRUCTION}\nReturn only a JSON object matching this schema:\n${JSON.stringify(schema)}`;
      const prompt = coverage
        ? `Explain only the attached terms in ${language === 'ar' ? 'Arabic' : 'English'}. Product context (not evidence): ${JSON.stringify(String(product ?? '').slice(0, 150))}.\n${text !== undefined ? `<terms_text>\n${text}\n</terms_text>` : ''}`
        : text !== undefined ? textPrompt(text) : VISUAL_PROMPT;
      if (data && !(mimeType === 'application/pdf' ? preset.pdf : preset.images)) {
        throw new AppError(422, 'unreadable_receipt', 'This provider does not support this visual input. Use a supported photo or select a provider that accepts PDFs.');
      }
      let body;
      if (protocol === 'anthropic') {
        const content = [{ type: 'text', text: prompt }];
        if (data) content.unshift({ type: mimeType === 'application/pdf' ? 'document' : 'image', source: { type: 'base64', media_type: mimeType, data: data.toString('base64') } });
        body = { model, max_tokens: 8192, system: instruction, messages: [{ role: 'user', content }] };
      } else {
        const content = [{ type: 'text', text: prompt }];
        if (data) content.push(mimeType === 'application/pdf'
          ? { type: 'file', file: { filename: 'document.pdf', file_data: `data:application/pdf;base64,${data.toString('base64')}` } }
          : { type: 'image_url', image_url: { url: `data:${mimeType};base64,${data.toString('base64')}` } });
        body = { model, messages: [{ role: 'system', content: instruction }, { role: 'user', content }], response_format: { type: 'json_object' } };
      }
      const response = await call(protocol === 'anthropic' ? '/messages' : '/chat/completions', body, signal, deadlineAt);
      const finish = protocol === 'anthropic' ? response.stop_reason : response.choices?.[0]?.finish_reason;
      if (finish && !['stop', 'end_turn'].includes(finish)) throw new AppError(502, 'analysis_malformed', 'The provider returned an incomplete result.');
      const result = protocol === 'anthropic' ? response.content?.filter((part) => part.type === 'text').map((part) => part.text).join('') : response.choices?.[0]?.message?.content;
      try { return JSON.parse(String(result ?? '').replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '')); }
      catch { throw new AppError(502, 'analysis_malformed', 'The provider returned an unexpected result.'); }
    },
  };
}
