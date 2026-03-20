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
  buildFontString
} from './textLayoutEngine';

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
export const paginateChapters = (chapters, layoutCtx, measureDiv, safeConfig) => {
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
    const chapterPages = greedyPaginate(elements, layoutCtx, canvasCtx, measureDiv, safeConfig, chapter);
    allPages.push(...chapterPages);
  }

  // Re-number all pages sequentially
  allPages.forEach((p, i) => { p.pageNumber = i + 1; });

  // Fill-pass with multi-pass convergence
  applyFillPass(allPages, layoutCtx, canvasCtx, measureDiv, safeConfig);

  // E5: Fix orphaned headings left at bottom of pages after fill-pass
  fixHeadingsAtBottom(allPages, canvasCtx, layoutCtx);

  // Second fill-pass — fixHeadingsAtBottom may have left pages underfilled
  // (e.g. page that had content+heading is now content-only at 60%).
  // A second forward pass fills those gaps before cleanup runs.
  applyFillPass(allPages, layoutCtx, canvasCtx, measureDiv, safeConfig);

  // E4: Cleanup nearly-empty pages after heading fixes (before distributing space)
  cleanupNearlyEmptyPages(allPages, layoutCtx, canvasCtx);

  // Parity pass 1 — before smoothing so smoothing has correct page positions
  enforceChapterStartParity(allPages, safeConfig);

  // E7: Smooth fill imbalance between adjacent pages.
  // Runs BEFORE distributeVerticalSpace so moved elements don't carry
  // distribution-adjusted margins from their source page to the destination.
  smoothPageBalance(allPages, layoutCtx, canvasCtx);

  // Parity pass 2 — restore invariant if smoothing shifted page count
  enforceChapterStartParity(allPages, safeConfig);

  // E6: Distribute remaining vertical whitespace proportionally among elements.
  // Runs LAST (after all structural mutations) so margins are set once on the
  // final page layout and are never moved to a different page.
  distributeVerticalSpace(allPages, layoutCtx, canvasCtx);

  // Re-number again after fill-pass may have emptied some pages
  let pageNum = 1;
  for (const p of allPages) {
    if (!p.isBlank) p.pageNumber = pageNum++;
  }

  // Dev: per-page score summary — one line per page with fill%, score, violations
  if (process.env.NODE_ENV === 'development') {
    console.groupCollapsed(`[PAGINATION] ${allPages.length} pages — score summary`);
    for (const p of allPages) {
      if (p.isBlank) {
        console.log(`  p${p.pageNumber ?? '?'} [BLANK]`);
        continue;
      }
      const q = evaluatePageQualityCanvas(p.html || '', layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx);
      const flags = [
        p.isTitleOnlyPage  ? 'title-only' : null,
        p.isFirstChapterPage ? 'chapter-start' : null,
        p.isExtraEndPage   ? 'extra-end' : null,
      ].filter(Boolean).join(' ');
      const viols = q.violations.length ? ` ⚠ ${q.violations.join(', ')}` : '';
      console.log(`  p${p.pageNumber ?? '?'} fill=${( q.fillPct * 100).toFixed(1)}% score=${q.score.toFixed(0)}${viols}${flags ? ' [' + flags + ']' : ''}`);
    }
    console.groupEnd();
  }

  return allPages;
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

    elements.push({
      html,
      height,
      isTitle: false,
      tag: el.tagName,
      textContent: el.textContent || ''
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

  // 4. Stability bias — strong preference for delta=0 when last line is already OK.
  // This prevents delta=-1 from being chosen unless there's a real quality gain.
  if (delta === 0) score -= 200;

  if (process.env.NODE_ENV === 'development') {
    console.log(`[SPLIT-CANDIDATE] delta=${delta} words=${lastLineWords} fill=${fill.toFixed(2)} score=${score}`);
  }

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

  const fullPageSplit = splitParagraphByLines(
    elHtml, measureDiv, contentHeight,
    textAlign, hasIndent, indentValue, preserveIndent, quoteOptions
  );

  if (fullPageSplit.length >= 2) {
    const pageChunk = fullPageSplit[0];

    // Merge ALL chunks after index 0 into one continuation.
    const restChunk = fullPageSplit.slice(1).reduce((acc, chunk) => mergeIntoOne(acc, chunk));

    const fitSplit = splitParagraphByLines(
      pageChunk, measureDiv, remainingSpace,
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
    let bestScore = scoreCandidate(baseFirst, bestRest, pageChunk, remainingSpace, contentHeight, canvasCtx, 0);

    // Try delta=-1 only: limits whitespace to 1 line max (fill-pass can't compensate
    // 2-line gaps due to minOrphanLines). Only chosen when last line has 1-2 words.
    const adjMax = remainingSpace - lineHeightPx;
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
        const score = scoreCandidate(cand[0], candRest, pageChunk, remainingSpace, contentHeight, canvasCtx, -1);
        if (score < bestScore) { bestFirst = cand[0]; bestRest = candRest; }
      }
    }

    return [bestFirst, bestRest];
  }

  const directSplit = splitParagraphByLines(
    elHtml, measureDiv, remainingSpace,
    textAlign, hasIndent, indentValue, preserveIndent, quoteOptions
  );

  if (directSplit.length < 2) return null;

  let bestFirst = directSplit[0];
  let bestRest  = directSplit.slice(1).reduce((acc, chunk) => mergeIntoOne(acc, chunk));
  let bestScore = scoreCandidate(bestFirst, bestRest, elHtml, remainingSpace, contentHeight, canvasCtx, 0);

  const adjMax = remainingSpace - lineHeightPx;
  if (adjMax >= lineHeightPx) {
    const cand = splitParagraphByLines(
      elHtml, measureDiv, adjMax,
      textAlign, hasIndent, indentValue, preserveIndent, quoteOptions
    );
    if (cand && cand.length >= 2) {
      const candRest = cand.slice(1).reduce((a, b) => mergeIntoOne(a, b));
      const score = scoreCandidate(cand[0], candRest, elHtml, remainingSpace, contentHeight, canvasCtx, -1);
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
const greedyPaginate = (elements, layoutCtx, canvasCtx, measureDiv, safeConfig, chapter) => {
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
    // Also detect bold paragraphs that act as subheaders (common in Word exports)
    // Patterns: <p><strong>Title</strong></p>, <p><b>Title</b></p>,
    //           <p style="..."><strong>Title</strong></p>,
    //           <p>text with font-weight:bold in style</p>
    const isBoldParagraph = !isHeading && el.tag === 'P' && el.html && (
      /^<p[^>]*>\s*<(?:strong|b)\b/.test(el.html) ||
      /font-weight:\s*(?:bold|[7-9]00)/.test(el.html)
    );

    if (process.env.NODE_ENV === 'development' && (isHeading || isBoldParagraph)) {
      console.log(`[HEADING-DETECT] tag=${el.tag}, isH=${isHeading}, isBoldP=${isBoldParagraph}, text="${(el.textContent || '').substring(0, 50)}"`);
    }

    if (isHeading || isBoldParagraph) {
      const nextEl = elements[elIdx + 1];
      if (nextEl && !nextEl.isTitle) {
        const pageWithSub = measure((currentHtml || '') + el.html);
        const level = isHeading ? el.tag?.toLowerCase() : 'h3';
        const subConfig = safeConfig.subheaders?.[level];
        const effectiveMinLines = Math.max(minOrphanLines, subConfig?.minLinesAfter || 3);
        const minFollowHeight = effectiveMinLines * lineHeightPx;
        const spaceAfterSub = contentHeight - pageWithSub;

        // Check 1: Not enough space for minimum follow lines
        // Check 2: Next element is small enough to fit entirely — great.
        //          Otherwise, a split would be needed, but the split must leave
        //          at least minOrphanLines on this page AND minWidowLines on next.
        //          If space is tight (< minFollowHeight), better move heading to next page.
        const needsMove = spaceAfterSub < minFollowHeight;

        if (needsMove) {
          if (process.env.NODE_ENV === 'development') {
            const title = (el.textContent || el.html?.substring(0, 60) || '').substring(0, 50);
            console.log(`[KEEP-WITH-NEXT] Moving "${title}" to next page (need ${effectiveMinLines} follow lines, only ${(spaceAfterSub / lineHeightPx).toFixed(1)} available)`);
          }
          flushCurrent(el.html, elIdx);
          currentFirstElementIndex = elIdx;
          continue;
        }
      }
    }

    // Check if element fits
    const candidateHeight = measure(currentHtml + el.html);

    if (candidateHeight <= contentHeight) {
      currentHtml += el.html;
      continue;
    }

    // Doesn't fit — measure current page height
    const actualCurrentHeight = measure(currentHtml);
    const remainingSpace = contentHeight - actualCurrentHeight;
    const remainingLines = Math.floor(remainingSpace / lineHeightPx);

    // Try splitting (DIV is included because buildParagraphHtml wraps it as <p>)
    const canSplit = splitLongParagraphs
      && (el.tag === 'P' || el.tag === 'DIV' || el.tag === 'BLOCKQUOTE')
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

        // Absolute floor — both sides must have at least 1 line
        const pageWithChunkHeight = measure(currentHtml + firstChunk);
        const orphanLines = Math.floor(pageWithChunkHeight / lineHeightPx)
          - Math.floor(actualCurrentHeight / lineHeightPx);
        const widowLines = Math.floor(measure(restChunk) / lineHeightPx);

        if (orphanLines >= 1 && widowLines >= 1) {
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

          if (process.env.NODE_ENV === 'development') {
            console.log(`[GREEDY-SPLIT?] p${pages.length + 1}: split=${badnessSplit.toFixed(0)} flush=${badnessFlush.toFixed(0)} orphan=${orphanLines} widow=${widowLines} simSplitLines=${Math.floor(simSplitH / lineHeightPx)} simFlushLines=${Math.floor(simFlushH / lineHeightPx)}`);
          }

          // Accept split only if it produces a meaningfully better layout (Δ > 50)
          if (badnessSplit < badnessFlush - 50) {
            pushPage(currentHtml + firstChunk);
            currentHtml = restChunk;
            continue;
          }
        }
      }
    }

    // Could not split — flush and start new page
    if (process.env.NODE_ENV === 'development' && remainingLines >= 3) {
      console.warn(`[UNDERFILL] p${pages.length + 1}: ${remainingLines} lines wasted (tag=${el.tag}, canSplit=${canSplit})`);
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
const applyFillPass = (pages, layoutCtx, canvasCtx, measureDiv, safeConfig) => {
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
      // Pages with exactly 1 line free still proceed — they can receive a 1-line split
      // to compensate delta=-1 gaps. The orphan check at the source side enforces quality.

      // Find next non-blank page in same chapter
      let nextIdx = i + 1;
      while (nextIdx < pages.length && pages[nextIdx]?.isBlank) nextIdx++;
      if (nextIdx >= pages.length) break;

      const nextPage = pages[nextIdx];
      if (!nextPage?.html || pages[i].chapterTitle !== nextPage.chapterTitle) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[FILL-SKIP] p${i + 1}: chapter boundary or no next page (${remainingLines} lines free)`);
        }
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

      // If next page starts with a header we can't move, try skipping to the page after
      if (isHeader) {
        const candidateWithHeader = measure(currentHtml + firstElHtml);
        const spaceAfterHeader = contentHeight - candidateWithHeader;
        const nextSibling = firstEl.nextElementSibling;
        const headerLevel = tag.toLowerCase();
        const headerSubConfig = safeConfig.subheaders?.[headerLevel];
        const effectiveMinFollowLines = Math.max(minOrphanLines, headerSubConfig?.minLinesAfter || minOrphanLines);
        const minFollowHeight = effectiveMinFollowLines * lineHeightPx;
        const headerBlocked = candidateWithHeader > contentHeight
          || (nextSibling && spaceAfterHeader < Math.min(measure(nextSibling.outerHTML), minFollowHeight));
        if (headerBlocked) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[FILL-SKIP] p${i + 1}: header "${firstEl.textContent?.substring(0, 40)}" blocked (${remainingLines} lines free, need ${effectiveMinFollowLines} follow)`);
          }
          break;
        }
      }

      // Try fitting the whole element (Canvas measurement)
      const candidateFitHeight = measure(currentHtml + firstElHtml);
      if (candidateFitHeight <= contentHeight) {

        firstEl.remove();
        const sourceHtml = tmp.innerHTML.trim();

        // Don't leave source with fewer lines than minWidowLines
        if (sourceHtml) {
          const srcLines = Math.floor(measure(sourceHtml) / lineHeightPx);
          if (srcLines < minWidowLines) break;
        }

        // Badness gate — accept only if total layout quality improves across both pages
        const qMovedCurrent = evaluatePageQualityCanvas(currentHtml + firstElHtml, contentHeight, lineHeightPx, canvasCtx);
        const qMovedSource  = sourceHtml
          ? evaluatePageQualityCanvas(sourceHtml, contentHeight, lineHeightPx, canvasCtx)
          : { score: 0, violations: [] };
        const badnessAfter = qMovedCurrent.score + qMovedSource.score;

        // Allow up to 50 points of degradation — accepts Δ0 (neutral gap-moves)
        // and very small degradations that spread whitespace across pages rather
        // than concentrating it. Large degradations (Δ-100+) are still rejected.
        const BADNESS_MIN_DELTA = -50;
        if (badnessAfter > badnessBefore - BADNESS_MIN_DELTA) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[FILL-BADNESS] p${i + 1}: move rejected — badness ${badnessBefore.toFixed(0)} → ${badnessAfter.toFixed(0)} (Δ${(badnessBefore - badnessAfter).toFixed(0)} < ${BADNESS_MIN_DELTA})`);
          }
          break;
        }
        // Hard constraint: never create heading_at_bottom on DESTINATION page.
        // The badness gate alone is insufficient — when the source is a heading-only
        // page its badness is ~1474 (severe underfill + heading_at_bottom), so any
        // destination (even one gaining heading_at_bottom +800) looks like an improvement.
        if (qMovedCurrent.violations.includes('heading_at_bottom')) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[FILL-SKIP] p${i + 1}: move would create heading_at_bottom on destination — blocked`);
          }
          break;
        }
        // Hard constraint: never strand a heading at the bottom of source page
        if (qMovedSource.violations.includes('heading_at_bottom')) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[FILL-SKIP] p${i + 1}: heading_at_bottom on source — blocked`);
          }
          break;
        }

        // Accept move — try to re-merge split chunks if the moved element
        // is a continuation of the last element on current page.
        // Use data-continuation attribute (set by splitParagraphByLines) — not regex.
        let mergedHtml = currentHtml + firstElHtml;

        const isContinuation = (firstEl.dataset?.continuation === 'true')
          && (tag === 'P' || tag === 'BLOCKQUOTE');
        if (isContinuation) {
          const curDiv = document.createElement('div');
          curDiv.innerHTML = currentHtml;
          const lastEl = curDiv.lastElementChild;
          if (lastEl && lastEl.tagName === tag) {
            // Re-unify: merge continuation back into the original paragraph
            const reunified = mergeIntoOne(lastEl.outerHTML, firstElHtml);
            lastEl.remove();
            mergedHtml = curDiv.innerHTML + reunified;
          }
        }

        if (process.env.NODE_ENV === 'development') {
          const elTag = firstEl.tagName || '?';
          const elText = (firstEl.textContent || '').substring(0, 40);
          console.log(`[FILL-MOVE] p${i + 1}←p${nextIdx + 1}: <${elTag}> "${elText}" | badness ${badnessBefore.toFixed(0)}→${badnessAfter.toFixed(0)} (Δ${(badnessBefore - badnessAfter).toFixed(0)}) | fill ${(qMovedCurrent.fillPct * 100).toFixed(0)}% src ${sourceHtml ? (qMovedSource.fillPct * 100).toFixed(0) + '%' : 'deleted'}`);
        }

        pages[i] = { ...pages[i], html: mergedHtml };
        if (sourceHtml) {
          pages[nextIdx] = { ...nextPage, html: sourceHtml };
        } else {
          pages.splice(nextIdx, 1);
        }
        continue;
      }

      // Element doesn't fit whole — try splitting
      if (!splitLongParagraphs || isHeader || tag === 'UL' || tag === 'OL') break;

      // Detect if element is a continuation — use data-continuation attribute (not regex)
      const isContChunk = firstEl.dataset?.continuation === 'true';
      const splitResult = splitInTwo(
        firstElHtml, measureDiv, canvasCtx, remainingSpace, contentHeight,
        textAlign, true,
        safeConfig.paragraph?.firstLineIndent || 1.5,
        isContChunk, quoteOptions
      );

      if (!splitResult) break;

      const [chunk, rest] = splitResult;

      const chunkFitHeight = measure(currentHtml + chunk);
      if (chunkFitHeight > contentHeight) break;

      const chunkLines = Math.floor(measure(chunk) / lineHeightPx);

      // Only check orphan (chunk going to current page). Don't check widow on
      // the rest chunk alone — it gets prepended to the source page which has
      // more content. The total source page check below is sufficient.
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
      const widowSoftPenalty = newSourceLines < minWidowLines ? 600 : 0;

      // Badness gate for split — accept only if total quality improves
      const qSplitCurrent = evaluatePageQualityCanvas(currentHtml + chunk, contentHeight, lineHeightPx, canvasCtx);
      const qSplitSource  = evaluatePageQualityCanvas(newSourceHtml, contentHeight, lineHeightPx, canvasCtx);
      const splitBadnessAfter = qSplitCurrent.score + qSplitSource.score + widowSoftPenalty;

      // For 1-line gaps (created by delta=-1 splits), accept even Δ0 — the goal is
      // to fill the gap, not to improve total badness. Use a generous threshold.
      // For larger gaps, allow up to 50-point degradation (spreads whitespace rather
      // than concentrating it; rejects large degradations like Δ-1000 orphan cases).
      const splitThreshold = remainingLines <= 1 ? badnessBefore + 300 : badnessBefore + 50;
      if (splitBadnessAfter > splitThreshold) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[FILL-BADNESS-SPLIT] p${i + 1}: split rejected — badness ${badnessBefore.toFixed(0)} → ${splitBadnessAfter.toFixed(0)} (Δ${(badnessBefore - splitBadnessAfter).toFixed(0)}) threshold=${splitThreshold.toFixed(0)}`);
        }
        break;
      }
      // Hard constraint: never create heading_at_bottom on destination (split path)
      if (qSplitCurrent.violations.includes('heading_at_bottom')) break;
      // Hard constraint: never strand heading at bottom of source
      if (qSplitSource.violations.includes('heading_at_bottom')) break;

      pages[i] = { ...pages[i], html: currentHtml + chunk };
      pages[nextIdx] = { ...nextPage, html: newSourceHtml };
      break;
    }
  }
  } // end 2-pass loop
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
const fixHeadingsAtBottom = (pages, canvasCtx, layoutCtx) => {
  for (let i = 0; i < pages.length - 1; i++) {
    const page = pages[i];
    if (!page || page.isBlank || !page.html) continue;

    const div = document.createElement('div');
    div.innerHTML = page.html;
    const children = Array.from(div.children);
    if (children.length === 0) continue;

    const last = children[children.length - 1];
    const isHeading = /^H[1-6]$/i.test(last.tagName);
    const isBoldPara = last.tagName === 'P' && (
      /^<p[^>]*>\s*<(?:strong|b)\b/i.test(last.outerHTML) ||
      /font-weight:\s*(?:bold|[7-9]00)/.test(last.getAttribute('style') || '')
    );

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
      if (process.env.NODE_ENV === 'development') {
        console.log(`[HEADING-FIX] Heading on p${i + 1} can't move (next page full) — leaving in place`);
      }
      continue;
    }

    last.remove();
    const remainingHtml = div.innerHTML.trim();

    pages[i] = { ...page, html: remainingHtml, isBlank: !remainingHtml };
    pages[ni] = { ...next, html: mergedHtml };

    if (process.env.NODE_ENV === 'development') {
      console.log(`[HEADING-FIX] Moved orphaned heading from p${i + 1} to p${ni + 1}`);
    }
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
const smoothPageBalance = (pages, layoutCtx, canvasCtx) => {
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

    const q1 = evaluatePageQualityCanvas(page.html, contentHeight, lineHeightPx, canvasCtx);
    const q2 = evaluatePageQualityCanvas(next.html, contentHeight, lineHeightPx, canvasCtx);

    // Guard: the DONOR (fuller page) must have enough slack to give.
    // Without this, a 99%-full odd page can be reduced to 85% just to
    // balance a 70% even page — the badness gate approves it but the
    // result is inconsistent fill across odd pages throughout the book.
    const donorPct = q1.fillPct > q2.fillPct ? q1.fillPct : q2.fillPct;
    const donorSlackLines = Math.floor((1 - donorPct) * contentHeight / lineHeightPx);
    if (donorSlackLines < MIN_DONOR_SLACK_LINES) continue;

    // Only smooth if imbalance exceeds threshold
    if (Math.abs(q1.fillPct - q2.fillPct) <= SMOOTH_THRESHOLD) continue;

    const badnessBefore = q1.score + q2.score;

    // Determine direction: move from fuller page to emptier page
    const fromIdx = q1.fillPct > q2.fillPct ? i      : nextIdx;
    const toIdx   = q1.fillPct > q2.fillPct ? nextIdx : i;
    const fromPage = pages[fromIdx];
    const toPage   = pages[toIdx];

    const tmp = document.createElement('div');
    tmp.innerHTML = fromPage.html;

    // Forward move (toIdx > fromIdx): take LAST element of fromPage, PREPEND to toPage.
    // Backward move (toIdx < fromIdx): take FIRST element of fromPage, APPEND to toPage.
    // This preserves reading order: content flows from the bottom of one page to the top
    // of the next (or from the top of one page to the bottom of the previous).
    const elToMove = toIdx > fromIdx ? tmp.lastElementChild : tmp.firstElementChild;
    if (!elToMove) continue;

    const elHtml = elToMove.outerHTML;
    elToMove.remove();
    const fromRest = tmp.innerHTML.trim();
    if (!fromRest) continue; // Would empty fromPage — skip

    const toNewHtml = toIdx > fromIdx
      ? elHtml + (toPage.html || '')   // forward: element goes to TOP of next page
      : (toPage.html || '') + elHtml;  // backward: element goes to BOTTOM of prev page

    if (!canAcceptHtml(toNewHtml, contentHeight, canvasCtx)) continue;

    const qFrom = evaluatePageQualityCanvas(fromRest, contentHeight, lineHeightPx, canvasCtx);
    const qTo   = evaluatePageQualityCanvas(toNewHtml, contentHeight, lineHeightPx, canvasCtx);

    // Hard constraints — the badness gate alone is insufficient when pages are
    // severely underfilled (huge badness delta can override a +800 heading penalty).
    if (qFrom.violations.includes('heading_at_bottom')) continue;
    if (qTo.violations.includes('heading_at_bottom')) continue;

    const badnessAfter = qFrom.score + qTo.score;

    if (badnessAfter < badnessBefore - SMOOTH_BADNESS_MIN_DELTA) {
      pages[fromIdx] = { ...fromPage, html: fromRest };
      pages[toIdx]   = { ...toPage,  html: toNewHtml };
      if (process.env.NODE_ENV === 'development') {
        console.log(`[SMOOTH] p${fromIdx + 1}→p${toIdx + 1}: fillPct ${(q1.fillPct * 100).toFixed(0)}%↔${(q2.fillPct * 100).toFixed(0)}% Δbadness ${(badnessBefore - badnessAfter).toFixed(0)}`);
      }
    }
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
    // Also catches bold-paragraph subheaders (same pattern as greedyPaginate and fixHeadingsAtBottom).
    const isBoldParaAtBottom = lastTag === 'P' && (
      /^<p[^>]*>\s*<(?:strong|b)\b/i.test(lastEl.outerHTML) ||
      /font-weight:\s*(?:bold|[7-9]00)/i.test(lastEl.getAttribute('style') || '')
    );
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

