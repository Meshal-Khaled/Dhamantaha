import test from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, firstLanguage, loadPreferences, savePreferences } from '../src/lib/preferences.js';

const memory = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
};

test('a first visit follows the browser: Arabic for an Arabic browser, English for anything else', () => {
  assert.equal(firstLanguage(['ar-SA', 'en']), 'ar');
  assert.equal(firstLanguage(['ar']), 'ar');
  assert.equal(firstLanguage(['en-US', 'ar-SA']), 'en');
  assert.equal(firstLanguage(['fr']), 'en');
  assert.equal(firstLanguage(undefined), 'en');
});

test('saved choices win over the browser, and bad values fall back safely', () => {
  const storage = memory({ [STORAGE_KEY]: JSON.stringify({ language: 'ar', theme: 'dark', priceView: 'total', clientKey: 'abc' }) });
  assert.deepEqual(loadPreferences(storage, ['en-US']), { language: 'ar', theme: 'dark', priceView: 'total', clientKey: 'abc' });
  const broken = memory({ [STORAGE_KEY]: JSON.stringify({ language: 'fr', theme: 'sepia', priceView: 5, clientKey: 7 }) });
  assert.deepEqual(loadPreferences(broken, ['ar']), { language: 'ar', theme: 'system', priceView: 'unit', clientKey: '' });
  assert.deepEqual(loadPreferences(memory({ [STORAGE_KEY]: '{not json' }), ['en']), { language: 'en', theme: 'system', priceView: 'unit', clientKey: '' });
});

test('preferences round-trip through storage', () => {
  const storage = memory();
  const value = { language: 'en', theme: 'light', priceView: 'total', clientKey: 'secret-key-value' };
  savePreferences(value, storage);
  assert.deepEqual(loadPreferences(storage, ['ar']), value);
});
