import { DEFAULT_API_BASE } from './api.js';

const STORAGE_KEY = 'dhamantaha.settings.v1';

export function defaultSettings() {
  return {
    baseUrl: import.meta.env.VITE_API_BASE || DEFAULT_API_BASE,
    clientKey: import.meta.env.VITE_CLIENT_KEY || '',
  };
}

export function loadSettings() {
  const defaults = defaultSettings();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return {
      baseUrl: typeof saved.baseUrl === 'string' && saved.baseUrl ? saved.baseUrl : defaults.baseUrl,
      clientKey: typeof saved.clientKey === 'string' && saved.clientKey ? saved.clientKey : defaults.clientKey,
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
