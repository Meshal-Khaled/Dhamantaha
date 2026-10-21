import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

// A component used in JSX but never imported compiles fine and only fails when that screen is drawn, which
// blanks the whole app. (A missing FileText import did exactly that when a PDF was added.) Catch it here.
const src = join(import.meta.dirname, '..', 'src');

function declaredNames(text) {
  const names = new Set();
  for (const [, clause] of text.matchAll(/import\s+([^;]+?)\s+from\s+['"][^'"]+['"]/gs)) {
    const braces = clause.match(/\{([^}]*)\}/);
    for (const part of (braces?.[1] ?? '').split(',')) if (part.trim()) names.add(part.trim().split(/\s+as\s+/).pop());
    const fallback = clause.trim().match(/^([A-Za-z_$][\w$]*)/);
    if (fallback && !clause.trim().startsWith('{')) names.add(fallback[1]);
  }
  for (const [, name] of text.matchAll(/\b(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(name);
  // Names taken from destructured parameters or arrays, such as ([target, Icon, label]) => <Icon />
  for (const [, inner] of text.matchAll(/[([{]\s*([A-Za-z_$][\w$]*(?:\s*,\s*[A-Za-z_$][\w$]*)+)\s*[)\]}]/g)) {
    for (const name of inner.split(',')) names.add(name.trim());
  }
  return names;
}

test('every component used in JSX is imported or defined in the same file', () => {
  const problems = [];
  for (const file of readdirSync(src).filter((name) => name.endsWith('.jsx'))) {
    const text = readFileSync(join(src, file), 'utf8');
    const declared = declaredNames(text);
    for (const [, tag] of text.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)) {
      if (!declared.has(tag)) problems.push(`${file}: <${tag}> is used but not imported or defined`);
    }
  }
  assert.deepEqual([...new Set(problems)], []);
});

test('the check itself notices a missing import', () => {
  const broken = "import { Check } from 'lucide-react';\nexport const A = () => <div><Check /><FileText /></div>;";
  const declared = declaredNames(broken);
  assert.ok(declared.has('Check'));
  assert.ok(!declared.has('FileText'));
});
