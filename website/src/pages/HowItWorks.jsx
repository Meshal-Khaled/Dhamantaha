import { ArrowRight, Check, Cloud, HardDrive, Plus, ScanText, Sparkles, Timer, Upload } from 'lucide-react';
import Button from '../components/Button.jsx';
import WarrantyMeter from '../components/WarrantyMeter.jsx';
import usePageTitle from '../components/usePageTitle.js';
import { useSettings } from '../state/settings.jsx';

const steps = [
  { key: 's1', Icon: Upload },
  { key: 's2', Icon: ScanText },
  { key: 's3', Icon: Timer },
];
const places = [
  { key: 'browser', Icon: HardDrive },
  { key: 'ring', Icon: Cloud },
  { key: 'google', Icon: Sparkles },
];

export default function HowItWorks() {
  const { t } = useSettings();
  usePageTitle('nav.how');
  return <>
    <section className="page-hero">
      <div className="container container--narrow">
        <h1>{t('how.title')}</h1>
        <p className="page-hero__lead">{t('how.lead')}</p>
      </div>
    </section>

    <section className="section section--tight" aria-label={t('how.title')}>
      <div className="container container--narrow">
        <ol className="story">
          {steps.map(({ key, Icon }) => <li key={key} className="story__step">
            <span className="story__icon"><Icon size={26} aria-hidden="true" /></span>
            <div>
              <h2>{t(`how.${key}.title`)}</h2>
              <p>{t(`how.${key}.body`)}</p>
              {key === 's3' && <div className="story__sample" aria-hidden="true">
                <WarrantyMeter days={41} percent={22} label={t('detail.item.warranty')} />
              </div>}
            </div>
          </li>)}
        </ol>
      </div>
    </section>

    <section className="section section--alt" aria-labelledby="read-title">
      <div className="container container--narrow">
        <h2 id="read-title" className="section__title">{t('how.read.title')}</h2>
        <ul className="read-list">
          {[1, 2, 3, 4, 5, 6].map((n) => <li key={n}><Check size={18} aria-hidden="true" />{t(`how.read.i${n}`)}</li>)}
        </ul>
      </div>
    </section>

    <section className="section" aria-labelledby="where-title">
      <div className="container">
        <h2 id="where-title" className="section__title">{t('how.where.title')}</h2>
        <ol className="places">
          {places.map(({ key, Icon }, index) => <li key={key} className="place">
            <span className="place__icon"><Icon size={26} aria-hidden="true" /></span>
            <h3>{t(`how.where.${key}.title`)}</h3>
            <p>{t(`how.where.${key}.body`)}</p>
            {index < places.length - 1 && <ArrowRight className="place__arrow mirror" size={22} aria-hidden="true" />}
          </li>)}
        </ol>
      </div>
    </section>

    <section className="cta-band">
      <div className="container cta-band__inner">
        <div>
          <h2>{t('how.cta.title')}</h2>
          <p>{t('how.cta.body')}</p>
        </div>
        <Button to="/add" variant="onband" size="lg"><Plus size={20} aria-hidden="true" />{t('home.ctaAdd')}</Button>
      </div>
    </section>
  </>;
}
