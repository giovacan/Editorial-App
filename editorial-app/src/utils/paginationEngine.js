import { measureHtmlHeight, insertHtmlLineBreaks } from './textLayoutEngine';

export const splitParagraphByLines = (html, measureDiv, maxHeight, textAlign, hasIndent = false, indentValue = 1.5, preserveFirstIndent = false, quoteConfig = null) => {

  // Build Canvas layout context from quoteConfig (passed from paginateChapters)
  const effectiveBaseFontSize = quoteConfig?.baseFontSize || 12;
  const effectiveBaseLineHeight = quoteConfig?.baseLineHeight || 1.6;
  const effectiveTextAlign = quoteConfig?.textAlign || textAlign;
  const PX_PER_PT = 96 / 72;
  const baseFontSizePx = effectiveBaseFontSize * PX_PER_PT;

  // Build canvasCtx for deterministic measurement
  const effectiveContentWidth = measureDiv ? parseFloat(measureDiv.style?.width) || 400 : 400;
  const justifySlack = effectiveTextAlign === 'justify' ? effectiveContentWidth * 0.02 : 0;
  const canvasCtx = {
    baseFontSizePx,
    baseLineHeight: effectiveBaseLineHeight,
    contentWidth: effectiveContentWidth,
    fontFamily: measureDiv ? (measureDiv.style?.fontFamily || 'Georgia, serif') : 'Georgia, serif',
    widthSlack: justifySlack,
    lineHeightPx: quoteConfig?.lineHeightPx || Math.ceil(baseFontSizePx * effectiveBaseLineHeight)
  };

  // Deterministic measure function (Canvas, no DOM layout)
  const measure = (htmlStr) => measureHtmlHeight(htmlStr, canvasCtx);

  const lines = [];
  let remainingHtml = html;
  let isFirstChunk = true;

  const isBlockquote = html.toLowerCase().includes('<blockquote');
  const quoteMatch = html.match(/class="quote\s+(\w+)"/);
  const quoteTemplate = quoteMatch ? quoteMatch[1] : 'classic';

  const extractInlineStyles = (htmlString) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = htmlString;
    const el = tmp.firstElementChild;
    if (el && el.style && el.style.cssText) {
      return el.style.cssText;
    }
    return null;
  };

  const originalStyles = extractInlineStyles(html);

  const defaultQuoteConfig = {
    enabled: true, indentLeft: 2, indentRight: 2, showLine: true,
    italic: true, sizeMultiplier: 0.95, marginTop: 1, marginBottom: 1
  };

  const effectiveQuoteConfig = quoteConfig?.config || defaultQuoteConfig;

  const computeIndent = (isFirst) =>
    isFirst
      ? (preserveFirstIndent ? '0' : (hasIndent ? indentValue + 'em' : '0'))
      : '0';

  const getChunkStyle = (isFirst) => {
    const indent = computeIndent(isFirst);
    if (originalStyles) {
      const cleanStyles = originalStyles.replace(/text-indent:[^;]+;?/gi, '');
      return `${cleanStyles}text-indent:${indent};`.replace(/;;/g, ';');
    }
    if (isBlockquote) {
      return getQuoteStyle(effectiveQuoteConfig, quoteTemplate, effectiveBaseFontSize, effectiveBaseLineHeight, effectiveTextAlign);
    }
    return `margin:0;padding:0;text-align:${textAlign};text-indent:${indent};text-justify:inter-word;hyphens:none;text-align-last:left;overflow-wrap:break-word;`;
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

    const tmp = document.createElement('div');
    tmp.innerHTML = remainingHtml;
    const text = tmp.textContent || '';

    if (!text.trim()) {
      lines.push(remainingHtml);
      break;
    }

    let low = 0;
    let high = text.length;
    let fitLength = 0;

    // Helper: Clone element and truncate textContent to maxChars, preserving HTML structure
    const truncateHtmlClone = (htmlElement, maxChars) => {
      const clone = htmlElement.cloneNode(true);
      let remaining = maxChars;
      const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
      const toRemove = [];
      let node;
      while ((node = walker.nextNode())) {
        if (remaining <= 0) {
          toRemove.push(node);
        } else if (node.length > remaining) {
          node.textContent = node.textContent.substring(0, remaining);
          remaining = 0;
        } else {
          remaining -= node.length;
        }
      }
      toRemove.forEach(n => n.parentNode && n.parentNode.removeChild(n));
      return clone.innerHTML;
    };

    const tmpInner = tmp.firstElementChild || tmp;

    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      const trialHtml = truncateHtmlClone(tmpInner, mid);
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

    // ============ FIX 1: DOM-aware split that preserves inline HTML ============
    // Instead of using text.substring() which loses HTML, walk the DOM to split at exact character
    const splitDiv = window.document.createElement('div');
    splitDiv.innerHTML = remainingHtml;
    const innerEl = splitDiv.firstElementChild || splitDiv;

    let chunkHtml;
    let newRemainingHtml = '';

    try {
      const walker = window.document.createTreeWalker(innerEl, NodeFilter.SHOW_TEXT);
      let accumulated = 0;
      let cutNode = null;
      let cutOffset = 0;
      let node;

      // Find the text node that contains our breakPoint
      while ((node = walker.nextNode())) {
        if (accumulated + node.length >= breakPoint) {
          cutNode = node;
          cutOffset = breakPoint - accumulated;
          break;
        }
        accumulated += node.length;
      }

      if (cutNode) {
        // Split the text node at the exact character offset
        const afterNode = cutNode.splitText(cutOffset);

        // FIRST: extract the continuation from the DOM (this modifies innerEl)
        if (afterNode && afterNode.parentNode) {
          const range = window.document.createRange();
          range.setStartBefore(afterNode);
          range.setEnd(innerEl, innerEl.childNodes.length);
          const frag = range.extractContents();

          const contDiv = window.document.createElement('div');
          contDiv.appendChild(frag);
          newRemainingHtml = contDiv.innerHTML.trim();
        }

        // SECOND: capture the chunk (now innerEl only contains what fits)
        chunkHtml = innerEl.innerHTML;
      } else {
        // If no cutNode found, use the entire HTML as chunk
        chunkHtml = innerEl.innerHTML;
        newRemainingHtml = '';
      }
    } catch (e) {
      console.error('❌ DOM split error in splitParagraphByLines, falling back to text split:', e, 'remainingHtml:', remainingHtml.substring(0, 100));
      // Fallback to text-based split if DOM manipulation fails
      const chunkText = text.substring(0, breakPoint);
      chunkHtml = chunkText;
      newRemainingHtml = text.substring(breakPoint);
    }

    // Wrap chunk with the same style used in the binary search measurement (testStyle = getChunkStyle).
    // Using raw originalStyles here would cause a testStyle/finalStyle mismatch that leads to overflow.
    let finalStyle = originalStyles
      ? getChunkStyle(isFirstChunk)
      : (isBlockquote
        ? getQuoteStyle(effectiveQuoteConfig, quoteTemplate, effectiveBaseFontSize, effectiveBaseLineHeight, effectiveTextAlign)
        : `margin:0;padding:0;text-align:${textAlign};text-indent:${indent};text-justify:inter-word;hyphens:none;text-align-last:left;overflow-wrap:break-word;`);
    // When paragraph continues to next page: justify the last line too
    // so the text looks continuous (not like the paragraph ends here).
    if (newRemainingHtml) {
      finalStyle = finalStyle.replace(/text-align-last:[^;]+;?/gi, '') + 'text-align-last:justify;';
    }

    if (isBlockquote) {
      chunkHtml = `<blockquote class="quote ${quoteTemplate}" style="${finalStyle}">${chunkHtml}</blockquote>`;
    } else {
      chunkHtml = `<p style="${finalStyle}">${chunkHtml}</p>`;
    }

    lines.push(chunkHtml);
    isFirstChunk = false;
    remainingHtml = newRemainingHtml;

    if (remainingHtml) {
      // ============ FIX 2: Force text-indent: 0 for continuations ============ 
      // Even if originalStyles exists, continuation should NOT have the first-line indent
      let continuationStyle;
      if (originalStyles) {
        // Remove any existing text-indent and force to 0
        continuationStyle = originalStyles.replace(/text-indent:[^;]+;?/gi, '') + 'text-indent:0;';
      } else if (isBlockquote) {
        continuationStyle = getQuoteStyle(effectiveQuoteConfig, quoteTemplate, effectiveBaseFontSize, effectiveBaseLineHeight, effectiveTextAlign);
      } else {
        continuationStyle = `margin:0;padding:0;text-align:${textAlign};text-indent:0;text-justify:inter-word;hyphens:none;text-align-last:left;overflow-wrap:break-word;`;
      }

      if (isBlockquote) {
        remainingHtml = `<blockquote class="quote ${quoteTemplate}" style="${continuationStyle}">${remainingHtml}</blockquote>`;
      } else {
        remainingHtml = `<p style="${continuationStyle}">${remainingHtml}</p>`;
      }
    }
  }
  
  return lines;
};

