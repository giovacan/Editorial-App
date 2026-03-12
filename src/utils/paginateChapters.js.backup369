/**
 * paginateChapters.js
 *
 * Pure pagination function extracted from usePagination.js
 * Converts raw HTML chapters into paginated content.
 *
 * Takes pre-measured chapters and layout context, produces array of pages.
 * Zero React dependencies. Fully testable pure function.
 */

import {
  buildParagraphHtml,
  buildChapterTitleHtml,
  shouldStartOnRightPage,
  splitParagraphByLines,
  getQuoteStyle
} from './paginationEngine';
import { paginationLogger } from './paginationLogger';

/**
 * Paginate chapters into pages with fill-pass rebalancing.
 *
 * @param {Chapter[]} chapters - Array of chapters with html, title, type, id
 * @param {object} layoutCtx - Layout context with dimensions
 *   - contentHeight: max page height in pixels
 *   - lineHeightPx: line height for calculations
 *   - baseFontSize: font size in pt
 *   - baseLineHeight: line-height CSS value
 *   - textAlign: text alignment
 *   - minOrphanLines: minimum lines before page break
 *   - minWidowLines: minimum lines after page break
 *   - splitLongParagraphs: whether to split long elements
 * @param {HTMLElement} measureDiv - Pre-configured measurement div
 * @param {object} safeConfig - Complete book config
 * @returns {Page[]} Array of page objects with html, pageNumber, etc.
 */
export const paginateChapters = (chapters, layoutCtx, measureDiv, safeConfig) => {
  const pages = [];

  // Process each chapter
  for (let i = 0; i < chapters.length; i++) {
    processChapter(chapters[i], i, pages, layoutCtx, measureDiv, safeConfig);
  }

  // Rebalance pages
  applyFillPassInPlace(pages, layoutCtx, measureDiv, safeConfig);

  return pages;
};

/**
 * Process a single chapter into pages.
 *
 * @private
 */
