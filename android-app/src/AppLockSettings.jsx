import { useEffect, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';

const android = Capacitor.getPlatform() === 'android';
const appLock = android ? registerPlugin('AppLock') : null;

export default function AppLockSettings() {
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
    <h3>App lock</h3>
    <p className="muted">Use biometrics to open Dhamantaha, with your phone’s password, PIN, or pattern as fallback. Locks again when you leave the app.</p>
    {status ? <>
      <label className="lock-toggle">
        <span>Require unlock to open app</span>
        <input type="checkbox" role="switch" checked={status.enabled} disabled={busy || (!status.available && !status.enabled)} onChange={toggle} />
      </label>
      {!status.available && <p className="muted">Set up a screen-lock password, PIN, or pattern in Android Settings first.</p>}
      {status.available && !status.biometricsAvailable && <p className="muted">Biometrics aren’t set up or available right now. Your phone screen lock can still unlock the app.</p>}
    </> : <p role="status" className="muted">{error ? 'App lock settings unavailable.' : 'Loading app lock…'}</p>}
    {busy && <p role="status" className="muted">Confirm using Android’s unlock prompt…</p>}
    {error && <p role="alert" className="lock-error">{error}</p>}
  </div>;
}
