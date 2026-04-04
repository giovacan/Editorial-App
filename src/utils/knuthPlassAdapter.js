/**
 * Knuth-Plass Line Breaking Adapter
 *
 * Bridges our Canvas-based text measurement (measureWordWidth, getSpaceWidth)
 * with the tex-linebreak library's optimal line-breaking algorithm.
 *
 * This replaces the greedy countLines/countLinesFromRuns with globally-optimal
 * line breaks that minimize inter-word spacing variance across the paragraph.
 */

import { breakLines, forcedBreak, MAX_COST, MaxAdjustmentExceededError, createHyphenator } from 'tex-linebreak';
import esPatterns from 'hyphenation.es';

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

// Penalty for two consecutive hyphenated line endings (flagged penalties back-to-back).
// 0 = disabled (no hyphenation yet). Once hyphenation is wired in, set to 3000 to match
// InDesign's default. Pre-activated here so the infrastructure is ready.
const KP_DOUBLE_HYPHEN_PENALTY = 3000;

// Penalty for adjacent lines in very different fitness classes (tight/normal/loose/very-loose).
// Prevents jarring transitions in inter-word spacing between consecutive lines.
// 3000 is the TeX default; InDesign uses a similar value internally.
const KP_ADJACENT_LOOSE_TIGHT_PENALTY = 3000;

// Soft hyphen penalty cost — lower than InDesign's default (~100) so KP prefers
// hyphenation over very loose spacing, but not so low that it hyphenates every word.
// 50 matches TeX's \hyphenpenalty default.
const KP_HYPHEN_PENALTY = 50;

// Minimum syllable length to insert a breakpoint.
// The Liang dictionary already enforces leftmin=2 / rightmin=2 for Spanish.
// We use 2 here to match — setting this to 3 would reject most Spanish syllables
// (e.g. "di", "na", "ra" in "ex-tra-or-di-na-ria-men-te").
const KP_MIN_SYLLABLE_LENGTH = 2;

// ─── Spanish hyphenator (Liang patterns via tex-linebreak + hyphenation.es) ──
// Initialized lazily on first call to buildItemsWithHyphenation.
// The hyphenator splits words into syllable arrays: ['cons','ti','tu','cio','nal']
let _hyphenate = null;
const getHyphenate = () => {
  if (!_hyphenate) _hyphenate = createHyphenator(esPatterns);
  return _hyphenate;
};

// ─── UAX#14: Split words at em/en-dash boundaries ───────────────────
// Em-dash (—, U+2014) and en-dash (–, U+2013) are optional break-after
// points. "palabra—otra" → ["palabra—", "otra"]. Dash stays with the
// preceding fragment (typographic convention).
const _dashRe = /([\u2014\u2013])/;
const _splitAtDashes = (words) => {
  let changed = false;
  const result = [];
  for (const w of words) {
    if (_dashRe.test(w)) {
      const parts = w.split(_dashRe);
      let cur = '';
      for (let i = 0; i < parts.length; i++) {
        if (!parts[i]) continue;
        if (parts[i] === '\u2014' || parts[i] === '\u2013') {
          cur += parts[i];
        } else {
          if (cur) { result.push(cur); changed = true; }
          cur = parts[i];
        }
      }
      if (cur) result.push(cur);
      if (parts.filter(p => p === '\u2014' || p === '\u2013').length > 0) changed = true;
    } else {
      result.push(w);
    }
  }
  return changed ? result : words;
};

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
 * When fontString is supplied, words are split into syllables via the Liang
 * Spanish dictionary and penalty items (cost=50, flagged=true) are inserted
 * between syllables so KP can break within words when needed.
 *
 * @param {Array<{word: string, width: number}>} wordItems - Words with pre-measured widths
 * @param {number} spaceWidth - Base space width in px
 * @param {number} firstLineIndent - Indent for the first line in px
 * @param {string|null} fontString - CSS font string for syllable measurement (enables hyphenation)
 * @returns {import('tex-linebreak').InputItem[]}
 */
