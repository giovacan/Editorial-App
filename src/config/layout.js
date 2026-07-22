export const PX_PER_MM = 3.7795;
export const PX_PER_INCH = 96;
export const MM_PER_INCH = 25.4;

export const FOLIO_FROM_BOTTOM_MM = 15;
export const AVAILABLE_SIDEBAR_WIDTH = 220;
export const DEFAULT_PREVIEW_SCALE = 0.42;

export const mmToPx = (mm) => mm * PX_PER_MM;
export const pxToMm = (px) => px / PX_PER_MM;
export const ptToPx = (pt) => pt * (PX_PER_INCH / 72);
export const pxToPt = (px) => px * (72 / PX_PER_INCH);
export const inchesToMm = (inches) => inches * MM_PER_INCH;
export const mmToInches = (mm) => mm / MM_PER_INCH;

export const DEFAULT_CONFIG = {
  pageFormat: 'a5',
  customPageFormat: { width: 6, height: 9, unit: 'in' },
  gutterStrategy: 'auto',
  gutterManual: 0.25,
  gutterUnit: 'in',
  extraEndPages: 0,
  extraEndPagesNumbered: false,
  fontSize: 12,
  lineHeight: 1.6,
  chapterTitle: {
    align: 'center',
    bold: true,
    sizeMultiplier: 1.8,
    marginTop: 2,
    marginBottom: 1,
    startOnRightPage: true,
    showLines: false,
    lineWidth: 0.5,
    lineStyle: 'solid',
    lineColor: '#333333',
    lineWidthTitle: false,
    layout: 'continuous',
    hierarchyEnabled: true,
    hierarchyLabelSizeMultiplier: 0.7,
    hierarchyTitleSizeMultiplier: 1.0,
    hierarchyLabelColor: '#666666',
    hierarchyLabelBold: false,
    hierarchyGap: 0.3
  },
  subheaders: {
    h1: { align: 'center', bold: true, sizeMultiplier: 1.5, marginTop: 1.5, marginBottom: 0.5, minLinesAfter: 1 },
    h2: { align: 'center', bold: true, sizeMultiplier: 1.35, marginTop: 1.25, marginBottom: 0.5, minLinesAfter: 1 },
    h3: { align: 'center', bold: true, sizeMultiplier: 1.25, marginTop: 1, marginBottom: 0.5, minLinesAfter: 1 },
    h4: { align: 'left', bold: true, sizeMultiplier: 1.15, marginTop: 1, marginBottom: 0.5, minLinesAfter: 1 },
    h5: { align: 'left', bold: true, sizeMultiplier: 1.1, marginTop: 0.75, marginBottom: 0.25, minLinesAfter: 1 },
    h6: { align: 'left', bold: false, sizeMultiplier: 1.0, marginTop: 0.5, marginBottom: 0.25, minLinesAfter: 1 }
  },
  paragraph: { firstLineIndent: 1.5, align: 'justify', spacingBetween: 0 },
  quote: { enabled: true, indentLeft: 2, indentRight: 2, showLine: true, italic: true, sizeMultiplier: 0.95, marginTop: 1, marginBottom: 1, template: 'classic', autoDetect: true },
  pagination: { minOrphanLines: 2, minWidowLines: 2, splitLongParagraphs: true, targetFillPct: 0.92 },
  // Footnotes (roadmap B1). OFF by default → engine identical to before.
  footnotes: { enabled: false, fontScale: 0.72, lineHeight: 1.4, separator: 'partial', numbering: 'per-chapter' },
  header: {
    enabled: false,
    template: 'classic',
    displayMode: 'alternate',
    evenPage: { leftContent: 'title', centerContent: 'none', rightContent: 'none' },
    oddPage: { leftContent: 'none', centerContent: 'none', rightContent: 'chapter' },
    trackSubheaders: false,
    trackPseudoHeaders: false,
    subheaderLevels: ['h1', 'h2'],
    subheaderFormat: 'full',
    fontFamily: 'same',
    fontSize: 70,
    marginBottom: 0.5,
    showLine: true,
    lineStyle: 'solid',
    lineWidth: 0.5,
    lineColor: 'black',
    skipFirstChapterPage: true
  }
};
