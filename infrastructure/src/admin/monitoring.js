/** Bounded, process-local operational metadata; never receipt contents or secrets. */
export function createMonitoring({ now = () => Date.now() } = {}) {
  const started = now();
  let total = 0;
  let success = 0;
  let elapsed = 0;
  let active = 0;
  const recent = [];
  const buckets = new Map();
  return {
    begin(req, res, next) {
      if (req.method !== 'POST' || !['/v1/receipts/analyze', '/v1/warranty/explain'].includes(req.path)) return next();
      active += 1;
      let ended = false;
      const finish = () => { if (!ended) { ended = true; active -= 1; } };
      res.on('finish', finish);
      res.on('close', finish);
      next();
    },
    record(entry) {
      if (entry.method !== 'POST' || !['/v1/receipts/analyze', '/v1/warranty/explain'].includes(entry.path)) return;
      const timestamp = now();
      total += 1;
      const ok = entry.status >= 200 && entry.status < 300;
      if (ok) success += 1;
      elapsed += entry.durationMs;
      recent.unshift({ timestamp: new Date(timestamp).toISOString(), requestId: entry.requestId, status: entry.status,
        durationMs: entry.durationMs, processingMethod: entry.processingMethod ?? null,
        failure: entry.failure ?? (entry.aborted ? 'client_closed' : null) });
      recent.length = Math.min(recent.length, 60);
      const minute = Math.floor(timestamp / 60_000) * 60_000;
      const bucket = buckets.get(minute) ?? { requests: 0, errors: 0 };
      bucket.requests += 1;
      if (!ok) bucket.errors += 1;
      buckets.set(minute, bucket);
      for (const key of buckets.keys()) if (key < minute - 59 * 60_000) buckets.delete(key);
    },
    snapshot() {
      const current = now();
      const minute = Math.floor(current / 60_000) * 60_000;
      return {
        startedAt: new Date(started).toISOString(), uptimeSeconds: Math.floor((current - started) / 1000),
        totalRequests: total, successfulRequests: success, failedRequests: total - success,
        successRate: total ? Math.round(success / total * 1000) / 10 : null,
        averageDurationMs: total ? Math.round(elapsed / total) : null,
        activeRequests: active, memoryRssBytes: process.memoryUsage().rss,
        recent: [...recent],
        timeline: Array.from({ length: 60 }, (_, i) => {
          const time = minute - (59 - i) * 60_000;
          return { timestamp: new Date(time).toISOString(), ...(buckets.get(time) ?? { requests: 0, errors: 0 }) };
        }),
      };
    },
  };
}
