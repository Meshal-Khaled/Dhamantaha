import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, webcrypto } from 'node:crypto';
import { newId, sha256Bytes, sha256Hex } from '../src/lib/ids.js';

const encode = (text) => new TextEncoder().encode(text);

/** Runs `work` the way a plain-HTTP page sees the world: random values exist, but subtle and randomUUID do not. */
async function onInsecurePage(work) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: (array) => webcrypto.getRandomValues(array) } });
  try { return await work(); } finally { Object.defineProperty(globalThis, 'crypto', original); }
}

test('sha256 matches the published test vectors', () => {
  assert.equal(sha256Bytes(encode('')), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256Bytes(encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256Bytes(encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')), '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  assert.equal(sha256Bytes(encode('a'.repeat(1_000_000))), 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
});

test('sha256 agrees with Node for lengths around the block and padding boundaries', () => {
  for (const length of [1, 2, 54, 55, 56, 57, 63, 64, 65, 119, 120, 121, 127, 128, 129, 1000, 4096]) {
    const bytes = randomBytes(length);
    assert.equal(sha256Bytes(bytes), createHash('sha256').update(bytes).digest('hex'), `length ${length}`);
  }
});

test('a file hashes the same with the browser implementation and without it', async () => {
  const file = new File([randomBytes(5000)], 'receipt.bin');
  const expected = createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex');
  assert.equal(await sha256Hex(file), expected);
  assert.equal(await onInsecurePage(() => sha256Hex(file)), expected);
});

test('ids are version 4 UUIDs with or without randomUUID', async () => {
  const version4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert.match(newId(), version4);
  const ids = await onInsecurePage(() => Array.from({ length: 50 }, newId));
  for (const id of ids) assert.match(id, version4);
  assert.equal(new Set(ids).size, 50);
});
