import { useLayoutEffect, useRef } from 'react';
import { MOTION_EASING } from './navigation-motion.js';

/** Kept mounted so close can reverse the opening movement before leaving the top layer. */
export default function ConfirmationDialog({ open, id, title, children, onCancel, busy, actions }) {
  const dialog = useRef(null);
  const content = useRef(null);
  if (open) content.current = { title, children, actions };
  useLayoutEffect(() => {
    const node = dialog.current;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    let active = true;
    let animation;
    const settle = () => {
      if (!active) return;
      animation?.cancel();
      node.dataset.modalPhase = open ? 'open' : 'closed';
      if (!open && node.open) node.close();
    };
    if (open && !node.open) node.showModal();
    if (!node.open) return;
    node.dataset.modalPhase = open ? 'opening' : 'closing';
    if (preference.matches || !node.animate) settle();
    else {
      animation = node.animate(open
        ? [{ opacity: 0, transform: 'translateY(40px)' }, { opacity: 1, transform: 'translateY(0)' }]
        : [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(40px)' }],
      { duration: open ? 240 : 200, easing: MOTION_EASING, fill: 'both' });
      animation.finished.then(settle, () => {});
    }
    const reduce = () => { if (preference.matches) settle(); };
    preference.addEventListener?.('change', reduce);
    return () => { active = false; animation?.cancel(); preference.removeEventListener?.('change', reduce); };
  }, [open]);
  useLayoutEffect(() => () => { if (dialog.current?.open) dialog.current.close(); }, []);
  const displayed = content.current;
  return <dialog ref={dialog} id={id} className="confirmation-dialog" aria-labelledby={`${id}-title`} inert={!open} onCancel={event => { event.preventDefault(); if (open && !busy) onCancel(); }}>
    <h2 id={`${id}-title`}>{displayed?.title}</h2><div className="dialog-content">{displayed?.children}</div><div className="dialog-actions">{displayed?.actions}</div>
  </dialog>;
}
