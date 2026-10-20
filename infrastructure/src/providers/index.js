import { createFailoverProvider } from './failover.js';
import { createMockProvider } from './mock.js';

/**
 * Returns `{ provider, missing }`. The provider is null when its server-side
 * configuration is incomplete; `missing` lists the absent variable names.
 */
export function createProvider(config, hooks = {}) {
  if (config.analysisProvider === 'mock') return { provider: createMockProvider(), missing: [] };
  const missing = [!config.gemini.apiKey && 'GEMINI_API_KEY', !config.gemini.model && 'GEMINI_MODEL'].filter(Boolean);
  if (missing.length) return { provider: null, missing };
  const unique = (list) => [...new Set(list.filter(Boolean))];
  const { timeoutMs, totalTimeoutMs, hedgeAfterMs, fallbackModels = [], fallbackKeys = [] } = config.gemini;
  const provider = createFailoverProvider({
    keys: unique([config.gemini.apiKey, ...fallbackKeys]),
    models: unique([config.gemini.model, ...fallbackModels]),
    timeoutMs,
    totalTimeoutMs,
    hedgeAfterMs,
    ...hooks,
  });
  return { provider, missing };
}

/** Counts every provider call against the daily budget. */
export function withBudget(provider, budget) {
  return {
    get name() { return provider.name; },
    get configured() { return provider.configured !== false; },
    analyze(input) {
      budget.consume();
      return provider.analyze(input);
    },
  };
}

/** Gives every provider call of one request the same deadline, so fallbacks share one time budget. */
export function withDeadline(provider, totalMs) {
  const deadlineAt = Date.now() + totalMs;
  return {
    get name() { return provider.name; },
    get configured() { return provider.configured !== false; },
    analyze: (input) => provider.analyze({ ...input, deadlineAt }),
  };
}
