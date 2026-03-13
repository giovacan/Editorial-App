function MagnifierPanel({
  magnifierPanelRef,
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
  debugHtml,
  pageNumHtml,
  showHeaders,
  currentPageData,
  skipHeader,
  hasHeaderContent,
  headerHtml,
  handleMouseEnterMagnifier,
  handleMouseLeaveMagnifier
}) {
  const magScale = magnifierZoom / 100;
  const tx = -(magnifierPos.x / 100) * pageWidthPx * (magScale - 1);
  const ty = -(magnifierPos.y / 100) * pageHeightPx * (magScale - 1);

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
          className="preview-page"
          lang="es"
          style={{
            width: `${pageWidthPx}px`,
            height: `${pageHeightPx}px`,
            padding: `${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px`,
            fontSize: `${fontSize}px`,
            fontFamily,
            lineHeight: `${lineHeightPx}px`,
            textAlign,
            textJustify: 'inter-word',
            hyphens: 'none',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            background: 'white',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            overflow: 'hidden',
            boxSizing: 'border-box',
            transform: `scale(${magScale}) translate(${tx / magScale}px, ${ty / magScale}px)`,
            transformOrigin: '0 0'
          }}
        >
          {showHeaders && !currentPageData.isBlank && !skipHeader && hasHeaderContent && (
            <div
              className="preview-header"
              dangerouslySetInnerHTML={{ __html: headerHtml }}
              style={{ marginBottom: '0.5em' }}
            />
          )}
          <div
            ref={magnifierContentRef}
            className="preview-content"
            style={{ height: `${effectiveContentHeight}px` }}
            dangerouslySetInnerHTML={{ __html: debugHtml || '' }}
          />
          {pageNumHtml}
        </div>
      </div>
    </div>
  );
}

export default MagnifierPanel;
