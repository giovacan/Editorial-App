/**
 * paginateChapters.js
 *
 * Pure pagination engine — deterministic, no DOM measurement.
 *
 * Architecture:
 *   1. flattenChapterElements()  — pre-measure all elements (Canvas)
 *   2. greedyPaginate()          — single linear pass, split when needed
 *   3. applyFillPass()           — single forward fill-pass
 *
 * All height calculations use textLayoutEngine (Canvas 2D + math).
 * Zero offsetHeight, zero getBoundingClientRect, zero DOM layout dependency.
 */

import {
  buildParagraphHtml,
  buildChapterTitleHtml,
  shouldStartOnRightPage,
  splitParagraphByLines
} from './paginationEngine';

import {
  JUSTIFY_SLACK_RATIO,
  htmlToText,
  parseTopLevelBlocks as parseHtmlElements,
  getFirstBlock as getFirstElement,
  getLastBlock as getLastElement,
  removeBlockAt as removeElementAt,
  removeLastBlock as removeLastElement,
  removeFirstBlock as removeFirstHtmlElement,
  getBoldTextRatio,
  serializeBlocks,
  getPageBlocks,
  setPageBlocks,
  setPageHtml
} from './layoutIr.js';

import {
  measureHtmlHeight,
  createLayoutContext,
  getLineBreakPositions,
  getLineBreakPositionsKP,
  buildFontString,
  countHyphenationMetrics,
  getCtx as getEngineCtx2d
} from './textLayoutEngine';

import { createPaginationLogger, assignBlockId, deriveFragmentId, injectBlockIdAttrs, resetBlockCounter } from './paginationLogger.js';

// Canvas measures content height precisely, but the browser DOM renders the same
// HTML taller due to subpixel line-height accumulation, font rounding, and
// em-based padding on blockquotes/headings that canvas cannot measure exactly.
// Empirical worst-case delta observed: ~1.8 lines at lineHeightPx=10px.
// Using 1 full line (factor 1.0) covers all observed cases without wasting space.
// Computed once per pagination run, after layoutCtx is available.
// Initial value 0 — overwritten at the start of paginateChapters.
let DOM_SLACK = 0;

// Per-run cache for evaluatePageQualityCanvas — cleared at the start of each
// paginateChapters() invocation. Eliminates ~80% of redundant scoring across
// the 27 repair passes that re-evaluate the same page HTML repeatedly.
// Key: `${simpleHash(html)}|${isFragment?1:0}|${isChapterLastPage?1:0}`
// Value: { score, fillPct, violations }
let _evalCache = new Map();
let _evalCacheHits = 0;
let _evalCacheMisses = 0;

// ─────────────────────────────────────────────────────────────────────────────
// DOM-free HTML helpers — Worker-safe string-based replacements for
// document.createElement('div') + innerHTML patterns used throughout this file.
// ─────────────────────────────────────────────────────────────────────────────

/** Strip all HTML tags → plain text (replaces el.textContent) */
/**
 * Worker-safe canvas measurement: get a 2D context from an OffscreenCanvas if available,
 * otherwise from a regular canvas (main thread). Returns the ctx.
 */
const getCanvasCtx2d = (() => {
  let _ctx = null;
  return () => {
    if (_ctx) return _ctx;
    if (typeof OffscreenCanvas !== 'undefined') {
      _ctx = new OffscreenCanvas(1, 1).getContext('2d');
    } else if (typeof document !== 'undefined') {
      _ctx = document.createElement('canvas').getContext('2d');
    }
    return _ctx;
  };
})();

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shared justify slack ratio — single source of truth.
 * Used here (greedy paginator) and in paginationEngine.splitParagraphByLines.
 * 4% compensates Canvas.measureText() underestimating Spanish chars (ñ, á, é).
 */
const FILL_PASS_RUNT_MIN_CURRENT_FILL = 0.70;
const FILL_PASS_RUNT_MIN_RESULT_FILL = 0.88;
const SHORT_LAST_LINE_POSTPASS_MIN_SOURCE_FILL = 0.80;
// Minimum computeRuntLinePenalty score to trigger a hard guard (layout mutation rejection).
// 900 = "2 words that are already narrow" — captures 1-word (2000) and narrow 2-word (1500),
// while leaving mildly short 3-4 word lines to the soft scoring path.
const RUNT_HARD_PENALTY_THRESHOLD = 900;

/**
 * Main entry point — same interface as before.
 *
 * @param {Chapter[]} chapters
 * @param {object} layoutCtx - Pagination layout context (from usePagination)
 * @param {HTMLElement} measureDiv - DOM element (still used by splitParagraphByLines for HTML parsing)
 * @param {object} safeConfig
 * @returns {Page[]}
 */
/**
 * Fast non-cryptographic string hash (djb2 variant).
 * Stable across runs for the same input — suitable as a chapter cache key.
 * @param {string} str
 * @returns {string} hex string
 */
const simpleHash = (str) => {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
};

