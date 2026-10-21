import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Counted app actions. Counters only: no receipt content, names, or file details. */
export const APP_USAGE_EVENTS = ['app_visit', 'receipt_refetch', 'original_download'];
export const USAGE_EVENTS = [...APP_USAGE_EVENTS, 'receipt_analysis'];
export const DEVICE_ID = /^[A-Za-z0-9-]{16,64}$/;
const FIELD = { app_visit: 'visits', receipt_refetch: 'refetches', original_download: 'downloads', receipt_analysis: 'analyses' };
const MAX_USERS = 5000;
const SAVE_DELAY_MS = 3000;
const DAY_MS = 24 * 60 * 60 * 1000;

const count = (value) => (Number.isSafeInteger(value) && value > 0 ? value : 0);
const label = value => typeof value === 'string' ? value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60) : '';

/**
 * Per-install usage counters. Users are random IDs made by the app on first run,
 * so nobody is identified. Totals survive restarts when a state directory is set.
 */
export function createUsage({ directory = '', now = () => Date.now(), containers = [], allowProfiles = false } = {}) {
  const filename = directory ? join(directory, 'usage.json') : null;
  const emptyCounts = () => ({ refetches: 0, visits: 0, analyses: 0, downloads: 0 });
  const totals = emptyCounts();
  let unattributedAnalyses = 0;
  const users = new Map();
  let requests = [];

  if (filename && existsSync(filename)) {
    try {
      const saved = JSON.parse(readFileSync(filename, 'utf8'));
      for (const field of Object.values(FIELD)) totals[field] = count(saved.totals?.[field]);
      unattributedAnalyses = count(saved.unattributedAnalyses);
      if (allowProfiles) requests = (saved.requests ?? []).slice(-100).map(row => ({ ...row, state: row.state === 'processing' ? 'interrupted' : row.state }));
      for (const [id, user] of Object.entries(saved.users ?? {})) {
        users.set(id, { ...Object.fromEntries(Object.values(FIELD).map((field) => [field, count(user[field])])), firstSeen: user.firstSeen, lastSeen: user.lastSeen, containers: Array.isArray(user.containers) ? user.containers.filter(x => typeof x === 'string').slice(0, 8) : [] });
        if (allowProfiles && user.name && user.team) Object.assign(users.get(id), { name: label(user.name), team: label(user.team) });
      }
    } catch {
      throw new Error('Saved usage counters could not be read. Check the private dashboard state file.');
    }
  }

  let timer = null;
  let writing = Promise.resolve();
  const save = () => {
    timer = null;
    if (!filename) return writing;
    const data = JSON.stringify({ totals, unattributedAnalyses, users: Object.fromEntries(users), ...(allowProfiles ? { requests } : {}) });
    writing = writing.catch(() => {}).then(async () => {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(`${filename}.tmp`, data, { mode: 0o600 });
      await rename(`${filename}.tmp`, filename);
    });
    // A failed write must not crash the server; the next event retries it.
    writing = writing.catch(() => {});
    return writing;
  };

  const scheduleSave = () => {
    if (filename && !timer) { timer = setTimeout(save, allowProfiles ? 1000 : SAVE_DELAY_MS); timer.unref(); }
  };
  return {
    allowProfiles,
    beginRequest(deviceId, requestId) {
      if (!allowProfiles) return;
      const user = users.get(deviceId);
      requests.push({ requestId, user: typeof deviceId === 'string' ? deviceId.slice(0, 8) : 'unknown', name: user?.name ?? '', team: user?.team ?? '', startedAt: new Date(now()).toISOString(), state: 'processing', container: 'dhamantaha-qr-1', keys: [] });
      requests = requests.slice(-100);
      scheduleSave();
    },
    finishRequest(requestId, { status, durationMs, attempts, waiting = false }) {
      const row = requests.find(entry => entry.requestId === requestId);
      if (!row) return;
      Object.assign(row, { status, durationMs, state: waiting ? 'waiting' : status >= 200 && status < 300 ? 'success' : 'failed', keys: [...new Set(attempts.map(a => a.key))], winningKey: attempts.find(a => a.ok)?.key ?? null });
      scheduleSave();
    },
    /** One authenticated receipt upload accepted for processing, independent of provider retries. */
    recordAnalysis(deviceId) {
      if (typeof deviceId === 'string' && DEVICE_ID.test(deviceId)) this.record(deviceId, { receipt_analysis: 1 });
      else { totals.analyses += 1; unattributedAnalyses += 1; scheduleSave(); }
    },
    /** `counts` maps event names to how many happened since the app last reported. */
    record(deviceId, counts, profile) {
      const timestamp = now();
      let user = users.get(deviceId);
      if (!user) {
        if (users.size >= MAX_USERS) {
          const oldest = [...users.entries()].reduce((a, b) => (b[1].lastSeen < a[1].lastSeen ? b : a));
          users.delete(oldest[0]);
        }
        user = { ...emptyCounts(), firstSeen: timestamp, lastSeen: timestamp, containers: [] };
        users.set(deviceId, user);
      }
      user.lastSeen = timestamp;
      if (allowProfiles && profile) Object.assign(user, { name: label(profile.name), team: label(profile.team) });
      user.containers = [...new Set([...user.containers, ...containers])].slice(0, 8);
      for (const event of USAGE_EVENTS) {
        const added = count(counts[event]);
        user[FIELD[event]] += added;
        totals[FIELD[event]] += added;
      }
      scheduleSave();
    },
    /** Writes pending counters now. Used when the service stops. */
    flush() {
      if (!timer) return writing;
      clearTimeout(timer);
      return save();
    },
    snapshot() {
      const current = now();
      const list = [...users.entries()].sort((a, b) => b[1].lastSeen - a[1].lastSeen);
      return {
        ...totals,
        unattributedAnalyses,
        users: users.size,
        activeLast24h: list.filter(([, user]) => current - user.lastSeen < DAY_MS).length,
        persistent: Boolean(filename),
        recentUsers: list.slice(0, 25).map(([id, user]) => ({
          user: id.slice(0, 8), ...Object.fromEntries(Object.values(FIELD).map((field) => [field, user[field]])),
          firstSeen: new Date(user.firstSeen).toISOString(), lastSeen: new Date(user.lastSeen).toISOString(),
          containers: user.containers,
          ...(allowProfiles ? { name: user.name ?? '', team: user.team ?? '' } : {}),
        })),
      };
    },
  };
}
