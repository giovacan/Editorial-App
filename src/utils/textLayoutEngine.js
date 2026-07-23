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

import { countLinesKP, countLinesFromRunsKP } from './knuthPlassAdapter.js';
import {
  getCtx,
  buildFontString,
  normalizeWidth,
  measureWordWidth,
  getSpaceWidth,
  _paragraphLayoutCache,
  MAX_PARAGRAPH_CACHE,
  KP_WORD_THRESHOLD,
  getParagraphCacheKey,
} from './textMeasurement.js';
import {
  collapseWhitespace,
  splitWordsAtDashes,
  REPLACED_TAGS,
  extractTextRuns,
  hasStyledRuns,
  extractStyles,
  resolveSize,
  parseMultiElementHtml,
  parseMultiElementHtmlWorker,
  parseHtmlElement,
} from './textPreprocess.js';
import { readImageDims, scaleImage } from './images.js';
import {
  countLines,
  countLinesFromRuns,
  getLineBreakPositions,
  getLineBreakPositionsFromRuns,
  getLineBreakPositionsKP,
  countHyphenationMetrics,
} from './lineBreaking.js';
import { countEngineLines } from './lineRenderer.js';
import { measureTableHeight } from './tableLayoutEngine.js';

// Re-export getLineBreakPositionsKP for consumers that import it from textLayoutEngine
export { getLineBreakPositionsKP } from './lineBreaking.js';

// ─── Element height calculator ──────────────────────────────────────

