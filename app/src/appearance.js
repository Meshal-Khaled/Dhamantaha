const KEY = 'dhamantaha.appearance.v1';
// priceView: how an item bought more than once shows its price, 'unit' (2 × SAR 50.00) or 'total' (SAR 100.00).
const defaults = { language: 'ar', theme: 'light', font: 'normal', priceView: 'unit' };
export function loadAppearance() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { language: saved.language === 'en' ? 'en' : 'ar', theme: saved.theme === 'dark' ? 'dark' : 'light', font: saved.font === 'large' ? 'large' : 'normal', priceView: saved.priceView === 'total' ? 'total' : 'unit' };
  } catch { return { ...defaults }; }
}
export function saveAppearance(value) { localStorage.setItem(KEY, JSON.stringify(value)); }
