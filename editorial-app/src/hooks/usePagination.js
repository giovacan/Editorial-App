import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { KDP_STANDARDS } from '../utils/kdpStandards';
import useEditorStore from '../store/useEditorStore';
import {
  splitParagraphByLines,
  buildParagraphHtml,
  buildChapterTitleHtml,
  getQuoteStyle,
  shouldStartOnRightPage
} from '../utils/paginationEngine';
import { paginateChapters } from '../utils/paginateChapters';
import { calculateContentDimensions, calculateDynamicMargins } from '../utils/textMeasurer';
import { calculateLineHeightPx, ensureFontsReady } from '../utils/textLayoutEngine';
import { useParagraphValidation } from './useParagraphValidation';


const DEFAULT_CONFIG = {
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
    lineWidthTitle: false 
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
  pagination: { minOrphanLines: 2, minWidowLines: 2, splitLongParagraphs: true },
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
    showLine: true,
    lineStyle: 'solid',
    lineWidth: 0.5,
    lineColor: 'black',
    skipFirstChapterPage: true
  }
};

const AVAILABLE_SIDEBAR_WIDTH = 220;
const PX_PER_MM = 3.7795;
const PX_PER_INCH = 96;

const validatePages = (pages) => {
  const validPages = [];
  let corruptedCount = 0;
  
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (page && typeof page.pageNumber === 'number' && page.pageNumber > 0) {
      validPages.push(page);
    } else {
      corruptedCount++;
      validPages.push({
        html: page?.html || '',
        pageNumber: i + 1,
        isBlank: true,
        chapterTitle: page?.chapterTitle || '',
        currentSubheader: page?.currentSubheader || ''
      });
    }
  }
  
  if (corruptedCount > 0) {
    console.warn(`⚠️ ${corruptedCount} páginas corregidas durante la paginación`);
  }
  
  return validPages;
};

