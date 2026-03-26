/**
 * Knuth-Plass Line Breaking Adapter
 *
 * Bridges our Canvas-based text measurement (measureWordWidth, getSpaceWidth)
 * with the tex-linebreak library's optimal line-breaking algorithm.
 *
 * This replaces the greedy countLines/countLinesFromRuns with globally-optimal
 * line breaks that minimize inter-word spacing variance across the paragraph.
 */

import { breakLines, forcedBreak, MAX_COST, MaxAdjustmentExceededError } from 'tex-linebreak';

/**
 * KP_MAX_ADJUSTMENT_RATIO: Maximum allowed stretch/shrink ratio per space.
 *
 * Controls how much a word-space can deviate from its natural width.
 * 1.0 = spaces can grow up to 2x or shrink to ~0.67x their natural width.
 * 1.5 = spaces can grow to 2.5x — more flexible but visually looser.
 *
 * InDesign default: ~1.0–1.5 depending on mode.
 * We use 1.5 as the primary limit and fall back to null (unlimited) only
 * when the paragraph genuinely can't fit within the limit (e.g., very long
 * Spanish words, or extremely narrow columns).
 *
 * This prevents the "river" effect where a 3-word line gets huge gaps
 * because KP is optimizing globally across all lines.
 */
const KP_MAX_ADJUSTMENT_RATIO = 1.5;

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
    // Try with controlled ratio first — prevents overly-wide spaces in short lines.
    // Falls back to unlimited if the paragraph can't satisfy the ratio constraint
    // (e.g. very long Spanish compound words, narrow columns).
    let breakpoints;
    try {
      breakpoints = breakLines(items, contentWidth, { maxAdjustmentRatio: KP_MAX_ADJUSTMENT_RATIO });
    } catch (ratioErr) {
      if (ratioErr instanceof MaxAdjustmentExceededError) {
        breakpoints = breakLines(items, contentWidth, { maxAdjustmentRatio: null });
      } else {
        throw ratioErr;
      }
    }
    // breakpoints includes start (0) and end, so line count = breakpoints.length - 1
    return breakpoints.length - 1;
  } catch (e) {
    return null; // Signal caller to use greedy fallback
  }
};

/**
 * Get KP-optimal line break positions and word-spacing adjustments for rendering.
 *
 * Unlike countLinesKP (which only returns a count), this returns the exact word
 * indices where each line starts AND the extra word-spacing (in px) needed to
 * justify each non-last line to the full content width.
 *
 * Used by applyKpRendering() to make the browser follow KP-optimal line breaks
 * via explicit <br> tags + CSS word-spacing per line.
 *
 * @param {string} text          - Whitespace-collapsed plain text
 * @param {number} contentWidth  - Effective line width in px (after widthSlack)
 * @param {string} fontString    - CSS font string
 * @param {number} firstLineIndent - First-line indent in px (0 for continuations)
 * @param {number} wordSpacingPx - Base extra word spacing from CSS (usually 0)
 * @returns {{ lineStarts: number[], wordSpacings: number[] } | null}
 *   lineStarts[i]   = index of the first word on line i
 *   wordSpacings[i] = extra px per inter-word space to justify line i (last line = 0)
 *   Returns null if KP fails or a long word prevents computation.
 */
export const getLineBreakPositionsKP = (text, contentWidth, fontString, firstLineIndent = 0, wordSpacingPx = 0) => {
  if (!text || !text.trim() || contentWidth <= 0) return null;

  const words = text.split(' ').filter(w => w.length > 0);
  if (words.length === 0) return null;
  if (words.length === 1) return { lineStarts: [0], wordSpacings: [0] };

  const baseSpaceWidth = _getSpaceWidth(fontString) + wordSpacingPx;

  // Measure all words, building item list with a word-index map
  const wordItems = [];
  const items = [];
  const itemWordIdx = []; // items[i] → word index, -1 for non-word items

  if (firstLineIndent > 0) {
    items.push({ type: 'box', width: firstLineIndent });
    itemWordIdx.push(-1);
  }

  for (let i = 0; i < words.length; i++) {
    const w = _measureWordWidth(words[i], fontString);
    if (w > contentWidth) return null; // long word — caller should use greedy
    wordItems.push({ word: words[i], width: w });

    if (i > 0) {
      items.push({ type: 'glue', width: baseSpaceWidth, stretch: baseSpaceWidth * 0.5, shrink: Math.max(0, baseSpaceWidth * 0.33) });
      itemWordIdx.push(-1);
    }
    items.push({ type: 'box', width: w });
    itemWordIdx.push(i);
  }

  // Finishing glue + forced break (standard KP paragraph ending)
  items.push({ type: 'glue', width: 0, stretch: MAX_COST, shrink: 0 });
  itemWordIdx.push(-1);
  items.push(forcedBreak());
  itemWordIdx.push(-1);

  try {
    let breakpoints;
    try {
      breakpoints = breakLines(items, contentWidth, { maxAdjustmentRatio: KP_MAX_ADJUSTMENT_RATIO });
    } catch (ratioErr) {
      if (ratioErr instanceof MaxAdjustmentExceededError) {
        breakpoints = breakLines(items, contentWidth, { maxAdjustmentRatio: null });
      } else {
        throw ratioErr;
      }
    }
    // breakpoints: [0, bp1, bp2, ..., forcedBreakPos]
    // Each intermediate bp is an item index where the line ends (typically a glue).
    // The word that STARTS the next line is the first word-box AFTER that item.

    const lineStarts = [0]; // line 0 always starts at word 0
    for (let b = 1; b < breakpoints.length - 1; b++) {
      const bp = breakpoints[b];
      for (let k = bp + 1; k < items.length; k++) {
        if (itemWordIdx[k] >= 0) {
          lineStarts.push(itemWordIdx[k]);
          break;
        }
      }
    }

    // Compute extra word-spacing per line so the browser renders each non-last
    // line exactly at contentWidth. Last line gets 0 (natural short ending).
    const wordSpacings = [];
    for (let li = 0; li < lineStarts.length; li++) {
      const isLast = li === lineStarts.length - 1;
      if (isLast) { wordSpacings.push(0); continue; }

      const start = lineStarts[li];
      const end   = lineStarts[li + 1];
      const numWords  = end - start;
      const numSpaces = numWords - 1;

      if (numSpaces <= 0) { wordSpacings.push(0); continue; }

      // Available text width: first line is narrower by indent
      const lineW = li === 0 ? contentWidth - firstLineIndent : contentWidth;
      let sumW = 0;
      for (let wi = start; wi < end; wi++) sumW += wordItems[wi].width;

      // Extra px per space beyond baseSpaceWidth
      const extra = (lineW - sumW - numSpaces * baseSpaceWidth) / numSpaces;
      wordSpacings.push(extra);
    }

    return { lineStarts, wordSpacings };
  } catch (e) {
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
    let breakpoints;
    try {
      breakpoints = breakLines(items, contentWidth, { maxAdjustmentRatio: KP_MAX_ADJUSTMENT_RATIO });
    } catch (ratioErr) {
      if (ratioErr instanceof MaxAdjustmentExceededError) {
        breakpoints = breakLines(items, contentWidth, { maxAdjustmentRatio: null });
      } else {
        throw ratioErr;
      }
    }
    return breakpoints.length - 1;
  } catch (e) {
    return null; // Fallback to greedy
  }
};
