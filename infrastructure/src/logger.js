import pino from 'pino';

/**
 * JSON logger. Callers log metadata only: request IDs, paths, statuses,
 * durations, processing labels, and failure categories. Never file contents,
 * extracted text, analysis results, headers, client keys, or provider messages.
 *
 * `destination` is any object with `write(line)`; tests use it to capture output.
 */
export function createLogger({ level = 'info', destination } = {}) {
  return pino(
    {
      level,
      base: { service: 'dhamantaha-infrastructure' },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
    },
    destination,
  );
}