const buildItems = (wordItems, spaceWidth, firstLineIndent, fontString = null, itemWordIdx = null) => {
  const items = [];
  const hyphenate = fontString ? getHyphenate() : null;

  // Measure soft-hyphen glyph width once (used for all penalty items in this paragraph)
  const hyphenWidth = fontString ? _measureWordWidth('-', fontString) : 0;

  // First-line indent as an empty box
  if (firstLineIndent > 0) {
    items.push({ type: 'box', width: firstLineIndent });
    if (itemWordIdx) itemWordIdx.push(-1);
  }

  for (let i = 0; i < wordItems.length; i++) {
    const { word, width } = wordItems[i];

    if (i > 0) {
      // UAX#14: After a word ending with em/en-dash, use zero-width glue
      // (the dash IS the visual separator — no extra space needed).
      // This models a "break-after" opportunity without visible gap.
      const prevWord = wordItems[i - 1].word;
      const prevEndsDash = prevWord.endsWith('\u2014') || prevWord.endsWith('\u2013');
      const gw = prevEndsDash ? 0 : spaceWidth;
      items.push({
        type: 'glue',
        width: gw,
        stretch: prevEndsDash ? spaceWidth * 0.25 : spaceWidth * 0.5,
        shrink: prevEndsDash ? 0 : Math.max(0, spaceWidth * 0.33),
      });
      if (itemWordIdx) itemWordIdx.push(-1);
    }

    // Attempt syllabification if the word is long enough to benefit.
    // Short words (≤4 chars) rarely produce useful breaks and add noise.
    // Skip NBSP-joined tokens (\uE000 sentinel) — they must not be broken.
    if (hyphenate && word.length > 4 && !word.includes('\uE000')) {
      const syllables = hyphenate(word);
      if (syllables.length > 1) {
        // Verify each syllable is long enough per KP_MIN_SYLLABLE_LENGTH
        // Build the syllable boxes + penalty items
        let syllableOk = true;
        for (let s = 0; s < syllables.length; s++) {
          const isEdge = s === 0 || s === syllables.length - 1;
          if (!isEdge && syllables[s].length < KP_MIN_SYLLABLE_LENGTH) {
            // Interior syllable too short — skip hyphenation for this word
            // (edge syllables can be short; only interior ones matter)
            syllableOk = false;
            break;
          }
        }

        if (syllableOk) {
          for (let s = 0; s < syllables.length; s++) {
            const sylWidth = _measureWordWidth(syllables[s], fontString);
            items.push({ type: 'box', width: sylWidth });
            // All syllable boxes map to the same word index
            if (itemWordIdx) itemWordIdx.push(i);
            if (s < syllables.length - 1) {
              // Optional hyphen: penalty item with the soft-hyphen glyph width
              items.push({
                type: 'penalty',
                width: hyphenWidth,
                cost: KP_HYPHEN_PENALTY,
                flagged: true,
              });
              if (itemWordIdx) itemWordIdx.push(-1);
            }
          }
          continue; // Skip the single-box push below
        }
      }
    }

    // No hyphenation — word is a single box
    items.push({ type: 'box', width });
    if (itemWordIdx) itemWordIdx.push(i);
  }

  // Finishing glue + forced break (standard Knuth-Plass paragraph ending)
  items.push({ type: 'glue', width: 0, stretch: MAX_COST, shrink: 0 });
  if (itemWordIdx) itemWordIdx.push(-1);
  items.push(forcedBreak());
  if (itemWordIdx) itemWordIdx.push(-1);

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

  const words = _splitAtDashes(text.split(' ').filter(w => w.length > 0));
  if (words.length === 0) return 0;

  const spaceWidth = _getSpaceWidth(fontString) + letterSpacingPx + wordSpacingPx;

  // Measure all words. With hyphenation enabled, words wider than contentWidth
  // will be split into syllables inside buildItems, so we no longer bail out here.
  const wordItems = [];
  for (const word of words) {
    let w = _measureWordWidth(word, fontString);
    if (letterSpacingPx && word.length > 1) {
      w += letterSpacingPx * (word.length - 1);
    }
    wordItems.push({ word, width: w });
  }

  const items = buildItems(wordItems, spaceWidth, firstLineIndent, fontString);

  try {
    // Try with controlled ratio first — prevents overly-wide spaces in short lines.
    // Falls back to unlimited if the paragraph can't satisfy the ratio constraint
    // (e.g. very long Spanish compound words, narrow columns).
    let breakpoints;
    try {
      breakpoints = breakLines(items, contentWidth, { maxAdjustmentRatio: KP_MAX_ADJUSTMENT_RATIO, doubleHyphenPenalty: KP_DOUBLE_HYPHEN_PENALTY, adjacentLooseTightPenalty: KP_ADJACENT_LOOSE_TIGHT_PENALTY });
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

  const words = _splitAtDashes(text.split(' ').filter(w => w.length > 0));
  if (words.length === 0) return null;
  if (words.length === 1) return { lineStarts: [0], wordSpacings: [0] };

  const baseSpaceWidth = _getSpaceWidth(fontString) + wordSpacingPx;

  // Measure all words
  const wordItems = [];
  for (let i = 0; i < words.length; i++) {
    const w = _measureWordWidth(words[i], fontString);
    wordItems.push({ word: words[i], width: w });
  }

  // Build items via shared buildItems (includes hyphenation when fontString is set).
  // itemWordIdx tracks which word each item corresponds to (-1 for non-word items).
  const itemWordIdx = [];
  const items = buildItems(wordItems, baseSpaceWidth, firstLineIndent, fontString, itemWordIdx);

  try {
    let breakpoints;
    try {
      breakpoints = breakLines(items, contentWidth, { maxAdjustmentRatio: KP_MAX_ADJUSTMENT_RATIO, doubleHyphenPenalty: KP_DOUBLE_HYPHEN_PENALTY, adjacentLooseTightPenalty: KP_ADJACENT_LOOSE_TIGHT_PENALTY });
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
          // Deduplicate: hyphenated words produce multiple boxes with the same
          // word index. Only record a new lineStart when the word index changes.
          const wordIdx = itemWordIdx[k];
          if (lineStarts[lineStarts.length - 1] !== wordIdx) {
            lineStarts.push(wordIdx);
          }
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
      // UAX#14: split at em/en-dashes within words
      const subWords = _splitAtDashes([part]);
      for (const sw of subWords) {
        const width = _measureWordWidth(sw, fontStr);
        wordItems.push({ word: sw, width, fontStr });
      }
    }
  }

  if (wordItems.length === 0) return 0;

  // Use the font of the first run as the representative font for hyphen measurement
  const representativeFont = wordItems[0]?.fontStr
    || _buildFontString(baseFontSizePx, fontFamily, false, false);

  if (!baseSpaceWidth) {
    baseSpaceWidth = _getSpaceWidth(representativeFont) + wordSpacingPx;
  }

  const items = buildItems(wordItems, baseSpaceWidth, firstLineIndent, representativeFont);

  try {
    let breakpoints;
    try {
      breakpoints = breakLines(items, contentWidth, { maxAdjustmentRatio: KP_MAX_ADJUSTMENT_RATIO, doubleHyphenPenalty: KP_DOUBLE_HYPHEN_PENALTY, adjacentLooseTightPenalty: KP_ADJACENT_LOOSE_TIGHT_PENALTY });
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
