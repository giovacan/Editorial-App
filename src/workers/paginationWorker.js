/**
 * paginationWorker.js — build: 2026-04-05a chapter-start-budget
 *
 * Web Worker for off-main-thread pagination.
 * Receives chapters + layout config, runs paginateChapters, and posts progress/done/error.
 *
 * Incremental layout: the worker keeps chapter hashes + page slices from the
 * previous run in module-level vars. On the next START message it passes them
 * to paginateChapters so unchanged chapters skip greedyPaginate entirely.
 * The caller may also send prevChapterHashes + prevChapterPageSlices explicitly
 * (e.g. after a hot-reload) — those take precedence over the stored state.
 *
 * Messages IN:
 *   { type: 'START', chapters, layoutCtx, safeConfig, layoutHints?,
 *     prevChapterHashes?: string[], prevChapterPageSlices?: Page[][] }
 *
 * Messages OUT:
 *   { type: 'PROGRESS', chapter: number, total: number, percent: number }
 *   { type: 'DONE', pages: [], log: {}, summaryText: string,
 *     chapterHashes: string[], chapterPageSlices: Page[][] }
 *   { type: 'ERROR', message: string }
 */

import { paginateChapters } from '../utils/paginateChapters.js';

// In-worker cache — survives between consecutive START messages while the
// worker process is alive (i.e. for the lifetime of the usePagination hook).
let _prevChapterHashes = null;
let _prevChapterPageSlices = null;

// Above this many pages, also drop the per-page `summary` from the DONE payload
// (each entry carries a full lineAnalysis — heavy). `reproBundle` (a whole copy
// of every chapter's HTML) is ALWAYS dropped from the message regardless of
// size: the DONE payload already ships the book several times (`pages` +
// `chapterPageSlices`), and on memory-tight machines the extra full copies can
// exhaust the worker and surface as an opaque "Worker error (no message)".
// The log is dev-only diagnostics (DebugPanel + pagination-log.json), never
// needed to render, and reproBundle can be reconstructed from the pages.
const LOG_TRIM_PAGE_THRESHOLD = 120;

/**
 * Trim the log's heaviest sections from the worker→main structured-clone.
 * `reproBundle` always goes (biggest, most redundant); `summary` goes past the
 * page threshold. Everything else — per-event `entries`, `layoutAudit`, `config`
 * — is kept so the DebugPanel and pagination-log.json stay useful. Marks the
 * log so consumers know it's slim.
 */
const slimLogForMessage = (log) => {
  if (!log) return log;
  // eslint-disable-next-line no-unused-vars
  const { reproBundle, summary, ...rest } = log;
  if ((log.totalPages ?? 0) > LOG_TRIM_PAGE_THRESHOLD) {
    return { ...rest, trimmed: true };
  }
  return { ...rest, summary, trimmed: 'reproBundle' };
};

self.onmessage = ({ data }) => {
  if (data.type !== 'START') return;

  const { chapters, layoutCtx, safeConfig, layoutHints } = data;

  // Prefer hashes/slices passed explicitly from the caller (handles hot-reload /
  // worker restart scenarios where module-level state was reset).
  const prevChapterHashes     = data.prevChapterHashes     ?? _prevChapterHashes;
  const prevChapterPageSlices = data.prevChapterPageSlices ?? _prevChapterPageSlices;

  try {
    const result = paginateChapters(
      chapters,
      layoutCtx,
      null,   // measureDiv = null — worker uses string-based path
      safeConfig,
      {
        onProgress: (chapter, total) => {
          self.postMessage({
            type: 'PROGRESS',
            chapter,
            total,
            percent: Math.round((chapter / total) * 88) + 2
          });
        },
        prevChapterHashes,
        prevChapterPages: prevChapterPageSlices,
        layoutHints
      }
    );

    // Persist for the next run (same worker process).
    _prevChapterHashes     = result.chapterHashes     ?? null;
    _prevChapterPageSlices = result.chapterPageSlices ?? null;

    // The DONE payload duplicates the whole book several times over: `pages`
    // and `chapterPageSlices` both carry every page's HTML, and `log` carries a
    // full per-page `summary` + a `reproBundle` copy of all chapter HTML. For a
    // large book (400+ pages) the combined structured-clone can exhaust the
    // worker's memory during postMessage ("Data cannot be cloned, out of
    // memory") — the book then never reaches the main thread. The log is
    // dev-only diagnostics (DebugPanel + pagination-log.json), never needed to
    // render, so drop its heavy sections past a threshold. Pagination itself is
    // unaffected; only the offline diagnostic detail is trimmed.
    const log = slimLogForMessage(result.log);

    self.postMessage({
      type: 'DONE',
      pages: result.pages,
      log,
      summaryText: result.summaryText,
      chapterHashes: result.chapterHashes ?? [],
      chapterPageSlices: result.chapterPageSlices ?? [],
      chStartExtra: result.chStartExtra ?? 0,
      headerSpaceEstimate: result.headerSpaceEstimate ?? 0,
      qualityReport: result.qualityReport ?? null,
    });
  } catch (e) {
    self.postMessage({ type: 'ERROR', message: (e && (e.message || e.stack)) || String(e) });
  }
};

// Last-resort reporter: a module-load error or an error thrown OUTSIDE the
// onmessage try (e.g. an un-cloneable postMessage payload, a stack overflow)
// otherwise reaches the main thread as an opaque `Worker error: (no message)`.
// Surface the real reason so it's actionable instead of blank.
self.addEventListener('error', (ev) => {
  try {
    self.postMessage({
      type: 'ERROR',
      message: `Worker uncaught: ${ev?.message || '(no message)'}` +
        (ev?.filename ? ` @ ${ev.filename}:${ev.lineno ?? '?'}:${ev.colno ?? '?'}` : ''),
    });
  } catch { /* nothing more we can do */ }
});