export const getQuoteStyle = (qConfig, template, baseFontSize, baseLineHeight, textAlign) => {
  const baseStyle = `font-style:${qConfig.italic ? 'italic' : 'normal'};font-size:${baseFontSize * qConfig.sizeMultiplier}pt;text-align:${textAlign};text-justify:inter-word;hyphens:none;`;

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
  const tag = el.tagName;
  const indent = config.paragraph?.firstLineIndent || 1.5;

  if (tag === 'P' || tag === 'DIV') {
    const parentBlockquote = el.closest('blockquote');
    if (parentBlockquote && config.quote?.enabled) {
      const qConfig = config.quote;
      const template = parentBlockquote.classList.contains('quote')
        ? Array.from(parentBlockquote.classList).find(c => ['classic', 'bar', 'italic', 'indent', 'minimal'].includes(c)) || 'classic'
        : 'classic';
      return `<p style="${getQuoteStyle(qConfig, template, baseFontSize, baseLineHeight, textAlign)}text-indent:${isFirstParagraph ? '0' : indent + 'em'};text-align-last:left;overflow-wrap:break-word;">${el.innerHTML}</p>`;
    } else {
      const spacingBetween = config.paragraph?.spacingBetween || 0;
      return `<p style="margin:${spacingBetween > 0 ? spacingBetween + 'em' : '0'} 0;padding:0;text-align:${textAlign};text-indent:${isFirstParagraph ? '0' : indent + 'em'};text-justify:inter-word;hyphens:none;text-align-last:left;overflow-wrap:break-word">${el.innerHTML}</p>`;
    }
  } else if (tag.match(/^H[1-6]$/i)) {
    const level = tag.slice(1).toLowerCase();
    const subConfig = config.subheaders?.[level] || config.subheaders?.h2 || { align: 'center', bold: true, sizeMultiplier: 1.25, marginTop: 1, marginBottom: 0.5, minLinesAfter: 1 };
    const subSize = Math.round(baseFontSize * subConfig.sizeMultiplier);
    const lineHeightPx = Math.ceil(baseFontSize * (96 / 72) * baseLineHeight);
    const subMarginTop = subConfig.marginTop * lineHeightPx;
    const subMarginBottom = subConfig.marginBottom * lineHeightPx;
    return `<h${level} style="font-size:${subSize}pt;font-weight:${subConfig.bold ? 'bold' : 'normal'};margin:${subMarginTop}px 0 ${subMarginBottom}px 0;text-align:${subConfig.align};line-height:1.3;">${el.innerHTML}</h${level}>`;
  } else if (tag === 'BLOCKQUOTE' && config.quote?.enabled) {
    const qConfig = config.quote;
    const template = Array.from(el.classList).find(c => ['classic', 'bar', 'italic', 'indent', 'minimal'].includes(c)) || 'classic';
    return `<blockquote class="quote ${template}" style="${getQuoteStyle(qConfig, template, baseFontSize, baseLineHeight, textAlign)}">${el.innerHTML}</blockquote>`;
  } else if (tag === 'UL' || tag === 'OL') {
    return `<${tag.toLowerCase()} style="margin:0.5em 0;padding-left:1.5em;text-align:${textAlign};text-justify:inter-word;hyphens:none;">${el.innerHTML}</${tag.toLowerCase()}>`;
  } else if (tag === 'HR') {
    return '<hr style="border:none;border-top:1px solid #999;margin:1em 0;">';
  } else if (tag === 'BR') {
    return '<br>';
  }
  return `<p style="margin:0;padding:0;text-align:${textAlign};text-indent:1.5em;text-justify:inter-word;hyphens:none;text-align-last:left;overflow-wrap:break-word">${el.innerHTML}</p>`;
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
        titleHtml = `<div style="margin:${spacedTop}px 0 ${titleMarginBottom}px 0;text-align:center;"><div style="${hrTop}"></div><div style="${titleBaseStyle}padding:${titleMarginBottom / 2}px 0;">${renderTitleInner()}</div><div style="${hrBottom}"></div></div>`;
      } else {
        titleHtml = `<div style="${titleBaseStyle}margin:${spacedTop}px 0 ${titleMarginBottom}px 0;">${renderTitleInner()}</div>`;
      }
      break;
    }
    case 'halfPage': {
      const halfTop = Math.round((contentHeight * 0.5) - titleSize - titleMarginBottom);
      if (ctConfig.showLines) {
        const hrTop = getHrStyle();
        const hrBottom = getHrStyle();
        titleHtml = `<div style="margin:${Math.max(0, halfTop)}px 0 ${titleMarginBottom}px 0;text-align:center;"><div style="${hrTop}"></div><div style="${titleBaseStyle}padding:${titleMarginBottom / 2}px 0;">${renderTitleInner()}</div><div style="${hrBottom}"></div></div>`;
      } else {
        titleHtml = `<div style="${titleBaseStyle}margin:${Math.max(0, halfTop)}px 0 ${titleMarginBottom}px 0;">${renderTitleInner()}</div>`;
      }
      break;
    }
    case 'fullPage': {
      if (ctConfig.showLines) {
        const hrTop = getHrStyle(ctConfig.lineStyle === 'double' ? 3 : 1);
        const hrBottom = getHrStyle(ctConfig.lineStyle === 'double' ? 3 : 1);
        titleHtml = `<div style="${titleBaseStyle}display:flex;align-items:center;justify-content:center;min-height:${contentHeight}px;flex-direction:column;"><div style="${hrTop}"></div><div>${renderTitleInner()}</div><div style="${hrBottom}"></div></div>`;
      } else {
        titleHtml = `<div style="${titleBaseStyle}display:flex;align-items:center;justify-content:center;min-height:${contentHeight}px;flex-direction:column;"><div>${renderTitleInner()}</div></div>`;
      }
      break;
    }
    default: {
      if (ctConfig.showLines) {
        const hrTop = getHrStyle();
        const hrBottom = getHrStyle();
        titleHtml = `<div style="margin:${titleMarginTop}px 0 ${titleMarginBottom}px 0;text-align:center;"><div style="${hrTop}"></div><div style="${titleBaseStyle}padding:${titleMarginBottom / 2}px 0;">${renderTitleInner()}</div><div style="${hrBottom}"></div></div>`;
      } else {
        titleHtml = `<div style="${titleBaseStyle}margin:${titleMarginTop}px 0 ${titleMarginBottom}px 0;">${renderTitleInner()}</div>`;
      }
    }
  }
  
  return { titleHtml, ctConfig };
};

