import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { loadConfig } from '../src/config.js';
import { AppError, ClientClosedError } from '../src/errors.js';
import { createFailoverProvider } from '../src/providers/failover.js';
import { createProvider, withDeadline } from '../src/providers/index.js';

const overloaded = () => new AppError(502, 'analysis_unavailable', 'x', { category: 'provider_http_503' });
const rejectedKey = () => new AppError(502, 'analysis_unavailable', 'x', { category: 'provider_auth' });
const badInput = () => new AppError(422, 'unreadable_receipt', 'x', { category: 'provider_rejected_input' });
const timedOut = () => new AppError(504, 'analysis_timeout', 'x', { category: 'provider_timeout' });

/** Each attempt asks `behave(apiKey, model)`; it returns a value or throws. */
function chain(behave, options = {}) {
  const calls = [];
  const timeouts = [];
  const provider = createFailoverProvider(
    { keys: ['k1', 'k2', 'k3'], models: ['primary', 'backup'], timeoutMs: 1000, totalTimeoutMs: 10_000, ...options },
    {
      createAttempt: ({ apiKey, model, timeoutMs }) => ({
        async analyze() {
          calls.push(`${apiKey}/${model}`);
          timeouts.push(timeoutMs);
          return behave(apiKey, model);
        },
      }),
    },
  );
  return { provider, calls, timeouts };
}

