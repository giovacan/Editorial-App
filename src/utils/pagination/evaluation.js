/**
 * evaluation.js
 *
 * Page quality scoring and tagging extracted from paginateChapters.js.
 */

import {
  htmlToText,
  parseTopLevelBlocks as parseHtmlElements,
  getBoldTextRatio,
} from '../layoutIr.js';

import {
  measureHtmlHeight,
} from '../textLayoutEngine';

import {
  simpleHash,
  computeRuntLinePenalty,
  getDomSlack,
  getEvalCache,
  getEvalCacheHits,
  getEvalCacheMisses,
  incEvalCacheHits,
  incEvalCacheMisses,
} from './constants.js';

import { computeParaLineMetrics } from './metrics.js';

// ─────────────────────────────────────────────────────────────────────────────

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
export const checkSplitBalance = (prevHtml, restHtml, lineHeightPx, canvasCtx) => {
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
  const fs = isFragment ? 0.3 : 1.0;

  // isChapterLastPage: last page of a chapter can never receive more content from
  // subsequent chapters — fill penalties are structural noise, not actionable signal.
  const isChapterLastPage = options.isChapterLastPage === true;

  const measure = (html) => measureHtmlHeight(html, canvasCtx);
  const pageHeight = measure(pageHtml);
  const remainingSpace = contentHeight - pageHeight;
  const violations = [];
  let score = 0;

  // Whitespace penalty — line-based tiers (TeX-style)
  if (!isChapterLastPage) {
    const unusedLines = Math.floor(Math.max(0, remainingSpace) / lineHeightPx);
    if (unusedLines > 4)      score += 500 * fs; // severe underfill (5+ lines)
    else if (unusedLines > 3) score += 200 * fs; // moderate underfill (4 lines)
    else                      score += unusedLines * 40 * fs; // 1-3 lines: 40/80/120 — gradual
  }

  // fillPct deviation penalty — suppressed for chapter-last pages (same reason).
  const targetFill = canvasCtx?.targetFillPct ?? 0.92;
  const fillPct = pageHeight / contentHeight;
  if (!isChapterLastPage) {
    const underfill = Math.max(0, targetFill - fillPct);
    score += Math.min(underfill * 200, 100) * fs;
  }

  // Parse structure
  const children = parseHtmlElements(pageHtml);

  if (children.length > 0) {
    const lastEl = children[children.length - 1];
    const lastTag = (lastEl.tag || '').toUpperCase();

    // Heading at bottom penalty
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
      if (isContinuation && elLines <= 1) {
        score += 1000 * fs;
        violations.push('orphan');
      }

      // Widow: last paragraph on page with only 1 line.
      if (ci === children.length - 1 && elLines <= 1) {
        if (isContinuation) {
          score += 1000 * fs;
          violations.push('widow');
        } else {
          // Cosmetic observation — naturally short author paragraph
          score += 80 * fs;
          violations.push('short_last_para');
        }
      }

      // Fragmentation penalty: continuation chunk with <3 lines is a "bad split"
      if (isContinuation && elLines > 1 && elLines < 3) {
        score += 200;
        violations.push('split_shallow');
      }

      // Fragmentation penalty: any paragraph fragment crossing pages adds cost.
      if (isContinuation) {
        score += 15;
        violations.push('fragment');
      }

      // Interior short-line penalty — continuation fragments with 1-word interior lines.
      if (isContinuation && elMetrics.interiorShortLines > 0) {
        score += elMetrics.interiorShortLines * 150 * fs;
        violations.push('interior_short_line');
      }
    }

    // Runt-line penalty: last <p> on page is a split continuation fragment ending
    // with 1 word or 2 very short words (<35% line width).
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
          lastPMetrics.lastLineWidthRatio,
          canvasCtx?.minLastLineWords ?? 0
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
    fillPct,
    violations
  };
};

/**
 * Cached wrapper for _evaluatePageQualityCanvasCore.
 * Key = hash(html) + isFragment + isChapterLastPage — contentHeight, lineHeightPx,
 * canvasCtx are constant per-run so they don't need to be part of the key.
 * Cache is cleared at the start of each paginateChapters() invocation.
 */
export const evaluatePageQualityCanvas = (pageHtml, contentHeight, lineHeightPx, canvasCtx, isFragment = false, options = {}) => {
  if (!pageHtml) return { score: Infinity, fillPct: 0, violations: [] };
  const isChapterLastPage = options.isChapterLastPage === true;
  const key = `${simpleHash(pageHtml)}|${isFragment ? 1 : 0}|${isChapterLastPage ? 1 : 0}`;
  const cached = getEvalCache().get(key);
  if (cached) { incEvalCacheHits(); return { ...cached, violations: [...cached.violations] }; }
  const result = _evaluatePageQualityCanvasCore(pageHtml, contentHeight, lineHeightPx, canvasCtx, isFragment, options);
  getEvalCache().set(key, result);
  incEvalCacheMisses();
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
export const tagChapterLastPages = (pages) => {
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
export const canAcceptHtml = (html, contentHeight, canvasCtx) =>
  measureHtmlHeight(html, canvasCtx) <= contentHeight - getDomSlack();
