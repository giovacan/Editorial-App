/**
 * breakpoints.js
 *
 * Breakpoint collection, scoring, and greedy pagination extracted from paginateChapters.js.
 */

import {
  splitParagraphByLines,
  splitListByItems,
} from '../paginationEngine';

import {
  htmlToText,
  parseTopLevelBlocks as parseHtmlElements,
  serializeBlocks,
} from '../layoutIr.js';

import {
  measureHtmlHeight,
} from '../textLayoutEngine';

import { deriveFragmentId, injectBlockIdAttrs } from '../paginationLogger.js';

import {
  getDomSlack,
  DEFAULT_REPAIR_PRIORITY,
  normalizePolicyTag,
  policyIncludesTag,
  computeRuntLinePenalty,
} from './constants.js';

import {
  getLastLineMetrics,
  isSevereShortLastLine,
  mergeIntoOne,
  getChunkLastLineWords,
} from './metrics.js';

import { evaluatePageQualityCanvas } from './evaluation.js';

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
export const collectBreakpoints = (elements, startIdx, baseHtml, budget, canvasCtx, layoutCtx, measureDiv, safeConfig, log) => {
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
      // onto this page.
      const specRemainingSpace = budget - withElH;
      const specRemainingLines = Math.floor(specRemainingSpace / lineHeightPx);
      const nextEl = i + 1 < elements.length ? elements[i + 1] : null;
      const nextCanSplit = nextEl
        && splitLongParagraphs
        && !nextEl.isTitle
        && nextEl.chapterTitle === chapterTitle
        && (nextEl.tag === 'P' || nextEl.tag === 'DIV' || nextEl.tag === 'BLOCKQUOTE')
        && !nextEl.isBold
        && specRemainingLines >= 2;

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

    // C. List element doesn't fit — try splitting at <li> boundaries
    const canSplitList = splitLongParagraphs && (el.tag === 'UL' || el.tag === 'OL');
    if (canSplitList) {
      const remainingSpace = budget - accHeight;
      if (remainingSpace >= lineHeightPx * 2) {
        const listSplit = splitListByItems(el.html, remainingSpace, canvasCtx, {
          minOrphanItems: 1,
          minWidowItems: 1,
        });
        if (listSplit) {
          const [headHtml, tailHtml] = listSplit;
          const headH = measure(accumulated + headHtml);
          if (headH <= budget) {
            const headLines = Math.max(1, Math.floor(measure(headHtml) / lineHeightPx));
            const tailLines = Math.max(1, Math.floor(measure(tailHtml) / lineHeightPx));
            candidates.push({
              type: 'para-split',
              elementIndex: i,
              html: accumulated + headHtml,
              height: headH,
              restHtml: tailHtml,
              isHeadingOrBold: false,
              isLastChapterElement: i === elements.length - 1,
              orphanLines: headLines,
              widowLines: tailLines,
              splitLine: headLines,
              totalLines: headLines + tailLines,
            });
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
export const scoreBreakpoint = (candidate, canvasCtx, layoutCtx, elements, log, chapterLayoutPolicy = null) => {
  const { contentHeight, lineHeightPx, minOrphanLines } = layoutCtx;
  let penalty = 0;
  const candidateEl = candidate.elementIndex >= 0 ? elements[candidate.elementIndex] : null;
  const candidateTag = normalizePolicyTag(candidateEl?.tag);
  const keepWithNextProtected = policyIncludesTag(chapterLayoutPolicy?.keepWithNextTags, candidateTag);

  // 1. PROHIBIDO: overflow
  if (candidate.height > contentHeight) return Infinity;

  // 2. PROHIBIDO: heading or bold paragraph at bottom of page
  if ((candidate.type === 'block-end' || candidate.type === 'flush') && (candidate.isHeadingOrBold || keepWithNextProtected)) {
    const nextIdx = candidate.elementIndex + 1;
    const hasFollowing = nextIdx < elements.length
      && elements[nextIdx].chapterTitle === elements[candidate.elementIndex].chapterTitle
      && !elements[nextIdx].isTitle;
    if (hasFollowing) {
      penalty += keepWithNextProtected && !candidate.isHeadingOrBold ? 1800 : 2500;
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
    if (policyIncludesTag(chapterLayoutPolicy?.avoidSplitTags, candidateTag)) {
      penalty += 1200;
    }
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
    penalty += computeRuntLinePenalty(
      metrics.lastLineWords,
      metrics.widthRatio ?? 1,
      chapterLayoutPolicy?.minLastLineWords ?? canvasCtx?.minLastLineWords ?? 0
    );

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
        if (isSevereShortLastLine(
          metrics,
          chapterLayoutPolicy?.minLastLineWords ?? canvasCtx?.minLastLineWords ?? 0
        ) && unusedLines <= 1) {
          penalty += computeRuntLinePenalty(
            metrics.lastLineWords,
            metrics.widthRatio ?? 1,
            chapterLayoutPolicy?.minLastLineWords ?? canvasCtx?.minLastLineWords ?? 0
          );
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
  if (candidate.type === 'para-split' && !candidate.isLastChapterElement) {
    const measure = (html) => measureHtmlHeight(html, canvasCtx);
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
export const pickBestBreakpoint = (candidates, canvasCtx, layoutCtx, elements, log, chapterLayoutPolicy = null) => {
  if (candidates.length === 0) return null;

  let best = candidates[0];
  let bestScore = scoreBreakpoint(best, canvasCtx, layoutCtx, elements, log, chapterLayoutPolicy);

  for (let i = 1; i < candidates.length; i++) {
    const score = scoreBreakpoint(candidates[i], canvasCtx, layoutCtx, elements, log, chapterLayoutPolicy);
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
export const greedyPaginate = (elements, layoutCtx, canvasCtx, measureDiv, safeConfig, chapter, log, chapterLayoutPolicy = null) => {
  const {
    contentHeight, lineHeightPx, baseFontSize, baseLineHeight, textAlign,
    minOrphanLines, minWidowLines, splitLongParagraphs, headerSpaceEstimate: headerSpaceEst
  } = layoutCtx;
  // Chapter start pages that skip the header get extra budget (header space reclaimed).
  const skipHeaderOnChStart = safeConfig?.header?.skipFirstChapterPage !== false;
  const chapterStartExtraBudget = (skipHeaderOnChStart && headerSpaceEst > 0) ? headerSpaceEst : 0;

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
    const serialized = serializeBlocks(blocks);
    const pageNum = pages.length + 1;

    pages.push({
      html: serialized,
      blocks,
      pageNumber: pageNum,
      chapterTitle: chapter.title,
      isBlank: blocks.length === 0,
      isTitleOnlyPage: opts.isTitleOnlyPage || false,
      isFirstChapterPage: opts.isFirstChapterPage || false,
      currentSubheader,
      firstElementIndex: currentFirstElementIndex,
      targetFillPct: chapterLayoutPolicy?.targetFillPct ?? null,
      minLastLineWords: chapterLayoutPolicy?.minLastLineWords ?? canvasCtx?.minLastLineWords ?? 0,
      repairPriority: chapterLayoutPolicy?.repairPriority ?? DEFAULT_REPAIR_PRIORITY,
    });
    prevWasTitleOnly = opts.isTitleOnlyPage || false;
    pageHasTitle = false;
  };

  const flushCurrent = (startWith = '', firstIdx = null) => {
    if (currentHtml) {
      // First content page after a fullPage title also counts as chapter start
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

    const policyKeepWithNext = policyIncludesTag(chapterLayoutPolicy?.keepWithNextTags, el.tag);

    if (isHeading || isBoldParagraph || policyKeepWithNext) {
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
        const spaceAfterSub = (contentHeight + (pageHasTitle ? chapterStartExtraBudget : 0)) - pageWithSub;

        if (spaceAfterSub < minFollowHeight) {
          log.record('greedy', 'keep-with-next', pages.length + 1, {
            tag: el.tag,
            text: (el.textContent || '').substring(0, 60),
            effectiveMinLines,
            availableLines: +(spaceAfterSub / lineHeightPx).toFixed(1),
            policyKeepWithNext,
          });
          flushCurrent(el.html, elIdx);
          currentFirstElementIndex = elIdx;
          continue;
        }
      }
    }

    // ── BREAKPOINT SELECTION ──
    const extraBudget = pageHasTitle ? chapterStartExtraBudget : 0;
    const pageHeightBudget = contentHeight - getDomSlack() + extraBudget;

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
          && freeLinesAfter <= 2
          && currentFill >= 0.70
          && currentHtml
          && currentFirstElementIndex !== elIdx) {
        const plainText = (el.textContent || '').trim();
        const shortLine = getLastLineMetrics(plainText, canvasCtx);
        if (isSevereShortLastLine(
          shortLine,
          chapterLayoutPolicy?.minLastLineWords ?? canvasCtx?.minLastLineWords ?? 0
        )) {
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
          && currentHtml
          && currentFirstElementIndex !== elIdx) {
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
    const candidates = collectBreakpoints(
      elements, elIdx, currentHtml, pageHeightBudget,
      canvasCtx, layoutCtx, measureDiv, safeConfig, log
    );

    // Also add a "flush" candidate: close the page as-is, this element starts a new page.
    if (currentHtml) {
      const flushHeight = measure(currentHtml);
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
      if (currentHtml) {
        // Flush existing content first, then retry this element on a fresh page
        flushCurrent('', null);
        elIdx--; // re-process this element on the now-empty page
        continue;
      }
      // currentHtml is empty and element still doesn't fit → oversized element.
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

    const best = pickBestBreakpoint(candidates, canvasCtx, layoutCtx, elements, log, chapterLayoutPolicy);

    if (!best) {
      // Shouldn't happen, but safety fallback
      flushCurrent(el.html, elIdx);
      currentFirstElementIndex = elIdx;
      continue;
    }

    if (best.type === 'flush') {
      log.record('greedy', 'bp-flush', pages.length + 1, {
        tag: el.tag, text: (el.textContent || '').substring(0, 60),
        reason: 'breakpoint-flush',
        pageFill: +(best.height / contentHeight * 100).toFixed(1),
        isChapterStart: pageHasTitle
      });
      flushCurrent(el.html, elIdx);
      currentFirstElementIndex = elIdx;
      continue;
    }

    if (best.type === 'block-end') {
      // Update subheader tracking for all elements included in this page
      for (let s = elIdx; s <= best.elementIndex; s++) {
        if (/^H[1-6]$/i.test(elements[s].tag) && !elements[s].isTitle && elements[s].textContent) {
          currentSubheader = elements[s].textContent;
        }
      }
      // Page ends after a complete block element.
      pushPage(best.html, { isFirstChapterPage: pageHasTitle });
      currentHtml = '';
      pageHasTitle = false;
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
        isChapterStart: pageHasTitle,
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
      elIdx = best.elementIndex;
      currentFirstElementIndex = elIdx + 1;
      continue;
    }
  }

  // Final flush
  if (currentHtml) pushPage(currentHtml, { isFirstChapterPage: pageHasTitle });

  return pages;
};
