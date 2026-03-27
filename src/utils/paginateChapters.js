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
  measureHtmlHeight,
  createLayoutContext,
  getLineBreakPositions,
  buildFontString,
  countHyphenationMetrics,
  getCtx as getEngineCtx2d
} from './textLayoutEngine';

import { createPaginationLogger, assignBlockId, deriveFragmentId, injectBlockIdAttrs, resetBlockCounter } from './paginationLogger.js';

// ─────────────────────────────────────────────────────────────────────────────
// DOM-free HTML helpers — Worker-safe string-based replacements for
// document.createElement('div') + innerHTML patterns used throughout this file.
// ─────────────────────────────────────────────────────────────────────────────

/** Strip all HTML tags → plain text (replaces el.textContent) */
const htmlToText = (html) => (html || '').replace(/<[^>]*>/g, '');

/**
 * Parse an HTML string into an array of top-level element descriptor objects.
 * Each descriptor has: { tag, outerHtml, innerHTML, textContent, style, dataset }
 * where dataset is an object of data-* attributes.
 */
const parseHtmlElements = (html) => {
  if (!html) return [];
  const elements = [];
  let i = 0;
  while (i < html.length) {
    // Skip whitespace between elements
    while (i < html.length && html[i] !== '<') i++;
    if (i >= html.length) break;

    // Find the opening tag
    const tagStart = i;
    const tagEnd = html.indexOf('>', i);
    if (tagEnd === -1) break;
    const openTag = html.slice(tagStart, tagEnd + 1);
    i = tagEnd + 1;

    // Self-closing tags (hr, br, img...)
    if (openTag.endsWith('/>') || /^<(br|hr|img|input|meta|link)\b/i.test(openTag)) {
      const tagMatch = openTag.match(/^<([a-zA-Z][^\s/>]*)/);
      const tag = tagMatch ? tagMatch[1].toUpperCase() : 'UNKNOWN';
      const styleMatch = openTag.match(/\bstyle="([^"]*)"/i);
      elements.push({ tag, outerHtml: openTag, innerHTML: '', textContent: '', style: styleMatch ? styleMatch[1] : '', dataset: {} });
      continue;
    }

    const tagMatch = openTag.match(/^<([a-zA-Z][^\s/>]*)/);
    if (!tagMatch) { i++; continue; }
    const tagName = tagMatch[1];

    // Find the matching closing tag (handles nesting)
    let depth = 1;
    let j = i;
    const openRe = new RegExp(`<${tagName}[\\s>]`, 'i');
    const closeRe = new RegExp(`</${tagName}>`, 'i');
    while (j < html.length && depth > 0) {
      const nextOpen = openRe.exec(html.slice(j));
      const nextClose = closeRe.exec(html.slice(j));
      if (!nextClose) break;
      if (nextOpen && nextOpen.index < nextClose.index) {
        depth++;
        j += nextOpen.index + 1;
      } else {
        depth--;
        j += nextClose.index + nextClose[0].length;
      }
    }
    const outerHtml = html.slice(tagStart, j);
    const closeTagMatch = outerHtml.match(/<\/[^>]+>$/);
    const inner = closeTagMatch
      ? outerHtml.slice(openTag.length, outerHtml.length - closeTagMatch[0].length)
      : '';

    const styleMatch = openTag.match(/\bstyle="([^"]*)"/i);
    // Extract data-* attributes
    const dataset = {};
    let dataMatch;
    const dataRe = /\bdata-([a-z0-9-]+)="([^"]*)"/gi;
    while ((dataMatch = dataRe.exec(openTag)) !== null) {
      // Convert kebab-case to camelCase
      const key = dataMatch[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      dataset[key] = dataMatch[2];
    }

    elements.push({
      tag: tagName.toUpperCase(),
      outerHtml,
      innerHTML: inner,
      textContent: htmlToText(inner),
      style: styleMatch ? styleMatch[1] : '',
      dataset
    });
    i = j;
  }
  return elements;
};

/** Get the first top-level element descriptor from an HTML string */
const getFirstElement = (html) => parseHtmlElements(html)[0] || null;

/** Get the last top-level element descriptor from an HTML string */
const getLastElement = (html) => {
  const els = parseHtmlElements(html);
  return els.length > 0 ? els[els.length - 1] : null;
};

/** Remove the element at position `index` from an HTML string, return new string */
const removeElementAt = (html, index) => {
  const els = parseHtmlElements(html);
  if (index < 0 || index >= els.length) return html;
  const toRemove = els[index].outerHtml;
  const pos = html.indexOf(toRemove);
  if (pos === -1) return html;
  return (html.slice(0, pos) + html.slice(pos + toRemove.length)).trim();
};

/** Remove the last top-level element, return { newHtml, removed } */
const removeLastElement = (html) => {
  const els = parseHtmlElements(html);
  if (els.length === 0) return { newHtml: html, removed: null };
  const last = els[els.length - 1];
  const pos = html.lastIndexOf(last.outerHtml);
  if (pos === -1) return { newHtml: html, removed: last };
  return { newHtml: html.slice(0, pos).trim(), removed: last };
};

/** Remove the first top-level element, return { newHtml, removed } */
const removeFirstHtmlElement = (html) => {
  const els = parseHtmlElements(html);
  if (els.length === 0) return { newHtml: html, removed: null };
  const first = els[0];
  const pos = html.indexOf(first.outerHtml);
  if (pos === -1) return { newHtml: html, removed: first };
  return { newHtml: html.slice(pos + first.outerHtml.length).trim(), removed: first };
};

/**
 * Count bold text length in an HTML string (replaces querySelectorAll('strong, b')).
 * Returns { boldLen, totalLen } for ratio calculation.
 */
const getBoldTextRatio = (outerHtml) => {
  const totalText = htmlToText(outerHtml).trim();
  let boldLen = 0;
  const boldRe = /<(?:strong|b)(?:\s[^>]*)?>([^<]*(?:<(?!\/(?:strong|b)>)[^<]*)*)<\/(?:strong|b)>/gi;
  let m;
  while ((m = boldRe.exec(outerHtml)) !== null) {
    boldLen += htmlToText(m[1]).trim().length;
  }
  return { boldLen, totalLen: totalText.length };
};

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
export const JUSTIFY_SLACK_RATIO = 0.04;
const FILL_PASS_RUNT_MIN_CURRENT_FILL = 0.70;
const FILL_PASS_RUNT_MIN_RESULT_FILL = 0.88;
const SHORT_LAST_LINE_POSTPASS_MIN_SOURCE_FILL = 0.80;

