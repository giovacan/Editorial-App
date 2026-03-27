/**
 * textLayoutEngine.js
 *
 * Deterministic text measurement engine using Canvas 2D.
 * Replaces DOM-based measureDiv.offsetHeight with pure math.
 *
 * Architecture:
 *   - Canvas measureText() for word widths (no DOM layout)
 *   - Inline style runs: <strong>, <em>, <span style="font-size:18px"> each measured
 *     with their own font properties
 *   - Whitespace collapsing: replicates HTML behavior (multiple spaces → one)
 *   - Block elements: <img>, <table>, <pre> treated as fixed-height blocks
 *   - Algorithmic line breaking (greedy, word-boundary)
 *   - Height = lines * lineHeightPx (pure arithmetic)
 *
 * Guarantees:
 *   - Same input → same output on any browser
 *   - No offsetHeight, getBoundingClientRect, clientHeight, scrollHeight
 *   - No layout thrashing, no sub-pixel rounding from DOM
 */

import { initKnuthPlass, countLinesKP, countLinesFromRunsKP, getLineBreakPositionsKP } from './knuthPlassAdapter.js';

// ─── Canvas singleton ───────────────────────────────────────────────

let _canvas = null;
let _ctx = null;

const getCtx = () => {
  if (!_ctx) {
    if (typeof OffscreenCanvas !== 'undefined') {
      _canvas = new OffscreenCanvas(1, 1);
    } else {
      _canvas = document.createElement('canvas');
    }
    _ctx = _canvas.getContext('2d');
  }
  return _ctx;
};

// ─── Font loading guard ─────────────────────────────────────────────

// Per-font readiness map — key is normalized font family name.
// Prevents stale Canvas measurements when the user switches fonts mid-session.
const _fontsReady = new Map();

/**
 * Wait until the requested font is loaded before Canvas measurement starts.
 * Tracks readiness per font family — switching fonts correctly invalidates caches.
 *
 * @param {string} [fontFamily] - Font to preload (e.g. 'Lato, sans-serif')
 * @param {number} [fontSize=12] - Font size in pt for the preload request
 */
export const ensureFontsReady = async (fontFamily = '', fontSize = 12) => {
  const key = fontFamily.toLowerCase().split(',')[0].trim();
  if (_fontsReady.get(key)) return;

  if (typeof document !== 'undefined' && document.fonts) {
    // Race font loading against a timeout — some system fonts (Georgia, serif)
    // have no @font-face and document.fonts.load() may hang indefinitely.
    const timeout = new Promise(resolve => setTimeout(resolve, 2000));
    try {
      await Promise.race([
        (async () => {
          if (fontFamily) {
            try { await document.fonts.load(`${fontSize}pt ${fontFamily}`); } catch (_) {}
          }
          await document.fonts.ready;
        })(),
        timeout
      ]);
    } catch (_) {
      // Font loading failed or timed out — proceed with whatever is available
    }
  }

  _fontsReady.set(key, true);

  // CRITICAL: always clear all caches when a new font is registered.
  // Mixed cache entries from previous fonts produce wrong line-break measurements.
  _wordWidthCache.clear();
  _spaceWidthCache.clear();
  _paragraphLayoutCache.clear();
};

// ─── Font string builder ────────────────────────────────────────────

const buildFontString = (fontSize, fontFamily, bold = false, italic = false) => {
  const style = italic ? 'italic' : 'normal';
  const weight = bold ? 'bold' : 'normal';
  return `${style} ${weight} ${fontSize}px ${fontFamily}`;
};

// ─── Word width cache ───────────────────────────────────────────────

const _wordWidthCache = new Map();

// ─── Paragraph layout cache ─────────────────────────────────────────
// Key: "fontString|width|indent|textHash" → { lines, height }
// Avoids re-measuring identical paragraphs during editing.

const _paragraphLayoutCache = new Map();
const MAX_PARAGRAPH_CACHE = 2000;
const KP_WORD_THRESHOLD = 200; // Fall back to greedy for paragraphs with >200 words

const getParagraphCacheKey = (text, fontString, contentWidth, indentPx, wordSpacingPx = 0) => {
  // Use text length + first/last 40 chars as hash (fast, collision-resistant for real text)
  const textKey = text.length <= 80
    ? text
    : text.slice(0, 40) + '|' + text.length + '|' + text.slice(-40);
  return `${fontString}|${contentWidth}|${indentPx}|${wordSpacingPx}|${textKey}`;
};

// ─── Sub-pixel normalization ────────────────────────────────────────

const normalizeWidth = (w) => Math.round(w * 1000) / 1000;

// ─── Core: measure text width ───────────────────────────────────────

const measureTextWidth = (text, fontString) => {
  const ctx = getCtx();
  ctx.font = fontString;
  return normalizeWidth(ctx.measureText(text).width);
};

// ─── Core: measure single word width (cached) ───────────────────────

const measureWordWidth = (word, fontString) => {
  const key = fontString + '|' + word;
  if (_wordWidthCache.has(key)) return _wordWidthCache.get(key);
  const w = measureTextWidth(word, fontString);
  _wordWidthCache.set(key, w);
  return w;
};

// ─── Space width cache ──────────────────────────────────────────────

const _spaceWidthCache = new Map();

const getSpaceWidth = (fontString) => {
  if (_spaceWidthCache.has(fontString)) return _spaceWidthCache.get(fontString);
  const w = measureTextWidth(' ', fontString);
  _spaceWidthCache.set(fontString, w);
  return w;
};

// ─── Whitespace collapsing ──────────────────────────────────────────
// HTML collapses consecutive whitespace into a single space.
// This replicates that behavior for plain text extracted from DOM.

const collapseWhitespace = (text) => {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
};

// ─── Inline text runs extractor ─────────────────────────────────────
// Walks the DOM tree of an element and produces a flat array of "runs":
// each run = { text, bold, italic, fontSize }
// This handles <strong>, <em>, <b>, <i>, <span style="font-size:...">

