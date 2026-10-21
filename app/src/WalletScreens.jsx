import NotificationSettings from './NotificationSettings.jsx';
import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import { Camera, Check, ChevronDown, CircleCheck, FileText, Mail, Phone, Plus, ReceiptText, Search, ShieldCheck, ShieldX, ShieldQuestion, Undo2 } from 'lucide-react';
import { filterReceiptCards, sortReceiptCards, cardSearchText, itemName, linePrice, products, receiptCards, receiptPolicy, walletSummary, warrantyTone } from './wallet-view.js';
import { fieldLabel, formatDate, formatMoney, formatNumber } from './format.js';
import AppLockSettings from './AppLockSettings.jsx';
import { deadlineText, endedPolicy } from './policy-labels.js';
import { ItemIdentity, ItemExtras } from './ItemExtras.jsx';

export const translate = (arabic) => (en, ar) => arabic ? ar : en;

const coverageClass = (days) => days !== null && days < 0 ? 'ended' : days !== null && days <= 30 ? 'urgent' : '';
const itemCountText = (count, arabic) => !arabic ? `${formatNumber(count)} ${count === 1 ? 'item' : 'items'}`
  : count === 1 ? 'منتج واحد' : count === 2 ? 'منتجان' : `${formatNumber(count, true)} ${count <= 10 ? 'منتجات' : 'منتجًا'}`;

export function Deadline({ date, days, arabic }) {
  return <strong title={days === null ? undefined : formatDate(date, arabic)}>{deadlineText(days, arabic)}</strong>;
}

function PeriodLine({ date, days, arabic, label, kind }) {
  return <div className={`return-line ${days !== null && days < 0 ? 'period-ended' : ''}`}>{days !== null && days < 0 ? <strong>{endedPolicy(kind, arabic)}</strong> : <><span>{label}</span><Deadline date={date} days={days} arabic={arabic} /></>}</div>;
}

