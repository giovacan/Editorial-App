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
import { fittingHyphenPrefix } from './spanishHyphen.js';
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
 * Parse inline bold/italic runs from a block's inner HTML.
 * Supported: <strong>/<b>, <em>/<i>, style-less <span>. Anything else
 * (entities, nested blocks, styled spans) → null (block renders natively).
 * Returns { text, charStyles } where charStyles[i] ∈ {0,1,2,3} = bold|italic bits.
 */
export const parseInlineRuns = (inner) => {
  if (inner.indexOf('&') !== -1) return null; // entities shift char offsets
  let bold = 0, italic = 0;
  let text = '';
  const charStyles = [];
  let i = 0;
  while (i < inner.length) {
    const c = inner[i];
    if (c === '<') {
      const end = inner.indexOf('>', i);
      if (end === -1) return null;
      const tagStr = inner.slice(i, end + 1).toLowerCase();
      const nm = tagStr.match(/^<\/?\s*([a-z0-9]+)/);
      const name = nm ? nm[1] : '';
      const closing = tagStr[1] === '/';
      if (name === 'strong' || name === 'b') bold += closing ? -1 : 1;
      else if (name === 'em' || name === 'i') italic += closing ? -1 : 1;
      else if (name === 'span' && !/style=/.test(tagStr)) { /* estilo-neutral */ }
      else return null;
      i = end + 1;
    } else {
      text += c;
      charStyles.push((bold > 0 ? 1 : 0) | (italic > 0 ? 2 : 0));
      i++;
    }
  }
  return { text, charStyles };
};

/**
 * Horizontal box consumption (margins + paddings + left border) parsed from
 * an inline style string — used to compute a quote's effective column width.
 */
export const resolveHorizontalBoxPx = (styleStr, fontPx) => {
  const toPx = (v) => {
    const m = String(v).trim().match(/^(-?[\d.]+)(em|px|pt)?$/);
    if (!m) return 0;
    const n = parseFloat(m[1]);
    const u = m[2] || 'px';
    return u === 'em' ? n * fontPx : u === 'pt' ? n * (96 / 72) : n;
  };
  const expand = (val) => {
    const p = val.trim().split(/\s+/).map(toPx);
    if (p.length === 1) return [p[0], p[0], p[0], p[0]];
    if (p.length === 2) return [p[0], p[1], p[0], p[1]];
    if (p.length === 3) return [p[0], p[1], p[2], p[1]];
    return p; // [t, r, b, l]
  };
  let mL = 0, mR = 0, pL = 0, pR = 0, bL = 0;
  let m = styleStr.match(/(?:^|;)\s*margin:\s*([^;]+)/i);
  if (m) { const e = expand(m[1]); mR = e[1]; mL = e[3]; }
  m = styleStr.match(/margin-left:\s*([^;]+)/i);  if (m) mL = toPx(m[1]);
  m = styleStr.match(/margin-right:\s*([^;]+)/i); if (m) mR = toPx(m[1]);
  m = styleStr.match(/(?:^|;)\s*padding:\s*([^;]+)/i);
  if (m) { const e = expand(m[1]); pR = e[1]; pL = e[3]; }
  m = styleStr.match(/padding-left:\s*([^;]+)/i);  if (m) pL = toPx(m[1]);
  m = styleStr.match(/padding-right:\s*([^;]+)/i); if (m) pR = toPx(m[1]);
  m = styleStr.match(/border-left:\s*([\d.]+)px/i); if (m) bL = parseFloat(m[1]);
  return mL + mR + pL + pR + bL;
};

// Measure a char range with per-char styles (segments measured in their font).
export const measureStyled = (ctx2d, str, startChar, charStyles, fonts) => {
  let w = 0, i = 0;
  while (i < str.length) {
    const s = charStyles[startChar + i] || 0;
    let j = i + 1;
    while (j < str.length && (charStyles[startChar + j] || 0) === s) j++;
    ctx2d.font = fonts[s];
    w += ctx2d.measureText(str.slice(i, j)).width;
    i = j;
  }
  return w;
};

/**
 * Compute the engine's line breaks for a plain text at full column width.
 * Dash-aware greedy walk — identical model to findSplitPos/the browser.
 * Returns an array of { endChar, spaceAfter } line descriptors (collapsed-text
 * char offsets), or null when measurement is unavailable.
 */
