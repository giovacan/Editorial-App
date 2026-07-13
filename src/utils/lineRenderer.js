/**
 * lineRenderer.js — Deterministic line-by-line rendering.
 *
 * The engine decides where every line breaks; this module DRAWS those exact
 * lines instead of letting the browser re-break paragraphs. Each line becomes
 * a `<span style="display:block">` inside the original block wrapper:
 *
 *   - interior lines:  text-align-last:justify  (stretched, like print)
 *   - final line:      the block's own text-align-last (left for paragraph
 *                      ends, justify for cut lines per the cut-line law)
 *   - first line:      carries the paragraph's text-indent
 *
 * Because the browser receives one line per block element, it CANNOT re-wrap
 * anything: the whole engine↔DOM divergence class (dashes, word-spacing,
 * sub-pixel widths) is impossible by construction.
 *
 * Phase 1 scope: plain <p> blocks (no <br>, no nested block elements, no
 * replaced content). Everything else renders natively — the DOM audit still
 * covers those. The transform is presentation-only: pagination, repairs and
 * corrections keep operating on the original page HTML.
 *
 * Toggle: config.render.engineLines (default ON when layout dims available).
 */

import { buildFontString } from './textMeasurement.js';
import { collapseWhitespace, splitWordsAtDashes } from './textPreprocess.js';
import {
  htmlToText,
  getInnerHtml,
  parseTopLevelBlocks,
  splitHtmlByCharsPreservingTags,
} from './layoutIr.js';

let _canvas = null;
let _ctx = null;
const getCtx2d = () => {
  if (!_ctx) {
    if (typeof OffscreenCanvas !== 'undefined') {
      _canvas = new OffscreenCanvas(1, 1);
    } else if (typeof document !== 'undefined') {
      _canvas = document.createElement('canvas');
    } else {
      return null;
    }
    _ctx = _canvas.getContext('2d');
  }
  return _ctx;
};

// Per-block transform cache — page HTML is immutable between paginations, so
// identical blocks (same text, same style, same width) transform identically.
const _lineCache = new Map();
const MAX_LINE_CACHE = 3000;

/**
 * Compute the engine's line breaks for a plain text at full column width.
 * Dash-aware greedy walk — identical model to findSplitPos/the browser.
 * Returns an array of { endChar, spaceAfter } line descriptors (collapsed-text
 * char offsets), or null when measurement is unavailable.
 */
const computeLineBreaks = (collapsed, width, fontStr, indentPx, wordSpacingPx) => {
  const ctx2d = getCtx2d();
  if (!ctx2d || !collapsed || width <= 0) return null;
  ctx2d.font = fontStr;
  const spaceW = ctx2d.measureText(' ').width + wordSpacingPx;

  const rawWords = collapsed.split(' ').filter(w => w.length > 0);
  if (rawWords.length === 0) return null;

  const tokens = [];
  let cp = 0;
  for (let wi = 0; wi < rawWords.length; wi++) {
    if (wi > 0) cp += 1;
    const frags = splitWordsAtDashes([rawWords[wi]]);
    let f = cp;
    for (let fi = 0; fi < frags.length; fi++) {
      tokens.push({ text: frags[fi], end: f + frags[fi].length, joinsPrev: fi > 0 });
      f += frags[fi].length;
    }
    cp += rawWords[wi].length;
  }

  const lines = [];
  let lineWidth = indentPx;
  let lineEnd = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const ww = ctx2d.measureText(t.text).width;
    const eff = i === 0 ? 0 : (t.joinsPrev ? 0 : spaceW);
    const needed = lineWidth + eff + ww;
    if (i > 0 && needed > width) {
      lines.push({ endChar: lineEnd });
      lineWidth = ww;
    } else {
      lineWidth = needed;
    }
    lineEnd = t.end;
  }
  lines.push({ endChar: lineEnd });
  return lines;
};

/**
 * Transform ONE block into engine-line markup. Returns the transformed outer
 * HTML, or null when the block is out of scope (rendered natively).
 */
