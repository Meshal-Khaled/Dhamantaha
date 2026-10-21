import { BarChart3 } from 'lucide-react';
import { spendingSummary } from './spending.js';
import { formatMoney, formatNumber } from './format.js';

export default function AnalystScreen({ saved, arabic, loading, busy, onAdd }) {
  const t = (en, ar) => arabic ? ar : en;
  const summary = spendingSummary(saved);
  return <>
    <h1 className="title"><span className="heading-emoji" aria-hidden="true">📊</span>{t('Analyst', 'تحليل الإنفاق')}</h1>
    <p className="desc">{t('Spending recorded in your saved receipts.', 'الإنفاق المسجل في فواتيرك المحفوظة.')}</p>
    <p className="tip">{t('Rolling periods include today, using purchase dates—not the date you saved a receipt. Currencies are shown separately; these are purchases, not net spending after refunds.', 'الفترات المتحركة تشمل اليوم وتعتمد على تاريخ الشراء، لا تاريخ حفظ الفاتورة. تظهر كل عملة منفصلة؛ هذه مبالغ المشتريات وليست صافي الإنفاق بعد الاسترجاع.')}</p>
    {loading ? <p role="status">{t('Loading receipts…', 'جارٍ تحميل الفواتير…')}</p> : <>
      {!saved.length && <section className="card empty"><BarChart3 size={32} aria-hidden="true" /><h2>{t('Your spending starts with a receipt', 'ابدأ متابعة إنفاقك بفاتورة')}</h2><p>{t('Save and review a receipt’s purchase date, total and currency to include it here.', 'احفظ فاتورة وراجع تاريخ الشراء والإجمالي والعملة لتظهر هنا.')}</p><button className="btn" disabled={busy} onClick={onAdd}>{t('Add receipt', 'إضافة فاتورة')}</button></section>}
      <div className="spending-cards">{summary.periods.map(period => <section className="card spending-card" key={period.days}>
        <h2>{period.days === 7 ? t('Past week', 'الأسبوع الماضي') : period.days === 30 ? t('Past month', 'الشهر الماضي') : t('Past year', 'السنة الماضية')}</h2>
        <p className="tip">{t(`Last ${period.days} days, including today`, `آخر ${formatNumber(period.days, true)} يومًا، بما فيها اليوم`)}</p>
        {period.currencies.length ? period.currencies.map(({ currency, total }) => <p className="spending-total" key={currency}><bdi>{formatMoney(total, currency, arabic)}</bdi></p>) : <p>{t('No recorded spending in this period', 'لا يوجد إنفاق مسجل في هذه الفترة')}</p>}
        <p className="tip">{formatNumber(period.count, arabic)} {t('receipts included', 'فواتير محتسبة')}</p>
      </section>)}</div>
      <p className="tip" role="status">{formatNumber(summary.excluded, arabic)} {t('receipts excluded: missing or invalid purchase date, total or currency, or a future purchase date. Unanalyzed receipts are excluded. Totals update when you edit or delete receipts.', 'فواتير مستبعدة: تاريخ الشراء أو الإجمالي أو العملة مفقودة أو غير صالحة، أو تاريخ الشراء في المستقبل. الفواتير غير المحللة مستبعدة. تتحدث المبالغ عند تعديل الفواتير أو حذفها.')}</p>
    </>}
  </>;
}
