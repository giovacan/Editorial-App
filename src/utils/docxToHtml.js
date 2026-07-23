/**
 * docxToHtml.js — convert a .docx ArrayBuffer to HTML, off the main thread.
 *
 * Runs mammoth in a Worker (src/workers/mammothWorker.js) so decoding a
 * large book (100+ images, ~9-16s) doesn't freeze the UI. Transfers the
 * ArrayBuffer zero-copy (no multi-MB clone). Falls back to the main-thread
 * window.mammoth if the worker can't run (CSP blocks importScripts, CDN
 * unreachable, etc.) so import never breaks.
 */

/**
 * Convert a .docx File to HTML off the main thread. Takes the File (not a
 * buffer) so, if the worker fails after we've transferred the bytes, the
 * fallback can re-read a fresh buffer from the File.
 * @param {File|Blob} file - the .docx file
 * @returns {Promise<string>} the converted HTML
 */
export const docxToHtml = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL('../workers/mammothWorker.js', import.meta.url));
    } catch {
      fallback(file).then(resolve, reject);
      return;
    }

    let settled = false;
    const done = (fn, val) => { if (!settled) { settled = true; try { worker.terminate(); } catch { /* ignore */ } fn(val); } };

    worker.onmessage = ({ data }) => {
      if (data?.type === 'DONE') done(resolve, data.html || '');
      else if (data?.type === 'ERROR') {
        console.warn('mammothWorker error, usando hilo principal:', data.message);
        fallback(file).then((h) => done(resolve, h), (err) => done(reject, err));
      }
    };
    worker.onerror = (e) => {
      console.warn('mammothWorker no disponible, usando hilo principal:', e.message);
      fallback(file).then((h) => done(resolve, h), (err) => done(reject, err));
    };

    // Transfer the buffer (zero-copy — no 19MB clone). It's neutered here after,
    // which is fine: the fallback re-reads a fresh buffer from `file`.
    try { worker.postMessage({ arrayBuffer }, [arrayBuffer]); }
    catch (err) { done(reject, err); }
  });
};

/** Fallback: re-read the file and convert on the main thread (window.mammoth). */
const fallback = async (file) => {
  const buf = await file.arrayBuffer();
  return mainThreadConvert(buf);
};

/** Fallback: convert on the main thread with the CDN-loaded window.mammoth. */
const mainThreadConvert = async (arrayBuffer) => {
  if (typeof window === 'undefined' || !window.mammoth) {
    throw new Error('mammoth no está disponible');
  }
  const result = await window.mammoth.convertToHtml({ arrayBuffer });
  return result?.value || '';
};
