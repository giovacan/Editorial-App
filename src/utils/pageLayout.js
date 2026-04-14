/**
 * pageLayout.js — pure layout engine.
 *
 * getPageLayout() is the single source of truth for all layout decisions
 * needed to render one book page. Pure function: no React, no DOM, no store.
 *
 * Design rules:
 *   - Always prefers layoutDims.contentHeight from the pagination engine (store)
 *     over locally computed values — the engine is the authoritative source.
 *   - page number position: position:absolute measures from the physical page-box
 *     edge. bottom:X places folio X px above the physical bottom edge.
 *   - Units: mm internally → px for preview (via previewScale) → pt for PDF.
 *
 * Used by: usePageRenderLayout (hook wrapper), PageFrame (direct call for folio math)
 */

import { PX_PER_MM, PX_PER_INCH, FOLIO_FROM_BOTTOM_MM } from '../config/layout';
import { calculateContentDimensions } from './textMeasurer';
import { buildHeaderHtmlPure } from '../hooks/useHeaderFooter';

// ─── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Computes folio horizontal alignment style.
 *
 * @param {string}  align       - 'center' | 'outer' | 'paragraph-edge' | 'paragraph'
 * @param {boolean} isEvenPage
 * @param {number}  marginLeft  - px
 * @param {number}  marginRight - px
 */
export function computeFolioHorizontalStyle(align, isEvenPage, marginLeft, marginRight) {
  switch (align) {
    case 'outer':
    case 'paragraph-edge':
      return isEvenPage ? { left: `${marginLeft}px` } : { right: `${marginRight}px` };
    case 'paragraph':
      return isEvenPage
        ? { left: `${marginLeft + 12}px` }
        : { right: `${marginRight + 12}px` };
    default:
      return { left: '50%', transform: 'translateX(-50%)' };
  }
}

/**
 * Computes the full pageNumStyle CSS object.
 *
 * @param {object} opts
 * @param {string}  opts.pos            - 'top' | 'bottom'
 * @param {string}  opts.align          - see computeFolioHorizontalStyle
 * @param {number}  opts.marginFromEdge - px from physical page edge
 * @param {boolean} opts.isEvenPage
 * @param {number}  opts.marginLeft     - px
 * @param {number}  opts.marginRight    - px
 * @param {number}  opts.fontSize       - px (will be scaled ×0.8 for folio)
 */
export function computeFolioStyle({ pos, align, marginFromEdge, isEvenPage, marginLeft, marginRight, fontSize }) {
  const fromEdge = Math.max(marginFromEdge ?? 12, 6);
  const horizontalStyle = computeFolioHorizontalStyle(align, isEvenPage, marginLeft, marginRight);
  return {
    position: 'absolute',
    ...(pos === 'top' ? { top: `${fromEdge}px` } : { bottom: `${fromEdge}px` }),
    ...horizontalStyle,
    fontSize: `${fontSize * 0.8}px`,
  };
}

/**
 * Decides whether to show the folio on this page.
 *
 * @param {object} opts
 * @param {boolean} opts.showNums            - config.showPageNumbers !== false
 * @param {boolean} opts.isBlank
 * @param {boolean} opts.isTitleOnlyPage     - fullPage chapter layout (title alone, no content)
 * @param {boolean} opts.isFrontMatterPage
 * @param {boolean} opts.hasFmNumber         - FM page with a non-empty displayPageNumber
 * @param {boolean} opts.isExtraEndPage
 * @param {boolean} opts.shouldShowPageNumber - explicit override flag
 */
export function computeShowFolio({ showNums, isBlank, isTitleOnlyPage, isFrontMatterPage, hasFmNumber, isExtraEndPage, shouldShowPageNumber }) {
  if (!showNums || isBlank || isTitleOnlyPage) return false;
  // FM pages: only show if they have a number assigned (e.g. roman numerals)
  if (isFrontMatterPage) return hasFmNumber;
  // Extra end pages have an explicit flag
  if (isExtraEndPage) return !!shouldShowPageNumber;
  // Normal content pages always show
  return true;
}