const renderBlockAsLines = (block, layoutCtx) => {
  const outer = block.outerHtml || '';
  const tag = (block.tag || '').toUpperCase();
  if (tag !== 'P') return null;
  if (/<(br|img|table|div|ul|ol|blockquote|h[1-6])[\s/>]/i.test(block.innerHTML || '')) return null;

  const open = (outer.match(/^<[^>]+>/) || [''])[0];
  const styleStr = (open.match(/style="([^"]*)"/) || ['', ''])[1];

  const inner = getInnerHtml(outer);
  const collapsed = collapseWhitespace(htmlToText(inner)).trim();
  if (!collapsed) return null;

  // Geometry from the block's inline style (same sources the engine uses).
  const fsM = styleStr.match(/font-size:\s*([\d.]+)(pt|px)/i);
  let fontPx = layoutCtx.baseFontSizePx;
  if (fsM) fontPx = fsM[2] === 'pt' ? parseFloat(fsM[1]) * (96 / 72) : parseFloat(fsM[1]);
  const isBold = /font-weight:\s*(bold|[7-9]00)/i.test(styleStr);
  const isItalic = /font-style:\s*italic/i.test(styleStr);
  // Uniform inline runs only — mixed <strong>/<em> spans measure differently.
  if (/<(strong|b|em|i|span)[\s>]/i.test(inner)) return null;

  const fontStr = buildFontString(fontPx, layoutCtx.fontFamily, isBold, isItalic);
  const wsM = styleStr.match(/word-spacing:\s*(-?[\d.]+)px/i);
  const wordSpacingPx = wsM ? parseFloat(wsM[1]) : 0;
  const indentM = styleStr.match(/text-indent:\s*([\d.]+)em/i);
  const indentPx = indentM ? parseFloat(indentM[1]) * fontPx : 0;

  const cacheKey = `${collapsed.length}|${collapsed.slice(0, 32)}|${fontStr}|${layoutCtx.contentWidth}|${indentPx}|${wordSpacingPx}|${styleStr.length}`;
  const hit = _lineCache.get(cacheKey);
  if (hit !== undefined) return hit === false ? null : hit;

  const lines = computeLineBreaks(collapsed, layoutCtx.contentWidth, fontStr, indentPx, wordSpacingPx);
  if (!lines || lines.length === 0) { _lineCache.set(cacheKey, false); return null; }

  // Slice the inner HTML at the line boundaries (preserves inline tags).
  const lineHtmls = [];
  let remaining = inner;
  let consumed = 0;
  for (let li = 0; li < lines.length - 1; li++) {
    const localEnd = lines[li].endChar - consumed;
    if (localEnd <= 0) { _lineCache.set(cacheKey, false); return null; }
    const { headHtml, tailHtml } = splitHtmlByCharsPreservingTags(remaining, localEnd, { trimLeadingSpace: true });
    if (!headHtml) { _lineCache.set(cacheKey, false); return null; }
    lineHtmls.push(headHtml);
    remaining = tailHtml;
    consumed = lines[li].endChar + (collapsed[lines[li].endChar] === ' ' ? 1 : 0);
  }
  lineHtmls.push(remaining);
  if (!remaining || !htmlToText(remaining).trim()) { _lineCache.set(cacheKey, false); return null; }

  // The block's own final-line alignment (left for paragraph ends, justify
  // for law-approved cut lines).
  const finalAlign = (styleStr.match(/text-align-last:\s*([^;"]+)/i) || ['', 'left'])[1].trim();

  // Wrapper: keep all original styles/attrs; neutralize indent (moved to line 1).
  const newOpen = open.replace(/style="([^"]*)"/, (m, s) => {
    const cleaned = s
      .replace(/text-indent:\s*[^;]+;?/gi, '')
      .replace(/text-align-last:\s*[^;]+;?/gi, '')
      .replace(/;?\s*$/, ';');
    return `style="${cleaned}text-indent:0;" data-engine-lines="true"`;
  });

  const spans = lineHtmls.map((lh, i) => {
    const isLast = i === lineHtmls.length - 1;
    const parts = ['display:block'];
    parts.push(`text-align-last:${isLast ? finalAlign : 'justify'}`);
    if (i === 0 && indentPx > 0) parts.push(`text-indent:${indentPx.toFixed(2)}px`);
    return `<span class="el-line" style="${parts.join(';')};">${lh}</span>`;
  }).join('');

  const closeTag = (outer.match(/<\/[a-zA-Z]+>\s*$/) || ['</p>'])[0];
  const result = newOpen + spans + closeTag;

  if (_lineCache.size > MAX_LINE_CACHE) _lineCache.clear();
  _lineCache.set(cacheKey, result);
  return result;
};

/**
 * Transform a full page's HTML into engine-line markup. Blocks out of scope
 * pass through untouched. Pure and deterministic.
 *
 * @param {string} pageHtml
 * @param {object} layoutCtx - { contentWidth, baseFontSizePx, fontFamily }
 * @returns {string}
 */
export const renderPageAsEngineLines = (pageHtml, layoutCtx) => {
  if (!pageHtml || !layoutCtx?.contentWidth || !layoutCtx?.baseFontSizePx) return pageHtml;
  try {
    const blocks = parseTopLevelBlocks(pageHtml);
    if (blocks.length === 0) return pageHtml;
    let changed = false;
    const out = blocks.map((b) => {
      const t = renderBlockAsLines(b, layoutCtx);
      if (t) { changed = true; return t; }
      return b.outerHtml;
    });
    return changed ? out.join('') : pageHtml;
  } catch {
    return pageHtml; // rendering must never break the preview
  }
};
