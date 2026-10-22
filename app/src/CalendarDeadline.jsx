import { useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { CalendarPlus } from 'lucide-react';

const android = Capacitor.getPlatform() === 'android';
const calendar = android ? registerPlugin('PhoneCalendar') : null;

export default function CalendarDeadline({ date, days, kind, arabic }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (!android || !date || !Number.isFinite(days) || days < 0) return null;
  const t = (en, ar) => arabic ? ar : en;
  const labels = { warranty: ['Warranty deadline', 'موعد انتهاء الضمان'], refund: ['Return deadline', 'آخر موعد للاسترجاع'], exchange: ['Exchange deadline', 'آخر موعد للاستبدال'], return: ['Return deadline', 'آخر موعد للاسترجاع'] };
  const open = async () => {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      await calendar.openEvent({ date, title: `${t('Dhamantaha', 'ضمنتها')} · ${(labels[kind] ?? labels.warranty)[arabic ? 1 : 0]}` });
      setMessage(t('Calendar draft opened. Choose a device calendar and an optional reminder, then save. Repeating this can create another event; calendar copies do not update with wallet edits.', 'فُتحت مسودة في التقويم. اختر تقويم الجهاز وتذكيرًا اختياريًا ثم احفظ. التكرار قد ينشئ حدثًا آخر؛ لا تتحدث نسخة التقويم عند تعديل المحفظة.'));
    } catch (error) {
      setMessage(error?.code === 'NO_CALENDAR' ? t('No calendar app is available on this phone.', 'لا يوجد تطبيق تقويم متاح على هذا الهاتف.') : t('Could not open the calendar. Try again.', 'تعذّر فتح التقويم. حاول مجددًا.'));
    } finally { setBusy(false); }
  };
  return <div className="calendar-deadline"><button type="button" className="link" disabled={busy} onClick={open}><CalendarPlus size={17} aria-hidden="true" />{t('Add to calendar', 'إضافة إلى التقويم')}</button>{message && <p className="tip" role="status">{message}</p>}</div>;
}
