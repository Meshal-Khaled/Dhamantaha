import { formatNumber } from './format.js';

export function returnWindowText(days, arabic = false) {
  if (!Number.isFinite(days)) return arabic ? 'مدة الاسترجاع غير معروفة' : 'Return period unknown';
  if (days < 0) return arabic ? 'انتهت مدة الاسترجاع' : 'Return period ended';
  if (days === 0) return arabic ? 'اليوم الأخير للاسترجاع' : 'Last day to return';
  const count = formatNumber(days, arabic);
  return arabic ? days === 1 ? 'يوم واحد للاسترجاع' : days === 2 ? 'يومان للاسترجاع' : `${count} ${days <= 10 ? 'أيام' : 'يومًا'} للاسترجاع`
    : `${count} ${days === 1 ? 'day' : 'days'} to return`;
}

export function deadlineText(days, arabic = false) {
  const t = (en, ar) => arabic ? ar : en;
  if (days === null) return t('Not specified', 'غير محدد');
  if (days < 0) return t('Expired', 'منتهي');
  if (days === 0) return t('Last day', 'اليوم الأخير');
  const count = formatNumber(days, arabic);
  return arabic ? (days === 1 ? 'يوم واحد متبقٍ' : days === 2 ? 'يومان متبقيان' : days <= 10 ? `${count} أيام متبقية` : `${count} يومًا متبقيًا`) : `${count} ${days === 1 ? 'day' : 'days'} left`;
}

export function endedPolicy(kind, arabic = false) {
  return ({ return: ['Return ended', 'انتهت مهلة الإرجاع'], refund: ['Refund ended', 'انتهت مهلة الاسترداد'], exchange: ['Exchange ended', 'انتهت مهلة الاستبدال'] }[kind] ?? ['Expired', 'منتهي'])[arabic ? 1 : 0];
}