export const paginateChapters = (chapters, layoutCtx, measureDiv, safeConfig, options = null) => {
  if (!chapters || !Array.isArray(chapters)) return { pages: [], log: {}, summaryText: '' };

  const logger = options?.logger || null;
  const onProgress = options?.onProgress || null;
  // Incremental layout: previous chapter hashes + pages from last run.
  // If a chapter's hash matches, skip greedyPaginate and reuse its pages.
  const prevChapterHashes = options?.prevChapterHashes || null;
  const prevChapterPages  = options?.prevChapterPages  || null;
  const log = logger || createPaginationLogger();
  log.reset();
  resetBlockCounter();

  // Clear scoring cache for this run (fresh state per pagination invocation).
  _evalCache = new Map();
  _evalCacheHits = 0;
  _evalCacheMisses = 0;

  const allPages = [];

  // Build Canvas layout context for deterministic measurement
  // ctx.measureText() underestimates word widths for Spanish characters
  // (ñ, í, é, etc.) by ~0.15px/char → for 40-char lines = ~6px total.
  // 4% (~6.2px at 155px) ensures Canvas wraps borderline lines the same
  // way the browser does. Impact: <0.5% false extra wraps (imperceptible).
  // SINGLE SOURCE OF TRUTH — imported by paginationEngine.splitParagraphByLines
  const justifySlack = layoutCtx.textAlign === 'justify'
    ? layoutCtx.contentWidth * JUSTIFY_SLACK_RATIO
    : 0;
  const canvasCtx = {
    ...createLayoutContext(
      layoutCtx.baseFontSizePx || layoutCtx.lineHeightPx / layoutCtx.baseLineHeight,
      layoutCtx.baseLineHeight,
      layoutCtx.contentWidth,
      layoutCtx.fontFamily || 'Georgia, serif'
    ),
    widthSlack: justifySlack,
    lineHeightPx: layoutCtx.lineHeightPx,
    targetFillPct: safeConfig?.pagination?.targetFillPct ?? 0.88,
    ctx2d: getEngineCtx2d(),
    textAlign: layoutCtx.textAlign || 'left',
    quoteConfig: safeConfig?.quote || {
      enabled: true, indentLeft: 2, indentRight: 2, showLine: true,
      italic: true, sizeMultiplier: 0.95, marginTop: 1, marginBottom: 1
    }
  };
  // Inject canonical line-metrics fn for the logger (avoids circular import)
  canvasCtx._computeLineMetricsFn = (plainText, isContinuation, isLastOnPage) =>
    computeParaLineMetrics(plainText, canvasCtx, isContinuation, isLastOnPage);

  const { contentHeight, lineHeightPx, baseFontSize: baseFontSizeTop, baseLineHeight: baseLineHeightTop, minOrphanLines: minOrphanLinesTop } = layoutCtx;

  // Set DOM_SLACK proportional to lineHeightPx so it scales with font size.
  // 30% of one line covers the subpixel accumulation gap between Canvas and DOM rendering.
  DOM_SLACK = Math.round(lineHeightPx * 0.3);

  const pageFormat = safeConfig?.pageFormat || layoutCtx.pageFormat || 'unknown';
  log.setConfig({ pageFormat, fontSize: baseFontSizeTop, lineHeight: baseLineHeightTop, contentHeight, contentWidth: layoutCtx.contentWidth, minOrphanLines: minOrphanLinesTop, lineHeightPx });

  // Reproduction bundle — everything needed to replay this exact pagination run
  if (process.env.NODE_ENV === 'development') {
    const manuscriptHash = chapters.reduce((acc, ch) => acc + (ch.html || '').length + (ch.title || '').length, 0);
    const configStr = JSON.stringify({ pageFormat, fontSize: baseFontSizeTop, lineHeight: baseLineHeightTop, contentHeight, contentWidth: layoutCtx.contentWidth, minOrphanLines: minOrphanLinesTop, lineHeightPx, textAlign: layoutCtx.textAlign, fontFamily: layoutCtx.fontFamily });
    const configHash = configStr.split('').reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0).toString(16);
    log.setReproBundle({
      engineVersion: '4.0',
      timestamp: new Date().toISOString(),
      manuscriptHash: `len${manuscriptHash}`,
      configHash,
      layoutCtx: {
        pageFormat,
        baseFontSizePx: canvasCtx.baseFontSizePx,
        baseLineHeight: baseLineHeightTop,
        contentHeight,
        contentWidth: layoutCtx.contentWidth,
        lineHeightPx,
        textAlign: layoutCtx.textAlign,
        fontFamily: layoutCtx.fontFamily || 'Georgia, serif',
        minOrphanLines: minOrphanLinesTop,
        minWidowLines: layoutCtx.minWidowLines
      },
      flags: {
        splitLongParagraphs: layoutCtx.splitLongParagraphs,
        targetFillPct: safeConfig?.pagination?.targetFillPct ?? 0.88,
        firstLineIndent: safeConfig?.paragraph?.firstLineIndent ?? 1.5,
        justifySlack: justifySlack,
        workerPath: typeof WorkerGlobalScope !== 'undefined' ? 'worker' : 'main-thread'
      },
      chapterCount: chapters.length,
      totalContentLength: manuscriptHash
    });
  }

  // chapterHashes[i] = simpleHash of chapter html+title — returned to caller
  // so it can feed them back as prevChapterHashes on the next run.
  // chapterPageRanges[i] = { start, end } indices into allPages (before global passes)
  // — used to build per-chapter page slices for the next run's cache.
  const chapterHashes = [];
  const chapterPageRanges = [];

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    if (onProgress) onProgress(i + 1, chapters.length);

    // Compute a stable hash for this chapter's content + title.
    const chHash = simpleHash((chapter.html || '') + '|' + (chapter.title || ''));
    chapterHashes.push(chHash);

    // Note the page index where this chapter starts (including any parity-pad blank)
    const chapterStartIdx = allPages.length;

    // Pad to odd page if chapter must start on right
    if (shouldStartOnRightPage(chapter, i, safeConfig) && i > 0) {
      if (allPages.length % 2 === 1) {
        allPages.push({
          html: '',
          blocks: [],
          pageNumber: allPages.length + 1,
          isBlank: true,
          chapterTitle: '',
          currentSubheader: ''
        });
      }
    }

    // Incremental layout: skip greedyPaginate if chapter is unchanged.
    if (
      prevChapterHashes && prevChapterPages &&
      prevChapterHashes[i] === chHash &&
      Array.isArray(prevChapterPages[i]) && prevChapterPages[i].length > 0
    ) {
      if (process.env.NODE_ENV === 'development') {
        log.record('greedy', 'diag', 0, { note: 'incremental-cache-hit', chapter: i, hash: chHash });
      }
      allPages.push(...prevChapterPages[i]);
      chapterPageRanges.push({ start: chapterStartIdx, end: allPages.length });
      continue;
    }

    const elements = flattenChapterElements(chapter, layoutCtx, canvasCtx, measureDiv, safeConfig);
    // DEV: log first 4 paragraph indents to diagnose missing-indent bugs
    if (process.env.NODE_ENV === 'development' && i === 0) {
      const paraEls = elements.filter(e => e.tag === 'P').slice(0, 4);
      paraEls.forEach((e, pi) => {
        const indentM = e.html?.match(/text-indent\s*:\s*([^;}"]+)/i);
        log.record('greedy', 'diag', 0, { note: 'indent-check', para: pi, indent: indentM?.[1] ?? 'none', text: (e.textContent||'').substring(0,50) });
      });
    }
    const chapterPages = greedyPaginate(elements, layoutCtx, canvasCtx, measureDiv, safeConfig, chapter, log);
    allPages.push(...chapterPages);
    chapterPageRanges.push({ start: chapterStartIdx, end: allPages.length });
  }

  // Re-number all pages sequentially
  allPages.forEach((p, i) => { p.pageNumber = i + 1; });

  // Fill-pass with multi-pass convergence
  applyFillPass(allPages, layoutCtx, canvasCtx, measureDiv, safeConfig, log);

  // E5: Fix orphaned headings left at bottom of pages after fill-pass
  fixHeadingsAtBottom(allPages, canvasCtx, layoutCtx, log);

  // Second fill-pass — fixHeadingsAtBottom may have left pages underfilled
  // (e.g. page that had content+heading is now content-only at 60%).
  // A second forward pass fills those gaps before cleanup runs.
  applyFillPass(allPages, layoutCtx, canvasCtx, measureDiv, safeConfig, log);

  // E4: Cleanup nearly-empty pages after heading fixes (before distributing space)
  cleanupNearlyEmptyPages(allPages, layoutCtx, canvasCtx);

  // Parity pass 1 — before smoothing so smoothing has correct page positions
  enforceChapterStartParity(allPages, safeConfig);

  // E7: Smooth fill imbalance between adjacent pages.
  // Runs BEFORE distributeVerticalSpace so moved elements don't carry
  // distribution-adjusted margins from their source page to the destination.
  smoothPageBalance(allPages, layoutCtx, canvasCtx, log);

  // Parity pass 2 — restore invariant if smoothing shifted page count
  enforceChapterStartParity(allPages, safeConfig);

  // E8: Merge split paragraph fragments that ended up adjacent on the same page.
  // This happens when greedy-split + fill-pass produce two <p> elements from the
  // same original paragraph on one page. One has data-continuation='true' — merge
  // it with its neighbor so it displays as a single paragraph.
  mergeSplitFragments(allPages, log);
  repairPageDefects(allPages, layoutCtx, canvasCtx, log);
  // Third heading fix pass: defect repair may have freed space on pages
  // that were previously too full to accept a forwarded heading.
  fixHeadingsAtBottom(allPages, canvasCtx, layoutCtx, log);

  // Indent repair pass — correct any <p> that lost its text-indent due to being
  // the "first paragraph" of a chapter (baked-in text-indent:0) but ended up on
  // a page other than the chapter-start page after fill/split operations.
  // Also fixes any non-continuation <p> at the start of a page that has indent:0.
  // Logging suppressed here (null): the reopt pass re-runs repair on the final
  // allPages at line ~356 and logs from there, avoiding duplicate INDENT REPAIR entries.
  repairMissingIndents(allPages, safeConfig, null);
  // Re-run fragment merge: repairMissingIndents may have re-added data-continuation
  // to lowercase-start paragraphs that lost it during global passes. Those fragments
  // can now be detected and merged by Pass 1 of mergeSplitFragments.
  mergeSplitFragments(allPages, log);

  // Tag last page of each chapter — suppresses fill-penalties in scoring
  // for pages that can never be filled further (chapter boundary constraint).
  tagChapterLastPages(allPages);

  // ╔══════════════════════════════════════════════════════════════════╗
  // ║  FASE 6 — GLOBAL REOPTIMIZATION PASS                           ║
  // ║  Corre en todos los entornos (dev y producción).               ║
  // ║                                                                  ║
  // ║  Identifica capítulos con páginas de score ≥ REOPT_SCORE_      ║
  // ║  THRESHOLD y los repagina con minOrphanLines=1. Solo acepta     ║
  // ║  el resultado si mejora ≥ 50 puntos sobre el original.         ║
  // ║                                                                  ║
  // ║  Costo: flattenChapterElements + greedyPaginate + 2x fillPass  ║
  // ║  por capítulo reoptimizado. En libros con 10+ capítulos malos  ║
  // ║  puede agregar 300-500ms. Subir threshold a 700-800 si lento.  ║
  // ╚══════════════════════════════════════════════════════════════════╝
  const REOPT_SCORE_THRESHOLD = 500; // Solo toca páginas genuinamente malas

  {
    // Identify chapters with problematic non-chapter-end pages
    const badChapters = new Set();
    for (const page of allPages) {
      if (page.isBlank || page.isTitleOnlyPage || page.isFirstChapterPage || !page.html) continue;
      // isChapterLastPage flag is set — skip these pages entirely since fill-based
      // badness is suppressed for them and they don't benefit from reoptimization.
      if (page.isChapterLastPage) continue;
      const q = evaluatePageQualityCanvas(page.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx);
      if (q.score >= REOPT_SCORE_THRESHOLD) {
        badChapters.add(page.chapterTitle);
      }
    }

    if (badChapters.size > 0) {
      // Relaxed layout context: minOrphanLines=1 lets the engine split more aggressively
      const relaxedLayoutCtx = { ...layoutCtx, minOrphanLines: 1, minWidowLines: 1 };

      for (const chapterTitle of badChapters) {
        const chapter = chapters.find(c => c.title === chapterTitle);
        if (!chapter) continue;

        // Score the current pages for this chapter (pass isChapterLastPage so scoring is consistent)
        const currentChapterPages = allPages.filter(p => p.chapterTitle === chapterTitle && !p.isBlank);
        const currentScore = currentChapterPages.reduce((sum, p) => {
          if (!p.html) return sum;
          return sum + evaluatePageQualityCanvas(p.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx, false, { isChapterLastPage: p.isChapterLastPage === true }).score;
        }, 0);

        // Run relaxed pagination for this chapter only
        const relaxedElements = flattenChapterElements(chapter, relaxedLayoutCtx, canvasCtx, measureDiv, safeConfig);
        const relaxedPages = greedyPaginate(relaxedElements, relaxedLayoutCtx, canvasCtx, measureDiv, safeConfig, chapter, log);

        // Apply fill-pass to the relaxed pages in isolation
        applyFillPass(relaxedPages, relaxedLayoutCtx, canvasCtx, measureDiv, safeConfig, log);
        fixHeadingsAtBottom(relaxedPages, canvasCtx, relaxedLayoutCtx, log);
        applyFillPass(relaxedPages, relaxedLayoutCtx, canvasCtx, measureDiv, safeConfig, log);
        cleanupNearlyEmptyPages(relaxedPages, relaxedLayoutCtx, canvasCtx);
        smoothPageBalance(relaxedPages, relaxedLayoutCtx, canvasCtx, log);
        mergeSplitFragments(relaxedPages, log);
        repairPageDefects(relaxedPages, relaxedLayoutCtx, canvasCtx, log);
        repairMissingIndents(relaxedPages, safeConfig, log);
        tagChapterLastPages(relaxedPages);

        // Score the relaxed result (consistent: same isChapterLastPage suppression)
        const relaxedScore = relaxedPages.filter(p => !p.isBlank && p.html).reduce((sum, p) => {
          return sum + evaluatePageQualityCanvas(p.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx, false, { isChapterLastPage: p.isChapterLastPage === true }).score;
        }, 0);

        // Accept only if meaningfully better (at least 50 points improvement)
        if (relaxedScore < currentScore - 50) {
          // Replace chapter pages in allPages with the relaxed version
          const firstIdx = allPages.findIndex(p => p.chapterTitle === chapterTitle);
          const lastIdx = allPages.reduce((last, p, i) => p.chapterTitle === chapterTitle ? i : last, -1);
          if (firstIdx >= 0 && lastIdx >= firstIdx) {
            allPages.splice(firstIdx, lastIdx - firstIdx + 1, ...relaxedPages);
            log.record('reopt', 'accepted', firstIdx + 1, {
              chapter: chapterTitle.substring(0, 40),
              before: { score: +currentScore.toFixed(0), pages: currentChapterPages.length },
              after: { score: +relaxedScore.toFixed(0), pages: relaxedPages.length }
            });
          }
        }
      }

      // Re-run parity and smoothing after reoptimization may have changed page counts
      if (badChapters.size > 0) {
        enforceChapterStartParity(allPages, safeConfig);
        smoothPageBalance(allPages, layoutCtx, canvasCtx, log);
        enforceChapterStartParity(allPages, safeConfig);
        mergeSplitFragments(allPages, log);
        repairPageDefects(allPages, layoutCtx, canvasCtx, log);
        repairMissingIndents(allPages, safeConfig, log);
        mergeSplitFragments(allPages, log);
        tagChapterLastPages(allPages);
        distributeVerticalSpace(allPages, layoutCtx, canvasCtx);
      }
    }
  }

  // E6 final pass: distribute vertical whitespace unconditionally AFTER all
  // structural mutations (including FASE 6 reoptimization which may have replaced
  // entire chapter slices). This ensures chapter-start pages always get margins
  // distributed regardless of whether the reopt branch ran.
  distributeVerticalSpace(allPages, layoutCtx, canvasCtx);

  // Re-number again after fill-pass may have emptied some pages.
  // Blank pages count toward the physical position but don't show a number —
  // this keeps the printed number in sync with the preview navigator (currentPage+1).
  let pageNum = 1;
  for (const p of allPages) {
    if (!p.isBlank) p.pageNumber = pageNum;
    pageNum++;
  }

  // DEV: parity check — every isFirstChapterPage must be on an odd physical position
  if (process.env.NODE_ENV === 'development') {
    for (let pi = 0; pi < allPages.length; pi++) {
      const page = allPages[pi];
      if (!page?.isFirstChapterPage) continue;
      const position = pi + 1; // 1-indexed
      if (position % 2 === 0) {
        log.record('parity', 'error', page.pageNumber || position, {
          note: 'chapter-on-left-page',
          index: pi, position,
          chapter: (page.chapterTitle || '').substring(0, 50)
        });
      }
    }
  }

  // DEV: log indent state of first 3 <p> on each chapter-start page — AFTER all passes.
  // Covers both layouts: isFirstChapterPage (spaced) and page-after-titleOnly (fullPage).
  if (process.env.NODE_ENV === 'development') {
    for (let pi = 0; pi < allPages.length; pi++) {
      const page = allPages[pi];
      if (page.isBlank || !page.html) continue;
      let prevNonBlank = null;
      for (let pj = pi - 1; pj >= 0; pj--) {
        if (!allPages[pj]?.isBlank) { prevNonBlank = allPages[pj]; break; }
      }
      const isChapterContent = page.isFirstChapterPage || prevNonBlank?.isTitleOnlyPage === true;
      if (!isChapterContent) continue;
      const blocks = getPageBlocks(page);
      const pBlocks = blocks.filter(b => (b.tag || '').toUpperCase() === 'P').slice(0, 3);
      pBlocks.forEach((b, bi) => {
        const styleStr = b.style || b.outerHtml?.match(/style="([^"]*)"/)?.[1] || '';
        const indentM = styleStr.match(/text-indent\s*:\s*([^;}"]+)/i);
        const isCont = b.dataset?.continuation === 'true';
        const isSplitHead = b.dataset?.splitHead === 'true';
        const isFirstP = b.dataset?.firstParagraph === 'true';
        log.record('greedy', 'diag', page.pageNumber, {
          note: 'post-repair-indent',
          pIdx: bi,
          indent: indentM?.[1] ?? '(none)',
          isCont,
          isSplitHead,
          isFirstP,
          isFirstChapterPage: !!page.isFirstChapterPage,
          text: (b.textContent || '').trim().substring(0, 60)
        });
      });
    }
  }

  // Generate structured summary via logger
  log.generateSummary(allPages, evaluatePageQualityCanvas, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx);

  // Build per-chapter page slices using the ranges recorded before global passes.
  // Global passes (fill-pass, smoothPageBalance) may move pages between chapters,
  // but the greedy-pass output per chapter is what matters for cache validity on the
  // next run — since global passes will always re-run on all pages.
  const chapterPageSlices = chapterPageRanges.map(({ start, end }) =>
    allPages.slice(start, end)
  );

  // Log scoring cache stats (dev only)
  if (process.env.NODE_ENV === 'development') {
    const total = _evalCacheHits + _evalCacheMisses;
    const hitRate = total > 0 ? ((_evalCacheHits / total) * 100).toFixed(1) : '0.0';
    console.log(`[EVAL-CACHE] ${_evalCacheHits} hits / ${_evalCacheMisses} misses (${hitRate}% hit rate, ${_evalCache.size} entries)`);
  }

  return {
    pages: allPages,
    log: log.getLog(),
    summaryText: log.formatSummaryText(),
    chapterHashes,
    chapterPageSlices
  };
};

/**
 * Convert a chapter into a flat list of pre-measured elements.
 * Uses Canvas-based measurement (deterministic).
 *
 * @private
 */
const flattenChapterElements = (chapter, layoutCtx, canvasCtx, measureDiv, safeConfig) => {
  const { baseFontSize, baseLineHeight, textAlign, lineHeightPx, contentHeight } = layoutCtx;
  const elements = [];
  const chapterId = `ch_${(chapter.title || 'unknown').substring(0, 20).replace(/\s+/g, '_')}`;

  // Chapter title
  const { titleHtml, ctConfig } = buildChapterTitleHtml(
    chapter, safeConfig, baseFontSize, lineHeightPx, contentHeight
  );
  const titleHeight = measureHtmlHeight(titleHtml, canvasCtx);
  elements.push({
    html: titleHtml,
    height: titleHeight,
    isTitle: true,
    titleLayout: ctConfig.layout || 'continuous',
    tag: 'TITLE',
    textContent: ''
  });
  assignBlockId(elements[elements.length - 1], chapterId, 0);

  // Content elements — Worker-safe: use string-based parser instead of DOM
  // isFirstParagraph is derived from the UNFILTERED position so that an empty
  // first paragraph doesn't cause the second paragraph to lose its indent.
  const allChildren = parseHtmlElements(chapter.html || '');
  let firstParagraphIdx = -1;
  for (let ci = 0; ci < allChildren.length; ci++) {
    if (allChildren[ci].tag === 'P' || allChildren[ci].tag === 'DIV') {
      firstParagraphIdx = ci;
      break;
    }
  }
  const children = allChildren.filter(
    el => el.textContent.trim() || el.tag === 'HR'
  );

  let paragraphCount = 0;
  for (const el of children) {
    const originalIdx = allChildren.indexOf(el);
    const isFirstParagraph = originalIdx === firstParagraphIdx;
    if (el.tag === 'P' || el.tag === 'DIV') paragraphCount++;

    const html = buildParagraphHtml(
      el, safeConfig, baseFontSize, baseLineHeight, textAlign, isFirstParagraph
    );
    const height = measureHtmlHeight(html, canvasCtx);

    // Detect bold from the ORIGINAL element (before buildParagraphHtml strips it).
    // A paragraph is "bold" (subtitle-like) only if ALL or nearly all text is bold.
    let origIsBold = false;
    if (el.tag === 'P') {
      if (/font-weight:\s*(?:bold|[7-9]00)/.test(el.style || '')) {
        origIsBold = true;
      } else if (/^<p[^>]*>\s*<(?:strong|b)\b/i.test(el.outerHtml)) {
        const { boldLen, totalLen } = getBoldTextRatio(el.outerHtml);
        origIsBold = totalLen > 0 && (boldLen / totalLen) >= 0.8;
      }
    }

    elements.push({
      html,
      height,
      isTitle: false,
      tag: el.tag,
      textContent: el.textContent || '',
      isBold: origIsBold
    });
    assignBlockId(elements[elements.length - 1], chapterId, elements.length - 1);
  }

  return elements;
};

/**
 * Detect subtitle-like bold paragraphs.
 * Treat as "bold paragraph" only when most of the text is actually bold.
 *
 * @private
 */
// Accepts both DOM elements and descriptor objects { tag, style, outerHtml, textContent }
const isMostlyBoldParagraph = (el) => {
  if (!el) return false;
  const tag = (el.tagName || el.tag || '').toUpperCase();
  if (tag !== 'P') return false;

  const style = typeof el.getAttribute === 'function' ? (el.getAttribute('style') || '') : (el.style || '');
  if (/font-weight:\s*(?:bold|[7-9]00)/.test(style)) return true;

  const outer = el.outerHTML || el.outerHtml || '';
  if (/^<p[^>]*>\s*<(?:strong|b)\b/i.test(outer)) {
    const { boldLen, totalLen } = getBoldTextRatio(outer);
    return totalLen > 0 && (boldLen / totalLen) >= 0.8;
  }

  return false;
};

/**
 * Compute last-line metrics for a paragraph using the same wrapping model as pagination.
 *
 * @private
 */
const getLastLineMetrics = (plainText, canvasCtx) => {
  const text = (plainText || '').trim();
  if (!text) {
    return {
      lastLineWords: 0,
      lineStarts: [0],
      words: [],
      lastLineText: '',
      widthRatio: 1,
      shortLineScore: 0
    };
  }

  const fontStr = buildFontString(canvasCtx.baseFontSizePx, canvasCtx.fontFamily);
  const effectiveWidth = canvasCtx.contentWidth - (canvasCtx.widthSlack || 0);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  // Use KP-optimal line breaks (consistent with measureHtmlHeight), greedy fallback
  const kpResult = getLineBreakPositionsKP(text, effectiveWidth, fontStr);
  const lineStarts = kpResult ? kpResult.lineStarts : getLineBreakPositions(text, effectiveWidth, fontStr);
  const lastStart = (lineStarts && lineStarts.length > 0)
    ? lineStarts[lineStarts.length - 1]
    : 0;
  const lastLineWords = Math.max(0, words.length - lastStart);
  const lastLineText = words.slice(lastStart).join(' ');

  let widthRatio = 1;
  if (lastLineText && effectiveWidth > 0) {
    const ctx2d = getCanvasCtx2d();
    if (ctx2d) {
      ctx2d.font = fontStr;
      widthRatio = ctx2d.measureText(lastLineText).width / effectiveWidth;
    }
  }

  let shortLineScore = 0;
  if (lastLineWords === 1)      shortLineScore += 1400;
  else if (lastLineWords === 2) shortLineScore += 900;
  else if (lastLineWords === 3) shortLineScore += 400;
  else if (lastLineWords === 4) shortLineScore += 100;
  if (lastLineWords > 0 && widthRatio < 0.55) shortLineScore += 600;

  return {
    lastLineWords,
    lineStarts,
    words,
    lastLineText,
    widthRatio,
    shortLineScore
  };
};

/**
 * Shared runt-line penalty table.
 * Single source of truth for both the soft scoring path (scoreCandidate,
 * evaluatePageQualityCanvas) and the hard guard path (isSevereShortLastLine).
 *
 * Returns a raw penalty weight (0 = no penalty). Callers multiply by their own
 * scale factor (fs, delta bias, etc.) before adding to their total score.
 * The hard gate uses RUNT_HARD_PENALTY_THRESHOLD to derive a binary decision
 * from the same table — see isSevereShortLastLine below.
 *
 * Thresholds tuned for Spanish (many short words):
 *   - widthRatio < 0.55 catches "y en la fe" (4 short words, ~30% width)
 *   - 1-word = worst (2000), 4-word = mild (100–700)
 *
 * @param {number} lastLineWords  — number of words on the last line
 * @param {number} widthRatio     — last line width / effective content width (0–1)
 * @returns {number} raw penalty (0 if no runt)
 * @private
 */
const computeRuntLinePenalty = (lastLineWords, widthRatio) => {
  if (lastLineWords <= 0) return 0;
  let penalty = 0;
  if      (lastLineWords === 1) penalty += 1400;
  else if (lastLineWords === 2) penalty +=  900;
  else if (lastLineWords === 3) penalty +=  400;
  else if (lastLineWords === 4) penalty +=  100;
  if (lastLineWords > 0 && widthRatio < 0.55) penalty += 600;
  return penalty;
};

/**
 * Binary gate for layout mutations (smooth pass, fill-pass guards).
 * Returns true when computeRuntLinePenalty reaches RUNT_HARD_PENALTY_THRESHOLD —
 * the same severity table drives both the soft score and this hard reject,
 * so the two paths can never disagree on which runts are "serious".
 *
 * @private
 */
const isSevereShortLastLine = (metrics) => {
  if (!metrics || metrics.lastLineWords <= 0) return false;
  return computeRuntLinePenalty(metrics.lastLineWords, metrics.widthRatio ?? 1) >= RUNT_HARD_PENALTY_THRESHOLD;
};

/**
 * Compute full per-line metrics for a single paragraph's plain text.
 * Single source of truth used by evaluatePageQualityCanvas AND the logger.
 * Worker-safe — Canvas only, no DOM.
 *
 * @param {string}  plainText       - Collapsed plain text (no HTML tags)
 * @param {object}  canvasCtx       - { baseFontSizePx, fontFamily, contentWidth, widthSlack }
 * @param {boolean} isContinuation  - true if <p data-continuation="true">
 * @param {boolean} isLastOnPage    - true if this is the last element on the page
 * @returns {{ lineCount, lastLineWords, lastLineWidthRatio, interiorShortLines,
 *             isOrphan, isWidow, isRunt, lineStarts, words }}
 */
const computeParaLineMetrics = (plainText, canvasCtx, isContinuation = false, isLastOnPage = false) => {
  const text = (plainText || '').trim();
  if (!text || !canvasCtx) {
    return { lineCount: 0, lastLineWords: 0, lastLineWidthRatio: 1,
             interiorShortLines: 0, isOrphan: false, isWidow: false,
             isRunt: false, lineStarts: [0], words: [] };
  }

  const fontStr = buildFontString(canvasCtx.baseFontSizePx, canvasCtx.fontFamily);
  const effectiveWidth = canvasCtx.contentWidth - (canvasCtx.widthSlack || 0);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  // Use KP-optimal line breaks (consistent with measureHtmlHeight), greedy fallback
  const kpResult = getLineBreakPositionsKP(text, effectiveWidth, fontStr);
  const lineStarts = kpResult ? kpResult.lineStarts : getLineBreakPositions(text, effectiveWidth, fontStr);
  const lineCount = lineStarts.length;

  // Last line metrics (same logic as getLastLineMetrics)
  const lastStart = lineStarts[lineCount - 1] ?? 0;
  const lastLineWords = Math.max(0, words.length - lastStart);
  const lastLineText = words.slice(lastStart).join(' ');
  let lastLineWidthRatio = 1;
  if (lastLineText && effectiveWidth > 0) {
    const ctx2d = getCanvasCtx2d();
    if (ctx2d) {
      ctx2d.font = fontStr;
      lastLineWidthRatio = ctx2d.measureText(lastLineText).width / effectiveWidth;
    }
  }

  // Interior short lines: non-last lines with 1 word, or 2 words at < 30% width.
  // Only for continuation fragments — whole-paragraph short lines are authorial.
  let interiorShortLines = 0;
  if (isContinuation && lineCount >= 3) {
    const ctx2d = getCanvasCtx2d();
    for (let li = 0; li < lineCount - 1; li++) {
      const start = lineStarts[li];
      const end = li + 1 < lineCount ? lineStarts[li + 1] : words.length;
      const lineWordCount = end - start;
      if (lineWordCount === 1) {
        interiorShortLines++;
      } else if (lineWordCount === 2 && ctx2d && effectiveWidth > 0) {
        ctx2d.font = fontStr;
        const lineText = words.slice(start, end).join(' ');
        const ratio = ctx2d.measureText(lineText).width / effectiveWidth;
        if (ratio < 0.30) interiorShortLines++;
      }
    }
  }

  return {
    lineCount,
    lastLineWords,
    lastLineWidthRatio,
    interiorShortLines,
    isOrphan: isContinuation && lineCount <= 1,
    isWidow:  isLastOnPage && lineCount <= 1,
    isRunt:   lastLineWords <= 2 && lastLineWidthRatio < 0.35,
    lineStarts,
    words
  };
};

/**
 * Return the number of words on the last line of a chunk's plain text.
 * Used after split candidate selection to detect runt last lines.
 * @private
 */
const getChunkLastLineWords = (chunkHtml, canvasCtx) => {
  if (!chunkHtml) return 0;
  const el = getFirstElement(chunkHtml);
  if (!el) return 0;
  const text = (el.textContent || '').trim();
  if (!text) return 0;
  const metrics = getLastLineMetrics(text, canvasCtx);
  return metrics.lastLineWords;
};


/**
 * Score a split candidate. Lower = better.
 * Considers: last-line word count, visual width, underfill, rest-chunk widow
 * risk, mini next-page lookahead, paragraph continuity, and delta stability.
 *
 * @param {string} firstChunkHtml  - HTML fitting on current page
 * @param {string|null} restChunkHtml  - HTML continuing to next page(s)
 * @param {string} fullParaHtml    - Complete paragraph before any split
 * @param {number} remainingPx     - Available space on current page
 * @param {number} contentHeight   - Full page content height
 * @param {object} canvasCtx       - Layout context { baseFontSizePx, baseLineHeight, contentWidth, fontFamily }
 * @param {number} [delta=0]       - 0 / -1 / -2 lines relative to default split
 * @returns {number} score (lower = better)
 * @private
 */
const scoreCandidate = (firstChunkHtml, restChunkHtml, fullParaHtml, remainingPx, contentHeight, canvasCtx, delta = 0) => {
  const plainText = htmlToText(firstChunkHtml).trim();
  const fontStr = buildFontString(canvasCtx.baseFontSizePx, canvasCtx.fontFamily);
  // Use the same effective width as measureHtmlHeight: contentWidth minus widthSlack.
  // splitParagraphByLines wraps at (contentWidth - widthSlack); using full contentWidth
  // here would undercount line breaks and make lastLineWords appear larger than reality.
  const effectiveWidth = canvasCtx.contentWidth - (canvasCtx.widthSlack || 0);
  // Use KP-optimal line breaks when available — this aligns scoring with measureHtmlHeight
  // which also uses KP internally (via countLinesKP). Greedy fallback for edge cases
  // where KP returns null (long words, single-word lines, etc.).
  const kpResult = getLineBreakPositionsKP(plainText, effectiveWidth, fontStr);
  const lineStarts = kpResult ? kpResult.lineStarts : getLineBreakPositions(plainText, effectiveWidth, fontStr);
  const words = plainText.split(/\s+/).filter(w => w.length > 0);

  // 1. Word count on last line (guard against empty lineStarts)
  const lastStart = (lineStarts && lineStarts.length > 0)
    ? lineStarts[lineStarts.length - 1]
    : 0;
  const lastLineWords = Math.max(0, words.length - lastStart);

  let score = 0;

  // 1. Runt last-line penalty — shared table with evaluatePageQualityCanvas.
  // widthRatio computed here so computeRuntLinePenalty gets an accurate value.
  let widthRatioForRunt = 1;
  if (lastLineWords > 0 && effectiveWidth > 0) {
    const ctx2d = getCanvasCtx2d();
    if (ctx2d) {
      ctx2d.font = fontStr;
      const lastLineText = words.slice(lastStart).join(' ');
      widthRatioForRunt = ctx2d.measureText(lastLineText).width / effectiveWidth;
    }
  }
  score += computeRuntLinePenalty(lastLineWords, widthRatioForRunt);

  // 2. Underfill penalty — 1 line short ≈ 4% underfill ≈ 12 pts on typical page.
  // Keep this LOW so it never outweighs a genuine last-line improvement.
  const chunkH = measureHtmlHeight(firstChunkHtml, canvasCtx);
  const fill = remainingPx > 0 ? chunkH / remainingPx : 1;
  score += Math.max(0, 1 - fill) * 300;

  // 3. Hyphenation quality scoring.
  // Professional typesetting limits consecutive hyphenated lines to 2 max.
  // Penalise:
  //   - 3+ consecutive hyphenated lines: +150 per extra line beyond 2
  //   - hyphen on the very last line of the chunk: +300
  //     (reader turns the page unsure if the word continues — very disruptive)
  // Only computed when there are enough lines to matter (≥3 lines in chunk).
  if (lineStarts.length >= 3 && plainText.length > 0) {
    const hyphenMetrics = countHyphenationMetrics(plainText, effectiveWidth, fontStr);
    if (hyphenMetrics.maxConsecutive >= 3) {
      score += (hyphenMetrics.maxConsecutive - 2) * 150;
    }
    if (hyphenMetrics.lastLineHyphen) {
      score += 300;
    }
  }

  // 4. Paragraph shape scoring (line-width variance).
  // A paragraph where line widths vary wildly looks jagged and unprofessional.
  // Measure the width of each line and penalise high standard deviation.
  // Only applies to multi-line chunks (≥3 lines) — single-line splits have no shape.
  // stdDev > 25% of line width triggers a proportional penalty.
  // Uses lineStarts from KP/greedy (already computed above).
  if (lineStarts.length >= 3 && words.length > 0) {
    const ctx2d2 = getCanvasCtx2d();
    const lineWidths = [];
    if (ctx2d2) {
      ctx2d2.font = fontStr;
      for (let li = 0; li < lineStarts.length; li++) {
        const start = lineStarts[li];
        const end = li < lineStarts.length - 1 ? lineStarts[li + 1] : words.length;
        const lineText = words.slice(start, end).join(' ');
        lineWidths.push(ctx2d2.measureText(lineText).width);
      }
    }
    // Exclude the last line — its short length is intentional (paragraph end)
    const measuredLines = lineWidths.slice(0, -1);
    if (measuredLines.length >= 2) {
      const avg = measuredLines.reduce((a, b) => a + b, 0) / measuredLines.length;
      const variance = measuredLines.reduce((acc, w) => acc + Math.pow(w - avg, 2), 0) / measuredLines.length;
      const stdDev = Math.sqrt(variance);
      const cvRatio = stdDev / (effectiveWidth || 1); // coefficient of variation
      // Penalise only when variance is notable (>20% of line width)
      if (cvRatio > 0.20) {
        score += Math.round(cvRatio * 200); // max ~+160 at cvRatio=0.8
      }
    }
  }

  // 5. Stability bias — strong preference for delta=0 when last line is already OK.
  // This prevents delta=-1 from being chosen unless there's a real quality gain.
  if (delta === 0) score -= 200;

  return score;
};

/**
 * Restore text-indent on a moved <p> element when it lost its indent because
 * it was the `rest` chunk of a prior split (text-indent:0 baked in) but is now
 * being placed as a standalone paragraph on a new page.
 *
 * Only applies when ALL conditions hold:
 *   1. The element is a <p>
 *   2. It has text-indent:0 (or no text-indent)
 *   3. It does NOT have data-continuation="true"
 *   4. Its first alphabetic character is uppercase (i.e. not a mid-sentence rest)
 *
 * @param {string} elHtml - Outer HTML of the element to fix
 * @param {number} indentEm  - Target indent in em (from safeConfig)
 * @returns {string} Fixed HTML (or original if no fix needed)
 */
const restoreIndentIfNeeded = (elHtml, indentEm) => {
  if (!/^<p[\s>]/i.test(elHtml)) return elHtml;   // not a <p>
  if (/data-continuation\s*=\s*["']true["']/i.test(elHtml)) return elHtml; // is continuation
  // Check current indent
  const styleM = elHtml.match(/\bstyle\s*=\s*["']([^"']*)["']/i);
  const styleStr = styleM ? styleM[1] : '';
  const indentM = styleStr.match(/text-indent\s*:\s*([^;]+)/i);
  const indentVal = indentM ? parseFloat(indentM[1]) : null;
  const hasZeroIndent = indentVal === null || indentVal === 0;
  if (!hasZeroIndent) return elHtml;  // already has indent
  // Check first alphabetic character
  const plainText = elHtml.replace(/<[^>]*>/g, '').trim();
  const firstLetter = plainText.match(/\p{L}/u)?.[0] || '';
  const startsUpper = firstLetter !== '' && firstLetter === firstLetter.toUpperCase() && firstLetter !== firstLetter.toLowerCase();
  if (!startsUpper) return elHtml;  // lowercase start — likely a split-rest, leave as-is
  // Restore indent
  const targetIndent = `${indentEm}em`;
  if (indentM) {
    return elHtml.replace(/\bstyle\s*=\s*"([^"]*)"/, (_, s) =>
      `style="${s.replace(/text-indent\s*:[^;]+;?/i, `text-indent:${targetIndent};`)}"`
    );
  }
  // No style attribute or no text-indent in style — inject into existing style
  return elHtml.replace(/\bstyle\s*=\s*"([^"]*)"/, (_, s) =>
    `style="${s}text-indent:${targetIndent};"`
  );
};

