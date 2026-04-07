import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import murmurhash from 'imurmurhash';
import { KDP_STANDARDS } from '../utils/kdpStandards';
import useEditorStore from '../store/useEditorStore';
import { extractTOC, ENABLE_TOC, generateRecommendedTOCConfig } from '../utils/extractTOC';
import { mapTOCToPages } from '../utils/mapTOCToPages';
import { generateFrontMatter, combineFrontMatterWithContent } from '../utils/generateFrontMatter';
import {
  buildParagraphHtml,
  buildChapterTitleHtml,
  getQuoteStyle,
  shouldStartOnRightPage
} from '../utils/paginationEngine';
import { paginateChapters } from '../utils/paginateChapters';
import { getLayoutHints } from '../services/layoutPlanner';
import { calculateContentDimensions, calculateDynamicMargins } from '../utils/textMeasurer';
import { FOLIO_FROM_BOTTOM_MM } from '../utils/pageLayout';
import { calculateLineHeightPx, ensureFontsReady } from '../utils/textLayoutEngine';
import { useParagraphValidation } from './useParagraphValidation';

function toRoman(n) {
  const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
  const syms = ['m','cm','d','cd','c','xc','l','xl','x','ix','v','iv','i'];
  let result = '';
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) { result += syms[i]; n -= vals[i]; }
  }
  return result;
}

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
  pagination: { minOrphanLines: 2, minWidowLines: 2, splitLongParagraphs: true, targetFillPct: 0.92 },
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

