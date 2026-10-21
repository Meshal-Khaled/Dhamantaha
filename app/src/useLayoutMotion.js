import { useEffect, useLayoutEffect, useRef } from 'react';
import { MOTION_EASING } from './navigation-motion.js';

/** The single selected-tab pill follows real committed selection, including native Back. */
export function useTabIndicator(selected, arabic, font) {
  const nav = useRef(null);
  const indicator = useRef(null);
  useLayoutEffect(() => {
    const container = nav.current;
    const pill = indicator.current;
    let animation;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      const icon = container?.querySelector('[aria-current=page] .nav-icon');
      if (!icon || !pill) return;
      const previous = pill.style.transform;
      const rect = icon.getBoundingClientRect();
      const base = container.getBoundingClientRect();
      const target = `translate(${rect.left - base.left}px, ${rect.top - base.top}px)`;
      if (previous === target && pill.style.width === `${rect.width}px` && pill.style.height === `${rect.height}px`) return;
      animation?.cancel();
      Object.assign(pill.style, { width: `${rect.width}px`, height: `${rect.height}px`, transform: target, opacity: '1' });
      if (previous && previous !== target && !preference.matches && pill.animate) {
        animation = pill.animate([{ transform: previous }, { transform: target }], { duration: 200, easing: MOTION_EASING });
      }
    };
    const reduce = () => { if (preference.matches) animation?.cancel(); };
    update();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    observer?.observe(container);
    window.addEventListener('resize', update);
    preference.addEventListener?.('change', reduce);
    return () => { observer?.disconnect(); window.removeEventListener('resize', update); preference.removeEventListener?.('change', reduce); animation?.cancel(); };
  }, [selected, arabic, font]);
  return { nav, indicator };
}

/** Delegation covers warranty/return evidence, original previews and nested Settings disclosures. */
export function useDisclosureMotion(root) {
  useEffect(() => {
    const animations = new Map();
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const click = event => {
      const summary = event.target.closest('summary');
      const details = summary?.parentElement;
      if (!details || details.tagName !== 'DETAILS' || !root.current.contains(details) || event.defaultPrevented || event.button !== 0 || preference.matches || !details.animate) return;
      if (event.target.closest('button, a, input, select, textarea')) return;
      event.preventDefault();
      const old = animations.get(details);
      const start = details.getBoundingClientRect().height;
      const opening = old ? !old.opening : !details.open;
      old?.animation.cancel();
      const overflow = old?.overflow ?? details.style.overflow;
      details.open = true;
      details.style.overflow = 'hidden';
      const border = details.offsetHeight - details.clientHeight;
      const style = getComputedStyle(details);
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const end = opening ? details.scrollHeight + border : summary.getBoundingClientRect().height + border + padding;
      const animation = details.animate([{ height: `${start}px` }, { height: `${end}px` }], { duration: 200, easing: MOTION_EASING, fill: 'both' });
      const entry = { animation, opening, overflow, finish() {
        if (animations.get(details) !== entry) return;
        details.open = opening;
        details.style.overflow = overflow;
        animations.delete(details);
        animation.cancel();
      } };
      animations.set(details, entry);
      animation.finished.then(entry.finish, () => {});
    };
    const finish = () => { for (const entry of [...animations.values()]) entry.finish(); };
    const reduce = () => { if (preference.matches) finish(); };
    root.current.addEventListener('click', click);
    preference.addEventListener?.('change', reduce);
    const node = root.current;
    return () => { node.removeEventListener('click', click); preference.removeEventListener?.('change', reduce); finish(); };
  }, [root]);
}
