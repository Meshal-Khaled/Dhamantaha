// Makes the QR code for the teams page as files for a presentation: a PNG for slides and an SVG for print.
//   npm run qr                                  the teams page of the public website
//   npm run qr -- web-dhamantaha.arc-homlab.com  another site name or address (https:// and /teams are added)
//   npm run qr -- --out <folder> --size 1600     another folder (default: website/qr) and picture size in pixels
// It needs no browser and no internet, and it checks that a QR decoder reads the picture back.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import jsQR from 'jsqr';
import { QUIET_ZONE, isPrivateHost, normalizeAddress, pageAddress, qrMatrix, qrPixels, qrSvg } from '../src/lib/qr.js';
import { PUBLIC_SITE } from '../src/lib/site.js';
import { encodePng } from './png.mjs';

const args = process.argv.slice(2);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function takeOption(name) {
  const at = args.indexOf(name);
  if (at === -1) return undefined;
  const [, value] = args.splice(at, 2);
  if (value === undefined) fail(`${name} needs a value.`);
  return value;
}

const outDir = resolve(takeOption('--out') ?? join(import.meta.dirname, '..', 'qr'));
const size = Number(takeOption('--size') ?? 1000);
if (!Number.isInteger(size) || size < 200 || size > 4000) fail('--size must be a whole number of pixels between 200 and 4000.');

const typed = args.join(' ').trim();
const address = typed ? normalizeAddress(typed) : pageAddress(PUBLIC_SITE);
if (!address) fail(`"${typed}" is not a web address. Example: web-dhamantaha.arc-homlab.com`);

const matrix = qrMatrix(address);
// Whole pixels per square keep every edge sharp, so the picture lands near the asked size, not exactly on it.
const picture = qrPixels(matrix, Math.max(1, Math.round(size / (matrix.length + QUIET_ZONE * 2))));
const decoded = jsQR(picture.data, picture.width, picture.height)?.data;
if (decoded !== address) fail(`The picture did not read back as the address (got ${decoded ?? 'nothing'}). Nothing was written.`);

mkdirSync(outDir, { recursive: true });
const pngFile = join(outDir, 'dhamantaha-teams-qr.png');
const svgFile = join(outDir, 'dhamantaha-teams-qr.svg');
writeFileSync(pngFile, encodePng(picture.width, picture.height, picture.data));
writeFileSync(svgFile, qrSvg(matrix));

console.log(`Address:  ${address}`);
console.log(`PNG:      ${pngFile}  (${picture.width} x ${picture.height} px)`);
console.log(`SVG:      ${svgFile}`);
console.log('Checked:  a QR decoder reads the picture back as that address.');
if (isPrivateHost(new URL(address).hostname)) console.log('Warning:  phones cannot reach this address (it is on this computer or a private network).');