const computeLineBreaks = (collapsed, width, fontStr, indentPx, wordSpacingPx, styled = null, skipPull = false) => {
  const ctx2d = getCtx2d();
  if (!ctx2d || !collapsed || width <= 0) return null;
  ctx2d.font = fontStr;
  const spaceW = ctx2d.measureText(' ').width + wordSpacingPx;
  const measureToken = (t) => {
    if (!styled) { ctx2d.font = fontStr; return ctx2d.measureText(t.text).width; }
    return measureStyled(ctx2d, t.text, t.end - t.text.length, styled.charStyles, styled.fonts);
  };

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
    const ww = measureToken(t);
    const eff = i === 0 ? 0 : (t.joinsPrev ? 0 : spaceW);
    const needed = lineWidth + eff + ww;
    if (i > 0 && needed > width) {
      lines.push({ endChar: lineEnd, width: lineWidth, nextToken: t });
      lineWidth = ww;
    } else {
      lineWidth = needed;
    }
    lineEnd = t.end;
  }
  lines.push({ endChar: lineEnd, width: lineWidth, nextToken: null });

  // ── Hyphen pull (guionado) ────────────────────────────────────────────
  // A justified line that ends short because its next word was long gets a
  // syllable prefix of that word pulled up, ending in "-" like print books.
  // Line COUNT never changes (following lines only lose characters), so
  // pagination heights are untouched — this is presentation only.
  if (skipPull) return lines;
  for (let li = 0; li < lines.length - 1; li++) {
    const line = lines[li];
    const nt = line.nextToken;
    if (!nt || nt.joinsPrev) continue;              // dash boundaries: no pull
    if (line.width / width >= 0.93) continue;       // already full — no gap
    const available = width - line.width - spaceW;
    if (available <= 0) continue;
    // Set the measuring font for the pulled word (its own style when runs).
    if (styled) {
      const start = nt.end - nt.text.length;
      const s0 = styled.charStyles[start] || 0;
      let uniform = true;
      for (let k = 1; k < nt.text.length; k++) {
        if ((styled.charStyles[start + k] || 0) !== s0) { uniform = false; break; }
      }
      if (!uniform) continue; // mixed-style word — skip the pull
      ctx2d.font = styled.fonts[s0];
    } else {
      ctx2d.font = fontStr;
    }
    const prefix = fittingHyphenPrefix(nt.text, available, ctx2d);
    if (!prefix) continue;
    // Never impoverish the paragraph's FINAL line: pulling a syllable from it
    // when it holds ≤2 words leaves a lone partial word at the paragraph end
    // (reported: "última línea de una sola palabra").
    if (li === lines.length - 2) {
      const finalLineText = collapsed.slice(line.endChar).trim();
      const finalWords = finalLineText.split(/\s+/).filter(Boolean).length;
      if (finalWords <= 2) continue;
    }
    line.hyphenPull = prefix.length;                // chars pulled from next word
    line.endChar = (nt.end - nt.text.length) + prefix.length;
    line.pulledMidWord = true;
  }
  return lines;
};

/**
 * Transform ONE block into engine-line markup. Returns the transformed outer
 * HTML, or null when the block is out of scope (rendered natively).
 */