/**
 * Split an element into exactly 2 parts.
 * Still uses splitParagraphByLines from paginationEngine which needs measureDiv
 * for HTML DOM manipulation (not for height measurement).
 *
 * @private
 */
const splitInTwo = (
  elHtml, measureDiv, canvasCtx, remainingSpace, contentHeight,
  textAlign, hasIndent, indentValue, preserveIndent, quoteOptions
) => {
  const lineHeightPx = canvasCtx.lineHeightPx
    || Math.ceil(canvasCtx.baseFontSizePx * canvasCtx.baseLineHeight);

  // Safety buffer for inline bold/italic: Canvas.measureText can underestimate
  // word widths for styled runs, causing the browser to wrap into more lines
  // than Canvas predicted. Reserve 1 extra line when inline styles are present —
  // but only if it leaves at least 1 full line of space. If subtracting would
  // leave < lineHeightPx, skip the buffer so the split attempt proceeds and the
  // split-overfit check (caller) handles any actual overflow.
  const hasInlineStyles = /<(?:strong|b|em|i)\b/i.test(elHtml);
  const buffered = hasInlineStyles ? remainingSpace - lineHeightPx : remainingSpace;
  const safeRemainingSpace = buffered >= lineHeightPx ? buffered : remainingSpace;

  const fullPageSplit = splitParagraphByLines(
    elHtml, measureDiv, contentHeight,
    textAlign, hasIndent, indentValue, preserveIndent, quoteOptions
  );

  if (fullPageSplit.length >= 2) {
    const pageChunk = fullPageSplit[0];

    // Merge ALL chunks after index 0 into one continuation.
    const restChunk = fullPageSplit.slice(1).reduce((acc, chunk) => mergeIntoOne(acc, chunk));

    const fitSplit = splitParagraphByLines(
      pageChunk, measureDiv, safeRemainingSpace,
      textAlign, hasIndent, indentValue, preserveIndent, quoteOptions
    );

    const baseFirst = fitSplit[0];
    if (fitSplit.length < 2) {
      return [baseFirst, restChunk];
    }

    let bestFirst = baseFirst;
    let bestRest  = mergeIntoOne(
      fitSplit.slice(1).reduce((a, b) => mergeIntoOne(a, b)),
      restChunk
    );
    let bestScore = scoreCandidate(baseFirst, bestRest, pageChunk, safeRemainingSpace, contentHeight, canvasCtx, 0);

    // Try delta=-1: only chosen when it produces a measurably better last line.
    const adjMax = safeRemainingSpace - lineHeightPx;
    if (adjMax >= lineHeightPx) {
      const cand = splitParagraphByLines(
        pageChunk, measureDiv, adjMax,
        textAlign, hasIndent, indentValue, preserveIndent, quoteOptions
      );
      if (cand && cand.length >= 1) {
        const leftover = cand.length >= 2
          ? cand.slice(1).reduce((a, b) => mergeIntoOne(a, b))
          : null;
        const candRest = leftover ? mergeIntoOne(leftover, restChunk) : restChunk;
        const score = scoreCandidate(cand[0], candRest, pageChunk, safeRemainingSpace, contentHeight, canvasCtx, -1);
        if (score < bestScore) { bestFirst = cand[0]; bestRest = candRest; bestScore = score; }
      }
    }

    // Try delta=-2: unconditionally override when winner still ends with 1-2 words (runt).
    // The fill-pass can recover a 2-line gap; a visible runt is worse editorially.
    const bestLastLineWords = getChunkLastLineWords(bestFirst, canvasCtx);
    if (bestLastLineWords <= 2) {
      const adjMax2 = safeRemainingSpace - 2 * lineHeightPx;
      if (adjMax2 >= lineHeightPx) {
        const cand2 = splitParagraphByLines(
          pageChunk, measureDiv, adjMax2,
          textAlign, hasIndent, indentValue, preserveIndent, quoteOptions
        );
        if (cand2 && cand2.length >= 1) {
          const leftover2 = cand2.length >= 2
            ? cand2.slice(1).reduce((a, b) => mergeIntoOne(a, b))
            : null;
          const candRest2 = leftover2 ? mergeIntoOne(leftover2, restChunk) : restChunk;
          const newWords = getChunkLastLineWords(cand2[0], canvasCtx);
          // Only accept if this actually fixes the runt (avoids making it worse)
          if (newWords > bestLastLineWords) { bestFirst = cand2[0]; bestRest = candRest2; }
        }
      }
    }

    return [bestFirst, bestRest];
  }

  // The element fits in safeRemainingSpace when measured alone by Canvas, but
  // measure(currentHtml + elHtml) can overflow because <p> margin-top between
  // adjacent elements is not captured by Canvas.measureText.
  // Reserve 1 extra line as inter-element margin buffer and snap to a whole-line
  // multiple so splitParagraphByLines gets a clean budget it can actually satisfy.
  const marginBuffer = lineHeightPx; // 1 line for inter-element margin
  const adjustedSpace = safeRemainingSpace - marginBuffer;
  const snappedSpace = Math.floor(adjustedSpace / lineHeightPx) * lineHeightPx;
  const splitBudget = snappedSpace >= lineHeightPx ? snappedSpace : safeRemainingSpace;

  const directSplit = splitParagraphByLines(
    elHtml, measureDiv, splitBudget,
    textAlign, hasIndent, indentValue, preserveIndent, quoteOptions
  );

  if (directSplit.length < 2) return null;

  let bestFirst = directSplit[0];
  let bestRest  = directSplit.slice(1).reduce((acc, chunk) => mergeIntoOne(acc, chunk));
  let bestScore = scoreCandidate(bestFirst, bestRest, elHtml, splitBudget, contentHeight, canvasCtx, 0);

  const adjMax = splitBudget - lineHeightPx;
  if (adjMax >= lineHeightPx) {
    const cand = splitParagraphByLines(
      elHtml, measureDiv, adjMax,
      textAlign, hasIndent, indentValue, preserveIndent, quoteOptions
    );
    if (cand && cand.length >= 2) {
      const candRest = cand.slice(1).reduce((a, b) => mergeIntoOne(a, b));
      const score = scoreCandidate(cand[0], candRest, elHtml, splitBudget, contentHeight, canvasCtx, -1);
      if (score < bestScore) { bestFirst = cand[0]; bestRest = candRest; bestScore = score; }
    }
  }

  // Try delta=-2: unconditionally override when winner still ends with 1-2 words (runt).
  const bestLastLineWords = getChunkLastLineWords(bestFirst, canvasCtx);
  if (bestLastLineWords <= 2) {
    const adjMax2 = splitBudget - 2 * lineHeightPx;
    if (adjMax2 >= lineHeightPx) {
      const cand2 = splitParagraphByLines(
        elHtml, measureDiv, adjMax2,
        textAlign, hasIndent, indentValue, preserveIndent, quoteOptions
      );
      if (cand2 && cand2.length >= 2) {
        const newWords = getChunkLastLineWords(cand2[0], canvasCtx);
        if (newWords > bestLastLineWords) {
          bestFirst = cand2[0];
          bestRest = cand2.slice(1).reduce((a, b) => mergeIntoOne(a, b));
        }
      }
    }
  }

  return [bestFirst, bestRest];
};

/**
 * Merge two HTML fragments into one element.
 * @private
 */
const mergeIntoOne = (htmlA, htmlB) => {
  try {
    const elA = getFirstElement(htmlA);
    const elB = getFirstElement(htmlB);

    if (elA && elB) {
      const mergedInner = elA.innerHTML + ' ' + elB.innerHTML;
      // Always use text-align-last:left — "justify" stretches the last visible line
      // of a fragment, making it appear wider than other paragraphs on the page.
      const styleStr = (elA.style || '')
        .replace(/text-align-last:[^;]+;?/gi, '')
        + `text-align-last:left;`;
      const tag = elA.tag.toLowerCase();
      const openTag = elA.outerHtml.match(/^<[^>]+>/)?.[0] || `<${tag}>`;
      const newOpenTag = openTag.replace(/\bstyle="[^"]*"/, `style="${styleStr}"`)
        || openTag.replace(`<${tag}`, `<${tag} style="${styleStr}"`);
      return `${newOpenTag}${mergedInner}</${tag}>`;
    }
  } catch (e) {
    // fallback
  }
  return htmlA + htmlB;
};

// ─────────────────────────────────────────────────────────────────────────────
// BREAKPOINT-BASED PAGE FILLING — TeX-simplified approach
// Instead of greedily adding elements until overflow, collect ALL valid
// breakpoints for each page and pick the one with lowest penalty.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Collect all valid breakpoints for a page being built.
 * A breakpoint is a place where the page could end — either after a complete
 * block element, or at a KP line boundary inside a splittable paragraph.
 *
 * @param {Array} elements   - flattened chapter elements
 * @param {number} startIdx  - first element index to consider
 * @param {string} baseHtml  - HTML already committed to this page (title, prior elements)
 * @param {number} budget    - max height for this page
 * @param {object} canvasCtx - Canvas layout context
 * @param {object} layoutCtx - full layout context (lineHeightPx, minOrphanLines, etc.)
 * @param {object} measureDiv - for splitParagraphByLines
 * @param {object} safeConfig - paragraph config
 * @param {object} log       - pagination logger
 * @returns {Array} breakpoint candidates sorted by elementIndex
 * @private
 */
const collectBreakpoints = (elements, startIdx, baseHtml, budget, canvasCtx, layoutCtx, measureDiv, safeConfig, log) => {
  const { lineHeightPx, minOrphanLines, splitLongParagraphs, textAlign } = layoutCtx;
  const measure = (html) => measureHtmlHeight(html, canvasCtx);
  const candidates = [];
  let accumulated = baseHtml || '';
  let accHeight = accumulated ? measure(accumulated) : 0;
  const chapterTitle = elements[startIdx]?.chapterTitle;

  for (let i = startIdx; i < elements.length; i++) {
    const el = elements[i];
    // Stay within the same chapter
    if (el.chapterTitle !== chapterTitle) break;
    // Skip titles — handled separately before breakpoint collection
    if (el.isTitle) break;

    const withEl = accumulated + el.html;
    const withElH = measure(withEl);

    // A. Element fits entirely → breakpoint after this complete block
    if (withElH <= budget) {
      const isHeading = /^H[1-6]$/i.test(el.tag);
      const isBold = !isHeading && el.tag === 'P' && el.isBold;

      candidates.push({
        type: 'block-end',
        elementIndex: i,
        html: withEl,
        height: withElH,
        restHtml: null,
        isHeadingOrBold: isHeading || isBold,
        isLastChapterElement: i === elements.length - 1,
        orphanLines: 0,
        widowLines: 0,
        splitLine: 0,
        totalLines: 0,
      });

      // C. SPECULATIVE SPLIT: if this block-end leaves 2+ unused lines AND the
      // next element is a splittable paragraph, try pulling 1-2 lines from it
      // onto this page. This breaks the 87%/96% quantization pattern.
      const specRemainingSpace = budget - withElH;
      const specRemainingLines = Math.floor(specRemainingSpace / lineHeightPx);
      const nextEl = i + 1 < elements.length ? elements[i + 1] : null;
      const nextCanSplit = nextEl
        && splitLongParagraphs
        && !nextEl.isTitle
        && nextEl.chapterTitle === chapterTitle
        && (nextEl.tag === 'P' || nextEl.tag === 'DIV' || nextEl.tag === 'BLOCKQUOTE')
        && !nextEl.isBold
        && specRemainingLines >= 2; // need at least 2 lines to avoid orphan

      if (nextCanSplit) {
        const specHasIndent = nextEl.tag === 'P';
        const specIndentValue = safeConfig.paragraph?.firstLineIndent || 1.5;
        const specPreserveIndent = /text-indent:\s*0[^.]/.test(nextEl.html);

        const specSplit = splitParagraphByLines(
          nextEl.html, measureDiv, specRemainingSpace,
          textAlign, specHasIndent, specIndentValue, specPreserveIndent, canvasCtx
        );

        if (specSplit && specSplit.length >= 2) {
          const specFirst = specSplit[0];
          const specRest = specSplit.slice(1).reduce((a, b) => mergeIntoOne(a, b));
          const specH = measure(withEl + specFirst);
          const specOrphan = Math.max(1, Math.floor(measure(specFirst) / lineHeightPx));
          const specWidow = Math.max(1, Math.floor(measure(specRest) / lineHeightPx));

          if (specH <= budget
              && specOrphan >= (minOrphanLines || 2)
              && specWidow >= (minOrphanLines || 2) + 1) {
            candidates.push({
              type: 'para-split',
              elementIndex: i + 1,
              html: withEl + specFirst,
              height: specH,
              restHtml: specRest,
              isHeadingOrBold: false,
              isLastChapterElement: (i + 1) === elements.length - 1,
              orphanLines: specOrphan,
              widowLines: specWidow,
              splitLine: specOrphan,
              totalLines: specOrphan + specWidow,
            });
          }
        }
      }

      accumulated = withEl;
      accHeight = withElH;
      continue;
    }

    // B. Element doesn't fit — try split breakpoints inside it
    const canSplit = splitLongParagraphs
      && (el.tag === 'P' || el.tag === 'DIV' || el.tag === 'BLOCKQUOTE')
      && !el.isBold;

    if (canSplit) {
      const remainingSpace = budget - accHeight;
      if (remainingSpace < lineHeightPx) break; // no room for even 1 line

      const hasIndent = el.tag === 'P';
      const indentValue = safeConfig.paragraph?.firstLineIndent || 1.5;
      const preserveIndent = /text-indent:\s*0[^.]/.test(el.html);

      // Use splitParagraphByLines for a full-page split first
      const fullPageSplit = splitParagraphByLines(
        el.html, measureDiv, budget - accHeight,
        textAlign, hasIndent, indentValue, preserveIndent, canvasCtx
      );

      if (fullPageSplit && fullPageSplit.length >= 2) {
        const defaultFirst = fullPageSplit[0];
        const defaultRest = fullPageSplit.slice(1).reduce((a, b) => mergeIntoOne(a, b));
        const defaultFirstH = measure(accumulated + defaultFirst);
        const defaultOrphan = Math.max(1, Math.floor(measure(defaultFirst) / lineHeightPx));
        const defaultWidow = Math.max(1, Math.floor(measure(defaultRest) / lineHeightPx));

        // Candidate at default split (delta=0)
        if (defaultFirstH <= budget && defaultOrphan >= (minOrphanLines || 2)) {
          candidates.push({
            type: 'para-split',
            elementIndex: i,
            html: accumulated + defaultFirst,
            height: defaultFirstH,
            restHtml: defaultRest,
            isHeadingOrBold: false,
            isLastChapterElement: i === elements.length - 1,
            orphanLines: defaultOrphan,
            widowLines: defaultWidow,
            splitLine: defaultOrphan,
            totalLines: defaultOrphan + defaultWidow,
          });
        }

        // Try delta=-1: one fewer line on this page
        const adjMax1 = remainingSpace - lineHeightPx;
        if (adjMax1 >= lineHeightPx * 2) {
          const cand1 = splitParagraphByLines(
            el.html, measureDiv, adjMax1,
            textAlign, hasIndent, indentValue, preserveIndent, canvasCtx
          );
          if (cand1 && cand1.length >= 2) {
            const c1First = cand1[0];
            const c1Rest = cand1.slice(1).reduce((a, b) => mergeIntoOne(a, b));
            const c1H = measure(accumulated + c1First);
            const c1Orphan = Math.max(1, Math.floor(measure(c1First) / lineHeightPx));
            const c1Widow = Math.max(1, Math.floor(measure(c1Rest) / lineHeightPx));
            if (c1H <= budget && c1Orphan >= (minOrphanLines || 2)) {
              candidates.push({
                type: 'para-split',
                elementIndex: i,
                html: accumulated + c1First,
                height: c1H,
                restHtml: c1Rest,
                isHeadingOrBold: false,
                isLastChapterElement: i === elements.length - 1,
                orphanLines: c1Orphan,
                widowLines: c1Widow,
                splitLine: c1Orphan,
                totalLines: c1Orphan + c1Widow,
              });
            }
          }
        }

        // Try delta=-2: two fewer lines (fixes runts by moving last line to next page)
        const adjMax2 = remainingSpace - 2 * lineHeightPx;
        if (adjMax2 >= lineHeightPx * 2) {
          const cand2 = splitParagraphByLines(
            el.html, measureDiv, adjMax2,
            textAlign, hasIndent, indentValue, preserveIndent, canvasCtx
          );
          if (cand2 && cand2.length >= 2) {
            const c2First = cand2[0];
            const c2Rest = cand2.slice(1).reduce((a, b) => mergeIntoOne(a, b));
            const c2H = measure(accumulated + c2First);
            const c2Orphan = Math.max(1, Math.floor(measure(c2First) / lineHeightPx));
            const c2Widow = Math.max(1, Math.floor(measure(c2Rest) / lineHeightPx));
            if (c2H <= budget && c2Orphan >= (minOrphanLines || 2)) {
              candidates.push({
                type: 'para-split',
                elementIndex: i,
                html: accumulated + c2First,
                height: c2H,
                restHtml: c2Rest,
                isHeadingOrBold: false,
                isLastChapterElement: i === elements.length - 1,
                orphanLines: c2Orphan,
                widowLines: c2Widow,
                splitLine: c2Orphan,
                totalLines: c2Orphan + c2Widow,
              });
            }
          }
        }
      }
    }

    // Can't fit or split — stop collecting (nothing beyond this can fit either)
    break;
  }

  return candidates;
};

/**
 * Score a breakpoint candidate. Lower = better.
 *
 * Priority:
 *   PROHIBIDO (Infinity): overflow, heading-at-bottom
 *   SEVERO (1000-2000):   widow ≤1 line, orphan ≤1 line, extreme runt
 *   MODERADO (200-500):   shallow split, severe underfill, medium runt
 *   LEVE (40-100):        short_last_para, minor underfill
 *   PREFERENCIA:          maximize fill
 *
 * @private
 */
