import { products, receiptPolicy } from './wallet-view.js';

export const REMINDER_DEFAULTS = { enabled: false, daysBefore: 1 };
export const REMINDER_CHANNEL = 'wallet-deadlines';
export const isReminderId = id => Number.isInteger(id) && id >= 20000000 && id <= 29999999;
const validDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` === value;
};

/** One private digest per day, at approximately 09:00 local time; no guessed dates. */
export function reminderPlan(records, preferences, arabic, now = new Date()) {
  if (!preferences.enabled) return { notifications: [], truncated: false };
  const dates = new Set();
  for (const record of records.filter(record => record.analysis)) {
    for (const entry of products([record], now)) {
      if (validDate(entry.warrantyEnd)) dates.add(entry.warrantyEnd);
      if (validDate(entry.returnEnd)) dates.add(entry.returnEnd);
    }
    const policy = receiptPolicy(record.analysis.receipt, now);
    if (validDate(policy.exchangeEnd)) dates.add(policy.exchangeEnd);
  }
  const lead = preferences.daysBefore === 7 ? 7 : 1;
  const upcoming = [...dates].map(date => {
    const at = new Date(`${date}T09:00:00`);
    at.setDate(at.getDate() - lead);
    return at;
  }).filter(at => at > now && at.getFullYear() >= 2000 && at.getFullYear() <= 2999).sort((a, b) => a - b);
  return { truncated: upcoming.length > 64, notifications: upcoming.slice(0, 64).map(at => ({
    id: Number(`${at.getFullYear()}${String(at.getMonth() + 1).padStart(2, '0')}${String(at.getDate()).padStart(2, '0')}`),
    title: arabic ? 'تذكير ضمنتها' : 'Dhamantaha reminder',
    body: arabic ? 'يقترب موعد ضمان أو استرجاع أو استبدال محفوظ. افتح محفظتك لمراجعة التفاصيل.' : 'A saved warranty, refund or exchange deadline is approaching. Open your wallet to review it.',
    schedule: { at, allowWhileIdle: false }, channelId: REMINDER_CHANNEL,
    smallIcon: 'ic_stat_warranty', iconColor: '#08766d',
    isExactNotification: false, autoCancel: true,
  })) };
}

/** Serialize replacements so rapid edits cannot leave obsolete alarms behind. */
export function createReminderScheduler(plugin) {
  let queue = Promise.resolve();
  return (plan, enabled) => {
    const operation = async () => {
      const pending = (await plugin.getPending()).notifications.filter(item => isReminderId(item.id));
      if (pending.length) await plugin.cancel({ notifications: pending.map(({ id }) => ({ id })) });
      if (!enabled) return { permission: 'not-requested', scheduled: 0 };
      const permission = await plugin.checkPermissions();
      if (permission.display !== 'granted') return { permission: permission.display, scheduled: 0 };
      try {
        await plugin.createChannel({ id: REMINDER_CHANNEL, name: 'Dhamantaha / ضمنتها', description: 'Deadline reminders / تذكيرات المواعيد', importance: 3, visibility: 0 });
        const channel = (await plugin.listChannels()).channels.find(item => item.id === REMINDER_CHANNEL);
        if (channel?.importance === 0) return { permission: 'denied', scheduled: 0 };
      } catch (error) {
        // Android 7 (API 24–25) supports notifications but has no channels.
        if (error?.code !== 'UNAVAILABLE') throw error;
      }
      if (plan.notifications.length) await plugin.schedule({ notifications: plan.notifications });
      return { permission: permission.display, scheduled: plan.notifications.length };
    };
    const result = queue.then(operation, operation);
    queue = result.catch(() => {});
    return result;
  };
}