const renderBlockAsLines = (block, layoutCtx) => {
  const outer = block.outerHtml || '';
  const tag = (block.tag || '').toUpperCase();
  if (tag !== 'P' && tag !== 'BLOCKQUOTE') return null;
  if (/<(br|img|table|div|ul|ol|blockquote|h[1-6])[\s/>]/i.test(block.innerHTML || '')) return null;

  const open = (outer.match(/^<[^>]+>/) || [''])[0];
  const styleStr = (open.match(/style="([^"]*)"/) || ['', ''])[1];

  const inner = getInnerHtml(outer);
  // HTML entities count as ONE visible char in the slicer but several in the
  // measured text — offsets would desync. Those blocks render natively.
  if (inner.indexOf('&') !== -1) return null;
  const collapsed = collapseWhitespace(htmlToText(inner)).trim();
  if (!collapsed) return null;

  // Geometry from the block's inline style (same sources the engine uses).
  const fsM = styleStr.match(/font-size:\s*([\d.]+)(pt|px)/i);
  let fontPx = layoutCtx.baseFontSizePx;
  if (fsM) fontPx = fsM[2] === 'pt' ? parseFloat(fsM[1]) * (96 / 72) : parseFloat(fsM[1]);
  const isBold = /font-weight:\s*(bold|[7-9]00)/i.test(styleStr);
  const isItalic = /font-style:\s*italic/i.test(styleStr);

  // Inline runs (<strong>/<em>): measured per style segment; anything the run
  // parser can't guarantee (entities, styled spans) renders natively.
  let styled = null;
  if (/<(strong|b|em|i|span)[\s>]/i.test(inner)) {
    const runs = parseInlineRuns(inner);
    if (!runs) return null;
    if (collapseWhitespace(runs.text).trim() !== collapsed) return null;
    // Align charStyles with the trimmed/collapsed text (leading ws offset).
    const lead = runs.text.length - runs.text.replace(/^\s+/, '').length;
    const charStyles = runs.charStyles.slice(lead);
    styled = {
      charStyles,
      fonts: [
        buildFontString(fontPx, layoutCtx.fontFamily, isBold, isItalic),
        buildFontString(fontPx, layoutCtx.fontFamily, true, isItalic),
        buildFontString(fontPx, layoutCtx.fontFamily, isBold, true),
        buildFontString(fontPx, layoutCtx.fontFamily, true, true),
      ],
    };
  }

  // Effective column width: quotes (and any styled block) consume horizontal
  // margins/paddings/border — same box math the height engine uses.
  const horiz = resolveHorizontalBoxPx(styleStr, fontPx);
  const effWidth = layoutCtx.contentWidth - horiz;
  if (effWidth < fontPx * 4) return null;

  const fontStr = buildFontString(fontPx, layoutCtx.fontFamily, isBold, isItalic);
  const wsM = styleStr.match(/word-spacing:\s*(-?[\d.]+)px/i);
  const wordSpacingPx = wsM ? parseFloat(wsM[1]) : 0;
  const indentM = styleStr.match(/text-indent:\s*([\d.]+)em/i);
  const indentPx = indentM ? parseFloat(indentM[1]) * fontPx : 0;

  const cacheKey = `${collapsed.length}|${collapsed.slice(0, 32)}|${fontStr}|${effWidth}|${indentPx}|${wordSpacingPx}|${styleStr.length}|${styled ? 'r' : 'p'}`;
  const hit = _lineCache.get(cacheKey);
  if (hit !== undefined) return hit === false ? null : hit;

  const lines = computeLineBreaks(collapsed, effWidth, fontStr, indentPx, wordSpacingPx, styled);
  if (!lines || lines.length === 0) { _lineCache.set(cacheKey, false); return null; }

  // Slice the inner HTML at the line boundaries (preserves inline tags).
  const lineHtmls = [];
  const hyphened = [];
  let remaining = inner;
  let consumed = 0;
  for (let li = 0; li < lines.length - 1; li++) {
    const localEnd = lines[li].endChar - consumed;
    if (localEnd <= 0) { _lineCache.set(cacheKey, false); return null; }
    const { headHtml, tailHtml } = splitHtmlByCharsPreservingTags(remaining, localEnd, { trimLeadingSpace: true });
    if (!headHtml) { _lineCache.set(cacheKey, false); return null; }
    lineHtmls.push(headHtml);
    hyphened.push(!!lines[li].pulledMidWord);
    remaining = tailHtml;
    consumed = lines[li].endChar + (collapsed[lines[li].endChar] === ' ' ? 1 : 0);
  }
  lineHtmls.push(remaining);
  hyphened.push(false);
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

  // Cut-line hyphen: the CUTTER pulled a syllable of the continuation's first
  // word into this block's last line (data-cut-hyphen) — draw the hyphen.
  const cutHyphen = /data-cut-hyphen/.test(open);

  const spans = lineHtmls.map((lh, i) => {
    const isLast = i === lineHtmls.length - 1;
    const parts = ['display:block'];
    parts.push(`text-align-last:${isLast ? finalAlign : 'justify'}`);
    if (i === 0 && indentPx > 0) parts.push(`text-indent:${indentPx.toFixed(2)}px`);
    // Hyphen pull: the line ends mid-word (a syllable of the next line's
    // first word was pulled up) — draw the hyphen, like print.
    const body = (hyphened[i] || (isLast && cutHyphen)) ? `${lh}-` : lh;
    return `<span class="el-line" style="${parts.join(';')};">${body}</span>`;
  }).join('');

  const closeTag = (outer.match(/<\/[a-zA-Z]+>\s*$/) || ['</p>'])[0];
  const result = newOpen + spans + closeTag;

  if (_lineCache.size > MAX_LINE_CACHE) _lineCache.clear();
  _lineCache.set(cacheKey, result);
  return result;
};

/**
 * Line count under the EXACT model the line renderer draws with (greedy,
 * dash-aware, full effective width, per-run fonts). Used by the height engine
 * for engine-lines blocks so planned heights equal drawn heights.
 *
 * @param {string} text - collapsed plain text
 * @param {number} width - effective column width (NO justify slack)
 * @param {string} fontStr - base font string
 * @param {number} indentPx
 * @param {number} wordSpacingPx
 * @param {object|null} styled - { charStyles, fonts } for inline runs
 * @returns {number} line count (0 = unavailable)
 */
export const countEngineLines = (text, width, fontStr, indentPx, wordSpacingPx, styled = null) => {
  const lines = computeLineBreaks(text, width, fontStr, indentPx, wordSpacingPx, styled, true);
  return lines ? lines.length : 0;
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
