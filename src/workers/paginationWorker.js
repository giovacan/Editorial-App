/**
 * paginationWorker.js — build: 2026-03-27h
 *
 * Web Worker for off-main-thread pagination.
 * Receives chapters + layout config, runs paginateChapters, and posts progress/done/error.
 *
 * Messages IN:
 *   { type: 'START', chapters, layoutCtx, safeConfig }
 *
 * Messages OUT:
 *   { type: 'PROGRESS', chapter: number, total: number, percent: number }
 *   { type: 'DONE', pages: [], log: {}, summaryText: string }
 *   { type: 'ERROR', message: string }
 */

import { paginateChapters } from '../utils/paginateChapters.js';

self.onmessage = ({ data }) => {
  if (data.type !== 'START') return;

  const { chapters, layoutCtx, safeConfig } = data;

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
        }
      }
    );

    self.postMessage({
      type: 'DONE',
      pages: result.pages,
      log: result.log,
      summaryText: result.summaryText
    });
  } catch (e) {
    self.postMessage({ type: 'ERROR', message: e?.message || String(e) });
  }
};
