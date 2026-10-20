import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { analyzeReceipt, ApiError, checkFileAgainstLimits, checkHealth, describeError } from './api.js';
import { countdownLabel, daysUntil } from './countdown.js';
import { loadSettings, saveSettings } from './settings.js';
import { PAGE_SIZE, receiptWallet } from './receipt-wallet.js';
import AppLockSettings from './AppLockSettings.jsx';

const native = Capacitor.isNativePlatform();

const formatBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const money = (value, currency) => (value == null ? '—' : `${value}${currency ? ` ${currency}` : ''}`);

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [health, setHealth] = useState({ state: 'checking' });
  const [picked, setPicked] = useState(null); // { file, name, previewUrl }
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [page, setPage] = useState('add');
  const [saved, setSaved] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState(null);
  const operation = useRef(false);
  const [outcome, setOutcome] = useState(null); // { ok: true, result } or { ok: false, error }
  const [log, setLog] = useState([]);
  const [showDebug, setShowDebug] = useState(false);
  const fileInput = useRef(null);

  const note = useCallback((level, message) => {
    const line = `${new Date().toLocaleTimeString()} ${message}`;
    console[level === 'error' ? 'error' : 'log'](`[Dhamantaha] ${message}`); // Native bridge logging is disabled; the panel below keeps metadata only.
    setLog((lines) => [...lines.slice(-79), { level, line }]);
  }, []);

  const connect = useCallback(async () => {
    setHealth({ state: 'checking' });
    try {
      const { health: body, result } = await checkHealth(settings);
      setHealth({ state: 'ok', body });
      note('info', `GET /health ${result.status} in ${result.durationMs} ms · provider=${body.provider} · key required=${body.clientKeyRequired}`);
    } catch (error) {
      setHealth({ state: 'down', error });
      note('error', `GET /health failed: ${error.code ?? error.message}`);
    }
  }, [settings, note]);

  useEffect(() => {
    connect();
  }, [connect]);

  const previewUrl = picked?.previewUrl;
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const refreshSaved = useCallback(async () => {
    setLoadingSaved(true);
    try {
      const records = await receiptWallet.list();
      setSaved(records);
      setHasMore(records.length === PAGE_SIZE);
    } catch (error) {
      setStorageError(error.message);
    } finally {
      setLoadingSaved(false);
    }
  }, []);

  useEffect(() => { refreshSaved(); }, [refreshSaved]);

  const begin = (nextPhase) => {
    if (operation.current) return false;
    operation.current = true;
    setBusy(true);
    setPhase(nextPhase);
    setStorageError('');
    return true;
  };

  const finish = () => { operation.current = false; setBusy(false); setPhase(''); };

  const selectRecord = (record, file) => {
    setPicked({ record, file, name: record.name, previewUrl: record.mime.startsWith('image/') ? URL.createObjectURL(file) : null });
    setOutcome(record.analysis ? { ok: true, result: { body: record.analysis } } : null);
    setPendingAnalysis(null);
    setConfirmDelete(false);
  };

  const choose = async (file, name) => {
    if (!begin('saving')) return;
    setOutcome(null);
    try {
      const record = await receiptWallet.save(file, name);
      selectRecord(record, new File([file], record.name, { type: record.mime }));
      note('info', 'Receipt saved on this device.');
      await refreshSaved();
    } catch (error) {
      setStorageError(error.message);
    } finally {
      finish();
    }
  };

  const onFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) choose(file, file.name);
  };

  const takePhoto = async () => {
    try {
      const photo = await Camera.getPhoto({ source: CameraSource.Camera, resultType: CameraResultType.Uri, quality: 90 });
      const blob = await (await fetch(photo.webPath)).blob();
      const type = blob.type || `image/${photo.format}`;
      choose(new File([blob], `receipt.${photo.format}`, { type }), `receipt.${photo.format}`);
    } catch (error) {
      if (!/cancel/i.test(String(error?.message))) note('error', `Camera: ${error?.message ?? error}`);
    }
  };

  const send = async () => {
    if (!picked || !begin('analyzing')) return;
    setOutcome(null);
    note('info', 'POST /receipts/analyze');
    try {
      const problem = checkFileAgainstLimits(picked.file, health.body?.limits);
      if (problem) throw new ApiError({ code: 'rejected_locally', message: problem });
      const { record, result } = await receiptWallet.analyze(picked.record.id, settings, analyzeReceipt);
      note('info', `200 in ${result.durationMs} ms · requestId=${result.requestId} · ${result.body.processingMethod}`);
      setPicked((current) => ({ ...current, record }));
      setPendingAnalysis(null);
      setOutcome({ ok: true, result });
      await refreshSaved();
    } catch (error) {
      if (error.result) {
        setOutcome({ ok: true, result: error.result });
        setPendingAnalysis(error.result.body);
        setStorageError(error.message);
        return;
      }
      const isApi = error instanceof ApiError;
      note('error', `${isApi ? `${error.status || 'no response'} ${error.code}` : 'Error'}: ${error.message}${error.requestId ? ` · requestId=${error.requestId}` : ''}`);
      setOutcome({ ok: false, error: isApi ? error : new ApiError({ code: 'unknown', message: String(error?.message ?? error) }) });
    } finally {
      finish();
    }
  };

  const openReceipt = async (id) => {
    if (!begin('opening')) return;
    try {
      const { record, file } = await receiptWallet.get(id);
      selectRecord(record, file);
    } catch (error) { setStorageError(error.message); }
    finally { finish(); }
  };

  const openOriginal = async () => {
    if (!begin('opening')) return;
    try { await receiptWallet.open(picked.record.id); }
    catch (error) { setStorageError(error.message); }
    finally { finish(); }
  };

  const retrySave = async () => {
    if (!begin('saving')) return;
    try {
      const record = await receiptWallet.saveAnalysis(picked.record.id, pendingAnalysis);
      setPicked((current) => ({ ...current, record }));
      setPendingAnalysis(null);
      await refreshSaved();
    } catch (error) { setStorageError(error.message); }
    finally { finish(); }
  };

  const deleteReceipt = async () => {
    if (!begin('deleting')) return;
    try {
      await receiptWallet.delete(picked.record.id);
      reset();
      setPage('saved');
      await refreshSaved();
    } catch (error) { setStorageError(error.message); }
    finally { finish(); }
  };

  const loadMore = async () => {
    if (!begin('loading')) return;
    try {
      const records = await receiptWallet.list(saved.length);
      setSaved((current) => [...current, ...records]);
      setHasMore(records.length === PAGE_SIZE);
    } catch (error) { setStorageError(error.message); }
    finally { finish(); }
  };

  const reset = () => {
    setPicked(null);
    setOutcome(null);
    setConfirmDelete(false);
    setPendingAnalysis(null);
    setStorageError('');
  };

  return (
    <main className="app">
      <header className="top">
        <div>
          <h1>Dhamantaha</h1>
          <p className="sub">Warranty wallet</p>
        </div>
        <button className="icon" onClick={() => setShowSettings((v) => !v)} aria-label="Settings">⚙</button>
      </header>

      <nav className="wallet-nav" aria-label="Receipt wallet">
        <button disabled={busy} aria-current={page === 'add' ? 'page' : undefined} onClick={() => { reset(); setPage('add'); }}>Add receipt</button>
        <button disabled={busy} aria-current={page === 'saved' ? 'page' : undefined} onClick={() => { reset(); setPage('saved'); refreshSaved(); }}>Saved receipts</button>
      </nav>
      <StatusPill health={health} onRetry={connect} />
      {storageError && <section className="card error" role="alert"><p>{storageError}</p><button className="link" disabled={busy} onClick={refreshSaved}>Reload saved receipts</button></section>}
      {busy && phase !== 'analyzing' && <p role="status" className="muted storage-status">{phase === 'saving' ? 'Saving on this device…' : phase === 'deleting' ? 'Deleting receipt…' : 'Opening saved receipts…'}</p>}

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onSave={(next) => {
            saveSettings(next);
            setSettings(next);
            setShowSettings(false);
            note('info', `Settings saved · ${next.baseUrl} · key ${next.clientKey ? 'set' : 'empty'}`);
          }}
        />
      )}

      {page === 'add' && !picked && !outcome?.ok && (
        <section className="card">
          <h2>Add a bill</h2>
          <p className="muted">Photograph a receipt or choose a photo or PDF. The original is saved on this device. Send it to The Ring when you want it read.</p>
          <div className="row">
            {native && <button className="primary" disabled={busy} onClick={takePhoto}>Take photo</button>}
            <button className={native ? 'secondary' : 'primary'} disabled={busy} onClick={() => fileInput.current?.click()}>Choose photo or PDF</button>
          </div>
          <input ref={fileInput} type="file" accept="image/*,application/pdf" hidden onChange={onFile} />
        </section>
      )}

      {page === 'saved' && !picked && (
        <section className="card">
          <h2>Saved receipts</h2>
          <p className="muted">Available offline on this device. Uninstalling the app or clearing its data removes them.</p>
          {loadingSaved ? <p role="status">Loading receipts…</p> : saved.length === 0 ? <p className="empty">No saved receipts yet. Add a photo or PDF to get started.</p> : (
            <ul className="saved-list">
              {saved.map((record) => <li key={record.id}>
                <button className="receipt-row" disabled={busy} onClick={() => openReceipt(record.id)}>
                  <span className="file-badge">{record.mime === 'application/pdf' ? 'PDF' : 'Photo'}</span>
                  <span className="receipt-summary"><strong>{record.analysis?.receipt?.merchantName || record.name}</strong>
                    <span>{new Date(record.createdAt).toLocaleDateString()} · {formatBytes(record.size)}</span>
                    <span>{record.analysis ? 'Analysis saved' : 'Original saved · not read yet'}</span>
                  </span><span aria-hidden="true">›</span>
                </button>
              </li>)}
            </ul>
          )}
          {hasMore && <button className="secondary" disabled={busy || loadingSaved} onClick={loadMore}>Load more</button>}
        </section>
      )}

      {picked && (
        <section className="card">
          <h2>{picked.name}</h2>
          <p className="saved-label">Saved on this device · {formatBytes(picked.file.size)}</p>
          {picked.previewUrl ? <img className="preview" src={picked.previewUrl} alt="Selected receipt" /> : <div className="pdf">PDF · {formatBytes(picked.file.size)}</div>}
          <div className="row">
            <button className="secondary" disabled={busy} onClick={openOriginal}>{native ? 'Open original' : 'Download original'}</button>
            <button className="secondary" disabled={busy} onClick={reset}>Back</button>
          </div>
          <button className="primary analyze-button" disabled={busy || health.state === 'down' || !!pendingAnalysis} onClick={send}>{phase === 'analyzing' ? 'Reading…' : picked.record.analysis ? 'Read again with The Ring' : 'Read with The Ring'}</button>
          {phase === 'analyzing' && <p role="status" className="muted">Analysis can take up to 85 seconds. Your original is already saved.</p>}
          {pendingAnalysis && <button className="secondary" disabled={busy} onClick={retrySave}>Save analysis again</button>}
          {confirmDelete ? <div className="delete-confirm" role="group" aria-label="Confirm receipt deletion">
            <p>Delete this receipt, its original file, and its saved analysis from this device?</p>
            <div className="row"><button className="danger" disabled={busy} onClick={deleteReceipt}>Delete permanently</button><button className="secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep receipt</button></div>
          </div> : <button className="link delete-link" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete receipt</button>}
        </section>
      )}

      {outcome && !outcome.ok && (
        <section className="card error" role="alert">
          <h2>Couldn’t read this bill</h2>
          <p>{describeError(outcome.error)}</p>
          {outcome.error.requestId && <p className="muted">Request ID: {outcome.error.requestId}</p>}
        </section>
      )}

      {outcome?.ok && <ResultView body={outcome.result.body} disabled={busy} onDone={() => { reset(); setPage('add'); }} />}

      <footer>
        <button className="link" onClick={() => setShowDebug((v) => !v)}>{showDebug ? 'Hide' : 'Show'} debug</button>
        {showDebug && (
          <div className="debug">
            <div className="debug-meta">
              API: {settings.baseUrl} · key: {settings.clientKey ? 'set' : 'not set'} · {native ? 'native' : 'browser'}
            </div>
            <pre>{log.map((l) => l.line).join('\n') || 'Nothing yet.'}</pre>
          </div>
        )}
      </footer>
    </main>
  );
}

