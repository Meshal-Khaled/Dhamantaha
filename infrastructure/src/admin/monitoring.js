import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROUTES = ['/v1/receipts/analyze', '/v1/warranty/explain'];
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const HOURS_KEPT = 7 * 24;
const SAVE_DELAY_MS = 3000;

const count = (value) => (Number.isSafeInteger(value) && value > 0 ? value : 0);
const bucketsFrom = (saved) => new Map(Object.entries(saved ?? {}).filter(([key]) => /^\d+$/.test(key))
  .map(([key, value]) => [Number(key), { requests: count(value?.requests), errors: count(value?.errors), durationMs: count(value?.durationMs) }]));

/**
 * Bounded operational metadata; never receipt contents or secrets. With a state
 * directory, the counters, the last 60 requests and seven days of hourly
 * activity are saved, so a restart or redeploy does not wipe the history.
 */
export function createMonitoring({ directory = '', now = () => Date.now() } = {}) {
  const filename = directory ? join(directory, 'monitoring.json') : null;
  const started = now();
  let since = started;
  let total = 0;
  let success = 0;
  let elapsed = 0;
  let active = 0;
  let recent = [];
  let minutes = new Map();
  let hours = new Map();

  if (filename && existsSync(filename)) {
    try {
      const saved = JSON.parse(readFileSync(filename, 'utf8'));
      since = Number.isFinite(saved.since) ? Math.min(saved.since, started) : started;
      total = count(saved.total);
      success = Math.min(count(saved.success), total);
      elapsed = count(saved.elapsed);
      recent = Array.isArray(saved.recent) ? saved.recent.slice(0, 60) : [];
      minutes = bucketsFrom(saved.minutes);
      hours = bucketsFrom(saved.hours);
    } catch {
      // Unreadable history is not worth refusing to start over; it begins again.
    }
  }

  let timer = null;
  let writing = Promise.resolve();
  const save = () => {
    timer = null;
    if (!filename) return writing;
    const data = JSON.stringify({ since, total, success, elapsed, recent,
      minutes: Object.fromEntries(minutes), hours: Object.fromEntries(hours) });
    writing = writing.catch(() => {}).then(async () => {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(`${filename}.tmp`, data, { mode: 0o600 });
      await rename(`${filename}.tmp`, filename);
    });
    writing = writing.catch(() => {});
    return writing;
  };
  const scheduleSave = () => {
    if (filename && !timer) { timer = setTimeout(save, SAVE_DELAY_MS); timer.unref(); }
  };
  const add = (map, key, ok, durationMs) => {
    const bucket = map.get(key) ?? { requests: 0, errors: 0, durationMs: 0 };
    bucket.requests += 1;
    if (!ok) bucket.errors += 1;
    bucket.durationMs += durationMs;
    map.set(key, bucket);
  };
  const series = (map, size, length, current) => {
    const last = Math.floor(current / size) * size;
    return Array.from({ length }, (_, i) => {
      const time = last - (length - 1 - i) * size;
      const { requests, errors } = map.get(time) ?? { requests: 0, errors: 0 };
      return { timestamp: new Date(time).toISOString(), requests, errors };
    });
  };

  return {
    begin(req, res, next) {
      if (req.method !== 'POST' || !ROUTES.includes(req.path)) return next();
      active += 1;
      let ended = false;
      const finish = () => { if (!ended) { ended = true; active -= 1; } };
      res.on('finish', finish);
      res.on('close', finish);
      next();
    },
    record(entry) {
      if (entry.method !== 'POST' || !ROUTES.includes(entry.path)) return;
      const timestamp = now();
      total += 1;
      const ok = entry.status >= 200 && entry.status < 300;
      if (ok) success += 1;
      elapsed += entry.durationMs;
      recent.unshift({ timestamp: new Date(timestamp).toISOString(), requestId: entry.requestId, status: entry.status,
        durationMs: entry.durationMs, processingMethod: entry.processingMethod ?? null,
        failure: entry.failure ?? (entry.aborted ? 'client_closed' : null) });
      recent.length = Math.min(recent.length, 60);
      const minute = Math.floor(timestamp / MINUTE_MS) * MINUTE_MS;
      const hour = Math.floor(timestamp / HOUR_MS) * HOUR_MS;
      add(minutes, minute, ok, entry.durationMs);
      add(hours, hour, ok, entry.durationMs);
      for (const key of minutes.keys()) if (key < minute - 59 * MINUTE_MS) minutes.delete(key);
      for (const key of hours.keys()) if (key < hour - (HOURS_KEPT - 1) * HOUR_MS) hours.delete(key);
      scheduleSave();
    },
    /** Writes pending history now. Used when the service stops. */
    flush() {
      if (!timer) return writing;
      clearTimeout(timer);
      return save();
    },
    snapshot() {
      const current = now();
      return {
        startedAt: new Date(started).toISOString(), uptimeSeconds: Math.floor((current - started) / 1000),
        countingSince: new Date(since).toISOString(), persistent: Boolean(filename),
        totalRequests: total, successfulRequests: success, failedRequests: total - success,
        successRate: total ? Math.round(success / total * 1000) / 10 : null,
        averageDurationMs: total ? Math.round(elapsed / total) : null,
        activeRequests: active, memoryRssBytes: process.memoryUsage().rss,
        recent: [...recent],
        timeline: series(minutes, MINUTE_MS, 60, current),
        hourly: series(hours, HOUR_MS, HOURS_KEPT, current),
      };
    },
  };
}
