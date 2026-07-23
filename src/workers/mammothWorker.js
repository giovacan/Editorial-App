/**
 * mammothWorker.js — decode a .docx to HTML off the main thread (B2 perf).
 *
 * mammoth.convertToHtml on a book with 100+ embedded images takes ~9-16s and, on
 * the main thread, freezes the whole UI (no spinner, no interaction) until it
 * finishes. Running it in a Worker keeps the UI responsive and lets us show a
 * progress state.
 *
 * This is a CLASSIC worker (not a module) so it can importScripts the same CDN
 * mammoth build the app already uses — no npm dependency, same version.
 *
 * Protocol:
 *   → { arrayBuffer }         (the raw .docx bytes, transferred zero-copy)
 *   ← { type:'DONE', html }
 *   ← { type:'ERROR', message }
 */

/* eslint-disable no-undef */
const MAMMOTH_CDN = 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js';

let loaded = false;
const ensureMammoth = () => {
  if (loaded && self.mammoth) return;
  importScripts(MAMMOTH_CDN); // synchronous inside a worker
  loaded = true;
};

self.onmessage = async (e) => {
  const { arrayBuffer } = e.data || {};
  try {
    ensureMammoth();
    if (!self.mammoth) throw new Error('mammoth no disponible en el worker');
    const result = await self.mammoth.convertToHtml({ arrayBuffer });
    self.postMessage({ type: 'DONE', html: result?.value || '' });
  } catch (err) {
    self.postMessage({ type: 'ERROR', message: err?.message || String(err) });
  }
};