export const shouldStartOnRightPage = (chapter, _chapterIndex, config) => {
  const isSection = chapter.type === 'section';
  return isSection ? false : (config.chapterTitle?.startOnRightPage !== false);
};

export const detectQuotes = (html) => {
  // DEBUG: Log quote detection parameters
  console.log('🔍 detectQuotes called with:', {
    htmlLength: html.length,
    htmlPreview: html.substring(0, 100) + '...'
  });
  
  const detectedQuotes = [];
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  const patterns = {
    guionLargo: /^[\s]*—/,
    comillasItalianas: /^[\s]*[«『]/,
    comillasInglesas: /^[\s]*[""]/,
    comillasBajas: /^[\s]*[„]/,
  };
  
  const findQuotes = (element, parentIndex = 0) => {
    // DEBUG: Log quote detection progress
    console.log('🔍 findQuotes processing element:', {
      nodeType: element.nodeType,
      tagName: element.tagName,
      textContent: element.textContent?.substring(0, 50) + '...',
      parentIndex
    });
    
    if (element.nodeType === Node.TEXT_NODE) {
      const text = element.textContent;
      if (!text.trim()) return;
      
      for (const [patternName, pattern] of Object.entries(patterns)) {
        if (pattern.test(text)) {
          const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
          detectedQuotes.push({
            text: text.trim(),
            type: 'quote',
            detectedBy: patternName,
            wordCount,
            startIndex: parentIndex,
            confidence: 0.9
          });
          // DEBUG: Log detected quote
          console.log('✅ Quote detected:', {
            pattern: patternName,
            text: text.trim().substring(0, 50) + '...',
            wordCount,
            startIndex: parentIndex
          });
          break;
        }
      }
      return;
    }
    
    if (element.nodeType === Node.ELEMENT_NODE) {
      const tagName = element.tagName.toLowerCase();
      
      if (tagName === 'em' || tagName === 'i' || element.style.fontStyle === 'italic') {
        const text = element.textContent || '';
        const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
        
        if (wordCount > 15) {
          detectedQuotes.push({
            text: text.trim(),
            type: 'quote',
            detectedBy: 'long_italic',
            wordCount,
            startIndex: parentIndex,
            confidence: 0.7
          });
        } else if (wordCount <= 5) {
          detectedQuotes.push({
            text: text.trim(),
            type: 'emphasis',
            detectedBy: 'short_italic',
            wordCount,
            startIndex: parentIndex,
            confidence: 0.8
          });
        }
      }
      
      if (tagName === 'blockquote') {
        const text = element.textContent || '';
        detectedQuotes.push({
          text: text.trim(),
          type: 'quote',
          detectedBy: 'existing_blockquote',
          wordCount: text.split(/\s+/).length,
          startIndex: parentIndex,
          confidence: 1.0,
          isManual: true
        });
      }
      
      let childIndex = parentIndex;
      for (const child of element.childNodes) {
        findQuotes(child, childIndex);
        childIndex++;
      }
    }
  };
  
  findQuotes(tempDiv);
  return detectedQuotes;
};

