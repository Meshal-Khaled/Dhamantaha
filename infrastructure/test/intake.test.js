import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { detectFileType } from '../src/intake/fileType.js';
import { prepareImage } from '../src/intake/image.js';
import { assessExtractedText, readPdf } from '../src/intake/pdf.js';
import { RECEIPT_LINES, makeHeicLikeBytes, makeImage, makePdf } from './helpers.js';

const limits = { imageMaxDimension: 1000, maxImagePixels: 50_000_000 };

describe('detectFileType', () => {
  it('recognizes every accepted format by its bytes', async () => {
    assert.equal(detectFileType(await makeImage({ format: 'jpeg' })).mimeType, 'image/jpeg');
    assert.equal(detectFileType(await makeImage({ format: 'png' })).mimeType, 'image/png');
    assert.equal(detectFileType(await makeImage({ format: 'webp' })).mimeType, 'image/webp');
    assert.equal(detectFileType(await makeImage({ format: 'avif' })).mimeType, 'image/avif');
    assert.equal(detectFileType(makeHeicLikeBytes()).mimeType, 'image/heic');
    assert.equal(detectFileType(makePdf([RECEIPT_LINES])).mimeType, 'application/pdf');
  });

  it('accepts a PDF header after leading bytes, as PDF readers do', () => {
    assert.equal(detectFileType(Buffer.concat([Buffer.alloc(100), Buffer.from('%PDF-1.4')])).kind, 'pdf');
  });

  it('rejects other content', () => {
    for (const bytes of [Buffer.alloc(0), Buffer.from('GIF89a'), Buffer.from('<html>'), Buffer.from([0xff, 0xd8])]) {
      assert.equal(detectFileType(bytes), null);
    }
  });
});

describe('prepareImage', () => {
  it('removes EXIF, including GPS and owner details', async () => {
    const input = await makeImage({
      exif: { IFD0: { Copyright: 'SECRET-OWNER' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '24/1 42/1 0/1' } },
    });
    assert.ok((await sharp(input).metadata()).exif, 'fixture has EXIF');
    const { data, mimeType, prepared } = await prepareImage(input, 'image/jpeg', limits);
    assert.equal(mimeType, 'image/jpeg');
    assert.equal(prepared, 'reencoded');
    const metadata = await sharp(data).metadata();
    assert.equal(metadata.exif, undefined);
    assert.doesNotMatch(data.toString('latin1'), /SECRET-OWNER/);
  });

  it('applies EXIF orientation', async () => {
    const input = await sharp(await makeImage({ width: 400, height: 200 })).withMetadata({ orientation: 6 }).toBuffer();
    const { data } = await prepareImage(input, 'image/jpeg', limits);
    const metadata = await sharp(data).metadata();
    assert.deepEqual([metadata.width, metadata.height], [200, 400]);
  });

  it('shrinks large photos without enlarging small ones', async () => {
    const large = await prepareImage(await makeImage({ width: 3000, height: 1500 }), 'image/jpeg', limits);
    const largeMeta = await sharp(large.data).metadata();
    assert.deepEqual([largeMeta.width, largeMeta.height], [1000, 500]);

    const small = await prepareImage(await makeImage({ width: 300, height: 200 }), 'image/jpeg', limits);
    const smallMeta = await sharp(small.data).metadata();
    assert.deepEqual([smallMeta.width, smallMeta.height], [300, 200]);
  });

  it('flattens transparency onto white', async () => {
    const { data } = await prepareImage(await makeImage({ format: 'png', alpha: true, width: 20, height: 20 }), 'image/png', limits);
    const { data: pixels } = await sharp(data).raw().toBuffer({ resolveWithObject: true });
    assert.ok(pixels[0] > 240 && pixels[1] > 240 && pixels[2] > 240);
  });

  it('passes undecodable HEIC through and rejects other unreadable images', async () => {
    const heic = makeHeicLikeBytes();
    assert.deepEqual(await prepareImage(heic, 'image/heic', limits), { data: heic, mimeType: 'image/heic', prepared: 'passthrough' });
    await assert.rejects(prepareImage(Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg', limits), { code: 'invalid_file' });
  });

  it('enforces the pixel limit', async () => {
    await assert.rejects(prepareImage(await makeImage({ width: 200, height: 200 }), 'image/jpeg', { ...limits, maxImagePixels: 10_000 }), {
      code: 'image_too_large',
    });
  });
});

describe('readPdf', () => {
  it('extracts text per page and leaves the input intact', async () => {
    const pdf = makePdf([RECEIPT_LINES, ['Page two of the invoice with enough text to count']]);
    const copy = Buffer.from(pdf);
    const { pageCount, pages } = await readPdf(pdf, { maxPdfPages: 10 });
    assert.equal(pageCount, 2);
    assert.match(pages[0], /Total: 3,499.00 SAR/);
    assert.ok(pdf.equals(copy));
  });
});

describe('assessExtractedText', () => {
  const receiptText = RECEIPT_LINES.join('\n');

  it('accepts readable English and Arabic text', () => {
    assert.deepEqual(assessExtractedText([receiptText, receiptText]), { usable: true });
    assert.equal(assessExtractedText(['مكتبة جرير\nرقم الفاتورة ١٢٣٤٥\nالإجمالي ٢٥٠ ريال\nضمان سنتين']).usable, true);
  });

  it('treats pages without text as scanned', () => {
    assert.deepEqual(assessExtractedText([receiptText, '  \n ']), { usable: false, reason: 'page_without_text' });
    assert.deepEqual(assessExtractedText([]), { usable: false, reason: 'no_pages' });
  });

  it('detects broken font mappings', () => {
    assert.equal(assessExtractedText([`${receiptText}${'\u{FFFD}'.repeat(10)}`]).reason, 'garbled_text');
    assert.equal(assessExtractedText([`${receiptText} ${'#$%&*+=<>|~^'.repeat(30)}`]).reason, 'garbled_text');
  });
});
