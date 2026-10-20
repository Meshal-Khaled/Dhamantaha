import { createGeminiProvider } from './gemini.js';
import { createMockProvider } from './mock.js';

/**
 * Returns `{ provider, missing }`. The provider is null when its server-side
 * configuration is incomplete; `missing` lists the absent variable names.
 */
export function createProvider(config) {
  if (config.analysisProvider === 'mock') return { provider: createMockProvider(), missing: [] };
  const missing = [!config.gemini.apiKey && 'GEMINI_API_KEY', !config.gemini.model && 'GEMINI_MODEL'].filter(Boolean);
  return { provider: missing.length ? null : createGeminiProvider(config.gemini), missing };
}

/** Counts every provider call against the daily budget. */
export function withBudget(provider, budget) {
  return {
    name: provider.name,
    analyze(input) {
      budget.consume();
      return provider.analyze(input);
    },
  };
}