/**
 * @typedef {Object} TextRun
 * @property {string} text - The text content (whitespace-collapsed)
 * @property {boolean} bold - Whether this run is bold
 * @property {boolean} italic - Whether this run is italic
 * @property {number|null} fontSize - Overridden font size in px, or null for inherited
 */

/**
 * Extract styled text runs from a DOM element.
 * Walks the tree depth-first, inheriting bold/italic/fontSize from ancestors.
 *
 * @param {HTMLElement} el - The DOM element to walk
 * @param {Object} inherited - Inherited style context
 * @returns {TextRun[]}
 */
const extractTextRuns = (el, inherited = { bold: false, italic: false, fontSize: null }) => {
  const runs = [];

  for (const node of el.childNodes) {
    if (node.nodeType === 3) {
      // Text node
      const text = node.textContent;
      if (text && /\S/.test(text)) {
        runs.push({
          text: collapseWhitespace(text),
          bold: inherited.bold,
          italic: inherited.italic,
          fontSize: inherited.fontSize
        });
      } else if (text && /\s/.test(text) && runs.length > 0) {
        // Whitespace-only text node between elements — represents a space
        runs.push({
          text: ' ',
          bold: inherited.bold,
          italic: inherited.italic,
          fontSize: inherited.fontSize
        });
      }
      continue;
    }

    if (node.nodeType !== 1) continue; // Skip non-element nodes

    const tag = node.tagName;

    // <br> acts as a word separator (space) for measurement purposes
    if (tag === 'BR') {
      if (runs.length > 0) {
        runs.push({ text: ' ', bold: inherited.bold, italic: inherited.italic, fontSize: inherited.fontSize });
      }
      continue;
    }

    // Skip block-level children (they'll be handled separately)
    if (BLOCK_TAGS.has(tag)) continue;

    // Determine style changes
    let bold = inherited.bold;
    let italic = inherited.italic;
    let fontSize = inherited.fontSize;

    if (tag === 'STRONG' || tag === 'B') bold = true;
    if (tag === 'EM' || tag === 'I') italic = true;

    // Check inline style for font-size
    if (node.style?.fontSize) {
      const parsed = parseFloat(node.style.fontSize);
      if (!isNaN(parsed)) {
        const unit = (node.style.fontSize || '').replace(/[\d.]/g, '');
        if (unit === 'px') fontSize = parsed;
        else if (unit === 'pt') fontSize = parsed * PX_PER_PT;
        else if (unit === 'em' && inherited.fontSize) fontSize = parsed * inherited.fontSize;
      }
    }

    // Check for bold via style
    if (node.style?.fontWeight === 'bold' || parseInt(node.style?.fontWeight) >= 700) bold = true;
    if (node.style?.fontStyle === 'italic') italic = true;

    const childRuns = extractTextRuns(node, { bold, italic, fontSize });
    runs.push(...childRuns);
  }

  return runs;
};

// ─── Block element detection ────────────────────────────────────────

const BLOCK_TAGS = new Set([
  'DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'UL', 'OL', 'LI', 'TABLE', 'PRE',
  'FIGURE', 'FIGCAPTION', 'SECTION', 'ARTICLE',
  'HEADER', 'FOOTER', 'NAV', 'MAIN', 'ASIDE'
]);

const REPLACED_TAGS = new Set(['IMG', 'VIDEO', 'CANVAS', 'SVG', 'IFRAME']);

