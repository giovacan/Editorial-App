export const splitParagraphByLines = (html, measureDiv, maxHeight, textAlign, hasIndent = false, indentValue = 1.5, preserveFirstIndent = false, quoteConfig = null) => {
  const lines = [];
  let remainingHtml = html;
  let isFirstChunk = true;

  const isBlockquote = html.toLowerCase().includes('<blockquote');
  const quoteMatch = html.match(/class="quote\s+(\w+)"/);
  const quoteTemplate = quoteMatch ? quoteMatch[1] : 'classic';

  // Extraer estilos inline existentes del HTML original (solo para referencia, no para aplicar directamente)
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
  
  // Create default quote config if none provided to ensure consistent styling
  const defaultQuoteConfig = {
    enabled: true,
    indentLeft: 2,
    indentRight: 2,
    showLine: true,
    italic: true,
    sizeMultiplier: 0.95,
    marginTop: 1,
    marginBottom: 1
  };
  
  const effectiveQuoteConfig = quoteConfig?.config || defaultQuoteConfig;
  const effectiveBaseFontSize = quoteConfig?.baseFontSize || 12;
  const effectiveBaseLineHeight = quoteConfig?.baseLineHeight || 1.6;
  const effectiveTextAlign = quoteConfig?.textAlign || textAlign;
  
  // Función para generar estilos con la sangría correcta según si es el primer chunk o no
  const getChunkStyle = (isFirst) => {
    // Si hay estilos originales, ajustamos solo el text-indent
    if (originalStyles) {
      const indent = (hasIndent && isFirst && preserveFirstIndent) ? '0' : (hasIndent ? indentValue + 'em' : '0');
      // Preservar todos los estilos originales pero ajustar text-indent
      const cleanStyles = originalStyles.replace(/text-indent:[^;]+;?/gi, '');
      return `${cleanStyles}text-indent:${indent};`.replace(/;;/g, ';');
    }
    
    // Si no hay estilos originales, usar los estilos por defecto
    if (isBlockquote) {
      return getQuoteStyle(effectiveQuoteConfig, quoteTemplate, effectiveBaseFontSize, effectiveBaseLineHeight, effectiveTextAlign);
    }
    
    const indent = (hasIndent && isFirst && preserveFirstIndent) ? '0' : (hasIndent ? indentValue + 'em' : '0');
    return `margin:0;padding:0;text-align:${textAlign};text-indent:${indent};text-justify:inter-word;hyphens:auto;text-align-last:left;overflow-wrap:break-word;`;
  };
  
  const getDefaultStyle = () => getChunkStyle(isFirstChunk);
  
  while (remainingHtml) {
    const testStyle = getDefaultStyle();
    
    let measuredHeight = 0;
    try {
      measureDiv.innerHTML = remainingHtml;
      measuredHeight = measureDiv.offsetHeight || 0;
    } catch (e) {
      console.warn('Measurement error on initial check:', e);
      lines.push(remainingHtml);
      break;
    }
    
    if (measuredHeight <= maxHeight) {
      lines.push(remainingHtml);
      break;
    }
    
    const tmp = window.document.createElement('div');
    tmp.innerHTML = remainingHtml;
    const text = tmp.textContent || '';
    
    if (!text.trim()) {
      lines.push(remainingHtml);
      break;
    }
    
    let low = 0;
    let high = text.length;
    let fitLength = 0;
    
    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      const trialText = text.substring(0, mid);
      const wrapper = isBlockquote
        ? `<blockquote style="${testStyle}">${trialText}</blockquote>`
        : `<p style="${testStyle}">${trialText}</p>`;

      try {
        measureDiv.innerHTML = wrapper;
        measuredHeight = measureDiv.offsetHeight || 0;
      } catch (e) {
        console.warn('Measurement error in binary search:', e);
        high = mid - 1;
        continue;
      }
      
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
    const breakPoint = lastSpace > fitLength * 0.5 ? lastSpace : fitLength;

    const indent = (hasIndent && isFirstChunk && preserveFirstIndent) ? indentValue + 'em' : '0';
    const endsWithSentence = /[.!?]\s*$/.test(text.substring(0, breakPoint));

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
        // The chunk is now everything before afterNode in innerEl
        chunkHtml = innerEl.innerHTML;

        // Reconstruct the continuation from afterNode onwards
        if (afterNode && afterNode.parentNode) {
          const range = window.document.createRange();
          range.setStartBefore(afterNode);
          range.setEndAfter(innerEl.lastChild || afterNode);
          const frag = range.extractContents();

          const contDiv = window.document.createElement('div');
          contDiv.appendChild(frag);
          newRemainingHtml = contDiv.innerHTML.trim();
        }
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

    // Wrap chunk in proper element with correct style
    const finalStyle = originalStyles || (isBlockquote
      ? getQuoteStyle(effectiveQuoteConfig, quoteTemplate, effectiveBaseFontSize, effectiveBaseLineHeight, effectiveTextAlign)
      : `margin:0;padding:0;text-align:${textAlign};text-indent:${indent};text-justify:inter-word;hyphens:auto;text-align-last:${endsWithSentence ? 'left' : 'justify'};overflow-wrap:break-word;`);

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
        continuationStyle = `margin:0;padding:0;text-align:${textAlign};text-indent:0;text-justify:inter-word;hyphens:auto;text-align-last:left;overflow-wrap:break-word;`;
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
  const baseStyle = `font-style:${qConfig.italic ? 'italic' : 'normal'};font-size:${baseFontSize * qConfig.sizeMultiplier}pt;line-height:${baseLineHeight};text-align:${textAlign};text-justify:inter-word;hyphens:auto;`;

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
      return `<p style="margin:${spacingBetween > 0 ? spacingBetween + 'em' : '0'} 0;padding:0;text-align:${textAlign};text-indent:${isFirstParagraph ? '0' : indent + 'em'};text-justify:inter-word;hyphens:auto;text-align-last:left;overflow-wrap:break-word;line-height:${baseLineHeight};">${el.innerHTML}</p>`;
    }
  } else if (tag.match(/^H[1-6]$/i)) {
    const level = tag.slice(1).toLowerCase();
    const subConfig = config.subheaders?.[level] || config.subheaders?.h2 || { align: 'center', bold: true, sizeMultiplier: 1.25, marginTop: 1, marginBottom: 0.5, minLinesAfter: 1 };
    const subSize = Math.round(baseFontSize * subConfig.sizeMultiplier);
    const lineHeightPx = 12 * baseLineHeight;
    const subMarginTop = subConfig.marginTop * lineHeightPx;
    const subMarginBottom = subConfig.marginBottom * lineHeightPx;
    return `<h${level} style="font-size:${subSize}pt;font-weight:${subConfig.bold ? 'bold' : 'normal'};margin:${subMarginTop}px 0 ${subMarginBottom}px 0;text-align:${subConfig.align};line-height:1.3;">${el.innerHTML}</h${level}>`;
  } else if (tag === 'BLOCKQUOTE' && config.quote?.enabled) {
    const qConfig = config.quote;
    const template = Array.from(el.classList).find(c => ['classic', 'bar', 'italic', 'indent', 'minimal'].includes(c)) || 'classic';
    return `<blockquote class="quote ${template}" style="${getQuoteStyle(qConfig, template, baseFontSize, baseLineHeight, textAlign)}">${el.innerHTML}</blockquote>`;
  } else if (tag === 'UL' || tag === 'OL') {
    return `<${tag.toLowerCase()} style="margin:0.5em 0;padding-left:1.5em;line-height:${baseLineHeight};text-align:${textAlign};text-justify:inter-word;hyphens:auto;">${el.innerHTML}</${tag.toLowerCase()}>`;
  } else if (tag === 'HR') {
    return '<hr style="border:none;border-top:1px solid #999;margin:1em 0;">';
  } else if (tag === 'BR') {
    return '<br>';
  }
  return `<p style="margin:0;padding:0;text-align:${textAlign};text-indent:1.5em;text-justify:inter-word;hyphens:auto;text-align-last:left;overflow-wrap:break-word;line-height:${baseLineHeight};">${el.innerHTML}</p>`;
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
  
  const titleBaseStyle = `font-size:${titleSize}pt;font-weight:${ctConfig.bold ? 'bold' : 'normal'};font-style:${isSection ? 'italic' : 'normal'};text-align:${ctConfig.align};`;
  
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
        titleHtml = `<div style="margin:${spacedTop}px 0 ${titleMarginBottom}px 0;text-align:center;"><div style="${hrTop}"></div><div style="${titleBaseStyle}padding:${titleMarginBottom / 2}px 0;">${chapter.title}</div><div style="${hrBottom}"></div></div>`;
      } else {
        titleHtml = `<div style="${titleBaseStyle}margin:${spacedTop}px 0 ${titleMarginBottom}px 0;">${chapter.title}</div>`;
      }
      break;
    }
    case 'halfPage': {
      const halfTop = Math.round((contentHeight * 0.5) - titleSize - titleMarginBottom);
      if (ctConfig.showLines) {
        const hrTop = getHrStyle();
        const hrBottom = getHrStyle();
        titleHtml = `<div style="margin:${Math.max(0, halfTop)}px 0 ${titleMarginBottom}px 0;text-align:center;"><div style="${hrTop}"></div><div style="${titleBaseStyle}padding:${titleMarginBottom / 2}px 0;">${chapter.title}</div><div style="${hrBottom}"></div></div>`;
      } else {
        titleHtml = `<div style="${titleBaseStyle}margin:${Math.max(0, halfTop)}px 0 ${titleMarginBottom}px 0;">${chapter.title}</div>`;
      }
      break;
    }
    case 'fullPage': {
      if (ctConfig.showLines) {
        const hrTop = getHrStyle(ctConfig.lineStyle === 'double' ? 3 : 1);
        const hrBottom = getHrStyle(ctConfig.lineStyle === 'double' ? 3 : 1);
        titleHtml = `<div style="${titleBaseStyle}display:flex;align-items:center;justify-content:center;min-height:${contentHeight}px;flex-direction:column;"><div style="${hrTop}"></div><div>${chapter.title}</div><div style="${hrBottom}"></div></div>`;
      } else {
        titleHtml = `<div style="${titleBaseStyle}display:flex;align-items:center;justify-content:center;min-height:${contentHeight}px;flex-direction:column;"><div>${chapter.title}</div></div>`;
      }
      break;
    }
    default: {
      if (ctConfig.showLines) {
        const hrTop = getHrStyle();
        const hrBottom = getHrStyle();
        titleHtml = `<div style="margin:${titleMarginTop}px 0 ${titleMarginBottom}px 0;text-align:center;"><div style="${hrTop}"></div><div style="${titleBaseStyle}padding:${titleMarginBottom / 2}px 0;">${chapter.title}</div><div style="${hrBottom}"></div></div>`;
      } else {
        titleHtml = `<div style="${titleBaseStyle}margin:${titleMarginTop}px 0 ${titleMarginBottom}px 0;">${chapter.title}</div>`;
      }
    }
  }
  
  return { titleHtml, ctConfig };
};

export const shouldStartOnRightPage = (chapter, chapterIndex, config) => {
  const isSection = chapter.type === 'section';
  return isSection
    ? false
    : (config.chapterTitle?.startOnRightPage !== false);
};

export const detectQuotes = (html) => {
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
  return applyQuoteTemplate(html, template);
};

export const unwrapQuote = (html) => {
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
  
  return tempDiv.innerHTML;
};
