import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';

const ToastContext = createContext(() => {});

/** Short confirmations in the corner of the page. Announced to screen readers. */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);
  const timers = useRef(new Set());

  const show = useCallback((message, tone = 'ok') => {
    const id = ++counter.current;
    setToasts((current) => [...current, { id, message, tone }]);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
    timers.current.add(timer);
  }, []);

  useEffect(() => () => { for (const timer of timers.current) clearTimeout(timer); }, []);

  return <ToastContext.Provider value={show}>
    {children}
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => <div key={toast.id} className={`toast toast--${toast.tone}`}>
        {toast.tone === 'error' ? <CircleAlert size={18} aria-hidden="true" /> : <CircleCheck size={18} aria-hidden="true" />}
        <span>{toast.message}</span>
      </div>)}
    </div>
  </ToastContext.Provider>;
}

export const useToast = () => useContext(ToastContext);