// ─── Line breaker with runs ─────────────────────────────────────────

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
const countLinesFromRuns = (runs, contentWidth, baseFontSizePx, fontFamily, firstLineIndent = 0, wordSpacingPx = 0, noHyphenation = false) => {
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
        tokens.push({ type: 'word', text: part, fontStr });
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
const breakWord = (word, fontString, availableFirstLine, fullLineWidth, letterSpacingPx = 0) => {
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
};

// ─── Initialize Knuth-Plass adapter with our measurement functions ──
initKnuthPlass(measureWordWidth, getSpaceWidth, buildFontString, breakWord);

// ─── Simple line counter (plain text, single font) ──────────────────

const countLines = (text, contentWidth, fontString, firstLineIndent = 0, letterSpacingPx = 0, wordSpacingPx = 0, noHyphenation = false) => {
  if (!text || !text.trim() || contentWidth <= 0) return text?.trim() ? 1 : 0;

  const collapsed = collapseWhitespace(text);
  const spaceWidth = getSpaceWidth(fontString) + letterSpacingPx + wordSpacingPx;
  const words = collapsed.split(' ').filter(w => w.length > 0);
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

    const widthWithWord = currentLineWidth + spaceWidth + wordWidth;

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
          const available = contentWidth - currentLineWidth - spaceWidth;
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
const getLineBreakPositions = (text, contentWidth, fontString, firstLineIndent = 0, letterSpacingPx = 0, wordSpacingPx = 0) => {
  if (!text || !text.trim() || contentWidth <= 0) return [0];

  const collapsed = collapseWhitespace(text);
  const spaceWidth = getSpaceWidth(fontString) + letterSpacingPx + wordSpacingPx;
  const words = collapsed.split(' ').filter(w => w.length > 0);
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

    const widthWithWord = currentLineWidth + spaceWidth + wordWidth;

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
const getLineBreakPositionsFromRuns = (runs, contentWidth, baseFontSizePx, fontFamily, firstLineIndent = 0, wordSpacingPx = 0) => {
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
      wordTokens.push({ text: part, fontStr });
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

    if (currentLineWidth + spaceWidth + wordWidth > contentWidth) {
      lineStarts.push(i);
      currentLineWidth = wordWidth;
    } else {
      currentLineWidth += spaceWidth + wordWidth;
    }
  }

  return lineStarts;
};

// ─── HTML text extractor ────────────────────────────────────────────

const parseEmValue = (value) => {
  if (!value) return 0;
  const num = parseFloat(value);
  if (isNaN(num)) return 0;
  if (value.includes('em')) return num;
  return 0;
};

const extractStyles = (style) => ({
  fontSize: parseFloat(style.fontSize) || null,
  fontSizeUnit: (style.fontSize || '').replace(/[\d.]/g, '') || 'pt',
  lineHeight: parseFloat(style.lineHeight) || null,
  fontWeight: style.fontWeight || 'normal',
  fontStyle: style.fontStyle || 'normal',
  textIndent: parseEmValue(style.textIndent),
  marginTop: parseFloat(style.marginTop) || 0,
  marginTopUnit: (style.marginTop || '').replace(/[\d.-]/g, '') || 'px',
  marginBottom: parseFloat(style.marginBottom) || 0,
  marginBottomUnit: (style.marginBottom || '').replace(/[\d.-]/g, '') || 'px',
  paddingTop: parseFloat(style.paddingTop) || 0,
  paddingBottom: parseFloat(style.paddingBottom) || 0,
  paddingLeft: parseFloat(style.paddingLeft) || 0,
  paddingRight: parseFloat(style.paddingRight) || 0,
  marginLeft: parseFloat(style.marginLeft) || 0,
  marginLeftUnit: (style.marginLeft || '').replace(/[\d.-]/g, '') || 'px',
  marginRight: parseFloat(style.marginRight) || 0,
  marginRightUnit: (style.marginRight || '').replace(/[\d.-]/g, '') || 'px',
  borderLeftWidth: parseFloat(style.borderLeftWidth) || 0,
  letterSpacing: parseFloat(style.letterSpacing) || 0,
  letterSpacingUnit: (style.letterSpacing || '').replace(/[\d.-]/g, '') || 'px',
  wordSpacing: parseFloat(style.wordSpacing) || 0,
  wordSpacingUnit: (style.wordSpacing || '').replace(/[\d.-]/g, '') || 'px',
  display: style.display || '',
  minHeight: parseFloat(style.minHeight) || 0,
  minHeightUnit: (style.minHeight || '').replace(/[\d.-]/g, '') || 'px',
});

/**
 * Worker-safe: parse a CSS inline style string into the same object shape
 * as extractStyles(el.style). Used when document is unavailable (Web Worker).
 */
const parseStyleString = (cssText) => {
  const get = (prop) => {
    const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i');
    return (cssText || '').match(re)?.[1]?.trim() || '';
  };
  return {
    fontSize: parseFloat(get('font-size')) || null,
    fontSizeUnit: (get('font-size') || '').replace(/[\d.]/g, '') || 'pt',
    lineHeight: parseFloat(get('line-height')) || null,
    fontWeight: get('font-weight') || 'normal',
    fontStyle: get('font-style') || 'normal',
    textIndent: parseEmValue(get('text-indent')),
    marginTop: parseFloat(get('margin-top')) || 0,
    marginTopUnit: (get('margin-top') || '').replace(/[\d.-]/g, '') || 'px',
    marginBottom: parseFloat(get('margin-bottom')) || 0,
    marginBottomUnit: (get('margin-bottom') || '').replace(/[\d.-]/g, '') || 'px',
    paddingTop: parseFloat(get('padding-top')) || 0,
    paddingBottom: parseFloat(get('padding-bottom')) || 0,
    paddingLeft: parseFloat(get('padding-left')) || 0,
    paddingRight: parseFloat(get('padding-right')) || 0,
    marginLeft: parseFloat(get('margin-left')) || 0,
    marginLeftUnit: (get('margin-left') || '').replace(/[\d.-]/g, '') || 'px',
    marginRight: parseFloat(get('margin-right')) || 0,
    marginRightUnit: (get('margin-right') || '').replace(/[\d.-]/g, '') || 'px',
    borderLeftWidth: parseFloat(get('border-left-width')) || 0,
    letterSpacing: parseFloat(get('letter-spacing')) || 0,
    letterSpacingUnit: (get('letter-spacing') || '').replace(/[\d.-]/g, '') || 'px',
    wordSpacing: parseFloat(get('word-spacing')) || 0,
    wordSpacingUnit: (get('word-spacing') || '').replace(/[\d.-]/g, '') || 'px',
    display: get('display') || '',
    minHeight: parseFloat(get('min-height')) || 0,
    minHeightUnit: (get('min-height') || '').replace(/[\d.-]/g, '') || 'px',
  };
};

/**
 * Worker-safe: tokenize inline HTML into text runs without DOM.
 * Handles <strong>, <b>, <em>, <i>, <span style="...">, <br>.
 */
const extractTextRunsFromHtml = (html, inherited = { bold: false, italic: false, fontSize: null }) => {
  const runs = [];
  let i = 0;
  const tagStack = [{ bold: inherited.bold, italic: inherited.italic, fontSize: inherited.fontSize }];
  const pushText = (text) => {
    if (!text) return;
    const collapsed = text.replace(/\s+/g, ' ');
    if (!collapsed.trim() && runs.length === 0) return;
    const top = tagStack[tagStack.length - 1];
    if (!collapsed.trim()) {
      runs.push({ text: ' ', bold: top.bold, italic: top.italic, fontSize: top.fontSize });
    } else {
      runs.push({ text: collapsed, bold: top.bold, italic: top.italic, fontSize: top.fontSize });
    }
  };
  while (i < html.length) {
    if (html[i] !== '<') {
      let j = i;
      while (j < html.length && html[j] !== '<') j++;
      pushText(html.slice(i, j));
      i = j;
      continue;
    }
    const end = html.indexOf('>', i);
    if (end === -1) { i++; continue; }
    const tag = html.slice(i, end + 1);
    const tagNameMatch = tag.match(/^<\/?([a-zA-Z][^\s/>]*)/);
    const tagName = tagNameMatch?.[1]?.toUpperCase() || '';
    const isClose = tag.startsWith('</');
    const isSelfClose = tag.endsWith('/>');

    if (tagName === 'BR') {
      const top = tagStack[tagStack.length - 1];
      if (runs.length > 0) runs.push({ text: ' ', bold: top.bold, italic: top.italic, fontSize: top.fontSize });
    } else if (!isClose && !isSelfClose && !BLOCK_TAGS.has(tagName)) {
      const top = tagStack[tagStack.length - 1];
      let bold = top.bold;
      let italic = top.italic;
      let fontSize = top.fontSize;
      if (tagName === 'STRONG' || tagName === 'B') bold = true;
      if (tagName === 'EM' || tagName === 'I') bold = false, italic = true;
      const styleMatch = tag.match(/\bstyle="([^"]*)"/i);
      if (styleMatch) {
        const css = styleMatch[1];
        const fsMatch = css.match(/font-size:\s*([\d.]+)(px|pt|em)/i);
        if (fsMatch) {
          const val = parseFloat(fsMatch[1]);
          const unit = fsMatch[2].toLowerCase();
          if (unit === 'px') fontSize = val;
          else if (unit === 'pt') fontSize = val * PX_PER_PT;
          else if (unit === 'em' && top.fontSize) fontSize = val * top.fontSize;
        }
        if (/font-weight:\s*(bold|[7-9]\d\d)/i.test(css)) bold = true;
        if (/font-style:\s*italic/i.test(css)) italic = true;
      }
      tagStack.push({ bold, italic, fontSize });
    } else if (isClose && !BLOCK_TAGS.has(tagName) && tagStack.length > 1) {
      tagStack.pop();
    }
    i = end + 1;
  }
  return runs;
};

/**
 * Worker-safe: tokenize multi-element HTML string into element descriptors.
 * Used as fallback for parseMultiElementHtml when document is unavailable.
 */
const parseMultiElementHtmlWorker = (html) => {
  if (!html || !html.trim()) return [];
  const elements = [];
  let i = 0;
  while (i < html.length) {
    // Skip whitespace between elements
    while (i < html.length && /\s/.test(html[i])) i++;
    if (i >= html.length) break;
    if (html[i] !== '<') {
      // Bare text node
      let j = i;
      while (j < html.length && html[j] !== '<') j++;
      const text = html.slice(i, j).replace(/\s+/g, ' ').trim();
      if (text) elements.push({ text, tag: 'P', styles: parseStyleString(''), runs: null, innerHTML: text });
      i = j;
      continue;
    }
    // Find opening tag
    const tagEnd = html.indexOf('>', i);
    if (tagEnd === -1) break;
    const openTag = html.slice(i, tagEnd + 1);
    const tagNameMatch = openTag.match(/^<([a-zA-Z][^\s/>]*)/);
    if (!tagNameMatch) { i = tagEnd + 1; continue; }
    const tagName = tagNameMatch[1].toUpperCase();
    // Self-closing
    if (openTag.endsWith('/>')) { i = tagEnd + 1; continue; }
    // Find matching close tag
    const closeTag = `</${tagNameMatch[1]}`;
    let depth = 1;
    let j = tagEnd + 1;
    while (j < html.length && depth > 0) {
      if (html[j] !== '<') { j++; continue; }
      const end2 = html.indexOf('>', j);
      if (end2 === -1) break;
      const t = html.slice(j, end2 + 1);
      const tn = t.match(/^<\/?([a-zA-Z][^\s/>]*)/)?.[1]?.toUpperCase();
      if (tn === tagName) {
        if (t.startsWith('</')) depth--;
        else if (!t.endsWith('/>')) depth++;
      }
      j = end2 + 1;
    }
    const outerHtml = html.slice(i, j);
    const innerHtml = outerHtml.slice(tagEnd - i + 1, outerHtml.lastIndexOf('<'));
    const styleMatch = openTag.match(/\bstyle="([^"]*)"/i);
    const cssText = styleMatch ? styleMatch[1] : '';
    const styles = parseStyleString(cssText);
    // For text extraction: strip tags
    const text = outerHtml.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    const runs = extractTextRunsFromHtml(innerHtml, {
      bold: styles.fontWeight === 'bold' || parseInt(styles.fontWeight) >= 700,
      italic: styles.fontStyle === 'italic',
      fontSize: styles.fontSize ? (styles.fontSizeUnit === 'pt' ? styles.fontSize * PX_PER_PT : styles.fontSize) : null
    });
    elements.push({ text, tag: tagName, styles, runs, innerHTML: innerHtml });
    i = j;
  }
  return elements;
};

