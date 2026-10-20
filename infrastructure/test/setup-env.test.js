import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';

const script = fileURLToPath(new URL('../scripts/setup-env.js', import.meta.url));
const dir = await mkdtemp(join(tmpdir(), 'dhamantaha-setup-'));
const envFile = join(dir, '.env');
after(() => rm(dir, { recursive: true, force: true }));

function runSetup(input, args = []) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [script, '--file', envFile, ...args], (error, stdout, stderr) =>
      resolve({ code: error?.code ?? 0, stdout, stderr }),
    );
    child.stdin.end(input);
  });
}

const readEnv = async () =>
  Object.fromEntries(
    (await readFile(envFile, 'utf8'))
      .split('\n')
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  );

describe('npm run setup', () => {
  it('refuses to create a file without a Gemini key', async () => {
    const result = await runSetup('\n\n');
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Gemini API key is required/);
  });

  it('writes a valid, private .env for The Ring', async () => {
    const result = await runSetup('test-gemini-key-123\ngemini-test-model\n');
    assert.equal(result.code, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /test-gemini-key-123/, 'the provider key is never printed');

    const env = await readEnv();
    assert.equal(env.GEMINI_API_KEY, 'test-gemini-key-123');
    assert.equal(env.GEMINI_MODEL, 'gemini-test-model');
    assert.equal(env.TRUST_PROXY, 'loopback,uniquelocal');
    assert.equal(env.GEMINI_TIMEOUT_MS, '40000');
    assert.match(env.CLIENT_KEYS, /^android:[\w-]{32},web-test:[\w-]{32}$/);

    const config = loadConfig(env);
    assert.equal(config.analysisProvider, 'gemini');
    assert.deepEqual(config.clientKeys.map((k) => k.name), ['android', 'web-test']);
    if (process.platform !== 'win32') assert.equal((await stat(envFile)).mode & 0o777, 0o600);
  });

  it('keeps current values, including app keys, when Enter is pressed', async () => {
    const before = await readEnv();
    const result = await runSetup('\nnew-model\n');
    assert.equal(result.code, 0, result.stderr);
    const env = await readEnv();
    assert.equal(env.GEMINI_API_KEY, before.GEMINI_API_KEY);
    assert.equal(env.GEMINI_MODEL, 'new-model');
    assert.equal(env.CLIENT_KEYS, before.CLIENT_KEYS);
    assert.match(result.stdout, /App keys unchanged/);
  });

  it('replaces app keys on request', async () => {
    const before = await readEnv();
    const result = await runSetup('\n\n', ['--new-client-keys']);
    assert.equal(result.code, 0, result.stderr);
    assert.notEqual((await readEnv()).CLIENT_KEYS, before.CLIENT_KEYS);
    assert.match(result.stdout, /New app keys/);
  });
});
