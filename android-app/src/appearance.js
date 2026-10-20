const KEY = 'dhamantaha.appearance.v1';
export function loadAppearance() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { language: saved.language === 'en' ? 'en' : 'ar', theme: saved.theme === 'dark' ? 'dark' : 'light', font: saved.font === 'large' ? 'large' : 'normal' };
  } catch { return { language: 'ar', theme: 'light', font: 'normal' }; }
}
export function saveAppearance(value) { localStorage.setItem(KEY, JSON.stringify(value)); }
