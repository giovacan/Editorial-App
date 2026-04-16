/**
 * lineBreaking.js
 *
 * Spanish hyphenation, greedy line breaking, Knuth-Plass adapter,
 * line break position queries, and hyphenation quality analysis.
 *
 * Depends on: textMeasurement.js, textPreprocess.js
 */

import { initKnuthPlass, countLinesKP, countLinesFromRunsKP, getLineBreakPositionsKP } from './knuthPlassAdapter.js';
import {
  getCtx,
  buildFontString,
  measureTextWidth,
  measureWordWidth,
  getSpaceWidth,
  normalizeWidth,
} from './textMeasurement.js';
import { collapseWhitespace, splitWordsAtDashes } from './textPreprocess.js';

// ─── Initialize Knuth-Plass adapter with our measurement functions ──
initKnuthPlass(measureWordWidth, getSpaceWidth, buildFontString, breakWord);

// ─── Spanish syllabification ─────────────────────────────────────────
// Implements core RAE syllabification rules for hyphenation.
// Used by countLines / countLinesFromRuns to break Spanish words at
// syllable boundaries instead of wrapping the whole word to the next line.
// Canvas measurement and CSS hyphens:auto now agree on line counts.

const _isVowel = (c) => 'aeiouáéíóúüAEIOUÁÉÍÓÚÜ'.includes(c);

// Consonant pairs that always move together to the next syllable
const _INSEP_PAIRS = new Set([
  'ch', 'll', 'rr', 'qu', 'gu',
  'bl', 'br', 'cl', 'cr', 'dr',
  'fl', 'fr', 'gl', 'gr', 'pl', 'pr', 'tr',
]);

/**
 * Returns valid hyphenation positions for a Spanish word.
 * Each value i means: break between word[i-1] and word[i].
 * Minimum 2 chars on each side. Results sorted ascending.
 *
 * @param {string} word - Raw word (mixed case, may include accents)
 * @returns {number[]}
 */
const getSpanishHyphenPoints = (word) => {
  if (word.length < 4) return [];
  const w = word.toLowerCase();
  const n = w.length;
  const pts = new Set();
  let i = 0;

  while (i < n) {
    while (i < n && _isVowel(w[i])) i++;   // skip vowel cluster
    if (i >= n) break;

    const cStart = i;
    while (i < n && !_isVowel(w[i])) i++;  // collect consonant cluster
    if (i >= n) break;                       // trailing consonants — no syllable follows

    const cLen = i - cStart;
    let breakAt;

    if (cLen === 1) {
      breakAt = cStart;                                          // V·CV
    } else if (cLen === 2) {
      const pair = w.slice(cStart, cStart + 2);
      breakAt = _INSEP_PAIRS.has(pair) ? cStart : cStart + 1;  // V·CCV or VC·CV
    } else {
      const lastPair = w.slice(i - 2, i);
      breakAt = _INSEP_PAIRS.has(lastPair) ? i - 2 : i - 1;    // VC…·(CC)V
    }

    if (breakAt >= 2 && breakAt <= n - 2) pts.add(breakAt);
  }

  return [...pts].sort((a, b) => a - b);
};

// ─── Hyphen character width cache ────────────────────────────────────
const _hyphenWidthCache = new Map();
const getHyphenWidth = (fontString) => {
  if (_hyphenWidthCache.has(fontString)) return _hyphenWidthCache.get(fontString);
  const w = measureTextWidth('-', fontString);
  _hyphenWidthCache.set(fontString, w);
  return w;
};

// ─── Word-break for long words ──────────────────────────────────────
// When a single word is wider than the available line, break it
// character-by-character (CSS overflow-wrap: break-word behavior).

/**
 * Count how many lines a single long word occupies when it must break.
 * Returns { lines, lastLineWidth } so the caller can continue accumulating.
 *
 * @param {string} word
 * @param {string} fontString
 * @param {number} availableFirstLine - Space left on current line
 * @param {number} fullLineWidth - Full content width for subsequent lines
 * @param {number} letterSpacingPx - Extra spacing per character
 * @returns {{ lines: number, lastLineWidth: number }}
 */
