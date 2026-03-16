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
  getLastLineWordCount
} from './textLayoutEngine';

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
  // widthSlack compensates for Canvas measureText() vs browser font hinting
  // at small preview scales. 2% is sufficient without hyphens:auto.
  const justifySlack = layoutCtx.textAlign === 'justify'
    ? layoutCtx.contentWidth * 0.02
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

  // Apply safety buffer ONCE — all pipeline stages use the same contentHeight.
  // Canvas measureText() can undercount vs DOM rendering by a few pixels
  // (font hinting, sub-pixel rounding, line-break differences).
  // Half a line height (~5px at preview scale) is sufficient.
  const safeContentHeight = layoutCtx.contentHeight - Math.ceil(layoutCtx.lineHeightPx * 0.5);

  // Folio reserve: title pages reserve 1 lineHeight at bottom for page number.
  // Computed once here, used by greedyPaginate + all post-passes.
  const showPageNums = safeConfig.showPageNumbers !== false;
  const pageNumAtBottom = (safeConfig.pageNumberPos || 'bottom') === 'bottom';
  const folioReserve = (showPageNums && pageNumAtBottom) ? layoutCtx.lineHeightPx : 0;

  const safeLayoutCtx = { ...layoutCtx, contentHeight: safeContentHeight, folioReserve };

  // Log source text length for integrity comparison
  if (process.env.NODE_ENV === 'development') {
    const div = document.createElement('div');
    let srcTotal = 0;
    for (const ch of chapters) {
      div.innerHTML = ch.html || '';
      srcTotal += (div.textContent || '').length;
    }
    console.log(`[INTEGRITY] source chapters: ${srcTotal} chars, ${chapters.length} chapters`);
  }

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

    const elements = flattenChapterElements(chapter, safeLayoutCtx, canvasCtx, measureDiv, safeConfig);
    const chapterPages = greedyPaginate(elements, safeLayoutCtx, canvasCtx, measureDiv, safeConfig, chapter);

    if (process.env.NODE_ENV === 'development') {
      const startPage = allPages.length + 1;
      const blankCount = chapterPages.filter(p => p.isBlank).length;
      console.log(`[CHAPTER-MAP] Ch${i + 1} "${(chapter.title || '').substring(0, 40)}" → pages ${startPage}-${startPage + chapterPages.length - 1} (${chapterPages.length} pages, ${blankCount} blank, ${elements.length} elements)`);
    }

    allPages.push(...chapterPages);
  }

  // Re-number all pages sequentially
  allPages.forEach((p, i) => { p.pageNumber = i + 1; });

  // Content integrity helper — counts total text characters across all pages
  const countTotalText = (pages, label) => {
    if (process.env.NODE_ENV !== 'development') return;
    const div = document.createElement('div');
    let total = 0;
    for (const p of pages) {
      if (!p || p.isBlank || !p.html) continue;
      div.innerHTML = p.html;
      total += (div.textContent || '').length;
    }
    console.log(`[INTEGRITY] ${label}: ${total} chars, ${pages.filter(p => p && !p.isBlank && p.html).length} pages`);
  };

  countTotalText(allPages, 'after greedyPaginate');

  // Fill-pass with multi-pass convergence
  applyFillPass(allPages, safeLayoutCtx, canvasCtx, measureDiv, safeConfig);
  countTotalText(allPages, 'after applyFillPass');

  // Fix widows created by greedy/fill passes using lookback word-spacing + resplit
  fixWidowsWithLookback(allPages, safeLayoutCtx, canvasCtx, measureDiv, safeConfig);
  countTotalText(allPages, 'after fixWidows');

  // Fix split chunks whose last line has too few words for justify
  fixShortLastLines(allPages, safeLayoutCtx, canvasCtx, measureDiv, safeConfig);
  countTotalText(allPages, 'after fixShortLastLines');

  // E5: Fix orphaned headings left at bottom of pages after fill-pass
  fixHeadingsAtBottom(allPages, canvasCtx, safeLayoutCtx);
  countTotalText(allPages, 'after fixHeadings');

  // E6: Distribute remaining vertical whitespace proportionally among elements
  distributeVerticalSpace(allPages, safeLayoutCtx, canvasCtx);

  // E4: Cleanup nearly-empty pages after fill pass
  cleanupNearlyEmptyPages(allPages, safeLayoutCtx, canvasCtx);
  countTotalText(allPages, 'after cleanup (FINAL)');

  // Re-number again after fill-pass may have emptied some pages
  let pageNum = 1;
  for (const p of allPages) {
    if (!p.isBlank) p.pageNumber = pageNum++;
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
  const fullPageSplit = splitParagraphByLines(
    elHtml, measureDiv, contentHeight,
    textAlign, hasIndent, indentValue, preserveIndent, quoteOptions, canvasCtx
  );

  if (fullPageSplit.length >= 2) {
    const pageChunk = fullPageSplit[0];
    // Merge ALL remaining chunks — not just [1].
    // splitParagraphByLines can return 3+ chunks for very long paragraphs.
    let restChunk = fullPageSplit[1];
    for (let k = 2; k < fullPageSplit.length; k++) {
      restChunk = mergeIntoOne(restChunk, fullPageSplit[k]);
    }

    const fitSplit = splitParagraphByLines(
      pageChunk, measureDiv, remainingSpace,
      textAlign, hasIndent, indentValue, preserveIndent, quoteOptions, canvasCtx
    );

    const firstChunk = fitSplit[0];
    if (fitSplit.length < 2) {
      return [firstChunk, restChunk];
    }
    // Merge leftover from fitSplit with the rest
    let leftover = fitSplit[1];
    for (let k = 2; k < fitSplit.length; k++) {
      leftover = mergeIntoOne(leftover, fitSplit[k]);
    }
    const mergedRest = mergeIntoOne(leftover, restChunk);
    return [firstChunk, mergedRest];
  }

  const directSplit = splitParagraphByLines(
    elHtml, measureDiv, remainingSpace,
    textAlign, hasIndent, indentValue, preserveIndent, quoteOptions, canvasCtx
  );

  if (directSplit.length < 2) return null;
  // Merge all chunks after [0] into a single "rest"
  let rest = directSplit[1];
  for (let k = 2; k < directSplit.length; k++) {
    rest = mergeIntoOne(rest, directSplit[k]);
  }
  return [directSplit[0], rest];
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
 * Inject or update word-spacing on an element's inline style.
 * Uses setAttribute (not el.style) to preserve the `em` unit in serialized HTML,
 * which extractStyles() in textLayoutEngine reads back correctly.
 *
 * @private
 * @param {string} elementHtml - Outer HTML of a single element
 * @param {number} wordSpacingEm - Value in em (e.g. -0.02)
 * @returns {string} Updated outer HTML
 */
const injectWordSpacing = (elementHtml, wordSpacingEm) => {
  const div = document.createElement('div');
  div.innerHTML = elementHtml;
  const el = div.firstElementChild;
  if (!el) return elementHtml;
  const style = (el.getAttribute('style') || '').replace(/word-spacing:[^;]+;?/gi, '').trim();
  const sep = style && !style.endsWith(';') ? ';' : '';
  el.setAttribute('style', `${style}${sep}word-spacing:${wordSpacingEm}em;`);
  return el.outerHTML;
};

/**
 * TeX-inspired lookback micro-adjustment.
 *
 * When a page break would produce a bad result (element almost fits, or split
 * creates a widow < 2 lines), this function tries tightening word-spacing on
 * paragraphs already placed on the current page to reclaim 1-2 lines of space.
 *
 * Only adjusts <p> elements (never headings, lists, blockquotes).
 * Steps are imperceptible: -0.01em to -0.03em (~3-7% tighter than normal).
 *
 * @private
 * @param {string} currentHtml - HTML of all elements on current page so far
 * @param {object} canvasCtx - Canvas layout context
 * @param {number} lineHeightPx
 * @param {number} linesNeeded - How many lines we need to reclaim (1 or 2)
 * @param {number} pageNum - For logging
 * @returns {{ success: boolean, adjustedHtml?: string, linesGained?: number }}
 */
const tryLookbackAdjust = (currentHtml, canvasCtx, lineHeightPx, linesNeeded, pageNum) => {
  if (!currentHtml) return { success: false };

  const measure = (html) => measureHtmlHeight(html, canvasCtx);
  const originalHeight = measure(currentHtml);
  const div = document.createElement('div');
  div.innerHTML = currentHtml;
  const children = Array.from(div.children);

  // Build candidate list: only <p>, no headings/lists/blockquotes, no existing word-spacing
  const candidates = [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.tagName !== 'P') continue;
    if (/word-spacing:/i.test(child.getAttribute('style') || '')) continue;
    const lines = Math.floor(measure(child.outerHTML) / lineHeightPx);
    if (lines < 2) continue; // Need at least 2 lines
    candidates.push({ index: i, html: child.outerHTML, lines });
  }

  if (candidates.length === 0) return { success: false };

  // Sort by line count descending (longer paragraphs more likely to gain a line)
  candidates.sort((a, b) => b.lines - a.lines);
  const topCandidates = candidates.slice(0, 5);

  // Tightening steps: -0.01em to -0.05em (~3-10% tighter). At body text
  // sizes this range is imperceptible — TeX allows up to -33%.
  const steps = [-0.01, -0.02, -0.03, -0.04, -0.05];

  // Strategy 1: Single paragraph adjustment (minimal visual impact)
  for (const step of steps) {
    for (const cand of topCandidates) {
      const adjusted = injectWordSpacing(cand.html, step);
      const newLines = Math.floor(measure(adjusted) / lineHeightPx);
      const gained = cand.lines - newLines;

      if (gained >= linesNeeded) {
        children[cand.index].outerHTML = adjusted;
        const adjustedHtml = div.innerHTML;

        if (process.env.NODE_ENV === 'development') {
          console.log(`[LOOKBACK] p${pageNum}: adjusted P#${cand.index} (${cand.lines}→${newLines} lines, ws:${step}em, gained:${gained})`);
        }

        return { success: true, adjustedHtml, linesGained: gained };
      }
    }
  }

  // Strategy 2: Cumulative adjustment — apply same step to ALL candidates.
  // Individual paragraphs may each gain < 1 line (rounded to 0), but together
  // the accumulated pixel savings can reclaim 1+ full lines.
  // This is critical for early pages (title pages) with few short paragraphs.
  const candidateIndexSet = new Set(topCandidates.map(c => c.index));

  if (process.env.NODE_ENV === 'development') {
    console.log(`[LOOKBACK-FAIL-S1] p${pageNum}: single-paragraph strategy failed (${candidates.length} candidates, top lines: ${topCandidates.map(c => c.lines).join(',')})`);
  }

  for (const step of steps) {
    const parts = [];
    for (let i = 0; i < children.length; i++) {
      if (candidateIndexSet.has(i)) {
        const cand = topCandidates.find(c => c.index === i);
        parts.push(injectWordSpacing(cand.html, step));
      } else {
        parts.push(children[i].outerHTML);
      }
    }

    const attemptHtml = parts.join('');
    const newHeight = measure(attemptHtml);
    const gainedPx = originalHeight - newHeight;
    const gainedLines = Math.floor(gainedPx / lineHeightPx);

    if (gainedLines >= linesNeeded) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[LOOKBACK-CUM] p${pageNum}: adjusted ${topCandidates.length} paragraphs (${originalHeight.toFixed(1)}→${newHeight.toFixed(1)}px, gained:${gainedLines} lines, ws:${step}em)`);
      }
      return { success: true, adjustedHtml: attemptHtml, linesGained: gainedLines };
    }
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`[LOOKBACK-FAIL] p${pageNum}: all strategies failed, needed ${linesNeeded} lines`);
  }

  return { success: false };
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
    minOrphanLines, minWidowLines, splitLongParagraphs, folioReserve
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

  // Effective content limit: reduced on title pages to prevent content touching folio
  const getPageLimit = () => pageHasTitle ? contentHeight - folioReserve : contentHeight;

  const pushPage = (html, opts = {}) => {
    pages.push({
      html,
      pageNumber: pages.length + 1,
      chapterTitle: chapter.title,
      isBlank: false,
      isTitleOnlyPage: opts.isTitleOnlyPage || false,
      isFirstChapterPage: opts.isFirstChapterPage || pageHasTitle,
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
        const spaceAfterSub = getPageLimit() - pageWithSub;

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

    // Check if element fits (title pages use reduced limit for folio reserve)
    const pageLimit = getPageLimit();
    const candidateHeight = measure(currentHtml + el.html);

    if (process.env.NODE_ENV === 'development' && pageHasTitle && candidateHeight > pageLimit && candidateHeight <= contentHeight) {
      console.log(`[FOLIO-RESERVE] p${pages.length + 1}: title page limit saved ${(contentHeight - pageLimit).toFixed(1)}px (element would fit without reserve)`);
    }

    if (candidateHeight <= pageLimit) {
      currentHtml += el.html;
      continue;
    }

    // Doesn't fit — measure current page height
    const actualCurrentHeight = measure(currentHtml);
    const remainingSpace = pageLimit - actualCurrentHeight;
    const remainingLines = Math.floor(remainingSpace / lineHeightPx);

    // LOOKBACK Point A — element almost fits (overflow ≤ 3 lines).
    // Try tightening word-spacing on previous paragraphs to reclaim space
    // so the current element can be absorbed without splitting.
    // Threshold of 3 allows cumulative strategy to work on pages with several
    // short paragraphs (e.g. title pages, early chapters).
    const elHeight = measure(el.html);
    const overflowLines = Math.ceil((elHeight - remainingSpace) / lineHeightPx);
    if (overflowLines > 0 && overflowLines <= 3) {
      const lb = tryLookbackAdjust(currentHtml, canvasCtx, lineHeightPx, overflowLines, pages.length + 1);
      if (lb.success) {
        const totalWithEl = measure(lb.adjustedHtml + el.html);
        if (totalWithEl <= pageLimit) {
          currentHtml = lb.adjustedHtml + el.html;
          continue;
        }
      }
    }

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

        // Measure orphan lines (Canvas)
        const pageWithChunkHeight = measure(currentHtml + firstChunk);
        const orphanLines = Math.floor(pageWithChunkHeight / lineHeightPx)
          - Math.floor(actualCurrentHeight / lineHeightPx);

        // Measure widow lines (Canvas) + word count sanity check
        // Canvas widthSlack can over-count lines for very short text,
        // so also require a minimum word count to avoid 3-word widows.
        const widowLines = Math.floor(measure(restChunk) / lineHeightPx);
        const widowText = (restChunk.replace(/<[^>]+>/g, '') || '').trim();
        const widowWords = widowText.split(/\s+/).filter(w => w).length;
        const MIN_WIDOW_WORDS = 6;
        const widowOk = widowLines >= minWidowLines && widowWords >= MIN_WIDOW_WORDS;

        const meetsStrict = orphanLines >= minOrphanLines && widowOk;
        const meetsRelaxed = !meetsStrict
          && remainingLines >= 2
          && orphanLines >= 2
          && widowOk;
        const meetsAggressive = !meetsStrict && !meetsRelaxed
          && pageHasTitle
          && remainingLines >= 2
          && orphanLines >= 2
          && widowOk;
        const meetsUnderfill = !meetsStrict && !meetsRelaxed && !meetsAggressive
          && remainingLines >= 4
          && orphanLines >= 2
          && widowOk;

        if (meetsStrict || meetsRelaxed || meetsAggressive || meetsUnderfill) {
          if (process.env.NODE_ENV === 'development' && (meetsAggressive || meetsUnderfill)) {
            const mode = meetsAggressive ? 'AGGRESSIVE' : 'UNDERFILL';
            console.log(`[SPLIT-${mode}] p${pages.length + 1}: orphan=${orphanLines}, widow=${widowLines}, widowWords=${widowWords}, remaining=${remainingLines}, hasTitle=${pageHasTitle}`);
          }
          pushPage(currentHtml + firstChunk);
          currentHtml = restChunk;
          continue;
        }

        // Split rejected (bad widow) — retry with LESS space so widow gets more lines.
        // E.g. 12-line paragraph with 11 lines free → 11/1 rejected → try 10/2, 9/3...
        if (!widowOk && orphanLines >= minOrphanLines) {
          let reducedAccepted = false;
          for (let reduce = 1; reduce <= 3; reduce++) {
            const reducedSpace = remainingSpace - (reduce * lineHeightPx);
            if (reducedSpace < minOrphanLines * lineHeightPx) break;

            const retry = splitInTwo(
              el.html, measureDiv, canvasCtx, reducedSpace, contentHeight,
              textAlign, hasIndent, indentValue, preserveIndent, quoteOptions
            );
            if (!retry) continue;

            const [rFirst, rRest] = retry;
            const rPageH = measure(currentHtml + rFirst);
            if (rPageH > pageLimit) continue;

            const rOrphan = Math.floor(rPageH / lineHeightPx)
              - Math.floor(actualCurrentHeight / lineHeightPx);
            const rWidow = Math.floor(measure(rRest) / lineHeightPx);
            const rWidowText = (rRest.replace(/<[^>]+>/g, '') || '').trim();
            const rWidowWords = rWidowText.split(/\s+/).filter(w => w).length;
            const rWidowOk = rWidow >= minWidowLines && rWidowWords >= MIN_WIDOW_WORDS;

            if (rOrphan >= minOrphanLines && rWidowOk) {
              if (process.env.NODE_ENV === 'development') {
                console.log(`[SPLIT-REDUCED] p${pages.length + 1}: reduced by ${reduce} lines → orphan=${rOrphan}, widow=${rWidow}`);
              }
              pushPage(currentHtml + rFirst);
              currentHtml = rRest;
              reducedAccepted = true;
              break;
            }
          }
          if (reducedAccepted) continue;
        }
      }

      // LOOKBACK Point B — split was rejected because of bad widow (< 2 lines).
      // Try tightening previous paragraphs to gain 1 line of space, then re-split.
      if (splitResult) {
        const [, rejectedRest] = splitResult;
        const rejectedWidow = Math.floor(measure(rejectedRest) / lineHeightPx);
        if (rejectedWidow >= 1 && rejectedWidow < minWidowLines) {
          const lb = tryLookbackAdjust(currentHtml, canvasCtx, lineHeightPx, 1, pages.length + 1);
          if (lb.success) {
            const newRemaining = pageLimit - measure(lb.adjustedHtml);
            const newSplit = splitInTwo(
              el.html, measureDiv, canvasCtx, newRemaining, contentHeight,
              textAlign, hasIndent, indentValue, preserveIndent, quoteOptions
            );
            if (newSplit) {
              const [nFirst, nRest] = newSplit;
              const nPageH = measure(lb.adjustedHtml + nFirst);
              const nOrphan = Math.floor(nPageH / lineHeightPx)
                - Math.floor(measure(lb.adjustedHtml) / lineHeightPx);
              const nWidow = Math.floor(measure(nRest) / lineHeightPx);
              const nWidowWords = ((nRest.replace(/<[^>]+>/g, '') || '').trim().split(/\s+/).filter(w => w)).length;
              if (nOrphan >= minOrphanLines && nWidow >= minWidowLines && nWidowWords >= 6 && nPageH <= pageLimit) {
                if (process.env.NODE_ENV === 'development') {
                  console.log(`[LOOKBACK-SPLIT] p${pages.length + 1}: improved split orphan=${nOrphan}, widow=${nWidow} (was widow=${rejectedWidow})`);
                }
                pushPage(lb.adjustedHtml + nFirst);
                currentHtml = nRest;
                continue;
              }
            }
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
    baseFontSize, baseLineHeight, textAlign, splitLongParagraphs, folioReserve } = layoutCtx;

  const quoteOptions = {
    config: safeConfig.quote || {
      enabled: true, indentLeft: 2, indentRight: 2, showLine: true,
      italic: true, sizeMultiplier: 0.95, marginTop: 1, marginBottom: 1
    },
    baseFontSize, baseLineHeight, textAlign, lineHeightPx
  };

  // Helper: measure height using Canvas engine
  const measure = (html) => measureHtmlHeight(html, canvasCtx);

  // Folio-aware content limit: title pages reserve space for page number
  const pageLimit = (page) => page.isFirstChapterPage ? contentHeight - folioReserve : contentHeight;

  // E5: Two forward fill-passes to handle cascading fills
  // (page N fills from N+1, then N+1 can fill from N+2 on second pass)
  for (let pass = 0; pass < 2; pass++) {
  for (let i = 0; i < pages.length - 1; i++) {
    if (i < 0 || i >= pages.length - 1) continue;
    if (pages[i].isBlank || pages[i].isTitleOnlyPage || !pages[i].html) continue;

    const effectiveHeight = pageLimit(pages[i]);

    for (let attempt = 0; attempt < 30; attempt++) {
      const currentHtml = pages[i].html;
      const remainingSpace = effectiveHeight - measure(currentHtml);
      const remainingLines = Math.floor(remainingSpace / lineHeightPx);

      if (remainingLines < minOrphanLines) {
        if (process.env.NODE_ENV === 'development' && remainingLines > 0) {
          console.log(`[FILL-SKIP] p${i + 1}: only ${remainingLines} lines free (need ${minOrphanLines})`);
        }
        break;
      }

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
        const spaceAfterHeader = effectiveHeight - candidateWithHeader;
        const nextSibling = firstEl.nextElementSibling;
        const headerLevel = tag.toLowerCase();
        const headerSubConfig = safeConfig.subheaders?.[headerLevel];
        const effectiveMinFollowLines = Math.max(minOrphanLines, headerSubConfig?.minLinesAfter || minOrphanLines);
        const minFollowHeight = effectiveMinFollowLines * lineHeightPx;
        const headerBlocked = candidateWithHeader > effectiveHeight
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
      if (candidateFitHeight <= effectiveHeight) {

        firstEl.remove();
        const sourceHtml = tmp.innerHTML.trim();

        // Don't leave source with fewer lines than minWidowLines
        if (sourceHtml) {
          const srcLines = Math.floor(measure(sourceHtml) / lineHeightPx);
          if (srcLines < minWidowLines) break;
        }

        // E3: Quality gate — reject only if move creates a serious violation
        // (heading at bottom or single-line orphan/widow on source page)
        if (sourceHtml) {
          const qSource = evaluatePageQualityCanvas(sourceHtml, effectiveHeight, lineHeightPx, canvasCtx);
          if (qSource.violations.includes('heading_at_bottom')
            || qSource.violations.includes('orphan')
            || qSource.violations.includes('widow')) {
            if (process.env.NODE_ENV === 'development') {
              console.log(`[FILL-SKIP] p${i + 1}: quality gate blocked move (violations: ${qSource.violations.join(', ')}, ${remainingLines} lines free)`);
            }
            break;
          }
        }

        // Accept move — try to re-merge split chunks if the moved element
        // is a continuation (text-indent:0) of the last element on current page
        let mergedHtml = currentHtml + firstElHtml;

        const isContinuation = /^<p[^>]*text-indent:\s*0/.test(firstElHtml)
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

      // Detect if element is a continuation (text-indent:0) or fresh paragraph
      const isContChunk = /text-indent:\s*0[^.]/.test(firstElHtml);
      const splitResult = splitInTwo(
        firstElHtml, measureDiv, canvasCtx, remainingSpace, contentHeight,
        textAlign, true,
        safeConfig.paragraph?.firstLineIndent || 1.5,
        isContChunk, quoteOptions
      );

      if (!splitResult) break;

      const [chunk, rest] = splitResult;

      // Check rest chunk has enough words to avoid short widows
      const restText = (rest.replace(/<[^>]+>/g, '') || '').trim();
      const restWords = restText.split(/\s+/).filter(w => w).length;
      if (restWords < 6) break; // MIN_WIDOW_WORDS

      const chunkFitHeight = measure(currentHtml + chunk);
      if (chunkFitHeight > effectiveHeight) break;

      const chunkLines = Math.floor(measure(chunk) / lineHeightPx);

      // Only check orphan (chunk going to current page). Don't check widow on
      // the rest chunk alone — it gets prepended to the source page which has
      // more content. The total source page check below is sufficient.
      if (chunkLines < minOrphanLines) break;

      firstEl.remove();
      const remainingEls = tmp.innerHTML.trim();
      const newSourceHtml = remainingEls ? rest + remainingEls : rest;

      // Check total source page lines (rest + remaining elements)
      const newSourceLines = Math.floor(measure(newSourceHtml) / lineHeightPx);
      if (newSourceLines < minWidowLines) break;

      // E3b: Quality gate on split result — don't create heading_at_bottom on source
      const qSplitSource = evaluatePageQualityCanvas(newSourceHtml, effectiveHeight, lineHeightPx, canvasCtx);
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
    const perGap = Math.min(gap / numGaps, MAX_PER_GAP);
    if (perGap < 1) continue;

    // Apply extra margin-bottom to all elements except the last
    for (let i = 0; i < children.length - 1; i++) {
      const el = children[i];
      const existing = parseFloat(el.style.marginBottom) || 0;
      el.style.marginBottom = `${(existing + perGap).toFixed(1)}px`;
    }

    // Safety: verify the adjusted page doesn't exceed contentHeight
    const adjustedHtml = div.innerHTML;
    const adjustedHeight = measure(adjustedHtml);
    if (adjustedHeight > contentHeight) {
      // Revert — don't risk overflow
      continue;
    }
    page.html = adjustedHtml;
  }
};

/**
 * Post-pass: fix widows left after greedy + fill passes.
 *
 * Scans for pages that start with a continuation chunk (text-indent:0)
 * shorter than minWidowLines.
 *
 * Strategy 1 — Lookback: tighten word-spacing on previous page paragraphs
 *   to reclaim space, then absorb the widow back (merge with original paragraph).
 *
 * Strategy 2 — Unsplit: merge the split chunks back and move the whole
 *   paragraph to the current page. Accepts slight underfill on prev page.
 *
 * Strategy 3 — Resplit: merge chunks back, then re-split with 1 fewer orphan
 *   line on the previous page, giving the widow 1 more line (1 → 2). This is
 *   the most reliable strategy — it directly shifts the split point without
 *   depending on word-spacing granularity at small preview scales.
 *
 * @private
 */
const fixWidowsWithLookback = (pages, layoutCtx, canvasCtx, measureDiv, safeConfig) => {
  const { contentHeight, lineHeightPx, minWidowLines, minOrphanLines,
    textAlign, baseFontSize, baseLineHeight, folioReserve } = layoutCtx;
  const measure = (html) => measureHtmlHeight(html, canvasCtx);

  // Folio-aware content limit: title pages reserve space for page number
  const pageLimitFor = (page) => page.isFirstChapterPage ? contentHeight - folioReserve : contentHeight;

  const quoteOptions = {
    config: safeConfig.quote || {
      enabled: true, indentLeft: 2, indentRight: 2, showLine: true,
      italic: true, sizeMultiplier: 0.95, marginTop: 1, marginBottom: 1
    },
    baseFontSize, baseLineHeight, textAlign, lineHeightPx
  };

  for (let i = 1; i < pages.length; i++) {
    const page = pages[i];
    if (!page || page.isBlank || !page.html) continue;

    const tmp = document.createElement('div');
    tmp.innerHTML = page.html;
    const firstEl = tmp.firstElementChild;
    if (!firstEl || firstEl.tagName !== 'P') continue;

    // Detect continuation chunk (text-indent:0 = split remainder)
    const firstStyle = firstEl.getAttribute('style') || '';
    const isContinuation = /text-indent:\s*0/.test(firstStyle);
    if (!isContinuation) continue;

    const widowLines = Math.floor(measure(firstEl.outerHTML) / lineHeightPx);
    if (widowLines >= minWidowLines || widowLines < 1) continue;

    if (process.env.NODE_ENV === 'development') {
      console.log(`[WIDOW-DETECT] p${i + 1}: found ${widowLines}-line widow at top`);
    }

    // Found a widow — try strategies on previous page
    const prevPage = pages[i - 1];
    if (!prevPage || prevPage.isBlank || !prevPage.html) continue;
    if (prevPage.chapterTitle !== page.chapterTitle) continue;

    const prevLimit = pageLimitFor(prevPage);
    const currLimit = pageLimitFor(page);

    // --- Strategy 1: Lookback (tighten word-spacing on prev page) ---
    const lb = tryLookbackAdjust(prevPage.html, canvasCtx, lineHeightPx, 1, i);
    if (lb.success) {
      const combinedHeight = measure(lb.adjustedHtml + firstEl.outerHTML);
      if (combinedHeight <= prevLimit) {
        const prevDiv = document.createElement('div');
        prevDiv.innerHTML = lb.adjustedHtml;
        const lastPrev = prevDiv.lastElementChild;

        if (lastPrev && lastPrev.tagName === 'P') {
          const merged = mergeIntoOne(lastPrev.outerHTML, firstEl.outerHTML);
          lastPrev.outerHTML = merged;

          const mergedHeight = measure(prevDiv.innerHTML);
          if (mergedHeight <= prevLimit) {
            firstEl.remove();
            const remainingHtml = tmp.innerHTML.trim();

            pages[i - 1] = { ...prevPage, html: prevDiv.innerHTML };
            pages[i] = remainingHtml
              ? { ...page, html: remainingHtml }
              : { ...page, html: '', isBlank: true };

            if (process.env.NODE_ENV === 'development') {
              console.log(`[LOOKBACK-WIDOW] p${i + 1}: absorbed ${widowLines}-line widow into p${i}`);
            }
            continue;
          }
        }
      }
    }

    // --- Helper: find split first-chunk on previous page ---
    const prevDiv2 = document.createElement('div');
    prevDiv2.innerHTML = prevPage.html;
    const lastPrev2 = prevDiv2.lastElementChild;
    const isSplitChunk = lastPrev2 && lastPrev2.tagName === 'P'
      && /text-align-last:\s*justify/i.test(lastPrev2.getAttribute('style') || '');

    if (!isSplitChunk) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[WIDOW-UNFIXED] p${i + 1}: prev page last element is not a split chunk`);
      }
      continue;
    }

    // --- Strategy 2: Unsplit (move full paragraph to current page) ---
    {
      const merged = mergeIntoOne(lastPrev2.outerHTML, firstEl.outerHTML);
      const prevWithout = (() => {
        const d = document.createElement('div');
        d.innerHTML = prevPage.html;
        d.lastElementChild.remove();
        return d.innerHTML.trim();
      })();

      const remainingCurrentHtml = (() => {
        const d = document.createElement('div');
        d.innerHTML = page.html;
        d.firstElementChild.remove();
        return d.innerHTML.trim();
      })();

      const newCurrentHtml = remainingCurrentHtml
        ? merged + remainingCurrentHtml
        : merged;

      if (measure(newCurrentHtml) <= currLimit) {
        pages[i - 1] = { ...prevPage, html: prevWithout || '', isBlank: !prevWithout };
        pages[i] = { ...page, html: newCurrentHtml };

        if (process.env.NODE_ENV === 'development') {
          console.log(`[WIDOW-UNSPLIT] p${i + 1}: unsplit ${widowLines}-line widow, moved paragraph from p${i}`);
        }
        continue;
      }
    }

    // --- Strategy 3: Resplit with shifted split point ---
    // Merge the split chunks back into the full paragraph, then re-split
    // with 1 fewer line on the previous page. This gives the widow 1 more
    // line (1 → 2), which passes the minimum widow constraint.
    {
      const merged = mergeIntoOne(lastPrev2.outerHTML, firstEl.outerHTML);

      // Calculate space available on prev page without the split chunk
      const prevWithout = (() => {
        const d = document.createElement('div');
        d.innerHTML = prevPage.html;
        d.lastElementChild.remove();
        return d.innerHTML.trim();
      })();
      const prevWithoutHeight = prevWithout ? measure(prevWithout) : 0;

      // Reduce available space by 1 line → orphan loses 1 line, widow gains 1 line
      const reducedSpace = prevLimit - prevWithoutHeight - lineHeightPx;

      if (reducedSpace >= minOrphanLines * lineHeightPx) {
        const isContChunk = /text-indent:\s*0[^.]/.test(lastPrev2.outerHTML);
        const indentValue = safeConfig.paragraph?.firstLineIndent || 1.5;

        const newSplit = splitInTwo(
          merged, measureDiv, canvasCtx, reducedSpace, contentHeight,
          textAlign, true, indentValue, isContChunk, quoteOptions
        );

        if (newSplit) {
          const [newFirst, newRest] = newSplit;
          const newOrphanH = measure(newFirst);
          const newOrphan = Math.floor(newOrphanH / lineHeightPx);
          const newWidow = Math.floor(measure(newRest) / lineHeightPx);
          const newWidowText = (newRest.replace(/<[^>]+>/g, '') || '').trim();
          const newWidowWords = newWidowText.split(/\s+/).filter(w => w).length;

          // Verify: orphan >= min, widow >= min + enough words, fits on prev page
          if (newOrphan >= minOrphanLines && newWidow >= minWidowLines && newWidowWords >= 6
            && (prevWithoutHeight + newOrphanH) <= prevLimit) {

            // Build new prev page: everything before split chunk + new first chunk
            const newPrevHtml = prevWithout ? prevWithout + newFirst : newFirst;

            // Build new current page: new rest chunk + remaining elements
            const remainingCurrentHtml = (() => {
              const d = document.createElement('div');
              d.innerHTML = page.html;
              d.firstElementChild.remove();
              return d.innerHTML.trim();
            })();
            const newCurrentHtml = remainingCurrentHtml
              ? newRest + remainingCurrentHtml
              : newRest;

            // Safety: verify current page doesn't overflow
            if (measure(newCurrentHtml) > currLimit) {
              if (process.env.NODE_ENV === 'development') {
                console.log(`[WIDOW-RESPLIT-SKIP] p${i + 1}: resplit would overflow current page`);
              }
              break;
            }

            pages[i - 1] = { ...prevPage, html: newPrevHtml };
            pages[i] = { ...page, html: newCurrentHtml };

            if (process.env.NODE_ENV === 'development') {
              console.log(`[WIDOW-RESPLIT] p${i + 1}: resplit orphan=${newOrphan} widow=${newWidow} (was widow=${widowLines})`);
            }
            continue;
          }
        }
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`[WIDOW-UNFIXED] p${i + 1}: could not fix ${widowLines}-line widow`);
    }
  }
};

