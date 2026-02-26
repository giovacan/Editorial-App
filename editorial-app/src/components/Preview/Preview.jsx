import { useState, useEffect, useRef, memo } from 'react';
import { KDP_STANDARDS } from '../../utils/kdpStandards';
import useEditorStore from '../../store/useEditorStore';
import { usePagination, usePageNavigation } from '../../hooks/usePagination';
import { useMagnifier } from '../../hooks/useMagnifier';
import { useHeaderFooter, buildHeaderHtml } from '../../hooks/useHeaderFooter';
import { calculateContentDimensions } from '../../utils/textMeasurer';
import './Preview.css';

const AVAILABLE_SIDEBAR_WIDTH = 220;
const PX_PER_MM = 3.7795;
const PX_PER_INCH = 96;

const DEFAULT_CONFIG = {
  pageFormat: 'a5',
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
    layout: 'continuous'
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
  quote: { enabled: true, indentLeft: 2, indentRight: 2, showLine: true, italic: true, sizeMultiplier: 0.95, marginTop: 1, marginBottom: 1 },
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

function Preview() {
  const { bookData, config } = useEditorStore();
  const activeChapterId = useEditorStore((state) => state.editing?.activeChapterId);
  
  const measureRef = useRef(null);
  const previewPageRef = useRef(null);
  const navigatedChapterRef = useRef(null);
  const previewScrollRef = useRef(null);
  
  const safeBookData = bookData || { bookType: 'novela', chapters: [], title: '' };
  const safeConfig = config || DEFAULT_CONFIG;
  
  const bookConfig = KDP_STANDARDS.getBookTypeConfig(safeBookData.bookType);
  const pageFormat = KDP_STANDARDS.getPageFormat(safeConfig.pageFormat || bookConfig.recommendedFormat);
  
  const previewScale = Math.min(0.42, AVAILABLE_SIDEBAR_WIDTH / (pageFormat.width * PX_PER_MM));
  
  const { 
    pageWidthPx, 
    pageHeightPx, 
    marginTop, 
    marginBottom, 
    marginLeft, 
    marginRight, 
    contentWidth, 
    contentHeight 
  } = calculateContentDimensions(pageFormat, bookConfig, previewScale);
  
  const { pages } = usePagination(bookData, config, measureRef);
  const { currentPage, goToPage, goToNextPage, goToPrevPage, goToFirstPage, goToLastPage, totalPages } = usePageNavigation(pages.length);
  
  const {
    showMagnifier,
    setShowMagnifier,
    magnifierZoom,
    setMagnifierZoom,
    magnifierPanelRef,
    updateMagnifierPosition,
    handleMouseEnterPreview,
    handleMouseLeavePreview,
    handleMouseEnterMagnifier,
    handleMouseLeaveMagnifier
  } = useMagnifier(previewPageRef);
  
  const currentPageData = pages[currentPage] || { html: '', pageNumber: 1, isBlank: false };
  
  const {
    showHeaders,
    showFooter,
    headerLeft,
    headerCenter,
    headerRight,
    isEvenPage,
    headerConfig
  } = useHeaderFooter(safeConfig, currentPageData, totalPages, safeBookData.title);
  
  const baseFontSize = (safeConfig.fontSize || bookConfig.fontSize) * previewScale;
  const headerHtml = buildHeaderHtml(headerLeft, headerCenter, headerRight, headerConfig, baseFontSize);
  
  const fontSize = (safeConfig.fontSize || bookConfig.fontSize) * (PX_PER_INCH / 72) * previewScale;
  const fontFamily = safeConfig.fontFamily || bookConfig.fontFamily;
  const lineHeight = safeConfig.lineHeight || bookConfig.lineHeight;
  const textAlign = safeConfig.paragraph?.align || 'justify';
  const showNums = safeConfig.header?.showPageNumbers !== false;
  
  const skipHeader = headerConfig.skipFirstChapterPage && currentPageData.isFirstChapterPage;
  const hasHeaderContent = headerLeft || headerCenter || headerRight;
  const showHeaderLine = (headerConfig.showLine !== false) && hasHeaderContent;
  
  const pageNumHtml = (showNums && !currentPageData.isBlank) ? (
    <span className="page-number" style={{ position: 'absolute', bottom: '12px', right: '24px', fontSize: `${fontSize * 0.8}pt` }}>
      {currentPageData.pageNumber}
    </span>
  ) : null;
  
  return (
    <div className="preview-wrapper">
      <div ref={measureRef} lang="es" style={{ position: 'fixed', left: -99999, top: 0, visibility: 'hidden' }}></div>
      
      <div className="preview-controls">
        <div className="preview-controls-left">
          <button 
            className="btn btn-icon" 
            onClick={goToFirstPage}
            disabled={currentPage === 0}
            title="Primera página"
          >
            «
          </button>
          <button 
            className="btn btn-icon" 
            onClick={goToPrevPage}
            disabled={currentPage === 0}
            title="Página anterior"
          >
            ←
          </button>
          <span className="page-info">
            <input 
              type="number" 
              min="1" 
              max={totalPages}
              value={currentPage + 1}
              onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
              className="page-input"
            /> 
            / {totalPages}
          </span>
          <button 
            className="btn btn-icon" 
            onClick={goToNextPage}
            disabled={currentPage >= totalPages - 1}
            title="Página siguiente"
          >
            →
          </button>
          <button 
            className="btn btn-icon" 
            onClick={goToLastPage}
            disabled={currentPage >= totalPages - 1}
            title="Última página"
          >
            »
          </button>
        </div>
        <div className="preview-controls-right">
          <button 
            className={`zoom-btn ${magnifierZoom === 150 ? 'active' : ''}`}
            onClick={() => setMagnifierZoom(150)}
            title="Zoom 150%"
          >
            150%
          </button>
          <button 
            className={`zoom-btn ${magnifierZoom === 200 ? 'active' : ''}`}
            onClick={() => setMagnifierZoom(200)}
            title="Zoom 200%"
          >
            200%
          </button>
          <button 
            className={`zoom-btn ${magnifierZoom === 250 ? 'active' : ''}`}
            onClick={() => setMagnifierZoom(250)}
            title="Zoom 250%"
          >
            250%
          </button>
          <button 
            className={`zoom-btn ${magnifierZoom === 300 ? 'active' : ''}`}
            onClick={() => setMagnifierZoom(300)}
            title="Zoom 300%"
          >
            300%
          </button>
        </div>
      </div>

      <div className="preview-scroll" ref={previewScrollRef}>
        <div
          ref={previewPageRef}
          className="preview-page"
          lang="es"
          style={{
            width: `${pageWidthPx}px`,
            height: `${pageHeightPx}px`,
            padding: `${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px`,
            fontSize: `${fontSize}px`,
            fontFamily: fontFamily,
            lineHeight: lineHeight,
            textAlign: textAlign,
            textJustify: 'inter-word',
            hyphens: 'auto',
            wordBreak: 'break-word'
          }}
          onMouseMove={updateMagnifierPosition}
          onMouseEnter={handleMouseEnterPreview}
          onMouseLeave={handleMouseLeavePreview}
        >
          {showHeaders && !currentPageData.isBlank && !skipHeader && hasHeaderContent && (
            <div 
              className="preview-header"
              dangerouslySetInnerHTML={{ __html: headerHtml }}
              style={{ marginBottom: '0.5em' }}
            />
          )}
          
          <div 
            className="preview-content"
            dangerouslySetInnerHTML={{ __html: currentPageData.html || '' }}
          />
          
          {pageNumHtml}
        </div>
      </div>

      {showMagnifier && previewPageRef.current && !currentPageData.isBlank ? (
        <div 
          ref={magnifierPanelRef}
          className="magnifier-panel"
          style={{
            width: '200px',
            height: '200px',
            position: 'fixed',
            left: '60%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            border: '2px solid #333',
            borderRadius: '50%',
            overflow: 'hidden',
            background: 'white',
            zIndex: 1000,
            backgroundImage: `url(${getMagnifierImage()})`,
            backgroundSize: `${magnifierZoom}%`,
            backgroundPosition: `${magnifierPos.x}% ${magnifierPos.y}%`,
            backgroundRepeat: 'no-repeat',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
          }}
          onMouseEnter={handleMouseEnterMagnifier}
          onMouseLeave={handleMouseLeaveMagnifier}
        />
      ) : null}
    </div>
  );
  
  function getMagnifierImage() {
    if (!previewPageRef.current) return '';
    return '';
  }
}

export default memo(Preview);
