import { useEffect, useRef, useState } from 'react';
import { Armchair, Cable, Camera, FileUp, Footprints, Gamepad2, Gem, Headphones, ImagePlus, Laptop, LoaderCircle, Package, Printer, ShieldCheck, Shirt, ShoppingBag, Smartphone, Sparkles, Tablet, Tv, Watch, Wrench, Zap } from 'lucide-react';
import Button from './Button.jsx';
import { describeError } from '../lib/api.js';
import { receiptWallet } from '../lib/receipt-store.js';
import { useSettings } from '../state/settings.jsx';
import { useToast } from '../state/toast.jsx';
import { useWallet } from '../state/wallet.jsx';

const icons = {
  package: Package, laptop: Laptop, phone: Smartphone, tablet: Tablet, headphones: Headphones, watch: Watch, camera: Camera, tv: Tv,
  printer: Printer, gamepad: Gamepad2, appliance: Zap, shirt: Shirt, bag: ShoppingBag, shoes: Footprints, jewelry: Gem, furniture: Armchair,
  tool: Wrench, cable: Cable,
};

/** The product's icon, chosen from the hint the analysis returns. Unknown hints get a plain package. */
export function ItemIcon({ item }) {
  const Icon = Object.hasOwn(icons, item.icon) ? icons[item.icon] : Package;
  return <span className="item-icon" aria-hidden="true"><Icon size={22} /></span>;
}

function ItemPhoto({ receiptId, asset, name }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    let objectUrl;
    receiptWallet.getAsset(receiptId, asset.id).then(({ file }) => {
      if (alive) { objectUrl = URL.createObjectURL(file); setUrl(objectUrl); }
    }).catch(() => { if (alive) setUrl(null); });
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [receiptId, asset.id]);
  return url ? <img className="item-photo" src={url} alt={name} /> : <div className="item-photo item-photo--empty" aria-hidden="true"><ImagePlus size={28} /></div>;
}

/** What a warranty document appears to cover, in plain words, each point with the quote it came from. */
export function CoverageExplainer({ coverage, attachmentName }) {
  const { t } = useSettings();
  if (!coverage?.sourceText) return null;
  const groups = [['covered', t('extras.coverage.covered')], ['excluded', t('extras.coverage.excluded')], ['unclear', t('extras.coverage.unclear')]];
  return <section className="coverage" aria-label={t('extras.coverage.title')}>
    <h4><ShieldCheck size={18} aria-hidden="true" />{t('extras.coverage.title')}</h4>
    <p className="muted small">{attachmentName ? t('extras.coverage.fromTerms', { name: attachmentName }) : t('extras.coverage.fromAnalysis')}</p>
    {groups.map(([kind, title]) => {
      const points = Array.isArray(coverage[kind]) ? coverage[kind].filter((point) => point?.quote && point?.summary) : [];
      return <div key={kind} className={`coverage__group coverage__group--${kind}`}>
        <h5>{title}</h5>
        {points.length ? points.map((point, i) => <div className="coverage__point" key={i}>
          <p dir="auto">{point.summary}</p>
          <details><summary>{t('extras.coverage.source')}{point.reference && ` · ${point.reference}`}</summary><blockquote dir="auto">{point.quote}</blockquote></details>
        </div>) : <p className="muted small">{t('extras.coverage.none')}</p>}
      </div>;
    })}
    <details className="coverage__full"><summary>{t('extras.coverage.full')}</summary><p dir="auto">{coverage.sourceText}</p></details>
    <p className="muted small">{t('extras.coverage.disclaimer')}</p>
  </section>;
}

/** A photo of the product and the warranty document for one item, kept in this browser. */
export default function ItemExtras({ record, entry }) {
  const { t, arabic } = useSettings();
  const { saveAsset, explain, busy } = useWallet();
  const toast = useToast();
  const photoInput = useRef(null);
  const termsInput = useRef(null);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const assets = record.assets ?? [];
  const photo = assets.find((asset) => asset.index === entry.index && asset.kind === 'photo');
  const terms = assets.find((asset) => asset.index === entry.index && asset.kind === 'terms');
  const disabled = Boolean(busy[record.id]) || working !== '';
  const name = entry.item.displayName || entry.item.description || '';

  const attach = (kind) => async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setWorking(kind);
    setError('');
    try {
      await saveAsset(record.id, entry.index, kind, file);
      toast(t('toast.changesSaved'));
    } catch (failure) { setError(describeError(failure, arabic)); } finally { setWorking(''); }
  };

  const explainTerms = async () => {
    setWorking('explain');
    setError('');
    try {
      await explain(record.id, entry.index, terms);
      toast(t('toast.changesSaved'));
    } catch (failure) { setError(describeError(failure, arabic)); } finally { setWorking(''); }
  };

  const openTerms = async () => {
    try {
      const { file } = await receiptWallet.getAsset(record.id, terms.id);
      window.open(URL.createObjectURL(file), '_blank', 'noopener');
    } catch (failure) { setError(describeError(failure, arabic)); }
  };

  return <div className="extras">
    <CoverageExplainer coverage={terms ? terms.explanation?.coverage : entry.item.warranty?.coverage} attachmentName={terms?.name} />
    <details className="more extras__details" open={Boolean(photo || terms)}>
      <summary>{t('extras.summary')}</summary>
      <div className="extras__grid">
        <div className="extras__block">
          <h4>{t('extras.photo.title')}</h4>
          {photo && <ItemPhoto receiptId={record.id} asset={photo} name={name} />}
          <Button variant="secondary" size="sm" disabled={disabled} onClick={() => photoInput.current?.click()}>
            {working === 'photo' ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <ImagePlus size={16} aria-hidden="true" />}
            {photo ? t('extras.photo.replace') : t('extras.photo.choose')}
          </Button>
          <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={attach('photo')} />
        </div>
        <div className="extras__block">
          <h4>{t('extras.terms.title')}</h4>
          <p className="muted small">{t('extras.terms.hint')}</p>
          {terms && <p className="extras__file" dir="auto">{terms.name}</p>}
          <div className="extras__actions">
            <Button variant="secondary" size="sm" disabled={disabled} onClick={() => termsInput.current?.click()}>
              {working === 'terms' ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <FileUp size={16} aria-hidden="true" />}
              {terms ? t('extras.terms.replace') : t('extras.terms.attach')}
            </Button>
            {terms && <Button variant="ghost" size="sm" disabled={disabled} onClick={openTerms}>{t('extras.terms.open')}</Button>}
            {terms && <Button size="sm" disabled={disabled} onClick={explainTerms}>
              {working === 'explain' ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
              {terms.explanation ? t('extras.terms.explainAgain') : t('extras.terms.explain')}
            </Button>}
          </div>
          {working === 'explain' && <p className="muted small" role="status">{t('extras.terms.explaining')}</p>}
          {terms && <p className="muted small">{t('extras.terms.sends')}</p>}
          <input ref={termsInput} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={attach('terms')} />
        </div>
      </div>
    </details>
    {error && <div className="alert alert--bad" role="alert"><p>{error}</p></div>}
  </div>;
}
