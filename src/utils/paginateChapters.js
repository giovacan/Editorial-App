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
  countHyphenationMetrics
} from './textLayoutEngine';

import { createPaginationLogger } from './paginationLogger.js';

/**
 * Shared justify slack ratio — single source of truth.
 * Used here (greedy paginator) and in paginationEngine.splitParagraphByLines.
 * 4% compensates Canvas.measureText() underestimating Spanish chars (ñ, á, é).
 */
export const JUSTIFY_SLACK_RATIO = 0.04;

/**
 * Main entry point — same interface as before.
 *
 * @param {Chapter[]} chapters
 * @param {object} layoutCtx - Pagination layout context (from usePagination)
 * @param {HTMLElement} measureDiv - DOM element (still used by splitParagraphByLines for HTML parsing)
 * @param {object} safeConfig
 * @returns {Page[]}
 */
export const paginateChapters = (chapters, layoutCtx, measureDiv, safeConfig, logger = null) => {
  const log = logger || createPaginationLogger();
  log.reset();

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
    lineHeightPx: layoutCtx.lineHeightPx
  };

  const { contentHeight, lineHeightPx, baseFontSize: baseFontSizeTop, baseLineHeight: baseLineHeightTop, minOrphanLines: minOrphanLinesTop } = layoutCtx;
  const pageFormat = safeConfig?.pageFormat || layoutCtx.pageFormat || 'unknown';
  log.setConfig({ pageFormat, fontSize: baseFontSizeTop, lineHeight: baseLineHeightTop, contentHeight, contentWidth: layoutCtx.contentWidth, minOrphanLines: minOrphanLinesTop, lineHeightPx });

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];

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

  // E6: Distribute remaining vertical whitespace proportionally among elements.
  // Runs LAST (after all structural mutations) so margins are set once on the
  // final page layout and are never moved to a different page.
  distributeVerticalSpace(allPages, layoutCtx, canvasCtx);

  // ╔══════════════════════════════════════════════════════════════════╗
  // ║  ⚠️  FASE 6 — GLOBAL REOPTIMIZATION PASS                       ║
  // ║  IMPORTANTE: actualmente solo corre en NODE_ENV=development.   ║
  // ║                                                                  ║
  // ║  Para promover a producción se deben cumplir las 3 condiciones: ║
  // ║                                                                  ║
  // ║  1. MISMOS RESULTADOS en el mismo libro entre ejecuciones.      ║
  // ║     Verificar: paginar el mismo libro 3 veces seguidas y        ║
  // ║     confirmar que el pagination-log es byte-for-byte idéntico.  ║
  // ║     Si difiere, hay no-determinismo (DOM timing, font loading). ║
  // ║                                                                  ║
  // ║  2. NINGUNA REGRESIÓN en calidad visual.                        ║
  // ║     Verificar: comparar visualmente los capítulos reoptimizados ║
  // ║     contra los originales. minOrphanLines=1 puede producir      ║
  // ║     líneas sueltas visibles si el scoring no las penaliza bien. ║
  // ║     El log muestra eventos reopt/accepted con delta de score.   ║
  // ║                                                                  ║
  // ║  3. TIEMPO ACEPTABLE en libros grandes (200+ páginas).          ║
  // ║     Verificar: medir cuántos capítulos activa REOPT_SCORE_      ║
  // ║     THRESHOLD en producción real. Cada capítulo reoptimizado    ║
  // ║     corre flattenChapterElements + greedyPaginate + 2x fillPass ║
  // ║     extra — si activa en 10+ capítulos puede agregar 500ms+.    ║
  // ║     Si es necesario, subir REOPT_SCORE_THRESHOLD a 700-800.     ║
  // ╚══════════════════════════════════════════════════════════════════╝
  const REOPT_SCORE_THRESHOLD = 500; // Solo toca páginas genuinamente malas

  if (process.env.NODE_ENV === 'development') {
    // Identify chapters with problematic non-chapter-end pages
    const badChapters = new Set();
    for (const page of allPages) {
      if (page.isBlank || page.isTitleOnlyPage || page.isFirstChapterPage || !page.html) continue;
      const q = evaluatePageQualityCanvas(page.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx);
      // Skip pages that are purely underfilled chapter endings — they can't be improved
      // by reoptimization since there's simply no more content for them
      const isChapterEndPage = q.fillPct < 0.55 && !q.violations.some(v =>
        v === 'orphan' || v === 'widow' || v === 'heading_at_bottom'
      );
      if (!isChapterEndPage && q.score >= REOPT_SCORE_THRESHOLD) {
        badChapters.add(page.chapterTitle);
      }
    }

    if (badChapters.size > 0) {
      // Relaxed layout context: minOrphanLines=1 lets the engine split more aggressively
      const relaxedLayoutCtx = { ...layoutCtx, minOrphanLines: 1, minWidowLines: 1 };

      for (const chapterTitle of badChapters) {
        const chapter = chapters.find(c => c.title === chapterTitle);
        if (!chapter) continue;

        // Score the current pages for this chapter
        const currentChapterPages = allPages.filter(p => p.chapterTitle === chapterTitle && !p.isBlank);
        const currentScore = currentChapterPages.reduce((sum, p) => {
          if (!p.html) return sum;
          return sum + evaluatePageQualityCanvas(p.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score;
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

        // Score the relaxed result
        const relaxedScore = relaxedPages.filter(p => !p.isBlank && p.html).reduce((sum, p) => {
          return sum + evaluatePageQualityCanvas(p.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score;
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

  // DEV: dump final HTML structure of pages 25-35 (after all passes including distributeVerticalSpace)
  if (process.env.NODE_ENV === 'development') {
    for (let di = 0; di < allPages.length; di++) {
      const dp = allPages[di];
      if (!dp || dp.isBlank || !dp.html) continue;
      const dpNum = dp.pageNumber || (di + 1);
      if (dpNum < 25 || dpNum > 35) continue;
      const ddiv = document.createElement('div');
      ddiv.innerHTML = dp.html;
      const els = Array.from(ddiv.children).map((el, idx) => ({
        idx,
        tag: el.tagName,
        text: (el.textContent || '').substring(0, 50),
        indent: (el.getAttribute('style') || '').match(/text-indent:\s*([^;]+)/)?.[1] || 'none',
        cont: el.dataset?.continuation || 'false',
      }));
      log.record('diag', 'page-structure', dpNum, { elements: els });
    }
  }

  // Generate structured summary via logger
  log.generateSummary(allPages, evaluatePageQualityCanvas, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx);

  // Dev: per-page score summary — one line per page using logger data
  if (process.env.NODE_ENV === 'development') {
    const logData = log.getLog();
    console.groupCollapsed(`[PAGINATION] ${allPages.length} pages — score summary`);
    for (const s of logData.summary) {
      if (s.blank) {
        console.log(`  p${s.page} [BLANK]`);
        continue;
      }
      const viols = s.violations.length ? ` \u26A0 ${s.violations.join(', ')}` : '';
      console.log(`  p${s.page} fill=${s.fillPct}% score=${s.score}${viols}`);
    }
    console.groupEnd();
  }

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

  // Content elements
  const tmp = document.createElement('div');
  tmp.innerHTML = chapter.html || '';
  const children = Array.from(tmp.children).filter(
    el => el.textContent.trim() || el.tagName === 'HR'
  );

  let paragraphCount = 0;
  for (const el of children) {
    const isFirstParagraph = paragraphCount === 0;
    if (el.tagName === 'P' || el.tagName === 'DIV') paragraphCount++;

    const html = buildParagraphHtml(
      el, safeConfig, baseFontSize, baseLineHeight, textAlign, isFirstParagraph
    );
    const height = measureHtmlHeight(html, canvasCtx);

    // Detect bold from the ORIGINAL element (before buildParagraphHtml strips it).
    // A paragraph is "bold" (subtitle-like) only if ALL or nearly all text is bold.
    // Paragraphs that START with bold but contain significant non-bold content
    // (e.g. inline bold opener merged with regular text) are regular paragraphs.
    let origIsBold = false;
    if (el.tagName === 'P') {
      if (/font-weight:\s*(?:bold|[7-9]00)/.test(el.getAttribute('style') || '')) {
        // Entire paragraph styled bold via inline style
        origIsBold = true;
      } else if (/^<p[^>]*>\s*<(?:strong|b)\b/i.test(el.outerHTML)) {
        // Starts with <strong>/<b> — check if predominantly bold
        const totalText = (el.textContent || '').trim();
        const boldEls = el.querySelectorAll('strong, b');
        let boldTextLen = 0;
        for (const b of boldEls) boldTextLen += (b.textContent || '').trim().length;
        // Only treat as subtitle if ≥80% of text is bold
        origIsBold = totalText.length > 0 && (boldTextLen / totalText.length) >= 0.8;
      }
    }

    elements.push({
      html,
      height,
      isTitle: false,
      tag: el.tagName,
      textContent: el.textContent || '',
      isBold: origIsBold
    });
  }

  return elements;
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
  const tmp = document.createElement('div');
  tmp.innerHTML = firstChunkHtml;
  const plainText = tmp.textContent.trim();
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
    const offscreen = document.createElement('canvas');
    const ctx2d = offscreen.getContext('2d');
    ctx2d.font = fontStr;
    const lastLineText = words.slice(lastStart).join(' ');
    const widthRatio = ctx2d.measureText(lastLineText).width / effectiveWidth;
    if (widthRatio < 0.55) score += 600;
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
    const offscreen2 = document.createElement('canvas');
    const ctx2d2 = offscreen2.getContext('2d');
    ctx2d2.font = fontStr;
    const lineWidths = [];
    for (let li = 0; li < lineStarts.length; li++) {
      const start = lineStarts[li];
      const end = li < lineStarts.length - 1 ? lineStarts[li + 1] : words.length;
      const lineText = words.slice(start, end).join(' ');
      lineWidths.push(ctx2d2.measureText(lineText).width);
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
  // than Canvas predicted. Reserve 1 extra line when inline styles are present.
  const hasInlineStyles = /<(?:strong|b|em|i)\b/i.test(elHtml);
  const safeRemainingSpace = hasInlineStyles
    ? remainingSpace - lineHeightPx
    : remainingSpace;

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

    // Try delta=-1 only: limits whitespace to 1 line max (fill-pass can't compensate
    // 2-line gaps due to minOrphanLines). Only chosen when last line has 1-2 words.
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
        if (score < bestScore) { bestFirst = cand[0]; bestRest = candRest; }
      }
    }

    return [bestFirst, bestRest];
  }

  const directSplit = splitParagraphByLines(
    elHtml, measureDiv, safeRemainingSpace,
    textAlign, hasIndent, indentValue, preserveIndent, quoteOptions
  );

  if (directSplit.length < 2) return null;

  let bestFirst = directSplit[0];
  let bestRest  = directSplit.slice(1).reduce((acc, chunk) => mergeIntoOne(acc, chunk));
  let bestScore = scoreCandidate(bestFirst, bestRest, elHtml, safeRemainingSpace, contentHeight, canvasCtx, 0);

  const adjMax = safeRemainingSpace - lineHeightPx;
  if (adjMax >= lineHeightPx) {
    const cand = splitParagraphByLines(
      elHtml, measureDiv, adjMax,
      textAlign, hasIndent, indentValue, preserveIndent, quoteOptions
    );
    if (cand && cand.length >= 2) {
      const candRest = cand.slice(1).reduce((a, b) => mergeIntoOne(a, b));
      const score = scoreCandidate(cand[0], candRest, elHtml, safeRemainingSpace, contentHeight, canvasCtx, -1);
      if (score < bestScore) { bestFirst = cand[0]; bestRest = candRest; }
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
    const divA = document.createElement('div');
    divA.innerHTML = htmlA;
    const divB = document.createElement('div');
    divB.innerHTML = htmlB;
    const elA = divA.firstElementChild;
    const elB = divB.firstElementChild;

    if (elA && elB) {
      // Use elA's outerHTML to preserve the original paragraph's styles
      // (especially text-indent). elB is typically a continuation with text-indent:0.
      elA.innerHTML = elA.innerHTML + ' ' + elB.innerHTML;
      // Merged paragraph is complete — reset text-align-last to left.
      // The first chunk may have had justify (for split continuity) but
      // after reunification the last line must be left-aligned.
      elA.style.textAlignLast = 'left';
      return elA.outerHTML;
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
    lineHeightPx
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
    if (currentHtml) pushPage(currentHtml);
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
        // Default 2 (= minOrphanLines) — enough to show the heading isn't stranded
        // at the bottom, without being so strict that it wastes half-pages.
        // Previously defaulted to 3, which was too aggressive and left pages half-empty
        // when the heading + 2 follow lines would have fit perfectly.
        const effectiveMinLines = Math.max(minOrphanLines, subConfig?.minLinesAfter || 2);
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
            pushPage(currentHtml + firstChunk);
            currentHtml = restChunk;
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
  if (currentHtml) pushPage(currentHtml);

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
    baseFontSize, baseLineHeight, textAlign, lineHeightPx
  };

  // Helper: measure height using Canvas engine
  const measure = (html) => measureHtmlHeight(html, canvasCtx);

  // E5: Two forward fill-passes to handle cascading fills
  // (page N fills from N+1, then N+1 can fill from N+2 on second pass)
  for (let pass = 0; pass < 2; pass++) {
  for (let i = 0; i < pages.length - 1; i++) {
    if (i < 0 || i >= pages.length - 1) continue;
    if (pages[i].isBlank || pages[i].isTitleOnlyPage || !pages[i].html) continue;

    for (let attempt = 0; attempt < 30; attempt++) {
      const currentHtml = pages[i].html;
      const remainingSpace = contentHeight - measure(currentHtml);
      const remainingLines = Math.floor(remainingSpace / lineHeightPx);

      if (remainingLines < 1) {
        break;
      }
      if (remainingLines >= 3) {
        log.record('fill', 'diag', i + 1, { remainingLines });
      }
      // Pages with exactly 1 line free still proceed — they can receive a 1-line split
      // to compensate delta=-1 gaps. The orphan check at the source side enforces quality.

      // Find next non-blank page in same chapter
      let nextIdx = i + 1;
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
      const tmp = document.createElement('div');
      tmp.innerHTML = nextPage.html;
      const firstEl = tmp.firstElementChild;
      if (!firstEl) break;

      const tag = firstEl.tagName;
      const isHeader = /^H[1-6]$/i.test(tag);
      const firstElHtml = firstEl.outerHTML;
      if (process.env.NODE_ENV === 'development') {
        const srcRawCont = /data-continuation/.test(nextPage.html);
        const elCont = firstEl.getAttribute('data-continuation');
        if (srcRawCont || elCont) {
          log.record('fill', 'src-extract-debug', i + 1, { srcPage: nextIdx + 1, srcRawCont, elCont, elOuterStart: firstElHtml.substring(0, 120) });
        }
      }

      // Detect bold-paragraph subheaders — only if ≥80% of text is bold.
      // Same logic as flattenChapterElements and fixHeadingsAtBottom.
      let isBoldPara = false;
      if (!isHeader && tag === 'P') {
        if (/font-weight:\s*(?:bold|[7-9]00)/.test(firstEl.getAttribute('style') || '')) {
          isBoldPara = true;
        } else if (/^<p[^>]*>\s*<(?:strong|b)\b/i.test(firstElHtml)) {
          const totalText = (firstEl.textContent || '').trim();
          const boldEls = firstEl.querySelectorAll('strong, b');
          let boldLen = 0;
          for (const b of boldEls) boldLen += (b.textContent || '').trim().length;
          isBoldPara = totalText.length > 0 && (boldLen / totalText.length) >= 0.8;
        }
      }


      // Heading/subheader group move: moving a heading alone to the bottom of a
      // page triggers heading_at_bottom (+800) which the badness gate always rejects.
      // Instead, bundle the heading with follow content so it's NOT the last element.
      // Note: the old headerBlocked check used to `break` here, preventing the group
      // path from being tried. Now we go straight into the group logic which handles
      // both full-element groups and heading+split-follow.
      if (isHeader || isBoldPara) {
        log.record('fill', 'heading-group', i + 1, { tag, text: (firstEl.textContent || '').substring(0, 60), isHeader, isBoldPara, remainingLines });
        // Heading doesn't even fit on the page — no point trying group move
        if (measure(currentHtml + firstElHtml) > contentHeight) break;

        let groupHtml = firstElHtml;
        let groupCount = 1;
        let sib = firstEl.nextElementSibling;
        while (sib) {
          const gh = measure(currentHtml + groupHtml + sib.outerHTML);
          if (gh > contentHeight) break;
          groupHtml += sib.outerHTML;
          groupCount++;
          sib = sib.nextElementSibling;
        }

        if (groupCount >= 2) {
          const qGroup = evaluatePageQualityCanvas(currentHtml + groupHtml, contentHeight, lineHeightPx, canvasCtx);
          if (!qGroup.violations.includes('heading_at_bottom')) {
            // Build source page without the moved group
            const tmpSrc = document.createElement('div');
            tmpSrc.innerHTML = nextPage.html;
            for (let g = 0; g < groupCount; g++) {
              if (tmpSrc.firstElementChild) tmpSrc.firstElementChild.remove();
            }
            const srcHtml = tmpSrc.innerHTML.trim();
            const qSrc = srcHtml
              ? evaluatePageQualityCanvas(srcHtml, contentHeight, lineHeightPx, canvasCtx)
              : { score: 0, violations: [] };

            if (!qSrc.violations.includes('heading_at_bottom')) {
              const groupBadnessAfter = qGroup.score + qSrc.score;
              const BADNESS_MIN_DELTA = remainingLines >= 8 ? -500 : -100;
              if (groupBadnessAfter <= badnessBefore - BADNESS_MIN_DELTA) {
                pages[i] = { ...pages[i], html: currentHtml + groupHtml };
                if (srcHtml) {
                  pages[nextIdx] = { ...nextPage, html: srcHtml };
                } else {
                  pages.splice(nextIdx, 1);
                }
                log.record('fill', 'heading-group', i + 1, { tag, text: (firstEl.textContent || '').substring(0, 60), groupCount, fromPage: nextIdx + 1, before: { score: +badnessBefore.toFixed(0) }, after: { score: +groupBadnessAfter.toFixed(0) } });
                continue;
              }
            }
          }
        }

        // groupCount === 1: heading fits but no full follow element fits.
        // Try splitting the first follow element so heading + partial follow move together.
        if (groupCount === 1 && sib && splitLongParagraphs) {
          const sibTag = sib.tagName;
          if (sibTag !== 'UL' && sibTag !== 'OL' && !/^H[1-6]$/i.test(sibTag)) {
            const spaceForFollow = contentHeight - measure(currentHtml + firstElHtml);
            if (spaceForFollow >= minOrphanLines * lineHeightPx) {
              const isContChunk = sib.dataset?.continuation === 'true';
              const followSplit = splitInTwo(
                sib.outerHTML, measureDiv, canvasCtx, spaceForFollow, contentHeight,
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
                    const tmpSrc = document.createElement('div');
                    tmpSrc.innerHTML = nextPage.html;
                    // Remove heading (first child)
                    if (tmpSrc.firstElementChild) tmpSrc.firstElementChild.remove();
                    // Remove original follow element (now the new first child)
                    if (tmpSrc.firstElementChild) tmpSrc.firstElementChild.remove();
                    const srcHtml = followRest + tmpSrc.innerHTML.trim();
                    const qSrc = evaluatePageQualityCanvas(srcHtml, contentHeight, lineHeightPx, canvasCtx);
                    if (!qSrc.violations.includes('heading_at_bottom')) {
                      const splitBadnessAfter = qDest.score + qSrc.score;
                      // Severe underfill (≥8 lines free) is visually worse than a
                      // fragment continuation, so accept larger degradation.
                      const BADNESS_MIN_DELTA = remainingLines >= 8 ? -500 : -100;
                      if (splitBadnessAfter <= badnessBefore - BADNESS_MIN_DELTA) {
                        pages[i] = { ...pages[i], html: destHtml };
                        pages[nextIdx] = { ...nextPage, html: srcHtml };
                        log.record('fill', 'split', i + 1, { tag, text: (firstEl.textContent || '').substring(0, 60), fromPage: nextIdx + 1, followChunkLines, before: { score: +badnessBefore.toFixed(0) }, after: { score: +splitBadnessAfter.toFixed(0) } });
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
          log.record('fill', 'reject', i + 1, { tag, text: (firstEl.textContent || '').substring(0, 60), reason: 'heading-group-failed', groupCount, remainingLines });
        }
        break;
      }

      // Try fitting the whole element (Canvas measurement)
      const candidateFitHeight = measure(currentHtml + firstElHtml);
      if (candidateFitHeight <= contentHeight) {

        firstEl.remove();
        const sourceHtml = tmp.innerHTML.trim();

        // Don't leave source with fewer lines than minWidowLines
        if (sourceHtml) {
          const srcLines = Math.floor(measure(sourceHtml) / lineHeightPx);
          if (srcLines < minWidowLines) {
            log.record('fill', 'reject', i + 1, { tag, text: (firstEl.textContent || '').substring(0, 60), reason: 'widow-block', srcLines, minWidowLines });
            break;
          }
        }

        // Badness gate — accept only if total layout quality improves across both pages
        const qMovedCurrent = evaluatePageQualityCanvas(currentHtml + firstElHtml, contentHeight, lineHeightPx, canvasCtx);
        const qMovedSource  = sourceHtml
          ? evaluatePageQualityCanvas(sourceHtml, contentHeight, lineHeightPx, canvasCtx)
          : { score: 0, violations: [] };
        const badnessAfter = qMovedCurrent.score + qMovedSource.score;

        // Allow up to 100 points of degradation — accepts Δ0 (neutral gap-moves),
        // small degradations that spread whitespace across pages, and moderate cases
        // like p13 (Δ-65) where the fill-pass cascade will fix the source page next.
        // Severe underfill (≥8 lines free) is visually worse than fragment penalties,
        // so accept larger degradation to fill the page.
        const BADNESS_MIN_DELTA = remainingLines >= 8 ? -500 : -100;
        if (badnessAfter > badnessBefore - BADNESS_MIN_DELTA) {
          log.record('fill', 'reject', i + 1, { tag, text: (firstEl.textContent || '').substring(0, 60), reason: 'badness-gate', before: { score: +badnessBefore.toFixed(0) }, after: { score: +badnessAfter.toFixed(0) }, delta: +(badnessBefore - badnessAfter).toFixed(0) });
          break;
        }
        // Hard constraint: never create heading_at_bottom on DESTINATION page.
        // The badness gate alone is insufficient — when the source is a heading-only
        // page its badness is ~1474 (severe underfill + heading_at_bottom), so any
        // destination (even one gaining heading_at_bottom +800) looks like an improvement.
        if (qMovedCurrent.violations.includes('heading_at_bottom')) {
          log.record('fill', 'reject', i + 1, { tag, text: (firstEl.textContent || '').substring(0, 60), reason: 'heading_at_bottom-dest' });
          break;
        }
        // Hard constraint: never strand a heading at the bottom of source page
        if (qMovedSource.violations.includes('heading_at_bottom')) {
          log.record('fill', 'reject', i + 1, { tag, text: (firstEl.textContent || '').substring(0, 60), reason: 'heading_at_bottom-source' });
          break;
        }

        // Accept move — append element to current page, then immediately run
        // mergeSplitFragments to reunify any adjacent split fragments.
        // This handles both direct moves and the case where a continuation chunk
        // is moved onto a page that already ends with the first-chunk of the same paragraph.
        log.record('fill', 'move', i + 1, { tag: firstEl.tagName || '?', text: (firstEl.textContent || '').substring(0, 60), fromPage: nextIdx + 1, before: { score: +badnessBefore.toFixed(0) }, after: { score: +badnessAfter.toFixed(0), fillPct: +(qMovedCurrent.fillPct * 100).toFixed(0) } });

        pages[i] = { ...pages[i], html: currentHtml + firstElHtml };
        mergeSplitFragments([pages[i]], log);
        if (sourceHtml) {
          pages[nextIdx] = { ...nextPage, html: sourceHtml };
        } else {
          pages.splice(nextIdx, 1);
        }
        continue;
      }

      // Element doesn't fit whole — try splitting
      if (remainingLines >= 5) {
        log.record('fill', 'no-fit', i + 1, { tag, text: (firstEl.textContent || '').substring(0, 60), remainingLines, elHeight: +measure(firstElHtml).toFixed(0) });
      }
      if (!splitLongParagraphs || isHeader || tag === 'UL' || tag === 'OL') break;

      // Detect if element is a continuation — use data-continuation attribute (not regex)
      const isContChunk = firstEl.dataset?.continuation === 'true';
      if (process.env.NODE_ENV === 'development') {
        log.record('fill', 'cont-check', i + 1, { isContChunk, contAttr: firstEl.getAttribute('data-continuation'), text: (firstEl.textContent || '').substring(0, 60) });
      }
      const splitResult = splitInTwo(
        firstElHtml, measureDiv, canvasCtx, remainingSpace, contentHeight,
        textAlign, true,
        safeConfig.paragraph?.firstLineIndent || 1.5,
        isContChunk, quoteOptions
      );

      if (!splitResult) {
        log.record('fill', 'reject', i + 1, { tag, text: (firstEl.textContent || '').substring(0, 60), reason: 'split-null', remainingLines });
        break;
      }

      let [chunk, rest] = splitResult;

      const chunkFitHeight = measure(currentHtml + chunk);
      if (chunkFitHeight > contentHeight) {
        log.record('fill', 'reject', i + 1, { tag, text: (firstEl.textContent || '').substring(0, 60), reason: 'split-overfit', chunkFitHeight: +chunkFitHeight.toFixed(0), contentH: +contentHeight.toFixed(0) });
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
            log.record('fill', 'split', i + 1, { tag, text: (firstEl.textContent || '').substring(0, 60), reason: 'orphan-retry', chunkLines: chunkRLines, restLines: restRLines, remainingLines });
          }
        }
      }
      if (restLines < minOrphanLines) {
        log.record('fill', 'reject', i + 1, { tag, text: (firstEl.textContent || '').substring(0, 60), reason: 'orphan-block', restLines, minOrphanLines, remainingLines });
        break;
      }

      // Only check orphan (chunk going to current page). The rest-chunk widow check
      // is now handled by the hard restLines check above.
      //
      // Exception: allow 1-line moves when the page has exactly 1 line of space.
      // This compensates delta=-1 gaps created by scoreCandidate quality optimization
      // without violating the orphan rule in all other cases.
      if (chunkLines < minOrphanLines && !(chunkLines === 1 && remainingLines <= 1)) break;

      firstEl.remove();
      const remainingEls = tmp.innerHTML.trim();
      const newSourceHtml = remainingEls ? rest + remainingEls : rest;

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
      // Thresholds scale with how empty the page is:
      //   >= 45% empty (severely): +400 (accept up to 400-point degradation)
      //   >= 35% empty (moderately): +380
      //   1-line gap: +300 (delta=-1 compensation)
      //   normal: +50 (only accept meaningful improvements)
      const totalLines = Math.round(contentHeight / lineHeightPx);
      const isSeverelyUnderfilled = remainingLines >= Math.round(totalLines * 0.45);
      const isModeratelyUnderfilled = remainingLines >= Math.round(totalLines * 0.35);
      const splitThreshold = isRetrySplit
        ? badnessBefore + 400
        : isSeverelyUnderfilled ? badnessBefore + 400
        : isModeratelyUnderfilled ? badnessBefore + 380
        : remainingLines <= 1 ? badnessBefore + 300 : badnessBefore + 50;
      if (splitBadnessAfter > splitThreshold) {
        log.record('fill', 'reject', i + 1, { tag, text: (firstEl.textContent || '').substring(0, 60), reason: 'badness-split', before: { score: +badnessBefore.toFixed(0) }, after: { score: +splitBadnessAfter.toFixed(0) }, delta: +(badnessBefore - splitBadnessAfter).toFixed(0) });
        break;
      }
      // Hard constraint: never create heading_at_bottom on destination (split path)
      if (qSplitCurrent.violations.includes('heading_at_bottom')) break;
      // Hard constraint: never strand heading at bottom of source
      if (qSplitSource.violations.includes('heading_at_bottom')) break;

      // Place the split chunk onto the current page, then immediately try to merge
      // adjacent split fragments. This handles cascading splits (e.g. two consecutive
      // fill-pass splits of the same paragraph) where the chunk has data-continuation
      // but the last element of the page is not a direct predecessor tag-match.
      // Rather than relying on the tag check here, we always append first and let
      // mergeSplitFragments() do the merge via its Pass 1 (data-continuation check)
      // or Pass 2 (end-of-sentence heuristic).
      if (process.env.NODE_ENV === 'development') {
        const dbgDiv = document.createElement('div');
        dbgDiv.innerHTML = chunk;
        const dbgEl = dbgDiv.firstElementChild;
        const chunkIndent = dbgEl ? (dbgEl.getAttribute('style') || '').match(/text-indent:\s*([^;]+)/)?.[1] : '?';
        log.record('fill', 'split-chunk-debug', i + 1, { isContChunk, chunkIndent, chunkText: (dbgEl?.textContent || '').substring(0, 60) });
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
      log.record('fill', 'split', i + 1, { tag, text: (firstEl.textContent || '').substring(0, 60), fromPage: nextIdx + 1, chunkLines, restLines, chunkTail: chunkPlain.slice(-80), restHead: restPlain.substring(0, 80), before: { score: +badnessBefore.toFixed(0) }, after: { score: +splitBadnessAfter.toFixed(0) } });
      break;
    }
  }
  } // end 2-pass loop
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

    const div = document.createElement('div');
    div.innerHTML = page.html;
    let children = Array.from(div.children);
    let changed = false;

    // Pass 1: merge elements with data-continuation='true' with their predecessor.
    // Safety: only merge with the immediately preceding same-tag element — if any
    // other element type is between them, they are NOT split fragments from the same
    // paragraph (the fill-pass or smooth-pass placed them there intentionally).
    for (let i = 1; i < children.length; i++) {
      const el = children[i];
      if (el.dataset?.continuation !== 'true') continue;
      const tag = el.tagName;

      for (let j = i - 1; j >= 0; j--) {
        const prev = children[j];
        if (prev.tagName !== tag) break; // stop at any non-matching element — don't skip over

        prev.innerHTML = prev.innerHTML + ' ' + el.innerHTML;
        prev.style.textAlignLast = 'left';
        prev.removeAttribute('data-continuation');
        el.remove();
        children.splice(i, 1);
        i--;
        changed = true;
        if (log) log.record('merge', 'pass1-merge', pageIdx + 1, { tag, text: (prev.textContent || '').substring(0, 60) });
        break;
      }
    }

    // Pass 2: merge adjacent <p> elements where the first ends mid-sentence.
    // This catches splits where neither fragment has data-continuation
    // (e.g. fill-pass split's chunk appended after a greedy-split's firstChunk).
    // A <p> that ends without sentence-ending punctuation (.!?»") was truncated
    // by a split — the next <p> of the same tag is its continuation.
    children = Array.from(div.children);
    for (let i = 0; i < children.length - 1; i++) {
      const el = children[i];
      const next = children[i + 1];
      if (el.tagName !== 'P' || next.tagName !== 'P') continue;

      // Skip if either is a heading-like element (bold paragraph = subtitle)
      if (/font-weight:\s*bold/i.test(el.getAttribute('style') || '')) continue;
      if (/font-weight:\s*bold/i.test(next.getAttribute('style') || '')) continue;

      const elText = (el.textContent || '').trim();
      // Check if element ends mid-sentence (no sentence-ending punctuation)
      if (!elText || /[.!?»"]\s*$/.test(elText)) continue;

      // Safety: next element should look like a continuation, not a new paragraph.
      // Accept if: text-indent:0, no text-indent, OR next starts with lowercase
      // (no real paragraph/sentence starts lowercase — it must be a split fragment).
      const nextStyle = next.getAttribute('style') || '';
      const nextHasZeroIndent = /text-indent:\s*0/.test(nextStyle);
      const nextHasNoIndent = !/text-indent/.test(nextStyle);
      const nextText = (next.textContent || '').trim();
      const nextStartsLowercase = /^[a-záéíóúüñ]/.test(nextText);
      if (!nextHasZeroIndent && !nextHasNoIndent && !nextStartsLowercase) {
        if (log) log.record('merge', 'pass2-skip', pageIdx + 1, { reason: 'indent-check', text: (el.textContent || '').substring(0, 60) });
        continue;
      }

      // Merge
      el.innerHTML = el.innerHTML + ' ' + next.innerHTML;
      el.style.textAlignLast = 'left';
      next.remove();
      children.splice(i + 1, 1);
      i--; // re-check
      changed = true;
      if (log) log.record('merge', 'pass2-merge', pageIdx + 1, { text: (el.textContent || '').substring(0, 60) });
    }

    if (changed) {
      page.html = div.innerHTML;
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

    const div = document.createElement('div');
    div.innerHTML = page.html;
    const children = Array.from(div.children);
    if (children.length < 2) continue;

    // Don't adjust if last element is a heading (should have been moved already)
    const last = children[children.length - 1];
    if (/^H[1-6]$/i.test(last.tagName)) continue;

    const numGaps = children.length - 1;
    const maxPerGap = Math.min(gap / numGaps, MAX_PER_GAP);
    if (maxPerGap < 1) continue;

    // Capture original margins before any modification
    const origMargins = children.map(el => parseFloat(el.style.marginBottom) || 0);

    // Binary search for the largest perGap that keeps total height ≤ contentHeight.
    // Avoids overflow when Canvas and browser disagree on margin interactions.
    const applyGap = (g) => {
      children.forEach((el, idx) => {
        if (idx < children.length - 1) {
          el.style.marginBottom = `${(origMargins[idx] + g).toFixed(1)}px`;
        }
      });
      return div.innerHTML;
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

    const div = document.createElement('div');
    div.innerHTML = page.html;
    const children = Array.from(div.children);
    if (children.length === 0) continue;

    const last = children[children.length - 1];
    const isHeading = /^H[1-6]$/i.test(last.tagName);
    // Bold paragraph = subtitle-like: only if ≥80% of text is bold.
    // Paragraphs with inline bold opener (e.g. bold question + regular text)
    // are NOT subtitles and should not be moved.
    let isBoldPara = false;
    if (last.tagName === 'P') {
      if (/font-weight:\s*(?:bold|[7-9]00)/.test(last.getAttribute('style') || '')) {
        isBoldPara = true;
      } else if (/^<p[^>]*>\s*<(?:strong|b)\b/i.test(last.outerHTML)) {
        const totalText = (last.textContent || '').trim();
        const boldEls = last.querySelectorAll('strong, b');
        let boldLen = 0;
        for (const b of boldEls) boldLen += (b.textContent || '').trim().length;
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
    const headingHtml = last.outerHTML;
    const mergedHtml = headingHtml + (next.html || '');
    if (!canAcceptHtml(mergedHtml, layoutCtx.contentHeight, canvasCtx)) {
      // Heading doesn't fit on next page — leave heading in place.
      // Do NOT mark as isTitleOnlyPage: that flag is only for chapter title pages,
      // and misusing it would cause distributeVerticalSpace and smoothPageBalance
      // to skip this page entirely, leaving large whitespace gaps uncorrected.
      log.record('heading-fix', 'reject', i + 1, { tag: last.tagName, text: (last.textContent || '').substring(0, 60), reason: 'next-page-full' });
      continue;
    }

    last.remove();
    const remainingHtml = div.innerHTML.trim();

    pages[i] = { ...page, html: remainingHtml, isBlank: !remainingHtml };
    pages[ni] = { ...next, html: mergedHtml };

    log.record('heading-fix', 'move', i + 1, { tag: last.tagName, text: (last.textContent || '').substring(0, 60), toPage: ni + 1 });
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

    const tmp = document.createElement('div');
    tmp.innerHTML = pages[fromIdx].html;

    // Forward move (toIdx > fromIdx): take LAST element of fromPage, PREPEND to toPage.
    // Backward move (toIdx < fromIdx): take FIRST element of fromPage, APPEND to toPage.
    // This preserves reading order: content flows from the bottom of one page to the top
    // of the next (or from the top of one page to the bottom of the previous).
    const elToMove = toIdx > fromIdx ? tmp.lastElementChild : tmp.firstElementChild;
    if (!elToMove) break;

    const elHtml = elToMove.outerHTML;
    elToMove.remove();
    const fromRest = tmp.innerHTML.trim();
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

    const badnessAfter = qFrom.score + qTo.score;

    if (badnessAfter < badnessBefore - SMOOTH_BADNESS_MIN_DELTA) {
      pages[fromIdx] = { ...pages[fromIdx], html: fromRest };

      // Reunify split fragments if the moved element is a continuation chunk.
      // A backward move (toIdx < fromIdx) appends the element to the bottom of the
      // previous page — if it is a data-continuation chunk and the page already ends
      // with the first-chunk of the same paragraph, merge them into one <p> now.
      // This avoids leaving two adjacent <p> elements that look like a new paragraph.
      let finalToHtml = toNewHtml;
      if (toIdx < fromIdx) {
        const movedDiv = document.createElement('div');
        movedDiv.innerHTML = elHtml;
        const movedEl = movedDiv.firstElementChild;
        const isCont = movedEl?.dataset?.continuation === 'true'
          && (movedEl.tagName === 'P' || movedEl.tagName === 'BLOCKQUOTE');
        if (isCont) {
          const toDiv = document.createElement('div');
          toDiv.innerHTML = toNewHtml;
          // The appended continuation is the last child; its predecessor should be the first chunk
          const lastChild = toDiv.lastElementChild;
          const secondLast = lastChild?.previousElementSibling;
          if (secondLast && secondLast.tagName === lastChild.tagName) {
            const reunified = mergeIntoOne(secondLast.outerHTML, lastChild.outerHTML);
            secondLast.remove();
            lastChild.remove();
            toDiv.innerHTML += reunified;
            finalToHtml = toDiv.innerHTML;
          }
        }
      }

      pages[toIdx] = { ...pages[toIdx], html: finalToHtml };
      log.record('smooth', 'move', fromIdx + 1, { toPage: toIdx + 1, attempt, before: { score: +badnessBefore.toFixed(0), fillPct: +(q1.fillPct * 100).toFixed(0) }, after: { score: +badnessAfter.toFixed(0), fillPct: +(qTo.fillPct * 100).toFixed(0) } });
      // If receiver is now above 70%, balance is good enough — stop moving
      if (qTo.fillPct >= 0.70) break;
    } else {
      break; // no improvement — stop attempts for this pair
    }
    } // end attempt loop
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
const evaluatePageQualityCanvas = (pageHtml, contentHeight, lineHeightPx, canvasCtx, isFragment = false) => {
  if (!pageHtml) return { score: Infinity, fillPct: 0, violations: [] };

  // fs = fragment scale: when isFragment=true the html is a split remainder that will
  // receive more content — fill-related penalties are false positives in that context.
  // heading_at_bottom, fragment, split_shallow stay at full weight (they reflect the
  // quality of the split itself, not the final fill state).
  const fs = isFragment ? 0.3 : 1.0;

  const measure = (html) => measureHtmlHeight(html, canvasCtx);
  const pageHeight = measure(pageHtml);
  const remainingSpace = contentHeight - pageHeight;
  const violations = [];
  let score = 0;

  // Whitespace penalty — line-based tiers (TeX-style)
  // 80/line for 1-2 lines: enough "inertia" to avoid micro-optimisations.
  // Steps up at 3+ and 5+ lines to force the fill-pass to act on serious underfill.
  // Scaled by fs when evaluating a fragment (incomplete page).
  const unusedLines = Math.floor(Math.max(0, remainingSpace) / lineHeightPx);
  if (unusedLines > 4)      score += 500 * fs; // severe underfill (5+ lines)
  else if (unusedLines > 2) score += 200 * fs; // moderate underfill (3-4 lines)
  else                      score += unusedLines * 80 * fs; // 1-2 lines: 80/160

  // fillPct deviation penalty — pages deviating from 92% fill target score higher.
  // Discourages both underfill (< 92%) and overfill (> 92%).
  // Scaled by fs when evaluating a fragment (fill will change as content is added).
  const fillPct = pageHeight / contentHeight;
  score += Math.abs(fillPct - 0.92) * 200 * fs;

  // Parse structure
  const div = document.createElement('div');
  div.innerHTML = pageHtml;
  const children = Array.from(div.children);

  if (children.length > 0) {
    const lastEl = children[children.length - 1];
    const lastTag = lastEl.tagName || '';

    // Heading at bottom penalty — nearly as bad as widow/orphan.
    // Only catches predominantly-bold paragraphs (≥80% bold text = subtitle-like).
    let isBoldParaAtBottom = false;
    if (lastTag === 'P') {
      if (/font-weight:\s*(?:bold|[7-9]00)/i.test(lastEl.getAttribute('style') || '')) {
        isBoldParaAtBottom = true;
      } else if (/^<p[^>]*>\s*<(?:strong|b)\b/i.test(lastEl.outerHTML)) {
        const totalText = (lastEl.textContent || '').trim();
        const boldEls = lastEl.querySelectorAll('strong, b');
        let boldLen = 0;
        for (const b of boldEls) boldLen += (b.textContent || '').trim().length;
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
      if (el.tagName?.toUpperCase() !== 'P') continue;

      const isContinuation = el.dataset.continuation === 'true';
      const elLines = Math.floor(measure(el.outerHTML) / lineHeightPx);

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
  }

  return {
    score,
    fillPct,   // 0.0–1.0 ratio (fillPct computed above for deviation penalty)
    violations
  };
};

/**
 * Guard: returns true only if html fits within contentHeight.
 * Used by all page-mutation functions to prevent silent overflow.
 *
 * @private
 */
const canAcceptHtml = (html, contentHeight, canvasCtx) =>
  measureHtmlHeight(html, canvasCtx) <= contentHeight;

