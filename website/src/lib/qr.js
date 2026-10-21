// QR codes for the page the other teams scan. The squares come from qrcode-generator; everything else is plain
// data (a grid, an SVG path, pixels), so the page can draw it and a test can decode it again to prove it scans.
import qrcode from 'qrcode-generator';

/** The standard asks for four squares of empty border so a phone can find the code's edge. */
export const QUIET_ZONE = 4;

/** The squares of a QR code for `text`, row by row (true = dark). Error correction M lets a code survive some wear. */
export function qrMatrix(text, level = 'M') {
  const code = qrcode(0, level); // 0 = the smallest version that fits the text
  code.addData(text, 'Byte');
  code.make();
  const size = code.getModuleCount();
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, column) => code.isDark(row, column)));
}

/** One SVG path that draws every dark square, in a grid with the quiet zone included. */
export function qrPath(matrix, quiet = QUIET_ZONE) {
  let d = '';
  matrix.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) { x++; continue; }
      let end = x;
      while (end < row.length && row[end]) end++;
      d += `M${x + quiet} ${y + quiet}h${end - x}v1h-${end - x}z`;
      x = end;
    }
  });
  return { size: matrix.length + quiet * 2, d };
}

/** A standalone SVG file for the code, dark squares on white. */
export function qrSvg(matrix, { dark = '#0a2925', pixels = 1000 } = {}) {
  const { size, d } = qrPath(matrix);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${pixels}" height="${pixels}" shape-rendering="crispEdges">`
    + `<rect width="${size}" height="${size}" fill="#ffffff"/><path d="${d}" fill="${dark}"/></svg>`;
}

/** The same picture as RGBA pixels, for a PNG and for decoding in tests. */
export function qrPixels(matrix, pixelsPerModule = 8, { quiet = QUIET_ZONE, dark = [10, 41, 37] } = {}) {
  const modules = matrix.length + quiet * 2;
  const width = modules * pixelsPerModule;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  matrix.forEach((row, y) => row.forEach((isDark, x) => {
    if (!isDark) return;
    for (let dy = 0; dy < pixelsPerModule; dy++) {
      for (let dx = 0; dx < pixelsPerModule; dx++) {
        const at = (((y + quiet) * pixelsPerModule + dy) * width + (x + quiet) * pixelsPerModule + dx) * 4;
        data[at] = dark[0]; data[at + 1] = dark[1]; data[at + 2] = dark[2];
      }
    }
  }));
  return { width, height: width, data };
}

/**
 * The address a code should open, from whatever was typed or passed in. A bare site name gets https:// in front and
 * the teams page path behind it, so "web-dhamantaha.arc-homlab.com" is enough; a full address is kept as it is.
 * A bare address on this computer or a private network gets http://, because nothing there has a certificate.
 * Only http and https are accepted. Returns null when the text is not a web address.
 */
export function normalizeAddress(input, path = '/teams') {
  const text = String(input ?? '').trim();
  if (!text) return null;
  try {
    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
    let url = new URL(hasScheme ? text : `https://${text}`);
    if (!hasScheme && isPrivateHost(url.hostname)) url = new URL(`http://${text}`);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password) return null;
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
    if (url.pathname === '/' && !url.search && !url.hash) url.pathname = path;
    return url.href;
  } catch {
    return null;
  }
}

/** The teams page on `site` (the website's address), or on `override` when a valid one is given. */
export function pageAddress(site, override = null, path = '/teams') {
  return normalizeAddress(override, path) ?? normalizeAddress(site, path) ?? `https://example.invalid${path}`;
}

/** True for addresses a phone cannot reach: this computer, or a private network. */
export function isPrivateHost(hostname) {
  return /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/.test(hostname) || !hostname.includes('.');
}

/**
 * The website the code should lead to. When this page is opened on a public address, that address is the website.
 * When it is opened on a private one (the development server, an SSH forward to port 3101) a phone could never
 * follow the code, so the public site is used instead.
 */
export function siteForCode(origin, publicSite) {
  try {
    if (!isPrivateHost(new URL(origin).hostname)) return origin;
  } catch { /* an unreadable origin falls through to the public site */ }
  return publicSite || origin;
}