const parseHtmlElement = (html) => {
  if (!html || !html.trim()) return null;

  const div = document.createElement('div');
  div.innerHTML = html;
  const el = div.firstElementChild;
  if (!el) return { text: div.textContent || '', tag: 'P', styles: {}, runs: null };

  const tag = el.tagName;
  const styles = extractStyles(el.style);
  const text = el.textContent || '';

  // Extract inline text runs for mixed-style measurement
  const isBold = styles.fontWeight === 'bold' || parseInt(styles.fontWeight) >= 700;
  const isItalic = styles.fontStyle === 'italic';
  const runs = extractTextRuns(el, {
    bold: isBold,
    italic: isItalic,
    fontSize: styles.fontSize ? resolveSize(styles.fontSize, styles.fontSizeUnit, 0) : null
  });

  return { text, tag, styles, runs, innerHTML: el.innerHTML };
};

// ─── Multi-element HTML parser ──────────────────────────────────────

const parseMultiElementHtml = (html) => {
  if (!html || !html.trim()) return [];

  // Worker-safe path: no DOM available
  if (typeof document === 'undefined') {
    return parseMultiElementHtmlWorker(html);
  }

  const div = document.createElement('div');
  div.innerHTML = html;
  const children = Array.from(div.children);

  if (children.length === 0) {
    const text = div.textContent || '';
    if (!text.trim()) return [];
    return [{ text, tag: 'P', styles: {}, runs: null, innerHTML: text }];
  }

  return children.map(el => {
    const tag = el.tagName;
    const styles = extractStyles(el.style);
    const text = el.textContent || '';

    const isBold = styles.fontWeight === 'bold' || parseInt(styles.fontWeight) >= 700;
    const isItalic = styles.fontStyle === 'italic';
    const runs = extractTextRuns(el, {
      bold: isBold,
      italic: isItalic,
      fontSize: styles.fontSize ? resolveSize(styles.fontSize, styles.fontSizeUnit, 0) : null
    });

    return { text, tag, styles, runs, innerHTML: el.innerHTML };
  });
};

