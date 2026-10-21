import { useEffect, useState } from 'react';
import { Check, CircleAlert, CircleCheck, Eye, EyeOff, HardDrive, KeyRound, LoaderCircle, Mail, Trash2 } from 'lucide-react';
import Button from '../components/Button.jsx';
import Dialog from '../components/Dialog.jsx';
import usePageTitle from '../components/usePageTitle.js';
import { SUPPORT_EMAIL } from '../i18n/catalog.js';
import { formatMoney, formatNumber, localizeError } from '../lib/format.js';
import { requestPersistence, storageStatus } from '../lib/receipt-store.js';
import { formatBytes } from '../lib/receipt-view.js';
import { useSettings } from '../state/settings.jsx';
import { useToast } from '../state/toast.jsx';
import { useWallet } from '../state/wallet.jsx';

function Segmented({ label, value, options, onChange }) {
  return <div className="segmented" role="group" aria-label={label}>
    {options.map(([option, text, lang]) => <button key={option} type="button" lang={lang} aria-pressed={value === option} onClick={() => onChange(option)}>
      {value === option && <Check size={16} aria-hidden="true" />}{text}
    </button>)}
  </div>;
}

export default function SettingsPage() {
  const { t, arabic, language, theme, priceView, clientKey, update } = useSettings();
  const { health, checkConnection, clearAll } = useWallet();
  const toast = useToast();
  usePageTitle('nav.settings');
  const [keyDraft, setKeyDraft] = useState(clientKey);
  const [showKey, setShowKey] = useState(false);
  const [storage, setStorage] = useState(null);
  const [persistNote, setPersistNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const refreshStorage = () => storageStatus().then(setStorage);
  useEffect(() => { refreshStorage(); }, []);

  const saveKey = (event) => {
    event.preventDefault();
    update({ clientKey: keyDraft.trim() });
    setKeyDraft(keyDraft.trim());
    toast(t('settings.connection.keySaved'));
  };
  const removeKey = () => {
    update({ clientKey: '' });
    setKeyDraft('');
    toast(t('settings.connection.keyRemoved'));
  };
  const askPersistence = async () => {
    setPersistNote(t((await requestPersistence()) ? 'settings.data.granted' : 'settings.data.declined'));
    refreshStorage();
  };
  const deleteEverything = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await clearAll();
      toast(t('settings.data.deleted'));
      setConfirming(false);
      refreshStorage();
    } catch (error) {
      setDeleteError(localizeError(error, arabic));
    } finally { setDeleting(false); }
  };

  const status = health.state === 'ok' ? 'ok' : health.state === 'checking' ? 'checking' : 'down';
  const exampleTotal = priceView === 'total' ? formatMoney(100, 'SAR', arabic) : `${formatNumber(2, arabic)} × ${formatMoney(50, 'SAR', arabic)}`;

  return <div className="container container--narrow page">
    <header className="page-head">
      <div>
        <h1>{t('settings.title')}</h1>
        <p className="page-head__lead">{t('settings.subtitle')}</p>
      </div>
    </header>

    <div className="stack stack--lg">
      <section className="card settings-card" aria-labelledby="appearance-title">
        <h2 id="appearance-title">{t('settings.appearance')}</h2>
        <div className="setting">
          <span className="setting__label">{t('settings.theme')}</span>
          <Segmented label={t('settings.theme')} value={theme} onChange={(value) => update({ theme: value })}
            options={[['system', t('settings.theme.system')], ['light', t('settings.theme.light')], ['dark', t('settings.theme.dark')]]} />
        </div>
        <div className="setting">
          <span className="setting__label">{t('settings.language')}</span>
          <Segmented label={t('settings.language')} value={language} onChange={(value) => update({ language: value })}
            options={[['ar', 'العربية', 'ar'], ['en', 'English', 'en']]} />
        </div>
        <div className="setting">
          <span className="setting__label">{t('settings.priceView')}</span>
          <Segmented label={t('settings.priceView')} value={priceView} onChange={(value) => update({ priceView: value })}
            options={[['unit', t('settings.priceView.unit')], ['total', t('settings.priceView.total')]]} />
          <p className="muted small">{t('settings.priceView.example')}: <bdi>{exampleTotal}</bdi></p>
        </div>
      </section>

      <section className="card settings-card" aria-labelledby="connection-title">
        <h2 id="connection-title">{t('settings.connection')}</h2>
        <p className={`status-line status-line--${status}`} role="status">
          {status === 'ok' ? <CircleCheck size={18} aria-hidden="true" /> : status === 'checking' ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : <CircleAlert size={18} aria-hidden="true" />}
          {t(`settings.connection.${status}`)}
        </p>
        {status === 'ok' && <p className="muted small">{health.body.clientKeyRequired ? t('settings.connection.keyRequired') : t('settings.connection.keyNotRequired')}</p>}
        <form className="form" onSubmit={saveKey}>
          <div className="field">
            <label htmlFor="client-key">{t('settings.connection.key')}</label>
            <span className="input-group">
              <input className="input" id="client-key" name="client-key" type={showKey ? 'text' : 'password'} value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)}
                dir="ltr" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-describedby="client-key-help" />
              <button type="button" className="icon-button" onClick={() => setShowKey(!showKey)} aria-label={showKey ? t('common.hide') : t('common.show')}>
                {showKey ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </span>
            <small id="client-key-help" className="muted">{t('settings.connection.keyHelp')}</small>
          </div>
          <div className="form__actions">
            <Button type="submit" disabled={keyDraft.trim() === clientKey}><KeyRound size={18} aria-hidden="true" />{t('settings.connection.save')}</Button>
            {clientKey && <Button variant="secondary" onClick={removeKey}>{t('settings.connection.remove')}</Button>}
            <Button variant="ghost" onClick={checkConnection}>{t('settings.connection.check')}</Button>
          </div>
        </form>
      </section>

      <section className="card settings-card" aria-labelledby="data-title">
        <h2 id="data-title">{t('settings.data')}</h2>
        {storage?.usage !== null && storage?.usage !== undefined && <p className="status-line"><HardDrive size={18} aria-hidden="true" />{t('settings.data.usage', { used: formatBytes(storage.usage, arabic) })}</p>}
        {storage?.persisted === true && <p className="muted">{t('settings.data.persisted')}</p>}
        {storage?.persisted === false && <>
          <p className="muted">{t('settings.data.notPersisted')}</p>
          <div><Button variant="secondary" size="sm" onClick={askPersistence}>{t('settings.data.ask')}</Button></div>
        </>}
        {persistNote && <p role="status">{persistNote}</p>}
        <p className="muted small">{t('settings.data.note')}</p>
        <div><Button variant="dangerGhost" onClick={() => { setDeleteError(''); setConfirming(true); }}><Trash2 size={18} aria-hidden="true" />{t('settings.data.deleteAll')}</Button></div>
      </section>

      <section className="card settings-card" aria-labelledby="contact-title">
        <h2 id="contact-title">{t('settings.contact')}</h2>
        <p className="muted">{t('settings.contact.body')}</p>
        <div><Button variant="secondary" href={`mailto:${SUPPORT_EMAIL}?subject=Dhamantaha`}><Mail size={18} aria-hidden="true" /><bdi dir="ltr">{SUPPORT_EMAIL}</bdi></Button></div>
      </section>
    </div>

    <Dialog open={confirming} onClose={() => setConfirming(false)} title={t('settings.data.deleteTitle')} busy={deleting}
      actions={<>
        <Button variant="secondary" disabled={deleting} onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
        <Button variant="danger" disabled={deleting} onClick={deleteEverything}>{t('settings.data.deleteConfirm')}</Button>
      </>}>
      <p>{t('settings.data.deleteBody')}</p>
      {deleteError && <div className="alert alert--bad" role="alert"><p>{deleteError}</p></div>}
    </Dialog>
  </div>;
}
