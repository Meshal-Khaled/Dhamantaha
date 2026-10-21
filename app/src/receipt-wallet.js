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
    async listAll() {
      // Only metadata/analysis is read. Originals remain private files and are not loaded for search.
      const records = new Map();
      let offset = 0;
      while (true) {
        const page = await driver.list(offset, PAGE_SIZE);
        for (const record of page) records.set(record.id, record);
        if (page.length < PAGE_SIZE) return [...records.values()];
        offset += page.length;
      }
    },
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
      // Photos and terms belong to an item, even if a new reading changes line order.
      if (record.assets?.length) {
        const oldItems = record.analysis?.items ?? [];
        const key = (item) => item.productIdentifier || item.description;
        const reordered = oldItems.map((item) => result.body.items.filter((next) => key(next) && key(next) === key(item)));
        if (oldItems.length !== result.body.items.length || reordered.some((matches) => matches.length !== 1) || new Set(reordered.map(([item]) => item)).size !== oldItems.length) {
          throw new Error('The new reading could not match your item photos and terms. Your previous details are still saved.');
        }
        result.body = { ...result.body, items: reordered.map(([item]) => item) };
      }
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
    async saveAsset(id, index, kind, file) {
      const mime = receiptMime(file);
      if (!['photo', 'terms'].includes(kind) || !/^image\/(jpeg|png|webp)$/.test(mime) && !(kind === 'terms' && mime === 'application/pdf')) throw new Error('Choose a JPG, PNG, WebP photo or a PDF of the terms.');
      if (!file.size || file.size > MAX_LOCAL_BYTES) throw new Error('Choose a nonempty file up to 20 MB.');
      return driver.saveAsset(id, index, kind, file, mime);
    },
    getAsset: (id, assetId) => driver.getAsset(id, assetId),
    openAsset: (id, assetId) => driver.openAsset(id, assetId),
    saveExplanation: (id, assetId, explanation) => driver.saveExplanation(id, assetId, explanation),
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
  async saveAsset(id, index, kind, file, mime) { return plugin.saveAsset({ id, index, kind, name: file.name, mime, data: await asBase64(file) }); },
  async getAsset(id, assetId) {
    const asset = await plugin.getAsset({ id, assetId });
    const response = await fetch(Capacitor.convertFileSrc(asset.uri));
    if (!response.ok) throw new Error('Could not open the saved attachment.');
    return { asset, file: new File([await response.blob()], asset.name, { type: asset.mime }) };
  },
  saveExplanation: (id, assetId, explanation) => plugin.saveExplanation({ id, assetId, explanation }),
  openAsset: (id, assetId) => plugin.openAsset({ id, assetId }),
};

async function contentHash(blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

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
    // Same rule as the Android store: identical bytes return the receipt already saved.
    const sha256 = await contentHash(file);
    const record = { id: crypto.randomUUID(), name, mime, size: file.size, createdAt: now, updatedAt: now, analysis: null, sha256 };
    const saved = await transaction('readwrite', (receipts, files, done) => {
      const all = receipts.getAll();
      all.onsuccess = () => {
        const existing = all.result.filter((row) => row.sha256 === sha256).sort((a, b) => a.createdAt - b.createdAt)[0];
        if (existing) return done({ ...existing, duplicate: true });
        receipts.add(record);
        files.add(file, record.id);
        done(record);
      };
    });
    // Browsers may decline persistence. Android uses SQLite instead of browser storage.
    navigator.storage?.persist?.().catch(() => {});
    return saved;
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
  delete(id) { return transaction('readwrite', (receipts, files) => {
    const request = receipts.get(id);
    request.onsuccess = () => { for (const asset of request.result?.assets ?? []) files.delete(asset.id); receipts.delete(id); files.delete(id); };
  }); },
  saveAsset(id, index, kind, file, mime) {
    return transaction('readwrite', (receipts, files, done, tx) => {
      const request = receipts.get(id);
      request.onsuccess = () => {
        const record = request.result;
        if (!record?.analysis?.items?.[index]) return tx.abort();
        const previous = record.assets?.find((asset) => asset.index === index && asset.kind === kind);
        const asset = { id: crypto.randomUUID(), index, kind, name: file.name, mime, size: file.size };
        const next = { ...record, assets: [...(record.assets ?? []).filter((entry) => entry.id !== previous?.id), asset] };
        if (previous) files.delete(previous.id);
        files.put(file, asset.id); receipts.put(next); done(next);
      };
    });
  },
  async getAsset(id, assetId) {
    return transaction('readonly', (receipts, files, done, tx) => {
      const request = receipts.get(id);
      request.onsuccess = () => {
        const asset = request.result?.assets?.find((entry) => entry.id === assetId);
        if (!asset) return tx.abort();
        const read = files.get(assetId); read.onsuccess = () => done({ asset, file: read.result });
      };
    });
  },
  saveExplanation(id, assetId, explanation) {
    return transaction('readwrite', (receipts, files, done, tx) => {
      const request = receipts.get(id);
      request.onsuccess = () => {
        const record = request.result;
        if (!record?.assets?.some((asset) => asset.id === assetId && asset.kind === 'terms')) return tx.abort();
        const next = { ...record, assets: record.assets.map((asset) => asset.id === assetId ? { ...asset, explanation } : asset) };
        receipts.put(next); done(next);
      };
    });
  },
  async openAsset(id, assetId) {
    const { asset, file } = await browserDriver.getAsset(id, assetId);
    const url = URL.createObjectURL(file);
    const link = document.createElement('a'); link.href = url; link.download = asset.name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
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
