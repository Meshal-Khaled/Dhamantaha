import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, DEFAULT_API_BASE, analyzeReceipt, checkFileAgainstLimits, checkHealth, explainWarranty } from '../lib/api.js';
import { editAnalysis } from '../lib/wallet-view.js';
import { receiptWallet } from '../lib/receipt-store.js';
import { useSettings } from './settings.jsx';

const WalletContext = createContext(null);

const without = (object, key) => {
  const { [key]: removed, ...rest } = object;
  return rest;
};

/**
 * The receipts saved in this browser, the connection to The Ring, and everything that changes either:
 * adding, analyzing, editing, attaching and deleting. Pages read from here and call back into it.
 */
export function WalletProvider({ children }) {
  const { clientKey, language } = useSettings();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [health, setHealth] = useState({ state: 'checking' });
  const [busy, setBusy] = useState({});
  const [failures, setFailures] = useState({});
  const [unsaved, setUnsaved] = useState({});
  const generation = useRef(0);
  const running = useRef(new Set());
  const connection = useMemo(() => ({ baseUrl: DEFAULT_API_BASE, clientKey }), [clientKey]);
  const limits = health.body?.limits;

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    try {
      const all = await receiptWallet.listAll();
      if (current === generation.current) { setRecords(all); setLoadError(null); }
    } catch (error) {
      if (current === generation.current) setLoadError(error);
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const checkConnection = useCallback(async () => {
    setHealth({ state: 'checking' });
    try {
      const { health: body } = await checkHealth(connection);
      setHealth({ state: 'ok', body });
    } catch (error) {
      setHealth({ state: 'down', error });
    }
  }, [connection]);
  useEffect(() => { checkConnection(); }, [checkConnection]);

  const putRecord = useCallback((record) => {
    setRecords((current) => current.some((row) => row.id === record.id)
      ? current.map((row) => (row.id === record.id ? record : row))
      : [record, ...current]);
  }, []);

  /** Saves a file in this browser. An identical file already saved comes back as that receipt, with `duplicate` set. */
  const add = useCallback(async (file) => {
    const { duplicate, ...record } = await receiptWallet.save(file, file.name);
    putRecord(record);
    return { record, duplicate: Boolean(duplicate) };
  }, [putRecord]);

  /** Sends the saved original to The Ring and saves what comes back. Resolves to whether it worked; the reason is in `failures`. */
  const analyze = useCallback(async (id) => {
    if (running.current.has(id)) return false;
    running.current.add(id);
    setBusy((current) => ({ ...current, [id]: 'analyzing' }));
    setFailures((current) => without(current, id));
    setUnsaved((current) => without(current, id));
    try {
      const { file } = await receiptWallet.get(id);
      const problem = checkFileAgainstLimits(file, limits);
      if (problem) throw new ApiError({ code: 'rejected_locally', message: problem });
      const { record } = await receiptWallet.analyze(id, connection, analyzeReceipt);
      putRecord(record);
      return true;
    } catch (error) {
      // The Ring answered but the result could not be saved: keep it on screen so it can be saved again.
      if (error.result) setUnsaved((current) => ({ ...current, [id]: error.result.body }));
      setFailures((current) => ({ ...current, [id]: error }));
      return false;
    } finally {
      running.current.delete(id);
      setBusy((current) => without(current, id));
    }
  }, [connection, limits, putRecord]);

  const retryUnsaved = useCallback(async (id) => {
    const body = unsaved[id];
    if (!body) return false;
    try {
      putRecord(await receiptWallet.saveAnalysis(id, body));
      setUnsaved((current) => without(current, id));
      setFailures((current) => without(current, id));
      return true;
    } catch (error) {
      setFailures((current) => ({ ...current, [id]: error }));
      return false;
    }
  }, [unsaved, putRecord]);

  /** Applies edits to one or more products. Throws a readable error when a value is not valid. */
  const edit = useCallback(async (id, changes) => {
    let body = records.find((record) => record.id === id)?.analysis;
    for (const { values, index } of changes) body = editAnalysis(body, values, index);
    putRecord(await receiptWallet.saveAnalysis(id, body));
  }, [records, putRecord]);

  const remove = useCallback(async (id) => {
    await receiptWallet.delete(id);
    setRecords((current) => current.filter((record) => record.id !== id));
    setFailures((current) => without(current, id));
    setUnsaved((current) => without(current, id));
  }, []);

  const saveAsset = useCallback(async (id, index, kind, file) => {
    putRecord(await receiptWallet.saveAsset(id, index, kind, file));
  }, [putRecord]);

  /** Sends an attached warranty document to The Ring and saves the plain-language coverage that comes back. */
  const explain = useCallback(async (id, index, asset) => {
    const record = records.find((row) => row.id === id);
    const { file } = await receiptWallet.getAsset(id, asset.id);
    const problem = checkFileAgainstLimits(file, limits);
    if (problem) throw new ApiError({ code: 'rejected_locally', message: problem });
    const item = record.analysis.items[index];
    const result = await explainWarranty({ ...connection, file, product: item.displayName || item.description, language });
    putRecord(await receiptWallet.saveExplanation(id, asset.id, result.body));
  }, [records, limits, connection, language, putRecord]);

  const clearAll = useCallback(async () => {
    await receiptWallet.clearAll();
    setRecords([]);
    setFailures({});
    setUnsaved({});
  }, []);

  const clearFailure = useCallback((id) => setFailures((current) => without(current, id)), []);

  const value = useMemo(() => ({
    records, loading, loadError, health, busy, failures, unsaved, connection, limits,
    refresh, checkConnection, add, analyze, retryUnsaved, edit, remove, saveAsset, explain, clearAll, clearFailure,
  }), [records, loading, loadError, health, busy, failures, unsaved, connection, limits,
    refresh, checkConnection, add, analyze, retryUnsaved, edit, remove, saveAsset, explain, clearAll, clearFailure]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export const useWallet = () => useContext(WalletContext);
