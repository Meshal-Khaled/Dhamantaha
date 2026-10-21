import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createNavigationMotion, TAB_ROUTES } from './navigation-motion.js';

/** Owns every actual page commit, including Android Back, file imports and deletions. */
export function useWalletNavigation() {
  const [page, setPage] = useState('home');
  const [visited, setVisited] = useState(['home']);
  const current = useRef('home');
  const positions = useRef(new Map());
  const engine = useRef(null);
  if (!engine.current) engine.current = createNavigationMotion(() => document.getElementById('main-content'), flushSync);
  useEffect(() => engine.current.connect(), []);

  const go = useCallback((target, kind = 'tab', change = () => {}, departurePosition) => {
    const from = current.current;
    positions.current.set(from, departurePosition ?? { x: window.scrollX, y: window.scrollY });
    const direction = TAB_ROUTES.indexOf(target) < TAB_ROUTES.indexOf(from) ? -1 : 1;
    engine.current.run(() => {
      change();
      current.current = target;
      setPage(target);
      if (TAB_ROUTES.includes(target)) setVisited(previous => previous.includes(target) ? previous : [...previous, target]);
    }, { kind, direction, afterCommit() {
      const position = kind === 'push' ? null : positions.current.get(target);
      window.scrollTo({ left: position?.x ?? 0, top: position?.y ?? 0, behavior: 'instant' });
      const root = document.getElementById('main-content');
      if (!document.activeElement?.closest('.nav')) root?.focus({ preventScroll: true });
    } });
  }, []);

  const animate = useCallback((change, kind, afterCommit) => engine.current.run(change, { kind, direction: 1, afterCommit }), []);
  const releasePreview = useCallback(url => engine.current.afterTransition(() => URL.revokeObjectURL(url)), []);
  return { page, visited, go, animate, releasePreview };
}