// ─── Unit conversion helpers ────────────────────────────────────────

const PX_PER_PT = 96 / 72;

const resolveSize = (value, unit, baseFontSizePx) => {
  if (!value) return 0;
  switch (unit) {
    case 'pt': return value * PX_PER_PT;
    case 'em': return value * baseFontSizePx;
    case 'px': return value;
    default: return value;
  }
};

// ─── Element height calculator ──────────────────────────────────────

const calculateElementHeight = (parsed, layoutCtx) => {
  if (!parsed) return 0;

  const { baseFontSizePx, baseLineHeight, contentWidth, fontFamily, widthSlack = 0, noHyphenation = false } = layoutCtx;
  const { text, styles, tag, runs } = parsed;

  // --- Block replaced elements (img, video, etc.) ---
  if (REPLACED_TAGS.has(tag)) {
    // Use explicit height/width from style, or a sensible default
    const h = styles.minHeight
      ? resolveSize(styles.minHeight, styles.minHeightUnit, baseFontSizePx)
      : baseFontSizePx * baseLineHeight * 4; // default: 4 lines
    const marginTopPx = resolveSize(styles.marginTop, styles.marginTopUnit, baseFontSizePx);
    const marginBottomPx = resolveSize(styles.marginBottom, styles.marginBottomUnit, baseFontSizePx);
    return marginTopPx + h + marginBottomPx;
  }

  // --- Preformatted text (count newlines) ---
  if (tag === 'PRE') {
    let elFontSizePx = baseFontSizePx;
    if (styles.fontSize) elFontSizePx = resolveSize(styles.fontSize, styles.fontSizeUnit, baseFontSizePx);
    const elLineHeight = styles.lineHeight || baseLineHeight;
    const lineHeightPx = elFontSizePx * elLineHeight;
    const lineCount = (text || '').split('\n').length;
    const marginTopPx = resolveSize(styles.marginTop, styles.marginTopUnit, elFontSizePx);
    const marginBottomPx = resolveSize(styles.marginBottom, styles.marginBottomUnit, elFontSizePx);
    const paddingV = (styles.paddingTop || 0) + (styles.paddingBottom || 0);
    return marginTopPx + paddingV + lineCount * lineHeightPx + marginBottomPx;
  }

  // --- Table: estimate based on row count ---
  if (tag === 'TABLE') {
    const tableHtml = parsed.innerHTML || '';
    const rows = (tableHtml.match(/<tr[\s>]/gi) || []).length || 1;
    const lineHeightPx = baseFontSizePx * baseLineHeight;
    const marginTopPx = resolveSize(styles.marginTop, styles.marginTopUnit, baseFontSizePx);
    const marginBottomPx = resolveSize(styles.marginBottom, styles.marginBottomUnit, baseFontSizePx);
    return marginTopPx + rows * lineHeightPx * 1.5 + marginBottomPx;
  }

  // --- HR ---
  if (tag === 'HR') {
    const marginTopPx = resolveSize(styles.marginTop, styles.marginTopUnit, baseFontSizePx);
    const marginBottomPx = resolveSize(styles.marginBottom, styles.marginBottomUnit, baseFontSizePx);
    return (marginTopPx || baseFontSizePx) + 1 + (marginBottomPx || baseFontSizePx);
  }

  // --- BR ---
  if (tag === 'BR') return baseFontSizePx * baseLineHeight;

  // --- Empty element with no text ---
  if (!text?.trim()) {
    // Elements with display:flex + min-height (like fullPage title)
    if (styles.display === 'flex' && styles.minHeight) {
      return resolveSize(styles.minHeight, styles.minHeightUnit, baseFontSizePx);
    }
    return 0;
  }

  // --- Normal text element (P, H1-H6, BLOCKQUOTE, LI, etc.) ---

  // Resolve font size for this element
  let elFontSizePx = baseFontSizePx;
  if (styles.fontSize) {
    elFontSizePx = resolveSize(styles.fontSize, styles.fontSizeUnit, baseFontSizePx);
  }

  // Resolve line height — use the ceiled lineHeightPx from layoutCtx when available
  // to match the contentHeight calculation in usePagination (Math.ceil consistency)
  let elLineHeight = baseLineHeight;
  if (styles.lineHeight) {
    elLineHeight = styles.lineHeight;
  }
  const hasCustomFont = styles.fontSize || styles.lineHeight;
  const lineHeightPx = hasCustomFont
    ? Math.ceil(elFontSizePx * elLineHeight)
    : (layoutCtx.lineHeightPx || Math.ceil(elFontSizePx * elLineHeight));

  // Resolve indentation
  const indentPx = styles.textIndent ? styles.textIndent * elFontSizePx : 0;

  // Resolve letter-spacing (CSS letter-spacing adds px between each character)
  const letterSpacingPx = styles.letterSpacing
    ? resolveSize(styles.letterSpacing, styles.letterSpacingUnit, elFontSizePx)
    : 0;

  // Resolve word-spacing (extra px added to each inter-word space)
  const wordSpacingPx = styles.wordSpacing
    ? resolveSize(styles.wordSpacing, styles.wordSpacingUnit, elFontSizePx)
    : 0;

  // Resolve horizontal padding/margin that reduce available width
  const paddingH = (styles.paddingLeft || 0) + (styles.paddingRight || 0);
  const marginLPx = resolveSize(styles.marginLeft, styles.marginLeftUnit, elFontSizePx);
  const marginRPx = resolveSize(styles.marginRight, styles.marginRightUnit, elFontSizePx);
  const borderLeft = styles.borderLeftWidth || 0;
  // Heading elements: bold fonts have higher per-character measurement variance
  const headingSlack = /^H[1-6]$/.test(tag) ? 3 : 0;
  const availableWidth = contentWidth - paddingH - marginLPx - marginRPx - borderLeft - widthSlack - headingSlack;

  // Count lines — use runs if available (handles inline bold/italic/size),
  // fall back to plain text measurement
  let lineCount;

  const isBold = styles.fontWeight === 'bold' || parseInt(styles.fontWeight) >= 700;
  const isItalic = styles.fontStyle === 'italic';
  const fontString = buildFontString(elFontSizePx, fontFamily, isBold, isItalic);

  // Check paragraph cache first
  const collapsedText = collapseWhitespace(text);
  const cacheKey = getParagraphCacheKey(collapsedText, fontString, availableWidth, indentPx, wordSpacingPx) + (noHyphenation ? '|noHyph' : '');
  const cached = _paragraphLayoutCache.get(cacheKey);
  if (cached !== undefined) {
    lineCount = cached;
  } else {
    const wordCount = collapsedText.split(' ').length;
    const useKP = wordCount <= KP_WORD_THRESHOLD;

    if (runs && runs.length > 0 && hasStyledRuns(runs)) {
      // Mixed inline styles — try Knuth-Plass optimal, fall back to greedy
      const kp = useKP
        ? countLinesFromRunsKP(runs, availableWidth, elFontSizePx, fontFamily, indentPx, wordSpacingPx)
        : null;
      lineCount = kp !== null ? kp : countLinesFromRuns(runs, availableWidth, elFontSizePx, fontFamily, indentPx, wordSpacingPx, noHyphenation);
    } else {
      // Uniform font — try Knuth-Plass optimal, fall back to greedy
      const kp = useKP
        ? countLinesKP(collapsedText, availableWidth, fontString, indentPx, letterSpacingPx, wordSpacingPx)
        : null;
      lineCount = kp !== null ? kp : countLines(collapsedText, availableWidth, fontString, indentPx, letterSpacingPx, wordSpacingPx, noHyphenation);
    }
  }

  // Store in paragraph cache
  if (cached === undefined) {
    if (_paragraphLayoutCache.size > MAX_PARAGRAPH_CACHE) {
      // Evict oldest entries (simple strategy: clear half)
      const entries = Array.from(_paragraphLayoutCache.keys());
      for (let i = 0; i < entries.length / 2; i++) {
        _paragraphLayoutCache.delete(entries[i]);
      }
    }
    _paragraphLayoutCache.set(cacheKey, lineCount);
  }

  // Calculate content height
  const contentH = lineCount * lineHeightPx;

  // Resolve vertical margins
  const marginTopPx = resolveSize(styles.marginTop, styles.marginTopUnit, elFontSizePx);
  const marginBottomPx = resolveSize(styles.marginBottom, styles.marginBottomUnit, elFontSizePx);
  const paddingV = (styles.paddingTop || 0) + (styles.paddingBottom || 0);

  return marginTopPx + paddingV + contentH + marginBottomPx;
};