export function breakWord(word, fontString, availableFirstLine, fullLineWidth, letterSpacingPx = 0) {
  const ctx = getCtx();
  ctx.font = fontString;

  let lines = 0;
  let currentWidth = 0;
  let availableWidth = availableFirstLine;

  for (let i = 0; i < word.length; i++) {
    const charWidth = normalizeWidth(ctx.measureText(word[i]).width) + letterSpacingPx;

    if (currentWidth + charWidth > availableWidth && currentWidth > 0) {
      lines++;
      currentWidth = charWidth;
      availableWidth = fullLineWidth; // subsequent lines get full width
    } else {
      currentWidth += charWidth;
    }
  }

  return { lines, lastLineWidth: currentWidth };
}

/**
 * Count lines for text with mixed inline styles (runs).
 * Each run can have different bold/italic/fontSize.
 * Greedy word-by-word algorithm.
 *
 * @param {TextRun[]} runs - Styled text runs
 * @param {number} contentWidth - Available width in px
 * @param {number} baseFontSizePx - Base font size
 * @param {string} fontFamily - Font family
 * @param {number} firstLineIndent - First line indent in px
 * @returns {number} Number of lines
 */
export const countLinesFromRuns = (runs, contentWidth, baseFontSizePx, fontFamily, firstLineIndent = 0, wordSpacingPx = 0, noHyphenation = false) => {
  if (!runs || runs.length === 0 || contentWidth <= 0) return 0;

  // Flatten runs into word-level tokens with their font
  const tokens = [];
  for (const run of runs) {
    if (!run.text) continue;
    const fontSize = run.fontSize || baseFontSizePx;
    const fontStr = buildFontString(fontSize, fontFamily, run.bold, run.italic);

    // Split run text into words, preserving spaces as separators
    const parts = run.text.split(/(\s+)/);
    for (const part of parts) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        tokens.push({ type: 'space', fontStr });
      } else {
        // UAX#14: split at em/en-dashes within words
        const subWords = splitWordsAtDashes([part]);
        for (const sw of subWords) {
          tokens.push({ type: 'word', text: sw, fontStr });
        }
      }
    }
  }

  if (tokens.length === 0) return 0;

  let lines = 1;
  let currentLineWidth = firstLineIndent;
  let firstWordPlaced = false;

  for (const token of tokens) {
    if (token.type === 'space') {
      // Space between words — only count if we have a word on the line
      if (firstWordPlaced) {
        currentLineWidth += getSpaceWidth(token.fontStr) + wordSpacingPx;
      }
      continue;
    }

    // token.type === 'word'
    const wordWidth = measureWordWidth(token.text, token.fontStr);

    if (!firstWordPlaced) {
      if (wordWidth > contentWidth - firstLineIndent) {
        // Long word on first line — break char by char
        const broken = breakWord(token.text, token.fontStr, contentWidth - firstLineIndent, contentWidth);
        lines += broken.lines;
        currentLineWidth = broken.lastLineWidth;
      } else {
        currentLineWidth += wordWidth;
      }
      firstWordPlaced = true;
      continue;
    }

    if (currentLineWidth + wordWidth > contentWidth) {
      if (wordWidth > contentWidth) {
        // Word wider than full line — break it
        lines++;
        const broken = breakWord(token.text, token.fontStr, contentWidth, contentWidth);
        lines += broken.lines;
        currentLineWidth = broken.lastLineWidth;
      } else {
        // Try Spanish hyphenation before wrapping the whole word (unless disabled)
        let hyphenated = false;
        if (!noHyphenation) {
          const available = contentWidth - currentLineWidth;
          const hyphenW = getHyphenWidth(token.fontStr);
          const hpts = getSpanishHyphenPoints(token.text);
          for (let k = hpts.length - 1; k >= 0; k--) {
            const prefix = token.text.slice(0, hpts[k]);
            if (measureWordWidth(prefix, token.fontStr) + hyphenW <= available) {
              const suffix = token.text.slice(hpts[k]);
              lines++;
              currentLineWidth = measureWordWidth(suffix, token.fontStr);
              hyphenated = true;
              break;
            }
          }
        }
        if (!hyphenated) {
          lines++;
          currentLineWidth = wordWidth;
        }
      }
    } else {
      currentLineWidth += wordWidth;
    }
  }

  return lines;
};

