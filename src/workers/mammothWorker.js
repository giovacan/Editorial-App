/**
 * mammothWorker.js — decode a .docx to HTML off the main thread (B2 perf).
 *
 * mammoth.convertToHtml on a book with 100+ embedded images takes ~9-16s and, on
 * the main thread, freezes the whole UI until it finishes. Running it in a Worker
 * keeps the UI responsive.
 *
 * NOTE: Vite bundles workers as ES modules (`worker.format: 'es'`), and ES
 * module workers DON'T have `importScripts`. So we load the same CDN mammoth by
 * fetching its source and evaluating it into the worker's global — it's a UMD
 * build that attaches `self.mammoth`. (Using importScripts here was the cause of
 * a "Cannot access … before initialization" bundle error.)
 *
 * Protocol:
 *   → { arrayBuffer }         (the raw .docx bytes, transferred zero-copy)
 *   ← { type:'DONE', html }
 *   ← { type:'ERROR', message }
 */

/* eslint-disable no-undef */
const MAMMOTH_CDN = 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js';

let loadPromise = null;
const ensureMammoth = async () => {
  if (self.mammoth) return;
  if (!loadPromise) {
    loadPromise = (async () => {
      const res = await fetch(MAMMOTH_CDN);
      if (!res.ok) throw new Error('No se pudo cargar mammoth (' + res.status + ')');
      const src = await res.text();
      // The UMD build sees `self`/`this` as the global and attaches `mammoth`.
      // eslint-disable-next-line no-new-func
      (0, eval)(src);
    })();
  }
  await loadPromise;
};

self.onmessage = async (e) => {
  const { arrayBuffer } = e.data || {};
  try {
    await ensureMammoth();
    if (!self.mammoth) throw new Error('mammoth no disponible en el worker');
    const result = await self.mammoth.convertToHtml({ arrayBuffer });
    self.postMessage({ type: 'DONE', html: result?.value || '' });
  } catch (err) {
    self.postMessage({ type: 'ERROR', message: err?.message || String(err) });
  }
};