const scoreBreakpoint = (candidate, canvasCtx, layoutCtx, elements, log) => {
  const { contentHeight, lineHeightPx, minOrphanLines } = layoutCtx;
  let penalty = 0;

  // 1. PROHIBIDO: overflow
  if (candidate.height > contentHeight) return Infinity;

  // 2. PROHIBIDO: heading or bold paragraph at bottom of page
  //    Applies to block-end AND flush candidates (both can leave a heading stranded).
  //    Para-splits can't end with a heading by construction.
  if ((candidate.type === 'block-end' || candidate.type === 'flush') && candidate.isHeadingOrBold) {
    // Check if there's a following element (heading at bottom is only bad when
    // content follows — at chapter end it's fine)
    const nextIdx = candidate.elementIndex + 1;
    const hasFollowing = nextIdx < elements.length
      && elements[nextIdx].chapterTitle === elements[candidate.elementIndex].chapterTitle
      && !elements[nextIdx].isTitle;
    if (hasFollowing) {
      penalty += 2500; // heading-at-bottom (2000) + keep-with-next (500)
    }
  }

  // 4. Underfill penalty — continuous scale
  const fillPct = candidate.height / contentHeight;
  const unusedLines = Math.floor((contentHeight - candidate.height) / lineHeightPx);

  // Chapter-end pages are expected to be short — don't penalize underfill
  if (!candidate.isLastChapterElement) {
    if (unusedLines >= 6)      penalty += 600;
    else if (unusedLines >= 4) penalty += 400;
    else                       penalty += unusedLines * 40; // 1-3 lines: 40/80/120 — gradual
  }

  // 5. Split-specific penalties
  if (candidate.type === 'para-split') {
    const effectiveMinOrphan = candidate.isLastChapterElement ? 1 : (minOrphanLines || 2);
    const effectiveMinWidow = candidate.isLastChapterElement ? 1 : (minOrphanLines || 2) + 1;

    // Hard orphan constraint
    if (candidate.orphanLines < effectiveMinOrphan) penalty += 1000;

    // Widow penalty (rest chunk lines)
    if (candidate.widowLines < 2) penalty += 1000;      // real widow
    else if (candidate.widowLines < effectiveMinWidow) penalty += 200; // shallow split

    // Runt penalty: last line of the chunk on this page
    const chunkPlainText = htmlToText(candidate.html).trim();
    const metrics = getLastLineMetrics(chunkPlainText, canvasCtx);
    penalty += computeRuntLinePenalty(metrics.lastLineWords, metrics.widthRatio ?? 1);

    // Hyphenation at split point — word broken across page boundary
    if (chunkPlainText.endsWith('-')) penalty += 300;

    // Fragment base cost (any split is slightly worse than no split)
    penalty += 15;
  }

  // 6. For block-end candidates: check if the last block is a short 1-line paragraph
  if (candidate.type === 'block-end' && !candidate.isHeadingOrBold) {
    const el = elements[candidate.elementIndex];
    if (el && (el.tag === 'P' || el.tag === 'BLOCKQUOTE')) {
      const plainText = (el.textContent || '').trim();
      const metrics = getLastLineMetrics(plainText, canvasCtx);
      if (isSevereShortLastLine(metrics) && unusedLines <= 1) {
        // Runt-flush: paragraph's short last line is trapped at page bottom
        penalty += computeRuntLinePenalty(metrics.lastLineWords, metrics.widthRatio ?? 1);
      }
    }
  }

  // 7. Widow guard: 1-line complete paragraph at very bottom of full page
  if (candidate.type === 'block-end' && !candidate.isHeadingOrBold && unusedLines <= 0) {
    const el = elements[candidate.elementIndex];
    if (el && el.tag === 'P' && !el.isBold) {
      const measure = (html) => measureHtmlHeight(html, canvasCtx);
      const elLineCount = Math.floor(measure(el.html) / lineHeightPx);
      if (elLineCount <= 1) {
        penalty += 500; // widow-like isolated line at bottom
      }
    }
  }

  // 8. Lookahead: simulate what the next page looks like
  //    A breakpoint that creates a much better next page should be preferred
  if (candidate.type === 'para-split' && !candidate.isLastChapterElement) {
    const measure = (html) => measureHtmlHeight(html, canvasCtx);
    // Build simulated next page: rest chunk + following elements that fit
    let simHtml = candidate.restHtml;
    let simH = measure(simHtml);
    for (let j = candidate.elementIndex + 1; j < elements.length; j++) {
      const ne = elements[j];
      if (ne.chapterTitle !== elements[candidate.elementIndex].chapterTitle) break;
      if (ne.isTitle) break;
      const cH = simH + measure(ne.html);
      if (cH > contentHeight) break;
      simHtml += ne.html;
      simH = cH;
    }
    const nextPageEval = evaluatePageQualityCanvas(simHtml, contentHeight, lineHeightPx, canvasCtx);
    // Discount lookahead slightly (it's an approximation)
    penalty += nextPageEval.score * 0.4;
  }

  return penalty;
};

/**
 * Pick the best breakpoint from a list of candidates.
 * @private
 */
const pickBestBreakpoint = (candidates, canvasCtx, layoutCtx, elements, log) => {
  if (candidates.length === 0) return null;

  let best = candidates[0];
  let bestScore = scoreBreakpoint(best, canvasCtx, layoutCtx, elements, log);

  for (let i = 1; i < candidates.length; i++) {
    const score = scoreBreakpoint(candidates[i], canvasCtx, layoutCtx, elements, log);
    if (score < bestScore) {
      best = candidates[i];
      bestScore = score;
    }
  }

  log.record('greedy', 'breakpoint-select', 0, {
    candidateCount: candidates.length,
    bestType: best.type,
    bestElIdx: best.elementIndex,
    bestScore: +bestScore.toFixed(0),
    bestFill: +(best.height / layoutCtx.contentHeight * 100).toFixed(1),
    bestOrphan: best.orphanLines,
    bestWidow: best.widowLines,
  });

  return best;
};

/**
 * Core breakpoint-based pagination — evaluates all valid page-break positions
 * and picks the one with lowest penalty, instead of greedily filling.
 * All height calculations use Canvas-based measureHtmlHeight.
 *
 * @private
 */
const greedyPaginate = (elements, layoutCtx, canvasCtx, measureDiv, safeConfig, chapter, log) => {
  const {
    contentHeight, lineHeightPx, baseFontSize, baseLineHeight, textAlign,
    minOrphanLines, minWidowLines, splitLongParagraphs
  } = layoutCtx;

  const pages = [];
  let currentHtml = '';
  let currentSubheader = '';

  const quoteOptions = canvasCtx;

  let currentFirstElementIndex = 0;
  let pageHasTitle = false;
  // true after a fullPage title — the first content page after it also skips header
  let prevWasTitleOnly = false;

  const pushPage = (html, opts = {}) => {
    const blocks = parseHtmlElements(html);
    pages.push({
      html: serializeBlocks(blocks),
      blocks,
      pageNumber: pages.length + 1,
      chapterTitle: chapter.title,
      isBlank: blocks.length === 0,
      isTitleOnlyPage: opts.isTitleOnlyPage || false,
      isFirstChapterPage: opts.isFirstChapterPage || false,
      currentSubheader,
      firstElementIndex: currentFirstElementIndex
    });
    prevWasTitleOnly = opts.isTitleOnlyPage || false;
    pageHasTitle = false;
  };

  const flushCurrent = (startWith = '', firstIdx = null) => {
    if (currentHtml) {
      // First content page after a fullPage title also counts as chapter start
      // (header should be skipped on it, same as the title page itself).
      const isFirstAfterTitleOnly = prevWasTitleOnly && !pageHasTitle;
      pushPage(currentHtml, { isFirstChapterPage: pageHasTitle || isFirstAfterTitleOnly });
    }
    currentHtml = startWith;
    pageHasTitle = false;
    if (firstIdx !== null) {
      currentFirstElementIndex = firstIdx;
    }
  };

  // Helper: measure height using Canvas engine
  const measure = (html) => measureHtmlHeight(html, canvasCtx);

  for (let elIdx = 0; elIdx < elements.length; elIdx++) {
    const el = elements[elIdx];

    // Track subheaders
    if (/^H[1-6]$/i.test(el.tag) && !el.isTitle && el.textContent) {
      currentSubheader = el.textContent;
    }

    // Chapter title element — handle before breakpoint collection
    if (el.isTitle) {
      const layout = el.titleLayout;
      if (layout === 'fullPage') {
        flushCurrent();
        pushPage(el.html, { isTitleOnlyPage: true, isFirstChapterPage: true });
        currentFirstElementIndex = elIdx;
        currentHtml = '';
      } else if (layout === 'spaced' || layout === 'halfPage') {
        flushCurrent();
        currentFirstElementIndex = elIdx;
        currentHtml = el.html;
        pageHasTitle = true;
      } else {
        flushCurrent();
        currentFirstElementIndex = elIdx;
        currentHtml = el.html;
        pageHasTitle = true;
      }
      continue;
    }

    // KEEP-WITH-NEXT for subheaders — ensure enough follow content fits after heading
    const isHeading = /^H[1-6]$/i.test(el.tag);
    const isBoldParagraph = !isHeading && el.tag === 'P' && el.isBold;

    if (isHeading || isBoldParagraph) {
      log.record('greedy', 'heading-detect', pages.length + 1, { tag: el.tag, text: (el.textContent || '').substring(0, 60), isHeading, isBoldParagraph });

      const nextEl = elements[elIdx + 1];
      if (nextEl && !nextEl.isTitle) {
        const pageWithSub = measure((currentHtml || '') + el.html);
        const level = isHeading ? el.tag?.toLowerCase() : 'h3';
        const subConfig = safeConfig.subheaders?.[level];
        const effectiveMinLines = subConfig?.minLinesAfter != null
          ? subConfig.minLinesAfter
          : Math.max(minOrphanLines, 2);
        const minFollowHeight = effectiveMinLines * lineHeightPx;
        const spaceAfterSub = (contentHeight - (pageHasTitle ? lineHeightPx : 0)) - pageWithSub;

        if (spaceAfterSub < minFollowHeight) {
          log.record('greedy', 'keep-with-next', pages.length + 1, { tag: el.tag, text: (el.textContent || '').substring(0, 60), effectiveMinLines, availableLines: +(spaceAfterSub / lineHeightPx).toFixed(1) });
          flushCurrent(el.html, elIdx);
          currentFirstElementIndex = elIdx;
          continue;
        }
      }
    }

    // ── BREAKPOINT SELECTION ──
    // Instead of greedily checking "does this element fit?", collect ALL valid
    // breakpoints from this position and pick the best one.
    const pageHeightBudget = contentHeight - DOM_SLACK - (pageHasTitle ? lineHeightPx : 0);

    // Only trigger breakpoint selection when the current element does NOT fit.
    // If it fits, add it and continue — this keeps the simple case fast.
    const candidateHeight = measure(currentHtml + el.html);

    if (candidateHeight <= pageHeightBudget) {
      // Element fits — but check for runt/widow traps before blindly adding.
      const isLastChapterElement = elIdx === elements.length - 1;
      const freeLinesAfter = Math.floor((pageHeightBudget - candidateHeight) / lineHeightPx);
      const currentPageHeight = currentHtml ? measure(currentHtml) : 0;
      const currentFill = currentPageHeight / contentHeight;

      // Runt-flush guard: paragraph's short last line trapped at full page bottom
      if (!isLastChapterElement
          && (el.tag === 'P' || el.tag === 'BLOCKQUOTE')
          && !el.isBold
          && freeLinesAfter <= 1
          && currentFill >= 0.70
          && currentHtml) {
        const plainText = (el.textContent || '').trim();
        const shortLine = getLastLineMetrics(plainText, canvasCtx);
        if (isSevereShortLastLine(shortLine)) {
          log.record('greedy', 'bp-runt-flush', pages.length + 1, {
            tag: el.tag, text: plainText.substring(0, 60),
            lastLineWords: shortLine.lastLineWords,
            widthRatio: +shortLine.widthRatio.toFixed(2)
          });
          flushCurrent(el.html, elIdx);
          currentFirstElementIndex = elIdx;
          continue;
        }
      }

      // Widow guard: 1-line paragraph isolated at very bottom of full page
      if (!isLastChapterElement
          && el.tag === 'P'
          && !el.isBold
          && freeLinesAfter <= 0
          && currentFill >= 0.70
          && currentHtml) {
        const elLineCount = Math.floor(measure(el.html) / lineHeightPx);
        if (elLineCount <= 1) {
          log.record('greedy', 'bp-widow-flush', pages.length + 1, {
            tag: el.tag, text: (el.textContent || '').substring(0, 60),
            elLines: elLineCount
          });
          flushCurrent(el.html, elIdx);
          currentFirstElementIndex = elIdx;
          continue;
        }
      }

      currentHtml += el.html;
      continue;
    }

    // Element doesn't fit — collect all valid breakpoints and pick the best one.
    // The breakpoint collection starts from the CURRENT element (not from the
    // page start) and evaluates where the page should end.
    // We include the "flush without adding" option as an implicit candidate
    // (the page ends with what it already has, and this element starts fresh).
    const candidates = collectBreakpoints(
      elements, elIdx, currentHtml, pageHeightBudget,
      canvasCtx, layoutCtx, measureDiv, safeConfig, log
    );

    // Also add a "flush" candidate: close the page as-is, this element starts a new page.
    // This is the fallback that the old greedy algorithm always did.
    if (currentHtml) {
      const flushHeight = measure(currentHtml);
      // Check if the last element on the current page is a heading/bold
      const prevEl = elIdx > 0 ? elements[elIdx - 1] : null;
      const prevIsHeadingOrBold = prevEl
        ? (/^H[1-6]$/i.test(prevEl.tag) || (!(/^H[1-6]$/i.test(prevEl.tag)) && prevEl.tag === 'P' && prevEl.isBold))
        : false;
      candidates.push({
        type: 'flush',
        elementIndex: elIdx - 1,
        html: currentHtml,
        height: flushHeight,
        restHtml: null,
        isHeadingOrBold: prevIsHeadingOrBold,
        isLastChapterElement: false,
        orphanLines: 0,
        widowLines: 0,
        splitLine: 0,
        totalLines: 0,
      });
    }

    if (candidates.length === 0) {
      // Nothing fits and no flush possible.
      // If the element itself is taller than a full page, force it onto its own
      // page to prevent infinite loops. Otherwise start fresh with this element.
      if (currentHtml) {
        // Flush existing content first, then retry this element on a fresh page
        flushCurrent('', null);
        elIdx--; // re-process this element on the now-empty page
        continue;
      }
      // currentHtml is empty and element still doesn't fit → oversized element.
      // Accept overflow: push it as a single-element page.
      log.record('greedy', 'oversized-element', pages.length + 1, {
        tag: el.tag, text: (el.textContent || '').substring(0, 60),
        elHeight: +measure(el.html).toFixed(0), budget: +pageHeightBudget.toFixed(0)
      });
      pushPage(el.html, { isFirstChapterPage: pageHasTitle });
      currentHtml = '';
      pageHasTitle = false;
      currentFirstElementIndex = elIdx + 1;
      continue;
    }

    const best = pickBestBreakpoint(candidates, canvasCtx, layoutCtx, elements, log);

    if (!best) {
      // Shouldn't happen, but safety fallback
      flushCurrent(el.html, elIdx);
      currentFirstElementIndex = elIdx;
      continue;
    }

    if (best.type === 'flush') {
      // Close current page as-is, start new page with this element
      log.record('greedy', 'bp-flush', pages.length + 1, {
        tag: el.tag, text: (el.textContent || '').substring(0, 60),
        reason: 'breakpoint-flush',
        pageFill: +(best.height / contentHeight * 100).toFixed(1)
      });
      flushCurrent(el.html, elIdx);
      currentFirstElementIndex = elIdx;
      continue;
    }

    if (best.type === 'block-end') {
      // Update subheader tracking for all elements included in this page
      // (elements between elIdx and best.elementIndex are consumed by the
      // breakpoint but the for-loop won't visit them individually).
      for (let s = elIdx; s <= best.elementIndex; s++) {
        if (/^H[1-6]$/i.test(elements[s].tag) && !elements[s].isTitle && elements[s].textContent) {
          currentSubheader = elements[s].textContent;
        }
      }
      // Page ends after a complete block element.
      pushPage(best.html, { isFirstChapterPage: pageHasTitle });
      currentHtml = '';
      pageHasTitle = false;
      // elIdx is set to best.elementIndex; the for-loop's elIdx++ advances
      // to best.elementIndex + 1, which is the first element of the next page.
      elIdx = best.elementIndex;
      currentFirstElementIndex = elIdx + 1;
      continue;
    }

    if (best.type === 'para-split') {
      // Update subheader tracking for elements up to (but not including) the split one
      for (let s = elIdx; s < best.elementIndex; s++) {
        if (/^H[1-6]$/i.test(elements[s].tag) && !elements[s].isTitle && elements[s].textContent) {
          currentSubheader = elements[s].textContent;
        }
      }

      log.record('greedy', 'bp-split', pages.length + 1, {
        tag: elements[best.elementIndex]?.tag,
        text: (elements[best.elementIndex]?.textContent || '').substring(0, 60),
        orphanLines: best.orphanLines,
        widowLines: best.widowLines,
        fill: +(best.height / contentHeight * 100).toFixed(1),
      });

      // Propagate fragment IDs in dev mode
      const srcEl = elements[best.elementIndex];
      if (process.env.NODE_ENV === 'development' && srcEl?.sourceBlockId) {
        const restIds = deriveFragmentId(srcEl);
        srcEl.fragmentIndex = restIds.fragmentIndex;
        const taggedRest = injectBlockIdAttrs(best.restHtml, restIds);
        pushPage(best.html, { isFirstChapterPage: pageHasTitle });
        currentHtml = taggedRest;
      } else {
        pushPage(best.html, { isFirstChapterPage: pageHasTitle });
        currentHtml = best.restHtml;
      }
      pageHasTitle = false;
      // elIdx → best.elementIndex; loop's elIdx++ advances past the split element
      elIdx = best.elementIndex;
      currentFirstElementIndex = elIdx + 1;
      continue;
    }
  }

  // Final flush
  if (currentHtml) pushPage(currentHtml, { isFirstChapterPage: pageHasTitle });

  return pages;
};

/**
 * Single forward fill-pass using Canvas measurement.
 * @private
 */
