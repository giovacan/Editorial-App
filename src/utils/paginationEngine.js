import { measureHtmlHeight, buildFontString } from './textLayoutEngine';
import { collapseWhitespace, splitWordsAtDashes } from './textPreprocess.js';
import { parseInlineRuns, measureStyled, resolveHorizontalBoxPx } from './lineRenderer.js';
import { fittingHyphenPrefix } from './spanishHyphen.js';
import {
  extractInlineStyle,
  getInnerHtml as getIrInnerHtml,
  getFirstBlock,
  htmlToText,
  splitHtmlByCharsPreservingTags as irSplitHtmlByCharsPreservingTags
} from './layoutIr.js';

/**
 * Find the character position (in collapsed plain text) where the last complete
 * line within maxLines ends. Dash-aware: em/en-dashes are line-break
 * opportunities in the browser (and in countLines), so they must be modeled
 * here too — otherwise the predicted cut line diverges from what the DOM
 * renders and stray words appear alone after the jump.
 *
 * Returns an object:
 *   { pos, lastLineWords, lastLineWidth, prevPos, lastTokenAdvance }
 *   pos = -1 when everything fits, 0 when unusable.
 */
const findSplitPos = (collapsed, maxLines, availableWidth, fontStr, indentPx, wordSpacingPx, ctx2d, styled = null) => {
  if (!ctx2d || !collapsed || maxLines <= 0 || availableWidth <= 0) return { pos: 0 };

  ctx2d.font = fontStr;
  const spaceWidth = ctx2d.measureText(' ').width + wordSpacingPx;
  const measureToken = (t) => {
    if (!styled) { ctx2d.font = fontStr; return ctx2d.measureText(t.text).width; }
    return measureStyled(ctx2d, t.text, t.end - t.text.length, styled.charStyles, styled.fonts);
  };
  const rawWords = collapsed.split(' ').filter(w => w.length > 0);
  if (rawWords.length === 0) return { pos: -1 };

  // Tokens with char ranges; dash fragments join their predecessor without a space.
  const tokens = [];
  let cp = 0;
  for (let wi = 0; wi < rawWords.length; wi++) {
    if (wi > 0) cp += 1; // the inter-word space
    const frags = splitWordsAtDashes([rawWords[wi]]);
    let f = cp;
    for (let fi = 0; fi < frags.length; fi++) {
      tokens.push({ text: frags[fi], end: f + frags[fi].length, joinsPrev: fi > 0 });
      f += frags[fi].length;
    }
    cp += rawWords[wi].length;
  }

  let lineCount = 1;
  let lineWidth = indentPx;
  let splitPos = 0;
  let lineTokens = []; // tokens on the (current) last line, with advances

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const ww = measureToken(t);
    const eff = i === 0 ? 0 : (t.joinsPrev ? 0 : spaceWidth);
    const needed = lineWidth + eff + ww;

    if (i > 0 && needed > availableWidth) {
      lineCount++;
      if (lineCount > maxLines) {
        // Token i starts the line beyond capacity — split before it
        return { pos: splitPos, lastLineWords: lineTokens.length, lastLineWidth: lineWidth, lineTokens };
      }
      lineWidth = ww;
      lineTokens = [{ end: t.end, advance: ww }];
    } else {
      lineWidth = needed;
      lineTokens.push({ end: t.end, advance: eff + ww });
    }

    splitPos = t.end;
  }

  return { pos: -1 }; // all lines fit
};

