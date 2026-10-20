import multer from 'multer';
import { AppError } from '../errors.js';

export function formatMegabytes(bytes) {
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

/**
 * Parses one multipart file under `file` into memory. Memory storage never
 * writes the upload to disk; the size limit rejects oversized files instead of
 * spooling them. Per-type limits are checked after the type is known.
 */
export function receiptUpload({ maxUploadBytes }) {
  const parser = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxUploadBytes,
      files: 1,
      fields: 5,
      fieldSize: 1024,
      parts: 6,
      headerPairs: 100,
    },
  }).single('file');

  return (req, res, next) => {
    parser(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        next(new AppError(413, 'file_too_large', `The file is larger than the ${formatMegabytes(maxUploadBytes)} limit.`));
        return;
      }
      const wrongField = err instanceof multer.MulterError && ['LIMIT_FILE_COUNT', 'LIMIT_UNEXPECTED_FILE'].includes(err.code);
      next(
        new AppError(
          400,
          'invalid_upload',
          wrongField ? 'Send exactly one file in the "file" field.' : 'The upload could not be read. Send one file in the "file" field.',
        ),
      );
    });
  };
}
