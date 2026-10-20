import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { analyzeReceipt, ApiError, checkFileAgainstLimits, checkHealth } from './api.js';
import { loadAppearance, saveAppearance } from './appearance.js';
import { editAnalysis } from './wallet-view.js';
import WalletLayout from './WalletLayout.jsx';
import { loadSettings, saveSettings } from './settings.js';
import { receiptWallet } from './receipt-wallet.js';
import { useNativeChrome } from './useNativeChrome.js';

const native = Capacitor.isNativePlatform();
const cleanGuard = () => ({ dirty: false, save: async () => true });

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [appearance, setAppearance] = useState(loadAppearance);
  const [editing, setEditing] = useState(false);
  const [health, setHealth] = useState({ state: 'checking' });
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [page, setPage] = useState('home');
  const [saved, setSaved] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [storageError, setStorageError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmAnalyze, setConfirmAnalyze] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [log, setLog] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [leaveDialog, setLeaveDialog] = useState(null);
  const [toast, setToast] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [, setClock] = useState(0);
  const operation = useRef(false);
  const refreshGeneration = useRef(0);
  const formGuard = useRef(cleanGuard());
  const queuedAction = useRef(null);
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  const fileInput = useRef(null);

  useEffect(() => {
    const refresh = () => setClock((value) => value + 1);
    const timer = setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);

  useEffect(() => {
    if (phase !== 'analyzing') return;
    const started = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const note = useCallback((level, message) => {
    const line = `${new Date().toLocaleTimeString()} ${message}`;
    setLog((lines) => [...lines.slice(-79), { level, line }]);
  }, []);

  const connect = useCallback(async () => {
    setHealth({ state: 'checking' });
    try {
      const { health: body, result } = await checkHealth(settings);
      setHealth({ state: 'ok', body });
      note('info', `GET /health ${result.status} in ${result.durationMs} ms`);
    } catch (error) {
      setHealth({ state: 'down', error });
      note('error', `GET /health failed: ${error.code ?? 'network_error'}`);
    }
  }, [settings, note]);
  useEffect(() => { connect(); }, [connect]);

  const previewUrl = picked?.previewUrl;
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const refreshSaved = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    setLoadingSaved(true);
    try {
      const records = await receiptWallet.listAll();
      if (generation === refreshGeneration.current) setSaved(records);
    } catch (error) {
      if (generation === refreshGeneration.current) setStorageError(error.message);
    } finally {
      if (generation === refreshGeneration.current) setLoadingSaved(false);
    }
  }, []);
  useEffect(() => { refreshSaved(); }, [refreshSaved]);

  const onGuard = useCallback((guard) => {
    formGuard.current = guard;
    setDirty(guard.dirty);
  }, []);

  const begin = (nextPhase) => {
    if (operation.current) return false;
    operation.current = true;
    setBusy(true);
    setPhase(nextPhase);
    setStorageError('');
    return true;
  };
  const finish = () => { operation.current = false; setBusy(false); setPhase(''); };
  const clearGuard = () => { formGuard.current = cleanGuard(); setDirty(false); };

  const selectRecord = (record, file, productIndex = 0) => {
    clearGuard();
    setPage('details');
    setEditing(false);
    setPicked({ record, file, name: record.name, productIndex, previewUrl: record.mime.startsWith('image/') ? URL.createObjectURL(file) : null });
    setOutcome(record.analysis ? { ok: true, result: { body: record.analysis } } : null);
    setPendingAnalysis(null);
    setConfirmDelete(false);
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    if (page !== 'details' || !picked?.productIndex) return;
    const frame = requestAnimationFrame(() => document.getElementById(`wallet-product-${picked.productIndex}`)?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, [page, picked?.record.id, picked?.productIndex]);

  const choose = async (file, name) => {
    if (!begin('saving')) return;
    setOutcome(null);
    try {
      const { duplicate, ...record } = await receiptWallet.save(file, name);
      // A file that is already in the wallet opens its existing receipt instead of saving a copy.
      selectRecord(record, new File([file], record.name, { type: record.mime }));
      setToast(duplicate ? 'receipt_exists' : 'receipt_saved');
      await refreshSaved();
    } catch (error) { setStorageError(error.message); }
    finally { finish(); }
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
      await choose(new File([blob], `receipt.${photo.format}`, { type }), `receipt.${photo.format}`);
    } catch (error) {
      if (!/cancel/i.test(String(error?.message))) setStorageError(String(error?.message ?? error));
    }
  };

  const send = async () => {
    const current = pickedRef.current;
    if (!current || !begin('analyzing')) return;
    setConfirmAnalyze(false);
    setEditing(false);
    clearGuard();
    setOutcome(null);
    note('info', 'POST /receipts/analyze');
    try {
      const problem = checkFileAgainstLimits(current.file, health.body?.limits);
      if (problem) throw new ApiError({ code: 'rejected_locally', message: problem });
      const { record, result } = await receiptWallet.analyze(current.record.id, settings, analyzeReceipt);
      note('info', `${result.status} in ${result.durationMs} ms · requestId=${result.requestId}`);
      setPicked((value) => ({ ...value, record }));
      setPendingAnalysis(null);
      setOutcome({ ok: true, result });
      setToast('analysis_saved');
      await refreshSaved();
    } catch (error) {
      if (error.result) {
        setOutcome({ ok: true, result: error.result });
        setPendingAnalysis(error.result.body);
        setStorageError(error.message);
      } else {
        note('error', `${error.status || 'no response'} ${error.code || 'unknown'}${error.requestId ? ` · requestId=${error.requestId}` : ''}`);
        setOutcome({ ok: false, error: error instanceof ApiError ? error : new ApiError({ code: 'unknown', message: String(error?.message ?? error) }) });
      }
    } finally { finish(); }
  };

  const requestAction = (action) => {
    if (operation.current) return;
    if (pendingAnalysis || formGuard.current.dirty) {
      queuedAction.current = action;
      setLeaveDialog(pendingAnalysis ? 'analysis' : 'edits');
      return;
    }
    action();
  };

  const openReceipt = (id, productIndex = 0) => requestAction(async () => {
    if (!begin('opening')) return;
    try {
      const { record, file } = await receiptWallet.get(id);
      selectRecord(record, file, productIndex);
    } catch (error) { setStorageError(error.message); }
    finally { finish(); }
  });
  const openOriginal = async () => {
    if (!begin('opening')) return;
    try { await receiptWallet.open(pickedRef.current.record.id); }
    catch (error) { setStorageError(error.message); }
    finally { finish(); }
  };
  const retrySave = async () => {
    if (!pendingAnalysis || !begin('saving')) return false;
    try {
      const record = await receiptWallet.saveAnalysis(pickedRef.current.record.id, pendingAnalysis);
      setPicked((current) => ({ ...current, record }));
      setPendingAnalysis(null);
      setToast('analysis_saved');
      await refreshSaved();
      return true;
    } catch (error) { setStorageError(error.message); return false; }
    finally { finish(); }
  };
  const reset = () => {
    clearGuard();
    setPicked(null);
    setEditing(false);
    setOutcome(null);
    setConfirmDelete(false);
    setConfirmAnalyze(false);
    setPendingAnalysis(null);
    setStorageError('');
  };
  const navigate = (target) => {
    if (target === page) return;
    requestAction(() => { reset(); setPage(target); window.scrollTo(0, 0); });
  };
  const deleteReceipt = async () => {
    if (!begin('deleting')) return;
    try {
      await receiptWallet.delete(pickedRef.current.record.id);
      reset();
      setPage('saved');
      setToast('receipt_deleted');
      await refreshSaved();
    } catch (error) { setStorageError(error.message); }
    finally { finish(); }
  };
  const changeAppearance = (next) => {
    try { saveAppearance(next); setAppearance(next); }
    catch { setStorageError('Could not save preferences.'); }
  };
  const saveConnection = (next) => {
    try { saveSettings(next); setSettings(next); setToast('connection_saved'); return true; }
    catch { setStorageError('Could not save connection settings.'); return false; }
  };
  const saveEdits = async (changes) => {
    if (!begin('saving')) return false;
    try {
      let body = pickedRef.current.record.analysis;
      for (const { values, index } of changes) body = editAnalysis(body, values, index);
      const record = await receiptWallet.saveAnalysis(pickedRef.current.record.id, body);
      setPicked((current) => ({ ...current, record }));
      setOutcome({ ok: true, result: { body } });
      setEditing(false);
      clearGuard();
      setToast('changes_saved');
      await refreshSaved();
      return true;
    } catch (error) { setStorageError(error.message); return false; }
    finally { finish(); }
  };

  const stay = () => { queuedAction.current = null; setLeaveDialog(null); };
  const leave = async (save) => {
    const action = queuedAction.current;
    if (save) {
      const success = pendingAnalysis ? await retrySave() : await formGuard.current.save();
      if (!success) return;
    }
    queuedAction.current = null;
    setLeaveDialog(null);
    clearGuard();
    action?.();
  };
  const cancelEditing = () => requestAction(() => { clearGuard(); setEditing(false); });
  const requestAnalyze = () => requestAction(() => {
    if (pickedRef.current?.record.analysis) setConfirmAnalyze(true);
    else send();
  });
  const requestDelete = () => requestAction(() => { setEditing(false); clearGuard(); setConfirmDelete(true); });
  const handleBack = () => {
    if (busy) return;
    if (leaveDialog) { stay(); return; }
    if (confirmAnalyze) { setConfirmAnalyze(false); return; }
    if (confirmDelete) { setConfirmDelete(false); return; }
    if (editing) { cancelEditing(); return; }
    if (page === 'details') navigate('saved');
    else if (page !== 'home') navigate('home');
  };
  useNativeChrome({ theme: appearance.theme, onBack: handleBack, canGoBack: page !== 'home' || busy || !!leaveDialog || confirmAnalyze || confirmDelete });

  return <WalletLayout wallet={{ appearance, settings, health, picked, busy, phase, elapsed, page, saved, loadingSaved, storageError, confirmDelete, confirmAnalyze, pendingAnalysis, outcome, log, fileInput, native, editing, dirty, leaveDialog, toast, setEditing, connect, refreshSaved, openReceipt, takePhoto, onFile, send: requestAnalyze, confirmSend: send, openOriginal, retrySave, deleteReceipt, navigate, changeAppearance, saveConnection, saveEdits, onGuard, cancelEditing, requestDelete, setConfirmDelete, setConfirmAnalyze, stay, leave }} />;
}
