/**
 * extractImages.js — pull base64 images out of imported HTML (B2, PR-A).
 *
 * mammoth embeds images as `<img src="data:image/…;base64,…">`. This module
 * runs at import time (main thread): for each such tag it converts the data-URI
 * to a Blob, measures its intrinsic dimensions, stores the bytes in the
 * content-addressed image store, and REWRITES the tag to a lightweight
 * `<img data-img-id="…" data-w data-h alt>` — no base64. The heavy bytes never
 * reach localStorage, the pagination worker, or Firestore.
 *
 * This fuses the old `precomputeImageDims` work (a single image load per src)
 * with extraction, so we don't decode each image twice.
 *
 * Fail-safe: any image that can't be decoded is left with its original tag
 * untouched, so the import never hangs or loses content.
 */

import { putImage, rewriteImgTag } from './imageStore.js';

const IMG_TAG_RE = /<img\b[^>]*?\bsrc="([^"]+)"[^>]*>/gi;

/** Decode a data-URI to a Blob. Returns null if it isn't a data-URI. */
const dataUriToBlob = async (src) => {
  if (!/^data:/i.test(src)) return null;
  try {
    // fetch() handles data-URIs in browsers; fall back to manual decode.
    if (typeof fetch === 'function') {
      const res = await fetch(src);
      return await res.blob();
    }
  } catch { /* fall through to manual decode */ }
  try {
    const [, mime, b64] = src.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/is) || [];
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime || 'image/png' });
  } catch { return null; }
};

/** Measure a blob's intrinsic dimensions via Image(), with a timeout. */
const measureBlob = (blob, timeoutMs) => new Promise((resolve) => {
  // Needs a DOM (Image) and objectURL support; absent in Node/jsdom → skip
  // measurement (the engine falls back to a default aspect from data-w/h).
  if (typeof Image === 'undefined' ||
      typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    resolve(null); return;
  }
  let done = false;
  const finish = (v) => { if (!done) { done = true; try { URL.revokeObjectURL(url); } catch { /* ignore */ } resolve(v); } };
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => finish({ w: img.naturalWidth, h: img.naturalHeight });
  img.onerror = () => finish(null);
  setTimeout(() => finish(null), timeoutMs);
  try { img.src = url; } catch { finish(null); }
});

/**
 * Extract every base64 <img> from `html`: store the bytes, rewrite the tag.
 * @param {string} html
 * @param {string|null} bookId - owning book (for later cloud upload / cleanup)
 * @param {number} perImageTimeoutMs
 * @returns {Promise<string>} HTML with base64 replaced by data-img-id refs
 */
export const extractImagesFromHtml = async (html, bookId = null, perImageTimeoutMs = 5000) => {
  if (!html || html.indexOf('<img') === -1) return html || '';
  const matches = [...html.matchAll(IMG_TAG_RE)];
  if (matches.length === 0) return html;

  // Process all images in PARALLEL (each guarded by its own timeout). Skip tags
  // whose src isn't a data-URI (already-linked images) — leave them as-is.
  const results = await Promise.all(matches.map(async (m) => {
    const src = m[1];
    const blob = await dataUriToBlob(src);
    if (!blob) return null; // not base64 → don't touch
    const dims = await measureBlob(blob, perImageTimeoutMs);
    try {
      const id = await putImage(blob, {
        bookId, w: dims?.w || 0, h: dims?.h || 0, mime: blob.type,
      });
      return { id, dims };
    } catch { return null; }
  }));

  // Rewrite each occurrence by INDEX, walking in reverse so earlier offsets stay
  // valid (identical images map to the same id — that's fine and intended).
  let out = html;
  for (let i = matches.length - 1; i >= 0; i--) {
    const r = results[i];
    if (!r) continue;
    const m = matches[i];
    const newTag = rewriteImgTag(m[0], r.id, r.dims);
    out = out.slice(0, m.index) + newTag + out.slice(m.index + m[0].length);
  }
  return out;
};
