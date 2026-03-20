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
import { applyKpRendering } from '../../utils/textLayoutEngine';
import { JUSTIFY_SLACK_RATIO } from '../../utils/paginateChapters';
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
}) {
  const {
    pageWidthPx, pageHeightPx,
    marginTop, marginRight, marginBottom, marginLeft,
    fontSize, fontFamily, lineHeightPx,
    textAlign = 'justify',
    effectiveContentHeight,
    baseFontSize,
  } = dims;

  const rawHtml   = page?.html || '';
  const pageNum   = page?.pageNumber;
  const isBlank   = page?.isBlank;
  const showNums  = config?.showPageNumbers !== false;
  // Mirror Preview.jsx: also show number on extra end pages when explicitly flagged
  const showPageNum = (showNums && pageNum && !isBlank)
    || (page?.isExtraEndPage && page?.shouldShowPageNumber);

  // ── KP Rendering ─────────────────────────────────────────────────────────────
  // Apply Knuth-Plass optimal line breaks + word-spacing as a rendering-only
  // transform. The pages[] data (rawHtml) stays clean for pagination measurement.
  const contentWidth = pageWidthPx - marginLeft - marginRight;
  const html = useMemo(() => {
    if (!rawHtml || isBlank || textAlign !== 'justify') return rawHtml;
    return applyKpRendering(rawHtml, {
      baseFontSizePx: fontSize,
      fontFamily,
      contentWidth,
      widthSlack: contentWidth * JUSTIFY_SLACK_RATIO,
    });
  }, [rawHtml, isBlank, textAlign, fontSize, fontFamily, contentWidth]);

  // ── Header ──────────────────────────────────────────────────────────────────
  const headerConfig = config?.header || {};
  const headerHtml   = buildHeaderHtmlPure(page, config, bookTitle, baseFontSize);
  const showHeader   = !!headerHtml;

  // ── Page number position ────────────────────────────────────────────────────
  const isEvenPage       = (pageNum || 1) % 2 === 0;
  const pageNumberPos    = config?.pageNumberPos    || 'bottom';
  const pageNumberAlign  = config?.pageNumberAlign  || 'center';
  const pageNumMarginPx  = config?.pageNumberMargin ?? 12;

  let pageNumHorizontalStyle = {};
  switch (pageNumberAlign) {
    case 'paragraph-edge':
      pageNumHorizontalStyle = isEvenPage ? { left: `${marginLeft}px` } : { right: `${marginRight}px` };
      break;
    case 'paragraph':
      pageNumHorizontalStyle = isEvenPage ? { left: `${marginLeft + 12}px` } : { right: `${marginRight + 12}px` };
      break;
    case 'outer':
      pageNumHorizontalStyle = isEvenPage ? { left: '12px' } : { right: '12px' };
      break;
    default:
      pageNumHorizontalStyle = { left: '50%', transform: 'translateX(-50%)' };
  }

  const pageNumStyle = {
    position: 'absolute',
    ...(pageNumberPos === 'top' ? { top: `${pageNumMarginPx}px` } : { bottom: `${pageNumMarginPx}px` }),
    ...pageNumHorizontalStyle,
    fontSize: `${fontSize * 0.8}px`,
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
    hyphens:       'auto',
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
          style={{ marginBottom: '0.5em' }}
          dangerouslySetInnerHTML={{ __html: headerHtml }}
        />
      )}

      {/* Content */}
      <div
        className="pf-content preview-content"
        style={{ height: `${effectiveContentHeight}px`, overflow: 'hidden' }}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {/* Page number */}
      {showPageNum && (
        <span className="pf-page-number" style={pageNumStyle}>
          {pageNum}
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
