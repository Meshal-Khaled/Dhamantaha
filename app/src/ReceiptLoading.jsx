/** Decorative receipt scan; the surrounding status supplies its accessible message. */
export default function ReceiptLoading({ compact = false }) {
  return <span className={`receipt-loading${compact ? ' compact' : ''}`} aria-hidden="true">
    <svg viewBox="0 0 64 76" fill="none"><path className="loading-paper" d="M12 5h40v66l-5-4-5 4-5-4-5 4-5-4-5 4-5-4-5 4V5Z" /><path className="loading-ink" d="M22 22h20M22 32h20M22 42h12M22 52h20" /><path className="loading-scan" d="M6 0h52" /></svg>
    <span className="loading-dots"><i /><i /><i /></span>
  </span>;
}
