/**
 * PageFrame — single source of truth for book page rendering.
 *
 * Used by:
 *  - ExportPreviewModal (zoom preview, cssScale != 1)
 *  - exporters.js (PDF rendering, cssScale = 1)
 *
 * Renders: header (via buildHeaderHtmlPure) + content + page number.
 * Header uses the actual Page object data (chapterTitle, currentSubheader, etc.)
 * so Preview and PDF always show the same header content.
 */

// useMemo removed — no longer needed after KP rendering moved to engine
import { buildHeaderHtmlPure } from '../../hooks/useHeaderFooter';
import { computeFolioStyle, computeShowFolio, computeFolioFromEdge } from '../../hooks/usePageRenderLayout';
// applyKpRendering removed — KP word-spacing now applied by the engine
import './PageFrame.css';

/**
 * @param {object}  page          - Page object from paginateChapters
 * @param {object}  dims          - Layout dimensions at previewScale:
 *                                  { pageWidthPx, pageHeightPx, marginTop, marginRight,
 *                                    marginBottom, marginLeft, fontSize, fontFamily,
 *                                    lineHeightPx, textAlign, effectiveContentHeight,
 *                                    baseFontSize }
 * @param {number}  [cssScale=1]  - Visual zoom via CSS transform (1 = no transform)
 * @param {boolean} [showMargins] - Show dashed margin guide overlay
 * @param {object}  config        - safeConfig (for header template, options, etc.)
 * @param {string}  [bookTitle]   - Book title for header content
 */
export default function PageFrame({
  page,
  dims,
  cssScale = 1,
  showMargins = false,
  config,
  bookTitle = '',
  tocConfig = null,
}) {
  const {
    pageWidthPx, pageHeightPx,
    marginTop, marginRight, marginBottom, marginLeft,
    fontSize, fontFamily, lineHeightPx,
    textAlign = 'justify',
    effectiveContentHeight,
    baseFontSize,
    previewScale = 0.42,
  } = dims;

  const rawHtml   = page?.html || '';
  const pageNum   = page?.pageNumber;
  const isBlank   = page?.isBlank;
  const isFrontMatterPage = !!(page?.isTOCPage || page?.isTitlePage || page?.isFrontMatter);
  const isTitleOnlyPage   = page?.isTitleOnlyPage === true;
  const isEvenPage        = (pageNum || 1) % 2 === 0;
  const showNums  = config?.showPageNumbers !== false;
  const showFolio = tocConfig?.showFolio !== false;

  const hasFmNumber = isFrontMatterPage && !!page?.displayPageNumber && showFolio;
  const showPageNum = computeShowFolio({
    showNums, isBlank: !!isBlank, isTitleOnlyPage, isFrontMatterPage, hasFmNumber,
    isExtraEndPage: !!page?.isExtraEndPage, shouldShowPageNumber: !!page?.shouldShowPageNumber,
  });
  const displayNum = page?.displayPageNumber ?? pageNum;

  // KP word-spacing is now applied by the engine — no render-time modification.
  const contentWidth = pageWidthPx - marginLeft - marginRight;
  const html = rawHtml;

  // ── Header ──────────────────────────────────────────────────────────────────
  const headerHtml = buildHeaderHtmlPure(page, config, bookTitle, baseFontSize);
  // isFirstChapterPage flag may be lost after post-processing — fall back to
  // checking if the page HTML contains a chapter title element (data-chapter-start).
  const pageHasChapterTitle = !!(rawHtml && rawHtml.includes('data-chapter-start="true"'));
  const isChapterStartPage  = page?.isFirstChapterPage === true || pageHasChapterTitle;
  const showHeader = config?.showHeaders !== false && (config?.header?.enabled !== false) && !!headerHtml
    && !!page
    && !isFrontMatterPage
    && !(config?.header?.skipFirstChapterPage !== false && isChapterStartPage);

  // ── Page number position ────────────────────────────────────────────────────
  // Fixed 15mm from physical page bottom — same formula as getPageLayout()
  const folioFromEdge  = computeFolioFromEdge(previewScale);
  const contentBoxHeight = effectiveContentHeight;
  const folioPos   = config?.pageNumberPos   || 'bottom';
  const folioAlign = config?.pageNumberAlign || 'center';
  const folioOnOuter = folioAlign === 'outer' || folioAlign === 'paragraph-edge' || folioAlign === 'paragraph';
  // outer-aligned folio at top: number is embedded inline in header row → suppress separate span
  const folioEmbeddedInHeader = folioPos === 'top' && folioOnOuter && showHeader;
  // center-aligned folio at top: number stays absolute, push header down to clear it
  const headerTopOffset = (folioPos === 'top' && !folioOnOuter && showHeader) ? folioFromEdge + fontSize * 0.3 : 0;

  const pageNumStyle = {
    ...computeFolioStyle({
      pos:            folioPos,
      align:          config?.pageNumberAlign  || 'center',
      marginFromEdge: folioFromEdge,
      isEvenPage,
      marginLeft,
      marginRight,
      fontSize,
    }),
    color: '#333',
  };

  // ── Page div inner styles ────────────────────────────────────────────────────
  const pageStyle = {
    width:         pageWidthPx,
    height:        pageHeightPx,
    padding:       `${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px`,
    fontSize:      `${fontSize}px`,
    fontFamily,
    lineHeight:    `${lineHeightPx}px`,
    textAlign,
    textJustify:   'inter-word',
    hyphens:       'none',
    wordBreak:     'break-word',
    overflowWrap:  'break-word',
    backgroundColor: '#fff',
    color:         '#000',
    boxSizing:     'border-box',
    overflow:      'hidden',
    position:      'relative',
    ...(cssScale !== 1 ? {
      transform:       `scale(${cssScale})`,
      transformOrigin: 'top left',
      position:        'absolute',
      top:  0,
      left: 0,
    } : {}),
  };

  const pageNode = (
    <div className="pf-page" lang="es" style={pageStyle}>
      {/* Margin guide overlay */}
      {showMargins && !isBlank && (
        <div
          className="pf-margin-guide"
          style={{
            position: 'absolute',
            inset: `${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px`,
          }}
        />
      )}

      {/* Header */}
      {showHeader && !isBlank && (
        <div
          className="pf-header"
          style={{ marginTop: headerTopOffset ? `${headerTopOffset}px` : undefined, marginBottom: '0.5em' }}
          dangerouslySetInnerHTML={{ __html: headerHtml }}
        />
      )}

      {/* Content */}
      <div
        className="pf-content preview-content"
        style={{ height: `${contentBoxHeight}px`, overflow: 'hidden' }}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {/* Page number — suppressed when embedded in header row (folio-at-top) */}
      {showPageNum && !folioEmbeddedInHeader && (
        <span className="pf-page-number" style={pageNumStyle}>
          {displayNum}
        </span>
      )}
    </div>
  );

  // When scaled, wrap in a slot div that holds the visual footprint
  if (cssScale !== 1) {
    return (
      <div
        className="pf-slot"
        style={{
          width:    pageWidthPx * cssScale,
          height:   pageHeightPx * cssScale,
          position: 'relative',
          flexShrink: 0,
        }}
      >
        {pageNode}
      </div>
    );
  }

  return pageNode;
}
