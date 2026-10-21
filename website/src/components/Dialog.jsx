import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { useSettings } from '../state/settings.jsx';

/**
 * A modal window on the browser's own <dialog>: focus stays inside, Escape closes it, and the page behind is inert.
 * Content is only rendered while it is open, so a form inside starts fresh each time.
 */
export default function Dialog({ open, onClose, title, children, actions, busy = false, wide = false, backdropCloses = true }) {
  const { t } = useSettings();
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  return <dialog ref={ref} className={`dialog${wide ? ' dialog--wide' : ''}`} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    onMouseDown={(event) => { if (backdropCloses && event.target === ref.current && !busy) onClose(); }}>
    {open && <div className="dialog__body">
      <div className="dialog__head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label={t('common.close')}><X size={20} aria-hidden="true" /></button>
      </div>
      <div className="dialog__content">{children}</div>
      {actions && <div className="dialog__actions">{actions}</div>}
    </div>}
  </dialog>;
}
