import { useEffect } from 'react';

/** Asks search engines to leave this page out of their results while it is open. */
export default function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.append(meta);
    return () => meta.remove();
  }, []);
}
