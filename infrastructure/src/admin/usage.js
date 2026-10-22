import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Counted app actions. Counters only: no receipt content, names, or file details. */
export const APP_USAGE_EVENTS = ['app_visit', 'receipt_refetch', 'original_download'];
export const USAGE_EVENTS = [...APP_USAGE_EVENTS, 'receipt_analysis'];
export const DEVICE_ID = /^[A-Za-z0-9-]{16,64}$/;
/** The short ID the dashboard shows and deletes by. */
export const USER_PREFIX = /^[A-Za-z0-9-]{1,64}$/;
const FIELD = { app_visit: 'visits', receipt_refetch: 'refetches', original_download: 'downloads', receipt_analysis: 'analyses' };
// Order of the per-day arrays kept for each user.
const DAY_FIELDS = ['visits', 'refetches', 'analyses', 'downloads'];
const MAX_USERS = 5000;
const MAX_LISTED_USERS = 500;
const SAVE_DELAY_MS = 3000;
const DAY_MS = 24 * 60 * 60 * 1000;
const KEEP_DAYS = 90;
export const HISTORY_DAYS = 30;

const count = (value) => (Number.isSafeInteger(value) && value > 0 ? value : 0);
const label = value => typeof value === 'string' ? value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60) : '';

/** `ms` → "YYYY-MM-DD" in `timeZone`. */
export function dayFormatter(timeZone = 'Asia/Riyadh') {
  const format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return (ms) => format.format(ms);
}

/** The last `days` calendar days ending today, oldest first. */
export function lastDays(now, dayOf, days = HISTORY_DAYS) {
  const dates = new Set();
  // A 24-hour step can land on the same date twice around a clock change; the set keeps one.
  for (let i = days + 1; i >= 0; i -= 1) dates.add(dayOf(now - i * DAY_MS));
  return [...dates].slice(-days);
}

function savedDays(value) {
  const days = {};
  if (!value || typeof value !== 'object') return days;
  for (const [date, row] of Object.entries(value)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Array.isArray(row)) days[date] = DAY_FIELDS.map((_, i) => count(row[i]));
  }
  return days;
}

/**
 * Per-install usage counters. Users are random IDs made by the app on first run,
 * so nobody is identified. Totals survive restarts when a state directory is set.
 * Each user also keeps per-day counts for the last 90 days, which feed the
 * dashboard graphs and are removed with the user.
 */
