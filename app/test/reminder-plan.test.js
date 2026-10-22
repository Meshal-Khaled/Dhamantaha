import test from 'node:test';
import assert from 'node:assert/strict';
import { reminderPlan, createReminderScheduler, isReminderId } from '../src/reminder-plan.js';
const now = new Date(2026, 9, 22, 8);
const preferences = { enabled: true, daysBefore: 1 };
const record = end => ({ id: 'private-id', name: 'private-receipt.png', analysis: { receipt: { merchantName: 'private-merchant', purchaseDate: '2026-10-20', returnPolicy: { returnDurationValue: 3, returnDurationUnit: 'days', exchangeDurationValue: 8, exchangeDurationUnit: 'days' } }, items: [{ warranty: { expirationDate: end } }] } });

test('one private daily reminder covers known warranty, refund and exchange dates at local 09:00', () => {
  const records = [record('2026-10-23'), record('2026-10-23')];
  const before = structuredClone(records);
  const plan = reminderPlan(records, preferences, false, now);
  assert.equal(plan.notifications.length, 2);
  assert.deepEqual(plan.notifications.map(n => n.id), [20261022, 20261027]);
  for (const n of plan.notifications) {
    assert.equal(n.schedule.at.getHours(), 9);
    assert.equal(n.isExactNotification, false);
    assert.equal(n.schedule.allowWhileIdle, false);
    assert.ok(isReminderId(n.id));
    assert.doesNotMatch(JSON.stringify(n), /private/);
  }
  assert.deepEqual(records, before);
});
test('off, unknown, invalid and past reminder dates never schedule; no past catch-up on resume', () => {
  assert.equal(reminderPlan([record('2026-10-23')], { enabled: false }, false, now).notifications.length, 0);
  assert.equal(reminderPlan([{ analysis: { items: [{ warranty: { expirationDate: '2026-02-30' } }] } }, {}], preferences, false, now).notifications.length, 0);
  const later = new Date(2026, 9, 22, 10);
  assert.ok(reminderPlan([record('2026-10-23')], preferences, false, later).notifications.every(n => n.id !== 20261022));
});
test('seven-day selection, language, edits, deletion, and bounded schedules recompute', () => {
  const records = Array.from({ length: 80 }, (_, i) => {
    const end = new Date(2027, 0, i + 1, 12);
    return { analysis: { items: [{ warranty: { expirationDate: `${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}` } }] } };
  });
  const plan = reminderPlan(records, { enabled: true, daysBefore: 7 }, true, now);
  assert.equal(plan.notifications.length, 64); assert.equal(plan.truncated, true);
  assert.equal(plan.notifications[0].id, 20261225);
  assert.match(plan.notifications[0].title, /ضمنتها/);
  assert.equal(reminderPlan([], preferences, true, now).notifications.length, 0);
});
const fake = (permission = 'granted') => {
  const calls = [];
  const plugin = {
    checkPermissions: async () => { calls.push('check'); return { display: permission }; },
    getPending: async () => ({ notifications: [{ id: 20261023 }, { id: 42 }] }),
    cancel: async arg => { calls.push(['cancel', arg]); },
    createChannel: async () => { calls.push('channel'); },
    listChannels: async () => ({ channels: [{ id: 'wallet-deadlines', importance: 3 }] }),
    schedule: async arg => { calls.push(['schedule', arg]); },
  };
  return { plugin, calls };
};
test('disabling cancels only wallet reminders without requesting or requiring permission', async () => {
  const { plugin, calls } = fake('denied');
  const result = await createReminderScheduler(plugin)({ notifications: [] }, false);
  assert.equal(result.scheduled, 0);
  assert.deepEqual(calls, [['cancel', { notifications: [{ id: 20261023 }] }]]);
});
test('revoked permission cancels old reminders, never prompts and never schedules', async () => {
  const { plugin, calls } = fake('denied');
  const result = await createReminderScheduler(plugin)(reminderPlan([record('2026-10-23')], preferences, false, now), true);
  assert.equal(result.permission, 'denied');
  assert.ok(!calls.includes('channel'));
  assert.ok(!calls.some(c => Array.isArray(c) && c[0] === 'schedule'));
});
test('replacement waits for earlier operation; a failed schedule is reported and can be retried', async () => {
  const { plugin, calls } = fake();
  let release;
  plugin.schedule = async () => { calls.push('schedule-start'); await new Promise(resolve => { release = resolve; }); calls.push('schedule-end'); };
  const schedule = createReminderScheduler(plugin);
  const first = schedule({ notifications: [{ id: 20261024 }] }, true);
  const second = schedule({ notifications: [] }, false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.filter(c => Array.isArray(c) && c[0] === 'cancel').length, 1);
  release(); await first; await second;
  assert.ok(calls.indexOf('schedule-end') < calls.findLastIndex(c => Array.isArray(c) && c[0] === 'cancel'));
  plugin.schedule = async () => { throw new Error('OS rejected'); };
  await assert.rejects(schedule({ notifications: [{ id: 20261024 }] }, true), /OS rejected/);
  assert.equal((await schedule({ notifications: [] }, false)).scheduled, 0);
});

test('a blocked Android reminder channel is reported and never scheduled', async () => {
  const { plugin, calls } = fake();
  plugin.listChannels = async () => ({ channels: [{ id: 'wallet-deadlines', importance: 0 }] });
  const result = await createReminderScheduler(plugin)({ notifications: [{ id: 20261024 }] }, true);
  assert.equal(result.permission, 'denied');
  assert.ok(!calls.some(c => Array.isArray(c) && c[0] === 'schedule'));
});

test('calendar-day lead times keep 09:00 local time across a daylight-saving boundary', () => {
  const records = [{ analysis: { items: [{ warranty: { expirationDate: '2026-03-09' } }] } }];
  const plan = reminderPlan(records, preferences, false, new Date(2026, 2, 1, 8));
  assert.equal(plan.notifications[0].id, 20260308);
  assert.equal(plan.notifications[0].schedule.at.getHours(), 9);
  assert.equal(plan.notifications[0].schedule.at.getMinutes(), 0);
});

test('Android 7 channel-unavailable response still schedules; other channel failures remain errors', async () => {
  const { plugin, calls } = fake();
  plugin.createChannel = async () => { throw Object.assign(new Error('No channels'), { code: 'UNAVAILABLE' }); };
  const schedule = createReminderScheduler(plugin);
  assert.equal((await schedule({ notifications: [{ id: 20261024 }] }, true)).scheduled, 1);
  assert.ok(calls.some(c => Array.isArray(c) && c[0] === 'schedule'));
  plugin.createChannel = async () => { throw new Error('Channel failed'); };
  await assert.rejects(schedule({ notifications: [] }, true), /Channel failed/);
});