describe('Gemini failover', () => {
  it('skips keys in a shared cooldown across requests and returns a bounded wait if all are paused', async () => {
    const paused = new Set();
    const waiting = new AppError(503, 'server_busy', 'Waiting', { retryAfterSeconds: 60 });
    const { provider, calls } = chain(key => {
      if (key === 'k1') throw new AppError(503, 'analysis_quota_exceeded', 'Quota', { category: 'provider_quota' });
      return { key };
    }, { isKeyAvailable: slot => !paused.has(slot), onAttempt: entry => { if (entry.category === 'provider_quota') paused.add(Number(entry.key.slice(4)) - 1); }, onKeysUnavailable: () => paused.size === 3 ? waiting : undefined });
    assert.deepEqual(await provider.analyze({}), { key: 'k2' });
    assert.deepEqual(await provider.analyze({}), { key: 'k2' });
    assert.deepEqual(await provider.analyze({}), { key: 'k3' });
    assert.deepEqual(await provider.analyze({}), { key: 'k2' });
    assert.equal(calls.filter(call => call.startsWith('k1/')).length, 1);
    paused.add(1); paused.add(2);
    await assert.rejects(provider.analyze({}), { code: 'server_busy', retryAfterSeconds: 60 });
  });
  it('balances 30 simultaneous requests over three keys with stable trace slots', async () => {
    const { provider, calls } = chain((key) => ({ key }));
    const traces = Array.from({ length: 30 }, () => []);
    const results = await Promise.all(traces.map((trace) => provider.analyze({ trace })));
    for (const key of ['k1', 'k2', 'k3']) {
      assert.equal(results.filter((result) => result.key === key).length, 10);
      assert.equal(calls.filter((call) => call === `${key}/primary`).length, 10);
    }
    traces.forEach((trace, index) => assert.equal(trace[0].key, `key ${index % 3 + 1}`));
  });

  it('preserves failover after rotating the starting key', async () => {
    const { provider } = chain((key) => {
      if (key === 'k2') throw rejectedKey();
      return { key };
    });
    assert.deepEqual(await provider.analyze({}), { key: 'k1' });
    const trace = [];
    assert.deepEqual(await provider.analyze({ trace }), { key: 'k3' });
    assert.deepEqual(trace.map((entry) => entry.key), ['key 2', 'key 3']);
  });

  it('answers from the first key and model when they work', async () => {
    const { provider, calls } = chain(() => ({ readable: true }));
    assert.deepEqual(await provider.analyze({}), { readable: true });
    assert.deepEqual(calls, ['k1/primary']);
  });

  it('tries another model on the same key before the next key', async () => {
    const { provider, calls } = chain((key, model) => {
      if (model === 'primary') throw overloaded();
      return { model };
    });
    assert.deepEqual(await provider.analyze({}), { model: 'backup' });
    assert.deepEqual(calls, ['k1/primary', 'k1/backup']);
  });

  it('moves to the second key once every model on the first has failed', async () => {
    const { provider, calls } = chain((key) => {
      if (key === 'k1') throw overloaded();
      return { key };
    });
    assert.deepEqual(await provider.analyze({}), { key: 'k2' });
    assert.deepEqual(calls, ['k1/primary', 'k1/backup', 'k2/primary']);
  });

  it('skips straight to the next key when a key is rejected', async () => {
    const { provider, calls } = chain((key) => {
      if (key === 'k1') throw rejectedKey();
      return { key };
    });
    assert.deepEqual(await provider.analyze({}), { key: 'k2' });
    assert.deepEqual(calls, ['k1/primary', 'k2/primary']);
  });

  it('throws the last error when every key and model fails', async () => {
    const { provider, calls } = chain(() => {
      throw timedOut();
    });
    await assert.rejects(provider.analyze({}), { code: 'analysis_timeout' });
    assert.equal(calls.length, 6);
  });

  it('does not retry bad input or disconnects', async () => {
    const input = chain(() => {
      throw badInput();
    });
    await assert.rejects(input.provider.analyze({}), { code: 'unreadable_receipt' });
    assert.equal(input.calls.length, 1);

    const closed = chain(() => {
      throw new ClientClosedError();
    });
    await assert.rejects(closed.provider.analyze({}), ClientClosedError);
    assert.equal(closed.calls.length, 1);

    const controller = new AbortController();
    controller.abort();
    const aborted = chain(() => {
      throw overloaded();
    });
    await assert.rejects(aborted.provider.analyze({ signal: controller.signal }), { code: 'analysis_unavailable' });
    assert.equal(aborted.calls.length, 1);
  });

  it('stops when the shared deadline is nearly spent and shrinks attempt timeouts to fit', async () => {
    const { provider, calls, timeouts } = chain(() => {
      throw overloaded();
    });
    await assert.rejects(provider.analyze({ deadlineAt: Date.now() + 1500 }), { code: 'analysis_unavailable' });
    assert.equal(calls.length, 1); // under 3 s left after the first failure: no second attempt
    assert.ok(timeouts[0] <= 1500);
  });

  it('records each attempt by key slot and model, and counts retries against the budget', async () => {
    const trace = [];
    const reported = [];
    let retries = 0;
    const { provider } = chain(
      (key) => {
        if (key === 'k1') throw overloaded();
        return { ok: true };
      },
      { onAttempt: (entry) => reported.push(entry), beforeRetry: () => (retries += 1) },
    );
    await provider.analyze({ trace });
    assert.deepEqual(trace.map((t) => [t.key, t.model, t.ok, t.category]), [
      ['key 1', 'primary', false, 'provider_http_503'],
      ['key 1', 'backup', false, 'provider_http_503'],
      ['key 2', 'primary', true, null],
    ]);
    assert.equal(reported.length, 3);
    assert.equal(retries, 2);
    assert.doesNotMatch(JSON.stringify(trace), /k1|k2/);
  });

  it('starts the next fallback when an attempt is slow, and the first good answer wins', async () => {
    const aborted = [];
    const trace = [];
    const provider = createFailoverProvider(
      { keys: ['k1', 'k2'], models: ['primary'], timeoutMs: 5000, totalTimeoutMs: 10_000, hedgeAfterMs: 30 },
      {
        createAttempt: ({ apiKey }) => ({
          analyze: ({ signal }) =>
            apiKey === 'k1'
              ? new Promise((resolve, reject) => signal.addEventListener('abort', () => (aborted.push(apiKey), reject(new ClientClosedError()))))
              : Promise.resolve({ from: apiKey }),
        }),
      },
    );
    assert.deepEqual(await provider.analyze({ trace }), { from: 'k2' });
    await new Promise((resolve) => setTimeout(resolve, 10)); // let the cancelled attempt report
    assert.deepEqual(aborted, ['k1']); // the slow attempt is cancelled once another answers
    assert.deepEqual(trace.map((t) => [t.key, t.ok, t.category]), [['key 2', true, null], ['key 1', false, 'cancelled']]);
  });

  it('keeps waiting for a slow attempt that later succeeds, even after hedging', async () => {
    const provider = createFailoverProvider(
      { keys: ['k1', 'k2'], models: ['primary'], timeoutMs: 5000, totalTimeoutMs: 10_000, hedgeAfterMs: 20 },
      {
        createAttempt: ({ apiKey }) => ({
          analyze: async () => {
            if (apiKey === 'k1') {
              await new Promise((resolve) => setTimeout(resolve, 60));
              return { from: 'k1' };
            }
            throw overloaded();
          },
        }),
      },
    );
    assert.deepEqual(await provider.analyze({}), { from: 'k1' });
  });

  it('never runs more than three attempts at once', async () => {
    let running = 0;
    let peak = 0;
    const provider = createFailoverProvider(
      { keys: ['k1', 'k2', 'k3'], models: ['a', 'b'], timeoutMs: 5000, totalTimeoutMs: 10_000, hedgeAfterMs: 10 },
      {
        createAttempt: () => ({
          analyze: async () => {
            running += 1;
            peak = Math.max(peak, running);
            await new Promise((resolve) => setTimeout(resolve, 80));
            running -= 1;
            throw timedOut();
          },
        }),
      },
    );
    await assert.rejects(provider.analyze({}), { code: 'analysis_timeout' });
    assert.ok(peak <= 3, `peak was ${peak}`);
  });

  it('a daily-limit error from a retry ends the chain', async () => {
    const { provider } = chain(() => {
      throw overloaded();
    }, {
      beforeRetry: () => {
        throw new AppError(503, 'daily_limit_reached', 'limit');
      },
    });
    await assert.rejects(provider.analyze({}), { code: 'daily_limit_reached' });
  });
});