export function createUsage({ directory = '', now = () => Date.now(), containers = [], allowProfiles = false, timeZone = 'Asia/Riyadh' } = {}) {
  const filename = directory ? join(directory, 'usage.json') : null;
  const dayOf = dayFormatter(timeZone);
  const emptyCounts = () => ({ refetches: 0, visits: 0, analyses: 0, downloads: 0 });
  const totals = emptyCounts();
  let unattributedAnalyses = 0;
  let unattributedDays = {};
  const users = new Map();
  let requests = [];

  if (filename && existsSync(filename)) {
    try {
      const saved = JSON.parse(readFileSync(filename, 'utf8'));
      for (const field of Object.values(FIELD)) totals[field] = count(saved.totals?.[field]);
      unattributedAnalyses = count(saved.unattributedAnalyses);
      for (const [date, value] of Object.entries(saved.unattributedDays ?? {})) if (/^\d{4}-\d{2}-\d{2}$/.test(date) && count(value)) unattributedDays[date] = count(value);
      if (allowProfiles) requests = (saved.requests ?? []).slice(-100).map(row => ({ ...row, state: row.state === 'processing' ? 'interrupted' : row.state }));
      for (const [id, user] of Object.entries(saved.users ?? {})) {
        const restored = { ...Object.fromEntries(Object.values(FIELD).map((field) => [field, count(user[field])])), firstSeen: user.firstSeen, lastSeen: user.lastSeen, containers: Array.isArray(user.containers) ? user.containers.filter(x => typeof x === 'string').slice(0, 8) : [] };
        if (user.days) restored.days = savedDays(user.days);
        // Counters saved before daily history existed: a user seen on one day only did everything that day.
        else if (Number.isFinite(user.firstSeen) && Number.isFinite(user.lastSeen) && dayOf(user.firstSeen) === dayOf(user.lastSeen)) {
          restored.days = { [dayOf(user.lastSeen)]: DAY_FIELDS.map((field) => restored[field]) };
        } else restored.days = {};
        users.set(id, restored);
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
    const data = JSON.stringify({ totals, unattributedAnalyses, unattributedDays, users: Object.fromEntries(users), ...(allowProfiles ? { requests } : {}) });
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
  const pruneDays = (days, timestamp) => {
    const oldest = dayOf(timestamp - KEEP_DAYS * DAY_MS);
    for (const date of Object.keys(days)) if (date < oldest) delete days[date];
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
      else {
        const timestamp = now();
        totals.analyses += 1; unattributedAnalyses += 1;
        const date = dayOf(timestamp);
        unattributedDays[date] = (unattributedDays[date] ?? 0) + 1;
        pruneDays(unattributedDays, timestamp);
        scheduleSave();
      }
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
        user = { ...emptyCounts(), firstSeen: timestamp, lastSeen: timestamp, containers: [], days: {} };
        users.set(deviceId, user);
      }
      user.lastSeen = timestamp;
      if (allowProfiles && profile) Object.assign(user, { name: label(profile.name), team: label(profile.team) });
      user.containers = [...new Set([...user.containers, ...containers])].slice(0, 8);
      const date = dayOf(timestamp);
      const day = user.days[date] ?? DAY_FIELDS.map(() => 0);
      for (const event of USAGE_EVENTS) {
        const added = count(counts[event]);
        user[FIELD[event]] += added;
        totals[FIELD[event]] += added;
        day[DAY_FIELDS.indexOf(FIELD[event])] += added;
      }
      user.days[date] = day;
      pruneDays(user.days, timestamp);
      scheduleSave();
    },
    /**
     * Removes users by the short ID the dashboard shows, with their share of the
     * totals, their daily history and their request rows. A short ID that matches
     * more than one install is left alone.
     */
    deleteUsers(prefixes) {
      const result = { deleted: [], notFound: [], ambiguous: [] };
      for (const prefix of new Set(prefixes)) {
        const matches = [...users.keys()].filter((id) => id.startsWith(prefix));
        if (!matches.length) { result.notFound.push(prefix); continue; }
        if (matches.length > 1) { result.ambiguous.push(prefix); continue; }
        const user = users.get(matches[0]);
        for (const field of Object.values(FIELD)) totals[field] = Math.max(0, totals[field] - user[field]);
        users.delete(matches[0]);
        requests = requests.filter((row) => row.user !== matches[0].slice(0, 8));
        result.deleted.push(prefix);
      }
      if (result.deleted.length) scheduleSave();
      return result;
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
      const dates = lastDays(current, dayOf);
      const history = new Map(dates.map((date) => [date, { date, ...emptyCounts(), active: 0, newUsers: 0 }]));
      let historyStart = null;
      for (const [, user] of list) {
        for (const [date, row] of Object.entries(user.days)) {
          if (!historyStart || date < historyStart) historyStart = date;
          const day = history.get(date);
          if (!day) continue;
          DAY_FIELDS.forEach((field, i) => { day[field] += row[i]; });
          if (row.some(Boolean)) day.active += 1;
        }
        if (Number.isFinite(user.firstSeen)) {
          const first = history.get(dayOf(user.firstSeen));
          if (first) first.newUsers += 1;
        }
      }
      for (const [date, value] of Object.entries(unattributedDays)) {
        const day = history.get(date);
        if (day) day.analyses += value;
      }
      return {
        ...totals,
        unattributedAnalyses,
        users: users.size,
        activeLast24h: list.filter(([, user]) => current - user.lastSeen < DAY_MS).length,
        persistent: Boolean(filename),
        history: [...history.values()],
        historyStart,
        recentUsers: list.slice(0, MAX_LISTED_USERS).map(([id, user]) => ({
          user: id.slice(0, 8), ...Object.fromEntries(Object.values(FIELD).map((field) => [field, user[field]])),
          firstSeen: new Date(user.firstSeen).toISOString(), lastSeen: new Date(user.lastSeen).toISOString(),
          containers: user.containers,
          ...(allowProfiles ? { name: user.name ?? '', team: user.team ?? '' } : {}),
        })),
      };
    },
  };
}
