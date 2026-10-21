import { useEffect, useRef, useState } from 'react';
import { Camera, FileUp, ShieldCheck, Sparkles } from 'lucide-react';
import { ArchiveBoxIcon, ComputerDesktopIcon, DevicePhoneMobileIcon, DeviceTabletIcon, MusicalNoteIcon, ClockIcon, CameraIcon, TvIcon, PrinterIcon, PuzzlePieceIcon, BoltIcon, ShoppingBagIcon, TagIcon, HomeIcon, WrenchScrewdriverIcon, LinkIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { receiptWallet } from './receipt-wallet.js';

const icons = { package: ArchiveBoxIcon, laptop: ComputerDesktopIcon, phone: DevicePhoneMobileIcon, tablet: DeviceTabletIcon, headphones: MusicalNoteIcon, watch: ClockIcon, camera: CameraIcon, tv: TvIcon, printer: PrinterIcon, gamepad: PuzzlePieceIcon, appliance: BoltIcon, shirt: TagIcon, bag: ShoppingBagIcon, shoes: TagIcon, jewelry: SparklesIcon, furniture: HomeIcon, tool: WrenchScrewdriverIcon, cable: LinkIcon };

export function ItemIcon({ item }) {
  const Icon = Object.hasOwn(icons, item.icon) ? icons[item.icon] : ArchiveBoxIcon;
  return <span className="item-icon" aria-hidden="true"><Icon /></span>;
}

export function ItemIdentity({ item, receiptId, photo }) {
  return photo ? <span className="item-thumbnail"><ItemIcon item={item} /><ItemPhoto receiptId={receiptId} asset={photo} name={item.displayName || item.description || ''} /></span> : <ItemIcon item={item} />;
}

export function ItemPhoto({ receiptId, asset, name }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!receiptId || !asset) { setUrl(null); return; }
    let alive = true;
    let objectUrl;
    receiptWallet.getAsset(receiptId, asset.id).then(({ file }) => {
      if (alive) { objectUrl = URL.createObjectURL(file); setUrl(objectUrl); }
    }).catch(() => { if (alive) setUrl(null); });
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [receiptId, asset?.id]);
  return url ? <img className="item-photo" src={url} alt={name} /> : null;
}

export function CoverageExplainer({ coverage, arabic, attachmentName }) {
  const t = (en, ar) => arabic ? ar : en;
  if (!coverage?.sourceText) return null;
  return <section className="coverage-explainer">
    <h3><ShieldCheck size={17} aria-hidden="true" />{t('Warranty coverage', 'تغطية الضمان')}</h3>
    <p className="tip">{attachmentName ? `${t('From your attached terms', 'من الشروط المرفقة')}: ${attachmentName}` : t('From the terms included in the analysis.', 'من الشروط الواردة في التحليل.')}</p>
    {[['covered', t('Appears covered', 'يبدو مشمولًا')], ['excluded', t('Excluded', 'مستثنى')], ['unclear', t('Unclear', 'غير واضح')]].map(([kind, title]) => <div className={`coverage-group ${kind}`} key={kind}>
      <h4>{title}</h4>
      {Array.isArray(coverage[kind]) && coverage[kind].some(point => point?.quote && point?.summary) ? coverage[kind].filter(point => point?.quote && point?.summary).map((point, i) => <div className="coverage-point" key={i}>
        <p dir="auto">{point.summary}</p><details><summary>{t('View source', 'عرض المصدر')}{point.reference && ` · ${point.reference}`}</summary><blockquote dir="auto">{point.quote}</blockquote></details>
      </div>) : <p className="tip">{t('Not specified in these terms.', 'غير محدد في هذه الشروط.')}</p>}
    </div>)}
    <details className="full-terms"><summary>{t('Read the source terms', 'قراءة الشروط الأصلية')}</summary><p dir="auto">{coverage.sourceText}</p></details>
    <p className="tip">{t('AI summary of these terms. Confirm unclear points with the warranty provider.', 'ملخص آلي لهذه الشروط. تأكد من النقاط غير الواضحة مع مزوّد الضمان.')}</p>
  </section>;
}

export function ItemExtras({ entry, receiptId, assets = [], arabic, busy, native, onAsset, onPhoto, onExplain, onOpenAsset }) {
  const t = (en, ar) => arabic ? ar : en;
  const photoInput = useRef(null);
  const termsInput = useRef(null);
  const photo = assets.find(asset => asset.index === entry.index && asset.kind === 'photo');
  const terms = assets.find(asset => asset.index === entry.index && asset.kind === 'terms');
  const onFile = kind => event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onAsset(entry.index, kind, file); };
  const name = entry.item.displayName || entry.item.description || t('Product', 'منتج');
  return <>
    <CoverageExplainer coverage={terms ? terms.explanation?.coverage : entry.item.warranty?.coverage} arabic={arabic} attachmentName={terms?.name} />
    {receiptId && <div className="item-extras">
      {photo && <ItemPhoto receiptId={receiptId} asset={photo} name={name} />}
      <div className="item-photo-actions">
        {native && <button className="secondary" disabled={busy} onClick={() => onPhoto(entry.index)}><Camera size={16} aria-hidden="true" />{photo ? t('Retake item photo', 'إعادة تصوير المنتج') : t('Photograph item', 'تصوير المنتج')}</button>}
        <button className="link" disabled={busy} onClick={() => photoInput.current?.click()}>{photo ? t('Replace photo', 'تغيير الصورة') : t('Choose item photo', 'اختيار صورة المنتج')}</button>
      </div>
      <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onFile('photo')} />
      <div className="terms-actions"><h3>{t('Warranty terms', 'شروط الضمان')}</h3><p className="tip">{t('Attach a photo or PDF to understand what appears covered, excluded, or unclear.', 'أرفق صورة أو PDF لفهم ما يبدو مشمولًا أو مستثنى أو غير واضح.')}</p>
        {terms && <p className="attachment-name" dir="auto">{terms.name}</p>}
        {terms && <button className="link" disabled={busy} onClick={() => onOpenAsset(terms.id)}>{t('Open attached terms', 'فتح الشروط المرفقة')}</button>}
        <div className="row"><button className="secondary" disabled={busy} onClick={() => termsInput.current?.click()}><FileUp size={16} aria-hidden="true" />{terms ? t('Replace terms', 'تغيير الشروط') : t('Attach terms', 'إرفاق الشروط')}</button>
        {terms && <button className="btn" disabled={busy} onClick={() => onExplain(entry.index, terms)}><Sparkles size={16} aria-hidden="true" />{terms.explanation ? t('Explain again', 'إعادة الشرح') : t('Explain coverage', 'شرح التغطية')}</button>}</div>
        {terms && <p className="tip">{t('Explain coverage sends these terms to the analysis service. Your item photo stays on this device.', 'شرح التغطية يرسل هذه الشروط إلى خدمة التحليل. تبقى صورة المنتج على جهازك.')}</p>}
        <input ref={termsInput} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={onFile('terms')} />
      </div>
    </div>}
  </>;
}
