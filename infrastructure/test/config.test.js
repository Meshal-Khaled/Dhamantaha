import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig } from '../src/config.js';
import { createDailyBudget } from '../src/http/protection.js';
import { createProvider } from '../src/providers/index.js';

describe('loadConfig', () => {
  it('uses safe defaults', () => {
    const config = loadConfig({});
    assert.equal(config.host, '127.0.0.1');
    assert.equal(config.port, 3000);
    assert.deepEqual(config.corsOrigins, []);
    assert.deepEqual(config.clientKeys, []);
    assert.equal(config.analysisProvider, 'gemini');
    assert.equal(config.walletTimeZone, 'Asia/Riyadh');
    assert.equal(config.limits.maxUploadBytes, 20 * 1024 * 1024);
    assert.equal(config.limits.dailyProviderCallLimit, 500);
  });

  it('parses lists and client keys', () => {
    assert.deepEqual(loadConfig({ CORS_ORIGINS: 'https://localhost, ,http://localhost:5173' }).corsOrigins, [
      'https://localhost',
      'http://localhost:5173',
    ]);
    assert.deepEqual(loadConfig({ CLIENT_KEYS: 'android:0123456789abcdef,web-test:fedcba9876543210' }).clientKeys, [
      { name: 'android', key: '0123456789abcdef' },
      { name: 'web-test', key: 'fedcba9876543210' },
    ]);
  });

  it('fails fast on invalid values', () => {
    assert.throws(() => loadConfig({ MAX_PDF_PAGES: 'ten' }), /MAX_PDF_PAGES/);
    assert.throws(() => loadConfig({ PORT: '70000' }), /PORT/);
    assert.throws(() => loadConfig({ ENABLE_API_DOCS: 'maybe' }), /ENABLE_API_DOCS/);
    assert.throws(() => loadConfig({ ANALYSIS_PROVIDER: 'openai' }), /ANALYSIS_PROVIDER/);
    assert.throws(() => loadConfig({ CLIENT_KEYS: 'android:short' }), /CLIENT_KEYS/);
    assert.throws(() => loadConfig({ WALLET_TIME_ZONE: 'Mars/Base' }), /WALLET_TIME_ZONE/);
  });
});

describe('createProvider', () => {
  it('requires both the Gemini key and model', () => {
    assert.deepEqual(createProvider(loadConfig({})), { provider: null, missing: ['GEMINI_API_KEY', 'GEMINI_MODEL'] });
    assert.deepEqual(createProvider(loadConfig({ GEMINI_API_KEY: 'k' })).missing, ['GEMINI_MODEL']);
    assert.equal(createProvider(loadConfig({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'm' })).provider.name, 'gemini');
    assert.equal(createProvider(loadConfig({ ANALYSIS_PROVIDER: 'mock' })).provider.name, 'mock');
  });
});

describe('createDailyBudget', () => {
  it('resets at the next UTC day', () => {
    let now = new Date('2026-10-20T23:59:00Z');
    const budget = createDailyBudget(2, () => now);
    budget.consume();
    budget.consume();
    assert.deepEqual(budget.usage(), { limit: 2, used: 2 });
    now = new Date('2026-10-21T00:00:01Z');
    assert.deepEqual(budget.usage(), { limit: 2, used: 0 });
  });
});
