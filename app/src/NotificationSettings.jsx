import { Bell } from 'lucide-react';
import { formatNumber } from './format.js';

export default function NotificationSettings({ reminders, arabic }) {
  const t = (en, ar) => arabic ? ar : en;
  const { supported, preferences, status, change, retry } = reminders;
  return <section className="settings-section"><h2><Bell size={18} aria-hidden="true" /> {t('Notifications', 'الإشعارات')}</h2>
    <div className="card settings-card">
      <p>{t('Local reminders for known warranty, refund and exchange deadlines. Receipt details stay off the notification.', 'تذكيرات محلية لمواعيد الضمان والاسترجاع والاستبدال المعروفة. لا تظهر تفاصيل الفاتورة في الإشعار.')}</p>
      {supported ? <>
        <label className="lock-toggle"><span>{t('Deadline reminders', 'تذكيرات المواعيد')}</span><input type="checkbox" role="switch" checked={preferences.enabled} disabled={status.busy} onChange={event => change({ ...preferences, enabled: event.target.checked })} /></label>
        <label className="field">{t('Remind me', 'ذكّرني')}<select value={preferences.daysBefore} disabled={!preferences.enabled || status.busy} onChange={event => change({ ...preferences, daysBefore: Number(event.target.value) })}><option value={1}>{t('1 day before', 'قبل يوم واحد')}</option><option value={7}>{t('7 days before', 'قبل ٧ أيام')}</option></select></label>
        <p className="tip">{t('Around 9 AM, phone local time. Android battery restrictions, device settings or private space can delay or hide reminders. Open the app after changing the clock or time zone. Home remains available for checking deadlines.', 'حوالي التاسعة صباحًا بتوقيت الهاتف. قد تؤخر قيود البطارية أو إعدادات الجهاز أو المساحة الخاصة التذكيرات أو تخفيها. افتح التطبيق بعد تغيير الساعة أو المنطقة الزمنية. تبقى المواعيد متاحة في الرئيسية.')}</p>
        {status.busy ? <p role="status">{t('Updating reminders…', 'جارٍ تحديث التذكيرات…')}</p> : status.error ? <p role="alert">{t('Reminders could not be updated. Previously scheduled reminders may remain. Retry before relying on this setting.', 'تعذّر تحديث التذكيرات. قد تبقى التذكيرات المجدولة سابقًا. أعد المحاولة قبل الاعتماد على هذا الإعداد.')} <button className="link" onClick={retry}>{t('Retry', 'إعادة المحاولة')}</button></p> : status.permission !== 'granted' && preferences.enabled ? <p role="status">{t('Android notifications are blocked. Allow Dhamantaha notifications and its reminder channel in Android Settings, then retry.', 'إشعارات أندرويد محظورة. اسمح بإشعارات ضمنتها وقناة التذكيرات من إعدادات أندرويد ثم أعد المحاولة.')} <button className="link" onClick={() => change(preferences)}>{t('Retry permission', 'إعادة طلب الإذن')}</button></p> : <p role="status">{preferences.enabled ? t(`${formatNumber(status.scheduled)} reminder days scheduled.`, `تمت جدولة ${formatNumber(status.scheduled, true)} أيام للتذكير.`) : t('Reminders are off.', 'التذكيرات غير مفعّلة.')}</p>}
        {!preferences.enabled && status.permission && !['granted', 'not-requested'].includes(status.permission) && <p role="status">{t('Notification permission was not granted. Enable again or allow notifications in Android Settings.', 'لم يُمنح إذن الإشعارات. فعّلها مجددًا أو اسمح بها من إعدادات أندرويد.')}</p>}
        {status.truncated && preferences.enabled && <p className="tip">{t('The nearest 64 reminder days are scheduled. Open the app regularly to refresh later reminders.', 'جرت جدولة أقرب ٦٤ يومًا للتذكير. افتح التطبيق دوريًا لتحديث التذكيرات التالية.')}</p>}
      </> : <p className="tip">{t('Phone reminders are available in the installed Android app. This browser preview does not schedule notifications; upcoming deadlines remain on Home.', 'تتوفر تذكيرات الهاتف في تطبيق أندرويد المثبّت. لا تُجدول نسخة المتصفح إشعارات؛ تبقى المواعيد القريبة في الرئيسية.')}</p>}
    </div>
  </section>;
}