const calculateElementHeight = (parsed, layoutCtx) => {
  if (!parsed) return 0;

  const { baseFontSizePx, baseLineHeight, contentWidth, fontFamily, widthSlack = 0, noHyphenation = false } = layoutCtx;
  const { text, styles, tag, runs } = parsed;

  // --- Block replaced elements (img, video, etc.) ---
  if (REPLACED_TAGS.has(tag)) {
    const marginTopPx = resolveSize(styles.marginTop, styles.marginTopUnit, baseFontSizePx);
    const marginBottomPx = resolveSize(styles.marginBottom, styles.marginBottomUnit, baseFontSizePx);
    // IMG (B2): prefer an explicit height (px) — paginateChapters pre-sizes the
    // image via scaleImage and emits width/height so measured == drawn. Else
    // scale from the precomputed intrinsic dims (data-w/data-h) here.
    if (tag === 'IMG') {
      if (styles.height) {
        const hPx = resolveSize(styles.height, styles.heightUnit, baseFontSizePx);
        if (hPx > 0) return marginTopPx + hPx + marginBottomPx;
      }
      const dims = parsed.outerHtml ? readImageDims(parsed.outerHtml) : null;
      if (dims || !styles.minHeight) {
        const box = scaleImage(dims, contentWidth, layoutCtx.images || {}, layoutCtx.contentHeight || 0);
        return marginTopPx + box.height + marginBottomPx;
      }
    }
    // Explicit min-height, or the legacy 4-line default (video/svg/unknown dims).
    const h = styles.minHeight
      ? resolveSize(styles.minHeight, styles.minHeightUnit, baseFontSizePx)
      : baseFontSizePx * baseLineHeight * 4;
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
    const paddingV = resolveSize(styles.paddingTop, styles.paddingTopUnit, elFontSizePx)
                   + resolveSize(styles.paddingBottom, styles.paddingBottomUnit, elFontSizePx);
    return marginTopPx + paddingV + lineCount * lineHeightPx + marginBottomPx;
  }

  // --- Table: real deterministic grid layout (tableLayoutEngine) ---
  if (tag === 'TABLE') {
    const tableHtml = parsed.innerHTML || '';
    // Native measurement (cell wrapping at fixed col widths); includes the
    // table's own vertical margins — return as-is, like the estimate did.
    const native = measureTableHeight(tableHtml, layoutCtx);
    if (native != null) return native;
    // Fallback estimate for tables the grid engine rejects.
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

  // --- DIV with child block elements (e.g. chapter title with decorative lines) ---
  // When a DIV contains inner <div> children, we must recursively measure them
  // instead of treating all text as a single paragraph. This is critical for
  // chapter title blocks: <div data-chapter-start><div>[hr]</div><div>[title]</div><div>[hr]</div></div>
  // Depth guard prevents infinite recursion on deeply nested structures.
  if (tag === 'DIV' && parsed.innerHTML && /<div[\s>]/i.test(parsed.innerHTML)
      && (layoutCtx._divRecursionDepth || 0) < 3) {
    const marginTopPx = resolveSize(styles.marginTop, styles.marginTopUnit, baseFontSizePx);
    const marginBottomPx = resolveSize(styles.marginBottom, styles.marginBottomUnit, baseFontSizePx);
    const paddingTopPx = resolveSize(styles.paddingTop, styles.paddingTopUnit, baseFontSizePx);
    const paddingBottomPx = resolveSize(styles.paddingBottom, styles.paddingBottomUnit, baseFontSizePx);
    // Recursively measure inner HTML with incremented depth guard
    const innerCtx = { ...layoutCtx, _divRecursionDepth: (layoutCtx._divRecursionDepth || 0) + 1 };
    const innerHeight = measureHtmlHeight(parsed.innerHTML, innerCtx);
    return marginTopPx + paddingTopPx + innerHeight + paddingBottomPx + marginBottomPx;
  }

  // --- Empty element with no text ---
  if (!text?.trim()) {
    // Elements with display:flex + min-height (like fullPage title)
    if (styles.display === 'flex' && styles.minHeight) {
      return resolveSize(styles.minHeight, styles.minHeightUnit, baseFontSizePx);
    }
    // Empty elements with borders (e.g. decorative HR-like divs)
    const borderTopH = styles.borderTopWidth || 0;
    const borderBottomH = styles.borderBottomWidth || 0;
    if (borderTopH || borderBottomH) {
      const marginTopPx = resolveSize(styles.marginTop, styles.marginTopUnit, baseFontSizePx);
      const marginBottomPx = resolveSize(styles.marginBottom, styles.marginBottomUnit, baseFontSizePx);
      return marginTopPx + borderTopH + borderBottomH + marginBottomPx;
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

  // Lists: every <li> starts its own rendered line (often several). Counting
  // the joined text as one paragraph undercounts lines — measure per item.
  if ((tag === 'UL' || tag === 'OL') && parsed.innerHTML && /<li/i.test(parsed.innerHTML)) {
    const items = parsed.innerHTML.match(/<li[^>]*>[\s\S]*?<\/li>/gi) || [];
    if (items.length > 0) {
      let liLines = 0;
      for (const it of items) {
        const t = collapseWhitespace(it.replace(/<[^>]*>/g, ' ')).trim();
        liLines += t
          ? countLines(t, availableWidth, fontString, 0, letterSpacingPx, wordSpacingPx, noHyphenation)
          : 1;
      }
      const liMarginTop = resolveSize(styles.marginTop, styles.marginTopUnit, elFontSizePx);
      const liMarginBottom = resolveSize(styles.marginBottom, styles.marginBottomUnit, elFontSizePx);
      const liPaddingV = resolveSize(styles.paddingTop, styles.paddingTopUnit, elFontSizePx)
        + resolveSize(styles.paddingBottom, styles.paddingBottomUnit, elFontSizePx);
      return liMarginTop + liPaddingV + liLines * lineHeightPx + liMarginBottom;
    }
  }

  // Explicit <br> line breaks (verse, poetry, addresses): each segment starts
  // a fresh rendered line the width-based counter cannot see. Count each
  // segment independently; empty segments (<br><br>) count as one blank line.
  if (parsed.innerHTML && /<br[\s/>]/i.test(parsed.innerHTML)) {
    const segments = parsed.innerHTML.split(/<br\s*\/?>/i);
    let brLines = 0;
    for (let si = 0; si < segments.length; si++) {
      const segText = collapseWhitespace(segments[si].replace(/<[^>]*>/g, ' ')).trim();
      if (!segText) { brLines += 1; continue; }
      brLines += countLines(
        segText, availableWidth, fontString,
        si === 0 ? indentPx : 0, letterSpacingPx, wordSpacingPx, noHyphenation
      );
    }
    const brContentH = brLines * lineHeightPx;
    const brMarginTop = resolveSize(styles.marginTop, styles.marginTopUnit, elFontSizePx);
    const brMarginBottom = resolveSize(styles.marginBottom, styles.marginBottomUnit, elFontSizePx);
    const brPaddingV = resolveSize(styles.paddingTop, styles.paddingTopUnit, elFontSizePx)
      + resolveSize(styles.paddingBottom, styles.paddingBottomUnit, elFontSizePx);
    return brMarginTop + brPaddingV + brContentH + brMarginBottom;
  }

  const collapsedText = collapseWhitespace(text);

  // ── Engine-lines height model ────────────────────────────────────────
  // When the deterministic line renderer will DRAW this block, count its
  // lines with the renderer's EXACT walker (greedy, dash-aware, full width,
  // per-run fonts) so planned height === rendered height. The old KP-at-
  // slack-width model overcounted lines for these blocks, which showed up as
  // bottom holes the vertical justification couldn't see.
  let elCounted = false;
  if (layoutCtx.engineLinesRender && (tag === 'P' || tag === 'BLOCKQUOTE')) {
    const innerH = parsed.innerHTML || '';
    const rendable = innerH.indexOf('&') === -1
      && !/<span[^>]*style=/i.test(innerH)
      && !/<(br|img|table|ul|ol|h[1-6]|div|blockquote)[\s/>]/i.test(innerH);
    if (rendable) {
      let styled = null;
      let ok = true;
      if (runs && runs.length > 0 && hasStyledRuns(runs)) {
        const charStyles = [];
        let joined = '';
        for (const r of runs) {
          if (r.fontSize) { ok = false; break; }
          const s = (r.bold ? 1 : 0) | (r.italic ? 2 : 0);
          joined += r.text;
          for (let k = 0; k < r.text.length; k++) charStyles.push(s);
        }
        if (ok) {
          styled = {
            charStyles,
            fonts: [
              buildFontString(elFontSizePx, fontFamily, isBold, isItalic),
              buildFontString(elFontSizePx, fontFamily, true, isItalic),
              buildFontString(elFontSizePx, fontFamily, isBold, true),
              buildFontString(elFontSizePx, fontFamily, true, true),
            ],
            text: joined,
          };
        }
      }
      if (ok) {
        const effW = contentWidth - paddingH - marginLPx - marginRPx - borderLeft;
        const walkText = styled ? collapseWhitespace(styled.text) : collapsedText;
        const elKey = getParagraphCacheKey(walkText, fontString, effW, indentPx, wordSpacingPx) + '|EL' + (styled ? 'r' : 'p');
        const c = _paragraphLayoutCache.get(elKey);
        if (c !== undefined) {
          lineCount = c;
          elCounted = true;
        } else {
          const cnt = countEngineLines(walkText, effW, fontString, indentPx, wordSpacingPx, styled);
          if (cnt > 0) {
            lineCount = cnt;
            elCounted = true;
            _paragraphLayoutCache.set(elKey, cnt);
          }
        }
      }
    }
  }

  // Check paragraph cache first
  const cacheKey = getParagraphCacheKey(collapsedText, fontString, availableWidth, indentPx, wordSpacingPx) + (noHyphenation ? '|noHyph' : '');
  const cached = elCounted ? lineCount : _paragraphLayoutCache.get(cacheKey);
  if (!elCounted) {
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
  }

  // Calculate content height
  const contentH = lineCount * lineHeightPx;

  // Resolve vertical margins
  const marginTopPx = resolveSize(styles.marginTop, styles.marginTopUnit, elFontSizePx);
  const marginBottomPx = resolveSize(styles.marginBottom, styles.marginBottomUnit, elFontSizePx);
  const paddingV = resolveSize(styles.paddingTop, styles.paddingTopUnit, elFontSizePx)
                + resolveSize(styles.paddingBottom, styles.paddingBottomUnit, elFontSizePx);

  return marginTopPx + paddingV + contentH + marginBottomPx;
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
// Hoisted function declaration so calculateElementHeight can call it
// for recursive measurement of nested block elements (e.g. chapter titles).
export function measureHtmlHeight(html, layoutCtx) {
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
}

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

// ─── Page-level line break injection ─────────────────────────────────────
//
// Inserts <br> into every paragraph of a page at the EXACT positions where
// the Canvas engine breaks lines. This forces the browser to render the same
// line breaks as Canvas predicted, eliminating the DOM↔Canvas height delta.
//
// Must run on the main thread (uses document.createElement / TreeWalker).

/**
 * Insert explicit <br> line breaks into all paragraphs of a page's HTML.
 * Uses the same measurement parameters as calculateElementHeight so the
 * break positions match the engine's line count exactly.
 *
 * @param {string} pageHtml - Full page HTML (multiple elements)
 * @param {object} layoutCtx - { baseFontSizePx, baseLineHeight, contentWidth, fontFamily, widthSlack, noHyphenation }
 * @returns {string} HTML with <br> inserted at engine-computed line breaks
 */
export const insertPageLineBreaks = (pageHtml, layoutCtx) => {
  if (!pageHtml || !layoutCtx || !layoutCtx.contentWidth) return pageHtml;
  if (typeof document === 'undefined') return pageHtml; // Worker — no DOM

  try {
    const container = document.createElement('div');
    container.innerHTML = pageHtml;
    let modified = false;
    const _dbg = process.env.NODE_ENV === 'development';
    let _dbgProcessed = 0, _dbgSkippedTag = 0, _dbgSkippedEmpty = 0, _dbgSkippedSingle = 0, _dbgSkippedBold = 0, _dbgBrInserted = 0;

    for (const el of Array.from(container.children)) {
      const tag = el.tagName?.toUpperCase();
      // Only process text paragraphs and blockquotes
      if (tag !== 'P' && tag !== 'BLOCKQUOTE') { _dbgSkippedTag++; continue; }

      const text = el.textContent || '';
      if (!text.trim()) { _dbgSkippedEmpty++; continue; }

      // Extract styles using DOM CSSStyleDeclaration (resolves shorthand correctly)
      const styles = extractStyles(el.style);

      // Resolve font properties (same logic as calculateElementHeight)
      const elFontSizePx = styles.fontSize
        ? resolveSize(styles.fontSize, styles.fontSizeUnit, layoutCtx.baseFontSizePx)
        : layoutCtx.baseFontSizePx;
      const isBold = styles.fontWeight === 'bold' || parseInt(styles.fontWeight) >= 700;
      const isItalic = styles.fontStyle === 'italic';
      const fontString = buildFontString(elFontSizePx, layoutCtx.fontFamily || 'Georgia, serif', isBold, isItalic);

      // Resolve indent
      const indentPx = styles.textIndent ? styles.textIndent * elFontSizePx : 0;

      // Resolve word-spacing (already baked into inline style by KP pass)
      const wordSpacingPx = styles.wordSpacing
        ? resolveSize(styles.wordSpacing, styles.wordSpacingUnit, elFontSizePx)
        : 0;
      const letterSpacingPx = styles.letterSpacing
        ? resolveSize(styles.letterSpacing, styles.letterSpacingUnit, elFontSizePx)
        : 0;

      // Resolve available width (same as calculateElementHeight)
      const paddingH = (styles.paddingLeft || 0) + (styles.paddingRight || 0);
      const marginLPx = resolveSize(styles.marginLeft, styles.marginLeftUnit, elFontSizePx);
      const marginRPx = resolveSize(styles.marginRight, styles.marginRightUnit, elFontSizePx);
      const borderLeft = styles.borderLeftWidth || 0;
      const widthSlack = layoutCtx.widthSlack || 0;
      const headingSlack = /^H[1-6]$/.test(tag) ? 3 : 0;
      const availableWidth = layoutCtx.contentWidth - paddingH - marginLPx - marginRPx - borderLeft - widthSlack - headingSlack;
      if (availableWidth <= 0) continue;

      // Extract text runs for mixed-style detection
      const runs = extractTextRuns(el, { bold: isBold, italic: isItalic, fontSize: null });
      const hasStyled = runs && runs.length > 0 && hasStyledRuns(runs);

      // Skip all-bold/italic paragraphs — inserting <br> inside <strong>/<em>
      // creates malformed HTML that loses styling on the second fragment.
      if (runs && runs.length === 1 && (runs[0].bold || runs[0].italic)) { _dbgSkippedBold++; continue; }

      // Get line break positions using the SAME logic as the pagination engine:
      // KP (Knuth-Plass) with greedy fallback. For styled runs, use greedy only.
      let lineStarts;
      if (hasStyled) {
        lineStarts = getLineBreakPositionsFromRuns(runs, availableWidth, elFontSizePx, layoutCtx.fontFamily || 'Georgia, serif', indentPx, wordSpacingPx);
      } else {
        const collapsed = collapseWhitespace(text);
        const kpResult = getLineBreakPositionsKP(collapsed, availableWidth, fontString, indentPx, wordSpacingPx);
        lineStarts = kpResult ? kpResult.lineStarts : getLineBreakPositions(collapsed, availableWidth, fontString, indentPx, letterSpacingPx, wordSpacingPx);
      }

      if (!lineStarts || lineStarts.length <= 1) { _dbgSkippedSingle++; continue; } // Single line — no breaks needed

      _dbgProcessed++;

      // ── Map engine word indices to DOM text node positions ──
      //
      // lineStarts[] are indices into the engine's dash-split word array.
      // We build a flat (node, offset) array with one entry per engine word
      // by walking all DOM text nodes and splitting their content the same way
      // the engine does: extract non-whitespace tokens, then split at em/en-dashes.

      const wordMap = []; // { node, offset } for each engine word
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let tNode;
      while ((tNode = walker.nextNode())) {
        const nodeText = tNode.textContent;
        // Find all non-whitespace tokens in this text node (same as space-split after collapse)
        const tokenRe = /\S+/g;
        let match;
        while ((match = tokenRe.exec(nodeText))) {
          const token = match[0];
          const tokenStart = match.index;
          // Apply the same dash-splitting as the engine
          const subWords = splitWordsAtDashes([token]);
          let subOffset = tokenStart;
          for (const sw of subWords) {
            // Find sw within token starting from subOffset
            const idx = nodeText.indexOf(sw, subOffset);
            wordMap.push({ node: tNode, offset: idx !== -1 ? idx : subOffset });
            subOffset = (idx !== -1 ? idx : subOffset) + sw.length;
          }
        }
      }

      // 3. Insert <br> at line break positions (reverse order to preserve offsets)
      const breakWordIndices = lineStarts.slice(1);
      let elModified = false;


      for (let b = breakWordIndices.length - 1; b >= 0; b--) {
        const wordIdx = breakWordIndices[b];
        if (wordIdx >= wordMap.length || !wordMap[wordIdx]?.node) continue;

        const { node, offset } = wordMap[wordIdx];
        const nodeText = node.textContent;

        // Find the start of whitespace before this word (trim trailing spaces from previous line)
        let splitAt = offset;
        while (splitAt > 0 && /\s/.test(nodeText[splitAt - 1])) splitAt--;

        if (splitAt > 0 && splitAt < nodeText.length) {
          const afterNode = node.splitText(splitAt);
          afterNode.textContent = afterNode.textContent.replace(/^\s+/, '');
          const br = document.createElement('br');
          afterNode.parentNode.insertBefore(br, afterNode);
          elModified = true;
        } else if (splitAt === 0) {
          // Word is at the start of a text node — insert <br> before the node
          node.textContent = nodeText.replace(/^\s+/, '');
          const br = document.createElement('br');
          node.parentNode.insertBefore(br, node);
          elModified = true;
        }
      }

      if (elModified) { modified = true; _dbgBrInserted++; }
    }

    return modified ? container.innerHTML : pageHtml;

  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[insertPageLineBreaks] Error, returning original:', e?.message);
    }
    return pageHtml;
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

// ─── Worker-safe KP word-spacing injection ─────────────────────────

/**
 * Apply Knuth-Plass word-spacing to page HTML — worker-safe version.
 *
 * For each <p> / <blockquote>: computes KP-optimal word-spacings, takes the
 * median, and injects it as an inline `word-spacing` style. This makes the
 * browser's justify rendering closer to KP-optimal spacing.
 *
 * Unlike `applyKpRendering` (which uses `document.createElement`), this
 * version uses regex-based parsing and works in Web Workers.
 *
 * @param {string} pageHtml — full page HTML (multiple elements)
 * @param {object} layoutCtx — { baseFontSizePx, fontFamily, contentWidth, widthSlack }
 * @returns {string} HTML with word-spacing injected (or original if no changes)
 */
export const applyKpWordSpacingWorkerSafe = (pageHtml, layoutCtx) => {
  if (!pageHtml || !layoutCtx || !layoutCtx.contentWidth) return pageHtml;

  try {
    const elements = parseMultiElementHtmlWorker(pageHtml);
    if (elements.length === 0) return pageHtml;

    let result = pageHtml;
    let modified = false;

    for (const el of elements) {
      const tag = el.tag;
      if (tag !== 'P' && tag !== 'BLOCKQUOTE') continue;

      const text = el.text;
      if (!text || !text.trim()) continue;

      // Skip styled-run paragraphs (mixed bold/italic/sizes)
      if (el.runs && hasStyledRuns(el.runs)) continue;

      // Skip uniformly bold or italic (single-style wrapper)
      if (el.runs && el.runs.length === 1 && (el.runs[0].bold || el.runs[0].italic)) continue;

      const styles = el.styles;
      const elFontSizePx = styles.fontSize
        ? resolveSize(styles.fontSize, styles.fontSizeUnit, layoutCtx.baseFontSizePx)
        : layoutCtx.baseFontSizePx;
      const isBold   = styles.fontWeight === 'bold' || parseInt(styles.fontWeight) >= 700;
      const isItalic = styles.fontStyle === 'italic';
      const fontStr  = buildFontString(elFontSizePx, layoutCtx.fontFamily, isBold, isItalic);

      const indentPx = styles.textIndent ? styles.textIndent * elFontSizePx : 0;

      const paddingH  = (styles.paddingLeft || 0) + (styles.paddingRight || 0);
      const marginLPx = resolveSize(styles.marginLeft,  styles.marginLeftUnit,  elFontSizePx);
      const marginRPx = resolveSize(styles.marginRight, styles.marginRightUnit, elFontSizePx);
      const borderL   = styles.borderLeftWidth || 0;
      const availW    = layoutCtx.contentWidth - paddingH - marginLPx - marginRPx - borderL
                        - (layoutCtx.widthSlack || 0);
      if (availW <= 0) continue;

      const wsFromStyle = styles.wordSpacing
        ? resolveSize(styles.wordSpacing, styles.wordSpacingUnit, elFontSizePx)
        : 0;

      const collapsed = collapseWhitespace(text);
      const kp = getLineBreakPositionsKP(collapsed, availW, fontStr, indentPx, wsFromStyle);
      if (!kp || kp.lineStarts.length <= 1) continue;

      const nonLastSpacings = kp.wordSpacings.slice(0, kp.lineStarts.length - 1);
      if (nonLastSpacings.length === 0) continue;
      nonLastSpacings.sort((a, b) => a - b);
      const mid = Math.floor(nonLastSpacings.length / 2);
      const medianWs = nonLastSpacings.length % 2 === 1
        ? nonLastSpacings[mid]
        : (nonLastSpacings[mid - 1] + nonLastSpacings[mid]) / 2;

      if (Math.abs(medianWs) < 0.01) continue;

      // Browser-model guard: the browser breaks greedily at the FULL column
      // width. Positive word-spacing can push a borderline line over and add
      // a rendered line the engine never accounted for (the +1/+2-line DOM
      // overflows found by the layout audit). Apply the spacing only if the
      // greedy line count at browser width stays unchanged.
      const browserW = layoutCtx.contentWidth - paddingH - marginLPx - marginRPx - borderL;
      if (browserW > 0 && medianWs > 0) {
        const linesBefore = countLines(collapsed, browserW, fontStr, indentPx, 0, wsFromStyle, true);
        const linesAfter  = countLines(collapsed, browserW, fontStr, indentPx, 0, medianWs, true);
        if (linesAfter > linesBefore) continue;
      }

      // Inject word-spacing into the element's inline style via regex.
      // Match the opening tag of this element using its innerHTML prefix as anchor.
      const escaped = el.innerHTML.substring(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const elPattern = new RegExp(
        `(<${tag.toLowerCase()}\\b[^>]*?)\\bstyle="([^"]*)"([^>]*>${escaped})`,
        'i'
      );
      const match = result.match(elPattern);
      if (match) {
        // Never retune word-spacing on split fragments: changing it re-flows
        // the paragraph AFTER the page cut was decided, pushing words off the
        // cut line and leaving stretched 1-2 word leftovers at page bottom.
        if (/data-split-head|data-continuation/.test(match[0])) continue;
        const currentStyle = match[2].replace(/word-spacing\s*:[^;]+;?/g, '').replace(/;?\s*$/, '');
        const newStyle = `${currentStyle};word-spacing:${medianWs.toFixed(3)}px`;
        result = result.replace(elPattern, `$1style="${newStyle}"$3`);
        modified = true;
      }
    }

    return modified ? result : pageHtml;
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[applyKpWordSpacingWorkerSafe] Error, returning original:', e?.message);
    }
    return pageHtml;
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
  getLineBreakPositionsFromRuns,
  countHyphenationMetrics,
  getCtx
};

// Also export ensureFontsReady so callers that import from here continue to work
export { ensureFontsReady } from './textMeasurement.js';
