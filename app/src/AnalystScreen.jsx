import { useId, useMemo, useState } from 'react';
import { BarChart3, MapPin, Search } from 'lucide-react';
import { merchantGroup, searchKey, spendingAnalytics } from './spending-analytics.js';
import { formatDate, formatMoney, formatNumber } from './format.js';

const ALIASES_KEY = 'dhamantaha.merchant-aliases.v1';
function loadAliases() {
  try { return Object.fromEntries(Object.entries(JSON.parse(localStorage.getItem(ALIASES_KEY) || '{}')).filter(([key, name]) => key.length <= 200 && typeof name === 'string' && name.length <= 100).slice(0, 1000)); }
  catch { return {}; }
}

function StoreAliases({ saved, aliases, onSave, arabic }) {
  const t = (en, ar) => arabic ? ar : en;
  const [draft, setDraft] = useState({});
  const [message, setMessage] = useState('');
  const names = [...new Set(saved.map(record => record.analysis?.receipt?.merchantName).filter(name => typeof name === 'string' && name.trim()))].sort();
  const save = next => {
    try { localStorage.setItem(ALIASES_KEY, JSON.stringify(next)); onSave(next); setMessage(t('Store groups saved on this device.', 'حُفظ تجميع المتاجر على هذا الجهاز.')); }
    catch { setMessage(t('Could not save store groups. Try again.', 'تعذّر حفظ تجميع المتاجر. حاول مجددًا.')); }
  };
  return <details className="card analyst-aliases"><summary>{t('Group store names', 'توحيد أسماء المتاجر')}</summary>
    <p className="tip">{t('Known Jarir names are grouped automatically. To group other variations, enter the same group name for each. Branches and original receipt names remain unchanged.', 'تُجمع أسماء جرير المعروفة تلقائيًا. لتجميع أسماء أخرى، أدخل الاسم الموحد نفسه لكل اسم. تبقى الفروع وأسماء الفواتير الأصلية كما هي.')}</p>
    <form onSubmit={event => { event.preventDefault(); const next = { ...aliases }; for (const [key, value] of Object.entries(draft)) { if (value.trim()) next[key] = value.trim(); else delete next[key]; } save(next); }}>
      {names.map(name => { const key = searchKey(name); return <label className="field" key={name}><bdi>{name}</bdi><input maxLength={100} value={draft[key] ?? aliases[key] ?? ''} placeholder={merchantGroup(name, {}, arabic).name} onChange={event => setDraft(previous => ({ ...previous, [key]: event.target.value }))} /><small>{t('Unified store name', 'اسم المتجر الموحد')}</small></label>; })}
      {!names.length ? <p className="tip">{t('No recorded store names yet.', 'لا توجد أسماء متاجر مسجلة بعد.')}</p> : <div className="row"><button className="btn" type="submit">{t('Save groups', 'حفظ التجميع')}</button><button className="secondary" type="button" onClick={() => { setDraft({}); save({}); }}>{t('Reset groups', 'إعادة ضبط التجميع')}</button></div>}
    </form>{message && <p role="status" className="tip">{message}</p>}
  </details>;
}

