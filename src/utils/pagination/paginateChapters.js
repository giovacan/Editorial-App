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
  splitParagraphByLines,
  splitListByItems
} from '../paginationEngine';

import {
  JUSTIFY_SLACK_RATIO,
  htmlToText,
  parseTopLevelBlocks as parseHtmlElements,
  getFirstBlock as getFirstElement,
  getLastBlock as getLastElement,
  removeBlockAt as removeElementAt,
  removeLastBlock as removeLastElement,
  getBoldTextRatio,
  serializeBlocks,
  getPageBlocks,
  setPageBlocks,
  setPageHtml,
  getInnerHtml,
  splitHtmlByCharsPreservingTags,
} from '../layoutIr.js';

import {
  measureHtmlHeight,
  createLayoutContext,
  getLineBreakPositions,
  getLineBreakPositionsKP,
  buildFontString,
  countHyphenationMetrics,
  applyKpWordSpacingWorkerSafe,
  getCtx as getEngineCtx2d
} from '../textLayoutEngine';

import { createPaginationLogger, assignBlockId, deriveFragmentId, injectBlockIdAttrs, resetBlockCounter } from '../paginationLogger.js';

import { computeBlockLineMetrics } from '../lineRenderer.js';
import { computeQualityReport } from './qualityReport.js';

// ── New sub-modules ───────────────────────────────────────────────────────────
import {
  getDomSlack,
  setDomSlack,
  getEvalCache,
  getEvalCacheHits,
  getEvalCacheMisses,
  setEvalCache,
  setEvalCacheHits,
  setEvalCacheMisses,
  DEFAULT_REPAIR_PRIORITY,
  FILL_PASS_RUNT_MIN_CURRENT_FILL,
  FILL_PASS_RUNT_MIN_RESULT_FILL,
  RUNT_HARD_PENALTY_THRESHOLD,
  getCanvasCtx2d,
  simpleHash,
  normalizePolicyTag,
  normalizePolicyTagSet,
  mergePolicyTagSets,
  normalizeRepairPriority,
  countDefectViolations,
  computeRepairPriorityGain,
  compareRepairPriorityGain,
  resolveMinLastLineWords,
  clonePageSlice,
  resolveChapterLayoutPolicy,
  policyIncludesTag,
  computeRuntLinePenalty,
} from './constants.js';

import {
  isMostlyBoldParagraph,
  getLastLineMetrics,
  isSevereShortLastLine,
  computeParaLineMetrics,
  getChunkLastLineWords,
  scoreCandidate,
  restoreIndentIfNeeded,
  mergeIntoOne,
  splitInTwo,
} from './metrics.js';

import {
  collectBreakpoints,
  scoreBreakpoint,
  pickBestBreakpoint,
  greedyPaginate,
} from './breakpoints.js';

import { optimalPaginate } from './optimalPaginate.js';
import { buildNativeTableElement, splitTableByRows } from '../tableLayoutEngine.js';

import {
  repairMissingIndents,
  mergeSplitFragments,
  fixHeadingsAtBottom,
  cleanupNearlyEmptyPages,
  enforceChapterStartParity,
  applyVerticalJustification,
} from './repairs.js';

import {
  checkSplitBalance,
  evaluatePageQualityCanvas,
  tagChapterLastPages,
  canAcceptHtml,
} from './evaluation.js';

