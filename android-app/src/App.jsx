import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { analyzeReceipt, ApiError, checkFileAgainstLimits, checkHealth, describeError } from './api.js';
import { loadAppearance, saveAppearance } from './appearance.js';
import { editAnalysis } from './wallet-view.js';
import WalletLayout from './WalletLayout.jsx';
import { loadSettings, saveSettings } from './settings.js';
import { PAGE_SIZE, receiptWallet } from './receipt-wallet.js';


const native = Capacitor.isNativePlatform();


export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [appearance, setAppearance] = useState(loadAppearance);
  const [editing, setEditing] = useState(false);
  const [health, setHealth] = useState({ state: 'checking' });
  const [picked, setPicked] = useState(null); // { file, name, previewUrl }
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [page, setPage] = useState('home');
  const [saved, setSaved] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState(null);
  const operation = useRef(false);
  const [outcome, setOutcome] = useState(null); // { ok: true, result } or { ok: false, error }
  const [log, setLog] = useState([]);
  const fileInput = useRef(null);
  const [, setClock] = useState(0);

  useEffect(() => {
    const refresh = () => setClock((value) => value + 1);
    const timer = setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);

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
    setPage('details');
    setEditing(false);
    window.scrollTo(0, 0);
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
      if (!/cancel/i.test(String(error?.message))) {
        note('error', `Camera: ${error?.message ?? error}`);
        setStorageError(String(error?.message ?? error));
      }
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
    setEditing(false);
    setOutcome(null);
    setConfirmDelete(false);
    setPendingAnalysis(null);
    setStorageError('');
  };

  const navigate = (target) => {
    if (operation.current) return;
    reset();
    setPage(target);
    window.scrollTo(0, 0);
  };
  const changeAppearance = (next) => {
    try { saveAppearance(next); setAppearance(next); }
    catch { setStorageError('Could not save preferences.'); }
  };
  const saveConnection = (next) => {
    try { saveSettings(next); setSettings(next); return true; }
    catch { setStorageError('Could not save connection settings.'); return false; }
  };
  const saveEdits = async (values, index) => {
    if (!begin('saving')) return;
    try {
      const body = editAnalysis(picked.record.analysis, values, index);
      const record = await receiptWallet.saveAnalysis(picked.record.id, body);
      setPicked((current) => ({ ...current, record }));
      setOutcome({ ok: true, result: { body } });
      setEditing(false);
      await refreshSaved();
    } catch (error) { setStorageError(error.message); }
    finally { finish(); }
  };
  return <WalletLayout wallet={{ appearance, settings, health, picked, busy, phase, page, saved, loadingSaved, hasMore, storageError, confirmDelete, pendingAnalysis, outcome, log, fileInput, native, editing, setEditing, connect, refreshSaved, openReceipt, takePhoto, onFile, send, openOriginal, retrySave, deleteReceipt, loadMore, navigate, changeAppearance, saveConnection, saveEdits, setConfirmDelete }} />;
}