function SpendingChart({ buckets, currency, arabic, yearly }) {
  const id = useId();
  const t = (en, ar) => arabic ? ar : en;
  const maximum = Math.max(1, ...buckets.map(bucket => bucket.total));
  const step = 304 / buckets.length;
  const dateFormat = new Intl.DateTimeFormat(arabic ? 'ar-SA-u-ca-gregory' : 'en-GB', { ...(yearly ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' }), timeZone: 'UTC' });
  const axisFormat = new Intl.NumberFormat(arabic ? 'ar-SA' : 'en-GB', { notation: 'compact', maximumFractionDigits: 1 });
  const label = bucket => dateFormat.format(new Date(bucket.at));
  const stride = Math.max(1, Math.ceil(buckets.length / 5));
  return <>
    <svg className="analyst-chart" viewBox="0 0 360 200" role="img" aria-labelledby={id}>
      <title id={id}>{t('Recorded purchases over time', 'المشتريات المسجلة عبر الزمن')} · {currency}</title>
      {[0, .5, 1].map(fraction => <g key={fraction}><line x1="42" x2="350" y1={160 - fraction * 120} y2={160 - fraction * 120} className="chart-grid" /><text x="37" y={164 - fraction * 120} textAnchor="end">{axisFormat.format(maximum * fraction)}</text></g>)}
      {buckets.map((bucket, index) => <g key={bucket.key}><rect x={44 + index * step} y={160 - bucket.total / maximum * 120} width={Math.max(2, step - 4)} height={bucket.total / maximum * 120} rx="3"><title>{label(bucket)}: {formatMoney(bucket.total, currency, arabic)} · {formatNumber(bucket.count, arabic)}</title></rect>{(index % stride === 0 || index === buckets.length - 1) && <text x={44 + index * step + (step - 4) / 2} y="184" textAnchor="middle">{label(bucket)}</text>}</g>)}
    </svg>
    <p className="tip">{t('Oldest → newest. Only recorded receipts; gaps do not establish that no purchases occurred.', 'من الأقدم إلى الأحدث. للفواتير المسجلة فقط؛ الفراغات لا تثبت عدم وجود مشتريات.')}</p>
    <details className="chart-data"><summary>{t('Chart data', 'بيانات الرسم')}</summary><div className="chart-table"><table><caption>{t('Recorded purchases by date', 'المشتريات المسجلة حسب التاريخ')}</caption><thead><tr><th>{t('Date', 'التاريخ')}</th><th>{t('Receipts', 'الفواتير')}</th><th>{currency}</th></tr></thead><tbody>{buckets.map(bucket => <tr key={bucket.key}><th scope="row">{label(bucket)}</th><td>{formatNumber(bucket.count, arabic)}</td><td><bdi>{formatMoney(bucket.total, currency, arabic)}</bdi></td></tr>)}</tbody></table></div></details>
  </>;
}

export default function AnalystScreen({ saved, arabic, loading, busy, onAdd, onOpen }) {
  const t = (en, ar) => arabic ? ar : en;
  const [days, setDays] = useState(365);
  const [currency, setCurrency] = useState('');
  const [store, setStore] = useState('');
  const [query, setQuery] = useState('');
  const [aliases, setAliases] = useState(loadAliases);
  const [visible, setVisible] = useState(6);
  const today = new Date();
  const dayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const data = useMemo(() => spendingAnalytics(saved, { days, currency, store, query, aliases, arabic, today: new Date(`${dayKey}T12:00:00`) }), [saved, days, currency, store, query, aliases, arabic, dayKey]);
  const excluded = Object.values(data.excluded).reduce((sum, value) => sum + value, 0);
  const top = data.groups[0];
  const reasons = { unanalyzed: t('Not analyzed', 'غير محللة'), date: t('Missing/invalid purchase date', 'تاريخ شراء مفقود أو غير صالح'), future: t('Future purchase date', 'تاريخ شراء مستقبلي'), amount: t('Missing/invalid total', 'إجمالي مفقود أو غير صالح'), currency: t('Unknown/invalid currency', 'عملة غير معروفة أو غير صالحة') };
  return <>
    <h1 className="title"><span className="heading-emoji" aria-hidden="true">📊</span>{t('Analyst', 'تحليل الإنفاق')}</h1>
    <p className="desc">{t('Your purchases, patterns and places.', 'مشترياتك، أنماط إنفاقك، ومتاجرك.')}</p>
    {loading ? <p role="status">{t('Loading receipts…', 'جارٍ تحميل الفواتير…')}</p> : <div className="analyst-dashboard">
      <div className="analyst-periods" role="group" aria-label={t('Spending period', 'فترة الإنفاق')}>{[[1, t('Daily', 'يومي')], [7, t('Weekly', 'أسبوعي')], [30, t('Monthly', 'شهري')], [365, t('Yearly', 'سنوي')]].map(([value, name]) => <button key={value} className={`choice ${days === value ? 'chosen' : ''}`} aria-pressed={days === value} onClick={() => { setDays(value); setVisible(6); }}>{name}</button>)}</div>
      <p className="tip analyst-range">{days === 1 ? t('Today', 'اليوم') : t(`Last ${days} days, including today`, `آخر ${formatNumber(days, true)} يومًا، بما فيها اليوم`)} · <bdi>{formatDate(new Date(data.start).toISOString().slice(0, 10), arabic)} — {formatDate(dayKey, arabic)}</bdi></p>
      <section className="card analyst-controls">
        <label className="search"><Search size={18} aria-hidden="true" /><input type="search" aria-label={t('Search spending', 'البحث في الإنفاق')} placeholder={t('Store, branch, product or keyword…', 'متجر، فرع، منتج أو كلمة…')} value={query} onChange={event => { setQuery(event.target.value); setVisible(6); }} /></label>
        <div className="analyst-selects"><label className="field">{t('Store', 'المتجر')}<select value={store} onChange={event => { setStore(event.target.value); setVisible(6); }}><option value="">{t('All stores', 'كل المتاجر')}</option>{data.stores.map(group => <option key={group.key} value={group.key}>{group.name}</option>)}</select></label><label className="field">{t('Currency', 'العملة')}<select value={data.currency} disabled={!data.currencies.length} onChange={event => setCurrency(event.target.value)}>{!data.currencies.length && <option value="">—</option>}{data.currencies.map(code => <option key={code}>{code}</option>)}</select></label></div>
        {data.keywords.length > 0 && <details className="analyst-keyword-picker"><summary>{t('Receipt keywords', 'كلمات من الفواتير')}</summary><div className="analyst-keywords" role="group" aria-label={t('Receipt keywords', 'كلمات من الفواتير')}>{data.keywords.map(([word, count]) => <button className="filter-chip" aria-pressed={searchKey(query) === word} key={word} onClick={() => { setQuery(searchKey(query) === word ? '' : word); setVisible(6); }}><bdi>{word}</bdi><small>{formatNumber(count, arabic)}</small></button>)}</div></details>}
        {(store || query) && <button className="link" onClick={() => { setStore(''); setQuery(''); setVisible(6); }}>{t('Clear filters', 'مسح التصفية')}</button>}
      </section>
      <section className="card analyst-overview"><p className="eyebrow">{t('Recorded spending', 'الإنفاق المسجل')}</p><p className="spending-total" aria-live="polite"><bdi>{data.rows.length ? formatMoney(data.total, data.currency, arabic) : '—'}</bdi></p><p className="tip">{formatNumber(data.rows.length, arabic)} {t('receipts included', 'فواتير محتسبة')}{data.currencies.length > 1 && ` · ${t('Currencies stay separate', 'كل عملة منفصلة')}`}</p>
        <div className="analyst-metrics"><div><span>{t('Average receipt', 'متوسط الفاتورة')}</span><strong><bdi>{formatMoney(data.average, data.currency, arabic)}</bdi></strong></div><div><span>{t('Largest receipt', 'أكبر فاتورة')}</span><strong><bdi>{formatMoney(data.largest, data.currency, arabic)}</bdi></strong></div></div>
      </section>
      {data.rows.length ? <>
        <section className="card analyst-trend"><h2><BarChart3 size={20} aria-hidden="true" />{t('Spending trend', 'تغير الإنفاق')}</h2><p className="tip">{t(days === 365 ? 'Monthly totals within this date range' : 'Daily totals within this date range', days === 365 ? 'إجماليات شهرية ضمن الفترة المحددة' : 'إجماليات يومية ضمن الفترة المحددة')}</p><SpendingChart buckets={data.buckets} currency={data.currency} arabic={arabic} yearly={days === 365} /></section>
        <section className="card analyst-stores"><h2><MapPin size={20} aria-hidden="true" />{t('Places you shop', 'أماكن تسوقك')}</h2><p className="tip">{t('Top store', 'المتجر الأعلى إنفاقًا')}: <bdi>{top.name}</bdi> · {formatNumber(data.total > 0 ? Math.round(top.total / data.total * 100) : 0, arabic)}%</p>
          {data.groups.map(group => <div className="analyst-store" key={group.key}><button className="link" onClick={() => { setStore(group.key); setVisible(6); }}><bdi>{group.name}</bdi><strong><bdi>{formatMoney(group.total, data.currency, arabic)}</bdi></strong></button><div className="store-track" aria-hidden="true"><span style={{ width: `${data.total > 0 ? group.total / data.total * 100 : 0}%` }} /></div><p className="tip">{formatNumber(group.count, arabic)} {t('receipts', 'فواتير')} · {formatNumber(group.branches.length, arabic)} {t('recorded branch names', 'أسماء فروع مسجلة')}</p><details><summary>{t('Store names and branches', 'أسماء المتجر والفروع')}</summary><ul>{group.variants.map(name => <li key={name}><bdi>{name}</bdi></li>)}</ul>{group.branches.length > 0 ? <ul>{group.branches.map(branch => <li key={branch}><MapPin size={14} aria-hidden="true" /> <bdi>{branch}</bdi></li>)}</ul> : <p className="tip">{t('Branch not recorded', 'الفرع غير مسجل')}</p>}</details></div>)}
        </section>
        <section className="card analyst-purchases"><h2>{t('Included purchases', 'المشتريات المحتسبة')}</h2>{data.rows.slice(0, visible).map(row => <button className="analyst-purchase" key={row.record.id} disabled={busy} onClick={() => onOpen(row.record.id)}><span><strong><bdi>{row.merchant.name}</bdi></strong><small>{formatDate(row.receipt.purchaseDate, arabic)}</small>{row.receipt.branchName && <small><bdi>{row.receipt.branchName}</bdi></small>}<small><bdi>{row.record.analysis.items?.map(item => item.displayName || item.description).filter(Boolean).join(arabic ? '، ' : ', ') || row.record.name}</bdi></small></span><strong><bdi>{formatMoney(row.total, row.currency, arabic)}</bdi></strong></button>)}{data.rows.length > visible && <button className="secondary full" onClick={() => setVisible(value => value + 6)}>{t('Show more', 'عرض المزيد')}</button>}</section>
      </> : <section className="card empty"><BarChart3 size={32} aria-hidden="true" /><h2>{t('No recorded spending in this period', 'لا يوجد إنفاق مسجل في هذه الفترة')}</h2><p>{t('Try a longer period or clear filters. Only valid saved receipts are included.', 'جرّب فترة أطول أو امسح التصفية. تُحتسب الفواتير المحفوظة الصالحة فقط.')}</p>{!saved.length && <button className="btn" disabled={busy} onClick={onAdd}>{t('Add receipt', 'إضافة فاتورة')}</button>}</section>}
      <StoreAliases saved={saved} aliases={aliases} onSave={next => { setAliases(next); setStore(''); }} arabic={arabic} />
      <details className="card analyst-notes"><summary>{t('How totals are calculated', 'كيف تُحسب المبالغ')}</summary><p className="tip">{t('Purchase dates, not save dates. Weekly/monthly/yearly use rolling 7/30/365 days including today. No currency conversion. These are gross recorded purchases, not net spending after refunds. Charts and store shares follow the selected filters and currency; keyword counts cover this period and store across currencies.', 'تعتمد على تاريخ الشراء لا الحفظ. الأسبوع والشهر والسنة فترات متحركة من ٧ و٣٠ و٣٦٥ يومًا تشمل اليوم. لا تحويل للعملات. هذه مشتريات مسجلة وليست صافي الإنفاق بعد الاسترجاع. تتبع الرسوم ونسب المتاجر التصفية والعملة المختارة؛ أعداد الكلمات تغطي الفترة والمتجر عبر العملات.')}</p><p className="tip">{formatNumber(data.allValidCount - data.inPeriodCount, arabic)} {t('valid receipts outside this period', 'فواتير صالحة خارج الفترة')}</p><p className="tip" role="status">{formatNumber(excluded, arabic)} {t('receipts excluded', 'فواتير مستبعدة')}</p><ul>{Object.entries(data.excluded).map(([key, count]) => <li key={key}>{reasons[key]}: {formatNumber(count, arabic)}</li>)}</ul></details>
    </div>}
  </>;
}