// ─── Simple line counter (plain text, single font) ──────────────────

export const countLines = (text, contentWidth, fontString, firstLineIndent = 0, letterSpacingPx = 0, wordSpacingPx = 0, noHyphenation = false) => {
  if (!text || !text.trim() || contentWidth <= 0) return text?.trim() ? 1 : 0;

  const collapsed = collapseWhitespace(text);
  const spaceWidth = getSpaceWidth(fontString) + letterSpacingPx + wordSpacingPx;
  const words = splitWordsAtDashes(collapsed.split(' ').filter(w => w.length > 0));
  if (words.length === 0) return 0;

  let lines = 1;
  let currentLineWidth = firstLineIndent;

  for (let i = 0; i < words.length; i++) {
    let wordWidth = measureWordWidth(words[i], fontString);
    // Add letter-spacing: extra px per inter-character gap
    if (letterSpacingPx && words[i].length > 1) {
      wordWidth += letterSpacingPx * (words[i].length - 1);
    }

    if (i === 0) {
      // First word — check if it even fits on the first line
      if (wordWidth > contentWidth - firstLineIndent) {
        // Word is wider than the line — break it char by char
        const broken = breakWord(words[i], fontString, contentWidth - firstLineIndent, contentWidth, letterSpacingPx);
        lines += broken.lines;
        currentLineWidth = broken.lastLineWidth;
      } else {
        currentLineWidth += wordWidth;
      }
      continue;
    }

    // UAX#14: zero space after dash-ending words (dash is the visual separator)
    const prevEndsDash = words[i - 1].endsWith('\u2014') || words[i - 1].endsWith('\u2013');
    const effectiveSpace = prevEndsDash ? 0 : spaceWidth;
    const widthWithWord = currentLineWidth + effectiveSpace + wordWidth;

    if (widthWithWord > contentWidth) {
      // Word doesn't fit on current line
      if (wordWidth > contentWidth) {
        // Word is wider than a full line — break it
        lines++;
        const broken = breakWord(words[i], fontString, contentWidth, contentWidth, letterSpacingPx);
        lines += broken.lines;
        currentLineWidth = broken.lastLineWidth;
      } else {
        // Try Spanish hyphenation before wrapping the whole word (unless disabled)
        let hyphenated = false;
        if (!noHyphenation) {
          const available = contentWidth - currentLineWidth - effectiveSpace;
          const hyphenW = getHyphenWidth(fontString);
          const hpts = getSpanishHyphenPoints(words[i]);
          for (let k = hpts.length - 1; k >= 0; k--) {
            const prefix = words[i].slice(0, hpts[k]);
            let prefixW = measureWordWidth(prefix, fontString) + hyphenW;
            if (letterSpacingPx && prefix.length > 1) prefixW += letterSpacingPx * (prefix.length - 1);
            if (prefixW <= available) {
              const suffix = words[i].slice(hpts[k]);
              let suffixW = measureWordWidth(suffix, fontString);
              if (letterSpacingPx && suffix.length > 1) suffixW += letterSpacingPx * (suffix.length - 1);
              lines++;
              currentLineWidth = suffixW;
              hyphenated = true;
              break;
            }
          }
        }
        if (!hyphenated) {
          lines++;
          currentLineWidth = wordWidth;
        }
      }
    } else {
      currentLineWidth = widthWithWord;
    }
  }

  return lines;
};

// ─── Line break positions (for inserting <br> into HTML) ────────────
// Same greedy algorithm as countLines, but returns the word index where
// each new line starts. Used by insertHtmlLineBreaks().

/**
 * Get word indices where line breaks occur.
 * @param {string} text - Whitespace-collapsed text
 * @param {number} contentWidth - Available width in px
 * @param {string} fontString - CSS font string
 * @param {number} firstLineIndent - First line indent in px
 * @param {number} letterSpacingPx
 * @param {number} wordSpacingPx
 * @returns {number[]} Array of word indices that START a new line (e.g. [0, 8, 15] = 3 lines)
 */
