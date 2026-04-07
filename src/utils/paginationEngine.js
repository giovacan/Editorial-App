import { measureHtmlHeight, insertHtmlLineBreaks } from './textLayoutEngine';
import {
  extractInlineStyle,
  getInnerHtml as getIrInnerHtml,
  getFirstBlock,
  htmlToText,
  truncateHtmlByCharsPreservingTags as irTruncateHtmlByCharsPreservingTags,
  splitHtmlByCharsPreservingTags as irSplitHtmlByCharsPreservingTags
} from './layoutIr.js';

export const splitParagraphByLines = (html, /* unused */ measureDiv, maxHeight, textAlign, hasIndent = false, indentValue = 1.5, preserveFirstIndent = false, canvasCtx = null) => {

  // canvasCtx is the canonical layout context built once in paginateChapters.
  // All layout geometry comes from here — no fallback to measureDiv.style.
  const PX_PER_PT = 96 / 72;
  const effectiveTextAlign = canvasCtx?.textAlign || textAlign;
  const effectiveBaseLineHeight = canvasCtx?.baseLineHeight || 1.6;
  const effectiveBaseFontSizePt = canvasCtx ? canvasCtx.baseFontSizePx / PX_PER_PT : 12;

  // Deterministic measure function (Canvas, no DOM layout)
  const measure = (htmlStr) => measureHtmlHeight(htmlStr, canvasCtx);

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

    let low = 0;
    let high = text.length;
    let fitLength = 0;

    const innerHtmlStr = getIrInnerHtml(remainingHtml);

    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      const trialHtml = irTruncateHtmlByCharsPreservingTags(innerHtmlStr, mid);
      const wrapper = isBlockquote
        ? `<blockquote style="${testStyle}">${trialHtml}</blockquote>`
        : `<p style="${testStyle}">${trialHtml}</p>`;

      // DETERMINISTIC: Canvas measurement
      measuredHeight = measure(wrapper);

      if (measuredHeight <= maxHeight) {
        fitLength = mid;
        low = mid;
      } else {
        high = mid - 1;
      }
    }

    if (fitLength === 0) {
      lines.push(remainingHtml);
      break;
    }

    const lastSpace = text.substring(0, fitLength).lastIndexOf(' ');
    let breakPoint = lastSpace > fitLength * 0.5 ? lastSpace : fitLength;

    const indent = computeIndent(isFirstChunk);

    // ============ Worker-safe split that preserves inline HTML ============
    // Split innerHtmlStr at breakPoint (text chars), preserving all HTML tags
    let chunkHtml;
    let newRemainingHtml = '';

    {
      const previewChunk = irTruncateHtmlByCharsPreservingTags(innerHtmlStr, breakPoint);
      const chunkText = htmlToText(previewChunk);
      const lastSpaceInChunk = chunkText.lastIndexOf(' ');
      const finalBreakInText = lastSpaceInChunk > breakPoint * 0.5 ? lastSpaceInChunk : breakPoint;
      const splitResult = irSplitHtmlByCharsPreservingTags(innerHtmlStr, finalBreakInText, { trimLeadingSpace: true });
      chunkHtml = splitResult.headHtml;
      newRemainingHtml = splitResult.tailHtml.trim();
    }

    // Wrap chunk with the same style used in the binary search measurement (testStyle = getChunkStyle).
    // Using raw originalStyles here would cause a testStyle/finalStyle mismatch that leads to overflow.
    let finalStyle = originalStyles
      ? getChunkStyle(isFirstChunk)
      : (isBlockquote
        ? getQuoteStyle(effectiveQuoteConfig, quoteTemplate, effectiveBaseFontSizePt, effectiveBaseLineHeight, effectiveTextAlign)
        : `margin:0;padding:0;text-align:${effectiveTextAlign};text-indent:${indent};text-justify:inter-word;hyphens:none;text-align-last:left;overflow-wrap:break-word;`);

    // When paragraph continues to next page: the last visible line is a mid-paragraph
    // line. Keep text-align-last:left so Canvas and DOM agree on line count.
    // (text-align-last:justify stretches the last line in the DOM but Canvas doesn't
    // simulate it, causing Canvas to over-count lines → fill pass thinks page is full)
    // No replacement needed — finalStyle already has text-align-last:left from above.

    if (isBlockquote) {
      chunkHtml = `<blockquote class="quote ${quoteTemplate}" style="${finalStyle}"${newRemainingHtml ? ' data-split-head="true"' : ''}>${chunkHtml}</blockquote>`;
    } else {
      chunkHtml = `<p style="${finalStyle}"${newRemainingHtml ? ' data-split-head="true"' : ''}>${chunkHtml}</p>`;
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
      const isMidSentence = restStartsLower || !/[.!?»"\u201D\u2026]\s*$/.test(chunkPlainText);

      let continuationStyle;
      if (isMidSentence) {
        // ============ FIX 2: Force text-indent: 0 for mid-sentence continuations ============
        if (originalStyles) {
          continuationStyle = originalStyles.replace(/text-indent:[^;]+;?/gi, '').replace(/;?\s*$/, ';') + 'text-indent:0;';
        } else if (isBlockquote) {
          continuationStyle = getQuoteStyle(effectiveQuoteConfig, quoteTemplate, effectiveBaseFontSizePt, effectiveBaseLineHeight, effectiveTextAlign);
        } else {
          continuationStyle = `margin:0;padding:0;text-align:${effectiveTextAlign};text-indent:0;text-justify:inter-word;hyphens:none;text-align-last:left;overflow-wrap:break-word;`;
        }
      } else {
        // Chunk ends at sentence boundary — rest is a new paragraph, give it indent
        const indentVal = hasIndent ? indentValue + 'em' : '0';
        if (originalStyles) {
          continuationStyle = originalStyles.replace(/text-indent:[^;]+;?/gi, '').replace(/;?\s*$/, ';') + `text-indent:${indentVal};`;
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
    parsedTitle = parseChapterTitleHierarchy(chapter.title);
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