/**
 * Computes how far the folio sits from the physical page bottom edge (px).
 *
 * Fixed at FOLIO_FROM_BOTTOM_MM (15mm) from the physical page edge.
 * The pagination engine reserves this space by reducing contentHeight,
 * so the folio never overlaps content.
 *
 * @param {number} previewScale - current preview scale factor
 */
export function computeFolioFromEdge(previewScale) {
  return Math.round(FOLIO_FROM_BOTTOM_MM * PX_PER_MM * previewScale);
}

// ─── Main engine ─────────────────────────────────────────────────────────────

/**
 * Pure layout engine — computes everything needed to render one book page.
 *
 * Returns a structured layout contract (page, margins, boxes, typography,
 * folio, header, flags) plus all flat properties for backwards compatibility
 * with existing consumers that destructure the flat shape.
 *
 * @param {object} opts
 * @param {object}  opts.pageData      - page object from paginatedPages / allPages
 * @param {object}  opts.config        - safeConfig
 * @param {object}  opts.bookConfig    - KDP_STANDARDS.getBookTypeConfig(bookType)
 * @param {object}  opts.pageFormat    - KDP_STANDARDS.getPageFormat(...)
 * @param {number}  opts.previewScale
 * @param {number}  opts.totalPages    - for dynamic margins
 * @param {object}  opts.layoutDims    - from store (pagination engine output)
 * @param {object}  [opts.tocConfig]   - for showFolio flag
 * @param {string}  [opts.bookTitle]   - for header
 */