function WarrantyTimer({ entry, arabic, label }) {
  const t = translate(arabic);
  const status = warrantyTone(entry.warrantyDays, entry.warrantyProgress);
  if (status === 'ended') return <div className="warranty-expired"><strong>{t('Expired', 'منتهي الصلاحية')}</strong><ShieldX size={19} aria-hidden="true" /></div>;
  return <div className={`warranty-timer ${status}`}>
    <div className="warranty-heading"><span>{label || t('Warranty', 'الضمان')} <Deadline date={entry.warrantyEnd} days={entry.warrantyDays} arabic={arabic} /></span><ShieldCheck aria-hidden="true" size={17} /></div>
    <div className="warranty-track" role="progressbar" aria-label={t('Warranty remaining', 'مدة الضمان المتبقية')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={entry.warrantyProgress ?? undefined} aria-valuetext={entry.warrantyProgress === null ? t('Purchase and warranty dates needed', 'يلزم تحديد تاريخ الشراء وانتهاء الضمان') : `${formatNumber(entry.warrantyProgress, arabic)}%`}>
      <span className="warranty-fill" style={{ transform: `scaleX(${(entry.warrantyProgress ?? 0) / 100})` }} />
    </div>
  </div>;
}

/** One card per receipt: who, when, how much, and the next warranty. Everything else is in the details. */
export function ReceiptCard({ card, arabic, disabled, onOpen }) {
  const t = translate(arabic);
  const days = card.lead.warrantyDays;
  const state = !card.analyzed ? t('Not analyzed', 'غير محللة') : days === null ? t('Warranty unknown', 'الضمان غير معروف') : days < 0 ? t('Expired', 'منتهي') : days <= 30 ? t('Ending soon', 'ينتهي قريبًا') : t('Warranty active', 'ضمان سارٍ');
  const title = card.receipt.merchantName || (card.itemCount === 1 && card.names[0]) || card.record.name;
  const subtitle = !card.analyzed ? t('Not read yet. Open it to analyze.', 'لم تُقرأ بعد. افتحها لتحليلها.')
    : card.names.length && !(card.itemCount === 1 && title === card.names[0]) ? card.names.join(arabic ? '، ' : ', ') : t('Store not specified', 'المتجر غير محدد');
  return <button className="product-card receipt-card" disabled={disabled} onClick={() => onOpen(card.record.id)}>
    <div className="product-top">
      <span className="product-emoji" aria-hidden="true">{card.record.mime === 'application/pdf' ? <ReceiptText size={22} /> : <FileText size={22} />}</span>
      <span className="product-title"><strong><bdi>{title}</bdi></strong><small><bdi>{subtitle}</bdi></small></span>
      <span className="product-price"><bdi>{formatMoney(card.total, card.receipt.currency, arabic)}</bdi></span>
    </div>
    <div className="product-meta"><span>{formatDate(card.receipt.purchaseDate || card.record.createdAt, arabic)}{card.itemCount > 1 && ` · ${itemCountText(card.itemCount, arabic)}`}</span><span className={`coverage-state ${days === null ? 'unknown' : coverageClass(days)}`}><span aria-hidden="true" />{state}</span></div>
    {card.analyzed && days !== null && <WarrantyTimer entry={card.lead} arabic={arabic} label={card.coveredCount > 1 ? t('Next warranty end', 'أقرب انتهاء ضمان') : undefined} />}
    {card.analyzed && days === null && <p className="tip">{t('No known warranty deadline. Open the receipt to review or enter its terms.', 'موعد انتهاء الضمان غير معروف. افتح الفاتورة لمراجعة الشروط أو إدخالها.')}</p>}
    {card.returnEntry && <div className="return-line"><span>{t('Return window', 'مهلة الإرجاع')}</span><Deadline date={card.returnEntry.returnEnd} days={card.returnEntry.returnDays} arabic={arabic} /></div>}
  </button>;
}

export function HomeScreen({ saved, arabic, busy, loading, onNavigate, onOpen }) {
  const t = translate(arabic);
  const summary = walletSummary(saved);
  if (!loading && saved.length === 0) return <>
    <h1 className="title"><span className="heading-emoji" aria-hidden="true">🧾</span>{t('Your warranty wallet', 'محفظة ضماناتك')}</h1>
    <section className="card empty home-empty"><ReceiptText size={36} aria-hidden="true" />
      <h2>{t('Start with your first receipt', 'ابدأ بفاتورتك الأولى')}</h2>
      <p>{t('Save a photo or PDF on this device. Analyze it when you choose, then review its warranty and return terms. Only known dates can be tracked.', 'احفظ صورة أو ملف PDF على هذا الجهاز. حلّل الفاتورة عندما تختار، ثم راجع شروط الضمان والإرجاع. يمكن متابعة المواعيد المعروفة فقط.')}</p>
      <button className="btn" disabled={busy} onClick={() => onNavigate('add')}><Plus size={18} aria-hidden="true" />{t('Add your first receipt', 'أضف فاتورتك الأولى')}</button>
      <p className="tip">{t('No account or analysis key is needed to save. Clearing app data removes saved receipts.', 'لا تحتاج إلى حساب أو مفتاح تحليل للحفظ. مسح بيانات التطبيق يزيل الفواتير المحفوظة.')}</p>
    </section>
  </>;
  return <>
    <div className="page-heading"><div><p className="hello"><span className="heading-emoji" aria-hidden="true">👋</span>{t('Welcome back', 'أهلًا بك')}</p><h1 className="title">{t('Your warranty wallet', 'محفظة ضماناتك')}</h1></div><ShieldCheck className="heading-symbol" aria-hidden="true" /></div>
    <div className="stats"><div className="stat"><strong>{loading ? '—' : formatNumber(saved.length, arabic)}</strong><span>{t('Receipts', 'فواتير')}</span></div><div className="stat"><strong>{loading ? '—' : formatNumber(summary.active, arabic)}</strong><span>{t('Active warranties', 'ضمانات سارية')}</span></div><div className="stat"><strong>{loading ? '—' : formatNumber(summary.upcoming.length, arabic)}</strong><span>{t('Upcoming deadlines', 'مواعيد قريبة')}</span></div></div>
    <section className="quick-add"><div><strong>{t('Keep your next purchase covered', 'احفظ فاتورتك القادمة')}</strong><p>{t('A photo or PDF is all you need.', 'صورة أو PDF، والباقي علينا.')}</p></div><button className="btn white" disabled={busy} onClick={() => onNavigate('add')}><Plus size={18} aria-hidden="true" />{t('Add receipt', 'إضافة فاتورة')}</button></section>
    <div className="section"><h2>{t('Next deadlines', 'المواعيد القادمة')}</h2><button className="link" disabled={busy} onClick={() => onNavigate('saved')}>{t('All receipts', 'كل الفواتير')}</button></div>
    {loading ? <p role="status">{t('Loading receipts…', 'جارٍ تحميل الفواتير…')}</p> : summary.upcoming.length ? summary.upcoming.slice(0, 6).map((card) => <ReceiptCard key={card.record.id} card={card} arabic={arabic} disabled={busy} onOpen={onOpen} />) : <div className="notice"><CircleCheck aria-hidden="true" /><div><strong>{t('No known deadlines in the next 30 days', 'لا توجد مواعيد معروفة خلال ٣٠ يومًا')}</strong><p>{t('Your receipts are saved. Unanalyzed receipts and unknown terms may have deadlines that are not tracked yet. Open a receipt to analyze it or review its dates and terms.', 'فواتيرك محفوظة. قد تكون للفواتير غير المحللة والشروط غير المعروفة مواعيد لم تُسجّل بعد. افتح فاتورة لتحليلها أو مراجعة تواريخها وشروطها.')}</p></div></div>}
    {!loading && !summary.upcoming.length && summary.cards.length > 0 && <><div className="section"><h2>{t('Recent purchases', 'آخر مشترياتك')}</h2></div>{summary.cards.slice(0, 2).map((card) => <ReceiptCard key={card.record.id} card={card} arabic={arabic} disabled={busy} onOpen={onOpen} />)}</>}
  </>;
}

export function ReceiptsScreen({ saved, arabic, busy, loading, onOpen, onAdd }) {
  const t = translate(arabic);
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(30);
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const deferred = useDeferredValue(query);
  const normalized = deferred.trim().normalize('NFKC').toLocaleLowerCase();
  const allCards = receiptCards(saved);
  const cards = sortReceiptCards(filterReceiptCards(allCards, filter).filter((card) => cardSearchText(card).includes(normalized)), sort);
  const filters = [['all', t('All', 'الكل')], ['active', t('Active', 'سارية')], ['soon', t('Ending soon', 'تنتهي قريبًا')], ['expired', t('Expired', 'منتهية')], ['unread', t('Not analyzed', 'غير محللة')]];
  const restricted = query.trim() || filter !== 'all';
  return <>
    <div className="page-heading"><div><h1 className="title"><span className="heading-emoji" aria-hidden="true">🧾</span>{t('Your receipts', 'فواتيرك')}</h1><p className="desc">{t('All your purchases, in one place.', 'كل مشترياتك، في مكان واحد.')}</p></div><span className="count-badge">{formatNumber(saved.length, arabic)} {t('receipts', 'فواتير')}</span></div>
    <label className="search"><Search size={19} aria-hidden="true" /><input type="search" placeholder={t('Store, product, code or filename…', 'متجر، منتج، رمز أو اسم ملف…')} aria-label={t('Search all receipts', 'البحث في جميع الفواتير')} value={query} onChange={(event) => { setQuery(event.target.value); setVisible(30); }} /></label>
    <div className="filter-row" role="group" aria-label={t('Filter receipts', 'تصفية الفواتير')}>{filters.map(([value, label]) => <button key={value} className={`filter-chip ${filter === value ? 'selected' : ''}`} aria-pressed={filter === value} onClick={() => { setFilter(value); setVisible(30); }}>{label}<span>{formatNumber(filterReceiptCards(allCards, value).length, arabic)}</span></button>)}</div>
    <div className="list-toolbar"><p role="status">{loading ? t('Loading receipts…', 'جارٍ تحميل الفواتير…') : t(`${formatNumber(cards.length)} of ${formatNumber(allCards.length)} receipts match · ${formatNumber(Math.min(visible, cards.length))} shown`, `${formatNumber(cards.length, true)} من ${formatNumber(allCards.length, true)} فواتير مطابقة · المعروض ${formatNumber(Math.min(visible, cards.length), true)}`)}</p><label>{t('Sort', 'الترتيب')}<select value={sort} onChange={event => { setSort(event.target.value); setVisible(30); }}><option value="newest">{t('Newest saved', 'الأحدث حفظًا')}</option><option value="deadline">{t('Nearest deadline', 'أقرب موعد')}</option><option value="store">{t('Store name', 'اسم المتجر')}</option></select></label></div>
    <div className="receipt-list" aria-busy={query !== deferred}>
      {loading ? <div className="loading-state" role="status">{t('Loading receipts…', 'جارٍ تحميل الفواتير…')}</div> : cards.length ? cards.slice(0, visible).map((card) => <ReceiptCard key={card.record.id} card={card} arabic={arabic} disabled={busy} onOpen={onOpen} />) : <section className="card empty"><ReceiptText size={32} aria-hidden="true" /><h2>{restricted ? t('No matching receipts', 'لا توجد فواتير مطابقة') : t('Your wallet starts here', 'محفظتك تبدأ هنا')}</h2><p>{restricted ? t('Try a different search or filter.', 'جرّب بحثًا أو تصفية أخرى.') : t('Add a photo or PDF. Your original stays on this device.', 'أضف صورة أو PDF. يبقى الأصل محفوظًا على جهازك.')}</p>{restricted ? <button className="secondary" onClick={() => { setQuery(''); setFilter('all'); setVisible(30); }}>{t('Reset filters', 'إعادة ضبط التصفية')}</button> : <button className="btn" onClick={onAdd}><Plus size={18} aria-hidden="true" />{t('Add receipt', 'إضافة فاتورة')}</button>}</section>}
    </div>
    {cards.length > visible && <button className="secondary full" onClick={() => setVisible((count) => count + 30)}>{t('Show more', 'عرض المزيد')}</button>}
    <p className="tip privacy-note"><ShieldCheck size={15} aria-hidden="true" />{t('Saved privately on this device. Clearing app data removes your receipts.', 'محفوظة بخصوصية على جهازك. مسح بيانات التطبيق يزيل الفواتير.')}</p>
  </>;
}

export function SettingsScreen({ reminders, settings, appearance, onAppearance, onSave, onGuard, arabic, health, onRetry, log }) {
  const t = translate(arabic);
  const [draft, setDraft] = useState(settings);
  const [baseline, setBaseline] = useState(settings);
  const [message, setMessage] = useState('');
  const dirty = draft.baseUrl !== baseline.baseUrl || draft.clientKey !== baseline.clientKey;
  const form = useRef(null);
  const save = useCallback(async () => {
    if (!form.current.reportValidity()) return false;
    const next = { baseUrl: draft.baseUrl.trim(), clientKey: draft.clientKey.trim() };
    if (!onSave(next)) return false;
    setDraft(next); setBaseline(next); setMessage(t('Connection saved', 'تم حفظ الاتصال')); return true;
  }, [draft, onSave, arabic]);
  useEffect(() => { onGuard({ dirty, save }); }, [dirty, save, onGuard]);
  useEffect(() => () => onGuard({ dirty: false, save: async () => true }), [onGuard]);
  const choices = (key, options) => <div className="choice-row">{options.map(([value, label]) => <button type="button" key={value} className={`choice ${appearance[key] === value ? 'chosen' : ''}`} aria-pressed={appearance[key] === value} onClick={() => onAppearance({ ...appearance, [key]: value })}>{appearance[key] === value && <Check size={16} aria-hidden="true" />}{label}</button>)}</div>;
  return <>
    <h1 className="title">{t('Settings', 'الإعدادات')}</h1><p className="desc">{t('A wallet that feels like yours.', 'محفظتك، بالطريقة التي تناسبك.')}</p>
    <section className="settings-section"><h2>{t('Appearance', 'المظهر')}</h2><div className="card settings-card"><strong>{t('Theme', 'وضع العرض')}</strong>{choices('theme', [['light', t('Light', 'فاتح')], ['dark', t('Dark', 'داكن')]])}<strong>{t('Text size', 'حجم الخط')}</strong>{choices('font', [['normal', t('Normal', 'عادي')], ['large', t('Large', 'كبير')]])}</div></section>
    <section className="settings-section"><h2>{t('Language', 'اللغة')}</h2><div className="card settings-card">{choices('language', [['ar', 'العربية'], ['en', 'English']])}</div></section>
    <section className="settings-section"><h2>{t('Receipt details', 'تفاصيل الفاتورة')}</h2><div className="card settings-card"><strong>{t('Price of an item bought more than once', 'سعر المنتج المشترى بأكثر من قطعة')}</strong>{choices('priceView', [['unit', t('Quantity × price', 'الكمية × السعر')], ['total', t('Item total', 'إجمالي المنتج')]])}<p className="tip">{t('Example', 'مثال')}: <bdi>{appearance.priceView === 'total' ? formatMoney(100, 'SAR', arabic) : `${formatNumber(2, arabic)} × ${formatMoney(50, 'SAR', arabic)}`}</bdi></p></div></section>
    <section className="card"><AppLockSettings arabic={arabic} /></section>
    <NotificationSettings reminders={reminders} arabic={arabic} />
    <section className="settings-section"><h2>{t('Contact us', 'تواصل معنا')}</h2><div className="card contact-card"><p>{t('Questions, feedback, or help with Dhamantaha?', 'لديك سؤال أو اقتراح أو تحتاج مساعدة مع ضمنتها؟')}</p><a className="secondary" href="mailto:arcos.workspace@gmail.com?subject=Dhamantaha%20support"><Mail size={18} aria-hidden="true" /><bdi dir="ltr">arcos.workspace@gmail.com</bdi></a></div></section>
    <details className="card connection"><summary>{t('Analysis connection', 'اتصال تحليل الفواتير')}</summary><p className="tip">{health.state === 'ok' ? t('Connected to The Ring', 'متصل بـ The Ring') : health.state === 'checking' ? t('Connecting…', 'جارٍ الاتصال…') : t('Offline. Your saved receipts are available.', 'غير متصل. الفواتير المحفوظة متاحة.')}</p><button className="link" onClick={onRetry}>{t('Check connection', 'فحص الاتصال')}</button>
      <form ref={form} onSubmit={(event) => { event.preventDefault(); save(); }}>
        <label className="field">{t('API address', 'عنوان الخدمة')}<input dir="ltr" type="url" required name="api-address" value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} /></label>
        <label className="field">{t('Client key', 'مفتاح التطبيق')}<input dir="ltr" type="password" name="client-key" value={draft.clientKey} onChange={(e) => setDraft({ ...draft, clientKey: e.target.value })} autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} /></label><button className="btn full" disabled={!dirty}>{t('Save connection', 'حفظ الاتصال')}</button><p role="status">{message}</p>
      </form><details className="debug"><summary>{t('Request diagnostics', 'تشخيص الطلبات')}</summary><pre dir="ltr">{log.map((entry) => entry.line).join('\n') || t('No requests yet.', 'لا توجد طلبات بعد.')}</pre></details>
    </details>
  </>;
}