export const usePagination = (bookData, config, measureRef, externalPreviewScale) => {
  const [pages, setPages] = useState([]);
  const [calculatedPageCount, setCalculatedPageCount] = useState(0);
  const [layoutDims, setLayoutDims] = useState(null);

  // Subscribe to TOC config changes to regenerate frontmatter without re-paginating
  const tocConfig      = useEditorStore(s => s.tocConfig);
  const frontMatterConfig = useEditorStore(s => s.frontMatterConfig);
  const layoutPlannerRevision = useEditorStore(s => s.layoutPlanner?.revision ?? 0);

  const safeBookData = bookData || { bookType: 'novela', chapters: [], title: '' };
  const safeConfig = config || DEFAULT_CONFIG;

  const bookConfig = useMemo(
    () => KDP_STANDARDS.getBookTypeConfig(safeBookData.bookType),
    [safeBookData.bookType]
  );

  // Derive previewScale once: use external if provided, otherwise compute from format
  const pageFormatForScale = useMemo(() => {
    if (safeConfig.pageFormat === 'custom') {
      const customDims = KDP_STANDARDS.getCustomPageDimensions(
        safeConfig.customPageFormat?.width || 6,
        safeConfig.customPageFormat?.height || 9,
        safeConfig.customPageFormat?.unit || 'in'
      );
      return { width: customDims.widthMm };
    }
    const format = KDP_STANDARDS.getPageFormat(safeConfig.pageFormat || bookConfig.recommendedFormat);
    return { width: format.width };
  }, [safeConfig.pageFormat, safeConfig.customPageFormat, bookConfig]);

  const previewScale = useMemo(() => {
    if (externalPreviewScale != null) return externalPreviewScale;
    return Math.min(0.42, AVAILABLE_SIDEBAR_WIDTH / (pageFormatForScale.width * PX_PER_MM));
  }, [externalPreviewScale, pageFormatForScale.width]);

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
  const paginationWorkerRef = useRef(null);
  // Incremental layout cache — survives across re-paginations in this session.
  // On each successful DONE message we store chapterHashes + chapterPageSlices
  // and pass them back when the worker is restarted so unchanged chapters skip
  // the expensive greedyPaginate step.
  const paginationCacheRef = useRef({ chapterHashes: null, chapterPageSlices: null });

  // Keep ref in sync with state, but don't trigger pagination effect
  useEffect(() => {
    gutterValueRef.current = gutterValue;
  }, [gutterValue]);

  const extraEndPages = safeConfig.extraEndPages || 0;
  const extraEndPagesNumbered = safeConfig.extraEndPagesNumbered || false;
  const globalOptMode = useEditorStore(s => s.layoutOptimization?.globalMode ?? 'auto');

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
      safeConfig.extraEndPages, safeConfig.extraEndPagesNumbered,
      // optimization mode
      useEditorStore.getState().layoutOptimization?.globalMode || 'auto',
      // folio position constant — changing this must re-paginate
      FOLIO_FROM_BOTTOM_MM,
      // engine version — bump to force re-pagination after algorithm changes
      'ev7',
      layoutPlannerRevision,
    ].join('|');
    const contentHash = JSON.stringify(safeBookData.chapters.map(ch =>
      ch.id + murmurhash(ch.html || '').result()
    )) + '||' + layoutKey;
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

      // Reserve exact space for header — derived from known typographic values, no DOM needed.
      // Header is always 1 line tall. Total vertical budget consumed by the header block:
      //   headerLineH   = headerFontSizePx * baseLineHeight   (1 text line at header font size)
      //   paddingBottom = headerFontSizePx * 0.5              (padding-bottom: 0.5em in header font)
      //   border        = headerConfig.showLine ? 1 : 0       (border-bottom: 1px solid)
      //   marginBottom  = baseFontSizePx * 0.5                (margin-bottom: 0.5em on wrapper, in body font)
      const headerSpaceEstimate = (() => {
        if (!safeConfig.header?.enabled) return 0;
        const headerConfig = safeConfig.header;
        const fontSizePercent = headerConfig.fontSize || 70;
        const headerFontSizePx = baseFontSizePx * (fontSizePercent / 100);
        const headerLineH    = headerFontSizePx * baseLineHeight;
        const paddingBottom  = headerFontSizePx * 0.5;
        const border         = headerConfig.showLine !== false ? 1 : 0;
        const marginBottom   = baseFontSizePx * baseLineHeight; // 1 line gap between header and text
        return Math.ceil(headerLineH + paddingBottom + border + marginBottom);
      })();
      const minOrphanLines = safeConfig.pagination?.minOrphanLines ?? 2;
      // Folio is fixed at FOLIO_FROM_BOTTOM_MM (15mm) from the physical page bottom edge.
      // The content box must end at least 1 full line ABOVE the folio top edge.
      //
      // Layout (bottom of page, measuring upward from physical edge):
      //   0px              → physical bottom edge
      //   folioFromEdgePx  → folio baseline (15mm up)
      //   folioFromEdgePx + lineHeightPx → minimum bottom of content box
      //   marginBottomPx   → CSS padding (content box floor when no reserve)
      //
      // folioReserve = extra px to subtract from rawContentHeight so that
      // content box bottom stays at least 1 line above the folio:
      //   required clearance from edge = folioFromEdgePx + lineHeightPx
      //   already provided by marginBottom = marginBottomPx
      //   reserve = required - provided (clamped to 0)
      const folioFromEdgePx = Math.round(FOLIO_FROM_BOTTOM_MM * PX_PER_MM * previewScale);
      const marginBottomPx  = Math.min(dimsOdd.marginBottom, dimsEven.marginBottom);
      const folioReserve    = Math.max(folioFromEdgePx + lineHeightPx - marginBottomPx, 0);
      // Snap DOWN to the nearest full line grid boundary so the engine never
      // allocates more px than fits in the page. ceil() caused DOM overflow
      // (engine budget > available px → text spilled over the folio).
      // The render subtracts 1 lineHeight from effectiveContentHeight (see store save below)
      // to guarantee a visible gap between the last text line and the folio.
      const rawContentHeight = Math.min(dimsOdd.contentHeight, dimsEven.contentHeight) - headerSpaceEstimate - folioReserve;
      const contentHeight = Math.floor(rawContentHeight / lineHeightPx) * lineHeightPx;

      if (process.env.NODE_ENV === 'development') {
        const floorDrop = rawContentHeight - contentHeight;
        console.log(`[PAGINATION-SETUP] marginBottom=${dimsOdd.marginBottom.toFixed(1)}px, headerSpace=${headerSpaceEstimate}px, folioReserve=${folioReserve.toFixed(1)}px, floorDrop=${floorDrop.toFixed(1)}px`);
        console.log(`[PAGINATION-SETUP] previewScale=${previewScale.toFixed(3)}, baseFontSize=${baseFontSize.toFixed(1)}pt, lineHeightPx=${lineHeightPx}px, contentWidth=${contentWidth.toFixed(1)}px, pageHeight=${pageHeightPx.toFixed(1)}px, contentHeight=${contentHeight.toFixed(1)}px, gutter=${gutterValueRef.current}`);
      }
      const minWidowLines = safeConfig.pagination?.minWidowLines ?? 2;
      const splitLongParagraphs = safeConfig.pagination?.splitLongParagraphs !== false;

      const fontFamily = targetFontFamily;

      // Extra bottom clearance on chapter-start pages so the last line of text
      // sits at least 1 line above the page number, giving visual breathing room.
      // Clamped to 0 if headerSpaceEstimate is small (no header space to reclaim).
      const chapterStartBottomClearance = Math.min(lineHeightPx, headerSpaceEstimate);

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
        splitLongParagraphs,
        headerSpaceEstimate,
        chapterStartBottomClearance,
      };
      const layoutHints = await getLayoutHints(safeBookData.chapters, safeConfig, layoutCtx);

      if (cancelled) return;

      let generatedPages;
      let paginationLog = null;
      let paginationSummaryText = null;
      try {
        const paginationResult = await new Promise((resolve, reject) => {
          if (paginationWorkerRef.current) {
            paginationWorkerRef.current.terminate();
          }
          paginationWorkerRef.current = new Worker(
            new URL('../workers/paginationWorker.js', import.meta.url),
            { type: 'module' }
          );
          paginationWorkerRef.current.onmessage = ({ data: msg }) => {
            if (msg.type === 'PROGRESS') {
              if (!cancelled) {
                useEditorStore.getState().setPaginationProgress(msg.percent);
              }
            } else if (msg.type === 'DONE') {
              resolve(msg);
            } else if (msg.type === 'ERROR') {
              reject(new Error(msg.message));
            }
          };
          paginationWorkerRef.current.onerror = (e) => {
            const msg = `Worker error: ${e?.message || '(no message)'} @ ${e?.filename || '?'}:${e?.lineno || '?'}:${e?.colno || '?'}`;
            console.error('[WORKER ONERROR]', msg, e);
            reject(new Error(msg));
          };
          // Pass the cached chapter hashes + page slices from the previous run so
          // the worker can skip greedyPaginate for unchanged chapters.
          const { chapterHashes: prevHashes, chapterPageSlices: prevSlices } = paginationCacheRef.current;
          paginationWorkerRef.current.postMessage({
            type: 'START',
            chapters: safeBookData.chapters,
            layoutCtx,
            safeConfig,
            layoutHints,
            ...(prevHashes && prevSlices
              ? { prevChapterHashes: prevHashes, prevChapterPageSlices: prevSlices }
              : {})
          });
        });
        if (cancelled) return;
        generatedPages = paginationResult.pages;
        paginationLog = paginationResult.log;
        paginationSummaryText = paginationResult.summaryText;
        // Save incremental layout cache for the next run.
        if (paginationResult.chapterHashes?.length) {
          paginationCacheRef.current = {
            chapterHashes: paginationResult.chapterHashes,
            chapterPageSlices: paginationResult.chapterPageSlices ?? null
          };
        }
        if (paginationLog) {
          useEditorStore.getState().setPaginationLog(paginationLog);
          if (process.env.NODE_ENV === 'development') {
            fetch('/api/pagination-log', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                log: paginationLog,
                summaryText: paginationSummaryText
              })
            }).catch(() => {})
          }
        }
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
        // renderContentHeight = engine budget exactly.
        // The Canvas measurement engine now recursively measures nested block
        // elements (chapter titles with inner divs/padding/borders), so the
        // engine budget matches DOM rendering. No buffer needed.
        const renderContentHeight = contentHeight;
        const dimsSnapshot = {
          contentHeight: renderContentHeight,
          contentWidth,
          lineHeightPx,
          baseFontSizePx,
          baseLineHeight,
          previewScale,
          gutterValue: engineGutter,
          fontFamily,
          textAlign,
          headerSpaceEstimate,
          chapterStartBottomClearance,
        };
        console.log(`[PAGINATION] Guardando layoutDims: contentHeight=${contentHeight}px renderContentHeight=${renderContentHeight}px engineGutter=${engineGutter}`);
        setLayoutDims(dimsSnapshot);
        useEditorStore.getState().setLayoutDims(dimsSnapshot);
        setPages(validatedPages);
        useEditorStore.getState().setPaginatedPages(validatedPages);
        
        if (ENABLE_TOC) {
          const tocEntries = extractTOC(safeBookData.chapters);
          const tocResolved = mapTOCToPages(tocEntries, validatedPages);
          useEditorStore.getState().setTOCData(tocResolved);
          
          const { tocAuto, frontMatterConfig } = useEditorStore.getState();
          let { tocConfig } = useEditorStore.getState();
          if (tocAuto && !tocConfig) {
            tocConfig = generateRecommendedTOCConfig(tocEntries);
            useEditorStore.getState().setTOCConfig(tocConfig);
            if (process.env.NODE_ENV === 'development') {
              console.log('[TOC] Auto-generated config:', tocConfig);
            }
          }

          if (tocConfig) {
            // Pass 1: dry run to know how many FM pages will be prepended
            const { pages: fmDry } = generateFrontMatter(
              safeBookData.title || 'Título del Libro',
              safeBookData.author || '',
              tocResolved,
              tocConfig,
              frontMatterConfig,
              contentHeight,
              lineHeightPx,
              contentWidth,
              baseFontSizePx,
              targetFontFamily
            );
            // Pass 2: offset TOC entry page numbers by FM count so they reflect
            // the sequential position in the full document (FM + content).
            const fmOffset = fmDry.length;
            const tocResolvedOffset = tocResolved.map(e => ({ ...e, page: (e.page || 1) + fmOffset }));
            const { pages: fmPages, h3AutoFontSize, tocLog, tocSummaryText } = generateFrontMatter(
              safeBookData.title || 'Título del Libro',
              safeBookData.author || '',
              tocResolvedOffset,
              tocConfig,
              frontMatterConfig,
              contentHeight,
              lineHeightPx,
              contentWidth,
              baseFontSizePx,
              targetFontFamily
            );
            // Assign displayPageNumber to FM pages (roman numerals, cover has none)
            const fmNumbering = useEditorStore.getState().config?.frontMatterNumbering ?? 'roman';
            const fmFolioCase = useEditorStore.getState().tocConfig?.folioCase ?? 'lower';
            let romanCounter = 0;
            const fmPagesNumbered = fmPages.map(p => {
              if (p.isTitlePage || p.isBlank) return { ...p, displayPageNumber: '' };
              romanCounter++;
              const roman = fmFolioCase === 'upper' ? toRoman(romanCounter).toUpperCase() : toRoman(romanCounter);
              const display = fmNumbering === 'roman' ? roman
                : fmNumbering === 'arabic' ? String(romanCounter)
                : '';
              return { ...p, displayPageNumber: display };
            });
            useEditorStore.getState().setFrontMatterPages(fmPagesNumbered);
            useEditorStore.getState().setTocBuildLog(tocLog);

            // ── DOM verification: measure actual rendered height of TOC pages ──
            if (process.env.NODE_ENV === 'development' && tocSummaryText) {
              let domVerification = '';
              try {
                const tocPages = fmPages.filter(p => p.isTOCPage);
                if (tocPages.length > 0 && typeof document !== 'undefined') {
                  const verifyDiv = document.createElement('div');
                  verifyDiv.style.cssText = [
                    'position:fixed', 'left:-99999px', 'top:0',
                    'visibility:hidden', 'pointer-events:none',
                    `width:${contentWidth}px`,
                    `font-size:${baseFontSizePx}px`,
                    `font-family:${targetFontFamily}`,
                    `line-height:${lineHeightPx}px`,
                    'text-align:left', 'hyphens:none',
                    'word-break:break-word', 'overflow-wrap:break-word',
                  ].join(';');
                  document.body.appendChild(verifyDiv);

                  const verifyLines = [`\nDOM VERIFICATION (actual scrollHeight vs contentHeight=${contentHeight}px):`];
                  for (let pi = 0; pi < tocPages.length; pi++) {
                    // Strip debug overlay (position:absolute divs) before measuring
                    // — they inflate scrollHeight without adding real content.
                    const cleanHtml = (tocPages[pi].html || '').replace(
                      /<div style="position:absolute;[^"]*?">[^]*?<\/div>/g, ''
                    );
                    verifyDiv.innerHTML = cleanHtml;
                    const scrollH = verifyDiv.scrollHeight;
                    const delta = scrollH - contentHeight;
                    const status = delta > 2 ? `!! OVERFLOW by ${delta.toFixed(1)}px (${(delta / lineHeightPx).toFixed(1)} lines)` :
                                   delta > 0 ? `~ marginal +${delta.toFixed(1)}px` : 'OK';
                    verifyLines.push(`  TOC page ${pi + 1}: scrollH=${scrollH}px contentH=${contentHeight}px delta=${delta.toFixed(1)}px ${status}`);

                    // ── Per-entry measurement (first 2 pages only) ──
                    if (pi < 2) {
                      const wrapper = verifyDiv.firstElementChild;
                      if (wrapper) {
                        const kids = wrapper.children;
                        verifyLines.push(`    wrapper children: ${kids.length}`);
                        for (let ci = 0; ci < kids.length; ci++) {
                          const el = kids[ci];
                          const cs = getComputedStyle(el);
                          const oh = el.offsetHeight;
                          const mt = cs.marginTop;
                          const mb = cs.marginBottom;
                          const lh = cs.lineHeight;
                          const fs = cs.fontSize;
                          const disp = cs.display;
                          const text = (el.textContent || '').substring(0, 30).replace(/\s+/g, ' ');
                          verifyLines.push(`    [${ci}] oh=${oh} mt=${mt} mb=${mb} lh=${lh} fs=${fs} d=${disp} "${text}"`);
                        }
                      }
                    }
                  }
                  document.body.removeChild(verifyDiv);
                  domVerification = verifyLines.join('\n');
                }
              } catch { /* no-op */ }

              const fmDebug = '\n\nFM PAGES displayPageNumber:\n' + fmPagesNumbered.map((p, i) =>
                `  [${i}] isTitlePage=${!!p.isTitlePage} isTOCPage=${!!p.isTOCPage} displayPageNumber="${p.displayPageNumber}"`
              ).join('\n');
              fetch('/api/toc-log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  summaryText: tocSummaryText + domVerification + fmDebug,
                  timestamp: new Date().toISOString()
                })
              }).catch(() => {});
            }
            // Update tocData with book-sequential page numbers (offset by FM count)
            useEditorStore.getState().setTOCData(tocResolvedOffset);
            // Patch pagination log page numbers so debug panel matches preview page numbers
            if (fmOffset > 0) {
              const rawLog = useEditorStore.getState().paginationLog;
              if (rawLog) {
                useEditorStore.getState().setPaginationLog({
                  ...rawLog,
                  config: { ...(rawLog.config || {}), fmOffset },
                  entries: rawLog.entries.map(e => ({ ...e, page: e.page + fmOffset })),
                  summary: rawLog.summary.map(s => ({ ...s, page: s.page + fmOffset }))
                });
              }
            }
            // Sync auto-computed H3 font size back to editor (separate from user levelOverrides)
            const autoH3Value = h3AutoFontSize || undefined;
            if (tocConfig.autoH3FontSize !== autoH3Value) {
              useEditorStore.getState().setTOCConfig({ ...tocConfig, autoH3FontSize: autoH3Value });
            }
            if (process.env.NODE_ENV === 'development') {
              console.log('[FrontMatter] Generated:', fmPages.length, 'pages');
            }
          }
          
          if (process.env.NODE_ENV === 'development') {
            console.log('[TOC] Extracted:', tocResolved.length, 'entries');
          }
        }
        
        useEditorStore.getState().setLayoutDims({
          contentHeight,
          contentWidth,
          lineHeightPx,
          baseFontSizePx,
          baseLineHeight,
          previewScale,
          gutterValue: engineGutter,
          fontFamily,
          textAlign,
        });
        useEditorStore.getState().setPaginationProgress(100);
        // Small delay so the 100% state renders before we hide the progress indicator
        setTimeout(() => {
          if (!cancelled) useEditorStore.getState().endPagination();
        }, 500);
      }
    };

    runPagination();

    return () => {
      cancelled = true;
      if (paginationWorkerRef.current) {
        paginationWorkerRef.current.terminate();
        paginationWorkerRef.current = null;
      }
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
    safeConfig.marginStrategy,
    globalOptMode,
    layoutPlannerRevision
  ]);
  
  // Re-number FM pages when frontMatterNumbering or folioCase changes without re-paginating
  const frontMatterNumbering = safeConfig.frontMatterNumbering ?? 'roman';
  const folioCase = useEditorStore(s => s.tocConfig?.folioCase ?? 'lower');
  useEffect(() => {
    const fmPages = useEditorStore.getState().frontMatterPages;
    if (!fmPages || fmPages.length === 0) return;
    let romanCounter = 0;
    const renumbered = fmPages.map(p => {
      if (p.isTitlePage || p.isBlank) return { ...p, displayPageNumber: '' };
      romanCounter++;
      const roman = folioCase === 'upper' ? toRoman(romanCounter).toUpperCase() : toRoman(romanCounter);
      const display = frontMatterNumbering === 'roman' ? roman
        : frontMatterNumbering === 'arabic' ? String(romanCounter)
        : '';
      return { ...p, displayPageNumber: display };
    });
    useEditorStore.getState().setFrontMatterPages(renumbered);
  }, [frontMatterNumbering, folioCase]);

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

  // Regenerate frontmatter whenever TOC/frontmatter config changes (without re-paginating)
  useEffect(() => {
    if (!ENABLE_TOC || !layoutDims) return;
    const { tocData, config: storeConfig } = useEditorStore.getState();
    const entries = tocData || [];

    const fmFontFamily = safeConfig.fontFamily || storeConfig?.fontFamily;
    // Pass 1: dry run to count how many FM pages will be prepended
    const { pages: fmDry } = generateFrontMatter(
      safeBookData.title || 'Título del Libro',
      safeBookData.author || '',
      entries,
      tocConfig,
      frontMatterConfig,
      layoutDims.contentHeight,
      layoutDims.lineHeightPx,
      layoutDims.contentWidth,
      layoutDims.baseFontSizePx,
      fmFontFamily
    );
    // Pass 2: offset TOC entry page numbers by FM count
    const fmOffset = fmDry.length;
    const entriesOffset = entries.map(e => ({ ...e, page: (e.page || 1) + fmOffset }));
    const { pages: fmPages, h3AutoFontSize, tocLog, tocSummaryText: tocSummary2 } = generateFrontMatter(
      safeBookData.title || 'Título del Libro',
      safeBookData.author || '',
      entriesOffset,
      tocConfig,
      frontMatterConfig,
      layoutDims.contentHeight,
      layoutDims.lineHeightPx,
      layoutDims.contentWidth,
      layoutDims.baseFontSizePx,
      fmFontFamily
    );
    // Assign displayPageNumber to FM pages (roman numerals, cover has none)
    const fmNumbering2 = useEditorStore.getState().config?.frontMatterNumbering ?? 'roman';
    const fmFolioCase2 = useEditorStore.getState().tocConfig?.folioCase ?? 'lower';
    let romanCounter2 = 0;
    const fmPagesNumbered2 = fmPages.map(p => {
      if (p.isTitlePage || p.isBlank) return { ...p, displayPageNumber: '' };
      romanCounter2++;
      const roman2 = fmFolioCase2 === 'upper' ? toRoman(romanCounter2).toUpperCase() : toRoman(romanCounter2);
      const display = fmNumbering2 === 'roman' ? roman2
        : fmNumbering2 === 'arabic' ? String(romanCounter2)
        : '';
      return { ...p, displayPageNumber: display };
    });
    useEditorStore.getState().setFrontMatterPages(fmPagesNumbered2);
    useEditorStore.getState().setTocBuildLog(tocLog);
    // Sync auto-computed H3 font size back to editor (separate from user levelOverrides)
    const autoH3Value = h3AutoFontSize || undefined;
    if (tocConfig?.autoH3FontSize !== autoH3Value) {
      useEditorStore.getState().setTOCConfig({ ...(tocConfig || {}), autoH3FontSize: autoH3Value });
    }

    // ── DOM verification for TOC config change path ──
    if (process.env.NODE_ENV === 'development' && tocSummary2) {
      let domV = '';
      try {
        const tocPgs = fmPages.filter(p => p.isTOCPage);
        if (tocPgs.length > 0 && typeof document !== 'undefined') {
          const vd = document.createElement('div');
          vd.style.cssText = `position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;width:${layoutDims.contentWidth}px;font-size:${layoutDims.baseFontSizePx}px;font-family:${fmFontFamily};line-height:${layoutDims.lineHeightPx}px;text-align:left;hyphens:none;word-break:break-word;overflow-wrap:break-word;`;
          document.body.appendChild(vd);
          const vLines = [`\nDOM VERIFICATION (actual scrollHeight vs contentHeight=${layoutDims.contentHeight}px):`];
          for (let pi = 0; pi < tocPgs.length; pi++) {
            const cleanH = (tocPgs[pi].html || '').replace(/<div style="position:absolute;[^"]*?">[^]*?<\/div>/g, '');
            vd.innerHTML = cleanH;
            const sH = vd.scrollHeight;
            const d = sH - layoutDims.contentHeight;
            const st = d > 2 ? `!! OVERFLOW by ${d.toFixed(1)}px (${(d / layoutDims.lineHeightPx).toFixed(1)} lines)` : d > 0 ? `~ marginal +${d.toFixed(1)}px` : 'OK';
            vLines.push(`  TOC page ${pi + 1}: scrollH=${sH}px contentH=${layoutDims.contentHeight}px delta=${d.toFixed(1)}px ${st}`);

            // ── Per-entry measurement (first 2 pages only) ──
            if (pi < 2) {
              const wrapEl = vd.firstElementChild;
              if (wrapEl) {
                const ch = wrapEl.children;
                vLines.push(`    wrapper children: ${ch.length}`);
                for (let ci = 0; ci < Math.min(ch.length, 30); ci++) {
                  const kid = ch[ci];
                  const ks = getComputedStyle(kid);
                  const txt = (kid.textContent || '').substring(0, 25).replace(/\s+/g, ' ');
                  vLines.push(`    [${ci}] oh=${kid.offsetHeight} mt=${ks.marginTop} mb=${ks.marginBottom} lh=${ks.lineHeight} fs=${ks.fontSize} "${txt}"`);
                }
              }
            }
          }
          document.body.removeChild(vd);
          domV = vLines.join('\n');
        }
      } catch { /* no-op */ }
      const fmDebug2 = '\n\nFM PAGES displayPageNumber:\n' + fmPagesNumbered2.map((p, i) =>
        `  [${i}] isTitlePage=${!!p.isTitlePage} isTOCPage=${!!p.isTOCPage} displayPageNumber="${p.displayPageNumber}"`
      ).join('\n');
      fetch('/api/toc-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summaryText: tocSummary2 + domV + fmDebug2, timestamp: new Date().toISOString() })
      }).catch(() => {});
    }
  }, [tocConfig, frontMatterConfig, layoutDims, safeBookData.title, safeBookData.author]);

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
