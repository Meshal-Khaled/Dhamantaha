import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import jsQR from 'jsqr';
import { PUBLIC_SITE, TEAMS_PATH } from '../src/lib/site.js';
import { encodePng } from '../scripts/png.mjs';

const script = fileURLToPath(new URL('../scripts/make-qr.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
const withFolder = (body) => {
  const folder = mkdtempSync(join(tmpdir(), 'make-qr-'));
  try { return body(folder); } finally { rmSync(folder, { recursive: true, force: true }); }
};

/** A PNG reader that shares nothing with the writer: it checks every chunk's CRC and undoes all five row filters. */
function decodePng(buffer) {
  assert.deepEqual([...buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'PNG signature');
  let offset = 8;
  let header;
  const parts = [];
  let ended = false;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (typeof zlib.crc32 === 'function') assert.equal(buffer.readUInt32BE(offset + 8 + length), zlib.crc32(buffer.subarray(offset + 4, offset + 8 + length)), `${type} checksum`);
    if (type === 'IHDR') header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], colour: body[9] };
    if (type === 'IDAT') parts.push(body);
    if (type === 'IEND') ended = true;
    offset += 12 + length;
  }
  assert.ok(ended, 'IEND chunk');
  assert.deepEqual([header.depth, header.colour], [8, 6], '8-bit RGBA');
  const { width, height } = header;
  const stride = width * 4;
  const raw = zlib.inflateSync(Buffer.concat(parts));
  assert.equal(raw.length, height * (stride + 1));
  const data = new Uint8ClampedArray(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? data[y * stride + x - 4] : 0;
      const up = y ? data[(y - 1) * stride + x] : 0;
      const upLeft = y && x >= 4 ? data[(y - 1) * stride + x - 4] : 0;
      let value = raw[y * (stride + 1) + 1 + x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      data[y * stride + x] = value & 255;
    }
  }
  return { width, height, data };
}

const scan = (file) => {
  const { width, height, data } = decodePng(readFileSync(file));
  return jsQR(data, width, height)?.data;
};

test('the PNG writer produces a valid file that reads back pixel for pixel', () => {
  const pixels = new Uint8ClampedArray([
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
    10, 41, 37, 255, 255, 255, 255, 255, 0, 0, 0, 128,
  ]);
  const decoded = decodePng(encodePng(3, 2, pixels));
  assert.deepEqual([decoded.width, decoded.height], [3, 2]);
  assert.deepEqual([...decoded.data], [...pixels]);
  assert.throws(() => encodePng(3, 2, new Uint8ClampedArray(5)), /does not match/);
});

test('the script writes a PNG and an SVG of the teams page address, and the PNG scans', () => withFolder((folder) => {
  const result = run('--out', folder);
  assert.equal(result.status, 0, result.stderr);
  const expected = `${PUBLIC_SITE}${TEAMS_PATH}`;
  assert.equal(scan(join(folder, 'dhamantaha-teams-qr.png')), expected);
  assert.match(readFileSync(join(folder, 'dhamantaha-teams-qr.svg'), 'utf8'), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.ok(result.stdout.includes(expected));
  assert.ok(!result.stdout.includes('Warning'), 'a public address needs no warning');
}));

test('a site name and a size can be given', () => withFolder((folder) => {
  const result = run('other.example.org', '--size', '600', '--out', folder);
  assert.equal(result.status, 0, result.stderr);
  const { width, height } = decodePng(readFileSync(join(folder, 'dhamantaha-teams-qr.png')));
  assert.equal(width, height);
  assert.ok(width >= 500 && width <= 700, `asked for about 600 px, got ${width}`);
  assert.equal(scan(join(folder, 'dhamantaha-teams-qr.png')), 'https://other.example.org/teams');
}));

test('an address a phone cannot reach is made, with a warning', () => withFolder((folder) => {
  const result = run('192.168.1.20:3101', '--out', folder);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(scan(join(folder, 'dhamantaha-teams-qr.png')), 'http://192.168.1.20:3101/teams');
  assert.match(result.stdout, /Warning: .*phones cannot reach/);
}));

test('text that is not an address, or a silly size, writes nothing', () => withFolder((folder) => {
  const out = join(folder, 'made');
  for (const args of [['not a url'], ['javascript:alert(1)'], ['--size', '50'], ['--size', 'big'], ['--size']]) {
    const result = run(...args, '--out', out);
    assert.equal(result.status, 1, args.join(' '));
    assert.ok(result.stderr.trim(), `${args.join(' ')} explains itself`);
    assert.equal(existsSync(out), false, `${args.join(' ')} writes nothing`);
  }
}));
