import { useMemo } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Check, Clock3, FileText, HardDrive, Languages, Lock, PencilLine, Plus, ScanText, ShieldCheck, Store, Timer, Undo2, Upload } from 'lucide-react';
import Button from '../components/Button.jsx';
import WarrantyMeter from '../components/WarrantyMeter.jsx';
import usePageTitle from '../components/usePageTitle.js';
import { formatMoney, formatNumber } from '../lib/format.js';
import { deadlineText } from '../lib/policy-labels.js';
import { matchesFilter, receiptTitle } from '../lib/receipt-view.js';
import { walletSummary } from '../lib/wallet-view.js';
import { useSettings } from '../state/settings.jsx';
import { useWallet } from '../state/wallet.jsx';

/** A made-up receipt that shows what the countdown looks like. Decorative, so it is hidden from screen readers. */
function HeroPreview() {
  const { t, arabic } = useSettings();
  return <div className="preview" aria-hidden="true">
    <div className="preview__card">
      <span className="preview__tag">{t('home.preview.label')}</span>
      <div className="preview__store">
        <span className="preview__avatar"><Store size={22} /></span>
        <div className="preview__store-text"><strong>{t('home.preview.store')}</strong><small>{t('home.preview.bought')}</small></div>
        <span className="pill pill--ok"><ShieldCheck size={14} />{t('status.active')}</span>
      </div>
      <div className="preview__item"><span>{t('home.preview.item')}</span><strong><bdi>{formatMoney(3999, 'SAR', arabic)}</bdi></strong></div>
      <WarrantyMeter days={412} percent={56.4} label={t('home.preview.warranty')} />
      <div className="preview__return"><Undo2 size={16} />{t('home.preview.return')}<strong>{deadlineText(3, arabic)}</strong></div>
    </div>
    <div className="preview__float preview__float--soon">
      <span className="pill pill--warn"><Clock3 size={14} />{t('home.preview.soon')}</span>
      <strong>{t('home.preview.soonItem')}</strong>
      <WarrantyMeter days={12} percent={4} label={t('detail.item.warranty')} compact />
    </div>
    <div className="preview__float preview__float--saved"><Lock size={16} />{t('home.preview.saved')}</div>
  </div>;
}

/** Shown only once there are receipts: the numbers and what ends next. */
function WalletStrip({ summary, total }) {
  const { t, arabic } = useSettings();
  const next = summary.upcoming[0];
  const active = summary.cards.filter((card) => matchesFilter(card, 'active')).length;
  return <section className="wallet-strip" aria-labelledby="wallet-strip-title">
    <div className="container wallet-strip__inner">
      <h2 id="wallet-strip-title">{t('home.wallet.title')}</h2>
      <div className="wallet-strip__stats">
        <Link to="/receipts" className="stat"><strong>{formatNumber(total, arabic)}</strong><span>{t('home.wallet.receipts')}</span></Link>
        <Link to="/receipts?filter=active" className="stat"><strong>{formatNumber(active, arabic)}</strong><span>{t('home.wallet.active')}</span></Link>
        <Link to="/receipts?filter=soon" className="stat"><strong>{formatNumber(summary.upcoming.length, arabic)}</strong><span>{t('home.wallet.upcoming')}</span></Link>
      </div>
      <div className="wallet-strip__next">
        {next ? <Link to={`/receipts/${next.record.id}`} className="wallet-strip__link">
          <span className="wallet-strip__label">{t('home.wallet.next')}</span>
          <strong><bdi>{receiptTitle(next)}</bdi></strong>
          <span>{deadlineText(next.nextDeadline, arabic)}</span>
          <ArrowRight size={18} className="mirror" aria-hidden="true" />
        </Link> : <p className="wallet-strip__none"><Check size={18} aria-hidden="true" />{t('home.wallet.none')}</p>}
      </div>
    </div>
  </section>;
}

const steps = [{ Icon: Upload, key: 's1' }, { Icon: ScanText, key: 's2' }, { Icon: Timer, key: 's3' }];
const features = [
  { Icon: Timer, key: 'f1' }, { Icon: Undo2, key: 'f2' }, { Icon: Languages, key: 'f3' },
  { Icon: HardDrive, key: 'f4' }, { Icon: PencilLine, key: 'f5' }, { Icon: FileText, key: 'f6' },
];

