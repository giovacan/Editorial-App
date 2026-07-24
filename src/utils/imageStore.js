/**
 * imageStore.js — content-addressed image store (B2, PR-A).
 *
 * Word/mammoth embeds images as base64 data-URIs inside chapter HTML. A real
 * book brought 119 images = 19MB of HTML, which overflowed localStorage
 * (QuotaExceeded) and the pagination worker's postMessage (out of memory).
 *
 * The fix: pull the image BYTES out of the HTML and keep only a short, stable
 * reference (`data-img-id`). Bytes live here, keyed by the SHA-256 of their
 * content — so the id is stable across sessions/devices AND identical images
 * dedupe automatically. Locally the bytes live in IndexedDB (no size cap like
 * localStorage); the cloud path (Firebase Storage) is added in PR-B.
 *
 * The pagination engine never needs the src — it sizes from data-w/data-h. Only
 * the preview needs a real src, which it resolves by id at render time.
 *
 * Framework-agnostic (usable outside React), and the pure helpers (hashBytes,
 * rewriteImgTag, hydrateImageSrcs) are testable without IndexedDB.
 */

const DB_NAME = 'editorial-images';
const STORE = 'images';
const ID_PREFIX = 'img_';

// ─── Pure helpers (no IndexedDB) ─────────────────────────────────────

/**
 * Get a WebCrypto SubtleCrypto. Browsers expose `crypto.subtle`; jsdom's global
 * `crypto` lacks `subtle`, so fall back to Node's webcrypto for tests.
 */
const getSubtle = () => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) return globalThis.crypto.subtle;
  return null;
};

/** SHA-256 of the given bytes → 'img_' + first 16 hex chars (content address). */
export const hashBytes = async (arrayBuffer) => {
  let subtle = getSubtle();
  if (!subtle) {
    // Node/jsdom fallback (tests): pull webcrypto from the node crypto module.
    try { subtle = (await import('node:crypto')).webcrypto.subtle; } catch { subtle = null; }
  }
  const digest = await subtle.digest('SHA-256', arrayBuffer);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return ID_PREFIX + hex.slice(0, 16);
};

/**
 * Rewrite one <img …> tag: drop its src (base64) and stamp data-img-id, keeping
 * (or adding) data-w/data-h and alt. Pure string transform.
 */
export const rewriteImgTag = (tag, id, dims) => {
  // Strip any existing src="…" (the base64 data-URI) and any prior data-img-id.
  let out = tag
    .replace(/\ssrc="[^"]*"/i, '')
    .replace(/\sdata-img-id="[^"]*"/i, '');
  const wh = dims && dims.w > 0 && dims.h > 0
    ? ` data-w="${dims.w}" data-h="${dims.h}"`
    : '';
  // Don't duplicate data-w/data-h if the tag already carries them.
  const whToAdd = /\bdata-w=/.test(out) ? '' : wh;
  return out.replace(/<img\b/i, `<img data-img-id="${id}"${whToAdd}`);
};

/**
 * Replace every `data-img-id="X"` in an HTML string with a real `src`, using the
 * provided resolver (id → url|null). Images that don't resolve are left as-is
 * (they simply won't display, but the markup/layout is untouched). Pure given
 * the resolver.
 */
export const hydrateImageSrcs = (html, resolver) => {
  if (!html || html.indexOf('data-img-id') === -1) return html || '';
  return html.replace(/<img\b[^>]*\bdata-img-id="([^"]+)"[^>]*>/gi, (tag, id) => {
    if (/\bsrc="/i.test(tag)) return tag; // already hydrated
    const url = resolver(id);
    if (!url) return tag;
    return tag.replace(/<img\b/i, `<img src="${url}"`);
  });
};

// ─── IndexedDB-backed byte store (graceful fallback to in-memory) ────

const memStore = new Map(); // id → { blob, mime, w, h, bookId }
const hasIDB = typeof indexedDB !== 'undefined';

let dbPromise = null;
const openDB = () => {
  if (!hasIDB) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(DB_NAME, 1); }
    catch { resolve(null); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null); // degrade to in-memory rather than crash
  });
  return dbPromise;
};

const idbGet = (db, id) => new Promise((resolve) => {
  try {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(id);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => resolve(null);
  } catch { resolve(null); }
});

const idbPut = (db, record) => new Promise((resolve) => {
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  } catch { resolve(false); }
});

/**
 * Store an image blob under its content hash. Returns the id. Deduplicates:
 * an id already present is not rewritten.
 * @param {Blob} blob
 * @param {{bookId?:string, w?:number, h?:number, mime?:string}} meta
 * @returns {Promise<string>} content-addressed id
 */