/**
 * Check if runs contain mixed styles (different bold/italic/fontSize).
 * If all runs have the same style, we can use the fast plain-text path.
 */
const hasStyledRuns = (runs) => {
  if (runs.length <= 1) return false;
  const first = runs[0];
  for (let i = 1; i < runs.length; i++) {
    const r = runs[i];
    if (r.text === ' ') continue; // Skip space-only runs
    if (r.bold !== first.bold || r.italic !== first.italic || r.fontSize !== first.fontSize) {
      return true;
    }
  }
  return false;
};

// ─── Main API: measureHtmlHeight ────────────────────────────────────

/**
 * Deterministic replacement for measureDiv.offsetHeight.
 *
 * @param {string} html - HTML content (single or multiple elements)
 * @param {object} layoutCtx - Layout context
 *   - baseFontSizePx: base font size in px
 *   - baseLineHeight: unitless line-height multiplier
 *   - contentWidth: available content width in px
 *   - fontFamily: CSS font-family string
 * @returns {number} Height in pixels (deterministic)
 */
export const measureHtmlHeight = (html, layoutCtx) => {
  if (!html || !html.trim()) return 0;

  const elements = parseMultiElementHtml(html);
  if (elements.length === 0) return 0;

  let totalHeight = 0;
  let prevMarginBottom = 0;

  for (let i = 0; i < elements.length; i++) {
    const elHeight = calculateElementHeight(elements[i], layoutCtx);

    if (i === 0) {
      totalHeight += elHeight;
    } else {
      // CSS margin collapsing
      const currentMarginTop = resolveSize(
        elements[i].styles.marginTop,
        elements[i].styles.marginTopUnit,
        layoutCtx.baseFontSizePx
      );
      const collapsed = Math.min(prevMarginBottom, currentMarginTop);
      totalHeight += elHeight - collapsed;
    }

    prevMarginBottom = resolveSize(
      elements[i].styles.marginBottom,
      elements[i].styles.marginBottomUnit,
      layoutCtx.baseFontSizePx
    );
  }

  return Math.ceil(totalHeight);
};

// ─── Convenience: create layout context ─────────────────────────────

export const createLayoutContext = (baseFontSizePx, baseLineHeight, contentWidth, fontFamily) => ({
  baseFontSizePx,
  baseLineHeight,
  contentWidth,
  fontFamily
});

// ─── Convenience: calculate lineHeightPx deterministically ──────────

export const calculateLineHeightPx = (baseFontSizePx, baseLineHeight) => {
  return Math.ceil(baseFontSizePx * baseLineHeight);
};

// ─── Line counting for split decisions ──────────────────────────────

export const countHtmlLines = (html, layoutCtx) => {
  const height = measureHtmlHeight(html, layoutCtx);
  const lineHeightPx = layoutCtx.baseFontSizePx * layoutCtx.baseLineHeight;
  return Math.floor(height / lineHeightPx);
};