/** "2 × SAR 50.00" or "SAR 100.00", as chosen in Settings. A single item shows its price either way. */
function ItemPrice({ item, currency, arabic, priceView }) {
  const { quantity, unitPrice, total } = linePrice(item);
  if (priceView === 'unit' && quantity > 1 && unitPrice !== null) return <bdi>{formatNumber(quantity, arabic)} × {formatMoney(unitPrice, currency, arabic)}</bdi>;
  return <bdi>{formatMoney(total, currency, arabic)}</bdi>;
}

function ItemDetails({ entry, currency, arabic, priceView, open, extras }) {
  const t = translate(arabic);
  const { item } = entry;
  const name = itemName(item) || t('Product', 'منتج');
  const { quantity } = linePrice(item);
  const printed = item.description?.normalize('NFKC').trim();
  const provider = item.warranty?.provider;
  return <details className="card item-card" id={`wallet-product-${entry.index}`} open={open}>
    <summary>
      {extras.native && extras.receiptId ? <button type="button" className="item-photo-shortcut" disabled={extras.busy} aria-label={`${t('Photograph', 'تصوير')} ${name}`} onClick={event => { event.preventDefault(); event.stopPropagation(); extras.onPhoto(entry.index); }}><ItemIdentity item={item} receiptId={extras.receiptId} photo={extras.assets?.find(asset => asset.index === entry.index && asset.kind === 'photo')} /><Camera className="camera-badge" size={13} aria-hidden="true" /></button> : <ItemIdentity item={item} />}
      <span className="product-title"><strong><bdi>{name}</bdi></strong><small><span className={`coverage-state ${coverageClass(entry.warrantyDays)}`}><span aria-hidden="true" />{entry.warrantyDays !== null && entry.warrantyDays < 0 ? deadlineText(entry.warrantyDays, arabic) : <>{t('Warranty', 'الضمان')}: {deadlineText(entry.warrantyDays, arabic)}</>}</span>{priceView === 'total' && quantity > 1 && <span>{t('Qty', 'الكمية')} {formatNumber(quantity, arabic)}</span>}</small></span>
      <span className="product-price"><ItemPrice item={item} currency={currency} arabic={arabic} priceView={priceView} /></span>
      <ChevronDown className="chevron" size={18} aria-hidden="true" />
    </summary>
    <div className="item-body">
      <p className="item-full-name" dir="auto">{name}</p>
      <dl className="facts item-purchase"><dt>{t('Quantity', 'الكمية')}</dt><dd>{quantity === null ? t('Not stated', 'غير مذكورة') : formatNumber(quantity, arabic)}</dd><dt>{t('Item total', 'إجمالي المنتج')}</dt><dd><bdi>{formatMoney(linePrice(item).total, currency, arabic)}</bdi></dd></dl>
      {entry.warrantyDays === null && !item.warranty?.sourceText && !item.localPolicy?.warranty ? <p className="tip no-warranty">{t('The receipt states no warranty for this item. You can add one with Edit below.', 'لا تذكر الفاتورة ضمانًا لهذا المنتج. يمكنك إضافته من زر التعديل أدناه.')}</p> : <WarrantyTimer entry={entry} arabic={arabic} />}
      {(provider || item.productIdentifier || item.category) && <dl className="facts">
        {provider && <><dt>{t('Warranty provider', 'مزوّد الضمان')}</dt><dd><bdi>{provider}</bdi></dd></>}
        {item.productIdentifier && <><dt>{t('Product code', 'رمز المنتج')}</dt><dd><bdi>{item.productIdentifier}</bdi></dd></>}
        {item.category && <><dt>{t('Category', 'الفئة')}</dt><dd><bdi>{item.category.normalize('NFKC')}</bdi></dd></>}
      </dl>}
      {item.warranty?.sourceText && <details className="full-terms"><summary>{t('Printed warranty terms', 'شروط الضمان المطبوعة')}</summary><p className="policy-text" dir="auto">{item.warranty.sourceText}</p></details>}
      {entry.returnSource === 'local' && <PeriodLine date={entry.returnEnd} days={entry.returnDays} arabic={arabic} label={t('Return', 'الإرجاع')} kind="return" />}
      {(item.localPolicy?.warranty || item.localPolicy?.returns) && <p className="tip">{t('Dates use the policy durations you entered. Confirm the store’s terms.', 'التواريخ حسب المدد التي أدخلتها. تحقق من شروط المتجر.')}</p>}
      {printed && printed !== name && <p className="tip printed-line"><span>{t('As printed', 'كما في الفاتورة')}:</span> <bdi dir="auto">{printed}</bdi></p>}
      <ItemExtras entry={entry} arabic={arabic} {...extras} />
    </div>
  </details>;
}