/**
 * Post-pass: fix split paragraphs whose last line has too few words.
 *
 * When text-align-last:justify is applied to a split first-chunk and the
 * last line has <= SHORT_LINE_THRESHOLD words, the justified spacing looks
 * ugly (3 words stretched across the full width).
 *
 * Strategy: add inter-paragraph spacing between preceding elements on the
 * same page to consume ~1 lineHeight of space, then re-split the paragraph
 * with the reduced remaining space. The short last line gets pushed to the
 * next page as part of the continuation chunk.
 *
 * @private
 */
const fixShortLastLines = (pages, layoutCtx, canvasCtx, measureDiv, safeConfig) => {
  const SHORT_LINE_THRESHOLD = 6; // Canvas/browser disagree by ±2 words; 6 catches browser≤4

  const { contentHeight, lineHeightPx, minOrphanLines, minWidowLines,
    textAlign, baseFontSize, baseLineHeight, folioReserve } = layoutCtx;
  const measure = (html) => measureHtmlHeight(html, canvasCtx);
  const MIN_WIDOW_WORDS = 6;

  const pageLimitFor = (page) => page.isFirstChapterPage ? contentHeight - folioReserve : contentHeight;

  const quoteOptions = {
    config: safeConfig.quote || {
      enabled: true, indentLeft: 2, indentRight: 2, showLine: true,
      italic: true, sizeMultiplier: 0.95, marginTop: 1, marginBottom: 1
    },
    baseFontSize, baseLineHeight, textAlign, lineHeightPx
  };

  for (let i = 0; i < pages.length - 1; i++) {
    const page = pages[i];
    if (!page || page.isBlank || page.isTitleOnlyPage || page.isFirstChapterPage || !page.html) continue;

    // 1. Parse page HTML
    const div = document.createElement('div');
    div.innerHTML = page.html;
    const children = Array.from(div.children);
    if (children.length < 2) continue; // Need at least 1 preceding element + split chunk

    // 2. Check if last element is a split first-chunk (text-align-last: justify)
    const lastEl = children[children.length - 1];
    if (lastEl.tagName !== 'P') continue;
    const lastStyle = lastEl.getAttribute('style') || '';
    const isSplitChunk = /text-align-last:\s*justify/i.test(lastStyle);
    if (!isSplitChunk) continue;

    // 3. Count words on last line (Canvas estimate — unreliable but good enough for threshold)
    const wordCount = getLastLineWordCount(lastEl.outerHTML, canvasCtx);

    if (process.env.NODE_ENV === 'development') {
      console.log(`[SHORT-LINE-SCAN] p${page.pageNumber}: lastLineWords=${wordCount}, children=${children.length}`);
    }

    if (wordCount === 0 || wordCount > SHORT_LINE_THRESHOLD) continue;

    // 4. Find continuation on next page
    let nextIdx = i + 1;
    while (nextIdx < pages.length && pages[nextIdx]?.isBlank) nextIdx++;
    if (nextIdx >= pages.length) continue;

    const nextPage = pages[nextIdx];
    if (!nextPage?.html || page.chapterTitle !== nextPage.chapterTitle) continue;

    const nextDiv = document.createElement('div');
    nextDiv.innerHTML = nextPage.html;
    const firstNextEl = nextDiv.firstElementChild;
    if (!firstNextEl || firstNextEl.tagName !== 'P') continue;
    const nextStyle = firstNextEl.getAttribute('style') || '';
    if (!/text-indent:\s*0/.test(nextStyle)) continue;

    // 5. Measure old split chunk and calculate reduced space (1 line less)
    const oldSplitHeight = measure(lastEl.outerHTML);
    const oldOrphanLines = Math.floor(oldSplitHeight / lineHeightPx);
    if (oldOrphanLines <= minOrphanLines) continue; // Can't reduce further

    lastEl.remove();
    const prevHtml = div.innerHTML;
    const prevHeight = prevHtml ? measure(prevHtml) : 0;
    const pageLimit = pageLimitFor(page);
    const reducedSpace = pageLimit - prevHeight - lineHeightPx; // force 1 line less

    if (reducedSpace < minOrphanLines * lineHeightPx) continue;

    // 6. Merge split chunks and re-split with reduced space
    const merged = mergeIntoOne(lastEl.outerHTML, firstNextEl.outerHTML);
    const isContChunk = /text-indent:\s*0[^.]/.test(lastEl.outerHTML);
    const indentValue = safeConfig.paragraph?.firstLineIndent || 1.5;

    const newSplit = splitInTwo(
      merged, measureDiv, canvasCtx, reducedSpace, contentHeight,
      textAlign, true, indentValue, isContChunk, quoteOptions
    );
    if (!newSplit) continue;

    // 7. Validate — line count must decrease, orphan/widow constraints must hold
    const [newFirst, newRest] = newSplit;
    const newOrphanLines = Math.floor(measure(newFirst) / lineHeightPx);
    const newWidowLines = Math.floor(measure(newRest) / lineHeightPx);
    const newWidowText = (newRest.replace(/<[^>]+>/g, '') || '').trim();
    const newWidowWords = newWidowText.split(/\s+/).filter(w => w).length;

    if (process.env.NODE_ENV === 'development') {
      console.log(`[SHORT-LINE-EVAL] p${page.pageNumber}: oldLines=${oldOrphanLines}, newOrphan=${newOrphanLines}, newWidow=${newWidowLines}, newWidowWords=${newWidowWords}`);
    }

    if (newOrphanLines >= oldOrphanLines) continue; // Didn't actually reduce
    if (newOrphanLines < minOrphanLines) continue;
    if (newWidowLines < minWidowLines || newWidowWords < MIN_WIDOW_WORDS) continue;

    // 8. Check current page doesn't overflow
    const newPageHeight = measure(prevHtml + newFirst);
    if (newPageHeight > pageLimit) continue;

    // 9. Check next page doesn't overflow
    firstNextEl.remove();
    const remainingNextHtml = nextDiv.innerHTML.trim();
    const newNextHtml = remainingNextHtml ? newRest + remainingNextHtml : newRest;
    const nextLimit = pageLimitFor(nextPage);
    if (measure(newNextHtml) > nextLimit) continue;

    // 10. Apply — distributeVerticalSpace will fill the freed line cosmetically
    pages[i] = { ...page, html: prevHtml + newFirst };
    pages[nextIdx] = { ...nextPage, html: newNextHtml };

    if (process.env.NODE_ENV === 'development') {
      console.log(`[SHORT-LINE-FIX] p${page.pageNumber}: ${oldOrphanLines}->${newOrphanLines} lines (was ~${wordCount} words on last line)`);
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
  const measure = (html) => measureHtmlHeight(html, canvasCtx);
  const contentHeight = layoutCtx?.contentHeight ?? Infinity;
  const folioReserve = layoutCtx?.folioReserve ?? 0;

  // Folio-aware content limit: title pages reserve space for page number
  const pageLimitFor = (page) => page.isFirstChapterPage ? contentHeight - folioReserve : contentHeight;

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

    // Move heading to top of next page — but only if it fits
    const headingHtml = last.outerHTML;
    const newNextHtml = headingHtml + next.html;
    if (measure(newNextHtml) > pageLimitFor(next)) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[HEADING-FIX-SKIP] p${i + 1}→p${ni + 1}: heading would overflow next page, skipping`);
      }
      continue;
    }

    last.remove();
    const remainingHtml = div.innerHTML.trim();

    pages[i] = { ...page, html: remainingHtml, isBlank: !remainingHtml };
    pages[ni] = { ...next, html: newNextHtml };

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
  const { contentHeight, lineHeightPx, minOrphanLines, folioReserve } = layoutCtx;
  const measure = (html) => measureHtmlHeight(html, canvasCtx);
  const minContentThreshold = minOrphanLines * lineHeightPx * 0.5;

  // Folio-aware content limit: title pages reserve space for page number
  const pageLimitFor = (page) => page.isFirstChapterPage ? contentHeight - (folioReserve || 0) : contentHeight;

  for (let i = pages.length - 1; i > 0; i--) {
    const page = pages[i];
    if (!page || page.isBlank || !page.html) continue;

    const prevPage = pages[i - 1];
    if (!prevPage || prevPage.isBlank) continue;
    if (prevPage.chapterTitle !== page.chapterTitle) continue;

    const pageHeight = measure(page.html);
    if (pageHeight >= minContentThreshold || pageHeight <= 0) continue;

    // Try merging into previous page
    const mergedHeight = measure(prevPage.html + page.html);
    if (mergedHeight <= pageLimitFor(prevPage)) {
      pages[i - 1] = { ...prevPage, html: prevPage.html + page.html };
      page.html = '';
      page.isBlank = true;
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
const evaluatePageQualityCanvas = (pageHtml, contentHeight, lineHeightPx, canvasCtx) => {
  if (!pageHtml) return { score: Infinity, fillPct: 0, violations: [] };

  const measure = (html) => measureHtmlHeight(html, canvasCtx);
  const pageHeight = measure(pageHtml);
  const remainingSpace = contentHeight - pageHeight;
  const violations = [];
  let score = 0;

  // Whitespace penalty
  score += Math.max(0, remainingSpace) * 0.5;

  // Parse structure
  const div = document.createElement('div');
  div.innerHTML = pageHtml;
  const children = Array.from(div.children);

  if (children.length > 0) {
    const lastChild = children[children.length - 1];
    const lastTag = lastChild.tagName || '';

    // Heading at bottom penalty
    if (/^H[1-6]$/i.test(lastTag)) {
      score += 40;
      violations.push('heading_at_bottom');
    }

    // Widow: single paragraph as only element with 1 line
    if (lastTag === 'P' && children.length === 1) {
      const lines = Math.floor(measure(lastChild.outerHTML) / lineHeightPx);
      if (lines === 1) { score += 50; violations.push('widow'); }
    }

    // Orphan: single element with 1 line
    if (children.length === 1) {
      const lines = Math.floor(measure(children[0].outerHTML) / lineHeightPx);
      if (lines === 1) { score += 50; violations.push('orphan'); }
    }
  }

  return {
    score,
    fillPct: pageHeight > 0 ? (pageHeight / contentHeight) * 100 : 0,
    violations
  };
};

