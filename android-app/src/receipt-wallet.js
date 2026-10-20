import { Capacitor, registerPlugin } from '@capacitor/core';

export const PAGE_SIZE = 50;
export const MAX_LOCAL_BYTES = 20 * 1024 * 1024;
const supported = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif|avif|gif|bmp))$/;

export function receiptMime(file, name = file.name ?? '') {
  if (supported.test(file.type)) return file.type;
  const extension = name.split('.').pop().toLowerCase();
  const types = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', avif: 'image/avif', gif: 'image/gif', bmp: 'image/bmp' };
  return !file.type || file.type === 'application/octet-stream' ? types[extension] ?? '' : '';
}

function asBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Could not read this file. Choose it again.'));
    reader.readAsDataURL(blob);
  });
}

/** Kept injectable so tests can exercise the workflow without a phone or network. */
export function createReceiptWallet(driver) {
  return {
    list: (offset = 0) => driver.list(offset, PAGE_SIZE),
    async save(file, name = file.name ?? 'Receipt') {
      const mime = receiptMime(file, name);
      if (!mime) throw new Error('Choose a receipt photo or PDF.');
      if (!file.size || file.size > MAX_LOCAL_BYTES) throw new Error('Choose a nonempty file up to 20 MB.');
      return driver.save(file, name, mime);
    },
    get: (id) => driver.get(id),
    async analyze(id, settings, analyzeReceipt) {
      // Always reload the saved original. A failed call leaves the receipt and any previous result intact.
      const { record, file } = await driver.get(id);
      const result = await analyzeReceipt({ ...settings, file, filename: record.name });
      try {
        const updated = await driver.updateAnalysis(id, result.body);
        return { record: updated, result };
      } catch {
        const error = new Error('The receipt is saved, but its analysis could not be saved. Free some space and try again.');
        error.result = result; // Keep the successful response visible even if the disk is full.
        throw error;
      }
    },
    delete: (id) => driver.delete(id),
    open: (id) => driver.open(id),
    saveAnalysis: (id, analysis) => driver.updateAnalysis(id, analysis),
  };
}

const native = Capacitor.getPlatform() === 'android';
const plugin = native ? registerPlugin('ReceiptWallet') : null;

const nativeDriver = {
  async list(offset, limit) { return (await plugin.list({ offset, limit })).receipts; },
  async save(file, name, mime) { return plugin.save({ name, mime, data: await asBase64(file) }); },
  async get(id) {
    const { uri, ...record } = await plugin.get({ id });
    const response = await fetch(Capacitor.convertFileSrc(uri));
    if (!response.ok) throw new Error('Could not open the saved receipt.');
    return { record, file: new File([await response.blob()], record.name, { type: record.mime }) };
  },
  updateAnalysis: (id, analysis) => plugin.updateAnalysis({ id, analysis }),
  delete: (id) => plugin.delete({ id }),
  open: (id) => plugin.open({ id }),
};

let database;
function browserDatabase() {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open('dhamantaha-receipts', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('receipts', { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
        request.result.createObjectStore('files');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Could not open receipt storage in this browser.'));
      request.onblocked = () => reject(new Error('Close other Dhamantaha tabs and try again.'));
    }).catch((error) => { database = null; throw error; });
  }
  return database;
}

async function transaction(mode, operation) {
  const db = await browserDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['receipts', 'files'], mode);
    let value;
    tx.oncomplete = () => resolve(value);
    tx.onabort = () => reject(new Error('Could not access device storage. Free some space and try again.'));
    operation(tx.objectStore('receipts'), tx.objectStore('files'), (result) => { value = result; }, tx);
  });
}

const browserDriver = {
  list(offset, limit) {
    return transaction('readonly', (receipts, files, done) => {
      const rows = [];
      let skip = offset;
      receipts.index('createdAt').openCursor(null, 'prev').onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor || rows.length === limit) return done(rows);
        if (skip) { cursor.advance(skip); skip = 0; return; }
        rows.push(cursor.value);
        cursor.continue();
      };
    });
  },
  async save(file, name, mime) {
    const now = Date.now();
    const record = { id: crypto.randomUUID(), name, mime, size: file.size, createdAt: now, updatedAt: now, analysis: null };
    await transaction('readwrite', (receipts, files) => { receipts.add(record); files.add(file, record.id); });
    // Browsers may decline persistence. Android uses SQLite instead of browser storage.
    navigator.storage?.persist?.().catch(() => {});
    return record;
  },
  async get(id) {
    const result = await transaction('readonly', (receipts, files, done) => {
      const record = receipts.get(id);
      const file = files.get(id);
      file.onsuccess = () => done({ record: record.result, file: file.result });
    });
    if (!result.record || !result.file) throw new Error('This receipt no longer exists.');
    return result;
  },
  updateAnalysis(id, analysis) {
    return transaction('readwrite', (receipts, files, done, tx) => {
      const request = receipts.get(id);
      request.onsuccess = () => {
        if (!request.result) return tx.abort();
        const record = { ...request.result, analysis, updatedAt: Date.now() };
        receipts.put(record);
        done(record);
      };
    });
  },
  delete(id) { return transaction('readwrite', (receipts, files) => { receipts.delete(id); files.delete(id); }); },
  async open(id) {
    const { record, file } = await browserDriver.get(id);
    const url = URL.createObjectURL(new Blob([file], { type: record.mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = record.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
};

export const receiptWallet = createReceiptWallet(native ? nativeDriver : browserDriver);
