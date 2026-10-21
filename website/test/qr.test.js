import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import jsQR from 'jsqr';
import { QUIET_ZONE, isPrivateHost, normalizeAddress, pageAddress, qrMatrix, qrPath, qrPixels, qrSvg, siteForCode } from '../src/lib/qr.js';
import { PUBLIC_SITE, TEAMS_PATH } from '../src/lib/site.js';

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

test('a site name or address becomes the address of its teams page', () => {
  assert.equal(normalizeAddress('web-dhamantaha.arc-homlab.com'), 'https://web-dhamantaha.arc-homlab.com/teams');
  assert.equal(normalizeAddress('  https://web-dhamantaha.arc-homlab.com  '), 'https://web-dhamantaha.arc-homlab.com/teams');
  assert.equal(normalizeAddress('https://web-dhamantaha.arc-homlab.com/'), 'https://web-dhamantaha.arc-homlab.com/teams');
  assert.equal(normalizeAddress('HTTP://Example.com:3101'), 'http://example.com:3101/teams');
  assert.equal(normalizeAddress('https://example.com/teams?from=qr'), 'https://example.com/teams?from=qr', 'a full address is kept as it is');
  assert.equal(normalizeAddress('https://example.com/other'), 'https://example.com/other');
  assert.equal(normalizeAddress('192.168.1.20:3101'), 'http://192.168.1.20:3101/teams', 'nothing on a private network has a certificate');
  assert.equal(normalizeAddress('localhost:5173'), 'http://localhost:5173/teams');
  assert.equal(normalizeAddress('https://192.168.1.20:3101'), 'https://192.168.1.20:3101/teams', 'unless https was asked for');
});

test('text that is not a web address is refused', () => {
  for (const text of ['', '   ', 'not a url', 'foo', 'javascript:alert(1)', 'javascript://x%0aalert(1)', 'ftp://example.com',
    'data:text/html,hi', 'mailto:someone@example.com', 'https://user:secret@example.com']) {
    assert.equal(normalizeAddress(text), null, text);
  }
  assert.equal(normalizeAddress(undefined), null);
  assert.equal(normalizeAddress(null), null);
});

test('an address that was typed wins, and a bad one falls back to the site', () => {
  assert.equal(pageAddress('https://site.example'), 'https://site.example/teams');
  assert.equal(pageAddress('https://site.example', 'other.example.org'), 'https://other.example.org/teams');
  assert.equal(pageAddress('https://site.example', 'javascript:alert(1)'), 'https://site.example/teams', 'only web addresses are accepted');
  assert.equal(pageAddress('https://site.example', 'not a url'), 'https://site.example/teams');
});

test('the code leads to the teams page of the public website, wherever the QR page is opened from', () => {
  const expected = `${PUBLIC_SITE}${TEAMS_PATH}`;
  const codeFor = (origin) => pageAddress(siteForCode(origin, PUBLIC_SITE));
  // A laptop, the development server and an SSH forward to port 3101 are all places a phone cannot reach.
  for (const origin of ['http://localhost:5173', 'http://127.0.0.1:3101', 'http://192.168.1.20:3101', 'http://the-ring:3101']) {
    assert.equal(codeFor(origin), expected, origin);
  }
  assert.equal(codeFor(PUBLIC_SITE), expected, 'opened on the website itself');
  assert.equal(codeFor('https://another.example.org'), 'https://another.example.org/teams', 'a public address is the website itself');
  assert.equal(siteForCode('not an origin', PUBLIC_SITE), PUBLIC_SITE);
  assert.equal(siteForCode('http://localhost:5173', ''), 'http://localhost:5173', 'with no public site set, the page address is all there is');

  const pixels = qrPixels(qrMatrix(codeFor('http://localhost:5173')), 6);
  assert.equal(jsQR(pixels.data, pixels.width, pixels.height)?.data, expected, 'and a phone camera reads exactly that');
});

test('the configured public site can be reached from a phone', () => {
  const url = new URL(PUBLIC_SITE);
  assert.equal(url.protocol, 'https:');
  assert.equal(isPrivateHost(url.hostname), false);
  assert.equal(url.pathname, '/', 'the page path is added separately');
  assert.ok(readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8').includes(`<Route path="${TEAMS_PATH}" `), 'the code leads to a page that exists');
  // Cloudflare's free certificate covers *.arc-homlab.com one level deep only; web.dhamantaha.arc-homlab.com failed TLS.
  assert.match(url.hostname, /^[a-z0-9-]+\.arc-homlab\.com$/, 'one label under the domain');
});

test('addresses a phone cannot reach are recognised', () => {
  for (const host of ['localhost', '127.0.0.1', '192.168.1.5', '10.0.0.8', '172.20.1.1', 'the-ring']) assert.ok(isPrivateHost(host), host);
  for (const host of ['web-dhamantaha.arc-homlab.com', 'example.com', '172.32.0.1', '8.8.8.8']) assert.equal(isPrivateHost(host), false, host);
});
