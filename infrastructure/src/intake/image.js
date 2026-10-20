import sharp from 'sharp';
import { AppError } from '../errors.js';

// Decoded pixels must not linger in sharp's cache after a request.
sharp.cache(false);

// Gemini reads HEIC/HEIF natively; sharp's prebuilt libheif decodes only AV1 (AVIF).
const PASSTHROUGH_TYPES = new Set(['image/heic', 'image/heif']);

/**
 * Normalizes a photo before analysis: applies EXIF orientation, shrinks it to
 * `imageMaxDimension`, flattens transparency onto white, and re-encodes it as
 * JPEG without any metadata (removing GPS and device details).
 *
 * Returns `{ data, mimeType, prepared }`, where `prepared` is 'reencoded' or
 * 'passthrough' (HEIC/HEIF that sharp cannot decode, sent unchanged).
 */
export async function prepareImage(buffer, mimeType, { imageMaxDimension, maxImagePixels }) {
  let metadata;
  try {
    metadata = await sharp(buffer, { limitInputPixels: false }).metadata();
  } catch {
    if (PASSTHROUGH_TYPES.has(mimeType)) return { data: buffer, mimeType, prepared: 'passthrough' };
    throw unreadableImage();
  }

  const width = metadata.autoOrient?.width ?? metadata.width;
  const height = metadata.autoOrient?.height ?? metadata.height;
  if (!width || !height) throw unreadableImage();
  if (width * height > maxImagePixels) {
    throw new AppError(422, 'image_too_large', 'This image has too many pixels. Use a normal photo of the receipt.');
  }

  try {
    const data = await sharp(buffer, { limitInputPixels: maxImagePixels })
      .autoOrient()
      .resize({ width: imageMaxDimension, height: imageMaxDimension, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { data, mimeType: 'image/jpeg', prepared: 'reencoded' };
  } catch {
    if (PASSTHROUGH_TYPES.has(mimeType)) return { data: buffer, mimeType, prepared: 'passthrough' };
    throw unreadableImage();
  }
}

function unreadableImage() {
  return new AppError(422, 'invalid_file', 'This image could not be read. It may be damaged; try taking the photo again.');
}
