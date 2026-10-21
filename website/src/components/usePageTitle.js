import { useEffect } from 'react';
import { useSettings } from '../state/settings.jsx';

/** Sets the browser tab's title to "Page · Dhamantaha". With no key (the home page) it shows both names of the site. */
export default function usePageTitle(key) {
  const { t, language } = useSettings();
  useEffect(() => {
    document.title = key ? `${t(key)} · ${t('brand.name')}` : 'Dhamantaha – ضمنتها';
  }, [key, t, language]);
}
