import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransitionCoordinator, screenMotion } from '../src/navigation-motion.js';

function harness(options = {}) {
  const events = [];
  const pending = [];
  let id = 0;
  const coordinator = createTransitionCoordinator({
    enabled: () => true,
    capture: () => { const key = ++id; events.push(`capture:${key}`); return { key, remove: () => events.push(`remove:${key}`) }; },
    commit: change => change(),
    play: snapshot => ({ stop: () => events.push(`stop:${snapshot.key}`), finished: new Promise(resolve => pending.push(resolve)) }),
    ...options,
  });
  return { coordinator, events, pending };
}

test('rapid navigation commits immediately and old completion cannot remove the new screen', async () => {
  const { coordinator, events, pending } = harness();
  coordinator.run(() => events.push('route:receipts'), { kind: 'tab' });
  coordinator.afterTransition(() => events.push('release:old-original'));
  coordinator.run(() => events.push('route:details'), { kind: 'push' });
  assert.deepEqual(events, ['capture:1', 'route:receipts', 'stop:1', 'remove:1', 'release:old-original', 'capture:2', 'route:details']);
  pending[0](); await new Promise(resolve => setImmediate(resolve));
  assert.ok(!events.includes('remove:2'));
  pending[1](); await new Promise(resolve => setImmediate(resolve));
  assert.equal(events.filter(event => event === 'remove:2').length, 1);
});

test('reduced motion or missing animation support never captures content or delays a route', () => {
  let route;
  const { coordinator, events } = harness({ enabled: () => false });
  coordinator.run(() => { route = 'settings'; }, { kind: 'tab' });
  assert.equal(route, 'settings');
  assert.deepEqual(events, []);
  let released = false;
  coordinator.afterTransition(() => { released = true; });
  assert.equal(released, true);
});

test('scroll/focus restoration happens after the React commit and before animation playback', () => {
  const order = [];
  const { coordinator } = harness({ play: () => { order.push('animate'); return { finished: Promise.resolve() }; } });
  coordinator.run(() => order.push('commit'), { kind: 'pop', afterCommit: () => order.push('restore') });
  assert.deepEqual(order, ['commit', 'restore', 'animate']);
});

test('failed capture or visual playback cannot turn a successful route into a blank screen', () => {
  let commits = 0;
  const brokenCapture = harness({ capture: () => { throw new Error('Snapshot unsupported'); } });
  brokenCapture.coordinator.run(() => commits++, { kind: 'push' });
  const brokenPlay = harness({ play: () => { throw new Error('Animation unsupported'); } });
  brokenPlay.coordinator.run(() => commits++, { kind: 'pop' });
  assert.equal(commits, 2);
  assert.deepEqual(brokenPlay.events, ['capture:1', 'remove:1']);
});

test('a failed application commit still propagates its error and releases the visual snapshot', () => {
  const { coordinator, events } = harness();
  assert.throws(() => coordinator.run(() => { throw new Error('Application failed'); }, { kind: 'push' }), /Application failed/);
  assert.deepEqual(events, ['capture:1', 'remove:1']);
});

test('interruption releases preview URLs exactly once, after snapshots are gone', async () => {
  const { coordinator, events, pending } = harness();
  coordinator.run(() => {}, { kind: 'push' });
  coordinator.afterTransition(() => events.push('revoke:blob'));
  coordinator.finish(); coordinator.finish(); pending[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ['capture:1', 'stop:1', 'remove:1', 'revoke:blob']);
});

test('push/pop reverse the same screen trajectory; tabs have their own shorter mirrored fade', () => {
  for (const rtl of [false, true]) {
    const push = screenMotion('push', { width: 390, rtl });
    const pop = screenMotion('pop', { width: 390, rtl });
    assert.equal(push.duration, 280); assert.equal(pop.duration, 280);
    assert.equal(push.incoming[0].transform, pop.outgoing[1].transform);
    assert.equal(push.outgoing[1].transform, pop.incoming[0].transform);
    const tab = screenMotion('tab', { direction: 1, rtl });
    assert.equal(tab.duration, 200);
    assert.equal(tab.incoming[0].opacity, 0);
    assert.equal(tab.outgoing[1].opacity, 0);
    assert.equal(tab.incoming[0].transform, `translateX(${rtl ? -12 : 12}px)`);
  }
});
