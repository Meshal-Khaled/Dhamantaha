import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { createRuntime } from '../src/admin/runtime.js';
import { loadConfig } from '../src/config.js';
import { cleanBaseUrl, createRemoteProvider, providerJson, publicAddress } from '../src/providers/remote.js';
import { presetFor } from '../src/providers/catalog.js';
import { sampleProviderResponse, withServer } from './helpers.js';

const profile = (type = 'openrouter') => ({ id: 'provider-test', type, label: 'Work', model: 'vendor/model:free',
  baseUrl: presetFor(type).baseUrl || 'https://custom.example/v1', apiKey: 'private-test-provider-key' });
describe('additional provider profiles', () => {
  it('persists, edits, activates and removes profiles without returning keys or losing Gemini', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'provider-profiles-'));
    const config = () => loadConfig({ ADMIN_STATE_DIRECTORY: directory, GEMINI_API_KEY: 'original-ring-key', GEMINI_MODEL: 'gemini-original' });
    const remoteFactory = (entry) => ({ name: entry.type, analyze: async () => entry.model, check: async () => ({ ok: true }) });
    try {
      const runtime = createRuntime(config(), { remoteFactory });
      const saved = await runtime.addProfile({ ...profile(), baseUrl: 'https://ignored.example' });
      const entry = saved.providers.at(-1);
      assert.equal(entry.baseUrl, presetFor('openrouter').baseUrl);
      assert.equal(saved.activeProvider, 'gemini');
      assert.doesNotMatch(JSON.stringify(saved), /private-test|original-ring-key|apiKey/);
      await runtime.activate(entry.id);
      assert.equal(await runtime.provider.analyze({}), 'vendor/model:free');
      await runtime.save({ providerId: entry.id, model: 'next/model', apiKey: '' });
      const restored = createRuntime(config(), { remoteFactory });
      assert.equal(restored.summary().activeProvider, entry.id);
      assert.equal(await restored.provider.analyze({}), 'next/model');
      assert.equal(JSON.parse(await readFile(join(directory, 'provider.json'))).providers[0].apiKey, profile().apiKey);
      await assert.rejects(restored.removeProfile(entry.id), { code: 'invalid_settings' });
      await restored.activate('gemini');
      assert.equal(restored.summary().model, 'gemini-original');
      assert.equal(restored.summary().keySource, 'ring');
      await restored.removeProfile(entry.id);
      assert.equal(restored.summary().providers.length, 1);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('requires an authenticated dashboard session for new provider routes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'provider-routes-'));
    try {
      await withServer({ env: { ADMIN_STATE_DIRECTORY: directory, ADMIN_KEY: 'test-admin-key' } }, async ({ baseUrl }) => {
        const headers = { 'Content-Type': 'application/json', 'X-Dashboard-Request': '1' };
        assert.equal((await fetch(`${baseUrl}/admin/api/providers`, { method: 'POST', headers, body: JSON.stringify(profile()) })).status, 401);
        const login = await fetch(`${baseUrl}/admin/api/login`, { method: 'POST', headers, body: JSON.stringify({ key: 'test-admin-key' }) });
        headers.Cookie = login.headers.get('set-cookie').split(';')[0];
        const created = await fetch(`${baseUrl}/admin/api/providers`, { method: 'POST', headers, body: JSON.stringify(profile()) });
        assert.equal(created.status, 201);
        const data = await created.json();
        assert.equal(data.providers.length, 2);
        assert.doesNotMatch(JSON.stringify(data), /private-test-provider-key/);
      });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('rejects invalid profiles before persisting anything', async () => {
    const runtime = createRuntime(loadConfig({}));
    for (const bad of [{ ...profile(), type: 'unknown' }, { ...profile(), apiKey: 'bad\nkey' }, { ...profile(), model: '../escape' },
      { ...profile('custom'), baseUrl: 'http://127.0.0.1:3100' }]) assert.throws(() => runtime.addProfile(bad), { code: 'invalid_settings' });
  });
  it('reloads additional providers even when the original Gemini has not been configured', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'provider-first-'));
    const config = () => loadConfig({ ADMIN_STATE_DIRECTORY: directory });
    try {
      const runtime = createRuntime(config());
      const data = await runtime.addProfile(profile());
      await runtime.activate(data.providers.at(-1).id);
      assert.equal(createRuntime(config()).summary().provider, 'openrouter');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});

describe('remote analysis adapters', () => {
  it('sends text, photos and PDFs through the saved compatible endpoint', async () => {
    const calls = [];
    const provider = createRemoteProvider(profile(), { send: async (url, options) => {
      calls.push({ url, ...options });
      return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(sampleProviderResponse()) } }] };
    } });
    assert.equal((await provider.analyze({ text: 'Synthetic receipt' })).readable, true);
    await provider.analyze({ data: Buffer.from('photo'), mimeType: 'image/jpeg' });
    await provider.analyze({ data: Buffer.from('pdf'), mimeType: 'application/pdf' });
    assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(calls[0].body.model, 'vendor/model:free');
    assert.match(calls[0].body.messages[0].content, /JSON object matching this schema/);
    assert.match(calls[1].body.messages[1].content[1].image_url.url, /^data:image\/jpeg;base64,/);
    assert.match(calls[2].body.messages[1].content[1].file.file_data, /^data:application\/pdf;base64,/);
  });
  it('uses Anthropic messages and preserves warranty coverage prompts', async () => {
    let call;
    const provider = createRemoteProvider(profile('anthropic'), { send: async (url, options) => {
      call = { url, ...options };
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"readable":false,"coverage":null}' }] };
    } });
    await provider.analyze({ data: Buffer.from('terms'), mimeType: 'application/pdf', purpose: 'coverage', language: 'ar', product: 'Laptop' });
    assert.equal(call.url, 'https://api.anthropic.com/v1/messages');
    assert.equal(call.protocol, 'anthropic');
    assert.equal(call.body.messages[0].content[0].type, 'document');
    assert.match(call.body.messages[0].content[1].text, /Arabic/);
    assert.match(call.body.system, /coverage/);
  });
  it('checks the chosen model, rejects unsupported files and redacts provider failures', async () => {
    const checked = createRemoteProvider(profile('custom'), { send: async () => ({ data: [{ id: 'vendor/model:free' }] }) });
    assert.equal((await checked.check()).ok, true);
    await assert.rejects(checked.analyze({ data: Buffer.from('pdf'), mimeType: 'application/pdf' }), { code: 'unreadable_receipt' });
    const failed = createRemoteProvider(profile(), { send: async () => { throw new Error(profile().apiKey); } });
    await assert.rejects(failed.analyze({ text: 'receipt' }), (err) => err.code === 'analysis_unavailable' && !err.message.includes(profile().apiKey));
    const incomplete = createRemoteProvider(profile(), { send: async () => ({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }) });
    await assert.rejects(incomplete.analyze({ text: 'receipt' }), { code: 'analysis_malformed' });
  });
  it('blocks private and metadata destinations before sending any credential', async () => {
    for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '100.100.100.200', '192.168.1.1', '192.0.2.1', '::1', '::ffff:127.0.0.1', 'fc00::1', '2001:db8::1']) assert.equal(publicAddress(ip), false, ip);
    assert.equal(publicAddress('8.8.8.8'), true);
    assert.equal(publicAddress('2606:4700:4700::1111'), true);
    for (const url of ['http://api.example/v1', 'https://user:pass@api.example/v1', 'https://127.0.0.1/v1', 'https://api.example/v1?key=secret']) assert.throws(() => cleanBaseUrl(url));
    await assert.rejects(providerJson('https://public.example/v1/models', { apiKey: 'secret', resolve: async () => [{ address: '10.0.0.1', family: 4 }] }), { code: 'invalid_settings' });
  });
  it('pins public DNS addresses, refuses redirects, and never returns upstream errors', async () => {
    let requests = 0;
    const resolve = async () => [{ address: '8.8.8.8', family: 4 }];
    const requestImpl = (_url, options, callback) => {
      requests++;
      options.lookup('public.example', {}, (_err, address) => assert.equal(address, '8.8.8.8'));
      const req = new EventEmitter();
      req.end = () => {
        const res = new EventEmitter();
        res.statusCode = 302;
        res.headers = { location: 'https://127.0.0.1/private' };
        callback(res);
        res.emit('data', Buffer.from('upstream-private-error'));
        res.emit('end');
      };
      return req;
    };
    await assert.rejects(providerJson('https://public.example/v1/models', { apiKey: 'secret', resolve, requestImpl }), (error) =>
      error.code === 'analysis_unavailable' && !error.message.includes('upstream-private-error'));
    assert.equal(requests, 1);
  });
  it('cancels stalled DNS resolution when the request is aborted', async () => {
    const controller = new AbortController();
    const pending = providerJson('https://public.example/v1/models', { signal: controller.signal, resolve: () => new Promise(() => {}) });
    controller.abort(new Error('cancelled-test'));
    await assert.rejects(pending, /cancelled-test/);
  });
});
