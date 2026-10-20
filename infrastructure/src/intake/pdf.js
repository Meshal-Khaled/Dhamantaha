import { extractText, getDocumentProxy } from 'unpdf';
import { AppError } from '../errors.js';

/**
 * Opens the PDF in memory, enforces the page limit, and extracts embedded text
 * per page. pdf.js may detach the buffer it receives, so it gets a copy and the
 * original stays available for visual analysis.
 */
export async function readPdf(buffer, { maxPdfPages }) {
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buffer), { isEvalSupported: false });
  } catch (err) {
    if (err?.name === 'PasswordException') {
      throw new AppError(422, 'pdf_password_protected', 'This PDF is password-protected. Upload an unprotected copy.');
    }
    throw invalidPdf();
  }

  try {
    if (pdf.numPages > maxPdfPages) {
      throw new AppError(
        422,
        'too_many_pages',
        `This PDF has ${pdf.numPages} pages; the limit is ${maxPdfPages}. Upload only the receipt pages.`,
      );
    }
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    return { pageCount: totalPages, pages: text };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw invalidPdf();
  } finally {
    await pdf.loadingTask.destroy();
  }
}

function invalidPdf() {
  return new AppError(422, 'invalid_file', 'This PDF could not be read. It may be damaged; try exporting it again.');
}

const MIN_MEANINGFUL_CHARS_PER_PAGE = 20;
const MIN_MEANINGFUL_RATIO = 0.5;
const MAX_SUSPICIOUS_RATIO = 0.02;
const MAX_TEXT_CHARS = 100_000;

/**
 * Decides whether embedded text can stand in for the PDF. A page without
 * enough text is treated as scanned, so mixed PDFs go to visual analysis
 * instead of losing their scanned pages.
 */
export function assessExtractedText(pages) {
  if (pages.length === 0) return { usable: false, reason: 'no_pages' };

  let totalChars = 0;
  for (const page of pages) {
    const chars = [...page.replace(/\s+/gu, '')];
    totalChars += chars.length;
    let meaningful = 0;
    let suspicious = 0;
    for (const ch of chars) {
      if (/[\p{L}\p{N}]/u.test(ch)) meaningful += 1;
      // Replacement, private-use, and control characters indicate broken font mappings.
      if (/[\u{FFFD}\p{Co}\p{Cc}]/u.test(ch)) suspicious += 1;
    }
    if (meaningful < MIN_MEANINGFUL_CHARS_PER_PAGE) return { usable: false, reason: 'page_without_text' };
    if (meaningful / chars.length < MIN_MEANINGFUL_RATIO || suspicious / chars.length > MAX_SUSPICIOUS_RATIO) {
      return { usable: false, reason: 'garbled_text' };
    }
  }
  if (totalChars > MAX_TEXT_CHARS) return { usable: false, reason: 'text_too_long' };
  return { usable: true };
}

export function formatPagesForPrompt(pages) {
  return pages.map((text, index) => `--- Page ${index + 1} ---\n${text.trim()}`).join('\n\n');
}
