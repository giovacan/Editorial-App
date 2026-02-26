export const splitParagraphByLines = (html, measureDiv, maxHeight, textAlign, hasIndent = false, indentValue = 1.5, isFirstChunkOfPage = true) => {
  const lines = [];
  let remainingHtml = html;
  let isFirstChunk = isFirstChunkOfPage;
  
  while (remainingHtml) {
    measureDiv.innerHTML = remainingHtml;
    
    if (measureDiv.offsetHeight <= maxHeight) {
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
    const indent = hasIndent && isFirstChunk ? indentValue + 'em' : '0';
    
    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      const trialHtml = text.substring(0, mid);
      measureDiv.innerHTML = `<p style="margin:0;padding:0;text-align:${textAlign};text-indent:${indent};text-justify:inter-word;hyphens:auto;text-align-last:left;overflow-wrap:break-word;">${trialHtml}</p>`;
      
      if (measureDiv.offsetHeight <= maxHeight) {
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

    const chunkText = text.substring(0, breakPoint);
    const endsWithSentence = /[.!?]\s*$/.test(chunkText);
    const indentForChunk = hasIndent && isFirstChunk ? indentValue + 'em' : '0';
    lines.push(`<p style="margin:0;padding:0;text-align:${textAlign};text-indent:${indentForChunk};text-justify:inter-word;hyphens:auto;text-align-last:${endsWithSentence ? 'left' : 'justify'};overflow-wrap:break-word;">${chunkText}</p>`);
    isFirstChunk = false;
    remainingHtml = text.substring(breakPoint);
    
    if (remainingHtml) {
      remainingHtml = `<p style="margin:0;padding:0;text-align:${textAlign};text-indent:0;text-justify:inter-word;hyphens:auto;text-align-last:left;overflow-wrap:break-word;">${remainingHtml}</p>`;
    }
  }
  
  return lines;
};

export const buildParagraphHtml = (el, config, baseFontSize, baseLineHeight, textAlign) => {
  const tag = el.tagName;
  const isFirstParagraph = false;
  const currentIndent = config.paragraph?.firstLineIndent || 1.5;
  const currentHasIndent = !isFirstParagraph;

  if (tag === 'P' || tag === 'DIV') {
    const parentBlockquote = el.closest('blockquote');
    if (parentBlockquote && config.quote?.enabled) {
      const qConfig = config.quote;
      return `<p style="margin:${qConfig.marginTop}em 0 ${qConfig.marginBottom}em ${qConfig.indentLeft}em;padding:0;padding-right:${qConfig.indentRight}em;text-align:${textAlign};text-indent:0;text-justify:inter-word;hyphens:auto;text-align-last:left;overflow-wrap:break-word;line-height:${baseLineHeight};font-style:${qConfig.italic ? 'italic' : 'normal'};font-size:${baseFontSize * qConfig.sizeMultiplier}pt;${qConfig.showLine ? 'border-left:3px solid #444;padding-left:0.75em;' : ''}">${el.innerHTML}</p>`;
    } else {
      const spacingBetween = config.paragraph?.spacingBetween || 0;
      return `<p style="margin:${spacingBetween > 0 ? spacingBetween + 'em' : '0'} 0;padding:0;text-align:${textAlign};text-indent:0;text-justify:inter-word;hyphens:auto;text-align-last:left;overflow-wrap:break-word;line-height:${baseLineHeight};">${el.innerHTML}</p>`;
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
    return `<blockquote style="margin:${qConfig.marginTop}em ${qConfig.indentRight}em ${qConfig.marginBottom}em ${qConfig.indentLeft}em;padding:0.5em 1em;border-left:${qConfig.showLine ? '3px solid #444' : 'none'};font-style:${qConfig.italic ? 'italic' : 'normal'};font-size:${baseFontSize * qConfig.sizeMultiplier}pt;line-height:${baseLineHeight};text-align:${textAlign};text-justify:inter-word;hyphens:auto;">${el.innerHTML}</blockquote>`;
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
