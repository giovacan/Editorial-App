/**
 * paginationWorker.js — build: 2026-04-04b
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
 *   { type: 'START', chapters, layoutCtx, safeConfig,
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

self.onmessage = ({ data }) => {
  if (data.type !== 'START') return;

  const { chapters, layoutCtx, safeConfig } = data;

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
        prevChapterPages: prevChapterPageSlices
      }
    );

    // Persist for the next run (same worker process).
    _prevChapterHashes     = result.chapterHashes     ?? null;
    _prevChapterPageSlices = result.chapterPageSlices ?? null;

    self.postMessage({
      type: 'DONE',
      pages: result.pages,
      log: result.log,
      summaryText: result.summaryText,
      chapterHashes: result.chapterHashes ?? [],
      chapterPageSlices: result.chapterPageSlices ?? []
    });
  } catch (e) {
    self.postMessage({ type: 'ERROR', message: e?.message || String(e) });
  }
};
