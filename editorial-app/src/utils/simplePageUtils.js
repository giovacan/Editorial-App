/**
 * simplePageUtils.js
 *
 * Simple, pure utility functions for page operations.
 * Zero dependencies, zero side effects.
 * Safe to extract and test independently.
 */

/**
 * Create a blank page object with standard structure.
 * @param {number} pageNumber
 * @param {string} chapterTitle
 * @returns {object}
 */
export const createBlankPage = (pageNumber, chapterTitle = '') => ({
  html: '',
  pageNumber,
  isBlank: true,
  chapterTitle,
  currentSubheader: '',
  isFirstChapterPage: false
});

/**
 * Create a content page object with standard structure.
 * @param {string} html
 * @param {number} pageNumber
 * @param {string} chapterTitle
 * @param {string} currentSubheader
 * @param {boolean} isFirstChapterPage
 * @returns {object}
 */
export const createContentPage = (
  html,
  pageNumber,
  chapterTitle = '',
  currentSubheader = '',
  isFirstChapterPage = false
) => ({
  html,
  pageNumber,
  isBlank: false,
  chapterTitle,
  currentSubheader,
  isFirstChapterPage
});

/**
 * Calculate how many complete lines fit in a space.
 * Always uses Math.floor (never overestimate).
 * @param {number} spacePixels - Available space in pixels
 * @param {number} lineHeightPixels - Line height in pixels
 * @returns {number} Number of complete lines that fit
 */
export const calculateFittingLines = (spacePixels, lineHeightPixels) => {
  if (lineHeightPixels <= 0) return 0;
  return Math.floor(spacePixels / lineHeightPixels);
};

/**
 * Get remaining space after content.
 * @param {number} totalSpace - Total available space
 * @param {number} usedSpace - Space already used
 * @returns {number} Remaining space (never negative)
 */
export const getRemainingSpace = (totalSpace, usedSpace) => {
  return Math.max(0, totalSpace - usedSpace);
};

/**
 * Check if content fits in available space.
 * @param {number} contentHeight - Height of content
 * @param {number} availableSpace - Available space
 * @returns {boolean}
 */
export const contentFits = (contentHeight, availableSpace) => {
  return contentHeight <= availableSpace;
};

/**
 * Check if page has content (not blank).
 * @param {object} page - Page object
 * @returns {boolean}
 */
export const isPageEmpty = (page) => {
  return !page || page.isBlank === true || (page.html || '').trim() === '';
};

/**
 * Get page count from pages array.
 * @param {array} pages - Array of page objects
 * @returns {number}
 */
export const getPageCount = (pages) => {
  return Array.isArray(pages) ? pages.length : 0;
};

/**
 * Check if chapter should start on right page.
 * @param {number} chapterIndex - Chapter index (0-based)
 * @param {boolean} rule - If true, chapters start on right (odd-numbered pages)
 * @returns {boolean}
 */
export const shouldChapterStartOnRight = (chapterIndex, rule = true) => {
  return rule && chapterIndex > 0;
};

/**
 * Determine if page number is even.
 * @param {number} pageNumber
 * @returns {boolean}
 */
export const isEvenPage = (pageNumber) => {
  return pageNumber % 2 === 0;
};

/**
 * Determine if page number is odd.
 * @param {number} pageNumber
 * @returns {boolean}
 */
export const isOddPage = (pageNumber) => {
  return pageNumber % 2 === 1;
};

/**
 * Calculate total height of pages by summing block heights.
 * @param {array} blocks - Array of block objects with measuredHeight
 * @returns {number}
 */
export const calculateTotalHeight = (blocks) => {
  if (!Array.isArray(blocks)) return 0;
  return blocks.reduce((sum, block) => sum + (block.measuredHeight || 0), 0);
};

/**
 * Count lines from blocks.
 * @param {array} blocks - Array of block objects with lineCount
 * @returns {number}
 */
export const countLines = (blocks) => {
  if (!Array.isArray(blocks)) return 0;
  return blocks.reduce((sum, block) => sum + (block.lineCount || 0), 0);
};

/**
 * Check if element is a heading.
 * @param {HTMLElement} el
 * @returns {boolean}
 */
export const isHeading = (el) => {
  if (!el) return false;
  const tag = el.tagName || '';
  return tag.match(/^H[1-6]$/i) !== null;
};

/**
 * Check if element is a paragraph.
 * @param {HTMLElement} el
 * @returns {boolean}
 */
export const isParagraph = (el) => {
  if (!el) return false;
  return el.tagName === 'P';
};

/**
 * Check if element is a list.
 * @param {HTMLElement} el
 * @returns {boolean}
 */
export const isList = (el) => {
  if (!el) return false;
  const tag = el.tagName || '';
  return tag === 'UL' || tag === 'OL';
};

/**
 * Check if element is a blockquote.
 * @param {HTMLElement} el
 * @returns {boolean}
 */
export const isBlockquote = (el) => {
  if (!el) return false;
  return el.tagName === 'BLOCKQUOTE';
};

/**
 * Get heading level (1-6) from heading element.
 * @param {HTMLElement} el - Must be a heading element
 * @returns {number|null} 1-6 or null if not a heading
 */
export const getHeadingLevel = (el) => {
  if (!isHeading(el)) return null;
  const match = el.tagName.match(/H(\d)/);
  return match ? parseInt(match[1], 10) : null;
};

/**
 * Format page number with optional prefix.
 * @param {number} pageNumber
 * @param {string} prefix - Optional prefix (e.g., "p.")
 * @returns {string}
 */
export const formatPageNumber = (pageNumber, prefix = '') => {
  if (prefix) return `${prefix}${pageNumber}`;
  return String(pageNumber);
};

/**
 * Estimate content length for rough calculations.
 * @param {string} html - HTML content
 * @returns {number} Approximate character count
 */
export const estimateContentLength = (html) => {
  if (!html) return 0;
  // Remove HTML tags for a rough estimate
  const text = html.replace(/<[^>]*>/g, '');
  return text.length;
};

/**
 * Truncate text to max length with ellipsis.
 * @param {string} text
 * @param {number} maxLength
 * @param {string} ellipsis
 * @returns {string}
 */
export const truncateText = (text, maxLength = 50, ellipsis = '...') => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + ellipsis;
};
