import { useRef, memo, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { KDP_STANDARDS } from '../../utils/kdpStandards';
import useEditorStore from '../../store/useEditorStore';
import { usePagination, usePageNavigation } from '../../hooks/usePagination';
import { useMagnifier } from '../../hooks/useMagnifier';
import { useHeaderFooter, buildHeaderHtml } from '../../hooks/useHeaderFooter';
import { calculateContentDimensions } from '../../utils/textMeasurer';
import PreviewDebugPanel from './PreviewDebugPanel';
import ValidationErrorDialog from '../ValidationErrorDialog/ValidationErrorDialog';
import './Preview.css';

const AVAILABLE_SIDEBAR_WIDTH = 220;
const PX_PER_MM = 3.7795;
const PX_PER_INCH = 96;

const DEFAULT_CONFIG = {
  pageFormat: 'a5',
  customPageFormat: { width: 6, height: 9, unit: 'in' },
  gutterStrategy: 'auto',
  gutterManual: 0.25,
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

function Preview() {
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  
  const bookData = useEditorStore(useShallow((s) => s.bookData));
  const config = useEditorStore(useShallow((s) => s.config));
  const editing = useEditorStore(useShallow((s) => s.editing));
  const setConfig = useEditorStore((s) => s.setConfig);
  
  const activeChapterId = editing?.activeChapterId;
  
  const measureRef = useRef(null);
  const previewPageRef = useRef(null);
  const navigatedChapterRef = useRef(null);
  const previewScrollRef = useRef(null);

  // Initialize measureRef in document.body (outside any overflow containers)
  useEffect(() => {
    if (!measureRef.current) {
      const div = document.createElement('div');
      div.style.position = 'fixed';
      div.style.left = '-99999px';
      div.style.top = '0';
      div.style.visibility = 'hidden';
      div.style.pointerEvents = 'none';
      div.setAttribute('lang', 'es');
      document.body.appendChild(div);
      measureRef.current = div;

      return () => {
        if (measureRef.current && measureRef.current.parentNode) {
          measureRef.current.parentNode.removeChild(measureRef.current);
        }
      };
    }
  }, []);

  const safeBookData = bookData || { bookType: 'novela', chapters: [], title: '' };
  const safeConfig = config || DEFAULT_CONFIG;
  const debugConfig = safeConfig.previewDebug || { 
    enabled: false,
    elements: { headers: true, paragraphs: true, quotes: true },
    spacing: { indent: true, paragraphGap: true },
    pageBreaks: { showEndOfPage: true, showContinued: true },
    dimensions: { margins: false, gutter: false, pageSize: false }
  };

  const addDebugTags = (html) => {
    if (!debugConfig.enabled || !html) return html;
    
    const isChapterTitle = (text) => {
      const patterns = [
        /^(cap[ií]tulo|chapter|cap\.?)\s+\d+/i,
        /^(parte|part|book)\s+\d+/i,
        /^(introducci[ó]n|introduction|pr[ó]logo|prologue)/i,
        /^\d+\.\s+[A-ZÁÉÍÓÚÑ]/,
        /^secci[ó]n\s+\d+/i
      ];
      return patterns.some(p => p.test(text.trim()));
    };
    
    let processedHtml = html;
    
    if (debugConfig.elements.headers) {
      processedHtml = processedHtml.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (match, level, content) => {
        const tag = 'h' + level;
        const label = tag.toUpperCase();
        return `<span class="debug-tag ${tag}">[${label}]</span>${match}`;
      });
      
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      
      let maxFontSize = 0;
      const boldElements = tempDiv.querySelectorAll('p strong, p b');
      boldElements.forEach(el => {
        const style = window.getComputedStyle(el);
        const fontSize = parseFloat(style.fontSize) || 0;
        if (fontSize > maxFontSize) maxFontSize = fontSize;
      });
      
      const sizeThreshold = maxFontSize * 0.9;
      
      processedHtml = processedHtml.replace(/<p[^>]*>\s*<(strong|b)[^>]*>([\s\S]*?)<\/\1>\s*<\/p>/gi, (match, tag, content) => {
        const textContent = content.replace(/<[^>]+>/g, '').trim();
        const isChapter = isChapterTitle(textContent);
        
        const tempP = document.createElement('p');
        tempP.innerHTML = match;
        const strongEl = tempP.querySelector('strong, b');
        let isLargest = false;
        if (strongEl) {
          const style = window.getComputedStyle(strongEl);
          const fontSize = parseFloat(style.fontSize) || 0;
          isLargest = fontSize >= sizeThreshold;
        }
        
        if (textContent.length > 2) {
          const label = isChapter || isLargest ? 'h1' : 'h2';
          return `<span class="debug-tag ${label}">[${label.toUpperCase()}]</span>${match}`;
        }
        return match;
      });
    }
    
    if (debugConfig.elements.quotes) {
      processedHtml = processedHtml.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (match) => {
        return `<span class="debug-tag quote">[Q]</span>${match}`;
      });
      
      processedHtml = processedHtml.replace(/<p[^>]*class="[^"]*quote[^"]*"[^>]*>([\s\S]*?)<\/p>/gi, (match) => {
        return `<span class="debug-tag quote">[Q]</span>${match}`;
      });
      
      processedHtml = processedHtml.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, (match, content) => {
        const textContent = match.replace(/<[^>]+>/g, '').trim();
        if (textContent.length > 10 && textContent.length < 500) {
          return `<span class="debug-tag quote">[Q]</span>${match}`;
        }
        return match;
      });
    }
    
    if (debugConfig.elements.paragraphs) {
      processedHtml = processedHtml.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (match, content) => {
        const textContent = content.replace(/<[^>]+>/g, '').trim();
        const hasBold = /<strong[^>]*>|<\/?b[^>]*>/i.test(content);
        if (textContent.length > 0 && !hasBold) {
          const hasIndent = safeConfig.paragraph?.firstLineIndent > 0;
          const indentLabel = hasIndent ? `[SANG:${safeConfig.paragraph.firstLineIndent}em]` : '';
          return `<span class="debug-tag paragraph">[P]${indentLabel}</span>${match}`;
        }
        return match;
      });
    }
    
    return processedHtml;
  };
  
  const bookConfig = KDP_STANDARDS.getBookTypeConfig(safeBookData.bookType);
  
  let pageFormat;
  if (safeConfig.pageFormat === 'custom') {
    const customDims = KDP_STANDARDS.getCustomPageDimensions(
      safeConfig.customPageFormat?.width || 6,
      safeConfig.customPageFormat?.height || 9,
      safeConfig.customPageFormat?.unit || 'in'
    );
    pageFormat = {
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
  } else {
    pageFormat = KDP_STANDARDS.getPageFormat(safeConfig.pageFormat || bookConfig.recommendedFormat);
  }
  
  const { 
    pages = [],
    validationState,
    showErrorDialog,
    currentError,
    handleErrorAction,
    closeErrorDialog
  } = usePagination(bookData, config, measureRef);
  const totalPageCount = pages.length;
  
  const gutterValue = safeConfig.gutterStrategy === 'custom'
    ? getGutterInInches(safeConfig.gutterManual, safeConfig.gutterUnit || 'in')
    : KDP_STANDARDS.getDynamicGutter(safeConfig.pageFormat, safeBookData.bookType, totalPageCount);
  const { currentPage, goToPage, goToNextPage, goToPrevPage, goToFirstPage, goToLastPage, totalPages } = usePageNavigation(pages.length);
  
  const currentPageData = (pages && pages.length > 0 && pages[currentPage]) ? pages[currentPage] : { html: '', pageNumber: 1, isBlank: false, chapterTitle: '', currentSubheader: '' };
  
  const debugHtml = debugConfig.enabled ? addDebugTags(currentPageData.html) : currentPageData.html;
  
  const isCurrentPageEven = currentPageData.pageNumber % 2 === 0;
  const isTitleOnlyPage = currentPageData.isTitleOnlyPage === true;
  const gutterForPage = isTitleOnlyPage ? 0 : gutterValue;
  
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
  } = calculateContentDimensions(pageFormat, bookConfig, previewScale, gutterForPage, isCurrentPageEven, totalPages);

  const {
    showMagnifier,
    setShowMagnifier,
    magnifierZoom,
    setMagnifierZoom,
    magnifierPanelRef,
    magnifierPos,
    updateMagnifierPosition,
    handleMouseEnterPreview,
    handleMouseLeavePreview,
    handleMouseEnterMagnifier,
    handleMouseLeaveMagnifier
  } = useMagnifier(previewPageRef);
  
  const {
    showHeaders,
    showFooter,
    headerLeft,
    headerCenter,
    headerRight,
    isEvenPage,
    headerConfig,
    truncatedSubheader,
    subtopicBehavior,
    subtopicSeparator
  } = useHeaderFooter(safeConfig, currentPageData, totalPages, safeBookData.title);
  
  const baseFontSize = (safeConfig.fontSize || bookConfig.fontSize) * previewScale;
  const headerHtml = buildHeaderHtml(headerLeft, headerCenter, headerRight, headerConfig, baseFontSize);
  
  const fontSize = (safeConfig.fontSize || bookConfig.fontSize) * (PX_PER_INCH / 72) * previewScale;
  const fontFamily = safeConfig.fontFamily || bookConfig.fontFamily;
  const lineHeight = safeConfig.lineHeight || bookConfig.lineHeight;
  const textAlign = safeConfig.paragraph?.align || 'justify';
  const showNums = safeConfig.showPageNumbers !== false;
   
  const skipHeader = headerConfig.skipFirstChapterPage && currentPageData.isFirstChapterPage;
  const hasHeaderContent = headerLeft || headerCenter || headerRight;
  const showHeaderLine = (headerConfig.showLine !== false) && hasHeaderContent;
   
  const showPageNumber = (showNums && !currentPageData.isBlank) || (currentPageData.isExtraEndPage && currentPageData.shouldShowPageNumber);
   
  const pageNumberPos = safeConfig.pageNumberPos || 'bottom';
  const pageNumberAlign = safeConfig.pageNumberAlign || 'center';
   
  const pageNumY = 12;
  let pageNumX = 0;
  let pageNumHorizontalStyle = {};
   
  switch (pageNumberAlign) {
    case 'paragraph-edge':
      if (isCurrentPageEven) {
        pageNumHorizontalStyle = { left: `${marginLeft}px` };
      } else {
        pageNumHorizontalStyle = { right: `${marginRight}px` };
      }
      break;
    case 'paragraph':
      if (isCurrentPageEven) {
        pageNumX = marginLeft + 12;
        pageNumHorizontalStyle = { left: `${pageNumX}px` };
      } else {
        pageNumX = marginRight + 12;
        pageNumHorizontalStyle = { right: `${pageNumX}px` };
      }
      break;
    case 'outer':
      if (isCurrentPageEven) {
        pageNumHorizontalStyle = { left: '12px' };
      } else {
        pageNumHorizontalStyle = { right: '12px' };
      }
      break;
    case 'center':
    default:
      pageNumHorizontalStyle = { left: '50%', transform: 'translateX(-50%)' };
      break;
  }
  
  const pageNumVerticalStyle = pageNumberPos === 'top' ? { top: `${pageNumY}px` } : { bottom: `${pageNumY}px` };
  
  const pageNumStyle = {
    position: 'absolute',
    ...pageNumVerticalStyle,
    ...pageNumHorizontalStyle,
    fontSize: `${fontSize * 0.8}pt`
  };
   
  const pageNumHtml = showPageNumber ? (
    <span className="page-number" style={pageNumStyle}>
      {currentPageData.pageNumber}
    </span>
  ) : null;
  
  return (
    <div className="preview-wrapper">
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
          <button 
            className={`zoom-btn ${showDebugPanel ? 'active' : ''}`}
            onClick={() => setShowDebugPanel(!showDebugPanel)}
            title="Modo Developer"
            style={{ fontSize: '12px', padding: '4px 6px' }}
          >
            ⚙️
          </button>
        </div>
      </div>

      {showDebugPanel && (
        <PreviewDebugPanel 
          config={config}
          onChange={setConfig}
          onClose={() => setShowDebugPanel(false)}
        />
      )}

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
            dangerouslySetInnerHTML={{ __html: debugHtml || '' }}
          />

          {pageNumHtml}
        </div>
      </div>

      {showMagnifier && previewPageRef.current && !currentPageData.isBlank ? (() => {
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
            <div className="magnifier-panel-header" style={{
              background: '#f5f5f5',
              padding: '8px 12px',
              borderBottom: '1px solid #ddd',
              fontSize: '12px',
              fontWeight: 'bold'
            }}>
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
                  fontFamily: fontFamily,
                  lineHeight: lineHeight,
                  textAlign: textAlign,
                  textJustify: 'inter-word',
                  hyphens: 'auto',
                  wordBreak: 'break-word',
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
                  className="preview-content"
                  dangerouslySetInnerHTML={{ __html: debugHtml || '' }}
                />
                {pageNumHtml}
              </div>
            </div>
            </div>
          );
        })() : null}

        {showErrorDialog && currentError && (
          <ValidationErrorDialog
            error={currentError}
            onAction={(action) => handleErrorAction(action, currentError)}
            onClose={closeErrorDialog}
          />
        )}
      </div>
    );
  }

  export default memo(Preview);
