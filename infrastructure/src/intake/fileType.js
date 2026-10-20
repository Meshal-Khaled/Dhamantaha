const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF_MARKER = Buffer.from('%PDF-', 'latin1');
// PDF readers accept a header within the first 1024 bytes.
const PDF_HEADER_WINDOW = 1024;

// ISO-BMFF brands used by Android camera and gallery images.
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs']);
const AVIF_BRANDS = new Set(['avif', 'avis']);
const HEIF_BRANDS = new Set(['mif1', 'msf1', 'heif']);

export const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif'];

function isoBmffBrands(buffer) {
  if (buffer.length < 16 || buffer.toString('latin1', 4, 8) !== 'ftyp') return null;
  const boxSize = Math.min(buffer.readUInt32BE(0), buffer.length, 256);
  const brands = [buffer.toString('latin1', 8, 12)];
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    brands.push(buffer.toString('latin1', offset, offset + 4));
  }
  return brands;
}

/**
 * Identifies an upload from its bytes; the filename and declared MIME type are
 * ignored. Returns `{ kind, mimeType }` or null for unsupported content.
 */
export function detectFileType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { kind: 'image', mimeType: 'image/jpeg' };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { kind: 'image', mimeType: 'image/png' };
  }
  if (buffer.length >= 12 && buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') {
    return { kind: 'image', mimeType: 'image/webp' };
  }
  const brands = isoBmffBrands(buffer);
  if (brands) {
    if (brands.some((brand) => HEIC_BRANDS.has(brand))) return { kind: 'image', mimeType: 'image/heic' };
    if (brands.some((brand) => AVIF_BRANDS.has(brand))) return { kind: 'image', mimeType: 'image/avif' };
    if (brands.some((brand) => HEIF_BRANDS.has(brand))) return { kind: 'image', mimeType: 'image/heif' };
  }
  if (buffer.subarray(0, PDF_HEADER_WINDOW).includes(PDF_MARKER)) {
    return { kind: 'pdf', mimeType: 'application/pdf' };
  }
  return null;
}
