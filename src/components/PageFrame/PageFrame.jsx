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

import { useMemo } from 'react';
import { buildHeaderHtmlPure } from '../../hooks/useHeaderFooter';
import { computeFolioStyle, computeShowFolio, computeFolioFromEdge } from '../../hooks/usePageRenderLayout';
import { getScaledSize } from '../../utils/transformes';
import { renderPageAsEngineLines } from '../../utils/lineRenderer';
import { buildFootnoteBlockHtml } from '../../utils/footnotes';
import { useHydratedHtml } from '../../hooks/useHydratedHtml';
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
 * @param {object}  [renderCtx]   - Engine-scale layout ctx { contentWidth,
 *                                  baseFontSizePx, fontFamily }. When present (and
 *                                  config.render.engineLines !== false), the page
 *                                  HTML is drawn as the engine's exact line breaks
 *                                  — the SAME transform Preview.jsx and the vector
 *                                  PDF export use, so this preview matches both by
 *                                  construction. Absent → native browser wrapping.
 */
export default function PageFrame({
  page,
  dims,
  cssScale = 1,
  showMargins = false,
  config,
  bookTitle = '',
  tocConfig = null,
  renderCtx = null,
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
  // Front matter = TOC / title / cover. Key off the type field too: post-
  // processing (renumbering, offsetting, spreads) can drop the boolean flags,
  // and a TOC page that loses isTOCPage would wrongly show the running header
  // ("Capítulo" fallback leaked onto the Índice page in the export preview).
  const isFrontMatterPage = !!(
    page?.isTOCPage || page?.isTitlePage || page?.isFrontMatter ||
    page?.type === 'toc' || page?.type === 'title' || page?.type === 'cover'
  );
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

  // Deterministic line rendering — mirror Preview.jsx exactly so this preview
  // (used by the export modal) draws the SAME line breaks the main Preview tab
  // and the vector PDF export do. Front-matter pages (flex TOC layout) and
  // blanks pass through untouched, and it's a no-op without engine layout dims.
  const engineLinesOn = config?.render?.engineLines !== false;
  const htmlRaw = useMemo(() => {
    if (!engineLinesOn || isFrontMatterPage || isBlank || !renderCtx?.contentWidth) {
      return rawHtml;
    }
    return renderPageAsEngineLines(rawHtml, {
      contentWidth:  renderCtx.contentWidth,
      baseFontSizePx: renderCtx.baseFontSizePx,
      fontFamily:    renderCtx.fontFamily,
    });
  }, [rawHtml, engineLinesOn, isFrontMatterPage, isBlank, renderCtx]);
  // B2: bake image srcs (data-img-id → objectURL) into the html so the export
  // modal's pages show images too (was only a frame before).
  const html = useHydratedHtml(htmlRaw);

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
    // Front matter (title, TOC) uses left-aligned flow — no justify, no hyphens —
    // EXACTLY like Preview.jsx, so the modal preview matches the main preview.
    textAlign:     isFrontMatterPage ? 'left' : textAlign,
    textJustify:   isFrontMatterPage ? undefined : 'inter-word',
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

  // Debug line-grid: faint ruling every lineHeightPx from marginTop to the
  // folio, numbered — the SAME grid the vector PDF export draws, so preview and
  // export can be counted line-for-line. Toggled by config.debugGrid.
  const debugGrid = config?.debugGrid && !isBlank;
  const folioTopPx = pageHeightPx - computeFolioFromEdge(previewScale);
  const gridLines = [];
  if (debugGrid) {
    let n = 0;
    for (let gy = marginTop; gy <= folioTopPx + 0.5; gy += lineHeightPx, n++) {
      gridLines.push({ y: gy, n });
    }
  }

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

      {/* Debug line-grid overlay */}
      {debugGrid && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
          {gridLines.map(({ y, n }) => (
            <div key={n} style={{ position: 'absolute', left: marginLeft, right: marginRight, top: y,
              borderTop: '0.5px solid rgba(120,120,255,0.5)' }}>
              <span style={{ position: 'absolute', left: -14, top: -5, fontSize: 6, color: 'rgba(90,90,200,0.9)' }}>{n}</span>
            </div>
          ))}
          {/* content-box floor (red) */}
          <div style={{ position: 'absolute', left: marginLeft, right: marginRight,
            top: marginTop + contentBoxHeight, borderTop: '1px solid rgba(230,80,80,0.8)' }} />
          {/* folio line (green) */}
          <div style={{ position: 'absolute', left: marginLeft, right: marginRight,
            top: folioTopPx, borderTop: '1px solid rgba(60,180,60,0.8)' }} />
        </div>
      )}

      {/* Header */}
      {showHeader && !isBlank && (
        <div
          className="pf-header"
          style={{ marginTop: headerTopOffset ? `${headerTopOffset}px` : undefined, marginBottom: '0.5em' }}
          dangerouslySetInnerHTML={{ __html: headerHtml }}
        />
      )}

      {/* Content — box height matches Preview.jsx exactly (+¼ line of breathing
          room) so the modal preview clips at the same point as the main preview. */}
      <div
        className="pf-content preview-content"
        style={{ height: `${contentBoxHeight + Math.round(lineHeightPx * 0.25)}px`, overflow: 'hidden' }}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {/* Footnotes — the note block sits just above the folio, on the page that
          holds each marker. The engine already reserved this height (it fit less
          body text), so it never collides with the content. */}
      {page?.footnotes?.length > 0 && (
        <div
          className="pf-footnotes"
          style={{
            position: 'absolute',
            left: marginLeft,
            right: marginRight,
            bottom: folioFromEdge + fontSize * (config?.footnotes?.fontScale ?? 0.72) * 2,
            fontSize: `${fontSize * (config?.footnotes?.fontScale ?? 0.72)}px`,
            lineHeight: (config?.footnotes?.lineHeight ?? 1.4),
            color: '#000',
            textAlign: 'left',
          }}
          dangerouslySetInnerHTML={{ __html: buildFootnoteBlockHtml(page.footnotes, {}) }}
        />
      )}

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
    const slotSize = getScaledSize(pageWidthPx, pageHeightPx, cssScale);
    return (
      <div
        className="pf-slot"
        style={{
          width:    slotSize.width,
          height:   slotSize.height,
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