export const putImage = async (blob, meta = {}) => {
  const buf = await blob.arrayBuffer();
  const id = await hashBytes(buf);
  const record = {
    id, blob, mime: meta.mime || blob.type || 'image/png',
    w: meta.w || 0, h: meta.h || 0, bookId: meta.bookId || null,
    synced: false, createdAt: Date.now(),
  };
  const db = await openDB();
  if (db) {
    const existing = await idbGet(db, id);
    if (!existing) await idbPut(db, record);
  } else {
    if (!memStore.has(id)) memStore.set(id, record);
  }
  return id;
};

/** Get the stored record for an id (null if unknown). */
const getRecord = async (id) => {
  const db = await openDB();
  if (db) return idbGet(db, id);
  return memStore.get(id) || null;
};

/** Get the stored Blob for an id (null if unknown). */
export const getImageBlob = async (id) => {
  const rec = await getRecord(id);
  return rec ? rec.blob : null;
};

/**
 * List all stored image records for a book (for the local→cloud sync).
 * @returns {Promise<Array<{id,blob,mime,w,h,bookId,synced}>>}
 */
export const listBookImages = async (bookId) => {
  const db = await openDB();
  if (!db) return [...memStore.values()].filter((r) => r.bookId === bookId);
  return new Promise((resolve) => {
    try {
      const out = [];
      const tx = db.transaction(STORE, 'readonly');
      const cur = tx.objectStore(STORE).openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) { resolve(out); return; }
        if (c.value.bookId === bookId) out.push(c.value);
        c.continue();
      };
      cur.onerror = () => resolve(out);
    } catch { resolve([]); }
  });
};

/**
 * Re-tag every image stored under `fromBookId` to `toBookId`. Used when an
 * anonymous/local import (tagged with the local bookData.id) gets promoted to a
 * cloud book with a real Firestore id, so the sync uploads them under the right
 * book. Returns the count re-tagged.
 */
export const retagBookImages = async (fromBookId, toBookId) => {
  if (!fromBookId || !toBookId || fromBookId === toBookId) return 0;
  const recs = await listBookImages(fromBookId);
  const db = await openDB();
  let n = 0;
  for (const rec of recs) {
    const updated = { ...rec, bookId: toBookId };
    if (db) await idbPut(db, updated); else memStore.set(rec.id, updated);
    n++;
  }
  return n;
};

/** Mark a record as synced to the cloud (best-effort; ignored in memory mode). */
export const markSynced = async (id) => {
  const db = await openDB();
  if (!db) { const r = memStore.get(id); if (r) r.synced = true; return; }
  const rec = await idbGet(db, id);
  if (rec) await idbPut(db, { ...rec, synced: true });
};

// ─── Resolver (id → objectURL | cloud URL) with cache ────────────────

const urlCache = new Map(); // id → objectURL (local)
const cloudUrls = new Map(); // id → downloadURL (cloud, preferred)

/** Register a cloud downloadURL for an id (from services/images / mirror docs). */
export const registerCloudUrl = (id, url) => { if (id && url) cloudUrls.set(id, url); };

/** Bulk-register cloud URLs from a { id: {downloadURL} } index. */
export const registerCloudUrls = (index) => {
  for (const [id, meta] of Object.entries(index || {})) {
    if (meta?.downloadURL) cloudUrls.set(id, meta.downloadURL);
  }
};

/**
 * Resolve an id to a displayable src. Prefers a registered CLOUD url (survives
 * across devices/sessions); falls back to a local objectURL from IndexedDB.
 * Caches the objectURL so repeated renders don't recreate it.
 * @returns {Promise<string|null>}
 */
export const resolveImageSrc = async (id) => {
  if (cloudUrls.has(id)) return cloudUrls.get(id);
  if (urlCache.has(id)) return urlCache.get(id);
  const blob = await getImageBlob(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
};

/** Synchronous lookup of an already-resolved src (cloud preferred, else local). */
export const cachedImageSrc = (id) => cloudUrls.get(id) || urlCache.get(id) || null;

/**
 * Ensure objectURLs exist for every data-img-id in the HTML, then return the
 * hydrated HTML. Use this before injecting into the preview.
 * @returns {Promise<string>}
 */
export const hydrateImageSrcsAsync = async (html) => {
  if (!html || html.indexOf('data-img-id') === -1) return html || '';
  const ids = new Set();
  for (const m of html.matchAll(/data-img-id="([^"]+)"/gi)) ids.add(m[1]);
  await Promise.all([...ids].map((id) => resolveImageSrc(id)));
  return hydrateImageSrcs(html, cachedImageSrc);
};

/** Release all cached objectURLs (call on unmount / project switch). */
export const revokeAll = () => {
  for (const url of urlCache.values()) {
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  }
  urlCache.clear();
};

/** Test seam: clear the in-memory fallback store + caches. */
export const _resetMemStore = () => { memStore.clear(); urlCache.clear(); cloudUrls.clear(); };
