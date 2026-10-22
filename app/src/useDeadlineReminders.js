import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { createReminderScheduler, reminderPlan, REMINDER_DEFAULTS } from './reminder-plan.js';

const KEY = 'dhamantaha.reminders.v1';
const android = Capacitor.getPlatform() === 'android';
const scheduler = android ? createReminderScheduler(LocalNotifications) : null;
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { enabled: saved.enabled === true, daysBefore: saved.daysBefore === 7 ? 7 : 1 };
  } catch { return { ...REMINDER_DEFAULTS }; }
}

export function useDeadlineReminders({ saved, ready, loading, arabic }) {
  const [preferences, setPreferences] = useState(load);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState({ busy: android, error: false, scheduled: 0 });
  const changing = useRef(false);
  useEffect(() => {
    if (!android) return;
    const refresh = () => { if (document.visibilityState === 'visible') setRevision(value => value + 1); };
    // Rebuild on resume, calendar-day or time-zone changes without re-prompting.
    let day = new Date().toDateString() + new Date().getTimezoneOffset();
    const timer = setInterval(() => {
      const next = new Date().toDateString() + new Date().getTimezoneOffset();
      if (next !== day) { day = next; refresh(); }
    }, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  useEffect(() => {
    if (!android || loading) return;
    if (!ready && preferences.enabled) {
      // A failed wallet read is not an empty wallet: preserve existing alarms.
      setStatus(previous => ({ ...previous, busy: false, error: true }));
      return;
    }
    let active = true;
    const plan = reminderPlan(saved, preferences, arabic);
    setStatus(previous => ({ ...previous, busy: true, error: false }));
    scheduler(plan, preferences.enabled).then(result => {
      if (active) setStatus({ ...result, truncated: plan.truncated, busy: false, error: false });
    }).catch(() => { if (active) setStatus(previous => ({ ...previous, busy: false, error: true })); });
    return () => { active = false; };
  }, [saved, ready, loading, preferences, arabic, revision]);

  const change = useCallback(async next => {
    if (!android || changing.current) return;
    changing.current = true;
    setStatus(previous => ({ ...previous, busy: true, error: false }));
    try {
      // Android's permission prompt is shown only after an explicit Enable/Retry action.
      if (next.enabled) {
        let permission = await LocalNotifications.checkPermissions();
        if (permission.display !== 'granted') permission = await LocalNotifications.requestPermissions();
        if (permission.display !== 'granted') {
          setStatus(previous => ({ ...previous, permission: permission.display, busy: false }));
          return;
        }
      }
      localStorage.setItem(KEY, JSON.stringify(next));
      setPreferences({ ...next });
    } catch { setStatus(previous => ({ ...previous, busy: false, error: true })); }
    finally { changing.current = false; }
  }, []);
  return { supported: android, preferences, status, change, retry: () => setRevision(value => value + 1) };
}
