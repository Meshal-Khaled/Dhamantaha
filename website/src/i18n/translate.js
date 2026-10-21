import { catalogs } from './catalog.js';

/** The message for `key` in `lang`, with {name} placeholders filled from `vars`. Falls back to English, then to the key. */
export function translate(lang, key, vars) {
  const message = catalogs[lang]?.[key] ?? catalogs.en[key] ?? key;
  if (!vars) return message;
  return message.replace(/\{(\w+)\}/g, (placeholder, name) => (name in vars ? String(vars[name]) : placeholder));
}
