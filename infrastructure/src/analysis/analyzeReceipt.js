import { AppError } from '../errors.js';
import { formatMegabytes } from '../http/upload.js';
import { detectFileType } from '../intake/fileType.js';
import { prepareImage } from '../intake/image.js';
import { assessExtractedText, formatPagesForPrompt, readPdf } from '../intake/pdf.js';
import { normalizeProviderResponse } from './normalize.js';

/**
 * Runs one receipt through the matching path and returns wallet-ready data:
 * - images are cleaned up (rotated, resized, metadata removed) and analyzed visually (`image`);
 * - PDFs with usable embedded text send only that text (`pdf_text`);
 * - scanned, mixed, or poorly extracted PDFs, or text that yields no receipt
 *   content, are analyzed visually as PDFs (`pdf_visual`).
 *
 * `meta` collects log-safe labels; never receipt content.
 */
export async function analyzeReceipt(buffer, { provider, limits, today, signal, meta = {} }) {
  const fileType = detectFileType(buffer);
  if (!fileType) {
    throw new AppError(415, 'unsupported_file_type', 'Upload a photo (JPG, PNG, WebP, HEIC) or a PDF of the receipt.');
  }
  meta.fileType = fileType.mimeType;

  if (fileType.kind === 'image') {
    enforceSize(buffer, limits.maxImageBytes, 'photo');
    const image = await prepareImage(buffer, fileType.mimeType, limits);
    meta.imagePrepared = image.prepared;
    const result = await analyze(provider, { data: image.data, mimeType: image.mimeType, signal }, today);
    return finish('image', result);
  }

  enforceSize(buffer, limits.maxPdfBytes, 'PDF');
  const { pageCount, pages } = await readPdf(buffer, limits);
  meta.pdfPages = pageCount;

  const assessment = assessExtractedText(pages);
  if (assessment.usable) {
    const result = await analyze(provider, { text: formatPagesForPrompt(pages), signal }, today);
    if (result.readable) return finish('pdf_text', result);
    meta.pdfTextFallback = 'no_receipt_content';
  } else {
    meta.pdfTextFallback = assessment.reason;
  }

  const result = await analyze(provider, { data: buffer, mimeType: fileType.mimeType, signal }, today);
  return finish('pdf_visual', result);
}

function enforceSize(buffer, maxBytes, label) {
  if (buffer.length > maxBytes) {
    throw new AppError(413, 'file_too_large', `The ${label} is larger than the ${formatMegabytes(maxBytes)} limit.`);
  }
}

async function analyze(provider, input, today) {
  return normalizeProviderResponse(await provider.analyze(input), { today });
}

function finish(processingMethod, { readable, receipt, items, review }) {
  if (!readable) {
    throw new AppError(
      422,
      'unreadable_receipt',
      'No receipt details could be read. Retake the photo in good light with the whole receipt in view.',
    );
  }
  return { processingMethod, receipt, items, review };
}
