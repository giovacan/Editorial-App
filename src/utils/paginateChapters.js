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
  createLayoutContext
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
  fixHeadingsAtBottom(allPages, canvasCtx);

  // E6: Distribute remaining vertical whitespace proportionally among elements
  distributeVerticalSpace(allPages, layoutCtx, canvasCtx);

  // E4: Cleanup nearly-empty pages after fill pass
  cleanupNearlyEmptyPages(allPages, layoutCtx, canvasCtx);

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
    textAlign, hasIndent, indentValue, preserveIndent, quoteOptions
  );

  if (fullPageSplit.length >= 2) {
    const pageChunk = fullPageSplit[0];
    const restChunk = fullPageSplit[1];

    const fitSplit = splitParagraphByLines(
      pageChunk, measureDiv, remainingSpace,
      textAlign, hasIndent, indentValue, preserveIndent, quoteOptions
    );

    const firstChunk = fitSplit[0];
    if (fitSplit.length < 2) {
      return [firstChunk, restChunk];
    }
    const leftover = fitSplit[1];
    const mergedRest = mergeIntoOne(leftover, restChunk);
    return [firstChunk, mergedRest];
  }

  const directSplit = splitParagraphByLines(
    elHtml, measureDiv, remainingSpace,
    textAlign, hasIndent, indentValue, preserveIndent, quoteOptions
  );

  if (directSplit.length < 2) return null;
  return [directSplit[0], directSplit[1]];
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

        // Measure orphan lines (Canvas)
        const pageWithChunkHeight = measure(currentHtml + firstChunk);
        const orphanLines = Math.floor(pageWithChunkHeight / lineHeightPx)
          - Math.floor(actualCurrentHeight / lineHeightPx);

        // Measure widow lines (Canvas)
        const widowLines = Math.floor(measure(restChunk) / lineHeightPx);

        const meetsStrict = orphanLines >= minOrphanLines && widowLines >= minWidowLines;
        // Relaxed: accept if at least 2 orphan + 2 widow lines and
        // rejecting would waste significant space (≥2 lines of remaining room).
        const meetsRelaxed = !meetsStrict
          && remainingLines >= 2
          && orphanLines >= 2
          && widowLines >= 2;
        // Extra aggressive for title pages — accept split with just 1 orphan
        // line if rejecting would leave 50%+ of the page empty
        const meetsAggressive = !meetsStrict && !meetsRelaxed
          && pageHasTitle
          && remainingLines >= 2
          && orphanLines >= 1
          && widowLines >= 2;
        // Underfill prevention: when rejecting would waste ≥4 lines (>15% page),
        // accept split with relaxed constraints. Requires ≥2 widow lines to avoid
        // typographic orphans at page top. The fill-pass handles remaining cases.
        const meetsUnderfill = !meetsStrict && !meetsRelaxed && !meetsAggressive
          && remainingLines >= 4
          && orphanLines >= 2
          && widowLines >= 2;

        if (meetsStrict || meetsRelaxed || meetsAggressive || meetsUnderfill) {
          if (process.env.NODE_ENV === 'development' && (meetsAggressive || meetsUnderfill)) {
            const mode = meetsAggressive ? 'AGGRESSIVE' : 'UNDERFILL';
            console.log(`[SPLIT-${mode}] p${pages.length + 1}: orphan=${orphanLines}, widow=${widowLines}, remaining=${remainingLines}, hasTitle=${pageHasTitle}`);
          }
          pushPage(currentHtml + firstChunk);
          currentHtml = restChunk;
          continue;
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

        // E3: Quality gate — reject only if move creates a serious violation
        // (heading at bottom or single-line orphan/widow on source page)
        if (sourceHtml) {
          const qSource = evaluatePageQualityCanvas(sourceHtml, contentHeight, lineHeightPx, canvasCtx);
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

      const chunkFitHeight = measure(currentHtml + chunk);
      if (chunkFitHeight > contentHeight) break;

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
      const qSplitSource = evaluatePageQualityCanvas(newSourceHtml, contentHeight, lineHeightPx, canvasCtx);
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

    page.html = div.innerHTML;
  }
};

/**
 * E5: Fix orphaned headings/bold-paragraphs left at the bottom of a page
 * after the fill-pass moves content forward, exposing a heading as the
 * last element. Moves the heading to the top of the next same-chapter page.
 *
 * @private
 */
const fixHeadingsAtBottom = (pages, canvasCtx) => {
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

    // Move heading to top of next page
    const headingHtml = last.outerHTML;
    last.remove();
    const remainingHtml = div.innerHTML.trim();

    pages[i] = { ...page, html: remainingHtml, isBlank: !remainingHtml };
    pages[ni] = { ...next, html: headingHtml + next.html };

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
    const mergedHeight = measure(prevPage.html + page.html);
    if (mergedHeight <= contentHeight) {
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