const applyFillPass = (pages, layoutCtx, canvasCtx, measureDiv, safeConfig, log) => {
  const { contentHeight, lineHeightPx, minOrphanLines, minWidowLines,
    baseFontSize, baseLineHeight, textAlign, splitLongParagraphs } = layoutCtx;

  const quoteOptions = canvasCtx;

  // Helper: measure height using Canvas engine
  const measure = (html) => measureHtmlHeight(html, canvasCtx);

  // E5: Two forward fill-passes to handle cascading fills
  // (page N fills from N+1, then N+1 can fill from N+2 on second pass)
  for (let pass = 0; pass < 2; pass++) {
  for (let i = 0; i < pages.length - 1; i++) {
    if (i < 0 || i >= pages.length - 1) continue;
    if (pages[i].isBlank || pages[i].isTitleOnlyPage || !pages[i].html) continue;

    // Sliding-window source search: if all attempts with the nearest source page
    // fail (e.g. first element has very high split badness), try the next source in
    // the same chapter before giving up. Limited to MAX_SOURCE_HOPS extra hops so
    // the fill-pass doesn't slow down on pathological layouts.
    const MAX_SOURCE_HOPS = 2;
    let sourceHopCount = 0;
    let sourceStartIdx = i + 1; // start searching from here for the next source

    for (let attempt = 0; attempt < 30; attempt++) {
      const currentHtml = pages[i].html;
      const currentHeight = measure(currentHtml);
      const currentFill = currentHeight / contentHeight;
      const remainingSpace = contentHeight - DOM_SLACK - currentHeight;
      const remainingLines = Math.floor(remainingSpace / lineHeightPx);

      if (remainingLines < 1) {
        break;
      }
      if (remainingLines >= 3) {
        log.record('fill', 'diag', i + 1, { remainingLines });
      }
      // Pages with exactly 1 line free still proceed — they can receive a 1-line split
      // to compensate delta=-1 gaps. The orphan check at the source side enforces quality.

      // Find next non-blank page in same chapter, starting from sourceStartIdx
      let nextIdx = sourceStartIdx;
      while (nextIdx < pages.length && pages[nextIdx]?.isBlank) nextIdx++;
      if (nextIdx >= pages.length) break;

      const nextPage = pages[nextIdx];
      if (!nextPage?.html || pages[i].chapterTitle !== nextPage.chapterTitle) {
        log.record('fill', 'reject', i + 1, { reason: 'chapter-boundary', remainingLines });
        break;
      }

      // Baseline badness — sum of both pages before any move
      const badnessBefore =
        evaluatePageQualityCanvas(currentHtml, contentHeight, lineHeightPx, canvasCtx).score +
        evaluatePageQualityCanvas(nextPage.html, contentHeight, lineHeightPx, canvasCtx).score;

      // Extract first element from next page
      const nextPageEls = getPageBlocks(nextPage);
      if (nextPageEls.length === 0) break;
      const firstEl = nextPageEls[0];

      const tag = firstEl.tag;
      const isHeader = /^H[1-6]$/i.test(tag);
      const firstElHtml = firstEl.outerHtml;
      if (process.env.NODE_ENV === 'development') {
        const srcRawCont = /data-continuation/.test(nextPage.html);
        const elCont = firstEl.dataset?.continuation;
        if (srcRawCont || elCont) {
          log.record('fill', 'src-extract-debug', i + 1, { srcPage: nextIdx + 1, srcRawCont, elCont, elOuterStart: firstElHtml.substring(0, 120) });
        }
      }

      // Detect bold-paragraph subheaders — only if ≥80% of text is bold.
      // Same logic as flattenChapterElements and fixHeadingsAtBottom.
      const isBoldPara = !isHeader && isMostlyBoldParagraph(firstEl);


      // Heading/subheader group move: moving a heading alone to the bottom of a
      // page triggers heading_at_bottom (+800) which the badness gate always rejects.
      // Instead, bundle the heading with follow content so it's NOT the last element.
      // Note: the old headerBlocked check used to `break` here, preventing the group
      // path from being tried. Now we go straight into the group logic which handles
      // both full-element groups and heading+split-follow.
      if (isHeader || isBoldPara) {
        log.record('fill', 'heading-group', i + 1, { tag, text: firstEl.textContent.substring(0, 60), isHeader, isBoldPara, remainingLines });
        // Heading doesn't even fit on the page — no point trying group move
        if (measure(currentHtml + firstElHtml) > contentHeight) break;

        let groupHtml = firstElHtml;
        let groupCount = 1;
        for (let si = 1; si < nextPageEls.length; si++) {
          const sibHtml = nextPageEls[si].outerHtml;
          const gh = measure(currentHtml + groupHtml + sibHtml);
          if (gh > contentHeight) break;
          groupHtml += sibHtml;
          groupCount++;
        }
        // sib is the element right after the heading group (for split-follow below)
        const sib = nextPageEls.length > groupCount ? nextPageEls[groupCount] : null;

        if (groupCount >= 2) {
          const qGroup = evaluatePageQualityCanvas(currentHtml + groupHtml, contentHeight, lineHeightPx, canvasCtx);
          if (!qGroup.violations.includes('heading_at_bottom')) {
            // Build source page without the moved group
            let srcHtml = '';
            for (let g = groupCount; g < nextPageEls.length; g++) srcHtml += nextPageEls[g].outerHtml;
            srcHtml = srcHtml.trim();
            const qSrc = srcHtml
              ? evaluatePageQualityCanvas(srcHtml, contentHeight, lineHeightPx, canvasCtx)
              : { score: 0, violations: [] };

            if (!qSrc.violations.includes('heading_at_bottom')) {
              if (currentFill >= FILL_PASS_RUNT_MIN_CURRENT_FILL
                  && qGroup.fillPct >= FILL_PASS_RUNT_MIN_RESULT_FILL
                  && qGroup.violations.includes('runt_line')) {
                log.record('fill', 'reject', i + 1, {
                  tag,
                  text: (currentHtml + groupHtml).substring(0, 60),
                  reason: 'short-last-line',
                  currentFill: +currentFill.toFixed(2),
                  afterFillPct: +(qGroup.fillPct * 100).toFixed(0)
                });
                break;
              }

              const groupBadnessAfter = qGroup.score + qSrc.score;
              const BADNESS_MIN_DELTA = remainingLines >= 8 ? -500 : remainingLines >= 3 ? Math.round(-100 - (remainingLines - 3) * 80) : -100;
              if (groupBadnessAfter <= badnessBefore - BADNESS_MIN_DELTA) {
                pages[i] = setPageHtml(pages[i], currentHtml + groupHtml);
                if (srcHtml) {
                  pages[nextIdx] = setPageHtml(nextPage, srcHtml);
                } else {
                  pages.splice(nextIdx, 1);
                }
                log.record('fill', 'heading-group', i + 1, { tag, text: firstEl.textContent.substring(0, 60), groupCount, fromPage: nextIdx + 1, before: { score: +badnessBefore.toFixed(0) }, after: { score: +groupBadnessAfter.toFixed(0) } });
                continue;
              }
            }
          }
        }

        // groupCount === 1: heading fits but no full follow element fits.
        // Try splitting the first follow element so heading + partial follow move together.
        if (groupCount === 1 && sib && splitLongParagraphs) {
          const sibTag = sib.tag;
          if (sibTag !== 'UL' && sibTag !== 'OL' && !/^H[1-6]$/i.test(sibTag)) {
            const spaceForFollow = contentHeight - measure(currentHtml + firstElHtml);
            if (spaceForFollow >= minOrphanLines * lineHeightPx) {
              const isContChunk = sib.dataset?.continuation === 'true';
              const followSplit = splitInTwo(
                sib.outerHtml, measureDiv, canvasCtx, spaceForFollow, contentHeight,
                textAlign, true,
                safeConfig.paragraph?.firstLineIndent || 1.5,
                isContChunk, quoteOptions
              );
              if (followSplit) {
                const [followChunk, followRest] = followSplit;
                const followChunkLines = Math.floor(measure(followChunk) / lineHeightPx);
                const followRestLines = Math.floor(measure(followRest) / lineHeightPx);
                if (followChunkLines >= minOrphanLines && followRestLines >= minOrphanLines) {
                  const destHtml = currentHtml + firstElHtml + followChunk;
                  const qDest = evaluatePageQualityCanvas(destHtml, contentHeight, lineHeightPx, canvasCtx);
                  if (!qDest.violations.includes('heading_at_bottom')) {
                    // Build source: remove heading + original follow, prepend followRest
                    let srcRemainder = '';
                    for (let g = 2; g < nextPageEls.length; g++) srcRemainder += nextPageEls[g].outerHtml;
                    const srcHtml = followRest + srcRemainder.trim();
                    const qSrc = evaluatePageQualityCanvas(srcHtml, contentHeight, lineHeightPx, canvasCtx);
                    if (!qSrc.violations.includes('heading_at_bottom')) {
                      const splitBadnessAfter = qDest.score + qSrc.score;
                      const BADNESS_MIN_DELTA = remainingLines >= 8 ? -500 : remainingLines >= 3 ? Math.round(-100 - (remainingLines - 3) * 80) : -100;
                      if (splitBadnessAfter <= badnessBefore - BADNESS_MIN_DELTA) {
                        pages[i] = setPageHtml(pages[i], destHtml);
                        pages[nextIdx] = setPageHtml(nextPage, srcHtml);
                        log.record('fill', 'split', i + 1, { tag, text: firstEl.textContent.substring(0, 60), fromPage: nextIdx + 1, followChunkLines, before: { score: +badnessBefore.toFixed(0) }, after: { score: +splitBadnessAfter.toFixed(0) } });
                        continue;
                      }
                    }
                  }
                }
              }
            }
          }
        }

        // Group move failed — single heading move will also fail (heading_at_bottom),
        // so break instead of falling through to the single-element path.
        if (remainingLines >= 5) {
          log.record('fill', 'reject', i + 1, { tag, text: firstEl.textContent.substring(0, 60), reason: 'heading-group-failed', groupCount, remainingLines });
        }
        break;
      }

      // Try fitting the whole element (Canvas measurement)
      const candidateFitHeight = measure(currentHtml + firstElHtml);
      if (candidateFitHeight <= contentHeight - DOM_SLACK) {

        // Remove first element from source page
        const sourceHtml = serializeBlocks(nextPageEls.slice(1)).trim();

        // Don't leave source with fewer lines than minWidowLines.
        // Hop to the next source page before giving up — a different source page
        // may have a larger first element that leaves the source adequately filled.
        if (sourceHtml) {
          const srcLines = Math.floor(measure(sourceHtml) / lineHeightPx);
          if (srcLines < minWidowLines) {
            log.record('fill', 'reject', i + 1, { tag, text: firstEl.textContent.substring(0, 60), reason: 'widow-block', srcLines, minWidowLines });
            if (sourceHopCount < MAX_SOURCE_HOPS) {
              sourceHopCount++;
              sourceStartIdx = nextIdx + 1;
              continue;
            }
            break;
          }
        }

        // Badness gate — accept only if total layout quality improves across both pages
        const qMovedCurrent = evaluatePageQualityCanvas(currentHtml + firstElHtml, contentHeight, lineHeightPx, canvasCtx);
        const qMovedSource  = sourceHtml
          ? evaluatePageQualityCanvas(sourceHtml, contentHeight, lineHeightPx, canvasCtx)
          : { score: 0, violations: [] };
        const badnessAfter = qMovedCurrent.score + qMovedSource.score;

        // Allow degradation proportional to underfill severity:
        //   ≥8 lines free (severe)  → -500 (fill is critical, accept large degradation)
        //   3-7 lines free (medium) → continuous scale from -100 to -500
        //   1-2 lines free (mild)   → -100
        // This prevents the binary cliff at 8 lines from blocking good moves at 5-7 lines.
        const BADNESS_MIN_DELTA = remainingLines >= 8
          ? -500
          : remainingLines >= 3
            ? Math.round(-100 - (remainingLines - 3) * 80) // -100 at 3, -420 at 8 (capped above)
            : -100;
        if (badnessAfter > badnessBefore - BADNESS_MIN_DELTA) {
          log.record('fill', 'reject', i + 1, { tag, text: firstEl.textContent.substring(0, 60), reason: 'badness-gate', before: { score: +badnessBefore.toFixed(0), fillPct: +(currentFill * 100).toFixed(0) }, after: { score: +badnessAfter.toFixed(0), destFill: +(qMovedCurrent.fillPct * 100).toFixed(0), srcScore: +qMovedSource.score.toFixed(0) }, delta: +(badnessBefore - badnessAfter).toFixed(0), features: { remainingLines, minDelta: BADNESS_MIN_DELTA, threshold: +(badnessBefore - BADNESS_MIN_DELTA).toFixed(0), srcViolations: qMovedSource.violations, destViolations: qMovedCurrent.violations } });
          // Sliding window: try next source page in same chapter before giving up
          if (sourceHopCount < MAX_SOURCE_HOPS) {
            sourceHopCount++;
            sourceStartIdx = nextIdx + 1;
            log.record('fill', 'hop', i + 1, { hop: sourceHopCount, newSourceStart: sourceStartIdx });
            continue;
          }
          break;
        }
        // Hard constraint: never create heading_at_bottom on DESTINATION page.
        // The badness gate alone is insufficient — when the source is a heading-only
        // page its badness is ~1474 (severe underfill + heading_at_bottom), so any
        // destination (even one gaining heading_at_bottom +800) looks like an improvement.
        if (qMovedCurrent.violations.includes('heading_at_bottom')) {
          log.record('fill', 'reject', i + 1, { tag, text: firstEl.textContent.substring(0, 60), reason: 'heading_at_bottom-dest' });
          break;
        }
        // Hard constraint: never strand a heading at the bottom of source page
        if (qMovedSource.violations.includes('heading_at_bottom')) {
          log.record('fill', 'reject', i + 1, { tag, text: firstEl.textContent.substring(0, 60), reason: 'heading_at_bottom-source' });
          break;
        }
        if (currentFill >= FILL_PASS_RUNT_MIN_CURRENT_FILL
            && qMovedCurrent.fillPct >= FILL_PASS_RUNT_MIN_RESULT_FILL
            && qMovedCurrent.violations.includes('runt_line')) {
          log.record('fill', 'reject', i + 1, {
            tag,
            text: firstEl.textContent.substring(0, 60),
            reason: 'short-last-line',
            currentFill: +currentFill.toFixed(2),
            afterFillPct: +(qMovedCurrent.fillPct * 100).toFixed(0)
          });
          break;
        }

        // Accept move — append element to current page, then immediately run
        // mergeSplitFragments to reunify any adjacent split fragments.
        // This handles both direct moves and the case where a continuation chunk
        // is moved onto a page that already ends with the first-chunk of the same paragraph.
        log.record('fill', 'move', i + 1, { tag: firstEl.tag || '?', text: firstEl.textContent.substring(0, 60), fromPage: nextIdx + 1, before: { score: +badnessBefore.toFixed(0) }, after: { score: +badnessAfter.toFixed(0), fillPct: +(qMovedCurrent.fillPct * 100).toFixed(0) }, beforeHtml: currentHtml, afterHtml: currentHtml + firstElHtml });

        // Restore indent when moving a <p> that lost text-indent:0 from a prior split
        // but is now a standalone paragraph on its new page (uppercase start = new para).
        const movedElHtml = tag === 'P'
          ? restoreIndentIfNeeded(firstElHtml, safeConfig.paragraph?.firstLineIndent || 1.5)
          : firstElHtml;

        pages[i] = setPageHtml(pages[i], currentHtml + movedElHtml);
        mergeSplitFragments([pages[i]], log);
        if (sourceHtml) {
          pages[nextIdx] = setPageHtml(nextPage, sourceHtml);
        } else {
          pages.splice(nextIdx, 1);
        }
        // Reset window after a successful move — the page layout changed so start fresh
        sourceHopCount = 0;
        sourceStartIdx = i + 1;
        continue;
      }

      // Element doesn't fit whole — try splitting
      if (remainingLines >= 5) {
        log.record('fill', 'no-fit', i + 1, { tag, text: firstEl.textContent.substring(0, 60), remainingLines, elHeight: +measure(firstElHtml).toFixed(0) });
      }
      if (!splitLongParagraphs || isHeader || tag === 'UL' || tag === 'OL') break;

      // Detect if element is a continuation:
      // 1. data-continuation="true" attribute (set by splitParagraphByLines on rest chunks)
      // 2. Lowercase-start heuristic: if the paragraph's first visible character is
      //    lowercase, it was split mid-sentence and is a continuation (no indent needed).
      const hasContinuationAttr = firstEl.dataset?.continuation === 'true';
      // Skip leading punctuation/quotes to find the first actual letter.
      // Handles cases like "ética..." where a curly-quote masks the lowercase start.
      const rawText = firstEl.textContent.trim();
      const firstLetter = rawText.match(/\p{L}/u)?.[0] || '';
      const startsLowercase = firstLetter === firstLetter.toLowerCase() && firstLetter !== firstLetter.toUpperCase();
      const isContChunk = hasContinuationAttr || startsLowercase;
      if (process.env.NODE_ENV === 'development') {
        log.record('fill', 'cont-check', i + 1, { isContChunk, contAttr: firstEl.dataset?.continuation, startsLowercase, text: firstEl.textContent.substring(0, 60) });
      }
      const splitResult = splitInTwo(
        firstElHtml, measureDiv, canvasCtx, remainingSpace, contentHeight,
        textAlign, true,
        safeConfig.paragraph?.firstLineIndent || 1.5,
        isContChunk, quoteOptions
      );

      if (!splitResult) {
        log.record('fill', 'reject', i + 1, { tag, text: firstEl.textContent.substring(0, 60), reason: 'split-null', remainingLines });
        break;
      }

      let [chunk, rest] = splitResult;

      // Verify the chunk actually fits when combined with existing content.
      // If it overflows (inter-element margin not captured by Canvas), retry with
      // a 1-line smaller budget — up to 3 retries.
      let chunkFitHeight = measure(currentHtml + chunk);
      let overflowRetries = 0;
      while (chunkFitHeight > contentHeight - DOM_SLACK && overflowRetries < 3) {
        overflowRetries++;
        const retrySpace = remainingSpace - overflowRetries * lineHeightPx;
        if (retrySpace < lineHeightPx) break;
        const retryResult = splitInTwo(
          firstElHtml, measureDiv, canvasCtx, retrySpace, contentHeight,
          textAlign, true,
          safeConfig.paragraph?.firstLineIndent || 1.5,
          isContChunk, quoteOptions
        );
        if (!retryResult) break;
        [chunk, rest] = retryResult;
        chunkFitHeight = measure(currentHtml + chunk);
      }
      if (chunkFitHeight > contentHeight - DOM_SLACK) {
        log.record('fill', 'reject', i + 1, { tag, text: firstEl.textContent.substring(0, 60), reason: 'split-overfit', chunkFitHeight: +chunkFitHeight.toFixed(0), contentH: +contentHeight.toFixed(0) });
        break;
      }
      let chunkLines = Math.floor(measure(chunk) / lineHeightPx);

      // Hard: rest chunk itself must have at least minOrphanLines lines.
      let restLines = Math.floor(measure(rest) / lineHeightPx);
      let isRetrySplit = false;
      if (restLines < minOrphanLines && remainingLines > minOrphanLines) {
        const retrySplit = splitInTwo(
          firstElHtml, measureDiv, canvasCtx, remainingSpace - lineHeightPx, contentHeight,
          textAlign, true,
          safeConfig.paragraph?.firstLineIndent || 1.5,
          isContChunk, quoteOptions
        );
        if (retrySplit) {
          const [chunkR, restR] = retrySplit;
          const restRLines = Math.floor(measure(restR) / lineHeightPx);
          const chunkRLines = Math.floor(measure(chunkR) / lineHeightPx);
          if (restRLines >= minOrphanLines && chunkRLines >= minOrphanLines
              && measure(currentHtml + chunkR) <= contentHeight) {
            chunk = chunkR; rest = restR;
            chunkLines = chunkRLines; restLines = restRLines;
            isRetrySplit = true;
            log.record('fill', 'split', i + 1, { tag, text: firstEl.textContent.substring(0, 60), reason: 'orphan-retry', chunkLines: chunkRLines, restLines: restRLines, remainingLines });
          }
        }
      }
      if (restLines < minOrphanLines) {
        log.record('fill', 'reject', i + 1, { tag, text: firstEl.textContent.substring(0, 60), reason: 'orphan-block', restLines, minOrphanLines, remainingLines });
        break;
      }

      // Shallow-split avoidance: if rest would have only 1-2 lines (split_shallow),
      // try reducing chunk by 1 line so rest gets one more line.
      // Only attempt when the current page has room to spare (>= 3 remaining lines after).
      if (restLines < 3 && !isRetrySplit && remainingLines > minOrphanLines) {
        const shallowRetry = splitInTwo(
          firstElHtml, measureDiv, canvasCtx, remainingSpace - lineHeightPx, contentHeight,
          textAlign, true,
          safeConfig.paragraph?.firstLineIndent || 1.5,
          isContChunk, quoteOptions
        );
        if (shallowRetry) {
          const [chunkS, restS] = shallowRetry;
          const restSLines = Math.floor(measure(restS) / lineHeightPx);
          const chunkSLines = Math.floor(measure(chunkS) / lineHeightPx);
          if (restSLines >= 3 && chunkSLines >= minOrphanLines
              && measure(currentHtml + chunkS) <= contentHeight) {
            chunk = chunkS; rest = restS;
            chunkLines = chunkSLines; restLines = restSLines;
            log.record('fill', 'split', i + 1, { tag, text: firstEl.textContent.substring(0, 60), reason: 'shallow-retry', chunkLines: chunkSLines, restLines: restSLines });
          }
        }
      }

      // Only check orphan (chunk going to current page). The rest-chunk widow check
      // is now handled by the hard restLines check above.
      //
      // Exception: allow 1-line moves when the page has exactly 1 line of space.
      // This compensates delta=-1 gaps created by scoreCandidate quality optimization
      // without violating the orphan rule in all other cases.
      if (chunkLines < minOrphanLines && !(chunkLines === 1 && remainingLines <= 1)) break;

      const remainingEls = serializeBlocks(nextPageEls.slice(1)).trim();
      // The `rest` chunk becomes the first element on the source page.
      // If it's a <p> with text-indent:0 (baked in from a prior split) but starts with
      // an uppercase letter, it's a new paragraph — restore its indent now so it doesn't
      // need a fill/move to trigger restoreIndentIfNeeded.
      const restoredRest = tag === 'P'
        ? restoreIndentIfNeeded(rest, safeConfig.paragraph?.firstLineIndent || 1.5)
        : rest;
      const newSourceHtml = remainingEls ? restoredRest + remainingEls : restoredRest;

      // Check total source page lines (rest + remaining elements)
      const newSourceLines = Math.floor(measure(newSourceHtml) / lineHeightPx);
      if (newSourceLines < 1) break; // hard: never empty the source page

      // Soft widow penalty instead of hard break — let the badness gate decide.
      // A short widow on the source page is undesirable (+600) but not a hard veto:
      // if the destination page is very underfilled, the split may still be worth it.
      // When the current page is underfilled, reduce or skip the widow penalty —
      // filling an empty page is worth tolerating a short fragment on the source.
      const underfillRatio = remainingLines / Math.max(1, Math.round(contentHeight / lineHeightPx));
      // Suppress widow penalty when there are very few lines free — no better split point exists.
      // rem<=1: full suppression (only one line of space, zero alternatives).
      // rem<=2: 80% suppression — 2-line gap is also highly constrained.
      const widowPenaltyScale = remainingLines <= 1 ? 0 : remainingLines <= 2 ? 0.2 : underfillRatio >= 0.45 ? 0 : underfillRatio >= 0.35 ? 0.3 : 1;
      const widowSoftPenalty = newSourceLines < minWidowLines ? Math.round(600 * widowPenaltyScale) : 0;

      // Badness gate for split — accept only if total quality improves
      const totalLines = Math.round(contentHeight / lineHeightPx);
      const emptyRatio = remainingLines / totalLines;

      const qSplitCurrent = evaluatePageQualityCanvas(currentHtml + chunk, contentHeight, lineHeightPx, canvasCtx);
      const qSplitSource  = evaluatePageQualityCanvas(newSourceHtml, contentHeight, lineHeightPx, canvasCtx);

      // evaluatePageQualityCanvas already includes a widow penalty (1000 pts) when the
      // destination page ends with a 1-line paragraph. But the fill-pass applies its own
      // widowPenaltyScale (0 for rem≤1, 0.2 for rem≤2) to suppress this when the
      // destination is already highly constrained. We must subtract the raw widow penalty
      // and add back the scaled version to avoid double-counting.
      const destHasWidow = qSplitCurrent.violations.includes('widow');
      const RAW_WIDOW_PENALTY = 1000; // must match evaluatePageQualityCanvas line 2767
      const destWidowAdjustment = destHasWidow
        ? Math.round(RAW_WIDOW_PENALTY * widowPenaltyScale) - RAW_WIDOW_PENALTY  // ≤ 0
        : 0;
      const qSplitCurrentAdjusted = qSplitCurrent.score + destWidowAdjustment;

      // When the destination page is significantly underfilled (≥25% empty) and the
      // source page's high score comes only from fragment+runt_line (no orphan/widow/heading),
      // discount the source score. The fill-pass cascades: subsequent iterations can fix
      // the runt on the source, but they cannot fix a severely underfilled destination.
      const srcViolationSet = new Set(qSplitSource.violations);
      const srcOnlyRuntFragment = srcViolationSet.size > 0
        && ![...srcViolationSet].some(v => v === 'orphan' || v === 'widow' || v === 'heading_at_bottom');
      const srcScoreForGate = (srcOnlyRuntFragment && emptyRatio >= 0.25)
        ? Math.round(qSplitSource.score * 0.5)
        : qSplitSource.score;

      const splitBadnessAfter = qSplitCurrentAdjusted + srcScoreForGate + widowSoftPenalty;

      // For 1-line gaps (created by delta=-1 splits), accept even Δ0 — the goal is
      // to fill the gap, not to improve total badness. Use a generous threshold.
      // For larger gaps, allow up to 50-point degradation (spreads whitespace rather
      // than concentrating it; rejects large degradations like Δ-1000 orphan cases).
      // For retry splits (gave up 1 line to avoid orphan), be more lenient: the
      // fill-pass will cascade to fix the source page in subsequent iterations.
      // For underfilled pages raise the split threshold — leaving a page 27% full
      // is far worse than an imperfect split that improves fill at the cost of badness.
      // Uses continuous scaling: the emptier the page, the more degradation we accept.
      //   >= 45% empty: +400, 30% empty: +350, 20% empty: +200, 1-line gap: +300
      //   normal (< 15% empty): +50
      let splitAllowance;
      if (isRetrySplit) {
        splitAllowance = 400;
      } else if (emptyRatio >= 0.25) {
        // Continuous scale: 25% empty → +300, 45%+ empty → +400
        splitAllowance = Math.min(400, Math.round(200 + emptyRatio * 450));
      } else if (remainingLines <= 1) {
        splitAllowance = 350; // delta=-1 compensation (raised from 300 to compensate reduced fragment penalty)
      } else if (remainingLines <= 2) {
        // 2-line gap: very constrained, widow penalty already scaled to 0.2.
        // Use a generous fixed allowance so the reduced widow cost can actually unlock splits.
        splitAllowance = 400;
      } else if (emptyRatio >= 0.08) {
        // Medium underfill (8-25% empty, ~1-4 lines free at 55-line pages):
        // enough space to warrant a moderately imperfect split rather than leaving the page underused.
        // Continuous scale: 8% → +120, 25% → +250 (bridges into the ≥0.25 tier).
        // (Was 8%→50, 25%→150 — raised to absorb the reduced widow penalty at rem<=2.)
        splitAllowance = Math.round(120 + (emptyRatio - 0.08) * 765); // 765 = (250-120)/(0.25-0.08)
      } else {
        splitAllowance = 50;
      }
      const splitThreshold = badnessBefore + splitAllowance;
      if (splitBadnessAfter > splitThreshold) {
        log.record('fill', 'reject', i + 1, { tag, text: firstEl.textContent.substring(0, 60), reason: 'badness-split', before: { score: +badnessBefore.toFixed(0), fillPct: +(currentFill * 100).toFixed(0) }, after: { score: +splitBadnessAfter.toFixed(0), destFill: +(qSplitCurrent.fillPct * 100).toFixed(0), srcScore: +qSplitSource.score.toFixed(0), srcScoreGated: +srcScoreForGate.toFixed(0) }, delta: +(badnessBefore - splitBadnessAfter).toFixed(0), features: { remainingLines, emptyRatio: +emptyRatio.toFixed(2), splitAllowance, threshold: +splitThreshold.toFixed(0), chunkLines, restLines, widowPenalty: widowSoftPenalty, isRetrySplit, destViolations: qSplitCurrent.violations, srcViolations: qSplitSource.violations } });
        // Sliding window: if badness of this element is too high, try the next source
        if (sourceHopCount < MAX_SOURCE_HOPS) {
          sourceHopCount++;
          sourceStartIdx = nextIdx + 1;
          log.record('fill', 'hop', i + 1, { hop: sourceHopCount, reason: 'badness-split', newSourceStart: sourceStartIdx });
          continue;
        }
        break;
      }
      // Hard constraint: never create heading_at_bottom on destination (split path)
      if (qSplitCurrent.violations.includes('heading_at_bottom')) break;
      // Hard constraint: never strand heading at bottom of source
      if (qSplitSource.violations.includes('heading_at_bottom')) break;
      if (currentFill >= FILL_PASS_RUNT_MIN_CURRENT_FILL
          && qSplitCurrent.fillPct >= FILL_PASS_RUNT_MIN_RESULT_FILL
          && qSplitCurrent.violations.includes('runt_line')) {
        log.record('fill', 'reject', i + 1, {
          tag,
          text: firstEl.textContent.substring(0, 60),
          reason: 'short-last-line',
          currentFill: +currentFill.toFixed(2),
          afterFillPct: +(qSplitCurrent.fillPct * 100).toFixed(0)
        });
        break;
      }

      // Place the split chunk onto the current page, then immediately try to merge
      // adjacent split fragments. This handles cascading splits (e.g. two consecutive
      // fill-pass splits of the same paragraph) where the chunk has data-continuation
      // but the last element of the page is not a direct predecessor tag-match.
      // Rather than relying on the tag check here, we always append first and let
      // mergeSplitFragments() do the merge via its Pass 1 (data-continuation check)
      // or Pass 2 (end-of-sentence heuristic).
      if (process.env.NODE_ENV === 'development') {
        const dbgEl = getFirstElement(chunk);
        const chunkIndent = dbgEl ? (dbgEl.style || '').match(/text-indent:\s*([^;]+)/)?.[1] ?? '?' : '?';
        log.record('fill', 'split-chunk-debug', i + 1, { isContChunk, chunkIndent, chunkText: htmlToText(dbgEl?.innerHTML || '').substring(0, 60), chunkHtmlStart: chunk.substring(0, 200) });
      }
      // Propagate fragment IDs on the rest chunk
      if (process.env.NODE_ENV === 'development' && firstEl.sourceBlockId) {
        const restIds = deriveFragmentId(firstEl);
        firstEl.fragmentIndex = restIds.fragmentIndex;
        rest = injectBlockIdAttrs(rest, restIds);
      }
      pages[i] = setPageHtml(pages[i], currentHtml + chunk);
      mergeSplitFragments([pages[i]], log);
      pages[nextIdx] = setPageHtml(nextPage, newSourceHtml);
      if (process.env.NODE_ENV === 'development') {
        const hasCont = /data-continuation="true"/.test(rest);
        const srcHasCont = /data-continuation="true"/.test(newSourceHtml);
        log.record('fill', 'rest-cont-check', nextIdx + 1, { hasCont, srcHasCont, restSnippet: rest.substring(0, 120) });
      }
      // Detailed split log: show chunk tail and rest head to detect content gaps
      const chunkPlain = chunk.replace(/<[^>]*>/g, '').trim();
      const restPlain = rest.replace(/<[^>]*>/g, '').trim();
      log.record('fill', 'split', i + 1, { tag, text: firstEl.textContent.substring(0, 60), fromPage: nextIdx + 1, chunkLines, restLines, chunkTail: chunkPlain.slice(-80), restHead: restPlain.substring(0, 80), before: { score: +badnessBefore.toFixed(0) }, after: { score: +splitBadnessAfter.toFixed(0) }, beforeHtml: currentHtml, afterHtml: currentHtml + chunk });
      // Reset window after successful split
      sourceHopCount = 0;
      sourceStartIdx = i + 1;
      break;
    }
  }
  } // end 2-pass loop
};