export default function Home() {
  const { t, arabic } = useSettings();
  const { records, loading } = useWallet();
  usePageTitle(null);
  const summary = useMemo(() => walletSummary(records), [records]);

  return <>
    <section className="hero">
      <div className="container hero__grid">
        <div className="hero__copy">
          <p className="eyebrow"><ShieldCheck size={16} aria-hidden="true" />{t('home.eyebrow')}</p>
          <h1 className="hero__title">{t('home.title')}</h1>
          <p className="hero__lead">{t('home.lead')}</p>
          <div className="hero__actions">
            <Button to="/add" size="lg"><Plus size={20} aria-hidden="true" />{t('home.ctaAdd')}</Button>
            <Button to="/how-it-works" variant="secondary" size="lg">{t('home.ctaHow')}</Button>
          </div>
          <ul className="trust-list">
            {['home.trust1', 'home.trust2', 'home.trust3'].map((key) => <li key={key}><Check size={16} aria-hidden="true" />{t(key)}</li>)}
          </ul>
        </div>
        <HeroPreview />
      </div>
    </section>

    {!loading && records.length > 0 && <WalletStrip summary={summary} total={records.length} />}

    <section className="section" aria-labelledby="how-title">
      <div className="container">
        <h2 id="how-title" className="section__title">{t('home.how.title')}</h2>
        <ol className="steps">
          {steps.map(({ Icon, key }, index) => <li key={key} className="step">
            <span className="step__icon"><Icon size={24} aria-hidden="true" /></span>
            <span className="step__number" aria-hidden="true">{formatNumber(index + 1, arabic)}</span>
            <h3>{t(`home.how.${key}.title`)}</h3>
            <p>{t(`home.how.${key}.body`)}</p>
          </li>)}
        </ol>
        <p className="section__more"><Link to="/how-it-works">{t('home.how.more')}<ArrowRight size={16} className="mirror" aria-hidden="true" /></Link></p>
      </div>
    </section>

    <section className="section section--alt" aria-labelledby="features-title">
      <div className="container">
        <h2 id="features-title" className="section__title">{t('home.features.title')}</h2>
        <ul className="feature-grid">
          {features.map(({ Icon, key }) => <li key={key} className="feature">
            <span className="feature__icon"><Icon size={22} aria-hidden="true" /></span>
            <h3>{t(`home.features.${key}.title`)}</h3>
            <p>{t(`home.features.${key}.body`)}</p>
          </li>)}
        </ul>
      </div>
    </section>

    <section className="section" aria-labelledby="privacy-title">
      <div className="container">
        <div className="band">
          <span className="band__icon"><Lock size={28} aria-hidden="true" /></span>
          <div className="band__text">
            <h2 id="privacy-title">{t('home.privacy.title')}</h2>
            <p>{t('home.privacy.body')}</p>
          </div>
          <Button to="/privacy" variant="onband">{t('home.privacy.link')}<ArrowRight size={18} className="mirror" aria-hidden="true" /></Button>
        </div>
      </div>
    </section>

    <section className="section section--alt" aria-labelledby="faq-title">
      <div className="container container--narrow">
        <h2 id="faq-title" className="section__title">{t('home.faq.title')}</h2>
        <div className="faq">
          {[1, 2, 3].map((n) => <details key={n} className="faq__item">
            <summary>{t(`home.faq.q${n}`)}</summary>
            <p>{t(`home.faq.a${n}`)}</p>
          </details>)}
        </div>
        <p className="section__more"><Link to="/help">{t('home.faq.more')}<ArrowRight size={16} className="mirror" aria-hidden="true" /></Link></p>
      </div>
    </section>

    <section className="cta-band">
      <div className="container cta-band__inner">
        <div>
          <h2>{t('home.final.title')}</h2>
          <p>{t('home.final.body')}</p>
        </div>
        <Button to="/add" variant="onband" size="lg"><Plus size={20} aria-hidden="true" />{t('home.ctaAdd')}</Button>
      </div>
    </section>
  </>;
}
