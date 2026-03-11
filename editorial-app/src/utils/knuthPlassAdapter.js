/**
 * Knuth-Plass Line Breaking Adapter
 *
 * Bridges our Canvas-based text measurement (measureWordWidth, getSpaceWidth)
 * with the tex-linebreak library's optimal line-breaking algorithm.
 *
 * This replaces the greedy countLines/countLinesFromRuns with globally-optimal
 * line breaks that minimize inter-word spacing variance across the paragraph.
 */

import { breakLines, forcedBreak, MAX_COST } from 'tex-linebreak';

// ─── Imported from textLayoutEngine.js (will be injected) ───────────
// We need measureWordWidth, getSpaceWidth, buildFontString, breakWord
// These are passed via init() to avoid circular imports.

let _measureWordWidth = null;
let _getSpaceWidth = null;
let _buildFontString = null;
let _breakWord = null;

/**
 * Initialize the adapter with measurement functions from textLayoutEngine.
 * Must be called once before using countLinesKP / countLinesFromRunsKP.
 */
export const initKnuthPlass = (measureWordWidth, getSpaceWidth, buildFontString, breakWord) => {
  _measureWordWidth = measureWordWidth;
  _getSpaceWidth = getSpaceWidth;
  _buildFontString = buildFontString;
  _breakWord = breakWord;
};

/**
 * Build Box/Glue/Penalty items from an array of words with their widths.
 *
 * @param {Array<{word: string, width: number}>} wordItems - Words with pre-measured widths
 * @param {number} spaceWidth - Base space width in px
 * @param {number} firstLineIndent - Indent for the first line in px
 * @returns {import('tex-linebreak').InputItem[]}
 */
const buildItems = (wordItems, spaceWidth, firstLineIndent) => {
  const items = [];

  // First-line indent as an empty box
  if (firstLineIndent > 0) {
    items.push({ type: 'box', width: firstLineIndent });
  }

  for (let i = 0; i < wordItems.length; i++) {
    const { width } = wordItems[i];

    if (i > 0) {
      // Glue (space) between words — can stretch/shrink
      items.push({
        type: 'glue',
        width: spaceWidth,
        stretch: spaceWidth * 0.5,
        shrink: Math.max(0, spaceWidth * 0.33),
      });
    }

    items.push({ type: 'box', width });
  }

  // Finishing glue + forced break (standard Knuth-Plass paragraph ending)
  items.push({ type: 'glue', width: 0, stretch: MAX_COST, shrink: 0 });
  items.push(forcedBreak());

  return items;
};

/**
 * Count lines using Knuth-Plass optimal line breaking.
 * Drop-in replacement for the greedy countLines().
 *
 * @param {string} text - Whitespace-collapsed text
 * @param {number} contentWidth - Available line width in px
 * @param {string} fontString - CSS font string for Canvas measurement
 * @param {number} firstLineIndent - First line indent in px
 * @param {number} letterSpacingPx - Extra letter spacing in px
 * @param {number} wordSpacingPx - Extra word spacing in px
 * @returns {number} Number of lines
 */
export const countLinesKP = (text, contentWidth, fontString, firstLineIndent = 0, letterSpacingPx = 0, wordSpacingPx = 0) => {
  if (!text || !text.trim() || contentWidth <= 0) return text?.trim() ? 1 : 0;

  const words = text.split(' ').filter(w => w.length > 0);
  if (words.length === 0) return 0;

  const spaceWidth = _getSpaceWidth(fontString) + letterSpacingPx + wordSpacingPx;

  // Check for words wider than contentWidth (need char-level breaking)
  // Knuth-Plass doesn't handle this, so we pre-process long words
  let hasLongWord = false;
  const wordItems = [];
  for (const word of words) {
    let w = _measureWordWidth(word, fontString);
    if (letterSpacingPx && word.length > 1) {
      w += letterSpacingPx * (word.length - 1);
    }
    if (w > contentWidth) {
      hasLongWord = true;
      break;
    }
    wordItems.push({ word, width: w });
  }

  // Fall back to greedy for paragraphs with words wider than the line
  // (rare edge case — Knuth-Plass doesn't handle mid-word breaks)
  if (hasLongWord) {
    return null; // Signal caller to use greedy fallback
  }

  const items = buildItems(wordItems, spaceWidth, firstLineIndent);

  try {
    const breakpoints = breakLines(items, contentWidth, { maxAdjustmentRatio: null });
    // breakpoints includes start (0) and end, so line count = breakpoints.length - 1
    return breakpoints.length - 1;
  } catch (e) {
    // If Knuth-Plass fails (shouldn't with maxAdjustmentRatio: null), return null for fallback
    return null;
  }
};

/**
 * Count lines using Knuth-Plass for paragraphs with mixed inline styles (bold/italic runs).
 * Drop-in replacement for the greedy countLinesFromRuns().
 *
 * @param {Array<{text: string, bold: boolean, italic: boolean, fontSize: number|null}>} runs
 * @param {number} contentWidth - Available width in px
 * @param {number} baseFontSizePx - Base font size
 * @param {string} fontFamily - Font family name
 * @param {number} firstLineIndent - First line indent in px
 * @param {number} wordSpacingPx - Extra word spacing in px
 * @returns {number} Number of lines
 */
export const countLinesFromRunsKP = (runs, contentWidth, baseFontSizePx, fontFamily, firstLineIndent = 0, wordSpacingPx = 0) => {
  if (!runs || runs.length === 0 || contentWidth <= 0) return 0;

  // Flatten runs into word-level tokens with their font and measured width
  const wordItems = [];
  let baseSpaceWidth = 0;

  for (const run of runs) {
    if (!run.text) continue;
    const fontSize = run.fontSize || baseFontSizePx;
    const fontStr = _buildFontString(fontSize, fontFamily, run.bold, run.italic);

    if (!baseSpaceWidth) {
      baseSpaceWidth = _getSpaceWidth(fontStr) + wordSpacingPx;
    }

    const parts = run.text.split(/(\s+)/);
    for (const part of parts) {
      if (!part) continue;
      if (/^\s+$/.test(part)) continue; // Spaces become glue, handled by buildItems
      const width = _measureWordWidth(part, fontStr);
      if (width > contentWidth) {
        return null; // Long word — fall back to greedy
      }
      wordItems.push({ word: part, width });
    }
  }

  if (wordItems.length === 0) return 0;
  if (!baseSpaceWidth) {
    const defaultFont = _buildFontString(baseFontSizePx, fontFamily, false, false);
    baseSpaceWidth = _getSpaceWidth(defaultFont) + wordSpacingPx;
  }

  const items = buildItems(wordItems, baseSpaceWidth, firstLineIndent);

  try {
    const breakpoints = breakLines(items, contentWidth, { maxAdjustmentRatio: null });
    return breakpoints.length - 1;
  } catch (e) {
    return null; // Fallback to greedy
  }
};