// ─── Insert <br> at calculated line break positions ─────────────────
// This is the bridge between our deterministic Canvas engine and browser
// rendering. Instead of letting the browser decide where to break lines,
// we insert explicit <br> so every line has exactly the words we calculated.

/**
 * Insert <br> into HTML at the word boundaries where our engine breaks lines.
 * Only processes the inner content of a single element (p, blockquote).
 *
 * @param {string} html - Full HTML element string (e.g. '<p style="...">content</p>')
 * @param {object} layoutCtx - Canvas layout context { baseFontSizePx, baseLineHeight, contentWidth, fontFamily, widthSlack }
 * @returns {string} HTML with <br> inserted at line break positions
 */
export const insertHtmlLineBreaks = (html, layoutCtx) => {
  if (!html || !layoutCtx) return html;

  try {

  const div = document.createElement('div');
  div.innerHTML = html;
  const el = div.firstElementChild;
  if (!el) return html;

  const tag = el.tagName;
  const styles = extractStyles(el.style);
  const text = el.textContent || '';
  if (!text.trim()) return html;

  // Resolve font properties (same logic as calculateElementHeight)
  const PX_PER_PT = 96 / 72;
  const fontFamily = layoutCtx.fontFamily || 'Georgia, serif';
  const elFontSizePx = styles.fontSize
    ? resolveSize(styles.fontSize, styles.fontSizeUnit, layoutCtx.baseFontSizePx)
    : layoutCtx.baseFontSizePx;
  const isBold = styles.fontWeight === 'bold' || parseInt(styles.fontWeight) >= 700;
  const isItalic = styles.fontStyle === 'italic';
  const fontString = buildFontString(elFontSizePx, fontFamily, isBold, isItalic);

  // Resolve indent (styles.textIndent is already in em from extractStyles)
  const indentPx = styles.textIndent ? styles.textIndent * elFontSizePx : 0;

  // Resolve content width accounting for padding/margin
  const paddingH = (styles.paddingLeft || 0) + (styles.paddingRight || 0);
  const marginLPx = resolveSize(styles.marginLeft, styles.marginLeftUnit, elFontSizePx);
  const marginRPx = resolveSize(styles.marginRight, styles.marginRightUnit, elFontSizePx);
  const borderLeft = styles.borderLeftWidth || 0;
  const widthSlack = layoutCtx.widthSlack || 0;
  const availableWidth = layoutCtx.contentWidth - paddingH - marginLPx - marginRPx - borderLeft - widthSlack;

  // Extract runs for mixed-style measurement
  const runs = extractTextRuns(el, { bold: isBold, italic: isItalic, fontSize: null });
  const hasStyled = runs && runs.length > 0 && hasStyledRuns(runs);

  // Get line break positions (word indices where new lines start)
  let lineStarts;
  if (hasStyled) {
    lineStarts = getLineBreakPositionsFromRuns(runs, availableWidth, elFontSizePx, fontFamily, indentPx);
  } else {
    const collapsed = collapseWhitespace(text);
    lineStarts = getLineBreakPositions(collapsed, availableWidth, fontString, indentPx);
  }

  // If only 1 line, no breaks needed
  if (lineStarts.length <= 1) return html;

  // Build a flat list of words from the DOM text nodes (preserving node references)
  // Each word maps to: { node: TextNode, startOffset, endOffset }
  const wordMap = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let tNode;
  while ((tNode = walker.nextNode())) {
    const nodeText = tNode.textContent;
    // Find word boundaries within this text node
    const regex = /\S+/g;
    let match;
    while ((match = regex.exec(nodeText))) {
      wordMap.push({
        node: tNode,
        startOffset: match.index,
        wordIndex: wordMap.length
      });
    }
  }

  // Insert <br> before each word that starts a new line (skip line 0)
  // Process in reverse order so offsets don't shift
  const breakWordIndices = lineStarts.slice(1); // Skip first line (word 0)

  for (let b = breakWordIndices.length - 1; b >= 0; b--) {
    const wordIdx = breakWordIndices[b];
    if (wordIdx >= wordMap.length) continue;

    const entry = wordMap[wordIdx];
    const { node, startOffset } = entry;

    // Split the text node at the start of this word
    // First, find the space before this word to split there
    const textBefore = node.textContent.substring(0, startOffset);
    const trimmedBefore = textBefore.replace(/\s+$/, '');
    const splitAt = trimmedBefore.length;

    if (splitAt > 0 && splitAt < node.textContent.length) {
      const afterNode = node.splitText(splitAt);
      // Remove leading whitespace from the after part
      afterNode.textContent = afterNode.textContent.replace(/^\s+/, '');
      // Insert <br> between the two text nodes
      const br = document.createElement('br');
      afterNode.parentNode.insertBefore(br, afterNode);
    } else if (splitAt === 0) {
      // Word is at the very start of this text node
      // Remove leading whitespace
      node.textContent = node.textContent.replace(/^\s+/, '');
      // Insert <br> before this text node
      const br = document.createElement('br');
      node.parentNode.insertBefore(br, node);
    }
  }

  // Return the modified HTML
  return div.innerHTML;

  } catch (e) {
    // If anything fails during line break insertion, return original HTML unchanged
    if (process.env.NODE_ENV === 'development') {
      console.warn('[insertHtmlLineBreaks] Error, returning original:', e.message);
    }
    return html;
  }
};

// ─── KP Rendering — apply optimal line breaks + word-spacing to page HTML ───
//
// This is the bridge between our KP measurement engine and browser rendering.
// It transforms the clean page HTML (used for pagination) into render-ready HTML
// where each paragraph line is explicitly broken at KP-optimal positions and
// manually justified via CSS word-spacing.
//
// Key properties:
//  - Deterministic: same pageHtml + layoutCtx → same output
//  - Non-destructive: works on a copy, never mutates pages[] data
//  - Safe fallback: any error returns the original HTML unchanged
//  - Uniform-font only: styled-run paragraphs are skipped (too complex)

