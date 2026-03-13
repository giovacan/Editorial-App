import { useRef, memo, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { KDP_STANDARDS } from '../../utils/kdpStandards';
import useEditorStore from '../../store/useEditorStore';
import { usePagination, usePageNavigation } from '../../hooks/usePagination';
import { useMagnifier } from '../../hooks/useMagnifier';
import { useHeaderFooter, buildHeaderHtml } from '../../hooks/useHeaderFooter';
import { calculateContentDimensions } from '../../utils/textMeasurer';
import { DEFAULT_CONFIG } from './utils/previewConfig';
import { addDebugTags } from './utils/debugTags';
import PreviewControls from './PreviewControls';
import MagnifierPanel from './MagnifierPanel';
import PreviewDebugPanel from './PreviewDebugPanel';
import ValidationErrorDialog from '../ValidationErrorDialog/ValidationErrorDialog';
import PaginationProgressBar from '../PaginationProgressBar/PaginationProgressBar';
import './Preview.css';

const AVAILABLE_SIDEBAR_WIDTH = 220;
const PX_PER_MM = 3.7795;
const PX_PER_INCH = 96;

function getGutterInInches(value, unit) {
  if (unit === 'mm') return value / 25.4;
  if (unit === 'cm') return value / 2.54;
  return value;
}

function Preview() {
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  const bookData = useEditorStore(useShallow((s) => s.bookData));
  const config = useEditorStore(useShallow((s) => s.config));
  const editing = useEditorStore(useShallow((s) => s.editing));
  const setConfig = useEditorStore((s) => s.setConfig);

  const measureRef = useRef(null);
  const previewPageRef = useRef(null);
  const previewContentRef = useRef(null);
  const magnifierContentRef = useRef(null);
  const previewScrollRef = useRef(null);

  // Create hidden measurement div outside overflow containers
  useEffect(() => {
    if (!measureRef.current) {
      const div = document.createElement('div');
      div.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;';
      div.setAttribute('lang', 'es');
      document.body.appendChild(div);
      measureRef.current = div;
      return () => {
        if (measureRef.current?.parentNode) {
          measureRef.current.parentNode.removeChild(measureRef.current);
        }
      };
    }
  }, []);

  // Tighten word-spacing on overflow by < 1 line
  const adjustWordSpacing = (el) => {
    if (!el) return;
    el.querySelectorAll('p, blockquote').forEach(p => { p.style.wordSpacing = ''; });
    const overflow = el.scrollHeight - el.offsetHeight;
    if (overflow <= 0 || overflow > 12) return;
    const paragraphs = el.querySelectorAll('p, blockquote');
    if (!paragraphs.length) return;
    for (const ws of [-0.01, -0.02, -0.03, -0.04, -0.05]) {
      paragraphs.forEach(p => { p.style.wordSpacing = `${ws}em`; });
      if (el.scrollHeight <= el.offsetHeight) return;
    }
    paragraphs.forEach(p => { p.style.wordSpacing = ''; });
  };

  useEffect(() => {
    adjustWordSpacing(previewContentRef.current);
    adjustWordSpacing(magnifierContentRef.current);
  });

  const safeBookData = bookData || { bookType: 'novela', chapters: [], title: '' };
  const safeConfig = config || DEFAULT_CONFIG;
  const debugConfig = safeConfig.previewDebug || {
    enabled: false,
    elements: { headers: true, paragraphs: true, quotes: true }
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
      id: 'custom', name: 'Custom',
      width: customDims.widthMm, height: customDims.heightMm, unit: 'mm',
      description: `Custom (${customDims.widthIn.toFixed(2)}" × ${customDims.heightIn.toFixed(2)}")`,
      minMargins: { top: 12.7, bottom: 12.7, left: 12.7, right: 12.7 },
      recommended: false, type: 'paperback'
    };
  } else {
    pageFormat = KDP_STANDARDS.getPageFormat(safeConfig.pageFormat || bookConfig.recommendedFormat);
  }

  const { pages = [], layoutDims, validationState, showErrorDialog, currentError, handleErrorAction, closeErrorDialog } =
    usePagination(bookData, config, measureRef);

  useEffect(() => {
    console.log('[PREVIEW] Pages actualizadas:', pages.length, '| Layout config:', config?.chapterTitle?.layout);
    if (pages[0]?.html) console.log('[PREVIEW] Primera página HTML:', pages[0].html.slice(0, 150));
  }, [pages, config?.chapterTitle?.layout]);

  const paginationProgress = useEditorStore((s) => s.paginationProgress);
  const isPaginationRunning = paginationProgress > 0 && paginationProgress < 100;
  const totalPageCount = pages.length;

  const gutterValue = safeConfig.gutterStrategy === 'custom'
    ? getGutterInInches(safeConfig.gutterManual, safeConfig.gutterUnit || 'in')
    : KDP_STANDARDS.getDynamicGutter(safeConfig.pageFormat, safeBookData.bookType, totalPageCount);

  const { currentPage, goToPage, goToNextPage, goToPrevPage, goToFirstPage, goToLastPage, totalPages } =
    usePageNavigation(pages.length);

  const currentPageData = (pages?.length > 0 && pages[currentPage])
    ? pages[currentPage]
    : { html: '', pageNumber: 1, isBlank: false, chapterTitle: '', currentSubheader: '' };

  const debugHtml = debugConfig.enabled
    ? addDebugTags(currentPageData.html, debugConfig, safeConfig.paragraph)
    : currentPageData.html;

  const isCurrentPageEven = currentPageData.pageNumber % 2 === 0;
  const isTitleOnlyPage = currentPageData.isTitleOnlyPage === true;
  const effectiveGutter = layoutDims?.gutterValue ?? gutterValue;
  const gutterForPage = isTitleOnlyPage ? 0 : effectiveGutter;

  const previewScale = Math.min(0.42, AVAILABLE_SIDEBAR_WIDTH / (pageFormat.width * PX_PER_MM));
  const applyDynamicMargins = (safeConfig.marginStrategy || 'auto') === 'auto';

  const { pageWidthPx, pageHeightPx, marginTop, marginBottom, marginLeft, marginRight, contentHeight } =
    calculateContentDimensions(pageFormat, bookConfig, previewScale, gutterForPage, isCurrentPageEven, totalPages, applyDynamicMargins);

  const effectiveContentHeight = layoutDims?.contentHeight ?? contentHeight;
  const fontSize = (safeConfig.fontSize || bookConfig.fontSize) * (PX_PER_INCH / 72) * previewScale;
  const fontFamily = safeConfig.fontFamily || bookConfig.fontFamily;
  const lineHeightRatio = safeConfig.lineHeight || bookConfig.lineHeight;
  const lineHeightPx = layoutDims?.lineHeightPx ?? Math.ceil(fontSize * lineHeightRatio);
  const textAlign = safeConfig.paragraph?.align || 'justify';
  const showNums = safeConfig.showPageNumbers !== false;

  const { showMagnifier, setShowMagnifier, magnifierZoom, setMagnifierZoom, magnifierPanelRef,
    magnifierPos, updateMagnifierPosition, handleMouseEnterPreview, handleMouseLeavePreview,
    handleMouseEnterMagnifier, handleMouseLeaveMagnifier } = useMagnifier(previewPageRef);

  const { showHeaders, headerLeft, headerCenter, headerRight, headerConfig } =
    useHeaderFooter(safeConfig, currentPageData, totalPages, safeBookData.title);

  const baseFontSize = (safeConfig.fontSize || bookConfig.fontSize) * previewScale;
  const headerHtml = buildHeaderHtml(headerLeft, headerCenter, headerRight, headerConfig, baseFontSize);
  const skipHeader = headerConfig.skipFirstChapterPage && currentPageData.isFirstChapterPage;
  const hasHeaderContent = headerLeft || headerCenter || headerRight;

  const showPageNumber = (showNums && !currentPageData.isBlank) ||
    (currentPageData.isExtraEndPage && currentPageData.shouldShowPageNumber);

  const pageNumberPos = safeConfig.pageNumberPos || 'bottom';
  const pageNumberAlign = safeConfig.pageNumberAlign || 'center';
  const pageNumY = safeConfig.pageNumberMargin ?? 12;

  let pageNumHorizontalStyle = {};
  switch (pageNumberAlign) {
    case 'paragraph-edge':
      pageNumHorizontalStyle = isCurrentPageEven ? { left: `${marginLeft}px` } : { right: `${marginRight}px` };
      break;
    case 'paragraph':
      pageNumHorizontalStyle = isCurrentPageEven ? { left: `${marginLeft + 12}px` } : { right: `${marginRight + 12}px` };
      break;
    case 'outer':
      pageNumHorizontalStyle = isCurrentPageEven ? { left: '12px' } : { right: '12px' };
      break;
    default:
      pageNumHorizontalStyle = { left: '50%', transform: 'translateX(-50%)' };
  }

  const pageNumStyle = {
    position: 'absolute',
    ...(pageNumberPos === 'top' ? { top: `${pageNumY}px` } : { bottom: `${pageNumY}px` }),
    ...pageNumHorizontalStyle,
    fontSize: `${fontSize * 0.8}pt`
  };

  const pageNumHtml = showPageNumber ? (
    <span className="page-number" style={pageNumStyle}>{currentPageData.pageNumber}</span>
  ) : null;

  const sharedPageProps = {
    pageWidthPx, pageHeightPx, marginTop, marginRight, marginBottom, marginLeft,
    fontSize, fontFamily, lineHeightPx, textAlign, effectiveContentHeight,
    debugHtml, pageNumHtml, showHeaders, currentPageData, skipHeader,
    hasHeaderContent, headerHtml
  };

  return (
    <div className="preview-wrapper">
      <PreviewControls
        currentPage={currentPage}
        totalPages={totalPages}
        goToPage={goToPage}
        goToNextPage={goToNextPage}
        goToPrevPage={goToPrevPage}
        goToFirstPage={goToFirstPage}
        goToLastPage={goToLastPage}
        magnifierZoom={magnifierZoom}
        setMagnifierZoom={setMagnifierZoom}
        showDebugPanel={showDebugPanel}
        setShowDebugPanel={setShowDebugPanel}
      />

      {showDebugPanel && (
        <PreviewDebugPanel config={config} onChange={setConfig} onClose={() => setShowDebugPanel(false)} />
      )}

      <PaginationProgressBar progress={paginationProgress} isVisible={isPaginationRunning} compact={false} />

      <div className="preview-scroll" ref={previewScrollRef}>
        <div
          ref={previewPageRef}
          className="preview-page"
          lang="es"
          style={{
            width: `${pageWidthPx}px`, height: `${pageHeightPx}px`,
            padding: `${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px`,
            fontSize: `${fontSize}px`, fontFamily, lineHeight: `${lineHeightPx}px`,
            textAlign, textJustify: 'inter-word', hyphens: 'none',
            wordBreak: 'break-word', overflowWrap: 'break-word'
          }}
          onMouseMove={updateMagnifierPosition}
          onMouseEnter={handleMouseEnterPreview}
          onMouseLeave={handleMouseLeavePreview}
        >
          {showHeaders && !currentPageData.isBlank && !skipHeader && hasHeaderContent && (
            <div className="preview-header" dangerouslySetInnerHTML={{ __html: headerHtml }} style={{ marginBottom: '0.5em' }} />
          )}
          <div
            ref={(el) => {
              previewContentRef.current = el;
              if (el && process.env.NODE_ENV === 'development') {
                requestAnimationFrame(() => {
                  const overflow = el.scrollHeight - el.clientHeight;
                  if (overflow > 2) {
                    console.warn(`[OVERFLOW] Page ${currentPage + 1}: overflow=${overflow.toFixed(1)}px (${(overflow / lineHeightPx).toFixed(1)} lines)`);
                  }
                });
              }
            }}
            className="preview-content"
            style={{ height: `${effectiveContentHeight}px` }}
            dangerouslySetInnerHTML={{ __html: debugHtml || '' }}
          />
          {pageNumHtml}
        </div>
      </div>

      {showMagnifier && previewPageRef.current && !currentPageData.isBlank && (
        <MagnifierPanel
          {...sharedPageProps}
          magnifierPanelRef={magnifierPanelRef}
          magnifierContentRef={magnifierContentRef}
          magnifierZoom={magnifierZoom}
          magnifierPos={magnifierPos}
          handleMouseEnterMagnifier={handleMouseEnterMagnifier}
          handleMouseLeaveMagnifier={handleMouseLeaveMagnifier}
        />
      )}

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
