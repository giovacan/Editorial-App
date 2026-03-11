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

import { initKnuthPlass } from './knuthPlassAdapter.js';

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

let _fontsReady = false;

/**
 * Wait until all declared fonts are loaded.
 * Must be called once before pagination starts.
 *
 * @param {string} [fontFamily] - Optional specific font to preload
 * @param {number} [fontSize=12] - Font size in pt for the preload request
 */
export const ensureFontsReady = async (fontFamily, fontSize = 12) => {
  if (_fontsReady) return;

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
  _fontsReady = true;

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
const countLinesFromRuns = (runs, contentWidth, baseFontSizePx, fontFamily, firstLineIndent = 0, wordSpacingPx = 0) => {
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
        // Normal line break
        lines++;
        currentLineWidth = wordWidth;
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

const countLines = (text, contentWidth, fontString, firstLineIndent = 0, letterSpacingPx = 0, wordSpacingPx = 0) => {
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
        lines++;
        currentLineWidth = wordWidth;
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

  const { baseFontSizePx, baseLineHeight, contentWidth, fontFamily, widthSlack = 0 } = layoutCtx;
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
    const div = document.createElement('div');
    div.innerHTML = parsed.innerHTML || '';
    const rows = div.querySelectorAll('tr').length || 1;
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
    ? elFontSizePx * elLineHeight
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
  const availableWidth = contentWidth - paddingH - marginLPx - marginRPx - borderLeft - widthSlack;

  // Count lines — use runs if available (handles inline bold/italic/size),
  // fall back to plain text measurement
  let lineCount;

  const isBold = styles.fontWeight === 'bold' || parseInt(styles.fontWeight) >= 700;
  const isItalic = styles.fontStyle === 'italic';
  const fontString = buildFontString(elFontSizePx, fontFamily, isBold, isItalic);

  // Check paragraph cache first
  const collapsedText = collapseWhitespace(text);
  const cacheKey = getParagraphCacheKey(collapsedText, fontString, availableWidth, indentPx, wordSpacingPx);
  const cached = _paragraphLayoutCache.get(cacheKey);
  if (cached !== undefined) {
    lineCount = cached;
  } else if (runs && runs.length > 0 && hasStyledRuns(runs)) {
    // Has mixed inline styles — use greedy (matches browser rendering)
    // wordSpacingPx now correctly propagated to countLinesFromRuns
    lineCount = countLinesFromRuns(runs, availableWidth, elFontSizePx, fontFamily, indentPx, wordSpacingPx);
  } else {
    // All same font — use greedy (matches browser rendering)
    lineCount = countLines(collapsedText, availableWidth, fontString, indentPx, letterSpacingPx, wordSpacingPx);
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
  getLineBreakPositionsFromRuns
};