function StatusPill({ health, onRetry }) {
  if (health.state === 'checking') return <div className="pill wait">Connecting to The Ring…</div>;
  if (health.state === 'ok') {
    const { provider, clientKeyRequired } = health.body;
    return <div className="pill ok">Connected · analysis: {provider ?? 'not configured'}{clientKeyRequired ? ' · key required' : ''}</div>;
  }
  return (
    <div className="pill bad">
      {describeError(health.error)} <button className="link" onClick={onRetry}>Retry</button>
    </div>
  );
}

function SettingsPanel({ settings, onSave }) {
  const [draft, setDraft] = useState(settings);
  return (
    <section className="card">
      <h2>Settings</h2>
      <label>API address
        <input value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} autoCapitalize="none" autoCorrect="off" />
      </label>
      <label>Client key
        <input type="password" value={draft.clientKey} onChange={(e) => setDraft({ ...draft, clientKey: e.target.value })} autoCapitalize="none" autoCorrect="off" />
      </label>
      <button className="primary" onClick={() => onSave({ baseUrl: draft.baseUrl.trim(), clientKey: draft.clientKey.trim() })}>Save</button>
      <AppLockSettings />
    </section>
  );
}

function ResultView({ body, onDone, disabled }) {
  const { receipt, items, review } = body;
  return (
    <section className="card">
      <h2>{receipt.merchantName ?? 'Unknown merchant'}</h2>
      <dl className="facts">
        <dt>Date</dt><dd>{receipt.purchaseDate ?? '—'}</dd>
        <dt>Receipt no.</dt><dd>{receipt.receiptNumber ?? '—'}</dd>
        <dt>Total</dt><dd>{money(receipt.total, receipt.currency)}</dd>
      </dl>
      <h3>Items</h3>
      <ul className="items">
        {items.map((item, i) => {
          const days = daysUntil(item.warranty.expirationDate);
          const status = days === null ? 'unknown' : days < 0 ? 'expired' : days <= 30 ? 'expiring_soon' : 'active';
          return (
          <li key={i}>
            <strong>{item.description}</strong>
            <span className="muted"> ×{item.quantity ?? 1} · {money(item.totalPrice, receipt.currency)}</span>
            <div className={`warranty ${status}`}>
              {item.warranty.expirationDate
                ? `Warranty until ${item.warranty.expirationDate} (${status.replace('_', ' ')}) · ${countdownLabel(item.warranty.expirationDate)}`
                : item.warranty.statedOnReceipt ? 'Warranty stated, no end date' : 'No warranty on the receipt'}
            </div>
          </li>
        ); })}
      </ul>
      {body.requestId && <p className="muted">Request ID: {body.requestId}</p>}
      {review.missingFields.length > 0 && <p className="muted">Still to fill in: {review.missingFields.join(', ')}</p>}
      {review.uncertainties.map((u, i) => <p key={i} className="muted">Check {u.field}: {u.note}</p>)}
      <button className="secondary" disabled={disabled} onClick={onDone}>Scan another</button>
    </section>
  );
}
