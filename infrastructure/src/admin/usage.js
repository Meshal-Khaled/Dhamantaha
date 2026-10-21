import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Counted app actions. Counters only: no receipt content, names, or file details. */
export const USAGE_EVENTS = ['receipt_refetch', 'original_download'];
const FIELD = { receipt_refetch: 'refetches', original_download: 'downloads' };
const MAX_USERS = 5000;
const SAVE_DELAY_MS = 3000;
const DAY_MS = 24 * 60 * 60 * 1000;

const count = (value) => (Number.isSafeInteger(value) && value > 0 ? value : 0);

/**
 * Per-install usage counters. Users are random IDs made by the app on first run,
 * so nobody is identified. Totals survive restarts when a state directory is set.
 */
export function createUsage({ directory = '', now = () => Date.now() } = {}) {
  const filename = directory ? join(directory, 'usage.json') : null;
  const totals = { refetches: 0, downloads: 0 };
  const users = new Map();

  if (filename && existsSync(filename)) {
    try {
      const saved = JSON.parse(readFileSync(filename, 'utf8'));
      totals.refetches = count(saved.totals?.refetches);
      totals.downloads = count(saved.totals?.downloads);
      for (const [id, user] of Object.entries(saved.users ?? {})) {
        users.set(id, { refetches: count(user.refetches), downloads: count(user.downloads), firstSeen: user.firstSeen, lastSeen: user.lastSeen });
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
    const data = JSON.stringify({ totals, users: Object.fromEntries(users) });
    writing = writing.catch(() => {}).then(async () => {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(`${filename}.tmp`, data, { mode: 0o600 });
      await rename(`${filename}.tmp`, filename);
    });
    // A failed write must not crash the server; the next event retries it.
    writing = writing.catch(() => {});
    return writing;
  };

  return {
    /** `counts` maps event names to how many happened since the app last reported. */
    record(deviceId, counts) {
      const timestamp = now();
      let user = users.get(deviceId);
      if (!user) {
        if (users.size >= MAX_USERS) {
          const oldest = [...users.entries()].reduce((a, b) => (b[1].lastSeen < a[1].lastSeen ? b : a));
          users.delete(oldest[0]);
        }
        user = { refetches: 0, downloads: 0, firstSeen: timestamp, lastSeen: timestamp };
        users.set(deviceId, user);
      }
      user.lastSeen = timestamp;
      for (const event of USAGE_EVENTS) {
        const added = count(counts[event]);
        user[FIELD[event]] += added;
        totals[FIELD[event]] += added;
      }
      if (filename && !timer) {
        timer = setTimeout(save, SAVE_DELAY_MS);
        timer.unref();
      }
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
        users: users.size,
        activeLast24h: list.filter(([, user]) => current - user.lastSeen < DAY_MS).length,
        persistent: Boolean(filename),
        recentUsers: list.slice(0, 25).map(([id, user]) => ({
          user: id.slice(0, 8), refetches: user.refetches, downloads: user.downloads,
          firstSeen: new Date(user.firstSeen).toISOString(), lastSeen: new Date(user.lastSeen).toISOString(),
        })),
      };
    },
  };
}
