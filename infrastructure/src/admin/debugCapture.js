import sharp from 'sharp';

const MAX_ENTRIES = 60;
const MAX_AGE_MS = 60 * 60 * 1000;
const MAX_TEXT_CHARS = 20_000;
const PREVIEW_EDGE = 900;

/**
 * Dashboard debugging aid. While switched on, it keeps what each analysis
 * request received and sent back (including receipt text and a small preview
 * of photos) so a wrong reading can be traced from the Monitoring page. It is
 * process memory only: never written to disk or logs, capped at 60 entries
 * (the same as the recent-requests list), expired after an hour, and emptied
 * when switched off or on restart. DEBUG_CAPTURE=false starts it switched off.
 */
export function createDebugCapture({ enabled = false, now = () => Date.now() } = {}) {
  let on = Boolean(enabled);
  const entries = [];
  const prune = () => {
    const cutoff = now() - MAX_AGE_MS;
    while (entries.length && entries[entries.length - 1].capturedAt < cutoff) entries.pop();
  };
  return {
    get enabled() {
      return on;
    },
    setEnabled(value) {
      on = Boolean(value);
      if (!on) entries.length = 0;
    },
    /** Records one POST /v1/receipts/analyze: what arrived, what went to the model, what was answered. */
    middleware(req, res, next) {
      if (!on || req.method !== 'POST' || !['/v1/receipts/analyze', '/v1/warranty/explain'].includes(req.path)) return next();
      const started = Date.now();
      const path = req.path; // read now: routers rewrite req.path while handling
      const record = { calls: [], upload: null, responseBody: null };
      res.locals.capture = record;
      const respond = res.json.bind(res);
      res.json = (body) => {
        record.responseBody = body;
        return respond(body);
      };
      let committed = false;
      const commit = () => {
        if (committed) return;
        committed = true;
        const aborted = !res.writableFinished;
        this.add({
          requestId: req.id,
          durationMs: Date.now() - started,
          status: aborted ? null : res.statusCode,
          request: {
            method: req.method,
            path,
            headers: {
              contentType: req.get('content-type') ?? null,
              contentLength: req.get('content-length') ?? null,
              userAgent: req.get('user-agent') ?? null,
              origin: req.get('origin') ?? null,
              clientKey: req.get('x-client-key') ? 'sent' : 'missing', // the value is never kept
            },
            upload: record.upload && { ...record.upload, detectedType: res.locals.logFields?.fileType ?? null },
          },
          processing: { ...res.locals.logFields },
          modelCalls: record.calls,
          response: aborted ? null : { status: res.statusCode, body: record.responseBody },
        });
      };
      res.on('finish', commit);
      res.on('close', commit);
      next();
    },
    add(entry) {
      if (!on) return;
      entries.unshift({ ...entry, capturedAt: now() });
      entries.length = Math.min(entries.length, MAX_ENTRIES);
    },
    list() {
      prune();
      return entries.map(({ capturedAt, ...entry }) => ({ ...entry, timestamp: new Date(capturedAt).toISOString() }));
    },
    clear() {
      entries.length = 0;
    },
    summary() {
      prune();
      return { enabled: on, count: entries.length, maxEntries: MAX_ENTRIES, maxAgeMinutes: MAX_AGE_MS / 60_000 };
    },
  };
}

/**
 * Wraps a provider so each call it receives is recorded in `calls`: what was
 * sent (extracted text, or a small preview of the image) and what came back.
 * Only call this while capture is on.
 */
export function recordingProvider(provider, calls, { model }) {
  return {
    get name() {
      return provider.name;
    },
    get configured() {
      return provider.configured !== false;
    },
    async analyze(input) {
      const started = Date.now();
      const call = { provider: provider.name, model: model || null, sent: await describeInput(input), attempts: [] };
      calls.push(call);
      try {
        call.rawOutput = await provider.analyze({ ...input, trace: call.attempts });
        return call.rawOutput;
      } catch (error) {
        call.error = { code: error?.code ?? 'error', message: String(error?.message ?? error).slice(0, 300) };
        throw error;
      } finally {
        call.durationMs = Date.now() - started;
      }
    },
  };
}

async function describeInput({ text, data, mimeType }) {
  if (text !== undefined) {
    return { kind: 'pdf_text', characters: text.length, text: text.slice(0, MAX_TEXT_CHARS), truncated: text.length > MAX_TEXT_CHARS };
  }
  const sent = { kind: mimeType === 'application/pdf' ? 'pdf_visual' : 'image', mimeType, bytes: data.length, preview: null };
  if (sent.kind === 'image') {
    try {
      const jpeg = await sharp(data).resize(PREVIEW_EDGE, PREVIEW_EDGE, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
      sent.preview = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
    } catch {
      // A preview is a convenience; the capture is still useful without it.
    }
  }
  return sent;
}