function ReturnPolicy({ receipt, arabic }) {
  const t = translate(arabic);
  const policy = receiptPolicy(receipt);
  return <div className="policy">
    <h3><Undo2 size={16} aria-hidden="true" />{t('Return / refund & exchange', 'الاسترجاع والاستبدال')}</h3>
    <p className="tip">{t('Warranty, refund and exchange are separate terms. A warranty does not automatically mean a refund or replacement is allowed. Confirm the printed policy with the store.', 'الضمان والاسترجاع والاستبدال شروط منفصلة. وجود ضمان لا يعني تلقائيًا السماح باسترجاع المبلغ أو الاستبدال. تحقق من الشروط المطبوعة مع المتجر.')}</p>
    {policy.returnEnd ? <PeriodLine date={policy.returnEnd} days={policy.returnDays} arabic={arabic} label={t('Return for a refund', 'استرجاع المبلغ')} kind="refund" /> : <p className="tip">{t('Refund deadline: unknown', 'موعد الاسترجاع: غير معروف')}</p>}
    {policy.exchangeEnd ? <PeriodLine date={policy.exchangeEnd} days={policy.exchangeDays} arabic={arabic} label={t('Exchange / replacement', 'الاستبدال')} kind="exchange" /> : <p className="tip">{t('Exchange deadline: unknown', 'موعد الاستبدال: غير معروف')}</p>}
    {policy.text ? <p className="policy-text" dir="auto">{policy.text}</p> : <p className="tip">{t('No printed policy available. Review the original or ask the store; unknown does not mean unavailable.', 'لا توجد سياسة مطبوعة مسجلة. راجع الأصل أو اسأل المتجر؛ غير معروف لا يعني غير متاح.')}</p>}
  </div>;
}

