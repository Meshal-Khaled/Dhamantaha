import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError } from '../errors.js';
import { createProvider } from '../providers/index.js';
import { createGeminiProvider } from '../providers/gemini.js';
import { PROVIDER_CATALOG, presetFor } from '../providers/catalog.js';
import { cleanBaseUrl, createRemoteProvider } from '../providers/remote.js';

const validModel = (s) => typeof s === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(s);
const profileModel = (s) => typeof s === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:/@+-]{0,199}$/.test(s);
const validKey = (key) => typeof key === 'string' && key.trim().length > 0 && key.length <= 512 && !/[\r\n\x00]/.test(key);
function checkedProfile(input) {
  const preset = presetFor(input.type);
  const trimmedModel = typeof input.model === 'string' ? input.model.trim() : '';
  const model = input.type === 'gemini' ? trimmedModel.replace(/^models\//, '') : trimmedModel;
  if (!preset || !(input.type === 'gemini' ? validModel(model) : profileModel(model)) || !validKey(input.apiKey)
    || typeof input.label !== 'string' || !input.label.trim() || input.label.length > 60 || /[\r\n\x00]/.test(input.label)) {
    throw new AppError(400, 'invalid_settings', 'Enter a provider, name, model ID, and API key.');
  }
  return { id: input.id, type: input.type, label: input.label.trim(), model, apiKey: input.apiKey.trim(),
    baseUrl: preset.type === 'custom' ? cleanBaseUrl(input.baseUrl) : preset.baseUrl };
}

/** Only provider configuration is persisted. Receipt data never enters this store. */
export function createRuntime(config, { provider, providerFactory = createProvider, remoteFactory = createRemoteProvider, hooks } = {}) {
  const original = { ...config.gemini };
  const directory = config.admin.stateDirectory;
  const filename = directory ? join(directory, 'provider.json') : null;
  let settings = {};
  if (filename && existsSync(filename)) {
    try {
      const saved = JSON.parse(readFileSync(filename, 'utf8'));
      if ((saved.model !== undefined && saved.model !== '' && !validModel(saved.model)) || (saved.apiKey !== undefined && !validKey(saved.apiKey))) throw new Error();
      const profiles = (saved.providers ?? []).map(checkedProfile);
      if (profiles.length > 20 || profiles.some((p) => !/^provider-[a-f0-9-]{36}$/.test(p.id)) || new Set(profiles.map((p) => p.id)).size !== profiles.length
        || (saved.activeProvider && saved.activeProvider !== 'gemini' && !profiles.some((p) => p.id === saved.activeProvider))) throw new Error();
      settings = { ...(saved.model ? { model: saved.model } : {}), ...(saved.apiKey ? { apiKey: saved.apiKey } : {}),
        ...(profiles.length ? { providers: profiles } : {}), ...(saved.activeProvider ? { activeProvider: saved.activeProvider } : {}) };
    } catch {
      throw new Error('Saved provider settings could not be read. Check the private dashboard state file.');
    }
  }
  let current;
  const activeProfile = () => (settings.providers ?? []).find((entry) => entry.id === settings.activeProvider);
  const makeProfile = (entry) => entry.type === 'gemini'
    ? createGeminiProvider({ apiKey: entry.apiKey, model: entry.model, timeoutMs: original.timeoutMs })
    : remoteFactory(entry, { timeoutMs: original.timeoutMs });
  const apply = () => {
    config.gemini.model = settings.model ?? original.model;
    config.gemini.apiKey = settings.apiKey ?? original.apiKey;
    const active = activeProfile();
    current = provider !== undefined ? provider : config.analysisProvider !== 'mock' && active ? makeProfile(active) : providerFactory(config, hooks).provider;
    config.providerModel = active?.model ?? config.gemini.model;
  };
  apply();
  let pending = Promise.resolve();
  const persist = (update) => {
    const operation = pending.catch(() => {}).then(async () => {
      if (!filename) throw new AppError(503, 'settings_storage_unavailable', 'Persistent settings storage is not configured.');
      const next = update(structuredClone(settings));
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
    provider: config.analysisProvider === 'mock' ? 'mock' : activeProfile()?.type ?? config.analysisProvider,
    label: activeProfile()?.label ?? 'Google Gemini',
    activeProvider: settings.activeProvider ?? 'gemini',
    catalog: PROVIDER_CATALOG,
    providers: [{ id: 'gemini', type: 'gemini', label: 'Google Gemini · Ring key', model: config.gemini.model,
      baseUrl: presetFor('gemini').baseUrl, keyConfigured: Boolean(config.gemini.apiKey), keySource: settings.apiKey ? 'dashboard' : config.gemini.apiKey ? 'ring' : 'none' },
      ...(settings.providers ?? []).map(({ apiKey, ...entry }) => ({ ...entry, keyConfigured: Boolean(apiKey), keySource: 'dashboard' }))],
    model: activeProfile()?.model ?? config.gemini.model,
    keyConfigured: Boolean(activeProfile()?.apiKey ?? config.gemini.apiKey),
    keySource: activeProfile() || settings.apiKey ? 'dashboard' : config.gemini.apiKey ? 'ring' : 'none',
    configured: Boolean(current),
    canSave: Boolean(filename),
    timeoutMs: config.gemini.timeoutMs,
    fallbackModels: activeProfile() ? [] : config.gemini.fallbackModels ?? [],
    keyCount: activeProfile() ? 1 : new Set([config.gemini.apiKey, ...(config.gemini.fallbackKeys ?? [])].filter(Boolean)).size,
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
    addProfile(input) {
      const entry = checkedProfile({ ...input, id: `provider-${randomUUID()}` });
      return persist((next) => {
        if ((next.providers?.length ?? 0) >= 20) throw new AppError(400, 'invalid_settings', 'You can save up to 20 additional providers.');
        return { ...next, model: next.model ?? original.model, providers: [...(next.providers ?? []), entry] };
      });
    },
    activate(id) {
      return persist((next) => {
        if (id !== 'gemini' && !(next.providers ?? []).some((entry) => entry.id === id)) throw new AppError(404, 'provider_not_found', 'Choose a saved provider.');
        return { ...next, model: next.model ?? original.model, activeProvider: id };
      });
    },
    removeProfile(id) {
      return persist((next) => {
        if (id === 'gemini' || id === (next.activeProvider ?? 'gemini')) throw new AppError(400, 'invalid_settings', 'Select another active provider before removing this one.');
        if (!(next.providers ?? []).some((entry) => entry.id === id)) throw new AppError(404, 'provider_not_found', 'Choose a saved provider.');
        next.providers = next.providers.filter((entry) => entry.id !== id);
        return next;
      });
    },
    save({ providerId = 'gemini', model, apiKey, baseUrl, label }) {
      if (providerId !== 'gemini') return persist((next) => {
        const found = (next.providers ?? []).find((entry) => entry.id === providerId);
        if (!found) throw new AppError(404, 'provider_not_found', 'Choose a saved provider.');
        if (apiKey !== undefined && (typeof apiKey !== 'string' || apiKey.length > 512 || /[\r\n\x00]/.test(apiKey))) throw new AppError(400, 'invalid_settings', 'Enter a valid API key.');
        Object.assign(found, checkedProfile({ ...found, model, ...(label !== undefined ? { label } : {}),
          ...(baseUrl !== undefined ? { baseUrl } : {}), ...(apiKey?.trim() ? { apiKey } : {}) }));
        return next;
      });
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
    async check(id = settings.activeProvider ?? 'gemini') {
      if (config.analysisProvider === 'mock') return { ok: true, message: 'Mock provider is enabled. No external API was called.' };
      const entry = id === 'gemini' ? { apiKey: config.gemini.apiKey, model: config.gemini.model, type: 'gemini' }
        : (settings.providers ?? []).find((p) => p.id === id);
      if (!entry) throw new AppError(404, 'provider_not_found', 'Choose a saved provider.');
      if (entry.type !== 'gemini') return makeProfile(entry).check();
      if (!entry.apiKey || !validModel(entry.model)) throw new AppError(503, 'analysis_not_configured', 'Save a Gemini key and model first.');
      let response;
      try {
        response = await fetch(`${presetFor('gemini').baseUrl}/models/${encodeURIComponent(entry.model)}`, {
          headers: { 'x-goog-api-key': entry.apiKey },
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