/**
 * Apply KP-optimal line breaks and word-spacing to all paragraphs in a page.
 *
 * For each uniform-font <p> or <blockquote>:
 *   - Inserts <br> at KP-computed line start positions
 *   - Wraps each non-last line in <span style="word-spacing:Xpx"> so the browser
 *     renders exactly the words KP assigned to that line, justified to full width
 *   - Last line is left unstyled (natural short ending, no CSS stretch)
 *
 * The outer <p> keeps text-align:justify and text-align-last:left unchanged.
 * Lines before <br> are treated as "forced last lines" by CSS (not stretched),
 * so the word-spacing on the span provides ALL justification for those lines.
 *
 * @param {string} pageHtml   - Full page content HTML (from page.html)
 * @param {object} layoutCtx  - { baseFontSizePx, fontFamily, contentWidth, widthSlack }
 * @returns {string} Render-ready HTML with KP line breaks and word-spacing
 */
export const applyKpRendering = (pageHtml, layoutCtx) => {
  if (!pageHtml || !layoutCtx || !layoutCtx.contentWidth) return pageHtml;

  try {
    const div = document.createElement('div');
    div.innerHTML = pageHtml;
    let modified = false;

    for (const el of Array.from(div.children)) {
      const tag = el.tagName?.toUpperCase();
      if (tag !== 'P' && tag !== 'BLOCKQUOTE') continue;

      const text = el.textContent || '';
      if (!text.trim()) continue;

      // Skip styled-run paragraphs — mixed fonts require per-word measurement
      // which complicates span wrapping. Greedy rendering is acceptable there.
      const runs = extractTextRuns(el, { bold: false, italic: false, fontSize: null });
      if (runs && hasStyledRuns(runs)) continue;

      // Skip when entire content is uniformly bold or italic (single <strong>/<em> wrapper).
      // Inserting <br> inside the wrapping element creates malformed HTML fragments
      // (e.g. "<strong>line1" + "line2</strong>") — the browser auto-repairs by closing
      // the tag before the break, causing the second line to lose its bold/italic styling.
      // These are typically subheader paragraphs; browser line-breaking is acceptable.
      if (runs && runs.length === 1 && (runs[0].bold || runs[0].italic)) continue;

      // Resolve element font
      const styles = extractStyles(el.style);
      const elFontSizePx = styles.fontSize
        ? resolveSize(styles.fontSize, styles.fontSizeUnit, layoutCtx.baseFontSizePx)
        : layoutCtx.baseFontSizePx;
      const isBold   = styles.fontWeight === 'bold' || parseInt(styles.fontWeight) >= 700;
      const isItalic = styles.fontStyle === 'italic';
      const fontStr  = buildFontString(elFontSizePx, layoutCtx.fontFamily, isBold, isItalic);

      // Resolve first-line indent (em → px)
      const indentPx = styles.textIndent ? styles.textIndent * elFontSizePx : 0;

      // Resolve element's available width (matching calculateElementHeight logic)
      const paddingH  = (styles.paddingLeft || 0) + (styles.paddingRight || 0);
      const marginLPx = resolveSize(styles.marginLeft,  styles.marginLeftUnit,  elFontSizePx);
      const marginRPx = resolveSize(styles.marginRight, styles.marginRightUnit, elFontSizePx);
      const borderL   = styles.borderLeftWidth || 0;
      const availW    = layoutCtx.contentWidth - paddingH - marginLPx - marginRPx - borderL
                        - (layoutCtx.widthSlack || 0);
      if (availW <= 0) continue;

      // Base word-spacing from element CSS (usually 0)
      const wsFromStyle = styles.wordSpacing
        ? resolveSize(styles.wordSpacing, styles.wordSpacingUnit, elFontSizePx)
        : 0;

      const collapsed = collapseWhitespace(text);
      const kp = getLineBreakPositionsKP(collapsed, availW, fontStr, indentPx, wsFromStyle);
      if (!kp || kp.lineStarts.length <= 1) continue; // single line or KP failed

      // ── Apply KP word-spacing as a single value on the <p> ───────────────────
      // Instead of inserting <br> per line (which fights with text-align:justify),
      // compute the median word-spacing across all non-last lines and apply it
      // to the element. The browser handles line-breaking via text-align:justify;
      // KP provides the optimal spacing value. No conflict, no ragged right edge.
      const nonLastSpacings = kp.wordSpacings.slice(0, kp.lineStarts.length - 1);
      if (nonLastSpacings.length === 0) continue;
      nonLastSpacings.sort((a, b) => a - b);
      const mid = Math.floor(nonLastSpacings.length / 2);
      const medianWs = nonLastSpacings.length % 2 === 1
        ? nonLastSpacings[mid]
        : (nonLastSpacings[mid - 1] + nonLastSpacings[mid]) / 2;

      if (Math.abs(medianWs) < 0.01) continue; // negligible — skip

      const currentStyle = el.getAttribute('style') || '';
      el.setAttribute('style',
        currentStyle.replace(/word-spacing\s*:[^;]+;?/g, '')
        + `;word-spacing:${medianWs.toFixed(3)}px`
      );
      modified = true;
    }

    return modified ? div.innerHTML : pageHtml;

  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[applyKpRendering] Error, returning original:', e?.message);
    }
    return pageHtml;
  }
};

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
const countHyphenationMetrics = (text, contentWidth, fontString, firstLineIndent = 0) => {
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

// ─── Exports for testing ────────────────────────────────────────────

export {
  countLines,
  countLinesFromRuns,
  extractTextRuns,
  parseHtmlElement,
  parseMultiElementHtml,
  calculateElementHeight,
  buildFontString,
  normalizeWidth,
  collapseWhitespace,
  getLineBreakPositions,
  getLineBreakPositionsFromRuns,
  countHyphenationMetrics,
  getCtx
};
