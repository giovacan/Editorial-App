export const PX_PER_MM = 3.7795;
export const PX_PER_INCH = 96;
export const MM_PER_INCH = 25.4;

export const mmToPx = (mm) => mm * PX_PER_MM;
export const pxToMm = (px) => px / PX_PER_MM;
export const ptToPx = (pt) => pt * (PX_PER_INCH / 72);
export const pxToPt = (px) => px * (72 / PX_PER_INCH);

export const inchesToMm = (inches) => inches * MM_PER_INCH;
export const mmToInches = (mm) => mm / MM_PER_INCH;

export const calculatePreviewScale = (availableWidth, pageFormatWidthMm) => {
  return Math.min(0.42, availableWidth / (pageFormatWidthMm * PX_PER_MM));
};

export const calculateContentDimensions = (pageFormat, bookConfig, previewScale) => {
  const pageWidthPx = pageFormat.width * PX_PER_MM * previewScale;
  const pageHeightPx = pageFormat.height * PX_PER_MM * previewScale;
  
  const marginTop = bookConfig.marginTop * PX_PER_INCH * previewScale;
  const marginBottom = bookConfig.marginBottom * PX_PER_INCH * previewScale;
  const marginLeft = (bookConfig.marginLeft + (bookConfig.gutter || 0)) * PX_PER_INCH * previewScale;
  const marginRight = bookConfig.marginRight * PX_PER_INCH * previewScale;
  
  const contentWidth = pageWidthPx - marginLeft - marginRight;
  const contentHeight = pageHeightPx - marginTop - marginBottom;
  
  return {
    pageWidthPx,
    pageHeightPx,
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
    contentWidth,
    contentHeight
  };
};

export const calculateFontMetrics = (baseFontSize, lineHeight, previewScale) => {
  const scaledFontSize = baseFontSize * previewScale;
  return {
    fontSize: scaledFontSize,
    lineHeight: lineHeight
  };
};

export const measureTextWidth = (text, font, fontSize) => {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  context.font = `${fontSize}px ${font}`;
  return context.measureText(text).width;
};

export const estimateLineCount = (text, contentWidth, avgCharWidth) => {
  const charsPerLine = Math.floor(contentWidth / avgCharWidth);
  if (charsPerLine <= 0) return 1;
  const words = text.split(/\s+/).length;
  return Math.ceil(words / (charsPerLine / 6));
};
