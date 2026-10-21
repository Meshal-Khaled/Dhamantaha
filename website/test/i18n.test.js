import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { catalogs } from '../src/i18n/catalog.js';
import { translate } from '../src/i18n/translate.js';
import { FILTERS, SORTS } from '../src/lib/receipt-view.js';

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === 'messages' ? [] : sourceFiles(path);
    return /\.(jsx?|mjs)$/.test(name) ? [path] : [];
  });
}

// lib/ holds plain logic with its own two-argument t(english, arabic) helpers, not the message catalog.
const source = sourceFiles(join(import.meta.dirname, '..', 'src'))
  .filter((path) => !/[\\/]lib[\\/]/.test(path))
  .map((path) => ({ path, text: readFileSync(path, 'utf8') }));

test('English and Arabic have exactly the same messages', () => {
  const english = Object.keys(catalogs.en).sort();
  const arabic = Object.keys(catalogs.ar).sort();
  assert.deepEqual(english.filter((key) => !(key in catalogs.ar)), [], 'missing in Arabic');
  assert.deepEqual(arabic.filter((key) => !(key in catalogs.en)), [], 'missing in English');
});

test('no message is empty and placeholders match between the languages', () => {
  for (const [key, text] of Object.entries(catalogs.en)) {
    assert.ok(text.trim(), `${key} is empty in English`);
    assert.ok(catalogs.ar[key].trim(), `${key} is empty in Arabic`);
    assert.deepEqual(placeholders(catalogs.ar[key]), placeholders(text), `${key}: placeholders differ`);
  }
});

test('every message key the code asks for exists', () => {
  const missing = [];
  for (const { path, text } of source) {
    for (const [, key] of text.matchAll(/\bt\(\s*'([\w.]+)'/g)) if (!(key in catalogs.en)) missing.push(`${path}: ${key}`);
    // Keys built from a variable, like t(`home.how.${key}.title`): the fixed parts must match some message.
    for (const [, template] of text.matchAll(/\bt\(\s*`([^`]+)`/g)) {
      const pattern = new RegExp(`^${template.replace(/[.*+?^()|[\]\\]/g, '\\$&').replace(/\$\{[^}]*\}/g, '[\\w.]+')}$`);
      if (!Object.keys(catalogs.en).some((key) => pattern.test(key))) missing.push(`${path}: ${template}`);
    }
    for (const [, key] of text.matchAll(/(?:label|title|key)\s*[:=]\s*'((?:nav|home|status|common|receipts|detail|settings|extras|edit|add|toast|how|privacy|help|notfound|error|footer|header)\.[\w.]+)'/g)) {
      if (!(key in catalogs.en)) missing.push(`${path}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('messages built from a counter or a list exist for every value the pages use', () => {
  const wanted = [];
  for (let n = 1; n <= 3; n++) wanted.push(`home.how.s${n}.title`, `home.how.s${n}.body`, `home.faq.q${n}`, `home.faq.a${n}`, `how.s${n}.title`, `how.s${n}.body`);
  for (let n = 1; n <= 6; n++) wanted.push(`home.features.f${n}.title`, `home.features.f${n}.body`, `how.read.i${n}`);
  for (let n = 1; n <= 7; n++) wanted.push(`privacy.s${n}.title`, `privacy.s${n}.body`);
  for (let n = 1; n <= 10; n++) wanted.push(`help.q${n}`, `help.a${n}`);
  for (let n = 1; n <= 4; n++) wanted.push(`add.tips.t${n}`);
  for (const place of ['browser', 'ring', 'google']) wanted.push(`how.where.${place}.title`, `how.where.${place}.body`);
  for (const status of ['active', 'soon', 'expired', 'review', 'unread']) wanted.push(`status.${status}`);
  for (const filter of FILTERS) wanted.push(`receipts.filter.${filter}`);
  for (const sort of SORTS) wanted.push(`receipts.sort.${sort}`);
  for (const unit of ['days', 'weeks', 'months', 'years']) wanted.push(`common.${unit}`);
  for (const state of ['checking', 'ok', 'down']) wanted.push(`settings.connection.${state}`);
  assert.deepEqual(wanted.filter((key) => !(key in catalogs.en)), []);
});

test('translate fills placeholders, falls back to English and then to the key', () => {
  assert.equal(translate('en', 'receipts.showing', { shown: 3, total: 9 }), 'Showing 3 of 9');
  assert.equal(translate('ar', 'receipts.showing', { shown: '٣', total: '٩' }), 'عرض ٣ من ٩');
  assert.equal(translate('en', 'footer.copyright', {}), '© {year} Dhamantaha', 'unknown placeholders are left visible');
  assert.equal(translate('fr', 'nav.home'), 'Home');
  assert.equal(translate('en', 'no.such.key'), 'no.such.key');
});
