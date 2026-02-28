export const detectTextHierarchies = (html, options = {}) => {
  const {
    minTextLength = 3,
    similarityThreshold = 0.15,
    maxLevels = 3
  } = options;

  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  const elements = tmp.querySelectorAll('p, div, strong, b, em, i, span, h1, h2, h3, h4, h5, h6');

  const textGroups = [];

  elements.forEach(el => {
    const text = el.textContent?.trim() || '';
    if (text.length < minTextLength) return;

    const style = window.getComputedStyle(el);
    const fontSize = parseFloat(style.fontSize);
    const fontWeight = parseInt(style.fontWeight) || 400;
    const isBold = fontWeight >= 600 || el.tagName === 'STRONG' || el.tagName === 'B';
    const isItalic = style.fontStyle === 'italic' || el.tagName === 'EM' || el.tagName === 'I';

    if (el.querySelectorAll('p, div').length > 5) return;

    textGroups.push({
      element: el,
      text: text,
      fontSize,
      isBold,
      isItalic,
      tagName: el.tagName,
      originalHtml: el.outerHTML
    });
  });

  if (textGroups.length === 0) {
    return { hierarchies: [], conversionMap: [] };
  }

  const uniqueSizes = [...new Set(textGroups.map(g => g.fontSize))].sort((a, b) => b - a);

  const sizeGroups = uniqueSizes.map(size => ({
    size,
    items: textGroups.filter(g => Math.abs(g.fontSize - size) / size < similarityThreshold)
  })).filter(group => group.items.length > 0);

  const hierarchies = sizeGroups.slice(0, maxLevels).map((group, index) => {
    const level = index + 1;
    const tagName = `h${level}`;
    
    return {
      level,
      tagName,
      fontSize: group.size,
      itemCount: group.items.length,
      items: group.items.map(item => ({
        text: item.text,
        isBold: item.isBold,
        isItalic: item.isItalic,
        originalHtml: item.originalHtml
      }))
    };
  });

  const conversionMap = hierarchies.map(h => ({
    fromLevel: h.level,
    toTag: h.tagName,
    fontSize: h.fontSize,
    items: h.items
  }));

  return {
    hierarchies,
    conversionMap,
    uniqueSizes,
    totalElements: textGroups.length
  };
};

export const convertToHeaders = (html, hierarchies, options = {}) => {
  const {
    convertBold = true,
    preserveFormatting = true
  } = options;

  let result = html;

  hierarchies.forEach(hierarchy => {
    const { level, tagName, items } = hierarchy;

    items.forEach(item => {
      const escapedText = item.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`<(\\w+)[^>]*>\\s*${escapedText}\\s*</\\1>|<(${item.tagName.toLowerCase()})[^>]*>\\s*${escapedText}\\s*</\\2>`, 'gi');

      let replacement;
      if (preserveFormatting && item.isBold) {
        replacement = `<${tagName}><strong>${item.text}</strong></${tagName}>`;
      } else if (preserveFormatting && item.isItalic) {
        replacement = `<${tagName}><em>${item.text}</em></${tagName}>`;
      } else {
        replacement = `<${tagName}>${item.text}</${tagName}>`;
      }

      result = result.replace(regex, replacement);
    });
  });

  return result;
};

export const analyzeAndConvertHierarchies = (html, options = {}) => {
  const detection = detectTextHierarchies(html, options);
  
  if (detection.hierarchies.length === 0) {
    return {
      originalHtml: html,
      convertedHtml: html,
      hierarchies: [],
      hasChanges: false
    };
  }

  const convertedHtml = convertToHeaders(html, detection.conversionMap, options);

  return {
    originalHtml: html,
    convertedHtml: convertedHtml,
    hierarchies: detection.hierarchies,
    conversionMap: detection.conversionMap,
    uniqueSizes: detection.uniqueSizes,
    hasChanges: convertedHtml !== html
  };
};

export const getHeaderLevelFromFontSize = (fontSize, baseFontSize, options = {}) => {
  const { ratios = { h1: 1.8, h2: 1.5, h3: 1.3, h4: 1.15, h5: 1.05, h6: 1 } } = options;

  const ratio = fontSize / baseFontSize;

  if (ratio >= ratios.h1 * 0.9) return 'h1';
  if (ratio >= ratios.h2 * 0.9) return 'h2';
  if (ratio >= ratios.h3 * 0.9) return 'h3';
  if (ratio >= ratios.h4 * 0.9) return 'h4';
  if (ratio >= ratios.h5 * 0.9) return 'h5';
  return 'h6';
};

export const suggestHeaderMapping = (hierarchies, baseFontSize = 12) => {
  if (hierarchies.length === 0) return null;

  const suggestions = hierarchies.map((h, index) => {
    const ratio = h.fontSize / baseFontSize;
    let suggestedLevel = 'p';

    if (ratio >= 1.6) suggestedLevel = 'h1';
    else if (ratio >= 1.35) suggestedLevel = 'h2';
    else if (ratio >= 1.2) suggestedLevel = 'h3';
    else if (ratio >= 1.1) suggestedLevel = 'h4';
    else if (ratio >= 1.02) suggestedLevel = 'h5';
    else suggestedLevel = 'p';

    return {
      currentLevel: h.level,
      suggestedLevel,
      fontSize: h.fontSize,
      ratio: ratio.toFixed(2),
      itemCount: h.itemCount,
      preview: h.items[0]?.text?.substring(0, 50) || ''
    };
  });

  return suggestions;
};