describe('failover configuration', () => {
  it('reads fallback keys from files and fallback models from the environment', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dhamantaha-keys-'));
    try {
      await writeFile(join(dir, 'a.key'), 'second-key\n');
      await writeFile(join(dir, 'b.key'), ' third-key ');
      const { gemini } = loadConfig({
        GEMINI_API_KEY: 'first-key',
        GEMINI_MODEL: 'primary',
        GEMINI_FALLBACK_MODELS: 'models/backup-one, backup-two',
        GEMINI_FALLBACK_KEY_FILES: `${join(dir, 'a.key')},${join(dir, 'b.key')}`,
        GEMINI_TOTAL_TIMEOUT_MS: '70000',
      });
      assert.deepEqual(gemini.fallbackKeys, ['second-key', 'third-key']);
      assert.deepEqual(gemini.fallbackModels, ['backup-one', 'backup-two']);
      assert.equal(gemini.totalTimeoutMs, 70000);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects unreadable key files, bad model names and out-of-range deadlines', () => {
    assert.throws(() => loadConfig({ GEMINI_FALLBACK_KEY_FILES: '/definitely/missing.key' }), /GEMINI_FALLBACK_KEY_FILES/);
    assert.throws(() => loadConfig({ GEMINI_FALLBACK_MODELS: 'https://bad.example' }), /GEMINI_FALLBACK_MODELS/);
    assert.throws(() => loadConfig({ GEMINI_TOTAL_TIMEOUT_MS: '200000' }), /GEMINI_TOTAL_TIMEOUT_MS/);
    const defaults = loadConfig({});
    assert.deepEqual([defaults.gemini.fallbackKeys, defaults.gemini.fallbackModels, defaults.gemini.totalTimeoutMs], [[], [], 85000]);
  });

  it('builds a chain from the primary and fallback keys and models, without duplicates', () => {
    const config = loadConfig({ GEMINI_API_KEY: 'k1', GEMINI_MODEL: 'primary', GEMINI_FALLBACK_MODELS: 'primary,backup' });
    config.gemini.fallbackKeys = ['k1', 'k2'];
    const { provider } = createProvider(config);
    assert.equal(provider.name, 'gemini');
    assert.equal(createProvider({ ...config, gemini: { ...config.gemini, model: '' } }).provider, null);
  });

  it('gives every call of a request the same deadline', async () => {
    const seen = [];
    const scoped = withDeadline({ name: 'x', analyze: async (input) => seen.push(input.deadlineAt) }, 5000);
    await scoped.analyze({});
    await new Promise((resolve) => setTimeout(resolve, 20));
    await scoped.analyze({});
    assert.equal(seen[0], seen[1]);
    assert.ok(seen[0] > Date.now() + 4000);
  });
});
