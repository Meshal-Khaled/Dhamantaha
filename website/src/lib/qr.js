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
 * The address the code should open: the teams page on this site, or `override` when one is given (to make a code
 * for the public address from a computer that is not on it). Only http and https addresses are accepted.
 */
export function pageAddress(origin, override = null) {
  const candidate = override || `${origin}/teams`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('not a web address');
    return url.href;
  } catch {
    return new URL('/teams', origin).href;
  }
}

/** True for addresses a phone cannot reach: this computer, or a private network. */
export function isPrivateHost(hostname) {
  return /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/.test(hostname) || !hostname.includes('.');
}