const processChapter = (chapter, chapterIndex, pages, layoutCtx, measureDiv, safeConfig) => {
  const {
    contentHeight,
    lineHeightPx,
    baseFontSize,
    baseLineHeight,
    textAlign,
    minOrphanLines,
    minWidowLines,
    splitLongParagraphs
  } = layoutCtx;

  const isSection = chapter.type === 'section';
  const shouldStartOnRight = shouldStartOnRightPage(chapter, chapterIndex, safeConfig);

  // Pad to odd page if chapter must start on right
  if (shouldStartOnRight && chapterIndex > 0) {
    if (pages.length % 2 === 1) {
      pages.push({ html: '', pageNumber: pages.length + 1, isBlank: true });
    }
  }

  // Build chapter title
  const { titleHtml, ctConfig } = buildChapterTitleHtml(
    chapter,
    safeConfig,
    baseFontSize,
    lineHeightPx,
    contentHeight
  );

  measureDiv.innerHTML = titleHtml;
  const titleHeight = measureDiv.offsetHeight;

  // Parse chapter content into child elements
  const tmp = document.createElement('div');
  tmp.innerHTML = chapter.html || '<p></p>';
  const children = Array.from(tmp.children).filter(el => el.textContent.trim() || el.tagName === 'HR');

  // Track state while processing
  let currentHtml = '';
  let currentHeight = 0;
  const headerConfig = safeConfig.header || {};
  const trackSubheaders = headerConfig.trackSubheaders;
  const trackPseudoHeaders = !!headerConfig.trackPseudoHeaders;
  let currentSubheader = '';
  let paragraphCount = 0;

  const layout = ctConfig.layout || 'continuous';

  // Determine title page placement
  if (layout === 'fullPage') {
    pages.push({
      html: titleHtml,
      pageNumber: pages.length + 1,
      chapterTitle: chapter.title,
      isBlank: false,
      isFirstChapterPage: true,
      isTitleOnlyPage: true,
      currentSubheader: ''
    });
    currentHtml = '';
    currentHeight = 0;
  } else if (titleHeight > contentHeight) {
    // Title overflows on its own
    pages.push({
      html: titleHtml,
      pageNumber: pages.length + 1,
      chapterTitle: chapter.title,
      isBlank: false,
      isFirstChapterPage: true,
      isTitleOnlyPage: true,
      currentSubheader: ''
    });
    currentHtml = '';
    currentHeight = 0;
  } else {
    // Title fits: start accumulating with it
    currentHtml = titleHtml;
    currentHeight = titleHeight;
  }

  // Quote options for split measurement
  const quoteOptions = {
    config: safeConfig.quote || {
      enabled: true,
      indentLeft: 2,
      indentRight: 2,
      showLine: true,
      italic: true,
      sizeMultiplier: 0.95,
      marginTop: 1,
      marginBottom: 1
    },
    baseFontSize,
    baseLineHeight,
    textAlign
  };

  // Process each child element
  for (let childIdx = 0; childIdx < children.length; childIdx++) {
    const el = children[childIdx];
    const isFirstParagraph = paragraphCount === 0;
    if (el.tagName === 'P' || el.tagName === 'DIV') {
      paragraphCount++;
    }

    const elHtml = buildParagraphHtml(
      el,
      safeConfig,
      baseFontSize,
      baseLineHeight,
      textAlign,
      isFirstParagraph
    );

    // Track subheader for running headers
    if (trackSubheaders && el.tagName.match(/^H[1-6]$/i)) {
      const level = el.tagName.slice(1).toLowerCase();
      const subheaderLevels = headerConfig.subheaderLevels || ['h1', 'h2'];
      if (subheaderLevels.includes(level)) {
        currentSubheader = el.textContent || '';
      }
    }

    // Track pseudo-headers from bold paragraphs
    if (trackPseudoHeaders && (el.tagName === 'P' || el.tagName === 'DIV')) {
      if (!currentSubheader) {
        const boldElements = el.querySelectorAll('strong, b');
        for (const boldEl of boldElements) {
          const text = boldEl.textContent?.trim() || '';
          if (text.length > 3) {
            currentSubheader = text;
            break;
          }
        }

        if (!currentSubheader) {
          const style = el.getAttribute('style') || '';
          if (
            style.includes('font-weight: bold') ||
            style.includes('font-weight:700') ||
            style.includes('font-weight:600')
          ) {
            const text = el.textContent?.trim() || '';
            if (text.length > 3) {
              currentSubheader = text;
            }
          }
        }
      }
    }

    measureDiv.innerHTML = elHtml;
    const elHeight = measureDiv.offsetHeight;

    // CASE A: Element itself is taller than a full page
    if (elHeight > contentHeight) {
      if (currentHtml) {
        pages.push({
          html: currentHtml,
          pageNumber: pages.length + 1,
          chapterTitle: chapter.title,
          isBlank: false,
          isTitleOnlyPage: false,
          currentSubheader
        });
        currentHtml = '';
        currentHeight = 0;
      }

      if (splitLongParagraphs) {
        const indentValue = safeConfig.paragraph?.firstLineIndent || 1.5;
        const lines = splitParagraphByLines(
          elHtml,
          measureDiv,
          contentHeight,
          textAlign,
          !isFirstParagraph,
          indentValue,
          true,
          quoteOptions
        );
        if (lines.length > 1) { paginationLogger.logElementSplit(el.tagName.toLowerCase(), elHtml.length, lines); }
        let lineHtml = '';

        lines.forEach((line, idx) => {
          const isLastLine = idx === lines.length - 1;

          if (isLastLine) {
            lineHtml += line;
            pages.push({
              html: lineHtml,
              pageNumber: pages.length + 1,
              chapterTitle: chapter.title,
              isBlank: false,
              currentSubheader
            });
            lineHtml = '';
          } else {
            const testHtml = lineHtml + line;
            measureDiv.innerHTML = testHtml;

            if (measureDiv.offsetHeight > contentHeight) {
              if (lineHtml) {
                pages.push({
                  html: lineHtml,
                  pageNumber: pages.length + 1,
                  chapterTitle: chapter.title,
                  isBlank: false,
                  currentSubheader
                });
              }
              lineHtml = line;
              measureDiv.innerHTML = line;
            } else {
              lineHtml = testHtml;
            }
          }
        });

        if (lineHtml) {
          pages.push({
            html: lineHtml,
            pageNumber: pages.length + 1,
            chapterTitle: chapter.title,
            isBlank: false,
            currentSubheader
          });
        }
      } else {
        // No split — push giant element as its own page
        pages.push({
          html: elHtml,
          pageNumber: pages.length + 1,
          chapterTitle: chapter.title,
          isBlank: false,
          currentSubheader
        });
      }
      continue;
    }

    // CASE B: Check if element fits when added to accumulator
    const candidateHtml = currentHtml + elHtml;
    measureDiv.innerHTML = candidateHtml;
    const candidateHeight = measureDiv.offsetHeight;

    if (candidateHeight > contentHeight) {
      // Element overflows current page
      const remainingSpace = contentHeight - currentHeight;
      const remainingLinesOnPage = Math.floor(remainingSpace / lineHeightPx);

      const shouldBreakPage = (el) => {
        const tag = el.tagName;
        const isList = tag === 'UL' || tag === 'OL';
        const isHeader = tag.match(/^H[1-6]$/i);
        if (isHeader || isList) return true;
        if (remainingLinesOnPage < minOrphanLines) return true;
        return false;
      };

      if (shouldBreakPage(el)) {
        // Hard page break
        pages.push({
          html: currentHtml,
          pageNumber: pages.length + 1,
          chapterTitle: chapter.title,
          isBlank: false,
          currentSubheader
        });
        currentHtml = elHtml;
        currentHeight = elHeight;
        continue;
      }

      if (splitLongParagraphs) {
        // Element fits on a fresh page — move without splitting
        if (elHeight <= contentHeight) {
          pages.push({
            html: currentHtml,
            pageNumber: pages.length + 1,
            chapterTitle: chapter.title,
            isBlank: false,
            currentSubheader
          });
          currentHtml = elHtml;
          currentHeight = elHeight;
          continue;
        }

        // Try soft split at remaining space
        const indentValue = safeConfig.paragraph?.firstLineIndent || 1.5;
        const splitArr = splitParagraphByLines(
          elHtml,
          measureDiv,
          remainingSpace,
          textAlign,
          !isFirstParagraph,
          indentValue,
          true,
          quoteOptions
        );

        if (splitArr.length > 1) {
          const firstChunk = splitArr[0];
          const restHtml = splitArr.slice(1).join('');

          measureDiv.innerHTML = firstChunk;
          const orphanLines = Math.floor(measureDiv.offsetHeight / lineHeightPx);
          measureDiv.innerHTML = restHtml;
          const widowLines = Math.floor(measureDiv.offsetHeight / lineHeightPx);

          if (orphanLines >= minOrphanLines && widowLines >= minWidowLines) {
            // Orphan/widow constraints satisfied
            pages.push({
              html: currentHtml + firstChunk,
              pageNumber: pages.length + 1,
              chapterTitle: chapter.title,
              isBlank: false,
              currentSubheader
            });
            currentHtml = restHtml;
            measureDiv.innerHTML = currentHtml;
            currentHeight = measureDiv.offsetHeight;
          } else {
            // Constraints failed — push current page, carry element
            pages.push({
              html: currentHtml,
              pageNumber: pages.length + 1,
              chapterTitle: chapter.title,
              isBlank: false,
              currentSubheader
            });
            currentHtml = elHtml;
            currentHeight = elHeight;
          }
        } else {
          // Split returned only 1 chunk — carry to next page
          pages.push({
            html: currentHtml,
            pageNumber: pages.length + 1,
            chapterTitle: chapter.title,
            isBlank: false,
            currentSubheader
          });
          currentHtml = elHtml;
          currentHeight = elHeight;
        }
      } else {
        // Split disabled — hard break
        pages.push({
          html: currentHtml,
          pageNumber: pages.length + 1,
          chapterTitle: chapter.title,
          isBlank: false,
          currentSubheader
        });
        currentHtml = elHtml;
        measureDiv.innerHTML = elHtml;
        currentHeight = measureDiv.offsetHeight;
      }
    } else {
      // Fits — accumulate
      currentHtml = candidateHtml;
      currentHeight = candidateHeight;
    }
  }

  // Flush remaining content
  if (currentHtml) {
    pages.push({
      html: currentHtml,
      pageNumber: pages.length + 1,
      chapterTitle: chapter.title,
      isBlank: false,
      currentSubheader
    });
  }
};

