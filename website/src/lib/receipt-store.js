import { newId, sha256Hex } from './ids.js';

export const PAGE_SIZE = 50;
export const MAX_LOCAL_BYTES = 20 * 1024 * 1024;
const supported = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif|avif|gif|bmp))$/;

export function receiptMime(file, name = file.name ?? '') {
  if (supported.test(file.type)) return file.type;
  const extension = name.split('.').pop().toLowerCase();
  const types = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', avif: 'image/avif', gif: 'image/gif', bmp: 'image/bmp' };
  return !file.type || file.type === 'application/octet-stream' ? types[extension] ?? '' : '';
}

/** Kept injectable so tests can exercise the workflow without a browser or network. */
export function createReceiptWallet(driver) {
  return {
    list: (offset = 0) => driver.list(offset, PAGE_SIZE),
    async listAll() {
      // Only metadata and analysis are read. Original files stay in their own store and are not loaded for search.
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
    saveAnalysis: (id, analysis) => driver.updateAnalysis(id, analysis),
    async saveAsset(id, index, kind, file) {
      const mime = receiptMime(file);
      if (!['photo', 'terms'].includes(kind) || !/^image\/(jpeg|png|webp)$/.test(mime) && !(kind === 'terms' && mime === 'application/pdf')) throw new Error('Choose a JPG, PNG, WebP photo or a PDF of the terms.');
      if (!file.size || file.size > MAX_LOCAL_BYTES) throw new Error('Choose a nonempty file up to 20 MB.');
      return driver.saveAsset(id, index, kind, file, mime);
    },
    getAsset: (id, assetId) => driver.getAsset(id, assetId),
    saveExplanation: (id, assetId, explanation) => driver.saveExplanation(id, assetId, explanation),
    clearAll: () => driver.clearAll(),
  };
}

const DATABASE_NAME = 'dhamantaha-receipts';
let database;

function browserDatabase() {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('receipts', { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
        request.result.createObjectStore('files');
      };
      request.onsuccess = () => {
        const db = request.result;
        // Another tab is deleting or upgrading the wallet: let go so it can, and reconnect on the next use.
        db.onversionchange = () => { db.close(); database = null; };
        resolve(db);
      };
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
    // Identical bytes return the receipt already saved instead of storing a second copy.
    const sha256 = await sha256Hex(file);
    const record = { id: newId(), name, mime, size: file.size, createdAt: now, updatedAt: now, analysis: null, sha256 };
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
    // Browsers may decline persistence; asking makes eviction under storage pressure less likely.
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
  delete(id) {
    return transaction('readwrite', (receipts, files) => {
      const request = receipts.get(id);
      request.onsuccess = () => { for (const asset of request.result?.assets ?? []) files.delete(asset.id); receipts.delete(id); files.delete(id); };
    });
  },
  saveAsset(id, index, kind, file, mime) {
    return transaction('readwrite', (receipts, files, done, tx) => {
      const request = receipts.get(id);
      request.onsuccess = () => {
        const record = request.result;
        if (!record?.analysis?.items?.[index]) return tx.abort();
        const previous = record.assets?.find((asset) => asset.index === index && asset.kind === kind);
        const asset = { id: newId(), index, kind, name: file.name, mime, size: file.size };
        const next = { ...record, assets: [...(record.assets ?? []).filter((entry) => entry.id !== previous?.id), asset] };
        if (previous) files.delete(previous.id);
        files.put(file, asset.id); receipts.put(next); done(next);
      };
    });
  },
  getAsset(id, assetId) {
    return transaction('readonly', (receipts, files, done, tx) => {
      const request = receipts.get(id);
      request.onsuccess = () => {
        const asset = request.result?.assets?.find((entry) => entry.id === assetId);
        if (!asset) return tx.abort();
        const read = files.get(assetId);
        read.onsuccess = () => done({ asset, file: read.result });
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
  async clearAll() {
    const db = await browserDatabase();
    db.close();
    database = null;
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DATABASE_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Could not delete the saved receipts. Try again.'));
      request.onblocked = () => reject(new Error('Close other Dhamantaha tabs and try again.'));
    });
  },
};

export const receiptWallet = createReceiptWallet(browserDriver);

/** How much this site stores in the browser, and whether the browser promised to keep it. Values are null when unknown. */
export async function storageStatus() {
  const estimate = await navigator.storage?.estimate?.().catch(() => null);
  const persisted = await navigator.storage?.persisted?.().catch(() => null);
  return { usage: estimate?.usage ?? null, quota: estimate?.quota ?? null, persisted: persisted ?? null };
}

/** Asks the browser to keep this site's data even when storage runs low. Resolves to whether it agreed. */
export async function requestPersistence() {
  return (await navigator.storage?.persist?.().catch(() => false)) ?? false;
}