export const splitParagraphByLines = (html, /* unused */ measureDiv, maxHeight, textAlign, hasIndent = false, indentValue = 1.5, preserveFirstIndent = false, canvasCtx = null) => {

  // canvasCtx is the canonical layout context built once in paginateChapters.
  // All layout geometry comes from here — no fallback to measureDiv.style.
  const PX_PER_PT = 96 / 72;
  const effectiveTextAlign = canvasCtx?.textAlign || textAlign;
  const effectiveBaseLineHeight = canvasCtx?.baseLineHeight || 1.6;
  const effectiveBaseFontSizePt = canvasCtx ? canvasCtx.baseFontSizePx / PX_PER_PT : 12;

  // Deterministic measure function (Canvas, no DOM layout)
  const measure = (htmlStr) => measureHtmlHeight(htmlStr, canvasCtx);

  // Paragraphs with explicit <br> breaks (verse, poetry, scripture quotes):
  // never cut mid-verse — split BETWEEN verses (at <br> boundaries). The floor
  // is line-based, not verse-based: each side must keep ≥2 RENDERED lines
  // (verse-count floors made 2-3 verse scripture quotes atomic and forced
  // multi-line holes on quote-heavy books).
  if (/<br[\s/>]/i.test(html)) {
    const measureBr = (h) => measureHtmlHeight(h, canvasCtx);
    const inner = getIrInnerHtml(html);
    const segs = inner.split(/<br\s*\/?>/i);
    const openTagM = html.match(/^<[^>]+>/);
    const closeTagM = html.match(/<\/[a-zA-Z]+>\s*$/);
    if (segs.length < 2 || !openTagM || !closeTagM) return [html];
    const cleanOpen = openTagM[0]
      .replace(/\s*data-split-head="[^"]*"/gi, '')
      .replace(/\s*data-continuation="[^"]*"/gi, '')
      // Verse chunks end at natural verse boundaries — never stretch them.
      .replace(/text-align-last:\s*[^;"]+/i, 'text-align-last:left');
    const build = (arr, attr) =>
      cleanOpen.replace(/>$/, `${attr}>`) + arr.join('<br>') + closeTagM[0];
    const lineH = canvasCtx?.lineHeightPx || 10;
    let k = -1;
    for (let t = 1; t <= segs.length - 1; t++) {
      if (measureBr(build(segs.slice(0, t), ' data-split-head="true"')) <= maxHeight) k = t;
      else break;
    }
    if (k < 1) return [html];
    const head = build(segs.slice(0, k), ' data-split-head="true"');
    // Verse continuation: same paragraph — never indented.
    const restOpen = cleanOpen.replace(/text-indent:\s*[^;"]+/i, 'text-indent:0');
    const rest = restOpen.replace(/>$/, ' data-continuation="true">') + segs.slice(k).join('<br>') + closeTagM[0];
    // Line-level orphan/widow floors: ≥2 rendered lines on each side.
    if (measureBr(head) < lineH * 2 || measureBr(rest) < lineH * 2) return [html];
    return [head, rest];
  }

  const lines = [];
  let remainingHtml = html;
  let isFirstChunk = true;

  const sourceBlock = getFirstBlock(html);
  const isBlockquote = sourceBlock?.tag === 'BLOCKQUOTE';
  const quoteTemplate = sourceBlock?.classList?.find((cls) =>
    ['classic', 'bar', 'italic', 'indent', 'minimal'].includes(cls)
  ) || 'classic';
  const originalStyles = extractInlineStyle(html);

  const defaultQuoteConfig = {
    enabled: true, indentLeft: 2, indentRight: 2, showLine: true,
    italic: true, sizeMultiplier: 0.95, marginTop: 1, marginBottom: 1
  };

  const effectiveQuoteConfig = canvasCtx?.quoteConfig || defaultQuoteConfig;

  const computeIndent = (isFirst) =>
    isFirst
      ? (preserveFirstIndent ? '0' : (hasIndent ? indentValue + 'em' : '0'))
      : '0';

  const getChunkStyle = (isFirst) => {
    const indent = computeIndent(isFirst);
    if (originalStyles) {
      const cleanStyles = originalStyles.replace(/text-indent:[^;]+;?/gi, '').replace(/;?\s*$/, ';');
      return `${cleanStyles}text-indent:${indent};`.replace(/;;/g, ';');
    }
    if (isBlockquote) {
      return getQuoteStyle(effectiveQuoteConfig, quoteTemplate, effectiveBaseFontSizePt, effectiveBaseLineHeight, effectiveTextAlign);
    }
    return `margin:0;padding:0;text-align:${effectiveTextAlign};text-indent:${indent};text-justify:inter-word;hyphens:none;text-align-last:left;overflow-wrap:break-word;`;
  };

  const getDefaultStyle = () => getChunkStyle(isFirstChunk);

  while (remainingHtml) {
    const testStyle = getDefaultStyle();

    // DETERMINISTIC: Use Canvas measurement instead of measureDiv.offsetHeight
    let measuredHeight = measure(remainingHtml);

    if (measuredHeight <= maxHeight) {
      lines.push(remainingHtml);
      break;
    }

    // Worker-safe: strip HTML tags to get plain text
    const text = htmlToText(remainingHtml);

    if (!text.trim()) {
      lines.push(remainingHtml);
      break;
    }

    const innerHtmlStr = getIrInnerHtml(remainingHtml);
    const indent = computeIndent(isFirstChunk);

    // Line-based word-boundary split.
    // Compute how many lines fit in maxHeight, then cut at the end of the
    // last complete line — always at a space, never mid-word.
    const lineHeightPx = canvasCtx?.lineHeightPx || Math.ceil(effectiveBaseFontSizePt * PX_PER_PT * effectiveBaseLineHeight);
    const maxLines = Math.max(1, Math.floor(maxHeight / lineHeightPx));

    // Resolve the paragraph's font from its inline style
    const fontSizeM = (originalStyles || '').match(/font-size:\s*([\d.]+)(pt|px|em)/i);
    let splitFontSizePx = canvasCtx?.baseFontSizePx || (effectiveBaseFontSizePt * PX_PER_PT);
    if (fontSizeM) {
      const [, val, unit] = fontSizeM;
      splitFontSizePx = unit === 'pt' ? parseFloat(val) * PX_PER_PT :
                        unit === 'em' ? parseFloat(val) * splitFontSizePx :
                        parseFloat(val);
    }
    const splitIsBold = /font-weight:\s*(bold|[7-9]\d\d)/.test(originalStyles || '');
    const splitIsItalic = /font-style:\s*italic/.test(originalStyles || '');
    const splitFontStr = buildFontString(splitFontSizePx, canvasCtx?.fontFamily || 'Georgia, serif', splitIsBold, splitIsItalic);

    const textIndentM = (originalStyles || '').match(/text-indent:\s*([\d.]+)em/i);
    const splitIndentPx = (isFirstChunk && textIndentM) ? parseFloat(textIndentM[1]) * splitFontSizePx : 0;
    // Cut walk width = the SAME effective width the line renderer draws with:
    // full content width (no justify slack) minus the block's own horizontal
    // box (quote margins/padding/border). Cutting at any other width lets the
    // rendered composition drift and spill a lone word after the cut.
    const splitAvailW = (canvasCtx?.contentWidth || 0)
      - resolveHorizontalBoxPx(originalStyles || '', splitFontSizePx);
    const wsM = (originalStyles || '').match(/word-spacing:\s*([\d.]+)px/i);
    const splitWordSpacingPx = wsM ? parseFloat(wsM[1]) : 0;

    const collapsed = collapseWhitespace(text);

    // Run-aware cut walk: bold/italic segments measure wider than the base
    // font; walking them plain desynced the cut line from the renderer
    // (reported: lone small word after a cut on an italicized quote).
    let splitStyled = null;
    {
      const innerNow = getIrInnerHtml(remainingHtml);
      if (/<(strong|b|em|i|span)[\s>]/i.test(innerNow)) {
        const runsNow = parseInlineRuns(innerNow);
        // Exact text equality guarantees charStyles ↔ collapsed offsets align.
        if (runsNow && runsNow.text === collapsed) {
          splitStyled = {
            charStyles: runsNow.charStyles,
            fonts: [
              splitFontStr,
              buildFontString(splitFontSizePx, canvasCtx?.fontFamily || 'Georgia, serif', true, splitIsItalic),
              buildFontString(splitFontSizePx, canvasCtx?.fontFamily || 'Georgia, serif', splitIsBold, true),
              buildFontString(splitFontSizePx, canvasCtx?.fontFamily || 'Georgia, serif', true, true),
            ],
          };
        }
      }
    }

    let splitInfo = findSplitPos(
      collapsed, maxLines, splitAvailW, splitFontStr,
      splitIndentPx, splitWordSpacingPx, canvasCtx?.ctx2d, splitStyled
    );

    // ── LEY DE LA LÍNEA DE CORTE ─────────────────────────────────────────
    // The cut line (last visible line before the page jump) must be full
    // enough to justify: ≥6 words at ≥68% width, or ≥85% width. If not, the
    // whole short line moves to the next page (retreat one line): a sparse
    // line before a jump reads as a broken paragraph ("texto mocho").
    // Additionally, a cut line packed beyond 97.5% of the column gets its last
    // token pushed to the continuation — zero headroom is how the DOM ends up
    // wrapping that word into a lone stretched line.
    let cutLineLawMet = false;
    if (splitInfo.pos > 0 && canvasCtx?.ctx2d) {
      // Law: 6+ words at ≥68% width, or ≥85%. The 93% ceiling is a DOM
      // tolerance band needed ONLY when the browser re-breaks lines; with
      // deterministic line rendering wrapping is impossible, so saturated cut
      // lines are welcome (maximum fill). Line rendering phase 1 covers plain
      // <p> only — blocks with inline runs or quotes stay native and keep the
      // ceiling.
      // Line rendering now covers plain P, runs (<strong>/<em>) and quotes;
      // only entities and styled <span> remain native (renderer bails there).
      const wrapSafe = canvasCtx?.engineLinesRender === true
        && !/&|<span[^>]*style=/i.test(remainingHtml);
      const lawOk = (s) => {
        if (!s || s.pos <= 0) return false;
        const ratio = s.lastLineWidth / splitAvailW;
        if (!wrapSafe && ratio > 0.93) return false;
        return (s.lastLineWords >= 6 && ratio >= 0.68) || ratio >= 0.85;
      };

      // DOM-headroom band: a cut line packed beyond 93% of the column has no
      // tolerance — any sub-pixel Canvas↔DOM difference wraps its tail word
      // into a lone stretched line. Drop tokens until the line sits at ≤93%
      // (justify absorbs the remainder invisibly across 6+ words).
      const applyHeadroomBand = (info) => {
        if (!info || info.pos <= 0 || !Array.isArray(info.lineTokens)) return info;
        const toks = info.lineTokens.slice();
        let width = info.lastLineWidth;
        while (toks.length > 6 && width / splitAvailW > 0.93) {
          const popped = toks.pop();
          width -= popped.advance;
        }
        if (toks.length === info.lineTokens.length) return info;
        return {
          ...info,
          pos: toks[toks.length - 1].end,
          lastLineWords: toks.length,
          lastLineWidth: width,
          lineTokens: toks,
        };
      };

      // Guionado en el corte: when the cut line is short because its NEXT
      // word is long (the reported "última línea sin justificar"), pull a
      // syllable prefix of that word into the cut line — the page ends in
      // "conti-" and the next page starts "nuar", like print books do.
      // The hyphen itself is drawn by the renderer (data-cut-hyphen), so the
      // stored text stays intact for EPUB.
      const tryHyphenExtend = (info) => {
        if (!info || info.pos <= 0 || !canvasCtx?.ctx2d) return null;
        const ratio = info.lastLineWidth / splitAvailW;
        if (ratio >= 0.68) return null; // only short cut lines need it
        const spaceAt = collapsed[info.pos] === ' ' ? 1 : 0;
        const restStr = collapsed.slice(info.pos + spaceAt);
        const nextWord = (restStr.match(/^\S+/) || [''])[0];
        if (!nextWord) return null;
        const ctx2d = canvasCtx.ctx2d;
        // Word style: for runs, only extend when the word is style-uniform.
        if (splitStyled) {
          const s0 = splitStyled.charStyles[info.pos + spaceAt] || 0;
          for (let k = 1; k < nextWord.length; k++) {
            if ((splitStyled.charStyles[info.pos + spaceAt + k] || 0) !== s0) return null;
          }
          ctx2d.font = splitStyled.fonts[s0];
        } else {
          ctx2d.font = splitFontStr;
        }
        const spaceW = ctx2d.measureText(' ').width + splitWordSpacingPx;
        const avail = splitAvailW * 0.93 - info.lastLineWidth - spaceW;
        if (avail <= 0) return null;
        const prefix = fittingHyphenPrefix(nextWord, avail, ctx2d);
        if (!prefix) return null;
        const prefixW = ctx2d.measureText(prefix).width;
        return {
          ...info,
          pos: info.pos + spaceAt + prefix.length,
          lastLineWords: info.lastLineWords + 1,
          lastLineWidth: info.lastLineWidth + spaceW + prefixW,
          cutHyphen: true,
        };
      };

      if (!wrapSafe) splitInfo = applyHeadroomBand(splitInfo);
      if (lawOk(splitInfo)) {
        cutLineLawMet = true;
      } else {
        const extended = tryHyphenExtend(splitInfo);
        if (extended && lawOk(extended)) {
          splitInfo = extended;
          cutLineLawMet = true;
        } else {
          for (let retreat = 1; retreat <= 2 && maxLines - retreat >= 1; retreat++) {
            let rInfo = findSplitPos(
              collapsed, maxLines - retreat, splitAvailW, splitFontStr,
              splitIndentPx, splitWordSpacingPx, canvasCtx.ctx2d, splitStyled
            );
            if (rInfo.pos <= 0) break;
            if (!wrapSafe) rInfo = applyHeadroomBand(rInfo);
            if (!lawOk(rInfo)) {
              const rExt = tryHyphenExtend(rInfo);
              if (rExt && lawOk(rExt)) rInfo = rExt;
            }
            if (lawOk(rInfo)) {
              splitInfo = rInfo;
              cutLineLawMet = true;
              break;
            }
          }
        }
      }
    }

    const splitPos = splitInfo.pos;
    if (splitPos <= 0) {
      // Nothing fits or ctx2d unavailable — push as-is to avoid infinite loop
      lines.push(remainingHtml);
      break;
    }

    // ============ Split HTML at splitPos (always at a word boundary) ============
    let chunkHtml;
    let newRemainingHtml = '';

    {
      const splitResult = irSplitHtmlByCharsPreservingTags(innerHtmlStr, splitPos, { trimLeadingSpace: true });
      chunkHtml = splitResult.headHtml;
      newRemainingHtml = splitResult.tailHtml.trim();

      // Safety: if split produced an empty head, include at least 1 word
      if (!chunkHtml.trim() && newRemainingHtml) {
        const firstSpace = collapsed.indexOf(' ');
        const fallbackPos = firstSpace > 0 ? firstSpace : collapsed.length;
        const fallback = irSplitHtmlByCharsPreservingTags(innerHtmlStr, fallbackPos, { trimLeadingSpace: true });
        chunkHtml = fallback.headHtml;
        newRemainingHtml = fallback.tailHtml.trim();
      }
    }

    // Wrap chunk with the same style used in the binary search measurement (testStyle = getChunkStyle).
    // Using raw originalStyles here would cause a testStyle/finalStyle mismatch that leads to overflow.
    let finalStyle = originalStyles
      ? getChunkStyle(isFirstChunk)
      : (isBlockquote
        ? getQuoteStyle(effectiveQuoteConfig, quoteTemplate, effectiveBaseFontSizePt, effectiveBaseLineHeight, effectiveTextAlign)
        : `margin:0;padding:0;text-align:${effectiveTextAlign};text-indent:${indent};text-justify:inter-word;hyphens:none;text-align-last:left;overflow-wrap:break-word;`);

    // Split-head cut line: JUSTIFIED only when the cut-line law holds (≥6
    // words at ≥68% width, or ≥85% width). The cut line is an interior line
    // of the paragraph (it continues on the next page), so a full line must
    // read as normal justified text. If the law could not be satisfied even
    // after retreating, fall back to left alignment — stretching a sparse
    // line across the column is worse than a small right-edge gap.
    if (newRemainingHtml && effectiveTextAlign === 'justify' && cutLineLawMet) {
      finalStyle = finalStyle
        .replace(/text-align-last:[^;]+;?/gi, '')
        .replace(/;?\s*$/, ';') + 'text-align-last:justify;';
    } else if (newRemainingHtml) {
      finalStyle = finalStyle
        .replace(/text-align-last:[^;]+;?/gi, '')
        .replace(/;?\s*$/, ';') + 'text-align-last:left;';
    }

    const cutAttrs = `${newRemainingHtml ? ' data-split-head="true"' : ''}${newRemainingHtml && splitInfo.cutHyphen ? ' data-cut-hyphen="true"' : ''}`;
    if (isBlockquote) {
      chunkHtml = `<blockquote class="quote ${quoteTemplate}" style="${finalStyle}"${cutAttrs}>${chunkHtml}</blockquote>`;
    } else {
      chunkHtml = `<p style="${finalStyle}"${cutAttrs}>${chunkHtml}</p>`;
    }

    lines.push(chunkHtml);
    isFirstChunk = false;
    remainingHtml = newRemainingHtml;

    if (remainingHtml) {
      // Detect whether the split happened mid-sentence or at a sentence boundary.
      // Primary signal: if the rest chunk starts with a lowercase letter, it is
      // unambiguously a continuation regardless of how the chunk ended.
      // Secondary signal: if chunk ends without terminal punctuation (.!?»""…),
      // also treat as mid-sentence.
      // This covers cases where the chunk ends with a sentence that was itself cut
      // (e.g. "No se trata" ends with 'a' — no punct — but also cases where the
      // chunk ends with ." and the rest begins lowercase from the same sentence).
      const chunkPlainText = htmlToText(chunkHtml).trim();
      const restPlainText  = htmlToText(remainingHtml).trim();
      const restFirstLetter = restPlainText.match(/\p{L}/u)?.[0] || '';
      const restStartsLower = restFirstLetter && restFirstLetter === restFirstLetter.toLowerCase()
        && restFirstLetter !== restFirstLetter.toUpperCase();
      // The rest is ALWAYS a continuation of the same paragraph - even when
      // the cut fell exactly at a sentence end: a split paragraph NEVER
      // indents its continuation (the old sentence-boundary branch that
      // indented it was a typographic error).
      const isMidSentence = true; void restStartsLower; void chunkPlainText;

      let continuationStyle;
      if (isMidSentence) {
        // Mid-sentence continuation: no indent, last line is NOT stretched (it's a true
        // paragraph ending — left-align the last line like any normal paragraph).
        if (originalStyles) {
          continuationStyle = originalStyles
            .replace(/text-indent:[^;]+;?/gi, '')
            .replace(/text-align-last:[^;]+;?/gi, '')
            .replace(/;?\s*$/, ';') + 'text-indent:0;text-align-last:left;';
        } else if (isBlockquote) {
          continuationStyle = getQuoteStyle(effectiveQuoteConfig, quoteTemplate, effectiveBaseFontSizePt, effectiveBaseLineHeight, effectiveTextAlign);
        } else {
          continuationStyle = `margin:0;padding:0;text-align:${effectiveTextAlign};text-indent:0;text-justify:inter-word;hyphens:none;text-align-last:left;overflow-wrap:break-word;`;
        }
      } else {
        // Sentence-boundary split: rest is a new paragraph — indent it, last line left-aligned.
        const indentVal = hasIndent ? indentValue + 'em' : '0';
        if (originalStyles) {
          continuationStyle = originalStyles
            .replace(/text-indent:[^;]+;?/gi, '')
            .replace(/text-align-last:[^;]+;?/gi, '')
            .replace(/;?\s*$/, ';') + `text-indent:${indentVal};text-align-last:left;`;
        } else if (isBlockquote) {
          continuationStyle = getQuoteStyle(effectiveQuoteConfig, quoteTemplate, effectiveBaseFontSizePt, effectiveBaseLineHeight, effectiveTextAlign);
        } else {
          continuationStyle = `margin:0;padding:0;text-align:${effectiveTextAlign};text-indent:${indentVal};text-justify:inter-word;hyphens:none;text-align-last:left;overflow-wrap:break-word;`;
        }
      }

      if (isBlockquote) {
        remainingHtml = `<blockquote class="quote ${quoteTemplate}" style="${continuationStyle}"${isMidSentence ? ' data-continuation="true"' : ''}>${remainingHtml}</blockquote>`;
      } else {
        remainingHtml = `<p style="${continuationStyle}"${isMidSentence ? ' data-continuation="true"' : ''}>${remainingHtml}</p>`;
      }
    }
  }

  return lines;
};

/**
 * Split a UL/OL list at <li> boundaries when it doesn't fit in the available
 * height. Returns [headHtml, tailHtml] or null if the list can't be split
 * (e.g., 0 or 1 items, or first item alone doesn't fit).
 *
 * The head chunk keeps the list wrapper tag + style + as many <li> items as
 * fit. The tail chunk wraps the remaining items in the same list tag + style.
 *
 * @param {string} html - Full list HTML (<ul ...>...<li>...</li>...</ul>)
 * @param {number} maxHeight - Available height in px
 * @param {object} canvasCtx - Canvas layout context for measureHtmlHeight
 * @param {object} [opts] - { minOrphanItems: number (min items in head, default 1),
 *                            minWidowItems: number (min items in tail, default 1) }
 * @returns {[string, string] | null} [headHtml, tailHtml] or null
 */
export const splitListByItems = (html, maxHeight, canvasCtx, opts = {}) => {
  const { minOrphanItems = 1, minWidowItems = 1 } = opts;

  if (!html || !canvasCtx || maxHeight <= 0) return null;

  // Extract the list tag (ul/ol), its attributes, and inner HTML
  const openMatch = html.match(/^<(ul|ol)(\s[^>]*)?>(.+)<\/\1>$/is);
  if (!openMatch) return null;

  const listTag = openMatch[1];
  const listAttrs = openMatch[2] || '';
  const innerHtml = openMatch[3];

  // Split inner HTML into individual <li>...</li> items
  // This handles nested lists (li can contain ul/ol) by matching balanced tags
  const items = [];
  const liRegex = /<li\b[^>]*>[\s\S]*?<\/li>/gi;
  let match;
  while ((match = liRegex.exec(innerHtml)) !== null) {
    items.push(match[0]);
  }

  if (items.length < minOrphanItems + minWidowItems) return null;

  // Binary search for the maximum number of items that fit in maxHeight
  const wrap = (itemSlice) => `<${listTag}${listAttrs}>${itemSlice.join('')}</${listTag}>`;
  const measure = (itemSlice) => measureHtmlHeight(wrap(itemSlice), canvasCtx);

  // Quick check: if even the minimum head doesn't fit, can't split
  const minHead = items.slice(0, minOrphanItems);
  if (measure(minHead) > maxHeight) return null;

  // Find the maximum number of items that fit
  let lo = minOrphanItems;
  let hi = items.length - minWidowItems;
  let bestSplit = minOrphanItems;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const headItems = items.slice(0, mid);
    if (measure(headItems) <= maxHeight) {
      bestSplit = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (bestSplit < minOrphanItems) return null;
  if (items.length - bestSplit < minWidowItems) return null;

  const headHtml = wrap(items.slice(0, bestSplit));
  const tailHtml = wrap(items.slice(bestSplit));

  return [headHtml, tailHtml];
};

export const getQuoteStyle = (qConfig, template, baseFontSize, baseLineHeight, textAlign) => {
  const baseStyle = `font-style:${qConfig.italic ? 'italic' : 'normal'};font-size:${baseFontSize * qConfig.sizeMultiplier}pt;text-align:${textAlign};text-justify:inter-word;hyphens:none;text-align-last:left;`;

  switch (template) {
    case 'classic':
      return `margin:${qConfig.marginTop}em ${qConfig.indentRight}em ${qConfig.marginBottom}em ${qConfig.indentLeft}em;padding:0.5em 1em;border-left:${qConfig.showLine ? '3px solid #444' : 'none'};${baseStyle}`;
    case 'bar':
      return `margin:${qConfig.marginTop}em 0 ${qConfig.marginBottom}em 0;padding:0.5em 0 0.5em 1.5em;border-left:4px solid #666;${baseStyle}`;
    case 'italic':
      return `margin:${qConfig.marginTop}em ${qConfig.indentRight}em ${qConfig.marginBottom}em ${qConfig.indentLeft}em;padding:0.5em;font-style:italic;${baseStyle}`;
    case 'indent':
      return `margin:${qConfig.marginTop}em ${qConfig.indentRight + 1}em ${qConfig.marginBottom}em ${qConfig.indentLeft + 1}em;padding:0.5em;${baseStyle}`;
    case 'minimal':
      return `margin:${qConfig.marginTop}em ${qConfig.indentRight}em ${qConfig.marginBottom}em ${qConfig.indentLeft}em;padding:0.25em 0.5em;opacity:0.85;${baseStyle}`;
    default:
      return `margin:${qConfig.marginTop}em ${qConfig.indentRight}em ${qConfig.marginBottom}em ${qConfig.indentLeft}em;padding:0.5em 1em;border-left:${qConfig.showLine ? '3px solid #444' : 'none'};${baseStyle}`;
  }
};

export const buildParagraphHtml = (el, config, baseFontSize, baseLineHeight, textAlign, isFirstParagraph = false) => {
  // Accept both real DOM elements and descriptor objects { tag, innerHTML, outerHtml, style, dataset }
  const tag = (el.tagName || el.tag || '').toUpperCase();
  const innerHtml = el.innerHTML != null ? el.innerHTML : '';
  const outerHtmlStr = el.outerHTML || el.outerHtml || '';
  const indent = config.paragraph?.firstLineIndent || 1.5;

  if (tag === 'P' || tag === 'DIV') {
    // Check if this P is a direct child of a blockquote (DOM path) or if outerHtml shows it
    const parentBlockquote = typeof el.closest === 'function' ? el.closest('blockquote') : null;
    if (parentBlockquote && config.quote?.enabled) {
      const qConfig = config.quote;
      const template = parentBlockquote.classList.contains('quote')
        ? Array.from(parentBlockquote.classList).find(c => ['classic', 'bar', 'italic', 'indent', 'minimal'].includes(c)) || 'classic'
        : 'classic';
      return `<p${isFirstParagraph ? ' data-first-paragraph="true"' : ''} style="${getQuoteStyle(qConfig, template, baseFontSize, baseLineHeight, textAlign)}text-indent:${isFirstParagraph ? '0' : indent + 'em'};text-align-last:left;overflow-wrap:break-word;">${innerHtml}</p>`;
    } else {
      const spacingBetween = config.paragraph?.spacingBetween || 0;
      return `<p${isFirstParagraph ? ' data-first-paragraph="true"' : ''} style="margin:${spacingBetween > 0 ? spacingBetween + 'em' : '0'} 0;padding:0;text-align:${textAlign};text-indent:${isFirstParagraph ? '0' : indent + 'em'};text-justify:inter-word;hyphens:none;text-align-last:left;overflow-wrap:break-word;">${innerHtml}</p>`;
    }
  } else if (tag.match(/^H[1-6]$/i)) {
    const level = tag.slice(1).toLowerCase();
    const subConfig = config.subheaders?.[level] || config.subheaders?.h2 || { align: 'center', bold: true, sizeMultiplier: 1.25, marginTop: 1, marginBottom: 0.5, minLinesAfter: 1 };
    const subSize = Math.round(baseFontSize * subConfig.sizeMultiplier);
    const lineHeightPx = Math.ceil(baseFontSize * (96 / 72) * baseLineHeight);
    const subMarginTop = subConfig.marginTop * lineHeightPx;
    const subMarginBottom = subConfig.marginBottom * lineHeightPx;
    return `<h${level} style="font-size:${subSize}pt;font-weight:${subConfig.bold ? 'bold' : 'normal'};margin:${subMarginTop}px 0 ${subMarginBottom}px 0;text-align:${subConfig.align};line-height:1.3;">${innerHtml}</h${level}>`;
  } else if (tag === 'BLOCKQUOTE' && config.quote?.enabled) {
    const qConfig = config.quote;
    // Support both DOM classList and descriptor's outerHtml for class detection
    let template = 'classic';
    if (typeof el.classList !== 'undefined' && el.classList) {
      template = Array.from(el.classList).find(c => ['classic', 'bar', 'italic', 'indent', 'minimal'].includes(c)) || 'classic';
    } else {
      const classMatch = outerHtmlStr.match(/class="([^"]*)"/);
      if (classMatch) {
        template = classMatch[1].split(/\s+/).find(c => ['classic', 'bar', 'italic', 'indent', 'minimal'].includes(c)) || 'classic';
      }
    }
    return `<blockquote class="quote ${template}" style="${getQuoteStyle(qConfig, template, baseFontSize, baseLineHeight, textAlign)}">${innerHtml}</blockquote>`;
  } else if (tag === 'UL' || tag === 'OL') {
    return `<${tag.toLowerCase()} style="margin:0.5em 0;padding-left:1.5em;text-align:${textAlign};text-justify:inter-word;hyphens:none;text-align-last:left;">${innerHtml}</${tag.toLowerCase()}>`;
  } else if (tag === 'HR') {
    return '<hr style="border:none;border-top:1px solid #999;margin:1em 0;">';
  } else if (tag === 'BR') {
    return '<br>';
  }
  return `<p style="margin:0;padding:0;text-align:${textAlign};text-indent:1.5em;text-justify:inter-word;hyphens:none;text-align-last:left;overflow-wrap:break-word;">${innerHtml}</p>`;
};

export const parseChapterTitleHierarchy = (title) => {
  if (!title || typeof title !== 'string') {
    return { label: null, title: title || '', detected: false };
  }

  const patterns = [
    /^((?:cap[ií]tulo|chapter|cap\.?)\s+(?:#?\d+|[IVXLCDM]+|[a-z]+))\s*[:\-–—]\s*(.+)$/i,
    /^((?:parte?|part)\s+(?:#?\d+|[IVXLCDM]+|[a-z]+))\s*[:\-–—]\s*(.+)$/i,
    /^((?:libro|book)\s+(?:#?\d+|[IVXLCDM]+))\s*[:\-–—]\s*(.+)$/i,
    /^((?:secci[oó]n|section)\s+(?:#?\d+|[IVXLCDM]+))\s*[:\-–—]\s*(.+)$/i,
    /^(#?\d+\.)\s+(.+)$/,
    /^([IVXLCDM]+\.)\s+(.+)$/,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) {
      return { label: match[1].trim(), title: match[2].trim(), detected: true };
    }
  }

  return { label: null, title, detected: false };
};

export const buildChapterTitleHtml = (chapter, config, baseFontSize, lineHeightPx, contentHeight) => {

  const ctConfig = config.chapterTitle || {
    align: 'center',
    bold: true,
    sizeMultiplier: 1.8,
    marginTop: 2,
    marginBottom: 1,
    layout: 'continuous',
    showLines: false,
    lineWidth: 0.5,
    lineStyle: 'solid',
    lineColor: '#333333',
    lineWidthTitle: false
  };

  const titleSize = Math.round(baseFontSize * ctConfig.sizeMultiplier);
  const titleMarginTop = ctConfig.marginTop * lineHeightPx;
  const titleMarginBottom = ctConfig.marginBottom * lineHeightPx;
  const isSection = chapter.type === 'section';

  const titleBaseStyle = `font-size:${titleSize}pt;line-height:1.3;font-weight:${ctConfig.bold ? 'bold' : 'normal'};font-style:${isSection ? 'italic' : 'normal'};text-align:${ctConfig.align};`;

  const hierarchyEnabled = ctConfig.hierarchyEnabled !== false;
  let parsedTitle = { label: null, title: chapter.title, detected: false };
  if (hierarchyEnabled) {
    // Prefer the explicit structural fields the importer produced
    // (chapterLabel = "LECCIÓN 1", chapterName = "La Intención…"); fall back
    // to parsing the title string for chapters created before this existed.
    if (chapter.chapterLabel && chapter.chapterName) {
      parsedTitle = { label: chapter.chapterLabel, title: chapter.chapterName, detected: true };
    } else {
      parsedTitle = parseChapterTitleHierarchy(chapter.title);
    }
  }

  const renderTitleInner = () => {
    if (!parsedTitle.detected) return chapter.title;
    const labelSize = Math.round(baseFontSize * ctConfig.sizeMultiplier * (ctConfig.hierarchyLabelSizeMultiplier || 0.7));
    const mainTitleSize = Math.round(baseFontSize * ctConfig.sizeMultiplier * (ctConfig.hierarchyTitleSizeMultiplier || 1.0));
    const labelColor = ctConfig.hierarchyLabelColor || '#666666';
    const labelBold = ctConfig.hierarchyLabelBold ? 'bold' : 'normal';
    const gap = (ctConfig.hierarchyGap || 0.3) * lineHeightPx;
    return `<div style="font-size:${labelSize}pt;line-height:1.3;color:${labelColor};font-weight:${labelBold};margin-bottom:${gap}px;">${parsedTitle.label}</div><div style="font-size:${mainTitleSize}pt;line-height:1.3;">${parsedTitle.title}</div>`;
  };

  const layout = ctConfig.layout || 'continuous';
  let titleHtml;

  const getHrStyle = (widthMult = 1) => {
    const w = ctConfig.lineWidth || 0.5;
    const thickness = ctConfig.lineStyle === 'double' ? Math.max(3, w * 2) : w;
    let hrWidth = '100%';
    let hrMargin = '0';
    if (ctConfig.lineWidthTitle) {
      hrWidth = '50%';
      hrMargin = '0 auto';
    }
    return `border:none;border-top:${thickness}px ${ctConfig.lineStyle || 'solid'} ${ctConfig.lineColor || '#333'};width:${hrWidth};margin:${hrMargin};`;
  };

  switch (layout) {
    case 'spaced': {
      const spacedTop = Math.round(contentHeight * 0.25);
      if (ctConfig.showLines) {
        const hrTop = getHrStyle();
        const hrBottom = getHrStyle();
        titleHtml = `<div data-chapter-start="true" style="margin:${spacedTop}px 0 ${titleMarginBottom}px 0;text-align:center;"><div style="${hrTop}"></div><div style="${titleBaseStyle}padding:${titleMarginBottom / 2}px 0;">${renderTitleInner()}</div><div style="${hrBottom}"></div></div>`;
      } else {
        titleHtml = `<div data-chapter-start="true" style="${titleBaseStyle}margin:${spacedTop}px 0 ${titleMarginBottom}px 0;">${renderTitleInner()}</div>`;
      }
      break;
    }
    case 'halfPage': {
      const halfTop = Math.round((contentHeight * 0.5) - titleSize - titleMarginBottom);
      if (ctConfig.showLines) {
        const hrTop = getHrStyle();
        const hrBottom = getHrStyle();
        titleHtml = `<div data-chapter-start="true" style="margin:${Math.max(0, halfTop)}px 0 ${titleMarginBottom}px 0;text-align:center;"><div style="${hrTop}"></div><div style="${titleBaseStyle}padding:${titleMarginBottom / 2}px 0;">${renderTitleInner()}</div><div style="${hrBottom}"></div></div>`;
      } else {
        titleHtml = `<div data-chapter-start="true" style="${titleBaseStyle}margin:${Math.max(0, halfTop)}px 0 ${titleMarginBottom}px 0;">${renderTitleInner()}</div>`;
      }
      break;
    }
    case 'fullPage': {
      if (ctConfig.showLines) {
        const hrTop = getHrStyle(ctConfig.lineStyle === 'double' ? 3 : 1);
        const hrBottom = getHrStyle(ctConfig.lineStyle === 'double' ? 3 : 1);
        titleHtml = `<div data-chapter-start="true" style="${titleBaseStyle}display:flex;align-items:center;justify-content:center;min-height:${contentHeight}px;flex-direction:column;"><div style="${hrTop}"></div><div>${renderTitleInner()}</div><div style="${hrBottom}"></div></div>`;
      } else {
        titleHtml = `<div data-chapter-start="true" style="${titleBaseStyle}display:flex;align-items:center;justify-content:center;min-height:${contentHeight}px;flex-direction:column;"><div>${renderTitleInner()}</div></div>`;
      }
      break;
    }
    default: {
      // 'continuous' layout: title flows at the top of the page with minimal
      // top margin. The ctConfig.marginTop setting is editorial for spaced/halfPage;
      // for continuous it would just create a large blank area before the title.
      const continuousTop = Math.round(lineHeightPx * 0.5);
      if (ctConfig.showLines) {
        const hrTop = getHrStyle();
        const hrBottom = getHrStyle();
        titleHtml = `<div data-chapter-start="true" style="margin:${continuousTop}px 0 ${titleMarginBottom}px 0;text-align:center;"><div style="${hrTop}"></div><div style="${titleBaseStyle}padding:${titleMarginBottom / 2}px 0;">${renderTitleInner()}</div><div style="${hrBottom}"></div></div>`;
      } else {
        titleHtml = `<div data-chapter-start="true" style="${titleBaseStyle}margin:${continuousTop}px 0 ${titleMarginBottom}px 0;">${renderTitleInner()}</div>`;
      }
    }
  }

  return { titleHtml, ctConfig };
};

export const shouldStartOnRightPage = (chapter, _chapterIndex, config) => {
  const isSection = chapter.type === 'section';
  return isSection ? false : (config.chapterTitle?.startOnRightPage !== false);
};