export function ResultView({ body, arabic, priceView = 'unit', ...extras }) {
  const t = translate(arabic);
  const receipt = body.receipt ?? {};
  const entries = products([{ id: 'detail', analysis: body }]);
  const phone = receipt.customerServicePhone;
  return <>
    <section className="card receipt-summary"><p className="eyebrow">{t('Purchase summary', 'ملخص الشراء')}</p><h2><bdi>{receipt.merchantName || t('Purchase details', 'بيانات الشراء')}</bdi></h2>
      <dl className="facts">
        {receipt.branchName && <><dt>{t('Branch', 'الفرع')}</dt><dd><bdi>{receipt.branchName}</bdi></dd></>}
        <dt>{t('Date', 'التاريخ')}</dt><dd>{formatDate(receipt.purchaseDate, arabic)}</dd>
        {receipt.receiptNumber && <><dt>{t('Receipt no.', 'رقم الفاتورة')}</dt><dd><bdi>{receipt.receiptNumber}</bdi></dd></>}
        <dt>{t('Total', 'الإجمالي')}</dt><dd><bdi>{formatMoney(receipt.total, receipt.currency, arabic)}</bdi></dd>
        {phone && <><dt>{t('Customer service', 'خدمة العملاء')}</dt><dd><a className="phone-link" href={`tel:${phone.replace(/[\s-]/g, '')}`}><Phone size={15} aria-hidden="true" /><bdi dir="ltr">{phone}</bdi></a></dd></>}
      </dl>
      {receipt.warrantyNotes && <p className="policy-text" dir="auto">{receipt.warrantyNotes}</p>}
      <ReturnPolicy receipt={receipt} arabic={arabic} />
    </section>
    <div className="section items-heading"><h2>{t('Items', 'المنتجات')}</h2>{entries.length > 1 && <span className="count-badge">{itemCountText(entries.length, arabic)}</span>}</div>
    {entries.length > 1 && <p className="tip items-hint">{t('Tap an item for its warranty and details.', 'اضغط على المنتج لعرض ضمانه وتفاصيله.')}</p>}
    {entries.map((entry) => <ItemDetails key={entry.index} entry={entry} currency={receipt.currency} arabic={arabic} priceView={priceView} open={entries.length === 1} extras={extras} />)}
    {(body.review?.missingFields?.length > 0 || body.review?.uncertainties?.length > 0) && <section className="card review-card"><h2><ShieldQuestion size={19} aria-hidden="true" />{t('Needs review', 'يحتاج مراجعة')}</h2>{body.review.missingFields?.length > 0 && <p className="tip">{t('Please check', 'راجع')}: {body.review.missingFields.map((field) => fieldLabel(field, arabic)).join(arabic ? '، ' : ', ')}</p>}{body.review.uncertainties?.map((u, i) => <p className="tip" key={i}><strong>{fieldLabel(u.field, arabic)}</strong>: <span dir="auto">{u.note}</span></p>)}</section>}
    {body.requestId && <details className="technical"><summary>{t('Analysis reference', 'مرجع التحليل')}</summary><p className="tip request-id"><bdi>{body.requestId}</bdi></p></details>}
  </>;
}

