// A minimal PNG writer, so the QR files can be made without a browser. 8-bit RGBA, no filtering, deflate-compressed:
// a QR code is flat black and white, so a 1000 px picture is about 30 KB.
import { deflateSync } from 'node:zlib';

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** A PNG file (as a Buffer) from `width` x `height` RGBA pixels. */
export function encodePng(width, height, rgba) {
  if (rgba.length !== width * height * 4) throw new Error('The pixel data does not match the picture size.');
  const stride = width * 4;
  const rows = Buffer.alloc(height * (1 + stride)); // every row starts with its filter type, 0 = none
  for (let y = 0; y < height; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(rows, y * (1 + stride) + 1);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
