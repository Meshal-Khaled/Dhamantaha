import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError } from '../errors.js';
import { createProvider } from '../providers/index.js';

const validModel = (s) => typeof s === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(s);

/** Only provider configuration is persisted. Receipt data never enters this store. */
export function createRuntime(config, { provider, providerFactory = createProvider, hooks } = {}) {
  const original = { ...config.gemini };
  const directory = config.admin.stateDirectory;
  const filename = directory ? join(directory, 'provider.json') : null;
  let settings = {};
  if (filename && existsSync(filename)) {
    try {
      const saved = JSON.parse(readFileSync(filename, 'utf8'));
      if (!validModel(saved.model) || (saved.apiKey !== undefined && typeof saved.apiKey !== 'string')) throw new Error();
      settings = { model: saved.model, ...(saved.apiKey ? { apiKey: saved.apiKey } : {}) };
    } catch {
      throw new Error('Saved provider settings could not be read. Check the private dashboard state file.');
    }
  }
  let current;
  const apply = () => {
    config.gemini.model = settings.model ?? original.model;
    config.gemini.apiKey = settings.apiKey ?? original.apiKey;
    current = provider !== undefined ? provider : providerFactory(config, hooks).provider;
  };
  apply();
  let pending = Promise.resolve();
  const persist = (update) => {
    const operation = pending.catch(() => {}).then(async () => {
      if (!filename) throw new AppError(503, 'settings_storage_unavailable', 'Persistent settings storage is not configured.');
      const next = update({ ...settings });
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(`${filename}.tmp`, JSON.stringify(next), { mode: 0o600 });
      await rename(`${filename}.tmp`, filename);
      settings = next;
      apply();
      return summary();
    });
    pending = operation;
    return operation;
  };
  const summary = () => ({
    provider: config.analysisProvider,
    model: config.gemini.model,
    keyConfigured: Boolean(config.gemini.apiKey),
    keySource: settings.apiKey ? 'dashboard' : config.gemini.apiKey ? 'ring' : 'none',
    configured: Boolean(current),
    canSave: Boolean(filename),
    timeoutMs: config.gemini.timeoutMs,
    fallbackModels: config.gemini.fallbackModels ?? [],
    keyCount: new Set([config.gemini.apiKey, ...(config.gemini.fallbackKeys ?? [])].filter(Boolean)).size,
  });
  return {
    provider: {
      get name() { return current?.name ?? null; },
      get configured() { return Boolean(current); },
      analyze(input) {
        if (!current) throw new AppError(503, 'analysis_not_configured', 'Receipt analysis is not configured on this server.');
        return current.analyze(input);
      },
    },
    summary,
    save({ model, apiKey }) {
      const clean = typeof model === 'string' ? model.trim().replace(/^models\//, '') : '';
      if (!validModel(clean)) throw new AppError(400, 'invalid_settings', 'Enter a valid Gemini model ID.');
      if (apiKey !== undefined && (typeof apiKey !== 'string' || apiKey.length > 512 || /[\r\n\x00]/.test(apiKey))) {
        throw new AppError(400, 'invalid_settings', 'Enter a valid API key.');
      }
      return persist((next) => ({ ...next, model: clean, ...(apiKey?.trim() ? { apiKey: apiKey.trim() } : {}) }));
    },
    useRingKey() {
      return persist((next) => { delete next.apiKey; return { ...next, model: next.model ?? config.gemini.model }; });
    },
    async check() {
      if (config.analysisProvider === 'mock') return { ok: true, message: 'Mock provider is enabled. No external API was called.' };
      if (!config.gemini.apiKey || !validModel(config.gemini.model)) throw new AppError(503, 'analysis_not_configured', 'Save a Gemini key and model first.');
      let response;
      try {
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.gemini.model)}`, {
          headers: { 'x-goog-api-key': config.gemini.apiKey },
          signal: AbortSignal.timeout(Math.min(config.gemini.timeoutMs, 15000)),
        });
      } catch {
        throw new AppError(502, 'provider_check_failed', 'Could not reach Google. Try again later.');
      }
      // Consume the body without retaining or returning provider error details.
      await response.arrayBuffer();
      if (!response.ok) {
        const message = [401, 403].includes(response.status) ? 'Google rejected this key or its permissions.'
          : response.status === 404 ? 'This model is not available for this key.'
          : response.status === 429 ? 'Google reports a quota limit. Try again later.'
          : 'Google is currently unavailable. Try again later.';
        throw new AppError(502, 'provider_check_failed', message);
      }
      return { ok: true, message: 'Google accepted the key and model. Receipt analysis availability can still vary.' };
    },
  };
}