export const getLineBreakPositions = (text, contentWidth, fontString, firstLineIndent = 0, letterSpacingPx = 0, wordSpacingPx = 0) => {
  if (!text || !text.trim() || contentWidth <= 0) return [0];

  const collapsed = collapseWhitespace(text);
  const spaceWidth = getSpaceWidth(fontString) + letterSpacingPx + wordSpacingPx;
  const words = splitWordsAtDashes(collapsed.split(' ').filter(w => w.length > 0));
  if (words.length === 0) return [0];

  const lineStarts = [0]; // First line always starts at word 0
  let currentLineWidth = firstLineIndent;

  for (let i = 0; i < words.length; i++) {
    let wordWidth = measureWordWidth(words[i], fontString);
    if (letterSpacingPx && words[i].length > 1) {
      wordWidth += letterSpacingPx * (words[i].length - 1);
    }

    if (i === 0) {
      currentLineWidth += wordWidth;
      continue;
    }

    // UAX#14: zero space after dash-ending words
    const prevEndsDash = words[i - 1].endsWith('\u2014') || words[i - 1].endsWith('\u2013');
    const effectiveSpace = prevEndsDash ? 0 : spaceWidth;
    const widthWithWord = currentLineWidth + effectiveSpace + wordWidth;

    if (widthWithWord > contentWidth) {
      lineStarts.push(i);
      currentLineWidth = wordWidth;
    } else {
      currentLineWidth = widthWithWord;
    }
  }

  return lineStarts;
};

/**
 * Get line break positions for text with mixed inline styles (runs).
 * Same greedy algorithm as countLinesFromRuns, returns word indices.
 */
export const getLineBreakPositionsFromRuns = (runs, contentWidth, baseFontSizePx, fontFamily, firstLineIndent = 0, wordSpacingPx = 0) => {
  if (!runs || runs.length === 0 || contentWidth <= 0) return [0];

  // Flatten runs into word tokens (skip spaces)
  const wordTokens = [];
  for (const run of runs) {
    if (!run.text) continue;
    const fontSize = run.fontSize || baseFontSizePx;
    const fontStr = buildFontString(fontSize, fontFamily, run.bold, run.italic);
    const parts = run.text.split(/(\s+)/);
    for (const part of parts) {
      if (!part || /^\s+$/.test(part)) continue;
      // UAX#14: split at em/en-dashes within words
      const subWords = splitWordsAtDashes([part]);
      for (const sw of subWords) {
        wordTokens.push({ text: sw, fontStr });
      }
    }
  }

  if (wordTokens.length === 0) return [0];

  const lineStarts = [0];
  let currentLineWidth = firstLineIndent;
  let firstWordPlaced = false;

  for (let i = 0; i < wordTokens.length; i++) {
    const token = wordTokens[i];
    const wordWidth = measureWordWidth(token.text, token.fontStr);
    const spaceWidth = getSpaceWidth(token.fontStr) + wordSpacingPx;

    if (!firstWordPlaced) {
      currentLineWidth += wordWidth;
      firstWordPlaced = true;
      continue;
    }

    // UAX#14: zero space after dash-ending words
    const prevEndsDash = i > 0 && (wordTokens[i - 1].text.endsWith('\u2014') || wordTokens[i - 1].text.endsWith('\u2013'));
    const effectiveSpace = prevEndsDash ? 0 : spaceWidth;

    if (currentLineWidth + effectiveSpace + wordWidth > contentWidth) {
      lineStarts.push(i);
      currentLineWidth = wordWidth;
    } else {
      currentLineWidth += effectiveSpace + wordWidth;
    }
  }

  return lineStarts;
};

// Re-export KP function so textLayoutEngine can import it from here
export { getLineBreakPositionsKP };

// ─── Hyphenation quality analysis ───────────────────────────────────