/**
 * Apply fill pass to rebalance pages (in-place mutation).
 *
 * @private
 */
const applyFillPassInPlace = (pages, layoutCtx, measureDiv, safeConfig) => {
  const {
    contentHeight,
    lineHeightPx,
    baseFontSize,
    baseLineHeight,
    textAlign,
    minOrphanLines,
    minWidowLines,
    splitLongParagraphs
  } = layoutCtx;

  const quoteOptions = {
    config: safeConfig.quote || {
      enabled: true,
      indentLeft: 2,
      indentRight: 2,
      showLine: true,
      italic: true,
      sizeMultiplier: 0.95,
      marginTop: 1,
      marginBottom: 1
    },
    baseFontSize,
    baseLineHeight,
    textAlign
  };

  let totalIterations = 0;
  const maxIterations = 10000;

  for (let pageIdx = 0; pageIdx < pages.length - 1; pageIdx++) {
    if (totalIterations >= maxIterations) break;

    for (let fillAttempts = 0; fillAttempts < 50; fillAttempts++) {
      if (totalIterations >= maxIterations) break;
      totalIterations++;

      const page = pages[pageIdx];
      if (page.isBlank) break;

      let remainingSpace = 0;
      let remainingLines = 0;
      try {
        measureDiv.innerHTML = page.html;
        remainingSpace = contentHeight - (measureDiv.offsetHeight || 0);
        remainingLines = Math.floor(remainingSpace / lineHeightPx);
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('paginateChapters: Fill pass measurement error at page', pageIdx, e);
        }
        break;
      }

      if (remainingLines < minOrphanLines) break;
      paginationLogger.logFillAttempt(pageIdx, remainingLines, remainingSpace, contentHeight);

      // Find next non-blank page
      let nextIdx = pageIdx + 1;
      while (nextIdx < pages.length && pages[nextIdx]?.isBlank) {
        nextIdx++;
      }
      if (nextIdx >= pages.length) break;

      const nextPage = pages[nextIdx];
      if (!nextPage || !nextPage.html) break;

      // Don't move content between chapters
      if (page.chapterTitle !== nextPage.chapterTitle) break;

      // Extract first element
      const tmp = document.createElement('div');
      tmp.innerHTML = nextPage.html;
      const firstEl = tmp.firstElementChild;

      if (!firstEl) break;

      const tagName = firstEl.tagName || '';
      const isHeader = /^H[1-6]$/i.test(tagName);
      const isList = tagName === 'UL' || tagName === 'OL';
      const isBlockquote = tagName === 'BLOCKQUOTE';

      // Don't move blockquotes unless lots of space
      if (isBlockquote && remainingLines < 10) break;

      const firstElOuter = firstEl.outerHTML;

      // Test if element fits
      try {
        measureDiv.innerHTML = page.html + firstElOuter;
        const pageWithElHeight = measureDiv.offsetHeight;

        if (pageWithElHeight <= contentHeight) {
          // Element fits — move it
          firstEl.remove();
          const restHtml = tmp.innerHTML;

          // Check widow lines
          if (!restHtml.trim()) {
            // Next page becomes empty, safe to move
            pages[pageIdx] = { ...page, html: page.html + firstElOuter };
            pages[nextIdx] = { ...nextPage, html: '' };
            paginationLogger.logPageEmptied(nextIdx, pageIdx, firstEl.tagName.toLowerCase());
            totalIterations++;
          } else {
            // Check widow rules
            measureDiv.innerHTML = restHtml;
            const widowLines = Math.floor((measureDiv.offsetHeight || 0) / lineHeightPx);

            if (widowLines >= minWidowLines) {
              pages[pageIdx] = { ...page, html: page.html + firstElOuter };
              const remainPct = Math.floor((restHtml.length / (restHtml.length + firstElOuter.length) * 100) || 0); paginationLogger.logElementMove(pageIdx, nextIdx, firstEl.tagName.toLowerCase(), firstElOuter.length, remainPct);
              pages[nextIdx] = { ...nextPage, html: restHtml };
              totalIterations++;
            }
          }
        } else if (!isHeader && !isList && splitLongParagraphs && !isBlockquote) {
          // Try splitting the element at remaining space
          const pageHasParagraph = /<p[^>]*>/i.test(page.html);
          const pageHasBlockquote = /<blockquote/i.test(page.html);
          const isFirstParagraphOfChapter = !pageHasParagraph && !pageHasBlockquote && firstEl.tagName === 'P';

          const splitArr = splitParagraphByLines(
            firstElOuter,
            measureDiv,
            remainingSpace,
            textAlign,
            !isFirstParagraphOfChapter,
            safeConfig.paragraph?.firstLineIndent || 1.5,
            true,
            quoteOptions
          );

          if (splitArr.length > 1) {
            const chunk = splitArr[0];
            const rest = splitArr.slice(1).join('');

            measureDiv.innerHTML = page.html + chunk;
            if (measureDiv.offsetHeight < contentHeight) {
              measureDiv.innerHTML = chunk;
              const chunkLines = Math.floor(measureDiv.offsetHeight / lineHeightPx);
              measureDiv.innerHTML = rest;
              const widowLines = rest.trim() ? Math.floor(measureDiv.offsetHeight / lineHeightPx) : Infinity;

              firstEl.remove();
              const restPageHtml = rest + tmp.innerHTML;

              if (chunkLines >= minOrphanLines && (!rest.trim() || widowLines >= minWidowLines)) {
                pages[pageIdx] = { ...page, html: page.html + chunk };
                pages[nextIdx] = { ...nextPage, html: restPageHtml };
                totalIterations++;
              }
            }
          }
        }
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('paginateChapters: Error testing element fit', e);
        }
        break;
      }
    }
  }
};
