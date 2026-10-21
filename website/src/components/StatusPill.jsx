import { CircleHelp, Clock3, FileQuestionMark, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useSettings } from '../state/settings.jsx';

const looks = {
  active: { tone: 'ok', Icon: ShieldCheck },
  soon: { tone: 'warn', Icon: Clock3 },
  expired: { tone: 'bad', Icon: ShieldAlert },
  review: { tone: 'mute', Icon: CircleHelp },
  unread: { tone: 'mute', Icon: FileQuestionMark },
};

/** The one-word state of a receipt: active, ending soon, expired, terms to review, or not read yet. */
export default function StatusPill({ status }) {
  const { t } = useSettings();
  const { tone, Icon } = looks[status] ?? looks.review;
  return <span className={`pill pill--${tone}`}><Icon size={14} aria-hidden="true" />{t(`status.${status}`)}</span>;
}
