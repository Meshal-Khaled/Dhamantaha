import { ApiError, GoogleGenAI } from '@google/genai';
import { SYSTEM_INSTRUCTION, VISUAL_PROMPT, textPrompt } from '../analysis/prompts.js';
import { providerResponseSchema, toProviderJsonSchema } from '../contracts/receipt.js';
import { ProviderCoverage } from '../contracts/coverage.js';
import { COVERAGE_INSTRUCTION } from '../analysis/coverage.js';
import { AppError, ClientClosedError } from '../errors.js';

/**
 * Gemini receipt analysis. The API key comes from server configuration and is
 * used only in requests from The Ring to Gemini. The SDK does not retry unless
 * `retryOptions` is set, so one request is one billed call.
 *
 * `analyze` accepts `{ text }` or `{ data, mimeType }` and resolves to the
 * parsed JSON; normalize.js validates the fields.
 */
export function createGeminiProvider({ apiKey, model, timeoutMs }, { client } = {}) {
  const ai = client ?? new GoogleGenAI({ apiKey });

  return {
    name: 'gemini',
    async analyze({ text, data, mimeType, signal, purpose, product, language }) {
      const coverage = purpose === 'coverage';
      const termsPrompt = `Explain the attached warranty terms. Output summaries in ${language === 'ar' ? 'Arabic' : 'English'}. Product label (context only, not evidence): ${JSON.stringify(String(product ?? '').slice(0, 150))}.`;
      const parts =
        text !== undefined
          ? [{ text: coverage ? `${termsPrompt}\n<terms_text>\n${text}\n</terms_text>` : textPrompt(text) }]
          : [{ inlineData: { mimeType, data: data.toString('base64') } }, { text: coverage ? termsPrompt : VISUAL_PROMPT }];

      const timeout = AbortSignal.timeout(timeoutMs);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

      let response;
      try {
        response = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts }],
          config: {
            systemInstruction: coverage ? COVERAGE_INSTRUCTION : SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseJsonSchema: coverage ? toProviderJsonSchema(ProviderCoverage) : providerResponseSchema,
            temperature: 0,
            abortSignal: combined,
          },
        });
      } catch (err) {
        if (signal?.aborted) throw new ClientClosedError();
        if (timeout.aborted) {
          throw new AppError(504, 'analysis_timeout', 'The analysis took too long. Try again.', { category: 'provider_timeout' });
        }
        throw translateProviderError(err);
      }

      if (response.promptFeedback?.blockReason) {
        throw new AppError(422, 'unreadable_receipt', 'This file could not be analyzed. Try a different photo or file.', {
          category: 'provider_blocked',
        });
      }
      const finishReason = response.candidates?.[0]?.finishReason;
      if (finishReason && finishReason !== 'STOP') {
        throw new AppError(502, 'analysis_malformed', 'The analysis service returned an incomplete result. Try again.', {
          category: `provider_finish_${String(finishReason).toLowerCase()}`,
        });
      }
      try {
        return JSON.parse(response.text ?? '');
      } catch {
        throw new AppError(502, 'analysis_malformed', 'The analysis service returned an unexpected result. Try again.', {
          category: 'provider_malformed_output',
        });
      }
    },
  };
}

/** Maps SDK failures to client-safe errors. Provider messages are never forwarded or logged. */
export function translateProviderError(err) {
  const status = err instanceof ApiError ? err.status : undefined;
  if (status === 429) {
    return new AppError(503, 'analysis_quota_exceeded', 'The analysis service has reached its usage limit. Try again later.', {
      category: 'provider_quota',
      retryAfterSeconds: 60,
    });
  }
  // Google answers 400 (not 401) for a bad or expired key; that is the key's fault, not the receipt's.
  if (status === 400 && /API key (not valid|expired)|API_KEY_INVALID/i.test(String(err?.message))) {
    return new AppError(502, 'analysis_unavailable', 'The analysis service is unavailable right now. Try again later.', { category: 'provider_auth' });
  }
  if (status === 400) {
    return new AppError(422, 'unreadable_receipt', 'The analysis service could not process this file. Try a clearer photo or a different file.', {
      category: 'provider_rejected_input',
    });
  }
  const category =
    status === 401 || status === 403
      ? 'provider_auth'
      : status === 404
        ? 'provider_model_not_found'
        : status !== undefined
          ? `provider_http_${status}`
          : 'provider_network';
  return new AppError(502, 'analysis_unavailable', 'The analysis service is unavailable right now. Try again later.', { category });
}
