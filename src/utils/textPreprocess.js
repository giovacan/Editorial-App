/**
 * textPreprocess.js
 *
 * Whitespace handling, text run extraction (DOM + HTML), style parsing,
 * multi-element HTML parser, and unit conversion helpers.
 *
 * Depends on: textMeasurement.js
 */

import { buildFontString } from './textMeasurement.js';

// ─── Whitespace collapsing ──────────────────────────────────────────
// HTML collapses consecutive whitespace into a single space.
// This replicates that behavior for plain text extracted from DOM.
//
// NBSP (\u00A0) is explicitly preserved as the Unicode no-break space —
// it must NOT become a word-split boundary. We replace it with a
// private-use sentinel (\uE000) before collapsing regular whitespace,
// then restore it after, ensuring the surrounding tokens are joined into
// a single "word" that KP will never break at.

export const NBSP_SENTINEL = '\uE000';

export const collapseWhitespace = (text) => {
  if (!text) return '';
  // Temporarily encode NBSP + neighbouring normal spaces as a sentinel-joined token.
  // e.g. "artículo\u00A06" → "artículo\uE0006" (one word for KP/greedy)
  const encoded = text.replace(/\s*\u00A0\s*/g, NBSP_SENTINEL);
  return encoded.replace(/\s+/g, ' ').trim();
};

// ─── UAX#14: Em/en-dash break opportunities ────────────────────────
// Em-dash (—, U+2014) and en-dash (–, U+2013) are optional line-break
// points per Unicode UAX#14 (class BA — Break After). The break happens
// AFTER the dash: "palabra—" stays on the current line, "otra" wraps.
//
// splitWordsAtDashes() takes the word array from `text.split(' ')` and
// splits any word containing an em/en-dash into sub-tokens.
// Example: "palabra—otra" → ["palabra—", "otra"]
//          "esto—es—raro" → ["esto—", "es—", "raro"]
//          "no-break"     → ["no-break"] (regular hyphens are NOT break points)
//
// The regex splits AFTER the dash character, keeping the dash with the
// preceding fragment.

const _dashSplitRe = /([\u2014\u2013])/;

export const splitWordsAtDashes = (words) => {
  let changed = false;
  const result = [];
  for (const w of words) {
    if (_dashSplitRe.test(w)) {
      // Split at each em/en-dash, keeping dash with preceding part
      const parts = w.split(_dashSplitRe);
      // parts alternates [text, dash, text, dash, text]
      // Recombine: attach each dash to the preceding text
      let current = '';
      for (let i = 0; i < parts.length; i++) {
        if (!parts[i]) continue;
        if (parts[i] === '\u2014' || parts[i] === '\u2013') {
          current += parts[i];
        } else {
          if (current) {
            result.push(current);
            changed = true;
          }
          current = parts[i];
        }
      }
      if (current) result.push(current);
      if (parts.filter(p => p === '\u2014' || p === '\u2013').length > 0) changed = true;
    } else {
      result.push(w);
    }
  }
  return changed ? result : words;
};

// ─── Block element detection ────────────────────────────────────────

export const BLOCK_TAGS = new Set([
  'DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'UL', 'OL', 'LI', 'TABLE', 'PRE',
  'FIGURE', 'FIGCAPTION', 'SECTION', 'ARTICLE',
  'HEADER', 'FOOTER', 'NAV', 'MAIN', 'ASIDE'
]);

