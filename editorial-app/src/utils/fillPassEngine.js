/**
 * fillPassEngine.js
 *
 * Pure fill pass algorithm for page rebalancing.
 * Extracted from usePagination.js applyFillPass() function.
 *
 * Takes pre-generated pages and redistributes content to minimize
 * underfilled pages while respecting orphan/widow rules.
 *
 * NO REACT DEPENDENCIES • PURE FUNCTION • FULLY TESTABLE
 */

/**
 * Apply fill pass to rebalance pages.
 * Moves blocks from later pages to fill earlier underfilled pages.
 *
 * @param {Array} pages - Pre-generated pages array
 * @param {object} config - Fill pass configuration
 *   - contentHeight: Max height per page (pixels)
 *   - lineHeightPx: Line height for calculations
 *   - minOrphanLines: Min lines before break
 *   - minWidowLines: Min lines after break
 *   - splitLongParagraphs: Whether to split long paragraphs
 *   - measureDiv: DOM element for measurements
 *   - ...other config
 * @returns {Array} Modified pages array
 */
export const applyFillPass = (pages, config) => {
  if (!Array.isArray(pages) || pages.length === 0) {
    return pages;
  }

  const {
    contentHeight,
    lineHeightPx,
    minOrphanLines = 2,
    minWidowLines = 2,
    splitLongParagraphs = true,
    measureDiv
  } = config;

  if (!measureDiv) {
    console.warn('fillPassEngine: No measureDiv provided, returning pages unchanged');
    return pages;
  }

  // Work with a copy to avoid mutating original
  const result = [...pages];
  let totalIterations = 0;
  const maxIterations = 10000;

  // Try to fill underfilled pages
  for (let pageIdx = 0; pageIdx < result.length - 1 && totalIterations < maxIterations; pageIdx++) {
    const page = result[pageIdx];

    // Skip blank pages
    if (!page || page.isBlank) continue;

    // Calculate remaining space on current page
    let remainingSpace = 0;
    let remainingLines = 0;

    try {
      measureDiv.innerHTML = page.html || '';
      remainingSpace = contentHeight - (measureDiv.offsetHeight || 0);
      remainingLines = Math.floor(remainingSpace / lineHeightPx);
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('fillPassEngine: Measurement error at page', pageIdx, e);
      }
      continue;
    }

    // Not enough space to pull content from next page
    if (remainingLines < minOrphanLines) continue;

    // Find next non-blank page
    let nextIdx = pageIdx + 1;
    while (nextIdx < result.length && result[nextIdx]?.isBlank) {
      nextIdx++;
    }

    if (nextIdx >= result.length) continue;

    const nextPage = result[nextIdx];
    if (!nextPage || !nextPage.html) continue;

    // Don't move content between chapters
    if (page.chapterTitle !== nextPage.chapterTitle) continue;

    // Try to move first element from next page to current page
    const tmp = document.createElement('div');
    tmp.innerHTML = nextPage.html;
    const firstEl = tmp.firstElementChild;

    if (!firstEl) continue;

    const tagName = firstEl.tagName || '';
    const isHeader = /^H[1-6]$/i.test(tagName);
    const isList = tagName === 'UL' || tagName === 'OL';
    const isBlockquote = tagName === 'BLOCKQUOTE';

    // Don't move blockquotes unless lots of space
    if (isBlockquote && remainingLines < 10) continue;

    const firstElOuter = firstEl.outerHTML;

    // Test if element fits
    try {
      measureDiv.innerHTML = (page.html || '') + firstElOuter;
      const pageWithElHeight = measureDiv.offsetHeight;

      if (pageWithElHeight <= contentHeight) {
        // Element fits - move it
        firstEl.remove();
        const restHtml = tmp.innerHTML;

        // Check widow lines
        if (!restHtml.trim()) {
          // Next page becomes empty, safe to move
          result[pageIdx] = {
            ...page,
            html: (page.html || '') + firstElOuter
          };
          result[nextIdx] = {
            ...nextPage,
            html: ''
          };
          totalIterations++;
        } else {
          // Check widow rules
          measureDiv.innerHTML = restHtml;
          const widowLines = Math.floor((measureDiv.offsetHeight || 0) / lineHeightPx);

          if (widowLines >= minWidowLines) {
            result[pageIdx] = {
              ...page,
              html: (page.html || '') + firstElOuter
            };
            result[nextIdx] = {
              ...nextPage,
              html: restHtml
            };
            totalIterations++;
          }
        }
      }
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('fillPassEngine: Error testing element fit', e);
      }
      continue;
    }
  }

  return result;
};

/**
 * Calculate remaining space on a page.
 *
 * @param {string} pageHtml - Page HTML content
 * @param {number} contentHeight - Max page height
 * @param {HTMLElement} measureDiv - Measurement element
 * @returns {number} Remaining space in pixels
 */
export const calculatePageRemainingSpace = (pageHtml, contentHeight, measureDiv) => {
  if (!measureDiv) return 0;

  try {
    measureDiv.innerHTML = pageHtml || '';
    const usedSpace = measureDiv.offsetHeight || 0;
    return Math.max(0, contentHeight - usedSpace);
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('calculatePageRemainingSpace: Measurement error', e);
    }
    return 0;
  }
};

/**
 * Check if element can be moved to a page.
 *
 * @param {string} currentPageHtml - Current page HTML
 * @param {string} elementHtml - Element to move
 * @param {number} contentHeight - Max page height
 * @param {HTMLElement} measureDiv - Measurement element
 * @returns {boolean} True if element fits
 */
export const canElementFitOnPage = (currentPageHtml, elementHtml, contentHeight, measureDiv) => {
  if (!measureDiv) return false;

  try {
    measureDiv.innerHTML = (currentPageHtml || '') + elementHtml;
    return (measureDiv.offsetHeight || 0) <= contentHeight;
  } catch (e) {
    return false;
  }
};

/**
 * Check if remaining content would violate widow rules.
 *
 * @param {string} restHtml - Remaining HTML after move
 * @param {number} minWidowLines - Min lines required
 * @param {number} lineHeightPx - Line height in pixels
 * @param {HTMLElement} measureDiv - Measurement element
 * @returns {boolean} True if widow rules satisfied (or content empty)
 */
export const widowRulesSatisfied = (restHtml, minWidowLines, lineHeightPx, measureDiv) => {
  if (!restHtml || !restHtml.trim()) {
    return true; // Empty is fine
  }

  if (!measureDiv || !lineHeightPx) return false;

  try {
    measureDiv.innerHTML = restHtml;
    const lines = Math.floor((measureDiv.offsetHeight || 0) / lineHeightPx);
    return lines >= minWidowLines;
  } catch (e) {
    return false;
  }
};

/**
 * Get first element of page HTML.
 *
 * @param {string} pageHtml - Page HTML
 * @returns {HTMLElement|null} First element or null
 */
export const getFirstElement = (pageHtml) => {
  if (!pageHtml) return null;

  try {
    const tmp = document.createElement('div');
    tmp.innerHTML = pageHtml;
    return tmp.firstElementChild;
  } catch (e) {
    return null;
  }
};

/**
 * Remove first element from HTML and return rest.
 *
 * @param {string} pageHtml - Page HTML
 * @returns {string} Remaining HTML
 */
export const removeFirstElement = (pageHtml) => {
  if (!pageHtml) return '';

  try {
    const tmp = document.createElement('div');
    tmp.innerHTML = pageHtml;
    const first = tmp.firstElementChild;
    if (first) first.remove();
    return tmp.innerHTML;
  } catch (e) {
    return pageHtml;
  }
};
