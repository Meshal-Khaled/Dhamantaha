import { useEffect, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';

const android = Capacitor.getPlatform() === 'android';
const appLock = android ? registerPlugin('AppLock') : null;

export default function AppLockSettings({ arabic = false }) {
  const t = (en, ar) => arabic ? ar : en;
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!android) return;
    let active = true;
    appLock.status().then((result) => { if (active) setStatus(result); })
      .catch(() => { if (active) setError('Could not load app lock settings. Close Settings and try again.'); });
    return () => { active = false; };
  }, []);

  if (!android) return null;

  const toggle = async () => {
    if (!status || busy) return;
    setBusy(true);
    setError('');
    try { setStatus(await appLock.setEnabled({ enabled: !status.enabled })); }
    catch (cause) { setError(cause.message || 'Authentication could not be completed. Try again.'); }
    finally { setBusy(false); }
  };

  return <div className="app-lock-settings">
    <h3>{t('App lock', 'قفل التطبيق')}</h3>
    <p className="muted">{t('Use biometrics to open Dhamantaha, with your phone’s password, PIN, or pattern as fallback. Locks again when you leave the app.', 'استخدم البصمة أو رمز قفل الهاتف لفتح ضمنتها. يُقفل التطبيق مجددًا عند مغادرته.')}</p>
    {status ? <>
      <label className="lock-toggle">
        <span>{t('Require unlock to open app', 'طلب التحقق عند فتح التطبيق')}</span>
        <input type="checkbox" role="switch" checked={status.enabled} disabled={busy || (!status.available && !status.enabled)} onChange={toggle} />
      </label>
      {!status.available && <p className="muted">{t('Set up a screen lock in Android Settings first.', 'أعدّ قفل الشاشة في إعدادات أندرويد أولًا.')}</p>}
      {status.available && !status.biometricsAvailable && <p className="muted">{t('Biometrics are unavailable. Your phone screen lock still works.', 'البصمة غير متاحة حاليًا. يمكنك استخدام قفل شاشة الهاتف.')}</p>}
    </> : <p role="status" className="muted">{error ? t('App lock settings unavailable.', 'إعدادات القفل غير متاحة.') : t('Loading app lock…', 'جارٍ تحميل قفل التطبيق…')}</p>}
    {busy && <p role="status" className="muted">{t('Confirm using Android’s unlock prompt…', 'أكّد هويتك في نافذة أندرويد…')}</p>}
    {error && <p role="alert" className="lock-error">{error}</p>}
  </div>;
}