export const REPLACED_TAGS = new Set(['IMG', 'VIDEO', 'CANVAS', 'SVG', 'IFRAME']);

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
export const extractTextRuns = (el, inherited = { bold: false, italic: false, fontSize: null }) => {
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

/**
 * Check if runs contain mixed styles (different bold/italic/fontSize).
 * If all runs have the same style, we can use the fast plain-text path.
 */
export const hasStyledRuns = (runs) => {
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

// ─── HTML style extraction ──────────────────────────────────────────

const parseEmValue = (value) => {
  if (!value) return 0;
  const num = parseFloat(value);
  if (isNaN(num)) return 0;
  if (value.includes('em')) return num;
  return 0;
};

export const extractStyles = (style) => ({
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
  paddingTopUnit: (style.paddingTop || '').replace(/[\d.-]/g, '') || 'px',
  paddingBottom: parseFloat(style.paddingBottom) || 0,
  paddingBottomUnit: (style.paddingBottom || '').replace(/[\d.-]/g, '') || 'px',
  paddingLeft: parseFloat(style.paddingLeft) || 0,
  paddingRight: parseFloat(style.paddingRight) || 0,
  marginLeft: parseFloat(style.marginLeft) || 0,
  marginLeftUnit: (style.marginLeft || '').replace(/[\d.-]/g, '') || 'px',
  marginRight: parseFloat(style.marginRight) || 0,
  marginRightUnit: (style.marginRight || '').replace(/[\d.-]/g, '') || 'px',
  borderLeftWidth: parseFloat(style.borderLeftWidth) || 0,
  borderTopWidth: parseFloat(style.borderTopWidth) || 0,
  borderBottomWidth: parseFloat(style.borderBottomWidth) || 0,
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
export const parseStyleString = (cssText) => {
  const get = (prop) => {
    const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i');
    return (cssText || '').match(re)?.[1]?.trim() || '';
  };
  // Expand padding/margin shorthand: "0.5em 1em" → top=0.5em, right=1em, bottom=0.5em, left=1em
  const expandShorthand = (shortProp, longProps) => {
    const longTop = get(longProps[0]);
    if (longTop) return { [longProps[0]]: longTop, [longProps[1]]: get(longProps[1]) || longTop, [longProps[2]]: get(longProps[2]) || longTop, [longProps[3]]: get(longProps[3]) || (get(longProps[1]) || longTop) };
    const shortVal = get(shortProp);
    if (!shortVal) return { [longProps[0]]: '', [longProps[1]]: '', [longProps[2]]: '', [longProps[3]]: '' };
    const parts = shortVal.trim().split(/\s+/);
    const [v1 = '', v2 = v1, v3 = v1, v4 = v2] = parts;
    return { [longProps[0]]: v1, [longProps[1]]: v2, [longProps[2]]: parts.length >= 3 ? v3 : v1, [longProps[3]]: parts.length >= 4 ? v4 : v2 };
  };
  const padding = expandShorthand('padding', ['padding-top', 'padding-right', 'padding-bottom', 'padding-left']);
  const margin  = expandShorthand('margin',  ['margin-top',  'margin-right',  'margin-bottom',  'margin-left']);
  const getPad  = (k) => get(k) || padding[k] || '';
  const getMar  = (k) => get(k) || margin[k]  || '';
  return {
    fontSize: parseFloat(get('font-size')) || null,
    fontSizeUnit: (get('font-size') || '').replace(/[\d.]/g, '') || 'pt',
    lineHeight: parseFloat(get('line-height')) || null,
    fontWeight: get('font-weight') || 'normal',
    fontStyle: get('font-style') || 'normal',
    textIndent: parseEmValue(get('text-indent')),
    marginTop: parseFloat(getMar('margin-top')) || 0,
    marginTopUnit: (getMar('margin-top') || '').replace(/[\d.-]/g, '') || 'px',
    marginBottom: parseFloat(getMar('margin-bottom')) || 0,
    marginBottomUnit: (getMar('margin-bottom') || '').replace(/[\d.-]/g, '') || 'px',
    paddingTop: parseFloat(getPad('padding-top')) || 0,
    paddingTopUnit: (getPad('padding-top') || '').replace(/[\d.-]/g, '') || 'px',
    paddingBottom: parseFloat(getPad('padding-bottom')) || 0,
    paddingBottomUnit: (getPad('padding-bottom') || '').replace(/[\d.-]/g, '') || 'px',
    paddingLeft: parseFloat(getPad('padding-left')) || 0,
    paddingRight: parseFloat(getPad('padding-right')) || 0,
    marginLeft: parseFloat(getMar('margin-left')) || 0,
    marginLeftUnit: (getMar('margin-left') || '').replace(/[\d.-]/g, '') || 'px',
    marginRight: parseFloat(getMar('margin-right')) || 0,
    marginRightUnit: (getMar('margin-right') || '').replace(/[\d.-]/g, '') || 'px',
    borderLeftWidth: parseFloat(get('border-left-width')) || 0,
    borderTopWidth: parseFloat(get('border-top-width') || get('border-top')) || 0,
    borderBottomWidth: parseFloat(get('border-bottom-width') || get('border-bottom')) || 0,
    letterSpacing: parseFloat(get('letter-spacing')) || 0,
    letterSpacingUnit: (get('letter-spacing') || '').replace(/[\d.-]/g, '') || 'px',
    wordSpacing: parseFloat(get('word-spacing')) || 0,
    wordSpacingUnit: (get('word-spacing') || '').replace(/[\d.-]/g, '') || 'px',
    display: get('display') || '',
    minHeight: parseFloat(get('min-height')) || 0,
    minHeightUnit: (get('min-height') || '').replace(/[\d.-]/g, '') || 'px',
  };
};

// ─── Unit conversion helpers ────────────────────────────────────────

export const PX_PER_PT = 96 / 72;

export const resolveSize = (value, unit, baseFontSizePx) => {
  if (!value) return 0;
  switch (unit) {
    case 'pt': return value * PX_PER_PT;
    case 'em': return value * baseFontSizePx;
    case 'px': return value;
    default: return value;
  }
};

export const isBlockElement = (tagName) => BLOCK_TAGS.has(tagName);
export const isReplacedElement = (tagName) => REPLACED_TAGS.has(tagName);

// ─── HTML text run extraction ───────────────────────────────────────

/**
 * Worker-safe: tokenize inline HTML into text runs without DOM.
 * Handles <strong>, <b>, <em>, <i>, <span style="...">, <br>.
 */
export const extractTextRunsFromHtml = (html, inherited = { bold: false, italic: false, fontSize: null }) => {
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

// ─── Multi-element HTML parser ──────────────────────────────────────

/**
 * Worker-safe: tokenize multi-element HTML string into element descriptors.
 * Used as fallback for parseMultiElementHtml when document is unavailable.
 */
export const parseMultiElementHtmlWorker = (html) => {
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

// UNIFIED: Delegate to regex parser for consistency with worker measurements.
export const parseHtmlElement = (html) => {
  if (!html || !html.trim()) return null;
  const elements = parseMultiElementHtmlWorker(html);
  return elements.length > 0 ? elements[0] : null;
};

// UNIFIED: Always use the regex-based parser so that Worker (engine) and
// main thread (verification) produce identical measurements for the same HTML.
// The DOM-based path had a bug: resolveSize(fontSize, 'em', 0) = 0, causing
// different text run extraction → different line counts → different heights.
export const parseMultiElementHtml = (html) => {
  return parseMultiElementHtmlWorker(html);
};
