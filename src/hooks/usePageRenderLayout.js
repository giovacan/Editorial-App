/**
 * usePageRenderLayout — React wrapper around the pure layout engine.
 *
 * All layout logic lives in src/utils/pageLayout.js (getPageLayout).
 * This file:
 *   1. Re-exports the pure helpers so existing importers keep working.
 *   2. Wraps getPageLayout in useMemo for React render optimization.
 *   3. Provides usePageRenderLayoutFromStore as a convenience hook.
 *
 * Used by: Preview.jsx, ExportPreviewModal.jsx (via usePageRenderLayoutFromStore)
 */

import { useMemo } from 'react';
import useEditorStore from '../store/useEditorStore';
import {
  getPageLayout,
  computeFolioHorizontalStyle,
  computeFolioStyle,
  computeShowFolio,
  computeFolioFromEdge,
} from '../utils/pageLayout';

// Re-export pure helpers — all existing importers keep working without change.
export { computeFolioHorizontalStyle, computeFolioStyle, computeShowFolio, computeFolioFromEdge };

/**
 * React hook — computes everything needed to render a single book page.
 * Memoizes the full layout computation; re-runs only when relevant inputs change.
 *
 * @param {object} opts
 * @param {object}  opts.pageData    - page object from paginatedPages / allPages
 * @param {object}  opts.config      - safeConfig
 * @param {object}  opts.bookConfig  - KDP_STANDARDS.getBookTypeConfig(bookType)
 * @param {object}  opts.pageFormat  - KDP_STANDARDS.getPageFormat(...)
 * @param {number}  opts.previewScale
 * @param {number}  opts.totalPages  - for dynamic margins
 * @param {object}  opts.layoutDims  - from useEditorStore (pagination engine output)
 * @param {object}  [opts.tocConfig] - for showFolio flag
 * @param {string}  [opts.bookTitle] - for header
 */
export function usePageRenderLayout(opts) {
  const safeConfig   = opts.config   || {};
  const safePageData = opts.pageData || { html: '', pageNumber: 1, isBlank: false };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getPageLayout({ ...opts, config: safeConfig, pageData: safePageData }), [
    opts.pageFormat?.id,
    opts.bookConfig,
    opts.previewScale,
    opts.totalPages,
    opts.layoutDims,
    opts.tocConfig,
    opts.bookTitle,
    safePageData.pageNumber,
    safePageData.isTitleOnlyPage,
    safePageData.isBlank,
    safePageData.isTOCPage,
    safePageData.isTitlePage,
    safePageData.isFrontMatter,
    safePageData.isExtraEndPage,
    safePageData.shouldShowPageNumber,
    safePageData.displayPageNumber,
    safePageData.chapterTitle,
    safePageData.currentSubheader,
    safePageData.isFirstChapterPage,
    safeConfig.fontSize,
    safeConfig.fontFamily,
    safeConfig.lineHeight,
    safeConfig.showPageNumbers,
    safeConfig.pageNumberPos,
    safeConfig.pageNumberAlign,
    safeConfig.marginStrategy,
    safeConfig.showHeaders,
    safeConfig.paragraph?.align,
    safeConfig.header,
  ]);
}

/**
 * Convenience hook — reads layoutDims and tocConfig from the store automatically.
 * Use this in components that already have access to the store.
 */
export function usePageRenderLayoutFromStore(opts) {
  const layoutDims = useEditorStore((s) => s.layoutDims);
  const tocConfig  = useEditorStore((s) => s.tocConfig);
  return usePageRenderLayout({ ...opts, layoutDims, tocConfig });
}