/**
 * Indent repair pass — fixes <p> elements with text-indent:0 that should have
 * first-line indent.
 *
 * Two cases:
 *   A. Any non-continuation <p> anywhere on a non-chapter-start page that has
 *      text-indent:0 and starts with an uppercase letter.  The most common source
 *      is buildParagraphHtml(isFirstParagraph=true) baking in text-indent:0 for
 *      what was the first paragraph of the chapter — but the fill-pass later moved
 *      it to a different page.
 *   B. Any non-continuation <p> at position index>0 on any page with indent:0
 *      and uppercase start (already caught by restoreIndentIfNeeded during moves,
 *      but this is the safety net).
 *
 * Runs as a global post-process pass so it catches everything that slipped through
 * the per-operation restoreIndentIfNeeded calls.
 *
 * @private
 */
const repairMissingIndents = (pages, safeConfig, log = null) => {
  const indentEm = safeConfig.paragraph?.firstLineIndent || 1.5;
  const targetIndent = `${indentEm}em`;

  for (let pi = 0; pi < pages.length; pi++) {
    const page = pages[pi];
    if (!page || page.isBlank || !page.html) continue;

    // A page is the "first content page" of a chapter in two cases:
    //   1. isFirstChapterPage=true  — title + content on same page (spaced/halfPage/continuous layout)
    //   2. The immediately preceding non-blank page has isTitleOnlyPage=true — fullPage layout where
    //      the title occupies its own page and the first paragraph is on the next page.
    let prevNonBlank = null;
    for (let pj = pi - 1; pj >= 0; pj--) {
      if (!pages[pj]?.isBlank) { prevNonBlank = pages[pj]; break; }
    }
    const isFirstContentPage = page.isFirstChapterPage || prevNonBlank?.isTitleOnlyPage === true;

    const children = getPageBlocks(page);
    let changed = false;

    const repairedChildren = children.map((el, idx) => {
      if ((el.tag || '').toUpperCase() !== 'P') return el;

      // Skip continuation chunks — they deliberately have no indent
      const isCont = el.dataset?.continuation === 'true';
      if (isCont) return el;

      // Exempt: paragraph marked as first-paragraph at build time by buildParagraphHtml.
      // This is the authoritative signal — independent of page flags or position.
      if (el.dataset?.firstParagraph === 'true') return el;

      // Check current indent value
      const styleStr = el.style || '';
      const indentM = styleStr.match(/text-indent\s*:\s*([^;]+)/i);
      const indentVal = indentM ? parseFloat(indentM[1]) : null;
      const hasZeroIndent = indentVal === null || indentVal === 0;
      if (!hasZeroIndent) return el;

      // Exempt: first <p> (non-continuation, non-splitHead) on a chapter-start page.
      // Covers both layout variants: spaced (isFirstChapterPage) and fullPage (prevNonBlank.isTitleOnlyPage).
      if (isFirstContentPage) {
        const firstContentPIdx = children.findIndex(
          c => (c.tag || '').toUpperCase() === 'P'
            && c.dataset?.continuation !== 'true'
            && c.dataset?.splitHead !== 'true'
        );
        if (idx === firstContentPIdx) return el;
      }

      // Check if first alphabetic character is uppercase (new paragraph, not split-rest)
      const firstLetter = el.textContent.trim().match(/\p{L}/u)?.[0] || '';
      const startsUpper = firstLetter !== '' &&
        firstLetter === firstLetter.toUpperCase() &&
        firstLetter !== firstLetter.toLowerCase();

      if (!startsUpper) {
        // Lowercase start at index > 0 with no data-continuation = split-rest that lost
        // its attribute. Re-add data-continuation so mergeSplitFragments can detect it.
        const alreadyHasCont = /data-continuation\s*=\s*["']true["']/i.test(el.outerHtml);
        if (!alreadyHasCont) {
          const tagM = el.outerHtml.match(/^<p(\s|>)/i);
          if (tagM) {
            const newOuter = el.outerHtml.replace(/^<p(\s|>)/i, `<p data-continuation="true"$1`);
            if (newOuter !== el.outerHtml) {
              changed = true;
              if (log) {
                log.record('repair', 'added-continuation', page.pageNumber ?? 0, {
                  idx,
                  text: (el.textContent || '').substring(0, 60)
                });
              }
              return { ...el, outerHtml: newOuter, dataset: { ...el.dataset, continuation: 'true' } };
            }
          }
        }
        return el;
      }

      // Restore indent
      let newOuter;
      if (indentM) {
        newOuter = el.outerHtml.replace(
          /\bstyle\s*=\s*"([^"]*)"/,
          (_, s) => `style="${s.replace(/text-indent\s*:[^;]+;?/i, `text-indent:${targetIndent};`)}"`
        );
      } else if (/\bstyle\s*=\s*"/.test(el.outerHtml)) {
        newOuter = el.outerHtml.replace(
          /\bstyle\s*=\s*"([^"]*)"/,
          (_, s) => `style="${s}text-indent:${targetIndent};"`
        );
      } else {
        // No style attribute — insert one
        newOuter = el.outerHtml.replace(/^(<p)(\s|>)/, `$1 style="text-indent:${targetIndent};"$2`);
      }

      if (newOuter !== el.outerHtml) {
        changed = true;
        if (log) {
          log.record('repair', 'added-indent', page.pageNumber ?? 0, {
            idx,
            isFirstChapterPage: !!page.isFirstChapterPage,
            isFirstContentPage,
            text: (el.textContent || '').substring(0, 60)
          });
        }
        return { ...el, outerHtml: newOuter };
      }
      return el;
    });

    if (changed) {
      Object.assign(page, setPageBlocks(page, repairedChildren));
    }
  }
};

/**
 * E8: Merge split paragraph fragments on the same page.
 *
 * After greedy pagination + fill-pass, a page may contain two (or more) <p>
 * elements that are fragments of the same original paragraph. This happens when:
 *   - Greedy pass splits paragraph P: first chunk → page N, rest → page N+1
 *   - Fill-pass then moves/splits content from N+1 back to N
 *   - Result: page N has the first chunk AND part of the rest as separate <p>'s
 *
 * Detection: adjacent <p> elements where one has data-continuation='true'
 * indicate they were split from the same paragraph. Merge them into one.
 *
 * Only merges with the IMMEDIATELY preceding same-tag element.
 * If any other element type sits between the continuation and its predecessor,
 * we stop searching — they are not adjacent split fragments (the arrangement is intentional).
 *
 * @private
 */
