import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { analyzeReceipt, ApiError, checkFileAgainstLimits, checkHealth, describeError } from './api.js';
import { countdownLabel } from './countdown.js';
import { loadSettings, saveSettings } from './settings.js';

const native = Capacitor.isNativePlatform();

const formatBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const money = (value, currency) => (value == null ? '—' : `${value}${currency ? ` ${currency}` : ''}`);

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [health, setHealth] = useState({ state: 'checking' });
  const [picked, setPicked] = useState(null); // { file, name, previewUrl }
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState(null); // { ok: true, result } or { ok: false, error }
  const [log, setLog] = useState([]);
  const [showDebug, setShowDebug] = useState(false);
  const fileInput = useRef(null);

  const note = useCallback((level, message) => {
    const line = `${new Date().toLocaleTimeString()} ${message}`;
    console[level === 'error' ? 'error' : 'log'](`[Dhamantaha] ${message}`); // visible in adb logcat
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

  useEffect(() => () => picked?.previewUrl && URL.revokeObjectURL(picked.previewUrl), [picked]);

  const choose = (file, name) => {
    const problem = checkFileAgainstLimits(file, health.body?.limits);
    setOutcome(null);
    if (problem) {
      note('error', `Rejected before upload: ${problem}`);
      setPicked(null);
      setOutcome({ ok: false, error: new ApiError({ code: 'rejected_locally', message: problem }) });
      return;
    }
    const isImage = file.type.startsWith('image/');
    setPicked({ file, name, previewUrl: isImage ? URL.createObjectURL(file) : null });
    note('info', `Picked ${name} (${file.type || 'unknown type'}, ${formatBytes(file.size)})`);
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
    if (!picked || busy) return;
    setBusy(true);
    setOutcome(null);
    note('info', `POST /receipts/analyze ← ${picked.name}`);
    try {
      const result = await analyzeReceipt({ ...settings, file: picked.file, filename: picked.name });
      note('info', `200 in ${result.durationMs} ms · requestId=${result.requestId} · ${result.body.processingMethod}`);
      setOutcome({ ok: true, result });
    } catch (error) {
      const isApi = error instanceof ApiError;
      note('error', `${isApi ? `${error.status || 'no response'} ${error.code}` : 'Error'}: ${error.message}${error.requestId ? ` · requestId=${error.requestId}` : ''}`);
      setOutcome({ ok: false, error: isApi ? error : new ApiError({ code: 'unknown', message: String(error?.message ?? error) }) });
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setPicked(null);
    setOutcome(null);
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

      <StatusPill health={health} onRetry={connect} />

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

      {!picked && !outcome?.ok && (
        <section className="card">
          <h2>Add a bill</h2>
          <p className="muted">Photograph a receipt or pick a photo or PDF. It is sent to The Ring for reading and is not stored there.</p>
          <div className="row">
            {native && <button className="primary" onClick={takePhoto}>Take photo</button>}
            <button className={native ? 'secondary' : 'primary'} onClick={() => fileInput.current?.click()}>Choose photo or PDF</button>
          </div>
          <input ref={fileInput} type="file" accept="image/*,application/pdf" hidden onChange={onFile} />
        </section>
      )}

      {picked && !outcome?.ok && (
        <section className="card">
          <h2>{picked.name}</h2>
          {picked.previewUrl ? <img className="preview" src={picked.previewUrl} alt="Selected receipt" /> : <div className="pdf">PDF · {formatBytes(picked.file.size)}</div>}
          <div className="row">
            <button className="primary" disabled={busy || health.state === 'down'} onClick={send}>{busy ? 'Reading…' : 'Send to The Ring'}</button>
            <button className="secondary" disabled={busy} onClick={reset}>Cancel</button>
          </div>
          {busy && <p className="muted">Analysis can take up to a minute.</p>}
        </section>
      )}

      {outcome && !outcome.ok && (
        <section className="card error" role="alert">
          <h2>Couldn’t read this bill</h2>
          <p>{describeError(outcome.error)}</p>
          {outcome.error.requestId && <p className="muted">Request ID: {outcome.error.requestId}</p>}
        </section>
      )}

      {outcome?.ok && <ResultView body={outcome.result.body} onDone={reset} />}

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
    </section>
  );
}

function ResultView({ body, onDone }) {
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
        {items.map((item, i) => (
          <li key={i}>
            <strong>{item.description}</strong>
            <span className="muted"> ×{item.quantity ?? 1} · {money(item.totalPrice, receipt.currency)}</span>
            <div className={`warranty ${item.warranty.status}`}>
              {item.warranty.expirationDate
                ? `Warranty until ${item.warranty.expirationDate} (${item.warranty.status.replace('_', ' ')}) · ${countdownLabel(item.warranty.expirationDate)}`
                : item.warranty.statedOnReceipt ? 'Warranty stated, no end date' : 'No warranty on the receipt'}
            </div>
          </li>
        ))}
      </ul>
      {body.requestId && <p className="muted">Request ID: {body.requestId}</p>}
      {review.missingFields.length > 0 && <p className="muted">Still to fill in: {review.missingFields.join(', ')}</p>}
      {review.uncertainties.map((u, i) => <p key={i} className="muted">Check {u.field}: {u.note}</p>)}
      <button className="secondary" onClick={onDone}>Scan another</button>
    </section>
  );
}
