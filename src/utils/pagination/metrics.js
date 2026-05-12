/**
 * metrics.js
 *
 * Paragraph metrics, scoring, and splitting functions extracted from paginateChapters.js.
 */

import {
  splitParagraphByLines,
} from '../paginationEngine';

import {
  htmlToText,
  getFirstBlock as getFirstElement,
  getBoldTextRatio,
} from '../layoutIr.js';

import {
  measureHtmlHeight,
  getLineBreakPositions,
  getLineBreakPositionsKP,
  buildFontString,
  countHyphenationMetrics,
} from '../textLayoutEngine';

import {
  getCanvasCtx2d,
  resolveMinLastLineWords,
  computeRuntLinePenalty,
  RUNT_HARD_PENALTY_THRESHOLD,
} from './constants.js';

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect subtitle-like bold paragraphs.
 * Treat as "bold paragraph" only when most of the text is actually bold.
 *
 * Accepts both DOM elements and descriptor objects { tag, style, outerHtml, textContent }
 * @private
 */
export const isMostlyBoldParagraph = (el) => {
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
export const getLastLineMetrics = (plainText, canvasCtx) => {
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

  const minLastLineWords = resolveMinLastLineWords(canvasCtx?.minLastLineWords, 0);
  let shortLineScore = 0;
  if (lastLineWords === 1)      shortLineScore += 1400;
  else if (lastLineWords === 2) shortLineScore += 900;
  else if (lastLineWords === 3) shortLineScore += 400;
  else if (lastLineWords === 4) shortLineScore += 100;
  if (minLastLineWords > 0 && lastLineWords > 0 && lastLineWords < minLastLineWords) {
    shortLineScore += (minLastLineWords - lastLineWords) * 180;
  }
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
 * Binary gate for layout mutations (smooth pass, fill-pass guards).
 * Returns true when computeRuntLinePenalty reaches RUNT_HARD_PENALTY_THRESHOLD.
 *
 * @private
 */
export const isSevereShortLastLine = (metrics, minLastLineWords = 0) => {
  if (!metrics || metrics.lastLineWords <= 0) return false;
  return computeRuntLinePenalty(metrics.lastLineWords, metrics.widthRatio ?? 1, minLastLineWords) >= RUNT_HARD_PENALTY_THRESHOLD;
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
export const computeParaLineMetrics = (plainText, canvasCtx, isContinuation = false, isLastOnPage = false) => {
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
export const getChunkLastLineWords = (chunkHtml, canvasCtx) => {
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
export const scoreCandidate = (firstChunkHtml, restChunkHtml, fullParaHtml, remainingPx, contentHeight, canvasCtx, delta = 0) => {
  const plainText = htmlToText(firstChunkHtml).trim();
  const fontStr = buildFontString(canvasCtx.baseFontSizePx, canvasCtx.fontFamily);
  // Use the same effective width as measureHtmlHeight: contentWidth minus widthSlack.
  const effectiveWidth = canvasCtx.contentWidth - (canvasCtx.widthSlack || 0);
  // Use KP-optimal line breaks when available — this aligns scoring with measureHtmlHeight.
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
  let widthRatioForRunt = 1;
  if (lastLineWords > 0 && effectiveWidth > 0) {
    const ctx2d = getCanvasCtx2d();
    if (ctx2d) {
      ctx2d.font = fontStr;
      const lastLineText = words.slice(lastStart).join(' ');
      widthRatioForRunt = ctx2d.measureText(lastLineText).width / effectiveWidth;
    }
  }
  score += computeRuntLinePenalty(lastLineWords, widthRatioForRunt, canvasCtx?.minLastLineWords ?? 0);

  // 2. Underfill penalty — 1 line short ≈ 4% underfill ≈ 12 pts on typical page.
  const chunkH = measureHtmlHeight(firstChunkHtml, canvasCtx);
  const fill = remainingPx > 0 ? chunkH / remainingPx : 1;
  score += Math.max(0, 1 - fill) * 300;

  // 3. Hyphenation quality scoring.
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
      const cvRatio = stdDev / (effectiveWidth || 1);
      if (cvRatio > 0.20) {
        score += Math.round(cvRatio * 200);
      }
    }
  }

  // 5. Stability bias — strong preference for delta=0 when last line is already OK.
  if (delta === 0) score -= 200;

  return score;
};

/**
 * Restore text-indent on a moved <p> element when it lost its indent because
 * it was the `rest` chunk of a prior split (text-indent:0 baked in) but is now
 * being placed as a standalone paragraph on a new page.
 *
 * @param {string} elHtml - Outer HTML of the element to fix
 * @param {number} indentEm  - Target indent in em (from safeConfig)
 * @returns {string} Fixed HTML (or original if no fix needed)
 */
export const restoreIndentIfNeeded = (elHtml, indentEm) => {
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
 * Merge two HTML fragments into one element.
 * @private
 */
export const mergeIntoOne = (htmlA, htmlB) => {
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
 * Split an element into exactly 2 parts.
 * Still uses splitParagraphByLines from paginationEngine which needs measureDiv
 * for HTML DOM manipulation (not for height measurement).
 *
 * @private
 */
export const splitInTwo = (
  elHtml, measureDiv, canvasCtx, remainingSpace, contentHeight,
  textAlign, hasIndent, indentValue, preserveIndent, quoteOptions
) => {
  const lineHeightPx = canvasCtx.lineHeightPx
    || Math.ceil(canvasCtx.baseFontSizePx * canvasCtx.baseLineHeight);

  // Safety buffer for inline bold/italic
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

    // Try delta=-2: only for severe 1-word runts. 2-word lines are acceptable
    // with text-align-last:left and avoiding excessive blank space is preferable.
    const bestLastLineWords = getChunkLastLineWords(bestFirst, canvasCtx);
    if (bestLastLineWords <= 1) {
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

  // Try delta=-2: only for severe 1-word runts.
  const bestLastLineWords = getChunkLastLineWords(bestFirst, canvasCtx);
  if (bestLastLineWords <= 1) {
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
