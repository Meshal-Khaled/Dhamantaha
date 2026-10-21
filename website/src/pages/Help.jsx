import { Mail } from 'lucide-react';
import Button from '../components/Button.jsx';
import usePageTitle from '../components/usePageTitle.js';
import { SUPPORT_EMAIL } from '../i18n/catalog.js';
import { formatNumber } from '../lib/format.js';
import { useSettings } from '../state/settings.jsx';
import { useWallet } from '../state/wallet.jsx';

const megabytes = (bytes, fallback) => Math.round((bytes ?? fallback) / 1048576);

export default function Help() {
  const { t, arabic } = useSettings();
  const { limits } = useWallet();
  usePageTitle('nav.help');
  // The limits come from The Ring when it can be reached, and match its defaults otherwise.
  const numbers = {
    photoMb: formatNumber(megabytes(limits?.maxImageBytes, 20 * 1048576), arabic),
    pdfMb: formatNumber(megabytes(limits?.maxPdfBytes, 10 * 1048576), arabic),
    pages: formatNumber(limits?.maxPdfPages ?? 10, arabic),
  };
  return <>
    <section className="page-hero">
      <div className="container container--narrow">
        <h1>{t('help.title')}</h1>
        <p className="page-hero__lead">{t('help.lead')}</p>
      </div>
    </section>
    <section className="section section--tight">
      <div className="container container--narrow">
        <div className="faq">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <details key={n} className="faq__item">
            <summary>{t(`help.q${n}`)}</summary>
            <p>{t(`help.a${n}`, numbers)}</p>
          </details>)}
        </div>
        <div className="card contact-card">
          <div>
            <h2>{t('help.contact.title')}</h2>
            <p className="muted">{t('help.contact.body')}</p>
          </div>
          <Button href={`mailto:${SUPPORT_EMAIL}?subject=Dhamantaha%20help`}><Mail size={18} aria-hidden="true" /><bdi dir="ltr">{SUPPORT_EMAIL}</bdi></Button>
        </div>
      </div>
    </section>
  </>;
}