/**
 * Main entry point — same interface as before.
 *
 * @param {Chapter[]} chapters
 * @param {object} layoutCtx - Pagination layout context (from usePagination)
 * @param {HTMLElement} measureDiv - DOM element (still used by splitParagraphByLines for HTML parsing)
 * @param {object} safeConfig
 * @returns {Page[]}
 */
export const paginateChapters = (chapters, layoutCtx, measureDiv, safeConfig, options = null) => {
  if (!chapters || !Array.isArray(chapters)) return { pages: [], log: {}, summaryText: '' };

  const logger = options?.logger || null;
  const onProgress = options?.onProgress || null;
  const log = logger || createPaginationLogger();
  log.reset();
  resetBlockCounter();

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
    targetFillPct: safeConfig?.pagination?.targetFillPct ?? 0.92,
    ctx2d: getEngineCtx2d()
  };

  const { contentHeight, lineHeightPx, baseFontSize: baseFontSizeTop, baseLineHeight: baseLineHeightTop, minOrphanLines: minOrphanLinesTop } = layoutCtx;
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
        targetFillPct: safeConfig?.pagination?.targetFillPct ?? 0.92,
        firstLineIndent: safeConfig?.paragraph?.firstLineIndent ?? 1.5,
        justifySlack: justifySlack,
        workerPath: typeof WorkerGlobalScope !== 'undefined' ? 'worker' : 'main-thread'
      },
      chapterCount: chapters.length,
      totalContentLength: manuscriptHash
    });
  }

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    if (onProgress) onProgress(i + 1, chapters.length);

    // Pad to odd page if chapter must start on right
    if (shouldStartOnRightPage(chapter, i, safeConfig) && i > 0) {
      if (allPages.length % 2 === 1) {
        allPages.push({
          html: '',
          pageNumber: allPages.length + 1,
          isBlank: true,
          chapterTitle: '',
          currentSubheader: ''
        });
      }
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
  fixShortLastLines(allPages, layoutCtx, canvasCtx, log);

  // Indent repair pass — correct any <p> that lost its text-indent due to being
  // the "first paragraph" of a chapter (baked-in text-indent:0) but ended up on
  // a page other than the chapter-start page after fill/split operations.
  // Also fixes any non-continuation <p> at the start of a page that has indent:0.
  repairMissingIndents(allPages, safeConfig);

  // Tag last page of each chapter — suppresses fill-penalties in scoring
  // for pages that can never be filled further (chapter boundary constraint).
  tagChapterLastPages(allPages);

  // E6: Distribute remaining vertical whitespace proportionally among elements.
  // Runs LAST (after all structural mutations) so margins are set once on the
  // final page layout and are never moved to a different page.
  distributeVerticalSpace(allPages, layoutCtx, canvasCtx);

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
        fixShortLastLines(relaxedPages, relaxedLayoutCtx, canvasCtx, log);
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
        fixShortLastLines(allPages, layoutCtx, canvasCtx, log);
        repairMissingIndents(allPages, safeConfig);
        tagChapterLastPages(allPages);
        distributeVerticalSpace(allPages, layoutCtx, canvasCtx);
      }
    }
  }

  // Re-number again after fill-pass may have emptied some pages.
  // Blank pages count toward the physical position but don't show a number —
  // this keeps the printed number in sync with the preview navigator (currentPage+1).
  let pageNum = 1;
  for (const p of allPages) {
    if (!p.isBlank) p.pageNumber = pageNum;
    pageNum++;
  }

  // Generate structured summary via logger
  log.generateSummary(allPages, evaluatePageQualityCanvas, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx);

  return { pages: allPages, log: log.getLog(), summaryText: log.formatSummaryText() };
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
  const children = parseHtmlElements(chapter.html || '').filter(
    el => el.textContent.trim() || el.tag === 'HR'
  );

  let paragraphCount = 0;
  for (const el of children) {
    const isFirstParagraph = paragraphCount === 0;
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
  const lineStarts = getLineBreakPositions(text, effectiveWidth, fontStr);
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
 * Hard editorial threshold for short final lines.
 * Deliberately narrower than scoreCandidate: only truly bad endings should mutate layout.
 *
 * @private
 */
const isSevereShortLastLine = (metrics) => {
  if (!metrics || metrics.lastLineWords <= 0) return false;
  if (metrics.lastLineWords === 1) return true;
  if (metrics.lastLineWords === 2) return metrics.widthRatio < 0.40;
  if (metrics.lastLineWords === 3) return metrics.widthRatio < 0.22;
  return metrics.widthRatio < 0.18;
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
 * Detect a visually short last line at the end of a candidate page.
 * This is intentionally local to pagination passes and must not affect global scoring.
 *
 * @private
 */
const getTrailingShortLineViolation = (pageHtml, canvasCtx, options = {}) => {
  const { allowContinuation = true } = options;
  if (!pageHtml) return null;

  const lastEl = getLastElement(pageHtml);
  const tagName = lastEl?.tag?.toUpperCase();
  if (!lastEl || (tagName !== 'P' && tagName !== 'BLOCKQUOTE')) return null;
  const isContinuation = lastEl.dataset?.continuation === 'true';
  if (!allowContinuation && isContinuation) return null;
  if (tagName === 'P' && isMostlyBoldParagraph(lastEl)) return null;

  const text = lastEl.textContent.trim();
  if (!text) return null;

  const metrics = getLastLineMetrics(text, canvasCtx);
  if (!isSevereShortLastLine(metrics)) return null;

  return {
    text,
    tag: tagName,
    isContinuation,
    lastLineWords: metrics.lastLineWords,
    lastLineText: metrics.lastLineText,
    widthRatio: metrics.widthRatio,
    shortLineScore: metrics.shortLineScore
  };
};

/**
 * Hard guard for near-full candidates that would end a page with a short last line.
 * Kept narrow: only when the page was already reasonably filled and stays near full.
 *
 * @private
 */
const getNearFullShortLineViolation = (candidateHtml, canvasCtx, currentFill, resultFillPct, options = {}) => {
  if (currentFill < FILL_PASS_RUNT_MIN_CURRENT_FILL) return null;
  if (resultFillPct < FILL_PASS_RUNT_MIN_RESULT_FILL) return null;
  return getTrailingShortLineViolation(candidateHtml, canvasCtx, options);
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
  const lineStarts = getLineBreakPositions(plainText, effectiveWidth, fontStr);
  const words = plainText.split(/\s+/).filter(w => w.length > 0);

  // 1. Word count on last line (guard against empty lineStarts)
  const lastStart = (lineStarts && lineStarts.length > 0)
    ? lineStarts[lineStarts.length - 1]
    : 0;
  const lastLineWords = Math.max(0, words.length - lastStart);

  let score = 0;
  // Spanish has many short words — 3-4 words like "y de la fe" can be < 20% of line width.
  // Penalize by word count AND visual width for maximum coverage.
  if (lastLineWords === 1)      score += 1400;
  else if (lastLineWords === 2) score += 900;
  else if (lastLineWords === 3) score += 400; // "y de la" at 18% width looks empty
  else if (lastLineWords === 4) score += 100; // mild — still depends on word length

  // 2. Visual width of last line — raised to 55% to catch short Spanish words correctly.
  // This catches 4-word lines like "y en la fe" that slip past the word-count check.
  if (lastLineWords > 0 && effectiveWidth > 0) {
    const ctx2d = getCanvasCtx2d();
    if (ctx2d) {
      ctx2d.font = fontStr;
      const lastLineText = words.slice(lastStart).join(' ');
      const widthRatio = ctx2d.measureText(lastLineText).width / effectiveWidth;
      if (widthRatio < 0.55) score += 600;
    }
  }

  // 3. Underfill penalty — 1 line short ≈ 4% underfill ≈ 12 pts on typical page.
  // Keep this LOW so it never outweighs a genuine last-line improvement.
  const chunkH = measureHtmlHeight(firstChunkHtml, canvasCtx);
  const fill = remainingPx > 0 ? chunkH / remainingPx : 1;
  score += Math.max(0, 1 - fill) * 300;

  // 4. Hyphenation quality scoring.
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

  // 5. Paragraph shape scoring (line-width variance).
  // A paragraph where line widths vary wildly looks jagged and unprofessional.
  // Measure the width of each line and penalise high standard deviation.
  // Only applies to multi-line chunks (≥3 lines) — single-line splits have no shape.
  // stdDev > 25% of line width triggers a proportional penalty.
  // Uses lineStarts from getLineBreakPositions (already computed above).
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

  // 6. Stability bias — strong preference for delta=0 when last line is already OK.
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

/**
 * Core greedy pagination — single linear pass.
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

  const quoteOptions = {
    config: safeConfig.quote || {
      enabled: true, indentLeft: 2, indentRight: 2, showLine: true,
      italic: true, sizeMultiplier: 0.95, marginTop: 1, marginBottom: 1
    },
    baseFontSize,
    baseLineHeight,
    textAlign,
    lineHeightPx,
    contentWidth: canvasCtx.contentWidth,
    fontFamily: canvasCtx.fontFamily
  };

  let currentFirstElementIndex = 0;
  let pageHasTitle = false;

  const pushPage = (html, opts = {}) => {
    pages.push({
      html,
      pageNumber: pages.length + 1,
      chapterTitle: chapter.title,
      isBlank: false,
      isTitleOnlyPage: opts.isTitleOnlyPage || false,
      isFirstChapterPage: opts.isFirstChapterPage || false,
      currentSubheader,
      firstElementIndex: currentFirstElementIndex
    });
    pageHasTitle = false;
  };

  const flushCurrent = (startWith = '', firstIdx = null) => {
    if (currentHtml) pushPage(currentHtml, { isFirstChapterPage: pageHasTitle });
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

    // Chapter title element
    if (el.isTitle) {
      const layout = el.titleLayout;
      if (layout === 'fullPage') {
        // fullPage: solo título en la página, siguiente página tiene el texto
        flushCurrent();
        pushPage(el.html, { isTitleOnlyPage: true, isFirstChapterPage: true });
        currentFirstElementIndex = elIdx;
        currentHtml = '';
      } else if (layout === 'spaced' || layout === 'halfPage') {
        // spaced/halfPage: título + texto en la misma página
        flushCurrent();
        currentFirstElementIndex = elIdx;
        currentHtml = el.html;
        pageHasTitle = true;
      } else {
        // continuous: comportamiento por defecto
        flushCurrent();
        currentFirstElementIndex = elIdx;
        currentHtml = el.html;
        pageHasTitle = true;
      }
      continue;
    }

    // KEEP-WITH-NEXT for subheaders — ensure enough follow content fits after heading
    const isHeading = /^H[1-6]$/i.test(el.tag);
    // Use the isBold flag computed from the ORIGINAL DOM element
    // (buildParagraphHtml strips original styles, so checking el.html wouldn't work)
    const isBoldParagraph = !isHeading && el.tag === 'P' && el.isBold;

    if (isHeading || isBoldParagraph) {
      log.record('greedy', 'heading-detect', pages.length + 1, { tag: el.tag, text: (el.textContent || '').substring(0, 60), isHeading, isBoldParagraph });
    }

    if (isHeading || isBoldParagraph) {
      const nextEl = elements[elIdx + 1];
      if (nextEl && !nextEl.isTitle) {
        const pageWithSub = measure((currentHtml || '') + el.html);
        const level = isHeading ? el.tag?.toLowerCase() : 'h3';
        const subConfig = safeConfig.subheaders?.[level];
        // minLinesAfter: how many follow lines the heading needs to stay on this page.
        // Respect explicit config value; fall back to minOrphanLines (default 2).
        // Previously used Math.max(minOrphanLines, configured) which silently ignored
        // any configured value lower than minOrphanLines (e.g. minLinesAfter:1 → 2).
        const effectiveMinLines = subConfig?.minLinesAfter != null
          ? subConfig.minLinesAfter
          : Math.max(minOrphanLines, 2);
        const minFollowHeight = effectiveMinLines * lineHeightPx;
        const spaceAfterSub = contentHeight - pageWithSub;

        const needsMove = spaceAfterSub < minFollowHeight;

        if (needsMove) {
          log.record('greedy', 'keep-with-next', pages.length + 1, { tag: el.tag, text: (el.textContent || '').substring(0, 60), effectiveMinLines, availableLines: +(spaceAfterSub / lineHeightPx).toFixed(1) });
          flushCurrent(el.html, elIdx);
          currentFirstElementIndex = elIdx;
          continue;
        }
      }
    }

    // Check if element fits
    const candidateHeight = measure(currentHtml + el.html);
    const isLastChapterElement = elIdx === elements.length - 1;

    if (isLastChapterElement) {
      const elLines = Math.floor(measure(el.html) / lineHeightPx);
      const actualH = measure(currentHtml);
      const freeLines = Math.floor((contentHeight - actualH) / lineHeightPx);
      log.record('greedy', 'diag', pages.length + 1, { tag: el.tag, text: (el.textContent || '').substring(0, 60), elLines, freeLines, candidateH: +candidateHeight.toFixed(1), contentH: +contentHeight.toFixed(1), gap: +(candidateHeight - contentHeight).toFixed(1), fits: candidateHeight <= contentHeight });
    }

    // For the chapter's final paragraph, allow absorbing up to half a line of
    // overfill. The safetyMargin already reserves a full lineHeightPx buffer,
    // so this is safe and avoids sending a nearly-fitting paragraph to an empty page.
    const fitTolerance = isLastChapterElement ? lineHeightPx * 0.5 : 0;

    if (candidateHeight <= contentHeight + fitTolerance) {
      // Runt-flush guard: if adding this paragraph fills the page completely (≤1 free line
      // remaining on the COMBINED page) and its last line is a single word, it will sit
      // isolated at the bottom — visually identical to a widow but in a whole paragraph.
      // Guard: only when the page is already meaningfully filled (≥70% before this element)
      // so we never flush a page that only has 1-2 small elements on it.
      // Also skip for last-chapter elements (their final pages are expected short).
      // candidateHeight = measure(currentHtml + el.html) — already computed above the fit check.
      // Use it directly as the authoritative "page height after adding this element".
      const currentPageHeight = currentHtml ? measure(currentHtml) : 0;
      const freeLinesAfter = Math.floor((contentHeight - candidateHeight) / lineHeightPx);
      const currentFill = currentPageHeight / contentHeight;
      if (!isLastChapterElement
          && (el.tag === 'P' || el.tag === 'BLOCKQUOTE')
          && !el.isBold
          && freeLinesAfter <= 1
          && currentFill >= 0.70
          && currentHtml) {
        const plainText = (el.textContent || '').trim();
        const shortLine = getLastLineMetrics(plainText, canvasCtx);
        if (isSevereShortLastLine(shortLine)) {
          // Flush current page without this paragraph, start fresh page with it
          log.record('greedy', 'no-fit', pages.length + 1, {
            tag: el.tag,
            text: plainText.substring(0, 60),
            reason: 'short-line-flush',
            lastLineWords: shortLine.lastLineWords,
            widthRatio: +shortLine.widthRatio.toFixed(2),
            shortLineScore: shortLine.shortLineScore
          });
          flushCurrent(el.html, elIdx);
          continue;
        }
      }

      currentHtml += el.html;
      if (fitTolerance > 0 && candidateHeight > contentHeight) {
        log.record('greedy', 'fit', pages.length + 1, { tag: el.tag, text: (el.textContent || '').substring(0, 60), overflowPx: +(candidateHeight - contentHeight).toFixed(1), tolerancePx: +fitTolerance.toFixed(1) });
      }
      // DEBUG: track elements with inline bold that fit silently
      if (el.tag === 'P' && el.html.includes('<strong')) {
        log.record('greedy', 'fit', pages.length + 1, { tag: el.tag, text: (el.textContent || '').substring(0, 80), isBold: el.isBold, candidateH: +candidateHeight.toFixed(0), contentH: +contentHeight.toFixed(0), elHeight: +el.height.toFixed(0), note: 'has-inline-bold' });
      }
      continue;
    }

    // Doesn't fit — measure current page height
    const actualCurrentHeight = measure(currentHtml);
    const remainingSpace = contentHeight - actualCurrentHeight;
    const remainingLines = Math.floor(remainingSpace / lineHeightPx);

    log.record('greedy', 'no-fit', pages.length + 1, { tag: el.tag, text: (el.textContent || '').substring(0, 60), isBold: el.isBold, candidateH: +candidateHeight.toFixed(0), contentH: +contentHeight.toFixed(0), remainLines: remainingLines, splitEnabled: splitLongParagraphs });
    const canSplit = splitLongParagraphs
      && (el.tag === 'P' || el.tag === 'DIV' || el.tag === 'BLOCKQUOTE')
      && !el.isBold
      && remainingLines >= 1;

    if (canSplit) {
      const hasIndent = el.tag === 'P';
      const indentValue = safeConfig.paragraph?.firstLineIndent || 1.5;
      const preserveIndent = /text-indent:\s*0[^.]/.test(el.html);

      let splitResult = splitInTwo(
        el.html, measureDiv, canvasCtx, remainingSpace, contentHeight,
        textAlign, hasIndent, indentValue, preserveIndent, quoteOptions
      );

      if (splitResult) {
        const [firstChunk, restChunk] = splitResult;

        // Hard floor: both sides must have at least minOrphanLines lines.
        // Exception: for the chapter's LAST paragraph, allow 1-line orphans AND
        // 1-line widows. The chapter's final page will be short regardless, and
        // filling the current page as much as possible is always preferable to
        // wasting space and pushing the whole paragraph to a nearly-empty page.
        const pageWithChunkHeight = measure(currentHtml + firstChunk);
        const orphanLines = Math.floor(pageWithChunkHeight / lineHeightPx)
          - Math.floor(actualCurrentHeight / lineHeightPx);
        const widowLines = Math.floor(measure(restChunk) / lineHeightPx);
        const effectiveMinOrphan = isLastChapterElement ? 1 : minOrphanLines;
        // Widows (rest chunk at top of next page) are more visually disruptive
        // than orphans — require 1 extra line (min 3) to avoid 2-line fragments.
        const effectiveMinWidow = isLastChapterElement ? 1 : minOrphanLines + 1;

        if (orphanLines >= effectiveMinOrphan && widowLines >= effectiveMinWidow) {
          // Symmetric lookahead: simulate what the full next page would look like
          // in BOTH scenarios by greedily adding subsequent elements that fit.
          // This gives a realistic "next page" score rather than evaluating an
          // isolated fragment (restChunk alone would be penalised for underfill/widow
          // even though more content will follow on the real next page).
          const LOOKAHEAD_WEIGHT = 0.6; // lookahead is an approximation — discount slightly

          // Split next-page simulation: restChunk + following elements that fit
          let simSplitHtml   = restChunk;
          let simSplitH      = measure(restChunk);
          let splitEnriched  = false;
          for (let j = elIdx + 1; j < elements.length; j++) {
            const ne = elements[j];
            if (ne.chapterTitle !== el.chapterTitle) break; // stay within chapter
            const cH = simSplitH + measure(ne.html);
            if (cH > contentHeight) break;
            simSplitHtml  += ne.html;
            simSplitH      = cH;
            splitEnriched  = true;
          }

          // Flush next-page simulation: el.html + following elements that fit
          let simFlushHtml = el.html;
          let simFlushH    = measure(el.html);
          for (let j = elIdx + 1; j < elements.length; j++) {
            const ne = elements[j];
            if (ne.chapterTitle !== el.chapterTitle) break;
            const cH = simFlushH + measure(ne.html);
            if (cH > contentHeight) break;
            simFlushHtml += ne.html;
            simFlushH     = cH;
          }

          // isFragment fallback: if no extra elements were added to the split simulation,
          // restChunk is still isolated → keep isFragment=true scaling for its score.
          const badnessSplit =
            evaluatePageQualityCanvas(currentHtml + firstChunk, contentHeight, lineHeightPx, canvasCtx).score +
            evaluatePageQualityCanvas(simSplitHtml, contentHeight, lineHeightPx, canvasCtx, !splitEnriched).score * LOOKAHEAD_WEIGHT;

          const badnessFlush =
            evaluatePageQualityCanvas(currentHtml, contentHeight, lineHeightPx, canvasCtx).score +
            evaluatePageQualityCanvas(simFlushHtml, contentHeight, lineHeightPx, canvasCtx).score * LOOKAHEAD_WEIGHT;

          const _chunkP = firstChunk.replace(/<[^>]*>/g, '').trim();
          const _restP = restChunk.replace(/<[^>]*>/g, '').trim();
          log.record('greedy', 'split', pages.length + 1, { tag: el.tag, text: (el.textContent || '').substring(0, 60), orphanLines, widowLines, chunkTail: _chunkP.slice(-80), restHead: _restP.substring(0, 80), before: { score: +badnessFlush.toFixed(0) }, after: { score: +badnessSplit.toFixed(0) }, simSplitLines: Math.floor(simSplitH / lineHeightPx), simFlushLines: Math.floor(simFlushH / lineHeightPx) });

          // Last paragraph of chapter: always prefer split to fill the current page.
          // The chapter's final page is expected to be short, so the rest chunk's
          // underfill is not a real quality problem — but leaving the current page
          // half-empty IS visible.
          if (isLastChapterElement) {
            log.record('greedy', 'split', pages.length + 1, { tag: el.tag, text: (el.textContent || '').substring(0, 60), reason: 'last-chapter-element', orphanLines, widowLines });
            pushPage(currentHtml + firstChunk);
            currentHtml = restChunk;
            continue;
          }

          // Shallow split guard: when the split creates very few widow lines AND
          // the flush simulation fills the next page much better than the split would,
          // the split is "shallow" — it cuts a few lines off a paragraph but leaves
          // the next page nearly empty. Use a much higher threshold to reject these.
          const simSplitLines = Math.floor(simSplitH / lineHeightPx);
          const simFlushLines = Math.floor(simFlushH / lineHeightPx);
          const isShallowSplit = widowLines <= minOrphanLines + 1 &&
            simFlushLines > 0 && simSplitLines < simFlushLines * 0.6;
          const greedySplitThreshold = isShallowSplit ? 350 : 50;

          // Accept split only if it produces a meaningfully better layout
          if (badnessSplit < badnessFlush - greedySplitThreshold) {
            // Propagate fragment IDs to the rest chunk
            if (process.env.NODE_ENV === 'development' && el.sourceBlockId) {
              const restIds = deriveFragmentId(el);
              el.fragmentIndex = restIds.fragmentIndex;
              // inject into restChunk HTML so it's traceable
              const taggedRest = injectBlockIdAttrs(restChunk, restIds);
              pushPage(currentHtml + firstChunk);
              currentHtml = taggedRest;
            } else {
              pushPage(currentHtml + firstChunk);
              currentHtml = restChunk;
            }
            continue;
          }
        }
      }
    }

    // Could not split — flush and start new page
    if (remainingLines >= 3) {
      log.record('greedy', 'no-fit', pages.length + 1, { tag: el.tag, text: (el.textContent || '').substring(0, 60), reason: 'underfill', remainingLines, canSplit });
    }
    flushCurrent(el.html, elIdx);
    currentFirstElementIndex = elIdx;
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

  const quoteOptions = {
    config: safeConfig.quote || {
      enabled: true, indentLeft: 2, indentRight: 2, showLine: true,
      italic: true, sizeMultiplier: 0.95, marginTop: 1, marginBottom: 1
    },
    baseFontSize, baseLineHeight, textAlign, lineHeightPx,
    contentWidth: canvasCtx.contentWidth,  // pass real width so splitParagraphByLines wraps correctly in worker
    fontFamily: canvasCtx.fontFamily
  };

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
      const remainingSpace = contentHeight - currentHeight;
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
      const nextPageEls = parseHtmlElements(nextPage.html);
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
              const shortLineViolation = getNearFullShortLineViolation(currentHtml + groupHtml, canvasCtx, currentFill, qGroup.fillPct);
              if (shortLineViolation) {
                log.record('fill', 'reject', i + 1, {
                  tag,
                  text: shortLineViolation.text.substring(0, 60),
                  reason: 'short-last-line',
                  lastLineWords: shortLineViolation.lastLineWords,
                  widthRatio: +shortLineViolation.widthRatio.toFixed(2),
                  shortLineScore: shortLineViolation.shortLineScore,
                  currentFill: +currentFill.toFixed(2),
                  afterFillPct: +(qGroup.fillPct * 100).toFixed(0)
                });
                break;
              }

              const groupBadnessAfter = qGroup.score + qSrc.score;
              const BADNESS_MIN_DELTA = remainingLines >= 8 ? -500 : remainingLines >= 3 ? Math.round(-100 - (remainingLines - 3) * 80) : -100;
              if (groupBadnessAfter <= badnessBefore - BADNESS_MIN_DELTA) {
                pages[i] = { ...pages[i], html: currentHtml + groupHtml };
                if (srcHtml) {
                  pages[nextIdx] = { ...nextPage, html: srcHtml };
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
                        pages[i] = { ...pages[i], html: destHtml };
                        pages[nextIdx] = { ...nextPage, html: srcHtml };
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
      if (candidateFitHeight <= contentHeight) {

        // Remove first element from source page
        const sourceHtml = nextPageEls.slice(1).map(e => e.outerHtml).join('').trim();

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
        const shortLineViolation = getNearFullShortLineViolation(currentHtml + firstElHtml, canvasCtx, currentFill, qMovedCurrent.fillPct);
        if (shortLineViolation) {
          log.record('fill', 'reject', i + 1, {
            tag,
            text: shortLineViolation.text.substring(0, 60),
            reason: 'short-last-line',
            lastLineWords: shortLineViolation.lastLineWords,
            widthRatio: +shortLineViolation.widthRatio.toFixed(2),
            shortLineScore: shortLineViolation.shortLineScore,
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

        pages[i] = { ...pages[i], html: currentHtml + movedElHtml };
        mergeSplitFragments([pages[i]], log);
        if (sourceHtml) {
          pages[nextIdx] = { ...nextPage, html: sourceHtml };
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
      while (chunkFitHeight > contentHeight && overflowRetries < 3) {
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
      if (chunkFitHeight > contentHeight) {
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

      const remainingEls = nextPageEls.slice(1).map(e => e.outerHtml).join('').trim();
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
      const widowPenaltyScale = underfillRatio >= 0.45 ? 0 : underfillRatio >= 0.35 ? 0.3 : 1;
      const widowSoftPenalty = newSourceLines < minWidowLines ? Math.round(600 * widowPenaltyScale) : 0;

      // Badness gate for split — accept only if total quality improves
      const qSplitCurrent = evaluatePageQualityCanvas(currentHtml + chunk, contentHeight, lineHeightPx, canvasCtx);
      const qSplitSource  = evaluatePageQualityCanvas(newSourceHtml, contentHeight, lineHeightPx, canvasCtx);

      const splitBadnessAfter = qSplitCurrent.score + qSplitSource.score + widowSoftPenalty;

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
      const totalLines = Math.round(contentHeight / lineHeightPx);
      const emptyRatio = remainingLines / totalLines;
      let splitAllowance;
      if (isRetrySplit) {
        splitAllowance = 400;
      } else if (emptyRatio >= 0.25) {
        // Continuous scale: 25% empty → +300, 45%+ empty → +400
        splitAllowance = Math.min(400, Math.round(200 + emptyRatio * 450));
      } else if (remainingLines <= 1) {
        splitAllowance = 300; // delta=-1 compensation
      } else if (emptyRatio >= 0.08) {
        // Medium underfill (8-25% empty, ~1-4 lines free at 55-line pages):
        // enough space to warrant a moderately imperfect split rather than leaving the page underused.
        // Continuous scale: 8% → +50, 25% → +150 (bridges into the ≥0.25 tier).
        splitAllowance = Math.round(50 + (emptyRatio - 0.08) * 588); // 588 = (150-50)/(0.25-0.08)
      } else {
        splitAllowance = 50;
      }
      const splitThreshold = badnessBefore + splitAllowance;
      if (splitBadnessAfter > splitThreshold) {
        log.record('fill', 'reject', i + 1, { tag, text: firstEl.textContent.substring(0, 60), reason: 'badness-split', before: { score: +badnessBefore.toFixed(0), fillPct: +(currentFill * 100).toFixed(0) }, after: { score: +splitBadnessAfter.toFixed(0), destFill: +(qSplitCurrent.fillPct * 100).toFixed(0), srcScore: +qSplitSource.score.toFixed(0) }, delta: +(badnessBefore - splitBadnessAfter).toFixed(0), features: { remainingLines, emptyRatio: +emptyRatio.toFixed(2), splitAllowance, threshold: +splitThreshold.toFixed(0), chunkLines, restLines, widowPenalty: widowSoftPenalty, isRetrySplit, destViolations: qSplitCurrent.violations, srcViolations: qSplitSource.violations } });
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
      const shortLineViolation = getNearFullShortLineViolation(currentHtml + chunk, canvasCtx, currentFill, qSplitCurrent.fillPct);
      if (shortLineViolation) {
        log.record('fill', 'reject', i + 1, {
          tag,
          text: shortLineViolation.text.substring(0, 60),
          reason: 'short-last-line',
          lastLineWords: shortLineViolation.lastLineWords,
          widthRatio: +shortLineViolation.widthRatio.toFixed(2),
          shortLineScore: shortLineViolation.shortLineScore,
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
      pages[i] = { ...pages[i], html: currentHtml + chunk };
      mergeSplitFragments([pages[i]], log);
      pages[nextIdx] = { ...nextPage, html: newSourceHtml };
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
const repairMissingIndents = (pages, safeConfig) => {
  const indentEm = safeConfig.paragraph?.firstLineIndent || 1.5;
  const targetIndent = `${indentEm}em`;

  for (const page of pages) {
    if (!page || page.isBlank || !page.html) continue;

    const children = parseHtmlElements(page.html);
    let changed = false;

    const repairedChildren = children.map((el, idx) => {
      if ((el.tag || '').toUpperCase() !== 'P') return el;

      // Skip continuation chunks — they deliberately have no indent
      const isCont = el.dataset?.continuation === 'true';
      if (isCont) return el;

      // Check current indent value
      const styleStr = el.style || '';
      const indentM = styleStr.match(/text-indent\s*:\s*([^;]+)/i);
      const indentVal = indentM ? parseFloat(indentM[1]) : null;
      const hasZeroIndent = indentVal === null || indentVal === 0;
      if (!hasZeroIndent) return el;

      // Exempt: first <p> on any page.
      // It could be a split-rest (continuation) or the first paragraph of a chapter —
      // we cannot safely distinguish these without the chapter context here.
      // The per-operation restoreIndentIfNeeded handles the fill/move path for idx=0.
      if (idx === 0) return el;

      // Check if first alphabetic character is uppercase (new paragraph, not split-rest)
      const firstLetter = el.textContent.trim().match(/\p{L}/u)?.[0] || '';
      const startsUpper = firstLetter !== '' &&
        firstLetter === firstLetter.toUpperCase() &&
        firstLetter !== firstLetter.toLowerCase();
      if (!startsUpper) return el;

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
        return { ...el, outerHtml: newOuter };
      }
      return el;
    });

    if (changed) {
      page.html = repairedChildren.map(c => c.outerHtml).join('');
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

    let children = parseHtmlElements(page.html);
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
        if (log) log.record('merge', 'pass1-merge', pageIdx + 1, { tag, text: htmlToText(merged.innerHTML).substring(0, 60), beforeHtml: mergeBeforeHtml, afterHtml: children.map(c => c.outerHtml).join('') });
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
      page.html = children.map(c => c.outerHtml).join('');
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
  const MIN_GAP = lineHeightPx;
  const MAX_PER_GAP = lineHeightPx * 0.5;

  for (const page of pages) {
    if (!page || page.isBlank || page.isTitleOnlyPage || page.isFirstChapterPage || !page.html) continue;

    const actualHeight = measure(page.html);
    const gap = contentHeight - actualHeight;
    if (gap < MIN_GAP) continue;

    let children = parseHtmlElements(page.html);
    if (children.length < 2) continue;

    // Don't adjust if last element is a heading (should have been moved already)
    const last = children[children.length - 1];
    if (/^H[1-6]$/i.test(last.tag)) continue;

    const numGaps = children.length - 1;
    const maxPerGap = Math.min(gap / numGaps, MAX_PER_GAP);
    if (maxPerGap < 1) continue;

    // Capture original margins before any modification
    const origMargins = children.map(el => {
      const m = (el.style || '').match(/margin-bottom:\s*([\d.]+)px/);
      return m ? parseFloat(m[1]) : 0;
    });

    // Build updated HTML by injecting margin-bottom into each element's style
    const applyGap = (g) => {
      return children.map((el, idx) => {
        if (idx >= children.length - 1) return el.outerHtml;
        const newMargin = (origMargins[idx] + g).toFixed(1);
        const newStyle = (el.style || '')
          .replace(/margin-bottom:\s*[\d.]+px;?/g, '')
          .trimEnd()
          + `;margin-bottom:${newMargin}px`;
        if (/\bstyle="/.test(el.outerHtml)) {
          return el.outerHtml.replace(/\bstyle="[^"]*"/, `style="${newStyle}"`);
        }
        // No style attribute — inject one into the opening tag
        return el.outerHtml.replace(/^(<[a-zA-Z][^\s/>]*)/, `$1 style="${newStyle}"`);
      }).join('');
    };

    let lo = 0;
    let hi = maxPerGap;
    let bestGap = 0;
    for (let iter = 0; iter < 8; iter++) {
      const mid = (lo + hi) / 2;
      if (measure(applyGap(mid)) <= contentHeight) {
        bestGap = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }

    if (bestGap >= 1) {
      page.html = applyGap(bestGap);
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

    const children = parseHtmlElements(page.html);
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
      // Heading doesn't fit on next page — leave heading in place.
      // Do NOT mark as isTitleOnlyPage: that flag is only for chapter title pages,
      // and misusing it would cause distributeVerticalSpace and smoothPageBalance
      // to skip this page entirely, leaving large whitespace gaps uncorrected.
      log.record('heading-fix', 'reject', i + 1, { tag: last.tag, text: htmlToText(last.innerHTML).substring(0, 60), reason: 'next-page-full' });
      continue;
    }

    const remainingHtml = children.slice(0, children.length - 1).map(c => c.outerHtml).join('').trim();

    pages[i] = { ...page, html: remainingHtml, isBlank: !remainingHtml };
    pages[ni] = { ...next, html: mergedHtml };

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
      const shortLineViolation = getNearFullShortLineViolation(mergedHtml, canvasCtx, prevFill, mergedFill);
      if (shortLineViolation) continue;

      pages[i - 1] = { ...prevPage, html: mergedHtml };
      page.html = '';
      page.isBlank = true;
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
  if (!safeConfig?.chapterTitle?.startOnRightPage) return;

  for (let i = 1; i < pages.length; i++) {
    if (!pages[i]?.isFirstChapterPage) continue;

    // Physical page position is i+1 (1-indexed). Must be odd for right-hand page.
    if ((i + 1) % 2 === 0) {
      const blankPage = {
        html: '',
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

    const fromEls = parseHtmlElements(pages[fromIdx].html);
    if (fromEls.length === 0) break;

    // Forward move (toIdx > fromIdx): take LAST element of fromPage, PREPEND to toPage.
    // Backward move (toIdx < fromIdx): take FIRST element of fromPage, APPEND to toPage.
    // This preserves reading order: content flows from the bottom of one page to the top
    // of the next (or from the top of one page to the bottom of the previous).
    const elToMove = toIdx > fromIdx ? fromEls[fromEls.length - 1] : fromEls[0];
    if (!elToMove) break;

    const elHtml = elToMove.outerHtml;
    const fromRestEls = toIdx > fromIdx ? fromEls.slice(0, fromEls.length - 1) : fromEls.slice(1);
    const fromRest = fromRestEls.map(e => e.outerHtml).join('').trim();
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
    const changedEndHtml = toIdx > fromIdx ? fromRest : toNewHtml;
    const changedEndBeforeFill = toIdx > fromIdx
      ? (fromIdx === i ? q1.fillPct : q2.fillPct)
      : (toIdx === i ? q1.fillPct : q2.fillPct);
    const changedEndAfterFill = toIdx > fromIdx ? qFrom.fillPct : qTo.fillPct;
    const shortLineViolation = getNearFullShortLineViolation(changedEndHtml, canvasCtx, changedEndBeforeFill, changedEndAfterFill);
    if (shortLineViolation) {
      const shortLinePage = toIdx > fromIdx ? fromIdx + 1 : toIdx + 1;
      log.record('smooth', 'reject', shortLinePage, {
        fromPage: fromIdx + 1,
        toPage: toIdx + 1,
        reason: 'short-last-line',
        text: shortLineViolation.text.substring(0, 60),
        lastLineWords: shortLineViolation.lastLineWords,
        widthRatio: +shortLineViolation.widthRatio.toFixed(2),
        shortLineScore: shortLineViolation.shortLineScore
      });
      break;
    }

    const badnessAfter = qFrom.score + qTo.score;

    if (badnessAfter < badnessBefore - SMOOTH_BADNESS_MIN_DELTA) {
      const smoothBeforeHtml = pages[fromIdx].html;
      pages[fromIdx] = { ...pages[fromIdx], html: fromRest };

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
            finalToHtml = toEls.slice(0, toEls.length - 2).map(e => e.outerHtml).join('') + reunified;
          }
        }
      }

      pages[toIdx] = { ...pages[toIdx], html: finalToHtml };
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
 * Final safety net for visually short trailing lines.
 * Flushes the last block forward when a near-full page still ends badly and the
 * source page remains reasonably filled after the move.
 *
 * @private
 */
const fixShortLastLines = (pages, layoutCtx, canvasCtx, log) => {
  const { contentHeight, lineHeightPx } = layoutCtx;
  const measure = (html) => measureHtmlHeight(html, canvasCtx);

  for (let pass = 0; pass < 2; pass++) {
    let changedAny = false;

    for (let i = 0; i < pages.length - 1; i++) {
      const page = pages[i];
      if (!page || page.isBlank || page.isTitleOnlyPage || page.isFirstChapterPage || !page.html) continue;

      const pageHeight = measure(page.html);
      const pageFill = pageHeight / contentHeight;
      if (pageFill < FILL_PASS_RUNT_MIN_RESULT_FILL) continue;

      const shortLineViolation = getTrailingShortLineViolation(page.html, canvasCtx);
      if (!shortLineViolation) continue;

      let nextIdx = i + 1;
      while (nextIdx < pages.length && pages[nextIdx]?.isBlank) nextIdx++;
      if (nextIdx >= pages.length) continue;

      const nextPage = pages[nextIdx];
      if (!nextPage || !nextPage.html || nextPage.isTitleOnlyPage || nextPage.isFirstChapterPage) continue;
      if (page.chapterTitle !== nextPage.chapterTitle) continue;

      const pageEls = parseHtmlElements(page.html);
      const lastEl = pageEls[pageEls.length - 1];
      const tagName = (lastEl?.tag || '').toUpperCase();
      if (!lastEl || /^H[1-6]$/i.test(tagName)) continue;
      if (tagName === 'P' && isMostlyBoldParagraph(lastEl)) continue;

      const movedHtml = lastEl.outerHtml;
      const newCurrentHtml = pageEls.slice(0, pageEls.length - 1).map(e => e.outerHtml).join('').trim();
      if (!newCurrentHtml) continue;

      const newCurrentFill = measure(newCurrentHtml) / contentHeight;
      if (newCurrentFill < SHORT_LAST_LINE_POSTPASS_MIN_SOURCE_FILL) continue;

      const qCurrent = evaluatePageQualityCanvas(newCurrentHtml, contentHeight, lineHeightPx, canvasCtx);
      if (qCurrent.violations.includes('heading_at_bottom')) continue;

      const nextHtml = movedHtml + (nextPage.html || '');
      if (!canAcceptHtml(nextHtml, contentHeight, canvasCtx)) continue;

      pages[i] = { ...page, html: newCurrentHtml };
      pages[nextIdx] = { ...nextPage, html: nextHtml };
      mergeSplitFragments([pages[i], pages[nextIdx]], log);
      changedAny = true;

      log.record('short-line-fix', 'move', i + 1, {
        toPage: nextIdx + 1,
        text: shortLineViolation.text.substring(0, 60),
        lastLineWords: shortLineViolation.lastLineWords,
        widthRatio: +shortLineViolation.widthRatio.toFixed(2),
        shortLineScore: shortLineViolation.shortLineScore,
        beforeFillPct: +(pageFill * 100).toFixed(0),
        afterFillPct: +(newCurrentFill * 100).toFixed(0)
      });
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
const evaluatePageQualityCanvas = (pageHtml, contentHeight, lineHeightPx, canvasCtx, isFragment = false, options = {}) => {
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
    else if (unusedLines > 2) score += 200 * fs; // moderate underfill (3-4 lines)
    else                      score += unusedLines * 80 * fs; // 1-2 lines: 80/160
  }

  // fillPct deviation penalty — suppressed for chapter-last pages (same reason).
  const targetFill = canvasCtx?.targetFillPct ?? 0.92;
  const fillPct = pageHeight / contentHeight;
  if (!isChapterLastPage) {
    score += Math.abs(fillPct - targetFill) * 200 * fs;
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

    // Scan ALL paragraphs for orphan/widow violations.
    // Orphan: any continuation paragraph (text-indent:0) with only 1 line — at any position.
    // Widow: last paragraph on page with only 1 line.
    for (let ci = 0; ci < children.length; ci++) {
      const el = children[ci];
      if ((el.tag || '').toUpperCase() !== 'P') continue;

      const isContinuation = el.dataset?.continuation === 'true';
      const elLines = Math.floor(measure(el.outerHtml) / lineHeightPx);

      // Orphan: continuation chunk with only 1 line (any position on page)
      // Scaled by fs — on a fragment, this is not a real orphan yet.
      if (isContinuation && elLines <= 1) {
        score += 1000 * fs;
        violations.push('orphan');
      }

      // Widow: last paragraph on page with only 1 line
      // Scaled by fs — on a fragment, this is not a real widow yet.
      if (ci === children.length - 1 && elLines <= 1) {
        score += 1000 * fs;
        violations.push('widow');
      }

      // Fragmentation penalty: continuation chunk with <3 lines is a "bad split"
      // Not a hard violation but editorially weak (too little content carried over).
      if (isContinuation && elLines > 1 && elLines < 3) {
        score += 200;
        violations.push('split_shallow');
      }

      // Fragmentation penalty: any paragraph fragment crossing pages adds cost.
      // Discourages unnecessary splits when the page could absorb the whole element.
      if (isContinuation) {
        score += 100;
        violations.push('fragment');
      }

    }

    // Runt-line penalty: last paragraph on page is a split continuation fragment
    // (data-continuation=true) ending with 1 word or 2 very short words (<25% line width).
    // Only penalises split artefacts — whole paragraphs are the author's text and must
    // not be penalised here (doing so cascades across all fill-pass scoring globally).
    // Both scaled by fs so fragment lookaheads (isFragment=true) don't over-fire.
    const lastPEl = [...children].reverse().find(c => (c.tag || '').toUpperCase() === 'P');
    if (lastPEl && lastPEl.dataset?.continuation === 'true') {
      const lastPLines = Math.floor(measure(lastPEl.outerHtml) / lineHeightPx);
      if (lastPLines >= 2) {
        const fontStr = buildFontString(canvasCtx.baseFontSizePx, canvasCtx.fontFamily);
        const effectiveWidth = canvasCtx.contentWidth - (canvasCtx.widthSlack || 0);
        const plainText = htmlToText(lastPEl.innerHTML).trim();
        const words = plainText.split(/\s+/).filter(w => w.length > 0);
        const lineStarts = getLineBreakPositions(plainText, effectiveWidth, fontStr);
        if (lineStarts && lineStarts.length > 0) {
          const lastStart = lineStarts[lineStarts.length - 1];
          const lastLineWords = Math.max(0, words.length - lastStart);
          let runtPenalty = 0;
          if (lastLineWords === 1) {
            runtPenalty = 300;
          } else if (lastLineWords === 2) {
            const ctx2d = getCanvasCtx2d();
            if (ctx2d) {
              ctx2d.font = fontStr;
              const lastLineText = words.slice(lastStart).join(' ');
              const widthRatio = effectiveWidth > 0
                ? ctx2d.measureText(lastLineText).width / effectiveWidth : 1;
              if (widthRatio < 0.25) runtPenalty = 200;
            }
          }
          if (runtPenalty > 0) {
            score += runtPenalty * fs;
            violations.push('runt_line');
          }
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
  measureHtmlHeight(html, canvasCtx) <= contentHeight;

