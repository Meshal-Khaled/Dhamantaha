import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { STORAGE_KEY, loadPreferences, savePreferences } from '../lib/preferences.js';
import { translate } from '../i18n/translate.js';

const SettingsContext = createContext(null);

const darkQuery = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null);

function useSystemDark() {
  const [dark, setDark] = useState(() => darkQuery()?.matches ?? false);
  useEffect(() => {
    const query = darkQuery();
    if (!query) return;
    const listener = (event) => setDark(event.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);
  return dark;
}

/** Language, theme, price display and the access key, remembered in this browser and applied to the page. */
export function SettingsProvider({ children }) {
  const [prefs, setPrefs] = useState(() => loadPreferences());
  const systemDark = useSystemDark();
  const resolvedTheme = prefs.theme === 'system' ? (systemDark ? 'dark' : 'light') : prefs.theme;
  const arabic = prefs.language === 'ar';

  useEffect(() => {
    const root = document.documentElement;
    root.lang = prefs.language;
    root.dir = arabic ? 'rtl' : 'ltr';
    root.dataset.theme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedTheme === 'dark' ? '#0d1b18' : '#0f766e');
  }, [prefs.language, arabic, resolvedTheme]);

  // A change made in another tab applies here too.
  useEffect(() => {
    const sync = (event) => { if (event.key === STORAGE_KEY) setPrefs(loadPreferences()); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const update = useCallback((patch) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      try { savePreferences(next); } catch { /* The choice still applies until the page is closed. */ }
      return next;
    });
  }, []);

  const t = useCallback((key, vars) => translate(prefs.language, key, vars), [prefs.language]);
  const value = useMemo(() => ({ ...prefs, resolvedTheme, arabic, t, update }), [prefs, resolvedTheme, arabic, t, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
