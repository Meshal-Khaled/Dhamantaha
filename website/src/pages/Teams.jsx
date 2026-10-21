import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Camera, Check, CircleAlert, CircleCheck, FileImage, FileText, FileUp, LoaderCircle, Lock, Send, Upload, X } from 'lucide-react';
import Button from '../components/Button.jsx';
import useNoIndex from '../components/useNoIndex.js';
import usePageTitle from '../components/usePageTitle.js';
import { formatNumber } from '../lib/format.js';
import { formatBytes } from '../lib/receipt-view.js';
import { FIELD_ORDER, REQUESTS_LIVE, TEAM_LIMITS, addFiles, reportQrVisit, sendRequest, validateRequest } from '../lib/team-request.js';
import { useSettings } from '../state/settings.jsx';
import { useWallet } from '../state/wallet.jsx';

// A phone browser opens its camera from a file input; on a computer the same input would only show a file dialog.
const touchDevice = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const megabytes = Math.round(TEAM_LIMITS.bytes / 1048576);
const empty = { team: '', name: '', contact: '', note: '', consent: false };

function FileRow({ file, onRemove }) {
  const { t, arabic } = useSettings();
  const [thumb, setThumb] = useState(null);
  useEffect(() => {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    setThumb(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  return <li className="file-row">
    <span className="file-row__thumb" aria-hidden="true">
      {thumb ? <img src={thumb} alt="" decoding="async" onError={() => setThumb(null)} /> : pdf ? <FileText size={22} /> : <FileImage size={22} />}
    </span>
    <span className="file-row__main">
      <strong dir="auto">{file.name}</strong>
      <small>{formatBytes(file.size, arabic)}</small>
    </span>
    <button type="button" className="icon-button" onClick={onRemove} aria-label={t('teams.files.remove', { name: file.name })}><X size={20} aria-hidden="true" /></button>
  </li>;
}

/** Wraps a field with its label, optional help text and error, wired together for screen readers. */
function Field({ id, label, help, error, children }) {
  return <div className="field">
    <label htmlFor={id}>{label}</label>
    {children}
    {help && !error && <small className="muted" id={`${id}-help`}>{help}</small>}
    {error && <small className="field__error" id={`${id}-error`} role="alert"><CircleAlert size={14} aria-hidden="true" />{error}</small>}
  </div>;
}

export default function Teams() {
  const { t, arabic } = useSettings();
  usePageTitle('teams.tab');
  const { refresh } = useWallet();
  useEffect(() => { reportQrVisit().catch(() => {}); }, []);
  useNoIndex();
  const [form, setForm] = useState(empty);
  const [files, setFiles] = useState([]);
  const [rejected, setRejected] = useState([]);
  const [errors, setErrors] = useState({});
  const [phase, setPhase] = useState('form');
  const [sendFailed, setSendFailed] = useState(false);
  const [done, setDone] = useState(null);
  const [progress, setProgress] = useState('');
  const [dragging, setDragging] = useState(false);
  const chooseInput = useRef(null);
  const cameraInput = useRef(null);

  const change = (key) => (event) => {
    const value = key === 'consent' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => { const { [key]: removed, ...rest } = current; return rest; });
  };

  const take = (incoming) => {
    const result = addFiles(files, Array.from(incoming ?? []));
    setFiles(result.files);
    setRejected(result.rejected);
    if (result.files.length > files.length) setErrors((current) => { const { files: removed, ...rest } = current; return rest; });
  };
  const onInput = (event) => { const chosen = event.target.files; take(chosen); event.target.value = ''; };
  const removeFile = (index) => { setFiles((current) => current.filter((_, i) => i !== index)); setRejected([]); };

  const onDragOver = (event) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    setDragging(true);
  };
  const onDragLeave = (event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); };
  const onDrop = (event) => { event.preventDefault(); setDragging(false); take(event.dataTransfer?.files); };

  const submit = async (event) => {
    event.preventDefault();
    const found = validateRequest(form, files);
    setErrors(found);
    const first = FIELD_ORDER.find((key) => found[key]);
    if (first) {
      requestAnimationFrame(() => document.getElementById(`teams-${first}`)?.focus());
      return;
    }
    setPhase('sending');
    setSendFailed(false);
    try {
      const result = await sendRequest(form, files, { onProgress: (current, total, waiting) => setProgress(`${current} / ${total}${waiting ? arabic ? ` · انتظار ${waiting} ثانية` : ` · Waiting ${waiting}s` : ''}`) });
      setDone({ preview: Boolean(result.preview), team: form.team.trim(), name: form.name.trim(), count: files.length, results: result.results });
      await refresh();
      setPhase('sent');
      window.scrollTo(0, 0);
    } catch {
      setSendFailed(true);
      setPhase('form');
    }
  };

  const again = () => { setForm(empty); setFiles([]); setRejected([]); setErrors({}); setDone(null); setPhase('form'); window.scrollTo(0, 0); };
  const sending = phase === 'sending';
  const message = (field) => errors[field] && t(`teams.error.${field}.${errors[field]}`, { max: field === 'note' ? TEAM_LIMITS.note : TEAM_LIMITS.text });
  const count = Object.keys(errors).length;

  return <>
    {!REQUESTS_LIVE && <p className="preview-ribbon" role="note">{t('teams.preview')}</p>}
    <div className={`container container--event teams-layout${phase === 'sent' ? ' teams-layout--sent' : ''}`}>
      {phase !== 'sent' && <section className="teams-hero" aria-labelledby="teams-title">
        <p className="eyebrow"><Send size={16} aria-hidden="true" />{t('teams.eyebrow')}</p>
        <h1 id="teams-title">{t('teams.title')}</h1>
        <p className="teams-hero__lead">{t('teams.lead')}</p>
        <ol className="teams-steps" aria-label={t('teams.steps')}>
          {[1, 2, 3].map((n) => <li key={n}><span aria-hidden="true">{formatNumber(n, arabic)}</span>{t(`teams.step${n}`)}</li>)}
        </ol>
      </section>}

      {phase === 'sent' ? <section className="card teams-sent" aria-live="polite">
        <span className="teams-sent__icon"><CircleCheck size={44} aria-hidden="true" /></span>
        <h2>{t('teams.done.title')}</h2>
        <p>{t('teams.done.body', { team: done.team })}</p>
        <dl className="summary-list">
          <div><dt>{t('teams.done.team')}</dt><dd dir="auto">{done.team}</dd></div>
          <div><dt>{t('teams.done.name')}</dt><dd dir="auto">{done.name}</dd></div>
          <div><dt>{t('teams.done.receipts')}</dt><dd>{formatNumber(done.count, arabic)}</dd></div>
        </dl>
        {done.preview && <p className="alert alert--warn"><CircleAlert size={18} aria-hidden="true" />{t('teams.done.preview')}</p>}
        <ul className="summary-list">{done.results?.map((result, index) => <li key={index}>
          <strong dir="auto">{result.analysis?.receipt?.merchantName || result.name}</strong>
          <p dir="auto">{result.error || (result.analysis?.items ?? []).map(item => item.displayName || item.description).join(' · ')}</p>
          {result.id && <Link to={`/receipts/${result.id}`}>{arabic ? 'عرض الفاتورة المحفوظة' : 'Open saved receipt'}</Link>}
        </li>)}</ul>
        <Button variant="secondary" size="lg" block onClick={again}>{t('teams.done.again')}</Button>
      </section> : <form className="card teams-card" onSubmit={submit} noValidate>
        {sending && <p role="status">{t('teams.sending')} {progress}</p>}
        <fieldset disabled={sending} className="teams-card__fields">
          <section className="teams-section" aria-labelledby="teams-about">
            <h2 id="teams-about" className="teams-section__head"><span className="teams-section__num" aria-hidden="true">{formatNumber(1, arabic)}</span>{t('teams.about.title')}</h2>
            <Field id="teams-team" label={t('teams.team')} error={message('team')}>
              <input className="input" id="teams-team" name="team" value={form.team} onChange={change('team')} placeholder={t('teams.team.placeholder')} autoComplete="organization" enterKeyHint="next"
                aria-invalid={Boolean(errors.team)} aria-describedby={errors.team ? 'teams-team-error' : undefined} dir="auto" />
            </Field>
            <Field id="teams-name" label={t('teams.name')} error={message('name')}>
              <input className="input" id="teams-name" name="name" value={form.name} onChange={change('name')} placeholder={t('teams.name.placeholder')} autoComplete="name" enterKeyHint="next"
                aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'teams-name-error' : undefined} dir="auto" />
            </Field>
            <Field id="teams-contact" label={t('teams.contact')} help={t('teams.contact.help')} error={message('contact')}>
              <input className="input" id="teams-contact" name="contact" value={form.contact} onChange={change('contact')} placeholder={t('teams.contact.placeholder')} inputMode="email" autoComplete="email" enterKeyHint="next"
                autoCapitalize="none" spellCheck={false} dir="ltr" aria-invalid={Boolean(errors.contact)} aria-describedby={errors.contact ? 'teams-contact-error' : 'teams-contact-help'} />
            </Field>
          </section>

          <section className="teams-section" aria-labelledby="teams-receipts">
            <h2 id="teams-receipts" className="teams-section__head"><span className="teams-section__num" aria-hidden="true">{formatNumber(2, arabic)}</span>{t('teams.receipts.title')}</h2>
            <div className={`teams-drop${dragging ? ' teams-drop--active' : ''}${errors.files ? ' teams-drop--error' : ''}`} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
              <span className="teams-drop__icon"><Upload size={26} aria-hidden="true" /></span>
              <strong>{dragging ? t('teams.drop.release') : t('teams.drop.title')}</strong>
              <small className="muted">{t('teams.receipts.hint', { files: formatNumber(TEAM_LIMITS.files, arabic), mb: formatNumber(megabytes, arabic) })}</small>
              <div className="teams-drop__actions">
                <Button id="teams-files" onClick={() => chooseInput.current?.click()} aria-describedby={errors.files ? 'teams-files-error' : undefined}><FileUp size={18} aria-hidden="true" />{t('teams.drop.choose')}</Button>
                {touchDevice && <Button variant="secondary" onClick={() => cameraInput.current?.click()}><Camera size={18} aria-hidden="true" />{t('teams.drop.camera')}</Button>}
              </div>
              <input ref={chooseInput} type="file" accept="image/*,application/pdf" multiple hidden onChange={onInput} />
              <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onInput} />
            </div>
            {errors.files && <small className="field__error" id="teams-files-error" role="alert"><CircleAlert size={14} aria-hidden="true" />{t('teams.error.files.none')}</small>}
            {rejected.length > 0 && <div className="alert alert--warn" role="alert">
              <CircleAlert size={18} aria-hidden="true" />
              <ul>{rejected.map((entry, i) => <li key={i}><bdi dir="auto">{entry.name}</bdi> {t(`teams.reject.${entry.reason}`, { mb: formatNumber(megabytes, arabic), files: formatNumber(TEAM_LIMITS.files, arabic) })}</li>)}</ul>
            </div>}
            {files.length > 0 && <>
              <p className="muted small" role="status">{t('teams.files.count', { n: formatNumber(files.length, arabic), max: formatNumber(TEAM_LIMITS.files, arabic) })}</p>
              <ul className="file-list">{files.map((file, index) => <FileRow key={`${file.name}-${file.size}-${file.lastModified}`} file={file} onRemove={() => removeFile(index)} />)}</ul>
            </>}
          </section>

          <section className="teams-section" aria-labelledby="teams-send">
            <h2 id="teams-send" className="teams-section__head"><span className="teams-section__num" aria-hidden="true">{formatNumber(3, arabic)}</span>{t('teams.send.title')}</h2>
            <Field id="teams-note" label={t('teams.note')} error={message('note')}>
              <textarea className="input" id="teams-note" name="note" rows={3} value={form.note} onChange={change('note')} placeholder={t('teams.note.placeholder')} dir="auto"
                aria-invalid={Boolean(errors.note)} aria-describedby={errors.note ? 'teams-note-error' : undefined} />
            </Field>
            <div className={`consent${errors.consent ? ' consent--error' : ''}`}>
              <input type="checkbox" id="teams-consent" name="consent" checked={form.consent} onChange={change('consent')} aria-invalid={Boolean(errors.consent)} aria-describedby={errors.consent ? 'teams-consent-error' : undefined} />
              <label htmlFor="teams-consent"><Lock size={15} aria-hidden="true" />{t('teams.consent')}</label>
            </div>
            {errors.consent && <small className="field__error" id="teams-consent-error" role="alert"><CircleAlert size={14} aria-hidden="true" />{t('teams.error.consent.required')}</small>}
          </section>
        </fieldset>

        {count > 0 && <p className="alert alert--bad" role="alert"><CircleAlert size={18} aria-hidden="true" />{t('teams.errors.summary')}</p>}
        {sendFailed && <p className="alert alert--bad" role="alert"><CircleAlert size={18} aria-hidden="true" />{t('teams.error.send')}</p>}
        <Button type="submit" size="lg" block disabled={sending}>
          {sending ? <LoaderCircle size={20} className="spin" aria-hidden="true" /> : <Check size={20} aria-hidden="true" />}
          {sending ? t('teams.sending') : t('teams.send')}
        </Button>
      </form>}
    </div>
  </>;
}
