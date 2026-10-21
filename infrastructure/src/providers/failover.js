import { AppError, ClientClosedError } from '../errors.js';
import { createGeminiProvider } from './gemini.js';

// Failures another model or key could get past. Bad input (400), blocked
// content, and disconnects would fail the same way again, so they stop here.
const RETRYABLE = /^(provider_timeout|provider_quota|provider_auth|provider_network|provider_model_not_found|provider_malformed_output|provider_http_5\d\d|provider_finish_.+)$/;
// A rejected or exhausted key will not recover with another model: skip its other models.
const NEXT_KEY = new Set(['provider_auth', 'provider_quota']);
const MIN_ATTEMPT_MS = 3000;
const MAX_PARALLEL = 3;

/**
 * Gemini with a fallback chain. The chain is every key in order, each trying
 * the primary model and then the fallback models. An attempt that fails with
 * a retryable error starts the next one at once. An attempt that is merely
 * slow (`hedgeAfterMs`) also starts the next one, without being cancelled:
 * the first good answer wins and the rest are cancelled. At most three run at
 * once, and the whole chain stays inside one deadline so the app gets an
 * answer before Cloudflare gives up. Keys are named by slot ("key 2"), never
 * by value.
 *
 * `analyze` also accepts `deadlineAt` (ms since epoch, shared by every call of
 * one request) and `trace` (an array that receives one entry per attempt).
 */
export function createFailoverProvider(
  { keys, models, timeoutMs, totalTimeoutMs, hedgeAfterMs = 0, onAttempt, beforeRetry },
  { createAttempt = createGeminiProvider } = {},
) {
  let nextKey = 0;

  return {
    name: 'gemini',
    analyze(input) {
      // Rotate the starting key per request while keeping stable slot names in
      // monitoring. Each request retains its own complete fallback chain.
      const start = nextKey;
      nextKey = (nextKey + 1) % keys.length;
      const plan = keys.flatMap((_, offset) => {
        const slot = (start + offset) % keys.length;
        return models.map((model) => ({ apiKey: keys[slot], slot, model }));
      });
      const deadlineAt = input.deadlineAt ?? Date.now() + totalTimeoutMs;
      return new Promise((resolve, reject) => {
        const controllers = new Set();
        const skippedSlots = new Set();
        let next = 0;
        let launched = 0;
        let running = 0;
        let settled = false;
        let lastError;
        let hedgeTimer;

        const settle = (finish, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(hedgeTimer);
          for (const controller of controllers) controller.abort(new ClientClosedError());
          finish(value);
        };

        const scheduleHedge = () => {
          clearTimeout(hedgeTimer);
          if (hedgeAfterMs > 0) hedgeTimer = setTimeout(() => !settled && running < MAX_PARALLEL && launch(), hedgeAfterMs);
        };

        /** Starts the next chain entry. Returns false when the chain has nothing left to try. */
        const launch = () => {
          while (next < plan.length && skippedSlots.has(plan[next].slot)) next += 1;
          if (next >= plan.length) return false;
          const remaining = deadlineAt - Date.now();
          if (launched > 0 && remaining < MIN_ATTEMPT_MS) return false;
          if (launched > 0) {
            try {
              beforeRetry?.(); // another billed call
            } catch (error) {
              settle(reject, error);
              return false;
            }
          }
          const { apiKey, slot, model } = plan[next];
          next += 1;
          launched += 1;
          running += 1;
          const attempt = launched;
          const started = Date.now();
          const controller = new AbortController();
          controllers.add(controller);
          const signal = input.signal ? AbortSignal.any([input.signal, controller.signal]) : controller.signal;
          const report = (outcome) => {
            const entry = { attempt, key: `key ${slot + 1}`, model, ok: outcome === null, category: outcome, durationMs: Date.now() - started };
            input.trace?.push(entry);
            onAttempt?.(entry);
          };

          Promise.resolve()
            .then(() => createAttempt({ apiKey, model, timeoutMs: Math.max(1000, Math.min(timeoutMs, remaining)) }).analyze({ ...input, signal }))
            .then(
              (result) => {
                controllers.delete(controller);
                running -= 1;
                if (settled) return report('cancelled');
                report(null);
                settle(resolve, result);
              },
              (error) => {
                controllers.delete(controller);
                running -= 1;
                if (settled) return report('cancelled');
                report(error?.category ?? 'error');
                if (error instanceof ClientClosedError || input.signal?.aborted) return settle(reject, error);
                if (!(error instanceof AppError) || !RETRYABLE.test(error.category)) return settle(reject, error);
                lastError = error;
                if (NEXT_KEY.has(error.category)) skippedSlots.add(slot);
                if (!launch() && running === 0) settle(reject, lastError);
              },
            );
          scheduleHedge();
          return true;
        };

        launch();
      });
    },
  };
}
