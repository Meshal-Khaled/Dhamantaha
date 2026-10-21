// What this browser remembers between visits: language, theme, how prices are shown, and the access key.
export const STORAGE_KEY = 'dhamantaha.web.settings.v1';

const THEMES = ['system', 'light', 'dark'];

/** A first visit follows the browser: Arabic for an Arabic browser, English for any other. */
export function firstLanguage(languages = globalThis.navigator?.languages) {
  const preferred = String(languages?.[0] ?? 'en').toLowerCase();
  return preferred === 'ar' || preferred.startsWith('ar-') ? 'ar' : 'en';
}

export function loadPreferences(storage = globalThis.localStorage, languages = globalThis.navigator?.languages) {
  let saved = {};
  try { saved = JSON.parse(storage.getItem(STORAGE_KEY) || '{}') ?? {}; } catch { saved = {}; }
  return {
    language: saved.language === 'ar' || saved.language === 'en' ? saved.language : firstLanguage(languages),
    theme: THEMES.includes(saved.theme) ? saved.theme : 'system',
    priceView: saved.priceView === 'total' ? 'total' : 'unit',
    clientKey: typeof saved.clientKey === 'string' ? saved.clientKey : '',
  };
}

export function savePreferences(value, storage = globalThis.localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(value));
}