export const usePagination = (bookData, config, measureRef) => {
  const [pages, setPages] = useState([]);
  const [calculatedPageCount, setCalculatedPageCount] = useState(0);
  const [layoutDims, setLayoutDims] = useState(null);
  
  const safeBookData = bookData || { bookType: 'novela', chapters: [], title: '' };
  const safeConfig = config || DEFAULT_CONFIG;

  const bookConfig = useMemo(
    () => KDP_STANDARDS.getBookTypeConfig(safeBookData.bookType),
    [safeBookData.bookType]
  );

  const pageFormat = useMemo(() => {
    if (safeConfig.pageFormat === 'custom') {
      const customDims = KDP_STANDARDS.getCustomPageDimensions(
        safeConfig.customPageFormat?.width || 6,
        safeConfig.customPageFormat?.height || 9,
        safeConfig.customPageFormat?.unit || 'in'
      );
      return {
        id: 'custom',
        name: 'Custom',
        width: customDims.widthMm,
        height: customDims.heightMm,
        unit: 'mm',
        description: `Custom (${customDims.widthIn.toFixed(2)}" × ${customDims.heightIn.toFixed(2)}")`,
        minMargins: { top: 12.7, bottom: 12.7, left: 12.7, right: 12.7 },
        recommended: false,
        type: 'paperback'
      };
    }
    return KDP_STANDARDS.getPageFormat(safeConfig.pageFormat || bookConfig.recommendedFormat);
  }, [safeConfig.pageFormat, safeConfig.customPageFormat, bookConfig])

  const calculateGutter = useCallback((pageCount) => {
    if (safeConfig.gutterStrategy === 'custom') {
      return safeConfig.gutterManual;
    }
    return KDP_STANDARDS.getDynamicGutter(safeConfig.pageFormat, safeBookData.bookType, pageCount);
  }, [safeConfig.gutterStrategy, safeConfig.gutterManual, safeConfig.pageFormat, safeBookData.bookType]);
  
  const [gutterValue, setGutterValue] = useState(() => calculateGutter(0));
  const gutterValueRef = useRef(gutterValue);
  const previousPageCountRef = useRef(0);

  // Keep ref in sync with state, but don't trigger pagination effect
  useEffect(() => {
    gutterValueRef.current = gutterValue;
  }, [gutterValue]);

  const extraEndPages = safeConfig.extraEndPages || 0;
  const extraEndPagesNumbered = safeConfig.extraEndPagesNumbered || false;

  // Gutter recalculation - NOT dependent on pages.length to avoid loops
  useEffect(() => {
    if (safeConfig.gutterStrategy === 'auto' && pages.length > 0) {
      if (previousPageCountRef.current !== pages.length) {
        previousPageCountRef.current = pages.length;
        const newGutter = calculateGutter(pages.length);
        if (Math.abs(newGutter - gutterValueRef.current) > 0.001) {
          setGutterValue(newGutter);
        }
      }
    }
  }, [pages, safeConfig.gutterStrategy, calculateGutter]);
  
  useEffect(() => {
    console.log('[PAGINATION-EFFECT] Inicio - chapters:', safeBookData?.chapters?.length, '| layout:', safeConfig.chapterTitle?.layout);
    // Only run pagination if there's actual content
    const hasContent = safeBookData?.chapters?.some(ch => ch.html && ch.html.trim().length > 0);
    if (!hasContent || !measureRef.current) {
      console.log('[PAGINATION-EFFECT] Sin contenido o sin measureRef');
      if (!hasContent) {
        setPages([]);
      }
      return;
    }

    // Skip if we've already paginated this exact data with the same layout params.
    // Only include stable config values — avoid refs/derived values that change post-pagination.
    const layoutKey = [
      safeConfig.pageFormat,
      safeConfig.customPageFormat?.width, safeConfig.customPageFormat?.height,
      safeConfig.fontSize, safeConfig.lineHeight,
      safeConfig.fontFamily,
      safeConfig.marginTop, safeConfig.marginBottom, safeConfig.marginLeft, safeConfig.marginRight,
      safeConfig.marginStrategy,
      safeConfig.gutterStrategy, safeConfig.gutterManual,
      // paragraph config
      safeConfig.paragraph?.firstLineIndent, safeConfig.paragraph?.spacingBetween, safeConfig.paragraph?.align,
      // chapterTitle config
      safeConfig.chapterTitle?.layout,
      safeConfig.chapterTitle?.showLines,
      safeConfig.chapterTitle?.lineWidth,
      safeConfig.chapterTitle?.lineStyle,
      safeConfig.chapterTitle?.lineColor,
      safeConfig.chapterTitle?.lineWidthTitle,
      safeConfig.chapterTitle?.align,
      safeConfig.chapterTitle?.bold,
      safeConfig.chapterTitle?.sizeMultiplier,
      safeConfig.chapterTitle?.marginTop,
      safeConfig.chapterTitle?.marginBottom,
      safeConfig.chapterTitle?.startOnRightPage,
      safeConfig.chapterTitle?.hierarchyEnabled,
      safeConfig.chapterTitle?.hierarchyLabelSizeMultiplier,
      safeConfig.chapterTitle?.hierarchyTitleSizeMultiplier,
      safeConfig.chapterTitle?.hierarchyLabelColor,
      safeConfig.chapterTitle?.hierarchyLabelBold,
      safeConfig.chapterTitle?.hierarchyGap,
      // subheaders config
      safeConfig.subheaders?.h1?.align, safeConfig.subheaders?.h1?.bold, safeConfig.subheaders?.h1?.sizeMultiplier, safeConfig.subheaders?.h1?.marginTop, safeConfig.subheaders?.h1?.marginBottom, safeConfig.subheaders?.h1?.minLinesAfter,
      safeConfig.subheaders?.h2?.align, safeConfig.subheaders?.h2?.bold, safeConfig.subheaders?.h2?.sizeMultiplier, safeConfig.subheaders?.h2?.marginTop, safeConfig.subheaders?.h2?.marginBottom, safeConfig.subheaders?.h2?.minLinesAfter,
      safeConfig.subheaders?.h3?.align, safeConfig.subheaders?.h3?.bold, safeConfig.subheaders?.h3?.sizeMultiplier, safeConfig.subheaders?.h3?.marginTop, safeConfig.subheaders?.h3?.marginBottom, safeConfig.subheaders?.h3?.minLinesAfter,
      safeConfig.subheaders?.h4?.align, safeConfig.subheaders?.h4?.bold, safeConfig.subheaders?.h4?.sizeMultiplier, safeConfig.subheaders?.h4?.marginTop, safeConfig.subheaders?.h4?.marginBottom, safeConfig.subheaders?.h4?.minLinesAfter,
      safeConfig.subheaders?.h5?.align, safeConfig.subheaders?.h5?.bold, safeConfig.subheaders?.h5?.sizeMultiplier, safeConfig.subheaders?.h5?.marginTop, safeConfig.subheaders?.h5?.marginBottom, safeConfig.subheaders?.h5?.minLinesAfter,
      safeConfig.subheaders?.h6?.align, safeConfig.subheaders?.h6?.bold, safeConfig.subheaders?.h6?.sizeMultiplier, safeConfig.subheaders?.h6?.marginTop, safeConfig.subheaders?.h6?.marginBottom, safeConfig.subheaders?.h6?.minLinesAfter,
      // quote config
      safeConfig.quote?.enabled, safeConfig.quote?.indentLeft, safeConfig.quote?.indentRight, safeConfig.quote?.showLine, safeConfig.quote?.italic, safeConfig.quote?.sizeMultiplier, safeConfig.quote?.marginTop, safeConfig.quote?.marginBottom,
      // pagination rules
      safeConfig.pagination?.minOrphanLines, safeConfig.pagination?.minWidowLines, safeConfig.pagination?.splitLongParagraphs,
      // header config
      safeConfig.header?.enabled, safeConfig.header?.template, safeConfig.header?.displayMode,
      safeConfig.header?.evenPage?.leftContent, safeConfig.header?.evenPage?.centerContent, safeConfig.header?.evenPage?.rightContent,
      safeConfig.header?.oddPage?.leftContent, safeConfig.header?.oddPage?.centerContent, safeConfig.header?.oddPage?.rightContent,
      safeConfig.header?.trackSubheaders, safeConfig.header?.trackPseudoHeaders, safeConfig.header?.subheaderLevels?.join(','),
      safeConfig.header?.subheaderFormat, safeConfig.header?.fontFamily, safeConfig.header?.fontSize,
      safeConfig.header?.showLine, safeConfig.header?.lineStyle, safeConfig.header?.lineWidth, safeConfig.header?.lineColor,
      safeConfig.header?.marginTop, safeConfig.header?.marginBottom, safeConfig.header?.distanceFromPageNumber,
      safeConfig.header?.whenPaginationSamePosition, safeConfig.header?.skipFirstChapterPage,
      // page numbers
      safeConfig.showPageNumbers, safeConfig.pageNumberPos, safeConfig.pageNumberAlign, safeConfig.pageNumberMargin,
      // other
      safeConfig.showHeaders, safeConfig.chaptersOnRight,
      safeConfig.extraEndPages, safeConfig.extraEndPagesNumbered
    ].join('|');
    const contentHash = JSON.stringify(safeBookData.chapters.map(ch => ch.id + (ch.html?.length || 0))) + '||' + layoutKey;
    console.log('📄 Hash de paginación:', contentHash.slice(-50), '| Layout:', safeConfig.chapterTitle?.layout);
    if (measureRef.current._lastContentHash === contentHash) {
      console.log('⏭️ Saltando paginación - hash igual');
      return;
    }
    let cancelled = false;

    // Async IIFE: ensures fonts are loaded before Canvas measurement
    const runPagination = async () => {
      const measureDiv = measureRef.current;
      if (!measureDiv) return;

      // FONT LOADING GUARD: Canvas measureText() returns wrong metrics
      // if the font isn't loaded yet. This ensures deterministic results
      // from the very first render.
      const targetFontFamily = safeConfig.fontFamily || bookConfig.fontFamily;
      console.log('[PAGINATION] Esperando fuentes:', targetFontFamily);
      await ensureFontsReady(targetFontFamily, safeConfig.fontSize || 12);
      console.log('[PAGINATION] Fuentes listas, cancelled=', cancelled);

      if (cancelled) return;

      // Set hash AFTER async work completes and AFTER cancelled check passes.
      // This way, if the effect was cancelled during font loading, the hash
      // stays unset and the next effect run will re-execute pagination.
      if (measureRef.current) {
        measureRef.current._lastContentHash = contentHash;
      }

      useEditorStore.getState().startPagination();

      try {
        measureDiv.innerHTML = '';
        measureDiv.style.cssText = '';
        measureDiv.style.position = 'absolute';
        measureDiv.style.visibility = 'hidden';
        measureDiv.style.left = '-9999px';
        measureDiv.style.top = '0';
        measureDiv.style.height = 'auto';
        measureDiv.style.minHeight = '0';
        measureDiv.style.maxHeight = 'none';
        measureDiv.style.overflow = 'visible';
        measureDiv.style.whiteSpace = 'normal';
        measureDiv.style.wordWrap = 'break-word';
        measureDiv.style.boxSizing = 'border-box';
      } catch (e) {
        console.warn('Error resetting measureDiv:', e);
      }

      const previewScale = Math.min(0.42, AVAILABLE_SIDEBAR_WIDTH / (pageFormat.width * PX_PER_MM));

      const totalContentLength = safeBookData.chapters.reduce((sum, ch) => sum + (ch.html?.length || 0), 0);
      const estimatedPages = Math.ceil(totalContentLength / 3000);

      // Capture the gutter value used for this pagination run
      const engineGutter = gutterValueRef.current;

      const applyDynamicMargins = (safeConfig.marginStrategy || 'auto') === 'auto';
      const dimsOdd = calculateContentDimensions(pageFormat, bookConfig, previewScale, engineGutter, false, estimatedPages, applyDynamicMargins);
      const dimsEven = calculateContentDimensions(pageFormat, bookConfig, previewScale, engineGutter, true, estimatedPages, applyDynamicMargins);

      const contentWidth = Math.min(dimsOdd.contentWidth, dimsEven.contentWidth);
      const pageWidthPx = dimsOdd.pageWidthPx;
      const pageHeightPx = dimsOdd.pageHeightPx;

      const baseFontSize = (safeConfig.fontSize || bookConfig.fontSize) * previewScale;
      const baseLineHeight = safeConfig.lineHeight || bookConfig.lineHeight;
      const textAlign = safeConfig.paragraph?.align || 'justify';

      const baseFontSizePx = baseFontSize * (PX_PER_INCH / 72);
      // DETERMINISTIC: Calculate lineHeightPx via pure math, no DOM measurement
      const lineHeightPx = calculateLineHeightPx(baseFontSizePx, baseLineHeight);

      measureDiv.style.width = `${contentWidth}px`;
      measureDiv.style.fontFamily = targetFontFamily;
      measureDiv.style.fontSize = `${baseFontSizePx}px`;
      measureDiv.style.lineHeight = `${lineHeightPx}px`;
      measureDiv.style.textAlign = textAlign;
      measureDiv.style.textJustify = 'inter-word';
      measureDiv.style.hyphens = 'none';
      measureDiv.style.wordBreak = 'break-word';
      measureDiv.style.padding = '0';

      if (lineHeightPx === 0) {
        measureRef.current._lastContentHash = null;
        useEditorStore.getState().endPagination();
        return;
      }

      const headerSpaceEstimate = safeConfig.header?.enabled ? Math.round(lineHeightPx * 1.5) : 0;
      const minOrphanLines = safeConfig.pagination?.minOrphanLines ?? 2;
      // Floor to line grid — rounding provides up to 1 line of safety.
      const rawContentHeight = Math.min(dimsOdd.contentHeight, dimsEven.contentHeight) - headerSpaceEstimate;
      const contentHeight = Math.floor(rawContentHeight / lineHeightPx) * lineHeightPx;

      if (process.env.NODE_ENV === 'development') {
        const floorDrop = rawContentHeight - contentHeight;
        console.log(`[PAGINATION-SETUP] marginBottom=${dimsOdd.marginBottom.toFixed(1)}px, headerSpace=${headerSpaceEstimate}px, floorDrop=${floorDrop.toFixed(1)}px`);
        console.log(`[PAGINATION-SETUP] previewScale=${previewScale.toFixed(3)}, baseFontSize=${baseFontSize.toFixed(1)}pt, lineHeightPx=${lineHeightPx}px, contentWidth=${contentWidth.toFixed(1)}px, pageHeight=${pageHeightPx.toFixed(1)}px, contentHeight=${contentHeight.toFixed(1)}px, gutter=${gutterValueRef.current}`);
      }
      const minWidowLines = safeConfig.pagination?.minWidowLines ?? 2;
      const splitLongParagraphs = safeConfig.pagination?.splitLongParagraphs !== false;

      const fontFamily = targetFontFamily;

      const layoutCtx = {
        contentHeight,
        contentWidth,
        lineHeightPx,
        baseFontSize,
        baseFontSizePx,
        baseLineHeight,
        textAlign,
        fontFamily,
        minOrphanLines,
        minWidowLines,
        splitLongParagraphs
      };

      if (cancelled) return;

      let generatedPages;
      try {
        generatedPages = paginateChapters(
          safeBookData.chapters,
          layoutCtx,
          measureDiv,
          safeConfig
        );
      } catch (e) {
        console.error('[PAGINATE] ERROR en paginateChapters:', e, e?.stack);
        useEditorStore.getState().endPagination();
        return;
      }

      if (process.env.NODE_ENV === 'development') {
        console.log(`[PAGINATE] Resultado: ${generatedPages?.length} páginas generadas`, generatedPages?.[0]?.html?.slice(0, 100));
      }

      useEditorStore.getState().setPaginationProgress(95);

      for (let i = 0; i < extraEndPages; i++) {
        generatedPages.push({
          html: '',
          pageNumber: generatedPages.length + 1,
          isBlank: true,
          isExtraEndPage: true,
          shouldShowPageNumber: extraEndPagesNumbered
        });
      }

      if (!cancelled) {
        const validatedPages = validatePages(generatedPages);
        // Batch both state updates together to avoid re-render between them
        // which would trigger effect cleanup and set cancelled=true
        console.log(`[PAGINATION] Guardando layoutDims: contentHeight=${contentHeight}px, engineGutter=${engineGutter}`);
        setLayoutDims({
          contentHeight,
          contentWidth,
          lineHeightPx,
          baseFontSizePx,
          baseLineHeight,
          previewScale,
          gutterValue: engineGutter,
        });
        setPages(validatedPages);
        useEditorStore.getState().setPaginationProgress(100);
      }
    };

    runPagination();

    return () => {
      cancelled = true;
      useEditorStore.getState().endPagination();
    };
  }, [
    bookData,
    config,
    measureRef,
    bookConfig,
    pageFormat,
    extraEndPages,
    extraEndPagesNumbered,
    safeConfig.marginTop,
    safeConfig.marginBottom,
    safeConfig.marginLeft,
    safeConfig.marginRight,
    safeConfig.marginStrategy
  ]);
  
  const confirmedChapterTitles = useEditorStore(s => s.confirmedChapterTitles ?? []);

  const {
    validateAll,
    validationState,
    showErrorDialog,
    currentError,
    handleErrorAction,
    closeErrorDialog
  } = useParagraphValidation();

  useEffect(() => {
    if (pages.length > 0 && safeBookData.chapters) {
      const validation = validateAll(safeBookData.chapters, pages, safeConfig, confirmedChapterTitles);

      if (process.env.NODE_ENV === 'development') {
        console.log('[ParagraphValidation] Result:', validation);
        console.log('[PAGES] Total páginas:', pages.length, '| Primera página HTML:', pages[0]?.html?.slice(0, 100));
      }
    }
  }, [pages, safeBookData.chapters, safeConfig, confirmedChapterTitles]);
  
  return {
    pages,
    layoutDims,
    validationState,
    showErrorDialog,
    currentError,
    handleErrorAction,
    closeErrorDialog
  };
};

export const usePageNavigation = (totalPages) => {
  const [currentPage, setCurrentPage] = useState(0);
  
  const goToPage = useCallback((pageNum) => {
    const page = Math.max(0, Math.min(pageNum - 1, totalPages - 1));
    setCurrentPage(page);
  }, [totalPages]);
  
  const goToNextPage = useCallback(() => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages - 1));
  }, [totalPages]);
  
  const goToPrevPage = useCallback(() => {
    setCurrentPage(prev => Math.max(prev - 1, 0));
  }, []);
  
  const goToFirstPage = useCallback(() => {
    setCurrentPage(0);
  }, []);
  
  const goToLastPage = useCallback(() => {
    setCurrentPage(Math.max(0, totalPages - 1));
  }, [totalPages]);
  
  return {
    currentPage,
    setCurrentPage,
    goToPage,
    goToNextPage,
    goToPrevPage,
    goToFirstPage,
    goToLastPage,
    totalPages
  };
};