function productDraft(item) {
  return { description: itemName(item) || '', price: linePrice(item).total ?? '', warrantyAmount: item?.localPolicy?.warranty?.amount ?? '', warrantyUnit: item?.localPolicy?.warranty?.unit || 'months', returnAmount: item?.localPolicy?.returns?.amount ?? '', returnUnit: item?.localPolicy?.returns?.unit || 'days' };
}

export function ReceiptEditor({ body, initialIndex = 0, arabic, busy, onSave, onCancel, onGuard }) {
  const t = translate(arabic);
  const [index, setIndex] = useState(initialIndex);
  const [shared, setShared] = useState(() => ({ merchant: body?.receipt?.merchantName || '', date: body?.receipt?.purchaseDate || '' }));
  const [drafts, setDrafts] = useState(() => (body?.items?.length ? body.items : [null]).map(productDraft));
  const baseline = useRef({ shared: JSON.stringify(shared), drafts: drafts.map((draft) => JSON.stringify(draft)) });
  const form = useRef(null);
  const sharedDirty = JSON.stringify(shared) !== baseline.current.shared;
  const dirty = sharedDirty || drafts.some((draft, i) => JSON.stringify(draft) !== baseline.current.drafts[i]);
  const save = useCallback(async () => {
    if (!form.current.reportValidity()) return false;
    const changes = drafts.flatMap((draft, i) => sharedDirty || JSON.stringify(draft) !== baseline.current.drafts[i] ? [{ values: { ...shared, ...draft }, index: i }] : []);
    return changes.length ? onSave(changes) : true;
  }, [drafts, shared, sharedDirty, onSave]);
  useEffect(() => { onGuard({ dirty, save }); }, [dirty, save, onGuard]);
  useEffect(() => () => onGuard({ dirty: false, save: async () => true }), [onGuard]);
  const draft = drafts[index];
  const change = (key) => (event) => { const value = event.target.value; setDrafts((current) => current.map((entry, i) => i === index ? { ...entry, [key]: value } : entry)); };
  const duration = (prefix, title) => <div className="duration-edit"><label className="field">{title}<input name={`${prefix}-amount`} type="number" inputMode="numeric" min="0" max="3650" step="1" placeholder={t('Unspecified', 'غير محدد')} value={draft[`${prefix}Amount`]} onChange={change(`${prefix}Amount`)} /></label><label className="field">{t('Unit', 'الوحدة')}<select name={`${prefix}-unit`} value={draft[`${prefix}Unit`]} onChange={change(`${prefix}Unit`)}><option value="days">{t('Days', 'أيام')}</option><option value="weeks">{t('Weeks', 'أسابيع')}</option><option value="months">{t('Months', 'أشهر')}</option><option value="years">{t('Years', 'سنوات')}</option></select></label></div>;
  return <section className="card editor-card"><h2>{t('Edit purchase & policies', 'تعديل الشراء والمدد')}</h2>
    <form ref={form} onSubmit={(event) => { event.preventDefault(); save(); }}><fieldset disabled={busy}>
      {drafts.length > 1 && <label className="field">{t('Product', 'المنتج')}<select value={index} onChange={(event) => setIndex(Number(event.target.value))}>{drafts.map((entry, i) => <option key={i} value={i}>{entry.description || formatNumber(i + 1, arabic)}</option>)}</select></label>}
      <label className="field">{t('Product name', 'اسم المنتج')}<input name="product-name" value={draft.description} onChange={change('description')} required autoComplete="off" /></label>
      <label className="field">{t('Store', 'المتجر')}<input name="store-name" value={shared.merchant} onChange={(event) => setShared((value) => ({ ...value, merchant: event.target.value }))} autoComplete="off" /></label>
      <div className="duration-edit"><label className="field">{linePrice(body?.items?.[index]).quantity > 1 ? t('Item total', 'إجمالي المنتج') : t('Price', 'السعر')}<input name="price" type="number" inputMode="decimal" min="0" step="0.01" value={draft.price} onChange={change('price')} /></label><label className="field">{t('Purchase date', 'تاريخ الشراء')}<input name="purchase-date" type="date" value={shared.date} onChange={(event) => setShared((value) => ({ ...value, date: event.target.value }))} /></label></div>
      {duration('warranty', t('Warranty duration', 'مدة الضمان'))}{duration('return', t('Return period', 'فترة الإرجاع'))}
      <p className="tip">{t('Leave durations blank to keep receipt-stated dates. Enter 0 for no coverage. Durations start on the purchase date.', 'اترك المدد فارغة للاحتفاظ بتواريخ الفاتورة، أو أدخل ٠ لعدم وجود مدة. يبدأ الحساب من تاريخ الشراء.')}</p>
      <div className="row"><button className="btn" disabled={!dirty}>{t('Save changes', 'حفظ التعديلات')}</button><button className="secondary" type="button" onClick={onCancel}>{t('Cancel', 'إلغاء')}</button></div>
    </fieldset></form>
  </section>;
}