const mergeSplitFragments = (pages, log = null) => {
  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const page = pages[pageIdx];
    if (!page || page.isBlank || !page.html) continue;

    let children = getPageBlocks(page);
    const mergeBeforeHtml = page.html;
    let changed = false;

    // Helper: rebuild element outerHtml with merged innerHTML and updated text-align-last
    const buildMerged = (base, addedInner) => {
      const mergedInner = base.innerHTML + ' ' + addedInner;
      // Always use text-align-last:left — "justify" stretches the last visible line
      // of a fragment, making it appear wider than other paragraphs on the page.
      const newStyle = (base.style || '')
        .replace(/text-align-last:[^;]+;?/gi, '')
        .replace(/data-continuation:[^;]+;?/gi, '')
        + `text-align-last:left;`;
      // Remove data-continuation attribute and update style
      const tag = base.tag.toLowerCase();
      let newOuter = base.outerHtml
        .replace(/\s*data-continuation="[^"]*"/gi, '')
        .replace(/\bstyle="[^"]*"/, `style="${newStyle}"`);
      // Rebuild with merged inner
      const openTagEnd = newOuter.indexOf('>');
      if (openTagEnd === -1) return `<${tag}>${mergedInner}</${tag}>`;
      return newOuter.slice(0, openTagEnd + 1) + mergedInner + `</${tag}>`;
    };

    // Pass 1: merge elements with data-continuation='true' with their predecessor.
    for (let i = 1; i < children.length; i++) {
      const el = children[i];
      if (el.dataset?.continuation !== 'true') continue;
      const tag = el.tag;

      for (let j = i - 1; j >= 0; j--) {
        const prev = children[j];
        if (prev.tag !== tag) break;

        const merged = { ...prev, outerHtml: buildMerged(prev, el.innerHTML), innerHTML: prev.innerHTML + ' ' + el.innerHTML };
        children = [...children.slice(0, j), merged, ...children.slice(j + 1, i), ...children.slice(i + 1)];
        i = j; // re-check from merged position
        changed = true;
        if (log) log.record('merge', 'pass1-merge', pageIdx + 1, { tag, text: htmlToText(merged.innerHTML).substring(0, 60), beforeHtml: mergeBeforeHtml, afterHtml: serializeBlocks(children) });
        break;
      }
    }

    // Pass 2: merge adjacent <p> elements where the first ends mid-sentence.
    for (let i = 0; i < children.length - 1; i++) {
      const el = children[i];
      const next = children[i + 1];
      if (el.tag !== 'P' || next.tag !== 'P') continue;

      if (/font-weight:\s*bold/i.test(el.style || '')) continue;
      if (/font-weight:\s*bold/i.test(next.style || '')) continue;

      const elText = el.textContent.trim();
      if (!elText || /[.!?»"]\s*$/.test(elText)) continue;

      const nextStyle = next.style || '';
      const nextHasZeroIndent = /text-indent:\s*0/.test(nextStyle);
      const nextHasNoIndent = !/text-indent/.test(nextStyle);
      const nextText = next.textContent.trim();
      const nextStartsLowercase = /^[a-záéíóúüñ]/.test(nextText);
      if (!nextHasZeroIndent && !nextHasNoIndent && !nextStartsLowercase) {
        if (log) log.record('merge', 'pass2-skip', pageIdx + 1, { reason: 'indent-check', text: elText.substring(0, 60) });
        continue;
      }

      const merged = { ...el, outerHtml: buildMerged(el, next.innerHTML), innerHTML: el.innerHTML + ' ' + next.innerHTML };
      children = [...children.slice(0, i), merged, ...children.slice(i + 2)];
      i--;
      changed = true;
      if (log) log.record('merge', 'pass2-merge', pageIdx + 1, { text: htmlToText(merged.innerHTML).substring(0, 60) });
    }

    if (changed) {
      Object.assign(page, setPageBlocks(page, children));
    }
  }
};

/**
 * E6: Distribute remaining vertical whitespace proportionally among block elements.
 * Like InDesign's "justify all lines" — prevents noticeable underfill by adding
 * small margin-bottom increments to inter-element gaps.
 *
 * Rules:
 *   - Only pages with gap >= 1 lineHeight are adjusted
 *   - Max addition per gap: 0.5 lineHeight (keeps spacing subtle)
 *   - Skips blank, title-only, and first-chapter pages (intentional spacing)
 *   - Skips pages ending with a heading (handled by fixHeadingsAtBottom)
 *
 * @private
 */
const distributeVerticalSpace = (pages, layoutCtx, canvasCtx) => {
  const { contentHeight, lineHeightPx } = layoutCtx;
  const measure = (html) => measureHtmlHeight(html, canvasCtx);

  for (const page of pages) {
    if (!page || page.isBlank || page.isTitleOnlyPage || page.isChapterLastPage || !page.html) continue;

    const actualHeight = measure(page.html);
    const freeSpace = contentHeight - actualHeight;
    // Need at least half a line of free space to bother distributing.
    if (freeSpace < lineHeightPx * 0.5) continue;
    // Below 60% fill the gap is structural — leave it at the bottom.
    if (actualHeight / contentHeight < 0.60) continue;

    const children = getPageBlocks(page);
    if (children.length < 2) continue;
    const last = children[children.length - 1];
    if (/^H[1-6]$/i.test(last.tag)) continue;

    // All children participate in distribution — including the chapter title block.
    // This closes the gap between chapter title and first paragraph that was
    // previously left untouched (old code excluded title from distributable set).
    // Distribution is UNIFORM across all gaps to avoid uneven paragraph spacing.
    const numGaps = children.length - 1;
    if (numGaps < 1) continue;

    // Cap per-gap growth so pages with few elements don't get huge rivers.
    // Keep spacing subtle: max 0.35 lineH per gap (≈3.5px at lineH=10).
    // This fills vertical whitespace without creating visible paragraph separation.
    const perGapCap = lineHeightPx * 0.35;
    const maxPerGap = Math.min(freeSpace / numGaps, perGapCap);

    // Capture original margins for ALL children.
    const origMargins = children.map(el => {
      const m = (el.style || '').match(/margin-bottom:\s*([\d.]+)px/);
      return m ? parseFloat(m[1]) : 0;
    });

    // Apply uniform gap delta to every element except the last.
    const applyGap = (g) => {
      return children.map((el, idx) => {
        if (idx >= numGaps) return el.outerHtml;  // last element, no gap after it
        const newMargin = (origMargins[idx] + g).toFixed(2);
        const newStyle = (el.style || '')
          .replace(/margin-bottom:\s*[\d.]+px;?/g, '')
          .trimEnd()
          + `;margin-bottom:${newMargin}px`;
        if (/\bstyle="/.test(el.outerHtml)) {
          return el.outerHtml.replace(/\bstyle="[^"]*"/, `style="${newStyle}"`);
        }
        return el.outerHtml.replace(/^(<[a-zA-Z][^\s/>]*)/, `$1 style="${newStyle}"`);
      }).join('');
    };

    // Binary search for the largest per-gap delta that fits.
    let lo = 0;
    let hi = maxPerGap;
    let bestGap = 0;
    for (let iter = 0; iter < 10; iter++) {
      const mid = (lo + hi) / 2;
      if (measure(applyGap(mid)) <= contentHeight - 2) {
        bestGap = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }

    if (bestGap >= 0.5) {
      Object.assign(page, setPageHtml(page, applyGap(bestGap)));
    }
  }
};

/**
 * E5: Fix orphaned headings/bold-paragraphs left at the bottom of a page
 * after the fill-pass moves content forward, exposing a heading as the
 * last element. Moves the heading to the top of the next same-chapter page.
 *
 * @private
 */
const fixHeadingsAtBottom = (pages, canvasCtx, layoutCtx, log) => {
  for (let i = 0; i < pages.length - 1; i++) {
    const page = pages[i];
    if (!page || page.isBlank || !page.html) continue;

    const children = getPageBlocks(page);
    if (children.length === 0) continue;

    const last = children[children.length - 1];
    const isHeading = /^H[1-6]$/i.test(last.tag);
    // Bold paragraph = subtitle-like: only if ≥80% of text is bold.
    // Paragraphs with inline bold opener (e.g. bold question + regular text)
    // are NOT subtitles and should not be moved.
    let isBoldPara = false;
    if ((last.tag || '').toUpperCase() === 'P') {
      if (/font-weight:\s*(?:bold|[7-9]00)/.test(last.style || '')) {
        isBoldPara = true;
      } else if (/^<p[^>]*>\s*<(?:strong|b)\b/i.test(last.outerHtml)) {
        const totalText = htmlToText(last.innerHTML).trim();
        const { boldLen } = getBoldTextRatio(last.outerHtml);
        isBoldPara = totalText.length > 0 && (boldLen / totalText.length) >= 0.8;
      }
    }

    if (!isHeading && !isBoldPara) continue;

    // Find next non-blank page in same chapter
    let ni = i + 1;
    while (ni < pages.length && pages[ni]?.isBlank) ni++;
    if (ni >= pages.length) continue;
    const next = pages[ni];
    if (page.chapterTitle !== next.chapterTitle) continue;

    // Move heading to top of next page — only if it fits without overflow
    const headingHtml = last.outerHtml;
    const mergedHtml = headingHtml + (next.html || '');

    if (!canAcceptHtml(mergedHtml, layoutCtx.contentHeight, canvasCtx)) {
      // Next page is full. Try cascading: push elements forward through a chain
      // of pages to make room for the heading. Supports up to 2-level cascade.
      let cascaded = false;
      const nextChildren = getPageBlocks(next);
      if (nextChildren.length >= 2) {
        let ni2 = ni + 1;
        while (ni2 < pages.length && pages[ni2]?.isBlank) ni2++;
        if (ni2 < pages.length) {
          const nextNext = pages[ni2];
          if (nextNext && !nextNext.isTitleOnlyPage && !nextNext.isFirstChapterPage
              && next.chapterTitle === nextNext.chapterTitle) {
            const donorEl = nextChildren[nextChildren.length - 1];
            const newNextHtml = serializeBlocks(nextChildren.slice(0, nextChildren.length - 1)).trim();
            const donorPlusNextNext = donorEl.outerHtml + (nextNext.html || '');

            // Level 1 cascade: donor fits on page+2 directly
            if (newNextHtml && canAcceptHtml(donorPlusNextNext, layoutCtx.contentHeight, canvasCtx)) {
              const mergedAfterCascade = headingHtml + newNextHtml;
              if (canAcceptHtml(mergedAfterCascade, layoutCtx.contentHeight, canvasCtx)) {
                const qBefore = evaluatePageQualityCanvas(page.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
                  + evaluatePageQualityCanvas(next.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
                  + evaluatePageQualityCanvas(nextNext.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score;
                const remainingHtmlCascade = serializeBlocks(children.slice(0, children.length - 1)).trim();
                const qAfter = evaluatePageQualityCanvas(remainingHtmlCascade || '', layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
                  + evaluatePageQualityCanvas(mergedAfterCascade, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
                  + evaluatePageQualityCanvas(donorPlusNextNext, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score;
                if (qAfter <= qBefore + 100) {
                  pages[i]   = setPageHtml(page, remainingHtmlCascade, { isBlank: !remainingHtmlCascade });
                  pages[ni]  = setPageHtml(next, mergedAfterCascade);
                  pages[ni2] = setPageHtml(nextNext, donorPlusNextNext);
                  log.record('heading-fix', 'cascade', i + 1, { tag: last.tag, text: htmlToText(last.innerHTML).substring(0, 60), toPage: ni + 1, cascadeTo: ni2 + 1 });
                  cascaded = true;
                }
              }
            }

            // Level 2 cascade: page+2 is also full — try pushing its last element to page+3
            if (!cascaded && newNextHtml) {
              const nnChildren = getPageBlocks(nextNext);
              if (nnChildren.length >= 2) {
                let ni3 = ni2 + 1;
                while (ni3 < pages.length && pages[ni3]?.isBlank) ni3++;
                if (ni3 < pages.length) {
                  const p3 = pages[ni3];
                  if (p3 && !p3.isTitleOnlyPage && !p3.isFirstChapterPage
                      && nextNext.chapterTitle === p3.chapterTitle) {
                    const donor2 = nnChildren[nnChildren.length - 1];
                    const newNNHtml = serializeBlocks(nnChildren.slice(0, nnChildren.length - 1)).trim();
                    const donor2PlusP3 = donor2.outerHtml + (p3.html || '');
                    if (newNNHtml && canAcceptHtml(donor2PlusP3, layoutCtx.contentHeight, canvasCtx)) {
                      // Now page+2 has room — retry donor from page+1
                      const donorPlusNewNN = donorEl.outerHtml + newNNHtml;
                      if (canAcceptHtml(donorPlusNewNN, layoutCtx.contentHeight, canvasCtx)) {
                        const mergedAfterCascade2 = headingHtml + newNextHtml;
                        if (canAcceptHtml(mergedAfterCascade2, layoutCtx.contentHeight, canvasCtx)) {
                          const remainingHtmlC2 = serializeBlocks(children.slice(0, children.length - 1)).trim();
                          const qBefore2 = evaluatePageQualityCanvas(page.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
                            + evaluatePageQualityCanvas(next.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
                            + evaluatePageQualityCanvas(nextNext.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
                            + evaluatePageQualityCanvas(p3.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score;
                          const qAfter2 = evaluatePageQualityCanvas(remainingHtmlC2 || '', layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
                            + evaluatePageQualityCanvas(mergedAfterCascade2, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
                            + evaluatePageQualityCanvas(donorPlusNewNN, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
                            + evaluatePageQualityCanvas(donor2PlusP3, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score;
                          if (qAfter2 <= qBefore2 + 150) {
                            pages[i]   = setPageHtml(page, remainingHtmlC2, { isBlank: !remainingHtmlC2 });
                            pages[ni]  = setPageHtml(next, mergedAfterCascade2);
                            pages[ni2] = setPageHtml(nextNext, donorPlusNewNN);
                            pages[ni3] = setPageHtml(p3, donor2PlusP3);
                            log.record('heading-fix', 'cascade-2', i + 1, { tag: last.tag, text: htmlToText(last.innerHTML).substring(0, 60), toPage: ni + 1, cascadeTo: ni3 + 1 });
                            cascaded = true;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Fallback: split the first splittable paragraph on page+1 to make room
      // for the heading. Overflow goes to a newly inserted page (avoids
      // requiring page+2 to have spare capacity).
      if (!cascaded && nextChildren.length >= 2) {
        const headingHeight = measureHtmlHeight(headingHtml, canvasCtx);
        const budget = layoutCtx.contentHeight - DOM_SLACK;
        // Find how many whole elements from page+1 fit alongside the heading.
        // Then push the rest to a new overflow page.
        let usedHeight = headingHeight;
        let fitCount = 0;
        for (let si = 0; si < nextChildren.length; si++) {
          const elH = measureHtmlHeight(nextChildren[si].outerHtml, canvasCtx);
          if (usedHeight + elH <= budget) {
            usedHeight += elH;
            fitCount = si + 1;
          } else {
            // Try splitting this element if it's a splittable paragraph
            if (!(/^H[1-6]$/i.test(nextChildren[si].tag)) && elH > layoutCtx.lineHeightPx * 4) {
              const splitBudget = budget - usedHeight;
              if (splitBudget >= layoutCtx.lineHeightPx * 3) {
                const chunks = splitInTwo(
                  nextChildren[si].outerHtml, null, canvasCtx, splitBudget,
                  layoutCtx.contentHeight, layoutCtx.textAlign,
                  false, 1.5, false, canvasCtx
                );
                if (chunks && chunks.length === 2 && chunks[0] && chunks[1]) {
                  const ch = measureHtmlHeight(chunks[0], canvasCtx);
                  if (ch > 0 && ch <= splitBudget + DOM_SLACK) {
                    // Partial fit: heading + fitCount whole elements + first chunk
                    const keepHtml = headingHtml
                      + nextChildren.slice(0, fitCount).map(e => e.outerHtml).join('')
                      + chunks[0];
                    const overflowHtml = chunks[1]
                      + nextChildren.slice(si + 1).map(e => e.outerHtml).join('');
                    const remainingHtmlSplit = serializeBlocks(children.slice(0, children.length - 1)).trim();
                    const qBefore = evaluatePageQualityCanvas(page.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
                      + evaluatePageQualityCanvas(next.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score;
                    const qAfter = evaluatePageQualityCanvas(remainingHtmlSplit || '', layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
                      + evaluatePageQualityCanvas(keepHtml, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
                      + evaluatePageQualityCanvas(overflowHtml, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score;
                    if (qAfter <= qBefore + 200) {
                      pages[i]  = setPageHtml(page, remainingHtmlSplit, { isBlank: !remainingHtmlSplit });
                      pages[ni] = setPageHtml(next, keepHtml);
                      const overflowPage = {
                        html: overflowHtml,
                        blocks: parseHtmlElements(overflowHtml),
                        chapterTitle: next.chapterTitle,
                        currentSubheader: next.currentSubheader || '',
                        isTitleOnlyPage: false,
                        isFirstChapterPage: false,
                        shouldShowPageNumber: next.shouldShowPageNumber !== false,
                      };
                      pages.splice(ni + 1, 0, overflowPage);
                      log.record('heading-fix', 'split-to-fit', i + 1, { tag: last.tag, text: htmlToText(last.innerHTML).substring(0, 60), toPage: ni + 1, insertedPage: ni + 2, fitCount, splitAt: si });
                      cascaded = true;
                      i++;
                    }
                  }
                }
              }
            }
            break;
          }
        }
        // All whole elements fit but page was "full" due to margin/slack — repartition
        if (!cascaded && fitCount >= 1 && fitCount < nextChildren.length) {
          const keepHtml = headingHtml + nextChildren.slice(0, fitCount).map(e => e.outerHtml).join('');
          const overflowHtml = nextChildren.slice(fitCount).map(e => e.outerHtml).join('');
          if (canAcceptHtml(keepHtml, layoutCtx.contentHeight, canvasCtx) && overflowHtml) {
            const remainingHtmlSplit = serializeBlocks(children.slice(0, children.length - 1)).trim();
            const qBefore = evaluatePageQualityCanvas(page.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
              + evaluatePageQualityCanvas(next.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score;
            const qAfter = evaluatePageQualityCanvas(remainingHtmlSplit || '', layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
              + evaluatePageQualityCanvas(keepHtml, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
              + evaluatePageQualityCanvas(overflowHtml, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score;
            if (qAfter <= qBefore + 200) {
              pages[i]  = setPageHtml(page, remainingHtmlSplit, { isBlank: !remainingHtmlSplit });
              pages[ni] = setPageHtml(next, keepHtml);
              const overflowPage = {
                html: overflowHtml,
                blocks: parseHtmlElements(overflowHtml),
                chapterTitle: next.chapterTitle,
                currentSubheader: next.currentSubheader || '',
                isTitleOnlyPage: false,
                isFirstChapterPage: false,
                shouldShowPageNumber: next.shouldShowPageNumber !== false,
              };
              pages.splice(ni + 1, 0, overflowPage);
              log.record('heading-fix', 'repartition', i + 1, { tag: last.tag, text: htmlToText(last.innerHTML).substring(0, 60), toPage: ni + 1, insertedPage: ni + 2, fitCount });
              cascaded = true;
              i++;
            }
          }
        }
      }

      if (!cascaded) {
        log.record('heading-fix', 'reject', i + 1, { tag: last.tag, text: htmlToText(last.innerHTML).substring(0, 60), reason: 'next-page-full' });
      }
      continue;
    }

    const remainingHtml = serializeBlocks(children.slice(0, children.length - 1)).trim();

    pages[i] = setPageHtml(page, remainingHtml, { isBlank: !remainingHtml });
    pages[ni] = setPageHtml(next, mergedHtml);

    log.record('heading-fix', 'move', i + 1, { tag: last.tag, text: htmlToText(last.innerHTML).substring(0, 60), toPage: ni + 1, beforeHtml: page.html, afterHtml: remainingHtml });
  }
};

/**
 * E4: Cleanup nearly-empty pages after fill pass.
 * Scans backward — merges pages with very little content into previous page.
 * Uses Canvas measurement (deterministic).
 *
 * @private
 */
const cleanupNearlyEmptyPages = (pages, layoutCtx, canvasCtx) => {
  const { contentHeight, lineHeightPx, minOrphanLines } = layoutCtx;
  const measure = (html) => measureHtmlHeight(html, canvasCtx);
  const minContentThreshold = minOrphanLines * lineHeightPx * 0.5;

  for (let i = pages.length - 1; i > 0; i--) {
    const page = pages[i];
    if (!page || page.isBlank || !page.html) continue;

    const prevPage = pages[i - 1];
    if (!prevPage || prevPage.isBlank) continue;
    if (prevPage.chapterTitle !== page.chapterTitle) continue;

    const pageHeight = measure(page.html);
    if (pageHeight >= minContentThreshold || pageHeight <= 0) continue;

    // Try merging into previous page
    const mergedHtml = prevPage.html + page.html;
    if (canAcceptHtml(mergedHtml, contentHeight, canvasCtx)) {
      const prevFill = measure(prevPage.html) / contentHeight;
      const mergedFill = measure(mergedHtml) / contentHeight;
      if (prevFill >= FILL_PASS_RUNT_MIN_CURRENT_FILL
          && mergedFill >= FILL_PASS_RUNT_MIN_RESULT_FILL) {
        const qMerged = evaluatePageQualityCanvas(mergedHtml, contentHeight, lineHeightPx, canvasCtx);
        if (qMerged.violations.includes('runt_line')) continue;
      }

      pages[i - 1] = setPageHtml(prevPage, mergedHtml);
      Object.assign(page, setPageHtml(page, '', { isBlank: true }));
    }
  }
};

/**
 * Invariant: ensure every chapter-starting page is on an odd (right-hand) page.
 * Runs LAST — after all structural mutations (fill-pass, heading fixes, cleanup).
 * If the fill-pass removed pages and shifted chapter positions, this re-inserts
 * the necessary blank pages to restore the odd-page invariant.
 *
 * @private
 */
const enforceChapterStartParity = (pages, safeConfig) => {
  if (safeConfig?.chapterTitle?.startOnRightPage === false) return;

  // Pass 1: Remove stale parity blanks (blank pages immediately before a
  // chapter-start page). This makes the function idempotent — safe to call
  // multiple times after page-count mutations (reopt, fill-pass, smoothing).
  for (let i = pages.length - 1; i >= 1; i--) {
    if (pages[i]?.isFirstChapterPage && pages[i - 1]?.isBlank) {
      pages.splice(i - 1, 1);
    }
  }

  // Pass 2: Insert blanks where needed so chapter starts on a right (odd) page.
  for (let i = 1; i < pages.length; i++) {
    if (!pages[i]?.isFirstChapterPage) continue;

    // Physical page position is i+1 (1-indexed). Must be odd for right-hand page.
    if ((i + 1) % 2 === 0) {
      const blankPage = {
        html: '',
        blocks: [],
        pageNumber: 0,
        isBlank: true,
        chapterTitle: pages[i - 1]?.chapterTitle || '',
        currentSubheader: '',
        isTitleOnlyPage: false,
        isFirstChapterPage: false,
        shouldShowPageNumber: false,
      };
      pages.splice(i, 0, blankPage);
      i++; // skip the blank just inserted
    }
  }
};

// fillPct difference threshold that triggers smoothing (25%)
const SMOOTH_THRESHOLD = 0.25;
// Minimum badness improvement required to accept a smoothing move
const SMOOTH_BADNESS_MIN_DELTA = 50;

/**
 * E7: Smooth page fill imbalance across adjacent same-chapter pages.
 * For pairs where fillPct differs > SMOOTH_THRESHOLD, attempts to move one
 * element from the fuller page to the emptier page. Accepts only if total
 * badness improves by at least SMOOTH_BADNESS_MIN_DELTA.
 *
 * Runs LAST — after both enforceChapterStartParity calls.
 *
 * @private
 */
const smoothPageBalance = (pages, layoutCtx, canvasCtx, log) => {
  const { contentHeight, lineHeightPx, minOrphanLines } = layoutCtx;
  // A source page must have at least this many unused lines before it can donate.
  // Prevents stealing from nearly-full pages (e.g. 99%) just to fill a sparse
  // neighbor, which creates inconsistent fill across odd pages in the same book.
  const MIN_DONOR_SLACK_LINES = (minOrphanLines ?? 2) + 1;

  for (let i = 0; i < pages.length - 1; i++) {
    const page = pages[i];
    // Skip chapter title pages and intentionally-sparse pages — their fill pct
    // is editorial (not an imbalance), same guard as distributeVerticalSpace.
    if (!page || page.isBlank || page.isTitleOnlyPage || page.isFirstChapterPage || !page.html) continue;

    // Find next non-blank page
    let nextIdx = i + 1;
    while (nextIdx < pages.length && pages[nextIdx]?.isBlank) nextIdx++;
    if (nextIdx >= pages.length) continue;
    const next = pages[nextIdx];
    if (!next || !next.html || next.isTitleOnlyPage || next.isFirstChapterPage) continue;
    if (page.chapterTitle !== next.chapterTitle) continue;

    // Multi-attempt loop for severely underfilled pages (chapter-end scenario).
    // Normal pages use 1 attempt — sufficient since they're close to balanced.
    // Severely underfilled pages (< 55%) get up to 8 attempts to move multiple
    // elements until the receiver reaches a reasonable fill level.
    const MAX_SMOOTH_ATTEMPTS = 8;
    for (let attempt = 0; attempt < MAX_SMOOTH_ATTEMPTS; attempt++) {

    const q1 = evaluatePageQualityCanvas(pages[i].html, contentHeight, lineHeightPx, canvasCtx);
    const q2 = evaluatePageQualityCanvas(pages[nextIdx].html, contentHeight, lineHeightPx, canvasCtx);

    // Guard: the DONOR (fuller page) must have enough slack to give.
    // Without this, a 99%-full odd page can be reduced to 85% just to
    // balance a 70% even page — the badness gate approves it but the
    // result is inconsistent fill across odd pages throughout the book.
    //
    // Exception: if the RECEIVER is severely underfilled (< 55%) — i.e. a
    // chapter-end page that is nearly empty — relax the donor slack guard
    // entirely. Moving content forward to fill a 20–40% page is always
    // visually better than leaving it nearly blank, even if the donor
    // drops from 100% to 85%.
    const donorPct = q1.fillPct > q2.fillPct ? q1.fillPct : q2.fillPct;
    const receiverPct = q1.fillPct > q2.fillPct ? q2.fillPct : q1.fillPct;
    const isSeverelyUnderfilled = receiverPct < 0.55;
    const donorSlackLines = Math.floor((1 - donorPct) * contentHeight / lineHeightPx);
    if (!isSeverelyUnderfilled && donorSlackLines < MIN_DONOR_SLACK_LINES) break;

    // Only smooth if imbalance exceeds threshold
    if (Math.abs(q1.fillPct - q2.fillPct) <= SMOOTH_THRESHOLD) break;

    const badnessBefore = q1.score + q2.score;

    // Determine direction: move from fuller page to emptier page
    const fromIdx = q1.fillPct > q2.fillPct ? i      : nextIdx;
    const toIdx   = q1.fillPct > q2.fillPct ? nextIdx : i;

    const fromEls = getPageBlocks(pages[fromIdx]);
    if (fromEls.length === 0) break;

    // Forward move (toIdx > fromIdx): take LAST element of fromPage, PREPEND to toPage.
    // Backward move (toIdx < fromIdx): take FIRST element of fromPage, APPEND to toPage.
    // This preserves reading order: content flows from the bottom of one page to the top
    // of the next (or from the top of one page to the bottom of the previous).
    const elToMove = toIdx > fromIdx ? fromEls[fromEls.length - 1] : fromEls[0];
    if (!elToMove) break;

    const elHtml = elToMove.outerHtml;
    const fromRestEls = toIdx > fromIdx ? fromEls.slice(0, fromEls.length - 1) : fromEls.slice(1);
    const fromRest = serializeBlocks(fromRestEls).trim();
    if (!fromRest) break; // Would empty fromPage — skip

    const toNewHtml = toIdx > fromIdx
      ? elHtml + (pages[toIdx].html || '')   // forward: element goes to TOP of next page
      : (pages[toIdx].html || '') + elHtml;  // backward: element goes to BOTTOM of prev page

    if (!canAcceptHtml(toNewHtml, contentHeight, canvasCtx)) break;

    const qFrom = evaluatePageQualityCanvas(fromRest, contentHeight, lineHeightPx, canvasCtx);
    const qTo   = evaluatePageQualityCanvas(toNewHtml, contentHeight, lineHeightPx, canvasCtx);

    // Hard constraints — the badness gate alone is insufficient when pages are
    // severely underfilled (huge badness delta can override a +800 heading penalty).
    if (qFrom.violations.includes('heading_at_bottom')) break;
    if (qTo.violations.includes('heading_at_bottom')) break;
    const changedEndBeforeFill = toIdx > fromIdx
      ? (fromIdx === i ? q1.fillPct : q2.fillPct)
      : (toIdx === i ? q1.fillPct : q2.fillPct);
    const changedEndAfterFill = toIdx > fromIdx ? qFrom.fillPct : qTo.fillPct;
    const changedEndQ = toIdx > fromIdx ? qFrom : qTo;
    if (changedEndBeforeFill >= FILL_PASS_RUNT_MIN_CURRENT_FILL
        && changedEndAfterFill >= FILL_PASS_RUNT_MIN_RESULT_FILL
        && changedEndQ.violations.includes('runt_line')) {
      const shortLinePage = toIdx > fromIdx ? fromIdx + 1 : toIdx + 1;
      log.record('smooth', 'reject', shortLinePage, {
        fromPage: fromIdx + 1,
        toPage: toIdx + 1,
        reason: 'short-last-line',
        text: '',
        shortLineScore: changedEndQ.score
      });
      break;
    }

    const badnessAfter = qFrom.score + qTo.score;

    if (badnessAfter < badnessBefore - SMOOTH_BADNESS_MIN_DELTA) {
      const smoothBeforeHtml = pages[fromIdx].html;
      pages[fromIdx] = setPageHtml(pages[fromIdx], fromRest);

      // Reunify split fragments if the moved element is a continuation chunk.
      // A backward move (toIdx < fromIdx) appends the element to the bottom of the
      // previous page — if it is a data-continuation chunk and the page already ends
      // with the first-chunk of the same paragraph, merge them into one <p> now.
      // This avoids leaving two adjacent <p> elements that look like a new paragraph.
      let finalToHtml = toNewHtml;
      if (toIdx < fromIdx) {
        const movedEl = getFirstElement(elHtml);
        const isCont = movedEl?.dataset?.continuation === 'true'
          && (movedEl.tag === 'P' || movedEl.tag === 'BLOCKQUOTE');
        if (isCont) {
          const toEls = parseHtmlElements(toNewHtml);
          // The appended continuation is the last child; its predecessor should be the first chunk
          const lastChild = toEls[toEls.length - 1];
          const secondLast = toEls[toEls.length - 2];
          if (secondLast && secondLast.tag === lastChild?.tag) {
            const reunified = mergeIntoOne(secondLast.outerHtml, lastChild.outerHtml);
            finalToHtml = serializeBlocks(toEls.slice(0, toEls.length - 2)) + reunified;
          }
        }
      }

      pages[toIdx] = setPageHtml(pages[toIdx], finalToHtml);
      log.record('smooth', 'move', fromIdx + 1, { toPage: toIdx + 1, attempt, before: { score: +badnessBefore.toFixed(0), fillPct: +(q1.fillPct * 100).toFixed(0) }, after: { score: +badnessAfter.toFixed(0), fillPct: +(qTo.fillPct * 100).toFixed(0) }, beforeHtml: smoothBeforeHtml, afterHtml: fromRest });
      // If receiver is now above 70%, balance is good enough — stop moving
      if (qTo.fillPct >= 0.70) break;
    } else {
      break; // no improvement — stop attempts for this pair
    }
    } // end attempt loop
  }
};

/**
 * Consolidated repair pass: handles runt_line, widow, and orphan violations
 * in a single multi-pass sweep.
 *
 * For each page with violations, evaluates all possible single-element moves
 * (push last forward, pull first backward) and picks the best one.
 *
 * @private
 */
const repairPageDefects = (pages, layoutCtx, canvasCtx, log) => {
  const { contentHeight, lineHeightPx } = layoutCtx;
  const measure = (html) => measureHtmlHeight(html, canvasCtx);
  const minOrphanLines = layoutCtx.minOrphanLines ?? 2;

  for (let pass = 0; pass < 3; pass++) {
    let changedAny = false;

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (!page || page.isBlank || page.isTitleOnlyPage || !page.html) continue;

      const qPage = evaluatePageQualityCanvas(page.html, contentHeight, lineHeightPx, canvasCtx);
      const viols = qPage.violations;

      const hasRunt   = viols.includes('runt_line');
      const hasWidow  = viols.includes('widow');
      const hasOrphan = viols.includes('orphan');
      if (!hasRunt && !hasWidow && !hasOrphan) continue;

      const pageEls = getPageBlocks(page);
      if (pageEls.length < 2) continue;

      // Find adjacent pages
      let nextIdx = i + 1;
      while (nextIdx < pages.length && pages[nextIdx]?.isBlank) nextIdx++;
      let prevIdx = i - 1;
      while (prevIdx >= 0 && pages[prevIdx]?.isBlank) prevIdx--;

      const nextPage = nextIdx < pages.length ? pages[nextIdx] : null;
      const prevPage = prevIdx >= 0 ? pages[prevIdx] : null;
      const sameChapterNext = nextPage && !nextPage.isTitleOnlyPage && !nextPage.isFirstChapterPage
        && nextPage.html && page.chapterTitle === nextPage.chapterTitle;
      const sameChapterPrev = prevPage && !prevPage.isTitleOnlyPage && prevPage.html
        && prevPage.chapterTitle === page.chapterTitle;

      let bestMove = null; // { type, improvement, apply() }

      // === PUSH LAST ELEMENT FORWARD (fixes runt_line, widow) ===
      if ((hasRunt || hasWidow) && sameChapterNext && !page.isFirstChapterPage) {
        const lastEl = pageEls[pageEls.length - 1];
        const lastTag = (lastEl?.tag || '').toUpperCase();
        const isHeading = /^H[1-6]$/.test(lastTag);
        const isBold = lastTag === 'P' && isMostlyBoldParagraph(lastEl);

        if (!isHeading && !isBold) {
          // For widow: confirm it's a single-line P
          const skipWidow = hasWidow && !hasRunt
            && (lastTag !== 'P' || Math.floor(measure(lastEl.outerHtml) / lineHeightPx) > 1);

          if (!skipWidow) {
            const newSrcHtml = serializeBlocks(pageEls.slice(0, pageEls.length - 1)).trim();
            if (newSrcHtml) {
              const newSrcFill = measure(newSrcHtml) / contentHeight;
              const minFill = hasWidow ? 0.75 : 0.50;
              if (newSrcFill >= minFill) {
                const qNewSrc = evaluatePageQualityCanvas(newSrcHtml, contentHeight, lineHeightPx, canvasCtx);
                if (!qNewSrc.violations.includes('heading_at_bottom')) {
                  const newNextHtml = lastEl.outerHtml + (nextPage.html || '');
                  if (canAcceptHtml(newNextHtml, contentHeight, canvasCtx)) {
                    const qNewNext = evaluatePageQualityCanvas(newNextHtml, contentHeight, lineHeightPx, canvasCtx);
                    const nextScore = evaluatePageQualityCanvas(nextPage.html, contentHeight, lineHeightPx, canvasCtx).score;
                    const scoreBefore = qPage.score + nextScore;
                    const scoreAfter = qNewSrc.score + qNewNext.score;
                    const improvement = scoreBefore - scoreAfter;
                    if (improvement >= -50 && (!bestMove || improvement > bestMove.improvement)) {
                      bestMove = {
                        type: hasRunt ? 'runt-push' : 'widow-push',
                        improvement,
                        apply: () => {
                          pages[i] = setPageHtml(page, newSrcHtml);
                          pages[nextIdx] = setPageHtml(nextPage, newNextHtml);
                          mergeSplitFragments([pages[i], pages[nextIdx]], log);
                          log.record('defect-fix', hasRunt ? 'runt-push' : 'widow-push', i + 1, {
                            toPage: nextIdx + 1,
                            text: (lastEl.textContent || '').substring(0, 50),
                            scoreBefore, scoreAfter
                          });
                        }
                      };
                    }
                  }
                }
              }
            }
          }
        }
      }

      // === PULL FIRST ELEMENT OF NEXT PAGE BACKWARD (fixes runt_line via reflow) ===
      if (hasRunt && sameChapterNext && !page.isFirstChapterPage) {
        const nextEls = nextPage ? getPageBlocks(nextPage) : [];
        if (nextEls.length >= 2) {
          const firstNextEl = nextEls[0];
          const firstNextTag = (firstNextEl?.tag || '').toUpperCase();
          if (!/^H[1-6]$/.test(firstNextTag)) {
            const pulledHtml = page.html + firstNextEl.outerHtml;
            if (canAcceptHtml(pulledHtml, contentHeight, canvasCtx)) {
              const newNextHtml = serializeBlocks(nextEls.slice(1)).trim();
              if (newNextHtml) {
                const qPulled = evaluatePageQualityCanvas(pulledHtml, contentHeight, lineHeightPx, canvasCtx);
                if (!qPulled.violations.includes('heading_at_bottom')
                    && !(qPulled.violations.includes('runt_line') && qPulled.score >= qPage.score)) {
                  const nextScore = evaluatePageQualityCanvas(nextPage.html, contentHeight, lineHeightPx, canvasCtx).score;
                  const qNewNext = evaluatePageQualityCanvas(newNextHtml, contentHeight, lineHeightPx, canvasCtx);
                  const scoreBefore = qPage.score + nextScore;
                  const scoreAfter = qPulled.score + qNewNext.score;
                  const improvement = scoreBefore - scoreAfter;
                  if (improvement >= -50 && (!bestMove || improvement > bestMove.improvement)) {
                    bestMove = {
                      type: 'runt-pull',
                      improvement,
                      apply: () => {
                        pages[i] = setPageHtml(page, pulledHtml);
                        pages[nextIdx] = setPageHtml(nextPage, newNextHtml);
                        mergeSplitFragments([pages[i], pages[nextIdx]], log);
                        log.record('defect-fix', 'runt-pull', i + 1, {
                          fromPage: nextIdx + 1,
                          text: (firstNextEl.textContent || '').substring(0, 50),
                          scoreBefore, scoreAfter
                        });
                      }
                    };
                  }
                }
              }
            }
          }
        }
      }

      // === PULL ORPHAN BACKWARD TO PREVIOUS PAGE ===
      if (hasOrphan && sameChapterPrev) {
        const orphanEl = pageEls[0];
        const orphanTag = (orphanEl?.tag || '').toUpperCase();
        if (orphanTag === 'P' && !isMostlyBoldParagraph(orphanEl)) {
          const orphanLines = Math.floor(measure(orphanEl.outerHtml) / lineHeightPx);
          if (orphanLines < minOrphanLines) {
            const newPrevHtml = (prevPage.html || '') + orphanEl.outerHtml;
            if (canAcceptHtml(newPrevHtml, contentHeight, canvasCtx)) {
              const qNewPrev = evaluatePageQualityCanvas(newPrevHtml, contentHeight, lineHeightPx, canvasCtx);
              if (!qNewPrev.violations.includes('heading_at_bottom')
                  && !qNewPrev.violations.includes('orphan')
                  && !(qNewPrev.violations.includes('widow') && !viols.includes('widow'))) {
                const newPageHtml = serializeBlocks(pageEls.slice(1)).trim();
                if (newPageHtml) {
                  const qNewPage = evaluatePageQualityCanvas(newPageHtml, contentHeight, lineHeightPx, canvasCtx);
                  const prevScore = evaluatePageQualityCanvas(prevPage.html, contentHeight, lineHeightPx, canvasCtx).score;
                  const scoreBefore = qPage.score + prevScore;
                  const scoreAfter = qNewPage.score + qNewPrev.score;
                  const improvement = scoreBefore - scoreAfter;
                  if (improvement >= -50 && (!bestMove || improvement > bestMove.improvement)) {
                    bestMove = {
                      type: 'orphan-pull',
                      improvement,
                      apply: () => {
                        pages[prevIdx] = setPageHtml(prevPage, newPrevHtml);
                        pages[i] = setPageHtml(page, newPageHtml);
                        mergeSplitFragments([pages[prevIdx]], log);
                        log.record('defect-fix', 'orphan-pull', i + 1, {
                          toPrevPage: prevIdx + 1,
                          text: (orphanEl.textContent || '').substring(0, 50),
                          scoreBefore, scoreAfter
                        });
                      }
                    };
                  }
                }
              }
            }
          }
        }
      }

      // Apply the best move found for this page
      if (bestMove) {
        bestMove.apply();
        changedAny = true;
      }
    }

    if (!changedAny) break;
  }
};

/**
 * E2: Deterministic balance check for paragraph splits.
 * Validates split quality — rejects lopsided splits (e.g., 95/5).
 * Uses Canvas measurement only.
 *
 * @private
 * @param {string} prevHtml - Content on the page receiving the split chunk
 * @param {string} restHtml - Content remaining on the source page
 * @param {number} lineHeightPx
 * @param {object} canvasCtx - Canvas layout context
 * @returns {{ needsRebalance: boolean, reason?: string }}
 */
const checkSplitBalance = (prevHtml, restHtml, lineHeightPx, canvasCtx) => {
  const measure = (html) => measureHtmlHeight(html, canvasCtx);

  const prevLines = Math.floor(measure(prevHtml) / lineHeightPx);
  const restLines = Math.floor(measure(restHtml) / lineHeightPx);
  const totalLines = prevLines + restLines;

  // Minimum 2 lines per side
  if (restLines < 2 && prevLines >= 3) {
    return { needsRebalance: true, reason: `rest has only ${restLines} lines` };
  }
  if (prevLines < 2 && restLines >= 3) {
    return { needsRebalance: true, reason: `prev has only ${prevLines} lines` };
  }

  // Check ratio deviation from ideal 60/40
  if (totalLines >= 5) {
    const prevRatio = prevLines / totalLines;
    const deviation = Math.abs(prevRatio - 0.6);
    if (deviation > 0.25) {
      return { needsRebalance: true, reason: `split ratio ${(prevRatio * 100).toFixed(0)}% deviates from 60% ideal` };
    }
  }

  return { needsRebalance: false };
};

/**
 * E3: Deterministic page quality scoring.
 * Lower score = better layout. Uses Canvas measurement only.
 *
 * @private
 * @param {string} pageHtml
 * @param {number} contentHeight
 * @param {number} lineHeightPx
 * @param {object} canvasCtx
 * @returns {{ score: number, fillPct: number, violations: string[] }}
 */
const _evaluatePageQualityCanvasCore = (pageHtml, contentHeight, lineHeightPx, canvasCtx, isFragment = false, options = {}) => {
  if (!pageHtml) return { score: Infinity, fillPct: 0, violations: [] };

  // fs = fragment scale: when isFragment=true the html is a split remainder that will
  // receive more content — fill-related penalties are false positives in that context.
  // heading_at_bottom, fragment, split_shallow stay at full weight (they reflect the
  // quality of the split itself, not the final fill state).
  const fs = isFragment ? 0.3 : 1.0;

  // isChapterLastPage: last page of a chapter can never receive more content from
  // subsequent chapters — fill penalties are structural noise, not actionable signal.
  // Orphan/widow/heading_at_bottom penalties still apply (they ARE fixable within the chapter).
  const isChapterLastPage = options.isChapterLastPage === true;

  const measure = (html) => measureHtmlHeight(html, canvasCtx);
  const pageHeight = measure(pageHtml);
  const remainingSpace = contentHeight - pageHeight;
  const violations = [];
  let score = 0;

  // Whitespace penalty — line-based tiers (TeX-style)
  // Suppressed for chapter-last pages: they cannot be filled further without
  // crossing chapter boundaries (which is forbidden by design).
  if (!isChapterLastPage) {
    const unusedLines = Math.floor(Math.max(0, remainingSpace) / lineHeightPx);
    if (unusedLines > 4)      score += 500 * fs; // severe underfill (5+ lines)
    else if (unusedLines > 3) score += 200 * fs; // moderate underfill (4 lines)
    else                      score += unusedLines * 40 * fs; // 1-3 lines: 40/80/120 — gradual, no cliff
  }

  // fillPct deviation penalty — suppressed for chapter-last pages (same reason).
  // Target 0.88 (not 0.92): pages at 87-91% with no violations are well-formed and
  // should not accumulate baseline penalty just for being slightly below a tight target.
  // Cap at 100 pts to prevent over-penalizing wide underfills vs structural violations.
  const targetFill = canvasCtx?.targetFillPct ?? 0.92;
  const fillPct = pageHeight / contentHeight;
  if (!isChapterLastPage) {
    // Only penalize underfill — pages above target are always good.
    // Target raised to 0.92: bestseller-quality pages should be ≥92% full.
    const underfill = Math.max(0, targetFill - fillPct);
    score += Math.min(underfill * 200, 100) * fs;
  }

  // Parse structure
  const children = parseHtmlElements(pageHtml);

  if (children.length > 0) {
    const lastEl = children[children.length - 1];
    const lastTag = (lastEl.tag || '').toUpperCase();

    // Heading at bottom penalty — nearly as bad as widow/orphan.
    // Only catches predominantly-bold paragraphs (≥80% bold text = subtitle-like).
    let isBoldParaAtBottom = false;
    if (lastTag === 'P') {
      if (/font-weight:\s*(?:bold|[7-9]00)/i.test(lastEl.style || '')) {
        isBoldParaAtBottom = true;
      } else if (/^<p[^>]*>\s*<(?:strong|b)\b/i.test(lastEl.outerHtml)) {
        const totalText = htmlToText(lastEl.innerHTML).trim();
        const { boldLen } = getBoldTextRatio(lastEl.outerHtml);
        isBoldParaAtBottom = totalText.length > 0 && (boldLen / totalText.length) >= 0.8;
      }
    }
    if (/^H[1-6]$/i.test(lastTag) || isBoldParaAtBottom) {
      score += 800;
      violations.push('heading_at_bottom');
    }

    // Scan ALL paragraphs for orphan/widow/interior-short violations.
    // Uses computeParaLineMetrics (Canvas geometry) instead of height-division
    // so line count is accurate even when element has top/bottom margins.
    for (let ci = 0; ci < children.length; ci++) {
      const el = children[ci];
      if ((el.tag || '').toUpperCase() !== 'P') continue;

      const isContinuation = el.dataset?.continuation === 'true';
      const elMetrics = computeParaLineMetrics(
        htmlToText(el.innerHTML).trim(),
        canvasCtx,
        isContinuation,
        ci === children.length - 1
      );
      const elLines = elMetrics.lineCount;

      // Orphan: continuation chunk with only 1 line (any position on page)
      // Scaled by fs — on a fragment, this is not a real orphan yet.
      if (isContinuation && elLines <= 1) {
        score += 1000 * fs;
        violations.push('orphan');
      }

      // Widow: last paragraph on page with only 1 line.
      // Continuation fragments get full penalty (1000) — this is a bad split artifact.
      // Complete author paragraphs that are naturally 1 line get a lighter penalty (200)
      // — aesthetically weak but not a split defect, and not actionable by repair passes.
      if (ci === children.length - 1 && elLines <= 1) {
        if (isContinuation) {
          score += 1000 * fs;
          violations.push('widow');
        } else {
          // Cosmetic observation, not a layout defect: a naturally short author
          // paragraph at page bottom is normal in professional typesetting.
          // 80 pts = mild signal (not 200 which inflated ~40% of pages to C-grade).
          score += 80 * fs;
          violations.push('short_last_para');
        }
      }

      // Fragmentation penalty: continuation chunk with <3 lines is a "bad split"
      // Not a hard violation but editorially weak (too little content carried over).
      if (isContinuation && elLines > 1 && elLines < 3) {
        score += 200;
        violations.push('split_shallow');
      }

      // Fragmentation penalty: any paragraph fragment crossing pages adds cost.
      // Discourages unnecessary splits when the page could absorb the whole element.
      // 15 pts: a continuation paragraph opening a page is typographically normal
      // in professional book layout — penalising it heavily inflates scores with
      // no benefit. Just enough to prefer non-split over split when all else is equal.
      if (isContinuation) {
        score += 15;
        violations.push('fragment');
      }

      // Interior short-line penalty — continuation fragments with 1-word interior lines.
      // Lighter than runt (150 vs 1400) — editorially weak but not critical.
      if (isContinuation && elMetrics.interiorShortLines > 0) {
        score += elMetrics.interiorShortLines * 150 * fs;
        violations.push('interior_short_line');
      }
    }

    // Runt-line penalty: last <p> on page is a split continuation fragment ending
    // with 1 word or 2 very short words (<35% line width).
    // Only penalises split artefacts — whole author paragraphs must not be penalised
    // here (doing so fires on ~50% of pages, cascading across fill-pass scoring globally).
    const lastPEl = [...children].reverse().find(c => (c.tag || '').toUpperCase() === 'P');
    if (lastPEl && lastPEl.dataset?.continuation === 'true') {
      const lastPMetrics = computeParaLineMetrics(
        htmlToText(lastPEl.innerHTML).trim(),
        canvasCtx,
        true,   // isContinuation
        true    // isLastOnPage
      );
      if (lastPMetrics.lineCount >= 2) {
        const runtPenalty = computeRuntLinePenalty(
          lastPMetrics.lastLineWords,
          lastPMetrics.lastLineWidthRatio
        );
        if (runtPenalty > 0) {
          score += runtPenalty * fs;
          violations.push('runt_line');
        }
      }
    }
  }

  return {
    score,
    fillPct,   // 0.0–1.0 ratio (fillPct computed above for deviation penalty)
    violations
  };
};

/**
 * Cached wrapper for _evaluatePageQualityCanvasCore.
 * Key = hash(html) + isFragment + isChapterLastPage — contentHeight, lineHeightPx,
 * canvasCtx are constant per-run so they don't need to be part of the key.
 * Cache is cleared at the start of each paginateChapters() invocation.
 */
const evaluatePageQualityCanvas = (pageHtml, contentHeight, lineHeightPx, canvasCtx, isFragment = false, options = {}) => {
  if (!pageHtml) return { score: Infinity, fillPct: 0, violations: [] };
  const isChapterLastPage = options.isChapterLastPage === true;
  const key = `${simpleHash(pageHtml)}|${isFragment ? 1 : 0}|${isChapterLastPage ? 1 : 0}`;
  const cached = _evalCache.get(key);
  if (cached) { _evalCacheHits++; return { ...cached, violations: [...cached.violations] }; }
  const result = _evaluatePageQualityCanvasCore(pageHtml, contentHeight, lineHeightPx, canvasCtx, isFragment, options);
  _evalCache.set(key, result);
  _evalCacheMisses++;
  return result;
};

/**
 * Tag the last non-blank page of each chapter with isChapterLastPage=true.
 * This lets evaluatePageQualityCanvas suppress fill-penalties for those pages —
 * they can never receive more content without crossing chapter boundaries.
 * Must be called after all structural mutations (fill-pass, smooth, cleanup).
 *
 * @private
 */
const tagChapterLastPages = (pages) => {
  // Clear stale tags first (fill-pass may have merged/emptied pages)
  for (const p of pages) delete p.isChapterLastPage;

  // Walk backwards: first non-blank page per chapterTitle = last page of that chapter
  const seen = new Set();
  for (let i = pages.length - 1; i >= 0; i--) {
    const p = pages[i];
    if (p.isBlank || !p.html || !p.chapterTitle) continue;
    if (!seen.has(p.chapterTitle)) {
      p.isChapterLastPage = true;
      seen.add(p.chapterTitle);
    }
  }
};

/**
 * Guard: returns true only if html fits within contentHeight.
 * Used by all page-mutation functions to prevent silent overflow.
 *
 * @private
 */
const canAcceptHtml = (html, contentHeight, canvasCtx) =>
  measureHtmlHeight(html, canvasCtx) <= contentHeight - DOM_SLACK;