export const applyQuoteTemplate = (text, template = 'classic', config = {}) => {
  // DEBUG: Log applyQuoteTemplate parameters
  console.log('🎭 applyQuoteTemplate called with:', {
    textLength: text.length,
    textPreview: text.substring(0, 50) + '...',
    template,
    config
  });
  
  const templates = {
    classic: {
      open: '<blockquote class="quote classic">',
      close: '</blockquote>'
    },
    bar: {
      open: '<blockquote class="quote bar">',
      close: '</blockquote>'
    },
    italic: {
      open: '<blockquote class="quote italic">',
      close: '</blockquote>'
    },
    indent: {
      open: '<blockquote class="quote indent">',
      close: '</blockquote>'
    },
    minimal: {
      open: '<blockquote class="quote minimal">',
      close: '</blockquote>'
    }
  };
  
  const tpl = templates[template] || templates.classic;
  return tpl.open + text + tpl.close;
};

export const wrapInQuote = (html, template = 'classic') => {
  // DEBUG: Log wrapInQuote parameters
  console.log('🎭 wrapInQuote called with:', {
    htmlLength: html.length,
    htmlPreview: html.substring(0, 50) + '...',
    template
  });
  
  const result = applyQuoteTemplate(html, template);
  
  // DEBUG: Log wrapInQuote result
  console.log('🎭 wrapInQuote result:', {
    resultLength: result.length,
    resultPreview: result.substring(0, 100) + '...'
  });
  
  return result;
};

export const unwrapQuote = (html) => {
  // DEBUG: Log unwrapQuote parameters
  console.log('🎭 unwrapQuote called with:', {
    htmlLength: html.length,
    htmlPreview: html.substring(0, 50) + '...'
  });
  
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  const blockquotes = tempDiv.querySelectorAll('blockquote.quote');
  blockquotes.forEach(bq => {
    const parent = bq.parentNode;
    while (bq.firstChild) {
      parent.insertBefore(bq.firstChild, bq);
    }
    parent.removeChild(bq);
  });
  
  const result = tempDiv.innerHTML;
  
  // DEBUG: Log unwrapQuote result
  console.log('🎭 unwrapQuote result:', {
    resultLength: result.length,
    resultPreview: result.substring(0, 100) + '...'
  });
  
  return result;
};
