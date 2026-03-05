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
    // Only run pagination if there's actual content
    const hasContent = safeBookData?.chapters?.some(ch => ch.html && ch.html.trim().length > 0);
    if (!hasContent || !measureRef.current) {
      if (!hasContent) {
        setPages([]);
      }
      return;
    }

    // Skip if we've already paginated this exact data
    const contentHash = JSON.stringify(safeBookData.chapters.map(ch => ch.id + (ch.html?.length || 0)));
    if (measureRef.current._lastContentHash === contentHash) {
      return;
    }
    measureRef.current._lastContentHash = contentHash;

    useEditorStore.getState().startPagination();

    const measureDiv = measureRef.current;
    
    try {
      measureDiv.innerHTML = '';
      measureDiv.style.cssText = '';
      // Asegurar estilos consistentes para medición
      measureDiv.style.position = 'absolute';
      measureDiv.style.visibility = 'hidden';
      measureDiv.style.left = '-9999px';
      measureDiv.style.top = '0';
      measureDiv.style.width = '1px';
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

    // Estimate total page count based on content size for dynamic margin calculation
    const totalContentLength = safeBookData.chapters.reduce((sum, ch) => sum + (ch.html?.length || 0), 0);
    const estimatedPages = Math.ceil(totalContentLength / 3000); // Rough estimate: ~3000 chars per page

    // Apply dynamic margins only if user hasn't switched to custom mode
    const applyDynamicMargins = (safeConfig.marginStrategy || 'auto') === 'auto';
    const dimsOdd = calculateContentDimensions(pageFormat, bookConfig, previewScale, gutterValueRef.current, false, estimatedPages, applyDynamicMargins);
    const dimsEven = calculateContentDimensions(pageFormat, bookConfig, previewScale, gutterValueRef.current, true, estimatedPages, applyDynamicMargins);

    const contentWidth = Math.min(dimsOdd.contentWidth, dimsEven.contentWidth);
    const pageWidthPx = dimsOdd.pageWidthPx;
    const pageHeightPx = dimsOdd.pageHeightPx;
    const marginTop = dimsOdd.marginTop;
    const marginBottom = dimsOdd.marginBottom;

    const baseFontSize = (safeConfig.fontSize || bookConfig.fontSize) * previewScale;
    const baseLineHeight = safeConfig.lineHeight || bookConfig.lineHeight;
    const textAlign = safeConfig.paragraph?.align || 'justify';

    measureDiv.style.width = `${contentWidth}px`;
    measureDiv.style.fontFamily = safeConfig.fontFamily || bookConfig.fontFamily;
    measureDiv.style.fontSize = `${baseFontSize}pt`;
    measureDiv.style.lineHeight = baseLineHeight;
    measureDiv.style.textAlign = textAlign;
    measureDiv.style.textJustify = 'inter-word';
    measureDiv.style.hyphens = 'auto';
    measureDiv.style.wordBreak = 'break-word';
    measureDiv.style.padding = '0';

    measureDiv.innerHTML = 'Ag';
    const lineHeightPx = measureDiv.offsetHeight;

    // Safety margin calculation:
    // - Headers are rendered but not measured in pagination
    // - Estimated header space: baseFontSize * lineHeight + 0.5em margin
    // - Use conservative buffer: 2 * lineHeightPx to ensure no overflow
    const headerSpaceEstimate = safeConfig.header?.enabled ? Math.round(lineHeightPx * 1.5) : 0;
    const safetyMargin = 1 + headerSpaceEstimate;
    const contentHeight = Math.min(dimsOdd.contentHeight, dimsEven.contentHeight) - safetyMargin;

    console.log(`[PAGINATION] estimatedPages=${estimatedPages}, headerEnabled=${safeConfig.header?.enabled}, lineHeightPx=${lineHeightPx}, safetyMargin=${safetyMargin}, contentHeight=${contentHeight}`);
    const minOrphanLines = safeConfig.pagination?.minOrphanLines || 1;
    const minWidowLines = safeConfig.pagination?.minWidowLines || 1;
    const splitLongParagraphs = safeConfig.pagination?.splitLongParagraphs !== false;

    // Quote config for consistent split measurement - always provide config to prevent style degradation
    const quoteOptions = {
      config: safeConfig.quote || {
        enabled: true,
        indentLeft: 2,
        indentRight: 2,
        showLine: true,
        italic: true,
        sizeMultiplier: 0.95,
        marginTop: 1,
        marginBottom: 1
      },
      baseFontSize,
      baseLineHeight,
      textAlign
    };

    // Build layout context for pure pagination function
    const layoutCtx = {
      contentHeight,
      lineHeightPx,
      baseFontSize,
      baseLineHeight,
      textAlign,
      minOrphanLines,
      minWidowLines,
      splitLongParagraphs
    };

    // Call pure pagination function
    const generatedPages = paginateChapters(
      safeBookData.chapters,
      layoutCtx,
      measureDiv,
      safeConfig
    );

    useEditorStore.getState().setPaginationProgress(75);
    
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
      
      setPages(validatedPages);
      useEditorStore.getState().setPaginationProgress(100);
    }
    
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
      }
    }
  }, [pages, safeBookData.chapters, safeConfig, confirmedChapterTitles]);
  
  return { 
    pages,
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
