export const TAB_ROUTES = ['home', 'saved', 'add', 'analyst', 'settings'];
export const MOTION_EASING = 'cubic-bezier(.22, .68, .18, 1)';

export function screenMotion(kind, { width, direction = 1, rtl = false } = {}) {
  const sign = (rtl ? -1 : 1) * direction;
  const frame = (x, opacity) => ({ transform: `translateX(${x}px)`, opacity });
  if (kind === 'tab') return { duration: 200, incoming: [frame(sign * 12, 0), frame(0, 1)], outgoing: [frame(0, 1), frame(-sign * 12, 0)] };
  const distance = Math.max(1, width || 320) * (rtl ? -1 : 1);
  return kind === 'pop'
    ? { duration: 280, incoming: [frame(-distance * .22, .75), frame(0, 1)], outgoing: [frame(0, 1), frame(distance, .95)] }
    : { duration: 280, incoming: [frame(distance, .95), frame(0, 1)], outgoing: [frame(0, 1), frame(-distance * .22, .75)] };
}

/** One committed destination, at most one visual departure, no queued navigation delays. */
export function createTransitionCoordinator({ capture, commit, play, enabled }) {
  let active;
  const finish = () => active?.finish();
  return {
    finish,
    afterTransition(callback) { if (active) active.releases.push(callback); else callback(); },
    run(change, intent) {
      finish();
      let snapshot = null;
      try { if (enabled()) snapshot = capture(); } catch { /* Navigation remains usable without a snapshot. */ }
      const group = { releases: [], finish() {
        if (group.done) return;
        group.done = true;
        group.stop?.();
        snapshot?.remove();
        if (active === group) active = null;
        for (const release of group.releases) release();
      } };
      active = group;
      try {
        commit(change);
        intent.afterCommit?.();
      } catch (error) { group.finish(); throw error; }
      if (!snapshot) { group.finish(); return; }
      try {
        const result = play(snapshot, intent);
        group.stop = result.stop;
        Promise.resolve(result.finished).then(group.finish, group.finish);
      } catch { group.finish(); } // Rendering succeeded; a visual failure must not undo the route.
    },
  };
}

function captureScreen(root) {
  if (!root) return null;
  const rect = root.getBoundingClientRect();
  const navTop = document.querySelector('.nav')?.getBoundingClientRect().top ?? innerHeight;
  const top = Math.max(0, rect.top);
  const height = Math.min(rect.bottom, navTop) - top;
  if (height <= 0) return null;
  const layer = document.createElement('div');
  layer.className = 'navigation-snapshot';
  layer.setAttribute('aria-hidden', 'true');
  layer.inert = true;
  Object.assign(layer.style, { top: `${top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${height}px` });
  const copy = root.cloneNode(true);
  // Preserve measured card geometry: content-visibility caches are not cloned by the DOM.
  const cards = root.querySelectorAll('.receipt-card');
  copy.querySelectorAll('.receipt-card').forEach((card, index) => { card.style.height = `${cards[index].getBoundingClientRect().height}px`; });
  // Hidden tab contents are state caches, never part of a departure snapshot.
  copy.querySelectorAll('[data-route][hidden]').forEach(node => node.remove());
  [copy, ...copy.querySelectorAll('[id]')].forEach(node => node.removeAttribute('id'));
  copy.querySelectorAll('a, button, input, select, textarea, summary, [tabindex]').forEach(node => { node.tabIndex = -1; });
  copy.querySelectorAll('input[type=password]').forEach(node => { node.value = ''; node.removeAttribute('value'); node.placeholder = '••••••••'; });
  Object.assign(copy.style, { width: `${rect.width}px`, margin: '0', position: 'relative', top: `${rect.top - top}px` });
  layer.append(copy);
  root.closest('.app').append(layer);
  return layer;
}

/** Web Animations are supported in Capacitor's Android WebView; no router/library shim. */
export function createNavigationMotion(getRoot, commit) {
  const motion = () => window.matchMedia('(prefers-reduced-motion: reduce)');
  const coordinator = createTransitionCoordinator({
    enabled: () => !motion().matches && document.visibilityState !== 'hidden' && Boolean(getRoot()?.animate),
    capture: () => captureScreen(getRoot()),
    commit,
    play(snapshot, { kind, direction }) {
      const root = getRoot();
      const spec = screenMotion(kind, { width: root.getBoundingClientRect().width, direction, rtl: root.closest('[dir]')?.dir === 'rtl' });
      snapshot.style.zIndex = kind === 'push' ? '1' : '3';
      root.dataset.navigation = kind;
      const options = { duration: spec.duration, easing: MOTION_EASING, fill: 'both' };
      const animations = [];
      try {
        animations.push(root.animate(spec.incoming, options), snapshot.animate(spec.outgoing, options));
      } catch { // A missing/old WebView animation implementation must never block navigation.
        animations.forEach(animation => animation.cancel());
      }
      return {
        finished: Promise.all(animations.map(animation => animation.finished.catch(() => {}))),
        stop() { animations.forEach(animation => animation.cancel()); delete root.dataset.navigation; },
      };
    },
  });
  return {
    ...coordinator,
    connect() {
      const preference = motion();
      const onPreference = () => { if (preference.matches) coordinator.finish(); };
      const onVisibility = () => { if (document.visibilityState === 'hidden') coordinator.finish(); };
      preference.addEventListener?.('change', onPreference);
      document.addEventListener('visibilitychange', onVisibility);
      return () => {
        preference.removeEventListener?.('change', onPreference);
        document.removeEventListener('visibilitychange', onVisibility);
        coordinator.finish();
      };
    },
  };
}