export function getPageLayout({
  pageData,
  config,
  bookConfig,
  pageFormat,
  previewScale,
  totalPages,
  layoutDims,
  tocConfig = null,
  bookTitle = '',
}) {
  const safeConfig   = config   || {};
  const safePageData = pageData || { html: '', pageNumber: 1, isBlank: false };

  const isCurrentPageEven = (safePageData.pageNumber || 1) % 2 === 0;
  const isTitleOnlyPage   = safePageData.isTitleOnlyPage === true;
  const isFrontMatterPage = !!(safePageData.isTOCPage || safePageData.isTitlePage || safePageData.isFrontMatter);

  // Gutter: title-only pages are symmetric (no gutter shift)
  const effectiveGutter = layoutDims?.gutterValue ?? 0;
  const gutterForPage   = isTitleOnlyPage ? 0 : effectiveGutter;

  const applyDynamicMargins = (safeConfig.marginStrategy || 'auto') === 'auto';

  // Physical dimensions
  const dims = calculateContentDimensions(
    pageFormat, bookConfig, previewScale,
    gutterForPage, isCurrentPageEven,
    totalPages, applyDynamicMargins,
  );

  const { pageWidthPx, pageHeightPx, marginTop, marginBottom, marginLeft, marginRight } = dims;

  // contentHeight: pagination engine value is authoritative (already floor-snapped to line grid).
  // engineContentHeight has headerSpaceEstimate subtracted globally. On pages that skip
  // the header (chapter starts), we reclaim that space so the content box is taller.
  const engineContentHeight = layoutDims?.contentHeight ?? dims.contentHeight;
  const headerSpaceEstimate = layoutDims?.headerSpaceEstimate ?? 0;
  const chapterStartBottomClearance = layoutDims?.chapterStartBottomClearance ?? 0;
  const chapterStartExtraLines = layoutDims?.chapterStartExtraLines ?? 0;
  // Detect chapter start — same logic as skipHeader below, but need it now for height calc.
  const pageHasChTitle = !!(safePageData.html && safePageData.html.includes('data-chapter-start="true"'));
  const isChStartForHeight = safePageData.isFirstChapterPage === true || pageHasChTitle;
  // Mirror the engine's logic: skipFirstChapterPage defaults to true (opt-out, not opt-in).
  // paginateChapters.js uses `!== false` — we must match or the content box will be too small.
  const headerSkippedOnThisPage = (safeConfig.header?.skipFirstChapterPage !== false && isChStartForHeight) || false;
  // Chapter-start pages reclaim header space but reserve bottom clearance so the last
  // text line sits at least 1 line above the page number. Mirror engine's chStartExtra calc.
  const lineHeightPxForChStart = layoutDims?.lineHeightPx ?? Math.ceil(dims.contentHeight * 0.044);
  const effectiveContentHeight = headerSkippedOnThisPage
    ? engineContentHeight
      + Math.max(0, headerSpaceEstimate - chapterStartBottomClearance)
      + chapterStartExtraLines * lineHeightPxForChStart
    : engineContentHeight;

  // Typography
  const fontSize     = (safeConfig.fontSize || bookConfig.fontSize) * (PX_PER_INCH / 72) * previewScale;
  const fontFamily   = safeConfig.fontFamily || bookConfig.fontFamily;
  const lineHeightPx = layoutDims?.lineHeightPx ?? Math.ceil(fontSize * (safeConfig.lineHeight || bookConfig.lineHeight));
  const baseFontSize = (safeConfig.fontSize || bookConfig.fontSize) * previewScale;
  const textAlign    = safeConfig.paragraph?.align || 'justify';

  // Folio visibility
  const showNums    = safeConfig.showPageNumbers !== false;
  const showFolio   = tocConfig?.showFolio !== false;
  const hasFmNumber = isFrontMatterPage && !!safePageData.displayPageNumber && showFolio;

  const showPageNumber = computeShowFolio({
    showNums,
    isBlank:              !!safePageData.isBlank,
    isTitleOnlyPage,
    isFrontMatterPage,
    hasFmNumber,
    isExtraEndPage:       !!safePageData.isExtraEndPage,
    shouldShowPageNumber: !!safePageData.shouldShowPageNumber,
  });

  const displayNum = safePageData.displayPageNumber ?? safePageData.pageNumber;

  // Header — must be computed before folio so headerSpaceUsed is available
  const headerHtml       = buildHeaderHtmlPure(safePageData, safeConfig, bookTitle, baseFontSize);
  const showHeaders      = safeConfig.showHeaders !== false && (safeConfig.header?.enabled !== false);
  const hasHeaderContent = !!headerHtml;
  // isFirstChapterPage flag may be lost after post-processing passes.
  // Fall back to checking if the page HTML contains a chapter title element.
  const pageHasChapterTitle = !!(safePageData.html && safePageData.html.includes('data-chapter-start="true"'));
  const isChapterStartPage  = safePageData.isFirstChapterPage === true || pageHasChapterTitle;
  const skipHeader          = (safeConfig.header?.skipFirstChapterPage !== false && isChapterStartPage) || false;

  // Header physical geometry (flow element inside page padding, above content)
  const headerFontSizePx     = baseFontSize * ((safeConfig.header?.fontSize ?? 70) / 100);
  const headerLineHeightPx   = headerFontSizePx * (safeConfig.lineHeight || bookConfig.lineHeight);
  const headerMarginBottomPx = (safeConfig.header?.marginBottom ?? 0.5) * headerFontSizePx;
  const headerBoxHeight      = headerLineHeightPx + headerMarginBottomPx;
  // y: starts at marginTop — header is a flow element inside the page padding
  const headerBoxY           = marginTop;
  // Space actually consumed by header when visible (matches usePagination.js headerSpaceEstimate)
  const headerEnabled        = safeConfig.showHeaders !== false && (safeConfig.header?.enabled !== false);
  const headerSpaceUsed      = (headerEnabled && hasHeaderContent && !skipHeader)
    ? Math.ceil(
        headerLineHeightPx
        + headerFontSizePx * 0.5                                    // padding-bottom: 0.5em
        + (safeConfig.header?.showLine !== false ? 1 : 0)           // border: 1px
        + baseFontSize * (safeConfig.lineHeight || bookConfig.lineHeight), // margin-bottom: 1 line
      )
    : 0;

  // Folio position — fixed 15mm from physical page bottom edge
  const folioFromEdge = computeFolioFromEdge(previewScale);
  const pageNumStyle  = computeFolioStyle({
    pos:            safeConfig.pageNumberPos   || 'bottom',
    align:          safeConfig.pageNumberAlign || 'center',
    marginFromEdge: folioFromEdge,
    isEvenPage:     isCurrentPageEven,
    marginLeft,
    marginRight,
    fontSize,
  });

  // Derived geometry
  const contentWidth = pageWidthPx - marginLeft - marginRight;

  return {
    // ── Structured layout contract ───────────────────────────────────────────
    page: {
      width:  pageWidthPx,
      height: pageHeightPx,
    },
    margins: {
      top:    marginTop,
      bottom: marginBottom,
      left:   marginLeft,
      right:  marginRight,
      // Binding-side / outer-edge (useful for layout guides)
      inner:  isCurrentPageEven ? marginRight : marginLeft,
      outer:  isCurrentPageEven ? marginLeft  : marginRight,
    },
    boxes: {
      contentBox: {
        x:      marginLeft,
        y:      marginTop,
        width:  contentWidth,
        height: effectiveContentHeight,
      },
      folioBox: {
        fromEdge: folioFromEdge,
      },
      headerBox: {
        x:      marginLeft,
        y:      headerBoxY,
        width:  contentWidth,
        height: headerBoxHeight,
      },
    },
    typography: {
      fontSize,
      baseFontSize,
      fontFamily,
      lineHeightPx,
      textAlign,
      contentWidth,
    },
    folio: {
      show:     showPageNumber,
      value:    displayNum,
      align:    safeConfig.pageNumberAlign || 'center',
      position: safeConfig.pageNumberPos   || 'bottom',
      fromEdge: folioFromEdge,
      style:    pageNumStyle,
    },
    header: {
      show:       showHeaders && hasHeaderContent && !skipHeader,
      content:    headerHtml,
      hasContent: hasHeaderContent,
      skip:       skipHeader,
      position: {
        x:      marginLeft,
        y:      headerBoxY,
        width:  contentWidth,
        height: headerBoxHeight,
      },
      style: {
        fontSize:      headerFontSizePx,
        fontFamily:    safeConfig.header?.fontFamily || fontFamily,
        letterSpacing: safeConfig.header?.letterSpacing ?? 0,
        uppercase:     safeConfig.header?.fontFamily === 'small-caps',
        showLine:      safeConfig.header?.showLine ?? true,
        lineStyle:     safeConfig.header?.lineStyle  || 'solid',
        lineWidth:     safeConfig.header?.lineWidth  ?? 0.5,
        lineColor:     safeConfig.header?.lineColor  || 'black',
      },
    },
    flags: {
      isEvenPage:   isCurrentPageEven,
      isFrontMatter: isFrontMatterPage,
      isTitleOnly:  isTitleOnlyPage,
      isBlank:      !!safePageData.isBlank,
    },
    effectiveContentHeight,
    engineContentHeight,

    // ── Flat backwards-compat properties ────────────────────────────────────
    // All existing consumers that destructure these keep working unchanged.
    pageWidthPx, pageHeightPx,
    marginTop, marginBottom, marginLeft, marginRight,
    fontSize, fontFamily, lineHeightPx, textAlign, baseFontSize,
    showPageNumber, displayNum, pageNumStyle,
    showHeaders, hasHeaderContent, skipHeader, headerHtml,
    isFrontMatterPage, isTitleOnlyPage, isCurrentPageEven,
  };
}
