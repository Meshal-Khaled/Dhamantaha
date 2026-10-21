import { warrantyTone } from '../lib/wallet-view.js';
import { deadlineText } from '../lib/policy-labels.js';
import { formatNumber } from '../lib/format.js';
import { useSettings } from '../state/settings.jsx';

/** "41 days left" with a bar that empties as the end gets close and changes color as it does. */
export default function WarrantyMeter({ days, percent, label, compact = false }) {
  const { arabic } = useSettings();
  const tone = warrantyTone(days, percent);
  const known = percent !== null && percent !== undefined;
  return <div className={`meter meter--${tone}${compact ? ' meter--compact' : ''}`}>
    <div className="meter__head">
      <span className="meter__label">{label}</span>
      <strong className="meter__value">{deadlineText(days, arabic)}</strong>
    </div>
    <div className="meter__track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={known ? percent : undefined} aria-valuetext={known ? `${formatNumber(percent, arabic)}%` : deadlineText(days, arabic)}>
      <span className="meter__fill" style={{ width: `${known ? percent : 0}%` }} />
    </div>
  </div>;
}
