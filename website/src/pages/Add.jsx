import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Camera, Check, FileImage, FileText, FileUp, KeyRound, LoaderCircle, Lock, ScanText, Upload } from 'lucide-react';
import Button from '../components/Button.jsx';
import usePageTitle from '../components/usePageTitle.js';
import { localizeError } from '../lib/format.js';
import { MAX_LOCAL_BYTES, receiptMime } from '../lib/receipt-store.js';
import { formatBytes } from '../lib/receipt-view.js';
import { useSettings } from '../state/settings.jsx';
import { useToast } from '../state/toast.jsx';
import { useWallet } from '../state/wallet.jsx';

// A phone browser opens its camera from a file input; on a computer the same input would only show a file dialog.
const touchDevice = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export default function Add() {
  const { t, arabic, clientKey } = useSettings();
  const { add, analyze, health } = useWallet();
  const toast = useToast();
  const navigate = useNavigate();
  usePageTitle('add.title');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const chooseInput = useRef(null);
  const cameraInput = useRef(null);

  useEffect(() => {
    if (!file?.type.startsWith('image/')) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (chosen) => {
    setError('');
    if (!chosen) return;
    if (!receiptMime(chosen)) { setError(localizeError('Choose a receipt photo or PDF.', arabic)); return; }
    if (!chosen.size || chosen.size > MAX_LOCAL_BYTES) { setError(localizeError('Choose a nonempty file up to 20 MB.', arabic)); return; }
    setFile(chosen);
  };
  const onInput = (event) => { const chosen = event.target.files?.[0]; event.target.value = ''; pick(chosen); };
  const reset = () => { setFile(null); setError(''); };

  const onDragOver = (event) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    setDragging(true);
  };
  const onDragLeave = (event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); };
  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer?.files?.[0]);
  };

  /** Saves the file here first. Analyzing carries on in the background after the page changes to the receipt. */
  const submit = async (analyzeAfter) => {
    setSaving(true);
    setError('');
    try {
      const { record, duplicate } = await add(file);
      toast(t(duplicate ? 'toast.receiptExists' : 'toast.receiptSaved'));
      navigate(`/receipts/${record.id}`);
      if (analyzeAfter && !record.analysis) analyze(record.id);
    } catch (failure) {
      setError(localizeError(failure, arabic));
      setSaving(false);
    }
  };

  const keyMissing = health.state === 'ok' && health.body?.clientKeyRequired && !clientKey;
  const isPdf = file?.type === 'application/pdf';

  return <div className="container page">
    <header className="page-head">
      <div>
        <h1>{t('add.title')}</h1>
        <p className="page-head__lead">{t('add.subtitle')}</p>
      </div>
    </header>

    <div className="add-grid">
      <section className="card add-main">
        {!file ? <div className={`dropzone${dragging ? ' dropzone--active' : ''}`} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
          <span className="dropzone__icon"><Upload size={34} aria-hidden="true" /></span>
          <h2>{dragging ? t('add.drop.release') : t('add.drop.title')}</h2>
          <p>{t('add.drop.hint', { mb: Math.round(MAX_LOCAL_BYTES / 1048576) })}</p>
          <div className="dropzone__actions">
            <Button size="lg" onClick={() => chooseInput.current?.click()}><FileUp size={20} aria-hidden="true" />{t('add.drop.choose')}</Button>
            {touchDevice && <Button variant="secondary" size="lg" onClick={() => cameraInput.current?.click()}><Camera size={20} aria-hidden="true" />{t('add.drop.camera')}</Button>}
          </div>
          <input ref={chooseInput} type="file" accept="image/*,application/pdf" hidden onChange={onInput} />
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onInput} />
        </div> : <div className="selected">
          <div className="selected__file">
            <div className="selected__preview">
              {preview ? <img src={preview} alt="" onError={() => setPreview(null)} /> : <span className="selected__icon">{isPdf ? <FileText size={40} aria-hidden="true" /> : <FileImage size={40} aria-hidden="true" />}</span>}
            </div>
            <div className="selected__info">
              <h2>{t('add.selected.title')}</h2>
              <p className="selected__name" dir="auto">{file.name}</p>
              <p className="muted">{formatBytes(file.size, arabic)} · {isPdf ? 'PDF' : file.type.replace('image/', '').toUpperCase() || '—'}</p>
            </div>
          </div>
          <div className="selected__actions">
            <Button size="lg" disabled={saving} onClick={() => submit(true)}>
              {saving ? <LoaderCircle size={20} className="spin" aria-hidden="true" /> : <ScanText size={20} aria-hidden="true" />}
              {saving ? t('add.saving') : t('add.selected.analyze')}
            </Button>
            <Button variant="secondary" size="lg" disabled={saving} onClick={() => submit(false)}>{t('add.selected.saveOnly')}</Button>
            <Button variant="ghost" disabled={saving} onClick={reset}>{t('add.selected.change')}</Button>
          </div>
          <p className="note"><Lock size={16} aria-hidden="true" />{t('add.selected.note')}</p>
        </div>}
        {error && <div className="alert alert--bad" role="alert"><p>{error}</p></div>}
        {keyMissing && <div className="alert alert--warn">
          <KeyRound size={18} aria-hidden="true" />
          <p>{t('detail.keyNeeded')} <Link to="/settings">{t('detail.keyLink')}</Link></p>
        </div>}
      </section>

      <aside className="card add-aside" aria-labelledby="tips-title">
        <h2 id="tips-title">{t('add.tips.title')}</h2>
        <ul className="tick-list">
          {[1, 2, 3, 4].map((n) => <li key={n}><Check size={18} aria-hidden="true" />{t(`add.tips.t${n}`)}</li>)}
        </ul>
        <p className="note"><Lock size={16} aria-hidden="true" />{t('add.private')}</p>
      </aside>
    </div>
  </div>;
}
