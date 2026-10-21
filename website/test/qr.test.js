import test from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { QUIET_ZONE, isPrivateHost, pageAddress, qrMatrix, qrPath, qrPixels, qrSvg } from '../src/lib/qr.js';

const addresses = [
  'https://web-dhamantaha.arc-homlab.com/teams',
  'https://web.dhamantaha.arc-homlab.com/teams?from=qr',
  'http://192.168.1.20:3101/teams',
  'https://example.com/a/very/long/path/to/make/the/code/bigger/and/denser/than/the/short/ones/teams?utm_source=presentation&team=x',
];

test('every code decodes back to the address it was made from', () => {
  for (const address of addresses) {
    const pixels = qrPixels(qrMatrix(address), 6);
    const decoded = jsQR(pixels.data, pixels.width, pixels.height);
    assert.equal(decoded?.data, address, address);
  }
});

test('a code can be read even when it is shown small', () => {
  const address = addresses[0];
  const pixels = qrPixels(qrMatrix(address), 3);
  assert.equal(jsQR(pixels.data, pixels.width, pixels.height)?.data, address);
});

test('the SVG path draws exactly the dark squares, inside the quiet zone', () => {
  const matrix = qrMatrix(addresses[0]);
  const { size, d } = qrPath(matrix);
  assert.equal(size, matrix.length + QUIET_ZONE * 2);
  const drawn = new Set();
  for (const [, x, y, width] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let column = 0; column < Number(width); column++) drawn.add(`${Number(x) + column},${y}`);
  }
  const dark = new Set();
  matrix.forEach((row, y) => row.forEach((isDark, x) => { if (isDark) dark.add(`${x + QUIET_ZONE},${y + QUIET_ZONE}`); }));
  assert.deepEqual([...drawn].sort(), [...dark].sort());
  const svg = qrSvg(matrix);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 \d+ \d+"/);
  assert.ok(svg.includes(`d="${d}"`));
});

test('the address comes from this site, an override, or falls back safely', () => {
  assert.equal(pageAddress('https://site.example'), 'https://site.example/teams');
  assert.equal(pageAddress('https://site.example', 'https://web-dhamantaha.arc-homlab.com/teams'), 'https://web-dhamantaha.arc-homlab.com/teams');
  assert.equal(pageAddress('https://site.example', 'javascript:alert(1)'), 'https://site.example/teams', 'only web addresses are accepted');
  assert.equal(pageAddress('https://site.example', 'not a url'), 'https://site.example/teams');
});

test('addresses a phone cannot reach are recognised', () => {
  for (const host of ['localhost', '127.0.0.1', '192.168.1.5', '10.0.0.8', '172.20.1.1', 'the-ring']) assert.ok(isPrivateHost(host), host);
  for (const host of ['web-dhamantaha.arc-homlab.com', 'example.com', '172.32.0.1', '8.8.8.8']) assert.equal(isPrivateHost(host), false, host);
});
