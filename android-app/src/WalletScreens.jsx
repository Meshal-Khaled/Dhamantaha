import { useState } from 'react';
import { products, walletSummary } from './wallet-view.js';
import AppLockSettings from './AppLockSettings.jsx';

export const translate = (arabic) => (en, ar) => arabic ? ar : en;
const amount = (value, currency) => value == null ? '—' : `${value} ${currency || 'SAR'}`;

export function Deadline({ date, days, arabic }) {
  const t = translate(arabic);
  if (days === null) return <strong>{t('Not specified', 'غير محدد')}</strong>;
  return <strong title={date}>{days < 0 ? t(`Ended ${-days} days ago`, `انتهى منذ ${-days} يوم`) : days === 0 ? t('Last day', 'اليوم الأخير') : t(`${days} days left`, `${days} يوم متبقٍ`)}</strong>;
}

function WarrantyTimer({ entry, arabic }) {
  const t = translate(arabic);
  const status = entry.warrantyDays !== null && entry.warrantyDays < 0 ? 'ended' : entry.warrantyDays !== null && entry.warrantyDays <= 30 ? 'urgent' : '';
  return <div className={`time-cell warranty-timer ${status}`}>
    <div className="warranty-heading"><span>{t('Warranty', 'الضمان')}</span><Deadline date={entry.warrantyEnd} days={entry.warrantyDays} arabic={arabic} /></div>
    <div className="warranty-track" role="progressbar" aria-label={t('Warranty remaining', 'مدة الضمان المتبقية')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={entry.warrantyProgress ?? undefined} aria-valuetext={entry.warrantyProgress === null ? t('Purchase and warranty dates needed', 'يلزم تحديد تاريخ الشراء وانتهاء الضمان') : `${entry.warrantyProgress}%`}>
      <span className="warranty-fill" style={{ width: `${entry.warrantyProgress ?? 0}%` }} />
    </div>
  </div>;
}

export function ProductCard({ entry, arabic, disabled, onOpen }) {
  const t = translate(arabic);
  return <button className="product-card" disabled={disabled} onClick={() => onOpen(entry.record.id)}>
    <div className="product-top"><span className="product-emoji" aria-hidden="true">{entry.record.mime === 'application/pdf' ? '▤' : '▧'}</span>
      <span className="product-title"><strong>{entry.item.description || entry.record.name}</strong><small>{entry.receipt.merchantName || t('Saved on this device', 'محفوظة على هذا الجهاز')} · {entry.receipt.purchaseDate || new Date(entry.record.createdAt).toLocaleDateString(arabic ? 'ar-SA-u-ca-gregory' : 'en-GB')}</small></span>
      <span className="product-price">{amount(entry.item.totalPrice, entry.receipt.currency)}</span></div>
    <div className="time-grid"><WarrantyTimer entry={entry} arabic={arabic} />
      <div className={`time-cell ${entry.returnDays !== null && entry.returnDays < 0 ? 'ended' : entry.returnDays !== null && entry.returnDays <= 30 ? 'urgent' : ''}`}><span>{t('Returns', 'الإرجاع')}</span><Deadline date={entry.returnEnd} days={entry.returnDays} arabic={arabic} /></div></div>
    <div className="refund-line"><span>{entry.record.analysis ? t('Saved receipt', 'فاتورة محفوظة') : t('Ready to analyze', 'جاهزة للتحليل')}</span><span className="refund-pill">{t('View details', 'عرض التفاصيل')} ›</span></div>
  </button>;
}

export function HomeScreen({ saved, arabic, busy, loading, hasMore, onNavigate, onOpen, onLoadMore, brand }) {
  const t = translate(arabic);
  const summary = walletSummary(saved);
  return <>
    <p className="hello">{t('Welcome back', 'أهلًا بك 👋')}</p><h1 className="title">{t('Never miss a warranty or return deadline', 'لا تفوّت موعد الضمان أو الإرجاع')}</h1>
    <section className="hero"><div className="copy"><h2>{t('All your purchases, in one place', 'كل مشترياتك تحت السيطرة')}</h2><p>{t('Keep your receipts and track upcoming deadlines.', 'احفظ فواتيرك وتابع الضمان والإرجاع الذي يقترب موعد انتهائه.')}</p><button className="btn white" disabled={busy} onClick={() => onNavigate('add')}>＋ {t('Add receipt', 'أضف فاتورة')}</button></div><img src={brand} alt="" /></section>
    <div className="stats"><div className="stat"><strong>{saved.length}{hasMore ? '+' : ''}</strong><span>{t('Receipts', 'فواتير')}</span></div><div className="stat"><strong>{summary.active}{hasMore ? '+' : ''}</strong><span>{t('Active warranties', 'ضمانات سارية')}</span></div><div className="stat"><strong>{summary.upcoming.length}{hasMore ? '+' : ''}</strong><span>{t('Upcoming deadlines', 'مواعيد قريبة')}</span></div></div>
    <div className="section"><h2>{t('Ending soon', 'تنتهي قريبًا')}</h2><button className="link" disabled={busy} onClick={() => onNavigate('saved')}>{t('All receipts', 'جميع الفواتير')} ←</button></div>
    {loading ? <p role="status">{t('Loading receipts…', 'جارٍ تحميل الفواتير…')}</p> : summary.upcoming.length ? summary.upcoming.slice(0, 6).map((entry) => <ProductCard key={`${entry.record.id}-${entry.index}`} entry={entry} arabic={arabic} disabled={busy} onOpen={onOpen} />) : <div className="notice"><span className="symbol" aria-hidden="true">✓</span><div><strong>{t('No deadlines in the next 30 days', 'لا توجد مواعيد تنتهي خلال ٣٠ يومًا')}</strong><p>{t('Add a receipt and confirm its warranty and return terms.', 'أضف فاتورة وأكّد مدد الضمان والإرجاع حسب شروط المتجر.')}</p></div></div>}
    {hasMore && <button className="secondary" disabled={busy || loading} onClick={onLoadMore}>{t('Load more receipts to include their deadlines', 'تحميل المزيد من الفواتير لعرض مواعيدها')}</button>}
    <p className="tip">{t('Your originals and saved results stay on this device and work offline.', 'الفواتير الأصلية والنتائج المحفوظة تبقى على جهازك وتعمل دون اتصال.')}</p>
  </>;
}

export function ReceiptsScreen({ saved, arabic, busy, loading, hasMore, onOpen, onLoadMore, onAdd }) {
  const t = translate(arabic);
  const [query, setQuery] = useState('');
  const entries = products(saved).filter((entry) => `${entry.item.description || ''} ${entry.record.name} ${entry.receipt.merchantName || ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <><h1 className="title">{t('Your receipts', 'فواتيرك')}</h1><p className="desc">{t('All your purchases, saved privately on this device.', 'كل مشترياتك، محفوظة بخصوصية على هذا الجهاز.')}</p>
    <label className="search"><span className="sr-only">{t('Search receipts', 'البحث في الفواتير')}</span><input type="search" placeholder={t('Search by product or store', 'ابحث باسم المنتج أو المتجر')} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    {loading ? <p role="status">{t('Loading…', 'جارٍ التحميل…')}</p> : entries.length ? entries.map((entry) => <ProductCard key={`${entry.record.id}-${entry.index}`} entry={entry} arabic={arabic} disabled={busy} onOpen={onOpen} />) : <section className="card empty"><h2>{t('No receipts found', 'لا توجد فواتير')}</h2><p>{t('Add a photo or PDF to start your wallet.', 'أضف صورة أو PDF لتبدأ محفظتك.')}</p><button className="btn" onClick={onAdd}>{t('Add receipt', 'إضافة فاتورة')}</button></section>}
    {hasMore && <button className="secondary full" disabled={busy || loading} onClick={onLoadMore}>{t('Load more', 'تحميل المزيد')}</button>}
    <p className="tip">{t('Uninstalling the app or clearing its data removes saved receipts.', 'حذف التطبيق أو مسح بياناته يزيل الفواتير المحفوظة.')}</p></>;
}

export function SettingsScreen({ settings, appearance, onAppearance, onSave, arabic, health, onRetry, log }) {
  const t = translate(arabic);
  const [draft, setDraft] = useState(settings);
  const [message, setMessage] = useState('');
  const choices = (key, options) => <div className="choice-row">{options.map(([value, label]) => <button key={value} className={`choice ${appearance[key] === value ? 'chosen' : ''}`} aria-pressed={appearance[key] === value} onClick={() => onAppearance({ ...appearance, [key]: value })}>{label}</button>)}</div>;
  return <><h1 className="title">{t('Settings', 'الإعدادات')}</h1><p className="desc">{t('Make your wallet feel like yours.', 'خصّص محفظتك بالطريقة التي تناسبك.')}</p>
    <section className="settings-section"><h2>{t('Appearance', 'المظهر')}</h2><div className="card settings-card"><strong>{t('Theme', 'وضع العرض')}</strong>{choices('theme', [['light', t('Light', 'فاتح')], ['dark', t('Dark', 'داكن')]])}<strong>{t('Text size', 'حجم الخط')}</strong>{choices('font', [['normal', t('Normal', 'عادي')], ['large', t('Large', 'كبير')]])}</div></section>
    <section className="settings-section"><h2>{t('Language', 'اللغة')}</h2><div className="card settings-card">{choices('language', [['ar', 'العربية'], ['en', 'English']])}</div></section>
    <section className="card"><AppLockSettings arabic={arabic} /><p className="tip">{t('Deadline reminders appear on Home. Scheduled phone notifications are not enabled in this version.', 'تظهر المواعيد القريبة في الرئيسية. إشعارات الهاتف المجدولة غير مفعّلة في هذه النسخة.')}</p></section>
    <details className="card connection"><summary>{t('Analysis connection', 'اتصال تحليل الفواتير')}</summary><p className="tip">{health.state === 'ok' ? t('Connected to The Ring', 'متصل بـ The Ring') : health.state === 'checking' ? t('Connecting…', 'جارٍ الاتصال…') : t('Offline. Saved receipts are still available.', 'غير متصل. الفواتير المحفوظة متاحة.')}</p><button className="link" onClick={onRetry}>{t('Check connection', 'فحص الاتصال')}</button>
      <form onSubmit={(event) => { event.preventDefault(); if (onSave({ baseUrl: draft.baseUrl.trim(), clientKey: draft.clientKey.trim() })) setMessage(t('Connection saved', 'تم حفظ الاتصال')); }}>
        <label className="field">{t('API address', 'عنوان الخدمة')}<input dir="ltr" type="url" required value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} autoCapitalize="none" autoCorrect="off" /></label>
        <label className="field">{t('Client key', 'مفتاح التطبيق')}<input dir="ltr" type="password" value={draft.clientKey} onChange={(e) => setDraft({ ...draft, clientKey: e.target.value })} autoCapitalize="none" autoCorrect="off" autoComplete="off" /></label><button className="btn full">{t('Save connection', 'حفظ الاتصال')}</button><p role="status">{message}</p></form>
      <details className="debug"><summary>{t('Request diagnostics', 'تشخيص الطلبات')}</summary><pre dir="ltr">{log.map((entry) => entry.line).join('\n') || t('No requests yet.', 'لا توجد طلبات بعد.')}</pre></details></details>
  </>;
}

export function ResultView({ body, arabic }) {
  const t = translate(arabic);
  const entries = products([{ id: 'detail', analysis: body }]);
  return <><section className="card"><h2>{body.receipt?.merchantName || t('Purchase details', 'بيانات الشراء')}</h2><dl className="facts"><dt>{t('Date', 'التاريخ')}</dt><dd>{body.receipt?.purchaseDate || '—'}</dd><dt>{t('Receipt no.', 'رقم الفاتورة')}</dt><dd>{body.receipt?.receiptNumber || '—'}</dd><dt>{t('Total', 'الإجمالي')}</dt><dd>{amount(body.receipt?.total, body.receipt?.currency)}</dd></dl></section>
    {entries.map((entry) => <section className="card" key={entry.index}><div className="product-top"><span className="product-emoji" aria-hidden="true">▤</span><div className="product-title"><strong>{entry.item.description || t('Product', 'منتج')}</strong><small>{t('Quantity', 'الكمية')}: {entry.item.quantity ?? 1}</small></div><span className="product-price">{amount(entry.item.totalPrice, body.receipt?.currency)}</span></div><div className="time-grid"><WarrantyTimer entry={entry} arabic={arabic} /><div className="time-cell"><span>{t('Returns', 'الإرجاع')}</span><Deadline date={entry.returnEnd} days={entry.returnDays} arabic={arabic} /></div></div>{entry.item.warranty?.sourceText && <p className="tip">{entry.item.warranty.sourceText}</p>}{entry.item.localPolicy && <p className="tip">{t('Policy dates use the durations you entered. Confirm the store’s terms.', 'التواريخ محسوبة حسب المدد التي أدخلتها. تحقق من شروط المتجر.')}</p>}<div className="refund-line"><span>{t('Refund', 'الاسترداد')}</span><span className="refund-pill">{t('Subject to store approval', 'حسب موافقة المتجر')}</span></div></section>)}
    {(body.review?.missingFields?.length > 0 || body.review?.uncertainties?.length > 0) && <section className="card"><h2>{t('Needs review', 'يحتاج مراجعة')}</h2>{body.review.missingFields?.length > 0 && <p className="tip">{t('Missing fields', 'حقول ناقصة')}: {body.review.missingFields.join(', ')}</p>}{body.review.uncertainties?.map((u, i) => <p className="tip" key={i}>{u.field}: {u.note}</p>)}</section>}
    {body.requestId && <p className="tip request-id">{t('Request ID', 'رقم الطلب')}: <bdi>{body.requestId}</bdi></p>}</>;
}

export function ReceiptEditor({ body, arabic, busy, onSave, onCancel }) {
  const t = translate(arabic);
  const [index, setIndex] = useState(0);
  const item = body?.items?.[index];
  // A keyed form remounts when a different product is selected.
  return <section className="card"><h2>{t('Edit purchase & policies', 'تعديل الشراء والمدد')}</h2>{body?.items?.length > 1 && <label className="field">{t('Product', 'المنتج')}<select value={index} onChange={(event) => setIndex(Number(event.target.value))}>{body.items.map((product, i) => <option key={i} value={i}>{product.description || `${i + 1}`}</option>)}</select></label>}<EditForm key={index} body={body} item={item} index={index} arabic={arabic} busy={busy} onSave={onSave} onCancel={onCancel} /></section>;
}

function EditForm({ body, item, index, arabic, busy, onSave, onCancel }) {
  const t = translate(arabic);
  const [draft, setDraft] = useState(() => ({ description: item?.description || '', merchant: body?.receipt?.merchantName || '', price: item?.totalPrice ?? '', date: body?.receipt?.purchaseDate || '', warrantyAmount: item?.localPolicy?.warranty?.amount ?? '', warrantyUnit: item?.localPolicy?.warranty?.unit || 'months', returnAmount: item?.localPolicy?.returns?.amount ?? '', returnUnit: item?.localPolicy?.returns?.unit || 'days' }));
  const change = (key) => (event) => setDraft((value) => ({ ...value, [key]: event.target.value }));
  const duration = (prefix, title) => <div className="duration-edit"><label className="field">{title}<input type="number" min="0" max="3650" step="1" placeholder={t('Unspecified', 'غير محدد')} value={draft[`${prefix}Amount`]} onChange={change(`${prefix}Amount`)} /></label><label className="field">{t('Unit', 'الوحدة')}<select value={draft[`${prefix}Unit`]} onChange={change(`${prefix}Unit`)}><option value="days">{t('Days', 'أيام')}</option><option value="weeks">{t('Weeks', 'أسابيع')}</option><option value="months">{t('Months', 'أشهر')}</option><option value="years">{t('Years', 'سنوات')}</option></select></label></div>;
  return <form onSubmit={(event) => { event.preventDefault(); onSave(draft, index); }}><fieldset disabled={busy}>
    <label className="field">{t('Product name', 'اسم المنتج')}<input value={draft.description} onChange={change('description')} required /></label><label className="field">{t('Store', 'المتجر')}<input value={draft.merchant} onChange={change('merchant')} /></label><div className="duration-edit"><label className="field">{t('Price', 'السعر')}<input type="number" min="0" step="0.01" value={draft.price} onChange={change('price')} /></label><label className="field">{t('Purchase date', 'تاريخ الشراء')}<input type="date" value={draft.date} onChange={change('date')} /></label></div>
    {duration('warranty', t('Warranty duration', 'مدة الضمان'))}{duration('return', t('Return period', 'فترة الإرجاع'))}<p className="tip">{t('Leave durations blank to keep receipt-stated warranty dates. Enter 0 for no coverage. Dates start on the purchase date. Re-analyzing replaces manual edits.', 'اترك المدد فارغة للاحتفاظ بضمان الفاتورة، أو أدخل 0 لعدم وجود مدة. يبدأ الحساب من تاريخ الشراء. إعادة التحليل تستبدل التعديلات اليدوية.')}</p><div className="row"><button className="btn">{t('Save changes', 'حفظ التعديلات')}</button><button className="secondary" type="button" onClick={onCancel}>{t('Cancel', 'إلغاء')}</button></div>
  </fieldset></form>;
}