// ─────────────────────────────────────────────────────────────────────────────

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
  const layoutHints = options?.layoutHints || null;
  // Incremental layout: previous chapter hashes + pages from last run.
  const prevChapterHashes = options?.prevChapterHashes || null;
  const prevChapterPages  = options?.prevChapterPages  || null;
  const log = logger || createPaginationLogger();
  log.reset();
  resetBlockCounter();

  // Clear scoring cache for this run (fresh state per pagination invocation).
  setEvalCache(new Map());
  setEvalCacheHits(0);
  setEvalCacheMisses(0);

  const allPages = [];

  // Build Canvas layout context for deterministic measurement
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
    targetFillPct: layoutHints?.global?.targetFillPct ?? safeConfig?.pagination?.targetFillPct ?? 0.88,
    minLastLineWords: resolveMinLastLineWords(
      layoutHints?.global?.minLastLineWords,
      safeConfig?.pagination?.minLastLineWords ?? 0
    ),
    ctx2d: getEngineCtx2d(),
    textAlign: layoutCtx.textAlign || 'left',
    quoteConfig: safeConfig?.quote || {
      enabled: true, indentLeft: 2, indentRight: 2, showLine: true,
      italic: true, sizeMultiplier: 0.95, marginTop: 1, marginBottom: 1
    },
    noHyphenation: true,  // Match DOM hyphens:none — no browser hyphenation
    // Deterministic line rendering active: the preview draws the engine's
    // lines, so browser re-wrapping is impossible — cut lines can be packed
    // to 100% and always justified (no anti-wrap ceilings needed).
    engineLinesRender: safeConfig?.render?.engineLines !== false,
  };
  // Inject canonical line-metrics fn for the logger (avoids circular import)
  canvasCtx._computeLineMetricsFn = (plainText, isContinuation, isLastOnPage) =>
    computeParaLineMetrics(plainText, canvasCtx, isContinuation, isLastOnPage);

  const { contentHeight, lineHeightPx, baseFontSize: baseFontSizeTop, baseLineHeight: baseLineHeightTop, minOrphanLines: minOrphanLinesTop } = layoutCtx;

  setDomSlack(Math.round(lineHeightPx * 1.0));

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
      totalContentLength: manuscriptHash,
      // Exact manuscript input (dev only): lets any problem book become a
      // regression fixture via scripts/addBookToCorpus.mjs without having to
      // reconstruct chapters from paginated output.
      chapters: chapters.map(ch => ({ title: ch.title || '', chapterLabel: ch.chapterLabel || '', chapterName: ch.chapterName || '', html: ch.html || '' }))
    });
  }

  // Config fingerprint: layout parameters that affect pagination output.
  const configFingerprint = simpleHash([
    contentHeight, lineHeightPx, layoutCtx.contentWidth,
    layoutCtx.baseFontSize, layoutCtx.baseLineHeight,
    layoutCtx.textAlign, layoutCtx.fontFamily,
    layoutCtx.minOrphanLines, layoutCtx.minWidowLines,
    layoutCtx.splitLongParagraphs,
    layoutCtx.headerSpaceEstimate || 0,
    layoutCtx.chapterStartBottomClearance || 0,
    layoutCtx.chapterStartExtraLines || 0,
    safeConfig?.paragraph?.firstLineIndent,
    safeConfig?.chapterTitle?.startOnRightPage,
    safeConfig?.chapterTitle?.sizeMultiplier,
    safeConfig?.chapterTitle?.marginTop,
    safeConfig?.chapterTitle?.marginBottom,
    safeConfig?.quote?.indentLeft,
    safeConfig?.quote?.indentRight,
    layoutHints?.version || 'no-layout-hints',
    layoutHints?.global?.targetFillPct,
    (layoutHints?.global?.avoidSplitTags || []).join(','),
    (layoutHints?.global?.keepWithNextTags || []).join(','),
    safeConfig?.pagination?.engineMode || 'optimal',
    safeConfig?.render?.engineLines !== false ? 'el1' : 'el0',
    'v73-tables' // bump to force cache invalidation after algorithm changes
  ].join('|'));

  // 'optimal' (default): global DP pagination per chapter — no fill-pass needed.
  // 'greedy': legacy page-by-page engine + fill-pass (kept as fallback).
  const engineMode = safeConfig?.pagination?.engineMode || 'optimal';
  let usedGreedyFallback = engineMode !== 'optimal';

  const chapterHashes = [];
  const chapterPageSlices = [];

  // Weight progress by chapter SIZE (element/char count), not just index, so a
  // single huge chapter doesn't freeze the bar. Fine-grained window callbacks
  // advance the bar within a big chapter too.
  const chapterWeights = chapters.map(ch => Math.max(1, (ch.html || '').length));
  const totalWeight = chapterWeights.reduce((a, b) => a + b, 0);
  let doneWeight = 0;
  const reportProgress = (chapterIdx, withinFraction) => {
    if (!onProgress) return;
    const frac = (doneWeight + chapterWeights[chapterIdx] * withinFraction) / totalWeight;
    onProgress(frac, 1); // total=1 → onProgress computes percent from the fraction
  };

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    reportProgress(i, 0);

    const chHash = simpleHash((chapter.html || '') + '|' + (chapter.title || '') + '|' + configFingerprint);
    chapterHashes.push(chHash);

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
      chapterPageSlices.push(clonePageSlice(prevChapterPages[i]));
      allPages.push(...clonePageSlice(prevChapterPages[i]));
      continue;
    }

    const chapterLayoutPolicy = resolveChapterLayoutPolicy(chapter, layoutHints);
    const elements = flattenChapterElements(chapter, layoutCtx, canvasCtx, measureDiv, safeConfig);
    // DEV: log first 4 paragraph indents to diagnose missing-indent bugs
    if (process.env.NODE_ENV === 'development' && i === 0) {
      const paraEls = elements.filter(e => e.tag === 'P').slice(0, 4);
      paraEls.forEach((e, pi) => {
        const indentM = e.html?.match(/text-indent\s*:\s*([^;}"]+)/i);
        log.record('greedy', 'diag', 0, { note: 'indent-check', para: pi, indent: indentM?.[1] ?? 'none', text: (e.textContent||'').substring(0,50) });
      });
    }
    let chapterPages = null;
    if (engineMode === 'optimal') {
      try {
        const onWindow = (frac) => reportProgress(i, frac);
        chapterPages = optimalPaginate(elements, layoutCtx, canvasCtx, measureDiv, safeConfig, chapter, log, chapterLayoutPolicy, onWindow);
      } catch (err) {
        usedGreedyFallback = true;
        if (process.env.NODE_ENV === 'development') {
          log.record('dp', 'fallback-to-greedy', 0, { chapter: i, error: String(err?.message || err) });
        }
        chapterPages = null;
      }
    }
    if (!chapterPages) {
      chapterPages = greedyPaginate(elements, layoutCtx, canvasCtx, measureDiv, safeConfig, chapter, log, chapterLayoutPolicy);
    }
    chapterPageSlices.push(clonePageSlice(chapterPages));
    allPages.push(...chapterPages);
    doneWeight += chapterWeights[i];
  }

  // Re-number all pages sequentially
  allPages.forEach((p, i) => { p.pageNumber = i + 1; });

  // Fix headings at bottom BEFORE fill-pass so fill-pass accounts for moved headings
  fixHeadingsAtBottom(allPages, canvasCtx, layoutCtx, log);

  // Single forward fill-pass — legacy greedy engine only. The optimal DP
  // engine already balances fill globally; running the fill-pass on top of it
  // would just shuffle content around (the "jumping paragraphs" symptom).
  if (usedGreedyFallback) {
    applyFillPass(allPages, layoutCtx, canvasCtx, measureDiv, safeConfig, log);
  }

  // Snap split-head pages to sentence boundaries — LEGACY render only. With
  // deterministic line rendering the cut line is drawn full and justified
  // (hyphenated when needed); re-cutting to sentence ends only shortens it
  // below the law and the alignment guard then strips its justify (the "85
  // líneas sin justificar" report). Mid-sentence page cuts are standard
  // typography.
  if (safeConfig?.render?.engineLines === false) {
    snapSplitPagesToSentenceBoundaries(allPages, canvasCtx, lineHeightPx, 2, layoutCtx);
  }

  // Cleanup nearly-empty pages
  cleanupNearlyEmptyPages(allPages, layoutCtx, canvasCtx);

  // Enforce chapter start parity (chapters on right/odd pages)
  enforceChapterStartParity(allPages, safeConfig);

  // Merge split paragraph fragments on the same page
  mergeSplitFragments(allPages, log);

  // Repair missing first-line indents
  repairMissingIndents(allPages, safeConfig, log);

  // Tag last page of each chapter
  tagChapterLastPages(allPages);

  // ── KP word-spacing pass (before distributeVerticalSpace) ───────────────
  {
    const kpCtx = {
      baseFontSizePx: canvasCtx.baseFontSizePx,
      fontFamily: canvasCtx.fontFamily || layoutCtx.fontFamily || 'Georgia, serif',
      contentWidth: layoutCtx.contentWidth,
      widthSlack: canvasCtx.widthSlack || 0,
    };
    let kpApplied = 0;
    let kpReverted = 0;
    for (let i = 0; i < allPages.length; i++) {
      const page = allPages[i];
      if (!page.html || page.isBlank) continue;
      const originalHtml = page.html;
      const wsHtml = applyKpWordSpacingWorkerSafe(originalHtml, kpCtx);
      if (wsHtml === originalHtml) continue;
      const isChStartKP = !!page.isFirstChapterPage;
      const chStartExtraKP = isChStartKP
        ? Math.max(0, (layoutCtx.headerSpaceEstimate || 0) - (layoutCtx.chapterStartBottomClearance || 0))
          + (layoutCtx.chapterStartExtraLines || 0) * lineHeightPx
        : 0;
      const kpBudget = contentHeight - getDomSlack() + chStartExtraKP;
      const wsHeight = measureHtmlHeight(wsHtml, canvasCtx);
      if (wsHeight <= kpBudget) {
        allPages[i] = setPageHtml(page, wsHtml);
        kpApplied++;
      } else {
        kpReverted++;
        if (process.env.NODE_ENV === 'development') {
          log.record('kp-ws', 'revert', page.pageNumber, {
            wsHeight: +wsHeight.toFixed(1),
            budget: +kpBudget.toFixed(1),
            overflow: +(wsHeight - kpBudget).toFixed(1)
          });
        }
      }
    }
  }

  // Re-number again after fill-pass may have emptied some pages.
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

  // DEV: chapter start page fill diagnostic
  if (process.env.NODE_ENV === 'development') {
    for (let pi = 0; pi < allPages.length; pi++) {
      const page = allPages[pi];
      if (!page?.isFirstChapterPage || page.isBlank || !page.html) continue;
      const h = measureHtmlHeight(page.html, canvasCtx);
      const blocks = getPageBlocks(page);
      const titleBlock = blocks.find(b => b.dataset?.chapterStart === 'true');
      const titleH = titleBlock ? measureHtmlHeight(titleBlock.outerHtml, canvasCtx) : 0;
      const headerExtra = layoutCtx.headerSpaceEstimate || 0;
      const chBudget = contentHeight + headerExtra;
      const blockHeights = blocks.map(b => Math.round(measureHtmlHeight(b.outerHtml, canvasCtx))).join(',');
      log.record('ch-start', 'diag', page.pageNumber, { ch: page.chapterTitle?.substring(0,30), canvasH: Math.round(h), titleH: Math.round(titleH), budget: Math.round(contentHeight - getDomSlack()), chBudget: Math.round(chBudget - getDomSlack()), blocks: blocks.length, blockH: blocks.map(b => Math.round(measureHtmlHeight(b.outerHtml, canvasCtx))), blockStyles: blocks.map(b => { const m = (b.style||'').match(/text-align-last:[^;\"]+/); return m ? m[0] : 'none'; }) });
    }
  }

  // ── SAFETY CLAMP PASS ──────────────────────────────────────────────────
  {
    const chStartExtra = Math.max(0, (layoutCtx.headerSpaceEstimate || 0) - (layoutCtx.chapterStartBottomClearance || 0))
      + (layoutCtx.chapterStartExtraLines || 0) * lineHeightPx;
    let clampCount = 0;
    let clampChecked = 0;
    let clampOverBudget = 0;
    for (let i = 0; i < allPages.length; i++) {
      const page = allPages[i];
      if (!page || page.isBlank || page.isTitleOnlyPage || !page.html) continue;
      const budget = contentHeight - getDomSlack() + (page.isFirstChapterPage ? chStartExtra : 0);
      clampChecked++;
      let pageH = measureHtmlHeight(page.html, canvasCtx);
      if (pageH > budget) {
        clampOverBudget++;
      }
      if (pageH <= budget) continue;

      // Page overflows — remove elements from bottom until it fits
      let blocks = getPageBlocks(page);
      const overflow = [];
      while (blocks.length > 1 && pageH > budget) {
        const removed = blocks.pop();
        overflow.unshift(removed); // maintain reading order
        const newHtml = serializeBlocks(blocks);
        pageH = measureHtmlHeight(newHtml, canvasCtx);
      }

      // Single-element page that still overflows — split the paragraph itself.
      if (overflow.length === 0 && blocks.length === 1 && pageH > budget) {
        const singleHtml = blocks[0].outerHtml || blocks[0].html || page.html;
        // Oversized native table alone on a page: last-resort row split
        // (1-row minimums beat a clipped overflow at this point).
        const singleTag = (blocks[0].tag || '').toUpperCase();
        const chunks = singleTag === 'TABLE'
          ? splitTableByRows(singleHtml, budget, canvasCtx, { minOrphanRows: 1, minWidowRows: 1 })
          : splitParagraphByLines(
              singleHtml, null, budget, canvasCtx.textAlign || 'justify',
              false, 1.5, false, canvasCtx
            );
        if (chunks && chunks.length >= 2) {
          const headHtml = chunks[0];
          const restHtml = chunks.slice(1).join('');
          Object.assign(page, setPageHtml(page, headHtml));
          const restPage = {
            html: restHtml,
            blocks: parseHtmlElements(restHtml),
            pageNumber: 0,
            chapterTitle: page.chapterTitle,
            isBlank: false,
            isTitleOnlyPage: false,
            isFirstChapterPage: false,
            currentSubheader: page.currentSubheader || '',
            firstElementIndex: 0,
            targetFillPct: page.targetFillPct ?? null,
            minLastLineWords: page.minLastLineWords ?? canvasCtx.minLastLineWords ?? 0,
            repairPriority: page.repairPriority ?? DEFAULT_REPAIR_PRIORITY,
          };
          allPages.splice(i + 1, 0, restPage);
          clampCount++;
          if (process.env.NODE_ENV === 'development') {
            log.record('clamp', 'split-single', page.pageNumber || i + 1, {
              oldH: +pageH.toFixed(0),
              headH: +measureHtmlHeight(headHtml, canvasCtx).toFixed(0),
              budget: +budget.toFixed(0),
            });
          }
        }
        continue;
      }
      if (overflow.length === 0) continue; // single-element page — can't trim further

      // Update current page
      const trimmedHtml = serializeBlocks(blocks);
      Object.assign(page, setPageHtml(page, trimmedHtml));
      clampCount++;

      // Prepend overflow elements to next same-chapter page, or insert new page
      const overflowHtml = overflow.map(b => b.outerHtml).join('');
      let nextIdx = i + 1;
      while (nextIdx < allPages.length && allPages[nextIdx]?.isBlank) nextIdx++;

      if (nextIdx < allPages.length
          && allPages[nextIdx]?.chapterTitle === page.chapterTitle
          && !allPages[nextIdx]?.isTitleOnlyPage) {
        const nextPage = allPages[nextIdx];
        const mergedHtml = overflowHtml + (nextPage.html || '');
        Object.assign(nextPage, setPageHtml(nextPage, mergedHtml));
      } else {
        const newPage = {
          html: overflowHtml,
          blocks: parseHtmlElements(overflowHtml),
          pageNumber: 0,
          chapterTitle: page.chapterTitle,
          isBlank: false,
          isTitleOnlyPage: false,
          isFirstChapterPage: false,
          currentSubheader: page.currentSubheader || '',
          firstElementIndex: 0,
          targetFillPct: page.targetFillPct ?? null,
          minLastLineWords: page.minLastLineWords ?? canvasCtx.minLastLineWords ?? 0,
          repairPriority: page.repairPriority ?? DEFAULT_REPAIR_PRIORITY,
        };
        allPages.splice(i + 1, 0, newPage);
      }

      if (process.env.NODE_ENV === 'development') {
        log.record('clamp', 'trim', page.pageNumber || i + 1, {
          removedBlocks: overflow.length,
          oldH: +(pageH + overflow.reduce((s, b) => s + measureHtmlHeight(b.outerHtml, canvasCtx), 0)).toFixed(0),
          newH: +measureHtmlHeight(trimmedHtml, canvasCtx).toFixed(0),
          budget: +budget.toFixed(0),
        });
      }
    }

    if (clampCount > 0) {
      let pn = 1;
      for (const p of allPages) {
        if (!p.isBlank) p.pageNumber = pn;
        pn++;
      }
    }
  }

  // Final cut-line alignment guard (catch-all): whatever pass produced a
  // split-head block, if its LAST LINE is sparse (under 5 words and 55% of
  // the column) it must NOT stretch — flip to left alignment. The cut-line
  // law makes these rare; this guard makes them never-grotesque.
  // Wrapped: a bug here must never blank the whole book — the pages already
  // paginated correctly; alignment is cosmetic.
  try {
    enforceCutLineAlignment(allPages, canvasCtx);
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      log.record('cut-align', 'error', 0, { error: String(err?.message || err) });
    }
  }

  // Vertical justification — distribute residual bottom holes across block
  // gaps so mid-chapter pages end at the same baseline. Runs LAST (after the
  // safety clamp) because it only ADDS padding and is budget-verified.
  applyVerticalJustification(allPages, layoutCtx, canvasCtx, safeConfig, log);

  // Generate structured summary via logger
  log.generateSummary(allPages, evaluatePageQualityCanvas, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx);

  const resultChStartExtra = Math.max(0, (layoutCtx.headerSpaceEstimate || 0) - (layoutCtx.chapterStartBottomClearance || 0))
    + (layoutCtx.chapterStartExtraLines || 0) * lineHeightPx;

  // Puntaje editorial automático — mismas reglas que el gate del corpus de
  // regresión. Nunca puede tumbar la paginación (try/catch).
  let qualityReport = null;
  try {
    qualityReport = computeQualityReport(allPages, canvasCtx, layoutCtx);
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      log.record('quality', 'error', 0, { error: String(err?.message || err) });
    }
  }

  return {
    pages: allPages,
    log: log.getLog(),
    summaryText: log.formatSummaryText(),
    chapterHashes,
    chapterPageSlices,
    chStartExtra: resultChStartExtra,
    headerSpaceEstimate: layoutCtx.headerSpaceEstimate || 0,
    qualityReport,
  };
};

/**
 * Convert a chapter into a flat list of pre-measured elements.
 * Uses Canvas-based measurement (deterministic).
 *
 * @private
 */
export const flattenChapterElements = (chapter, layoutCtx, canvasCtx, measureDiv, safeConfig) => {
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
  const allChildren = parseHtmlElements(chapter.html || '');
  let firstParagraphIdx = -1;
  for (let ci = 0; ci < allChildren.length; ci++) {
    if (allChildren[ci].tag === 'P' || allChildren[ci].tag === 'DIV') {
      firstParagraphIdx = ci;
      break;
    }
  }
  const filtered = allChildren.filter(
    el => el.textContent.trim() || el.tag === 'HR'
  );

  // Tables: try NATIVE grid layout first (tableLayoutEngine measures cell
  // wrapping at fixed column widths and lets the DP split by rows with the
  // header repeated). Only when the grid engine rejects the markup (nested
  // tables, too many columns, unfittable min-content...) fall back to the
  // legacy reading-order linearization, so the worst case is the old behavior.
  const children = [];
  for (const el of filtered) {
    if (el.tag === 'TABLE') {
      const native = buildNativeTableElement(el.outerHtml, canvasCtx);
      if (native) {
        children.push({ tag: 'TABLE', textContent: el.textContent || '', __native: native });
        continue;
      }
      const cells = el.outerHtml.match(/<t[dh][\s>][\s\S]*?<\/t[dh]>/gi) || [];
      let linearHtml = '';
      for (const c of cells) {
        const inner = c.replace(/^<t[dh][^>]*>/i, '').replace(/<\/t[dh]>$/i, '');
        const cellBlocks = inner.match(/<(p|h[1-6]|ul|ol|blockquote)[^>]*>[\s\S]*?<\/\1>/gi);
        if (cellBlocks) linearHtml += cellBlocks.join('');
        else if (inner.replace(/<[^>]+>/g, '').trim()) linearHtml += `<p>${inner}</p>`;
      }
      const linearEls = parseHtmlElements(linearHtml).filter(x => x.textContent.trim());
      children.push(...linearEls);
    } else {
      children.push(el);
    }
  }

  let paragraphCount = 0;
  for (const el of children) {
    // Native table: engine-owned styled HTML + deterministic height. Bypasses
    // buildParagraphHtml (whose fallback would wrap the table in a <p>).
    if (el.__native) {
      elements.push({
        html: el.__native.html,
        height: el.__native.height,
        isTitle: false,
        tag: 'TABLE',
        textContent: el.textContent || '',
        isBold: false
      });
      assignBlockId(elements[elements.length - 1], chapterId, elements.length - 1);
      continue;
    }
    const originalIdx = allChildren.indexOf(el);
    const isFirstParagraph = originalIdx === firstParagraphIdx;
    if (el.tag === 'P' || el.tag === 'DIV') paragraphCount++;

    const html = buildParagraphHtml(
      el, safeConfig, baseFontSize, baseLineHeight, textAlign, isFirstParagraph
    );
    const height = measureHtmlHeight(html, canvasCtx);

    // Detect bold from the ORIGINAL element (before buildParagraphHtml strips it).
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


const snapChunkToSentenceBoundary = (chunk, rest, canvasCtx, lineHeightPx, maxTailLines = 2) => {
  if (!chunk || !rest) return { chunk, rest };

  const innerHtml = getInnerHtml(chunk);
  if (!innerHtml) return { chunk, rest };

  // Walk the inner HTML once, recording the last .?! and last , positions.
  let lastSentencePos = -1;
  let lastCommaPos = -1;
  let visibleCount = 0;
  let i = 0;
  while (i < innerHtml.length) {
    if (innerHtml[i] === '<') {
      const end = innerHtml.indexOf('>', i);
      i = end === -1 ? i + 1 : end + 1;
    } else if (innerHtml[i] === '&') {
      const end = innerHtml.indexOf(';', i);
      if (end !== -1 && end - i <= 10) { i = end + 1; } else { i++; }
      visibleCount++;
    } else {
      const ch = innerHtml[i++];
      visibleCount++;
      if (ch === '.' || ch === '?' || ch === '!') lastSentencePos = visibleCount;
      else if (ch === ',') lastCommaPos = visibleCount;
    }
  }

  const effectiveWidth = (canvasCtx.contentWidth || 0) - (canvasCtx.widthSlack || 0);
  const fontStr = buildFontString(canvasCtx.baseFontSizePx, canvasCtx.fontFamily);

  const countTailLines = (boundaryPos) => {
    const { tailHtml } = splitHtmlByCharsPreservingTags(innerHtml, boundaryPos, { trimLeadingSpace: true });
    const tailText = htmlToText(tailHtml).trim();
    if (!tailText) return 0;
    const kp = getLineBreakPositionsKP(tailText, effectiveWidth, fontStr);
    const ls = kp ? kp.lineStarts : getLineBreakPositions(tailText, effectiveWidth, fontStr);
    return ls.length;
  };

  // Pick the best boundary: prefer .?! (≤2 lines), fall back to , (≤1 line).
  let chosenPos = -1;
  let usedCommaFallback = false;
  if (lastSentencePos >= 0 && lastSentencePos < visibleCount) {
    if (countTailLines(lastSentencePos) <= maxTailLines) chosenPos = lastSentencePos;
  }
  if (chosenPos < 0 && lastCommaPos >= 0 && lastCommaPos < visibleCount) {
    if (countTailLines(lastCommaPos) <= maxTailLines) {
      chosenPos = lastCommaPos;
      usedCommaFallback = true;
    }
  }
  if (chosenPos < 0) return { chunk, rest };

  // Validate outer tags before any reconstruction.
  const openTagMatch  = chunk.match(/^(<[^>]+>)/);
  const closeTagMatch = chunk.match(/<\/([a-zA-Z]+)>\s*$/);
  if (!openTagMatch || !closeTagMatch) return { chunk, rest };
  const restOpenTagMatch  = rest.match(/^(<[^>]+>)/);
  const restCloseTagMatch = rest.match(/<\/([a-zA-Z]+)>\s*$/);
  if (!restOpenTagMatch || !restCloseTagMatch) return { chunk, rest };

  // Split the inner HTML at the chosen boundary.
  let { headHtml: newInnerHead, tailHtml: newInnerTail } =
    splitHtmlByCharsPreservingTags(innerHtml, chosenPos, { trimLeadingSpace: false });

  // Build the combined rest content (tail moved out of chunk + original rest).
  const restInner = getInnerHtml(rest);
  const trimmedTail = newInnerTail.trim();
  let newRestInner = trimmedTail ? `${trimmedTail} ${restInner}` : restInner;

  // Option A: when we snapped to a comma the chunk may end mid-verse.
  // Extend the chunk with whatever from newRestInner fits on the same last line.
  if (usedCommaFallback && newRestInner) {
    const headText = htmlToText(newInnerHead).trimEnd();
    const restText = htmlToText(newRestInner).trim();

    if (headText && restText) {
      const headKp = getLineBreakPositionsKP(headText, effectiveWidth, fontStr);
      const headLineStarts = headKp ? headKp.lineStarts : getLineBreakPositions(headText, effectiveWidth, fontStr);

      const combined = headText + ' ' + restText;
      const combKp = getLineBreakPositionsKP(combined, effectiveWidth, fontStr);
      const combLineStarts = combKp ? combKp.lineStarts : getLineBreakPositions(combined, effectiveWidth, fontStr);

      // First line break that falls after the head — everything before it is on the same verse.
      const firstBreakAfterHead = combLineStarts.find(pos => pos > headText.length);
      if (firstBreakAfterHead !== undefined && firstBreakAfterHead > headText.length + 1) {
        let sameLineText = combined.slice(headText.length + 1, firstBreakAfterHead).trimEnd();

        // If the break falls mid-word, trim back to the last complete word.
        const charAfterBreak = combined[firstBreakAfterHead];
        if (charAfterBreak && charAfterBreak !== ' ') {
          const lastSpace = sameLineText.lastIndexOf(' ');
          sameLineText = lastSpace >= 0 ? sameLineText.slice(0, lastSpace).trimEnd() : '';
        }

        const extraVisibleChars = sameLineText.length;
        if (extraVisibleChars > 0) {
          const { headHtml: extraHtml, tailHtml: remainingRestInner } =
            splitHtmlByCharsPreservingTags(newRestInner, extraVisibleChars, { trimLeadingSpace: true });
          newInnerHead = newInnerHead + extraHtml;
          newRestInner = remainingRestInner;
        }
      }
    }
  }

  // Cut-line fullness guard: a snapped chunk ends mid-line at the sentence
  // boundary. If that leaves a short last line (an orphan word with visible
  // empty width beside it), reject the snap — a full justified cut line is
  // better typography than ending at a sentence (user rule: "si hay una sola
  // palabra en el último renglón, esa línea aún se puede llenar").
  // Measured with a word-walk (getLineBreakPositions returns WORD indices,
  // not char offsets — slicing by them silently disables the check).
  {
    const headText = htmlToText(newInnerHead).replace(/\s+/g, ' ').trim();
    const ctx2d = getEngineCtx2d();
    // Walk at FULL content width — split fragments render without KP
    // word-spacing, so the browser breaks them greedily at the real column.
    const guardWidth = canvasCtx.contentWidth || effectiveWidth;
    if (headText && ctx2d) {
      ctx2d.font = fontStr;
      const spaceW = ctx2d.measureText(' ').width;
      const ws = headText.split(' ').filter(Boolean);
      let lineW = 0, lineWords = 0;
      for (let i = 0; i < ws.length; i++) {
        const w = ctx2d.measureText(ws[i]).width;
        const needed = i === 0 ? lineW + w : lineW + spaceW + w;
        if (i > 0 && needed > guardWidth) { lineW = w; lineWords = 1; }
        else { lineW = needed; lineWords++; }
      }
      const ratio = lineW / guardWidth;
      // Same cut-line law as splitParagraphByLines. The 93% saturation
      // ceiling only matters when the browser re-breaks lines — i.e. for
      // blocks the line renderer does not draw (runs/quotes).
      const snapWrapSafe = canvasCtx.engineLinesRender === true
        && !/&|<span[^>]*style=/i.test(newInnerHead);
      const snapCeilingOk = snapWrapSafe || ratio <= 0.93;
      if (!snapCeilingOk || !((lineWords >= 6 && ratio >= 0.68) || ratio >= 0.85)) return { chunk, rest };
    }
  }

  // Rebuild chunk and rest with the final (possibly extended) content.
  const newChunk = openTagMatch[1] + newInnerHead + `</${closeTagMatch[1]}>`;
  const newRest  = restOpenTagMatch[1] + newRestInner + `</${restCloseTagMatch[1]}>`;

  return { chunk: newChunk, rest: newRest };
};

/**
 * Post-processing pass: for every page whose last block is a split-head that
 * ends mid-sentence, snap backward to the last .?! within maxTailLines so the
 * page ends at a natural sentence boundary instead of looking chopped.
 * Runs after fill-pass so it covers cuts from both greedyPaginate and fill-pass.
 *
 * Budget-aware: a snap is rejected when the receiving page would overflow
 * (which used to cascade into the safety clamp and wreck the layout) or when
 * the donor page would end up more than 2 lines under budget.
 */
const snapSplitPagesToSentenceBoundaries = (pages, canvasCtx, lineHeightPx, maxTailLines = 2, layoutCtx = null) => {
  const contentHeight = layoutCtx?.contentHeight ?? 0;
  const chStartExtra = layoutCtx
    ? Math.max(0, (layoutCtx.headerSpaceEstimate || 0) - (layoutCtx.chapterStartBottomClearance || 0))
      + (layoutCtx.chapterStartExtraLines || 0) * lineHeightPx
    : 0;
  const budgetFor = (p) => contentHeight - getDomSlack() + (p?.isFirstChapterPage ? chStartExtra : 0);

  for (let i = 0; i < pages.length - 1; i++) {
    const page = pages[i];
    if (!page.html || page.isBlank) continue;

    const blocks = getPageBlocks(page);
    if (blocks.length === 0) continue;

    const lastBlock = blocks[blocks.length - 1];
    if (!lastBlock.outerHtml?.includes('data-split-head')) continue;

    // Find the next non-blank page in the same chapter
    let nextIdx = i + 1;
    while (nextIdx < pages.length && pages[nextIdx]?.isBlank) nextIdx++;
    if (nextIdx >= pages.length) continue;

    const nextPage = pages[nextIdx];
    if (!nextPage?.html || page.chapterTitle !== nextPage.chapterTitle) continue;

    const nextBlocks = getPageBlocks(nextPage);
    if (nextBlocks.length === 0) continue;

    const nextFirstBlock = nextBlocks[0];
    if (!nextFirstBlock.outerHtml?.includes('data-continuation')) continue;

    const { chunk: newChunk, rest: newRest } = snapChunkToSentenceBoundary(
      lastBlock.outerHtml, nextFirstBlock.outerHtml, canvasCtx, lineHeightPx, maxTailLines
    );
    if (newChunk === lastBlock.outerHtml) continue;

    const newCurrentHtml = blocks.slice(0, -1).map(b => b.outerHtml).join('') + newChunk;
    const newNextHtml = newRest + nextBlocks.slice(1).map(b => b.outerHtml).join('');

    if (contentHeight > 0) {
      // Receiver must not overflow — otherwise the safety clamp would re-split
      // it blindly and cascade damage down the chapter.
      if (measureHtmlHeight(newNextHtml, canvasCtx) > budgetFor(nextPage)) continue;
      // Donor must not end up visibly hollow (more than 2 lines under budget).
      if (measureHtmlHeight(newCurrentHtml, canvasCtx) < budgetFor(page) - 2 * lineHeightPx) continue;
    }

    pages[i] = setPageHtml(page, newCurrentHtml);
    pages[nextIdx] = setPageHtml(nextPage, newNextHtml);
  }
};

/**
 * Catch-all cut-line alignment guard. Scans every split-head block on every
 * page; if its last rendered line (browser model: full width, style-aware
 * font/word-spacing) is sparse, flips text-align-last from justify to left so
 * it can never stretch 1-4 words across the column.
 * @private
 */
export const enforceCutLineAlignment = (pages, canvasCtx) => {
  const ctx2d = canvasCtx?.ctx2d;
  const W = canvasCtx?.contentWidth || 0;
  if (!ctx2d || !W) return;

  // Line metrics of a block's innerHTML at full width (greedy, style-aware).
  const lastLineMetrics = (innerHtml, open) => {
    const txt = htmlToText(innerHtml || '').replace(/\s+/g, ' ').trim();
    if (!txt) return null;
    const fsM = open.match(/font-size:\s*([\d.]+)(pt|px)/i);
    let fpx = canvasCtx.baseFontSizePx;
    if (fsM) fpx = fsM[2] === 'pt' ? parseFloat(fsM[1]) * (96 / 72) : parseFloat(fsM[1]);
    const fontStr = buildFontString(fpx, canvasCtx.fontFamily,
      /font-weight:\s*(bold|[7-9]00)/i.test(open), /font-style:\s*italic/i.test(open));
    const wsM = open.match(/word-spacing:\s*(-?[\d.]+)px/i);
    ctx2d.font = fontStr;
    const spaceW = ctx2d.measureText(' ').width + (wsM ? parseFloat(wsM[1]) : 0);
    const words = txt.split(' ').filter(Boolean);
    let lineW = 0, lineWords = 0;
    for (let i = 0; i < words.length; i++) {
      const w = ctx2d.measureText(words[i]).width;
      const needed = i === 0 ? lineW + w : lineW + spaceW + w;
      if (i > 0 && needed > W) { lineW = w; lineWords = 1; }
      else { lineW = needed; lineWords++; }
    }
    return { ratio: lineW / W, words: lineWords, fontStr };
  };

  const lawHolds = (m, wrapSafe) => {
    if (!m) return false;
    if (!wrapSafe && m.ratio > 0.93) return false;
    return (m.words >= 6 && m.ratio >= 0.68) || m.ratio >= 0.85;
  };

  for (let pi = 0; pi < pages.length; pi++) {
    const page = pages[pi];
    if (!page?.html || page.isBlank || !/data-split-head/.test(page.html)) continue;
    const blocks = getPageBlocks(page);
    let changed = false;

    const rebuilt = blocks.map((b, bi) => {
      const outer = b.outerHtml;
      if (!/data-split-head/.test(outer)) return outer;
      const open = (outer.match(/^<[^>]+>/) || [''])[0];
      if (!/text-align-last:\s*justify/i.test(open)) return outer;

      const btag = (b.tag || '').toUpperCase();
      const wrapSafe = canvasCtx.engineLinesRender === true
        && (btag === 'P' || btag === 'BLOCKQUOTE')
        && !/&|<span[^>]*style=/i.test(b.innerHTML || '');

      // Measure the last line with the SAME walker the line renderer draws
      // with (indent, per-run fonts, dash-aware). The flat greedy model wraps
      // at different points for indented/styled blocks, so it can bless a
      // line the renderer will actually draw as a 2-word stretched orphan
      // ("Es la" de extremo a extremo, folio 35).
      const wm = wrapSafe ? computeBlockLineMetrics(b, canvasCtx) : null;
      const m = wm
        ? { ratio: wm.lastLine.ratio, words: wm.lastLine.words, fontStr: wm.fontStr, walker: wm }
        : lastLineMetrics(b.innerHTML, open);
      if (lawHolds(m, wrapSafe)) return outer;

      // The paragraph CONTINUES (split-head): its last visible line is an
      // interior line and must stay justified & full. Instead of degrading it
      // to left (visible gap), PULL words from its continuation (the first
      // block of the next page, data-continuation) until the line is full.
      const isLastBlockOnPage = bi === blocks.length - 1;
      if (isLastBlockOnPage && m) {
        let nextIdx = pi + 1;
        while (nextIdx < pages.length && pages[nextIdx]?.isBlank) nextIdx++;
        const nextPage = pages[nextIdx];
        if (nextPage?.html && page.chapterTitle === nextPage.chapterTitle) {
          const nextBlocks = getPageBlocks(nextPage);
          const cont = nextBlocks[0];
          if (cont && /data-continuation/.test(cont.outerHtml)) {
            const pulled = pullToFillCutLine(b, cont, m, canvasCtx, W)
              // Pull can't fill the line (continuation words too long/short).
              // PUSH instead: send the short last line down to the
              // continuation — the former interior line above it is full and
              // justified by construction, so the law holds again.
              || (m.walker ? pushCutLineToCont(b, cont, m.walker, canvasCtx) : null);
            if (pulled) {
              // Rewrite the continuation block on the next page.
              const nextRebuilt = [pulled.contHtml, ...nextBlocks.slice(1).map(x => x.outerHtml)].join('');
              Object.assign(pages[nextIdx], setPageHtml(nextPage, nextRebuilt));
              changed = true;
              return pulled.headHtml;
            }
          }
        }
      }

      // No continuation to pull from (true tail / severed fragment) → left.
      changed = true;
      return outer.replace(/text-align-last:\s*justify/i, 'text-align-last:left');
    });
    if (changed) {
      Object.assign(page, setPageHtml(page, rebuilt.join('')));
    }
  }
};

/**
 * Pull leading words from a continuation block into the split-head's last
 * (short) line so it fills ≥85% width and stays justified. Returns
 * { headHtml, contHtml } or null when it can't help.
 * @private
 */
const pullToFillCutLine = (headBlock, contBlock, headMetrics, canvasCtx, W) => {
  const ctx2d = canvasCtx.ctx2d;
  const headInner = getInnerHtml(headBlock.outerHtml);
  const contInner = getInnerHtml(contBlock.outerHtml);
  const contText = htmlToText(contInner).replace(/\s+/g, ' ').trim();
  if (!contText) return null;

  ctx2d.font = headMetrics.fontStr;
  const spaceW = ctx2d.measureText(' ').width;
  const contWords = contText.split(' ');

  // Greedily add continuation words until the head's last line reaches ~92%.
  let lineW = headMetrics.ratio * W;
  let take = 0;
  for (let i = 0; i < contWords.length; i++) {
    const w = ctx2d.measureText(contWords[i]).width;
    const needed = lineW + spaceW + w;
    if (needed / W > 0.97) break;
    lineW = needed;
    take++;
    if (lineW / W >= 0.85) break;
  }
  if (take === 0 || lineW / W < 0.68) return null;

  const headOpen = (headBlock.outerHtml.match(/^<[^>]+>/) || [''])[0];
  const headClose = (headBlock.outerHtml.match(/<\/[a-zA-Z]+>\s*$/) || ['</p>'])[0];
  const contOpen = (contBlock.outerHtml.match(/^<[^>]+>/) || [''])[0];
  const contClose = (contBlock.outerHtml.match(/<\/[a-zA-Z]+>\s*$/) || ['</p>'])[0];

  // Walker verification when the renderer draws this block: the flat model
  // above only estimates; the real wrap (indent, runs) may push the pulled
  // words onto a NEW line — a stretched orphan. Accept the largest `take`
  // whose walker-drawn result keeps the line count AND satisfies the law.
  const wm0 = headMetrics.walker || null;
  for (let t = take; t >= 1; t--) {
    let chars = 0;
    for (let i = 0; i < t; i++) chars += (i > 0 ? 1 : 0) + contWords[i].length;
    const { headHtml: moved, tailHtml: remaining } =
      splitHtmlByCharsPreservingTags(contInner, chars, { trimLeadingSpace: false });
    const movedText = htmlToText(moved).trim();
    const remainingText = htmlToText(remaining).trim();
    if (!movedText || !remainingText) return null; // never empty the continuation

    const newHead = headOpen + headInner + ' ' + moved.trim() + headClose;
    const newCont = contOpen + remaining.replace(/^\s+/, '') + contClose;

    if (wm0) {
      const check = computeBlockLineMetrics(
        { outerHtml: newHead, tag: headBlock.tag, innerHTML: headInner + ' ' + moved.trim() },
        canvasCtx
      );
      const ok = check
        && check.lineCount === wm0.lineCount
        && ((check.lastLine.words >= 6 && check.lastLine.ratio >= 0.68) || check.lastLine.ratio >= 0.85);
      if (!ok) continue; // try fewer words
    }
    return { headHtml: newHead, contHtml: newCont };
  }
  return null;
};

/**
 * Inverse of the pull: when the head's short last line cannot be filled from
 * the continuation, move that whole line DOWN to the continuation block. The
 * new last visible line is a former interior line — full and justified by
 * construction. Walker-verified; returns { headHtml, contHtml } or null.
 * @private
 */
const pushCutLineToCont = (headBlock, contBlock, walkerMetrics, canvasCtx) => {
  if (!walkerMetrics || walkerMetrics.lineCount < 3) return null; // keep ≥2 lines on the donor page
  const headInner = getInnerHtml(headBlock.outerHtml);
  const contInner = getInnerHtml(contBlock.outerHtml);

  // Split the head at the start of its last line (collapsed-text coords —
  // same coordinate space splitHtmlByCharsPreservingTags slices in).
  const cut = walkerMetrics.lastLine.startChar;
  if (!cut || cut <= 0) return null;
  const { headHtml: keep, tailHtml: pushed } =
    splitHtmlByCharsPreservingTags(headInner, cut, { trimLeadingSpace: false });
  const keepText = htmlToText(keep).trim();
  const pushedText = htmlToText(pushed).trim();
  if (!keepText || !pushedText) return null;

  const headOpen = (headBlock.outerHtml.match(/^<[^>]+>/) || [''])[0];
  const headClose = (headBlock.outerHtml.match(/<\/[a-zA-Z]+>\s*$/) || ['</p>'])[0];
  const contOpen = (contBlock.outerHtml.match(/^<[^>]+>/) || [''])[0];
  const contClose = (contBlock.outerHtml.match(/<\/[a-zA-Z]+>\s*$/) || ['</p>'])[0];

  const newHeadInner = keep.replace(/\s+$/, '');
  const newHead = headOpen + newHeadInner + headClose;
  const check = computeBlockLineMetrics(
    { outerHtml: newHead, tag: headBlock.tag, innerHTML: newHeadInner },
    canvasCtx
  );
  const ok = check
    && check.lineCount === walkerMetrics.lineCount - 1
    && ((check.lastLine.words >= 6 && check.lastLine.ratio >= 0.68) || check.lastLine.ratio >= 0.85);
  if (!ok) return null;

  const newCont = contOpen + pushed.replace(/^\s+/, '') + ' ' + contInner + contClose;
  return { headHtml: newHead, contHtml: newCont };
};

/**
 * Single forward fill-pass using Canvas measurement.
 * @private
 */
const applyFillPass = (pages, layoutCtx, canvasCtx, measureDiv, safeConfig, log) => {
  const { contentHeight, lineHeightPx, minOrphanLines, minWidowLines,
    baseFontSize, baseLineHeight, textAlign, splitLongParagraphs,
    headerSpaceEstimate } = layoutCtx;
  const chStartExtraBudget = Math.max(0, (headerSpaceEstimate || 0) - (layoutCtx.chapterStartBottomClearance || 0))
    + (layoutCtx.chapterStartExtraLines || 0) * lineHeightPx;

  const quoteOptions = canvasCtx;

  // Helper: measure height using Canvas engine
  const measure = (html) => measureHtmlHeight(html, canvasCtx);

  // E5: Two forward fill-passes to handle cascading fills
  for (let pass = 0; pass < 2; pass++) {
  for (let i = 0; i < pages.length - 1; i++) {
    if (i < 0 || i >= pages.length - 1) continue;
    if (pages[i].isBlank || pages[i].isTitleOnlyPage || !pages[i].html) continue;

    // Chapter-start pages skip the header → they have extra vertical budget minus bottom clearance.
    const isChStart = !!pages[i].isFirstChapterPage;
    const effectiveBudget = contentHeight + (isChStart ? chStartExtraBudget : 0);
    const effectiveBudgetSlack = effectiveBudget - getDomSlack();

    const MAX_SOURCE_HOPS = 2;
    let sourceHopCount = 0;
    let sourceStartIdx = i + 1;

    for (let attempt = 0; attempt < 30; attempt++) {
      let currentHtml = pages[i].html;
      const currentHeight = measure(currentHtml);
      const currentFill = currentHeight / effectiveBudget;
      const remainingSpace = effectiveBudgetSlack - currentHeight;
      const remainingLines = Math.floor(remainingSpace / lineHeightPx);

      if (remainingLines < 1) {
        break;
      }
      if (remainingLines >= 3) {
        log.record('fill', 'diag', i + 1, { remainingLines });
      }

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

      // Detect bold-paragraph subheaders
      const isBoldPara = !isHeader && isMostlyBoldParagraph(firstEl);

      // Heading/subheader group move
      if (isHeader || isBoldPara) {
        log.record('fill', 'heading-group', i + 1, { tag, text: firstEl.textContent.substring(0, 60), isHeader, isBoldPara, remainingLines });
        if (measure(currentHtml + firstElHtml) > effectiveBudgetSlack) break;

        let groupHtml = firstElHtml;
        let groupCount = 1;
        for (let si = 1; si < nextPageEls.length; si++) {
          const sibHtml = nextPageEls[si].outerHtml;
          const gh = measure(currentHtml + groupHtml + sibHtml);
          if (gh > effectiveBudgetSlack) break;
          groupHtml += sibHtml;
          groupCount++;
        }
        const sib = nextPageEls.length > groupCount ? nextPageEls[groupCount] : null;

        if (groupCount >= 2) {
          const qGroup = evaluatePageQualityCanvas(currentHtml + groupHtml, contentHeight, lineHeightPx, canvasCtx);
          if (!qGroup.violations.includes('heading_at_bottom')) {
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
        if (groupCount === 1 && sib && splitLongParagraphs) {
          const sibTag = sib.tag;
          if (sibTag !== 'UL' && sibTag !== 'OL' && !/^H[1-6]$/i.test(sibTag)) {
            const spaceForFollow = effectiveBudgetSlack - measure(currentHtml + firstElHtml);
            if (spaceForFollow >= minOrphanLines * lineHeightPx) {
              const isContChunk = sib.dataset?.continuation === 'true';
              const followSplit = splitInTwo(
                sib.outerHtml, measureDiv, canvasCtx, spaceForFollow, effectiveBudgetSlack,
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

        if (remainingLines >= 5) {
          log.record('fill', 'reject', i + 1, { tag, text: firstEl.textContent.substring(0, 60), reason: 'heading-group-failed', groupCount, remainingLines });
        }
        break;
      }

      // Try fitting the whole element (Canvas measurement)
      const candidateFitHeight = measure(currentHtml + firstElHtml);
      if (candidateFitHeight <= effectiveBudgetSlack) {

        const sourceHtml = serializeBlocks(nextPageEls.slice(1)).trim();

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

        // Badness gate
        const qMovedCurrent = evaluatePageQualityCanvas(currentHtml + firstElHtml, contentHeight, lineHeightPx, canvasCtx);
        const qMovedSource  = sourceHtml
          ? evaluatePageQualityCanvas(sourceHtml, contentHeight, lineHeightPx, canvasCtx)
          : { score: 0, violations: [] };
        const badnessAfter = qMovedCurrent.score + qMovedSource.score;

        const BADNESS_MIN_DELTA = remainingLines >= 8
          ? -500
          : remainingLines >= 3
            ? Math.round(-100 - (remainingLines - 3) * 80)
            : -100;
        if (badnessAfter > badnessBefore - BADNESS_MIN_DELTA) {
          log.record('fill', 'reject', i + 1, { tag, text: firstEl.textContent.substring(0, 60), reason: 'badness-gate', before: { score: +badnessBefore.toFixed(0), fillPct: +(currentFill * 100).toFixed(0) }, after: { score: +badnessAfter.toFixed(0), destFill: +(qMovedCurrent.fillPct * 100).toFixed(0), srcScore: +qMovedSource.score.toFixed(0) }, delta: +(badnessBefore - badnessAfter).toFixed(0), features: { remainingLines, minDelta: BADNESS_MIN_DELTA, threshold: +(badnessBefore - BADNESS_MIN_DELTA).toFixed(0), srcViolations: qMovedSource.violations, destViolations: qMovedCurrent.violations } });
          if (sourceHopCount < MAX_SOURCE_HOPS) {
            sourceHopCount++;
            sourceStartIdx = nextIdx + 1;
            log.record('fill', 'hop', i + 1, { hop: sourceHopCount, newSourceStart: sourceStartIdx });
            continue;
          }
          break;
        }
        // Hard constraint: never create heading_at_bottom on DESTINATION page.
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
            && getChunkLastLineWords(currentHtml + firstElHtml, canvasCtx) <= 1) {
          log.record('fill', 'reject', i + 1, {
            tag,
            text: firstEl.textContent.substring(0, 60),
            reason: 'short-last-line',
            currentFill: +currentFill.toFixed(2),
            afterFillPct: +(qMovedCurrent.fillPct * 100).toFixed(0)
          });
          break;
        }

        log.record('fill', 'move', i + 1, { tag: firstEl.tag || '?', text: firstEl.textContent.substring(0, 60), fromPage: nextIdx + 1, before: { score: +badnessBefore.toFixed(0) }, after: { score: +badnessAfter.toFixed(0), fillPct: +(qMovedCurrent.fillPct * 100).toFixed(0) }, beforeHtml: currentHtml, afterHtml: currentHtml + firstElHtml });

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
        sourceHopCount = 0;
        sourceStartIdx = i + 1;
        continue;
      }

      // Element doesn't fit whole — try splitting
      if (remainingLines >= 5) {
        log.record('fill', 'no-fit', i + 1, { tag, text: firstEl.textContent.substring(0, 60), remainingLines, elHeight: +measure(firstElHtml).toFixed(0) });
      }
      if (!splitLongParagraphs || isHeader) break;

      // List splitting
      if (tag === 'UL' || tag === 'OL') {
        const listSplit = splitListByItems(firstElHtml, remainingSpace, canvasCtx, {
          minOrphanItems: 1, minWidowItems: 1,
        });
        if (!listSplit) {
          log.record('fill', 'reject', i + 1, { tag, text: firstEl.textContent.substring(0, 60), reason: 'list-unsplittable', remainingLines });
          break;
        }
        const [listHead, listTail] = listSplit;
        const listHeadH = measure(currentHtml + listHead);
        if (listHeadH > effectiveBudgetSlack) {
          log.record('fill', 'reject', i + 1, { tag, text: firstEl.textContent.substring(0, 60), reason: 'list-split-overfit', remainingLines });
          break;
        }
        const remainingEls = serializeBlocks(nextPageEls.slice(1)).trim();
        const nextHtml = remainingEls ? listTail + remainingEls : listTail;
        Object.assign(pages[nextIdx], setPageHtml(pages[nextIdx], nextHtml));
        currentHtml += listHead;
        Object.assign(pages[i], setPageHtml(pages[i], currentHtml));
        log.record('fill', 'split', i + 1, { tag, text: firstEl.textContent.substring(0, 40), reason: 'list-split' });
        madeProgress = true;
        break;
      }

      // Detect if element is a continuation
      const hasContinuationAttr = firstEl.dataset?.continuation === 'true';
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

      let chunkFitHeight = measure(currentHtml + chunk);
      let overflowRetries = 0;
      while (chunkFitHeight > effectiveBudgetSlack && overflowRetries < 3) {
        overflowRetries++;
        const retrySpace = remainingSpace - overflowRetries * lineHeightPx;
        if (retrySpace < lineHeightPx) break;
        const retryResult = splitInTwo(
          firstElHtml, measureDiv, canvasCtx, retrySpace, effectiveBudget,
          textAlign, true,
          safeConfig.paragraph?.firstLineIndent || 1.5,
          isContChunk, quoteOptions
        );
        if (!retryResult) break;
        [chunk, rest] = retryResult;
        chunkFitHeight = measure(currentHtml + chunk);
      }
      if (chunkFitHeight > effectiveBudgetSlack) {
        log.record('fill', 'reject', i + 1, { tag, text: firstEl.textContent.substring(0, 60), reason: 'split-overfit', chunkFitHeight: +chunkFitHeight.toFixed(0), contentH: +contentHeight.toFixed(0) });
        break;
      }

      // Snap to sentence boundary: if the chunk ends mid-sentence and the last
      // .?! is within 2 lines of the cut, shorten the chunk to end at that point.
      {
        const snapped = snapChunkToSentenceBoundary(chunk, rest, canvasCtx, lineHeightPx, 2);
        if (snapped.chunk !== chunk) {
          chunk = snapped.chunk;
          rest = snapped.rest;
          log.record('fill', 'snap', i + 1, { tag, text: firstEl.textContent.substring(0, 60), reason: 'sentence-boundary' });
        }
      }

      let chunkLines = Math.floor(measure(chunk) / lineHeightPx);

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
              && measure(currentHtml + chunkR) <= effectiveBudgetSlack) {
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
              && measure(currentHtml + chunkS) <= effectiveBudgetSlack) {
            chunk = chunkS; rest = restS;
            chunkLines = chunkSLines; restLines = restSLines;
            log.record('fill', 'split', i + 1, { tag, text: firstEl.textContent.substring(0, 60), reason: 'shallow-retry', chunkLines: chunkSLines, restLines: restSLines });
          }
        }
      }

      if (chunkLines < minOrphanLines && !(chunkLines === 1 && remainingLines <= 1)) break;

      const remainingEls = serializeBlocks(nextPageEls.slice(1)).trim();
      const restoredRest = tag === 'P'
        ? restoreIndentIfNeeded(rest, safeConfig.paragraph?.firstLineIndent || 1.5)
        : rest;
      const newSourceHtml = remainingEls ? restoredRest + remainingEls : restoredRest;

      const newSourceLines = Math.floor(measure(newSourceHtml) / lineHeightPx);
      if (newSourceLines < 1) break;

      const underfillRatio = remainingLines / Math.max(1, Math.round(contentHeight / lineHeightPx));
      const widowPenaltyScale = remainingLines <= 1 ? 0 : remainingLines <= 2 ? 0.2 : underfillRatio >= 0.45 ? 0 : underfillRatio >= 0.35 ? 0.3 : 1;
      const widowSoftPenalty = newSourceLines < minWidowLines ? Math.round(600 * widowPenaltyScale) : 0;

      const totalLines = Math.round(contentHeight / lineHeightPx);
      const emptyRatio = remainingLines / totalLines;

      const qSplitCurrent = evaluatePageQualityCanvas(currentHtml + chunk, contentHeight, lineHeightPx, canvasCtx);
      const qSplitSource  = evaluatePageQualityCanvas(newSourceHtml, contentHeight, lineHeightPx, canvasCtx);

      const destHasWidow = qSplitCurrent.violations.includes('widow');
      const RAW_WIDOW_PENALTY = 1000; // must match evaluatePageQualityCanvas
      const destWidowAdjustment = destHasWidow
        ? Math.round(RAW_WIDOW_PENALTY * widowPenaltyScale) - RAW_WIDOW_PENALTY  // ≤ 0
        : 0;
      const qSplitCurrentAdjusted = qSplitCurrent.score + destWidowAdjustment;

      const srcViolationSet = new Set(qSplitSource.violations);
      const srcOnlyRuntFragment = srcViolationSet.size > 0
        && ![...srcViolationSet].some(v => v === 'orphan' || v === 'widow' || v === 'heading_at_bottom');
      const srcScoreForGate = (srcOnlyRuntFragment && emptyRatio >= 0.25)
        ? Math.round(qSplitSource.score * 0.5)
        : qSplitSource.score;

      const splitBadnessAfter = qSplitCurrentAdjusted + srcScoreForGate + widowSoftPenalty;

      let splitAllowance;
      if (isRetrySplit) {
        splitAllowance = 400;
      } else if (emptyRatio >= 0.25) {
        splitAllowance = Math.min(400, Math.round(200 + emptyRatio * 450));
      } else if (remainingLines <= 1) {
        splitAllowance = 350;
      } else if (remainingLines <= 2) {
        splitAllowance = 400;
      } else if (emptyRatio >= 0.08) {
        splitAllowance = Math.round(120 + (emptyRatio - 0.08) * 765);
      } else {
        splitAllowance = 50;
      }
      const splitThreshold = badnessBefore + splitAllowance;
      if (splitBadnessAfter > splitThreshold) {
        log.record('fill', 'reject', i + 1, { tag, text: firstEl.textContent.substring(0, 60), reason: 'badness-split', before: { score: +badnessBefore.toFixed(0), fillPct: +(currentFill * 100).toFixed(0) }, after: { score: +splitBadnessAfter.toFixed(0), destFill: +(qSplitCurrent.fillPct * 100).toFixed(0), srcScore: +qSplitSource.score.toFixed(0), srcScoreGated: +srcScoreForGate.toFixed(0) }, delta: +(badnessBefore - splitBadnessAfter).toFixed(0), features: { remainingLines, emptyRatio: +emptyRatio.toFixed(2), splitAllowance, threshold: +splitThreshold.toFixed(0), chunkLines, restLines, widowPenalty: widowSoftPenalty, isRetrySplit, destViolations: qSplitCurrent.violations, srcViolations: qSplitSource.violations } });
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
          && getChunkLastLineWords(currentHtml + chunk, canvasCtx) <= 1) {
        log.record('fill', 'reject', i + 1, {
          tag,
          text: firstEl.textContent.substring(0, 60),
          reason: 'short-last-line',
          currentFill: +currentFill.toFixed(2),
          afterFillPct: +(qSplitCurrent.fillPct * 100).toFixed(0)
        });
        break;
      }

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
      const chunkPlain = chunk.replace(/<[^>]*>/g, '').trim();
      const restPlain = rest.replace(/<[^>]*>/g, '').trim();
      log.record('fill', 'split', i + 1, { tag, text: firstEl.textContent.substring(0, 60), fromPage: nextIdx + 1, chunkLines, restLines, chunkTail: chunkPlain.slice(-80), restHead: restPlain.substring(0, 80), before: { score: +badnessBefore.toFixed(0) }, after: { score: +splitBadnessAfter.toFixed(0) }, beforeHtml: currentHtml, afterHtml: currentHtml + chunk });
      sourceHopCount = 0;
      sourceStartIdx = i + 1;
      break;
    }
  }
  } // end 2-pass loop
};
