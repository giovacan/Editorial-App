import LayoutGuidesOverlay from './LayoutGuidesOverlay';
import { useRef } from 'react';
import { getMagnifierTransform } from '../../utils/transformes';
import { computeFolioFromEdge } from '../../hooks/usePageRenderLayout';

function MagnifierPanel({
  magnifierPanelRef,
  magnifierPageRef,
  magnifierContentRef,
  magnifierZoom,
  magnifierPos,
  pageWidthPx,
  pageHeightPx,
  marginTop,
  marginRight,
  marginBottom,
  marginLeft,
  fontSize,
  fontFamily,
  lineHeightPx,
  textAlign,
  effectiveContentHeight,
  engineContentHeight,
  previewScale,
  showLayoutGuides,
  debugHtml,
  pageNumHtml,
  showHeaders,
  currentPageData,
  skipHeader,
  hasHeaderContent,
  headerHtml,
  isFrontMatterPage,
  handleMouseEnterMagnifier,
  handleMouseLeaveMagnifier
}) {
  const { transform: magnifierTransform } = getMagnifierTransform({
    zoomPercent: magnifierZoom,
    focusXPercent: magnifierPos.x,
    focusYPercent: magnifierPos.y,
    pageWidth: pageWidthPx,
    pageHeight: pageHeightPx,
  });
  const magContentRef = useRef(null);

  return (
    <div
      ref={magnifierPanelRef}
      className="magnifier-panel"
      style={{
        position: 'fixed',
        left: '60%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: '320px',
        height: '400px',
        background: 'white',
        border: '2px solid #333',
        borderRadius: '8px',
        overflow: 'hidden',
        zIndex: 1000,
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
      }}
      onMouseEnter={handleMouseEnterMagnifier}
      onMouseLeave={handleMouseLeaveMagnifier}
    >
      <div
        className="magnifier-panel-header"
        style={{ background: '#f5f5f5', padding: '8px 12px', borderBottom: '1px solid #ddd', fontSize: '12px', fontWeight: 'bold' }}
      >
        Vista {magnifierZoom}%
      </div>
      <div
        style={{
          width: '100%',
          height: 'calc(100% - 36px)',
          overflow: 'hidden',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '0',
          boxSizing: 'border-box',
          background: '#f0f0f0'
        }}
      >
        <div
          ref={magnifierPageRef}
          className="preview-page"
          lang="es"
          style={{
            width: `${pageWidthPx}px`,
            height: `${pageHeightPx}px`,
            padding: `${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px`,
            fontSize: `${fontSize}px`,
            fontFamily,
            lineHeight: `${lineHeightPx}px`,
            textAlign: isFrontMatterPage ? 'left' : textAlign,
            textJustify: isFrontMatterPage ? undefined : 'inter-word',
            hyphens: 'none',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            background: 'white',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            boxSizing: 'border-box',
            transform: magnifierTransform,
            transformOrigin: '0 0'
          }}
        >
          {showHeaders && !currentPageData.isBlank && !skipHeader && hasHeaderContent && !isFrontMatterPage && (
            <div
              className="preview-header"
              dangerouslySetInnerHTML={{ __html: headerHtml }}
              style={{ marginBottom: '0.5em' }}
            />
          )}
          <div
            ref={(el) => {
              magnifierContentRef.current = el;
              magContentRef.current = el;
            }}
            className="preview-content"
            style={{ height: `${effectiveContentHeight + Math.round(lineHeightPx * 0.25)}px` }}
            dangerouslySetInnerHTML={{ __html: debugHtml || '' }}
          />
          {showLayoutGuides && !currentPageData.isBlank && !isFrontMatterPage && (
            <LayoutGuidesOverlay
              contentRef={magContentRef}
              engineContentHeight={engineContentHeight}
              effectiveContentHeight={effectiveContentHeight}
              folioFromEdge={computeFolioFromEdge(previewScale)}
              marginBottom={marginBottom}
              marginLeft={marginLeft}
              contentWidth={pageWidthPx - marginLeft - marginRight}
              pageKey={currentPageData?.pageNumber}
            />
          )}
          {pageNumHtml}
        </div>
      </div>
    </div>
  );
}

export default MagnifierPanel;