/**
 * Analyse hyphenation quality for a plain-text paragraph.
 *
 * Returns:
 *   maxConsecutive  — longest run of consecutive lines ending with a hyphen
 *   lastLineHyphen  — true if the paragraph's last line ends with a hyphen
 *   totalHyphens    — total number of hyphenated line-breaks in the paragraph
 *
 * Used by scoreCandidate() in paginateChapters.js to penalise:
 *   - 3+ consecutive hyphenated lines  (+150 each beyond the 2nd)
 *   - hyphen on the last line of a chunk (+300)
 *
 * @param {string} text           - Whitespace-collapsed plain text
 * @param {number} contentWidth   - Effective line width in px
 * @param {string} fontString     - CSS font string
 * @param {number} firstLineIndent - First-line indent in px
 * @returns {{ maxConsecutive: number, lastLineHyphen: boolean, totalHyphens: number }}
 */
export const countHyphenationMetrics = (text, contentWidth, fontString, firstLineIndent = 0) => {
  if (!text || !text.trim() || contentWidth <= 0) {
    return { maxConsecutive: 0, lastLineHyphen: false, totalHyphens: 0 };
  }

  const collapsed = collapseWhitespace(text);
  const spaceWidth = getSpaceWidth(fontString);
  const words = collapsed.split(' ').filter(w => w.length > 0);
  if (words.length === 0) return { maxConsecutive: 0, lastLineHyphen: false, totalHyphens: 0 };

  // lineEndsWithHyphen[i] = true if line i was closed via a hyphen break
  const lineEndsWithHyphen = [];
  let currentLineWidth = firstLineIndent;

  for (let i = 0; i < words.length; i++) {
    const wordWidth = measureWordWidth(words[i], fontString);

    if (i === 0) {
      currentLineWidth += wordWidth;
      continue;
    }

    const widthWithWord = currentLineWidth + spaceWidth + wordWidth;

    if (widthWithWord > contentWidth) {
      if (wordWidth > contentWidth) {
        // Character-break — not a hyphen break
        lineEndsWithHyphen.push(false);
        currentLineWidth = wordWidth % contentWidth; // approximate
      } else {
        // Try Spanish hyphenation
        const available = contentWidth - currentLineWidth - spaceWidth;
        const hyphenW = getHyphenWidth(fontString);
        const hpts = getSpanishHyphenPoints(words[i]);
        let hyphenated = false;
        for (let k = hpts.length - 1; k >= 0; k--) {
          const prefix = words[i].slice(0, hpts[k]);
          if (measureWordWidth(prefix, fontString) + hyphenW <= available) {
            lineEndsWithHyphen.push(true);
            const suffix = words[i].slice(hpts[k]);
            currentLineWidth = measureWordWidth(suffix, fontString);
            hyphenated = true;
            break;
          }
        }
        if (!hyphenated) {
          lineEndsWithHyphen.push(false);
          currentLineWidth = wordWidth;
        }
      }
    } else {
      currentLineWidth = widthWithWord;
    }
  }

  // Analyse the collected data
  let maxConsecutive = 0;
  let currentRun = 0;
  let totalHyphens = 0;
  for (const h of lineEndsWithHyphen) {
    if (h) {
      currentRun++;
      totalHyphens++;
      if (currentRun > maxConsecutive) maxConsecutive = currentRun;
    } else {
      currentRun = 0;
    }
  }

  // Last "line" is the natural end — never a hyphen, so lineEndsWithHyphen
  // covers all but the last line. The last LINE of the chunk is the content
  // after the last word-wrap — it ends naturally (not hyphenated).
  // However, if the very last word-wrap was a hyphen, the LAST RENDERED LINE
  // of the chunk starts with a suffix — that's fine. What we care about is
  // whether the last LINE of the CHUNK (what the reader sees at bottom) ends
  // with a hyphen. That equals lineEndsWithHyphen[last] if > 0 entries.
  const lastLineHyphen = lineEndsWithHyphen.length > 0
    ? lineEndsWithHyphen[lineEndsWithHyphen.length - 1]
    : false;

  return { maxConsecutive, lastLineHyphen, totalHyphens };
};
