import { Mail } from 'lucide-react';
import Button from '../components/Button.jsx';
import usePageTitle from '../components/usePageTitle.js';
import { SUPPORT_EMAIL } from '../i18n/catalog.js';
import { useSettings } from '../state/settings.jsx';

export default function Privacy() {
  const { t } = useSettings();
  usePageTitle('nav.privacy');
  return <>
    <section className="page-hero">
      <div className="container container--narrow">
        <h1>{t('privacy.title')}</h1>
        <p className="page-hero__lead">{t('privacy.lead')}</p>
        <p className="muted small">{t('privacy.updated')}</p>
      </div>
    </section>
    <section className="section section--tight">
      <div className="container container--narrow prose">
        {[1, 2, 3, 4, 5, 6, 7].map((n) => <section key={n} aria-labelledby={`privacy-${n}`}>
          <h2 id={`privacy-${n}`}>{t(`privacy.s${n}.title`)}</h2>
          <p>{t(`privacy.s${n}.body`)}</p>
        </section>)}
        <Button variant="secondary" href={`mailto:${SUPPORT_EMAIL}?subject=Dhamantaha%20privacy`}><Mail size={18} aria-hidden="true" /><bdi dir="ltr">{SUPPORT_EMAIL}</bdi></Button>
      </div>
    </section>
  </>;
}
