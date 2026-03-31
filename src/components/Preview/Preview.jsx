import { useRef, memo, useEffect, useLayoutEffect, useState, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { KDP_STANDARDS } from '../../utils/kdpStandards';
import useEditorStore from '../../store/useEditorStore';
import { usePagination, usePageNavigation } from '../../hooks/usePagination';
import { useMagnifier } from '../../hooks/useMagnifier';
import { usePageRenderLayoutFromStore } from '../../hooks/usePageRenderLayout';
import { DEFAULT_CONFIG } from './utils/previewConfig';
import { applyKpRendering } from '../../utils/textLayoutEngine';
import { JUSTIFY_SLACK_RATIO } from '../../utils/layoutIr';
import { addDebugTags } from './utils/debugTags';
import PreviewControls from './PreviewControls';
import MagnifierPanel from './MagnifierPanel';
import PreviewDebugPanel from './PreviewDebugPanel';
import LayoutGuidesOverlay from './LayoutGuidesOverlay';
import TOCPanel from './TOCPanel';
import ValidationErrorDialog from '../ValidationErrorDialog/ValidationErrorDialog';
import PaginationProgressBar from '../PaginationProgressBar/PaginationProgressBar';
import './Preview.css';

const PX_PER_MM = 3.7795;
const SIDEBAR_CONTENT_WIDTH = 220;

function Preview() {
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [showLayoutGuides, setShowLayoutGuides] = useState(false);
  const showTOCPanel = useEditorStore(s => s.showTOCPanel);

  const bookData = useEditorStore(useShallow((s) => s.bookData));
  const config = useEditorStore(useShallow((s) => s.config));
  const editing = useEditorStore(useShallow((s) => s.editing));
  const setConfig = useEditorStore((s) => s.setConfig);

  const measureRef = useRef(null);
  const previewPageRef = useRef(null);
  const previewContentRef = useRef(null);
  const magnifierContentRef = useRef(null);
  const previewScrollRef = useRef(null);

  // Create hidden measurement div outside overflow containers.
  // useLayoutEffect (not useEffect) ensures this runs BEFORE usePagination's useEffect,
  // so measureRef.current is populated when pagination first runs on mount.
  useLayoutEffect(() => {
    if (!measureRef.current) {
      const div = document.createElement('div');
      div.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;';
      div.setAttribute('lang', 'es');
      document.body.appendChild(div);
      measureRef.current = div;
    }
    return () => {
      if (measureRef.current?.parentNode) {
        measureRef.current.parentNode.removeChild(measureRef.current);
      }
      measureRef.current = null;
    };
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

  const previewScale = Math.min(0.42, SIDEBAR_CONTENT_WIDTH / (pageFormat.width * PX_PER_MM));

  const { pages = [], validationState, showErrorDialog, currentError, handleErrorAction, closeErrorDialog } =
    usePagination(bookData, config, measureRef, previewScale);

  const frontMatterPages = useEditorStore((s) => s.frontMatterPages) || [];
  const tocConfig = useEditorStore((s) => s.tocConfig);
  
  const allPages = useMemo(() => {
    if (frontMatterPages.length > 0) {
      const offset = frontMatterPages.length;
      // pageNumber is offset for array position/even-odd detection
      // displayPageNumber keeps the original arabic number (1, 2, 3…) restarted from 1
      const offsetPages = pages.map(p => ({
        ...p,
        pageNumber: (p.pageNumber || 0) + offset,
        displayPageNumber: p.displayPageNumber ?? p.pageNumber ?? 1,
      }));
      return [...frontMatterPages, ...offsetPages];
    }
    return pages;
  }, [frontMatterPages, pages]);

  useEffect(() => {
    console.log('[PREVIEW] Pages actualizadas:', allPages.length, '| Layout config:', config?.chapterTitle?.layout);
    if (allPages[0]?.html) console.log('[PREVIEW] Primera página HTML:', allPages[0].html.slice(0, 150));
  }, [allPages, config?.chapterTitle?.layout]);

  const paginationProgressObj = useEditorStore((s) => s.paginationProgress);
  const isPaginationRunning = paginationProgressObj?.isActive ?? false;
  const paginationPercent = paginationProgressObj?.percent ?? 0;
  const { currentPage, goToPage, goToNextPage, goToPrevPage, goToFirstPage, goToLastPage, totalPages } =
    usePageNavigation(allPages.length);

  const currentPageData = (allPages?.length > 0 && allPages[currentPage])
    ? allPages[currentPage]
    : { html: '', pageNumber: 1, isBlank: false, chapterTitle: '', currentSubheader: '' };

  const isFrontMatterPage = !!(currentPageData.isTOCPage || currentPageData.isTitlePage || currentPageData.isFrontMatter);
  if (process.env.NODE_ENV === 'development' && isFrontMatterPage) {
    console.log('[FM-PAGE]', { isTOCPage: currentPageData.isTOCPage, isTitlePage: currentPageData.isTitlePage, displayPageNumber: currentPageData.displayPageNumber, showFolio: tocConfig?.showFolio });
  }

  const debugHtml = (!isFrontMatterPage && debugConfig.enabled)
    ? addDebugTags(currentPageData.html, debugConfig, safeConfig.paragraph)
    : currentPageData.html;

  // Run only when page content changes — NOT on every mouse-move render.
  // Skip word-spacing adjustment on frontmatter pages (flex layout breaks with it).
  // Skip when KP rendering is active (textAlign=justify): KP already sets precise per-line
  // word-spacing via <span> elements; applying a uniform offset on the outer <p> creates
  // inconsistency between KP-adjusted lines (explicit span word-spacing) and non-adjusted
  // lines (inherit the outer negative offset), making paragraphs look "crooked".
  useEffect(() => {
    if (isFrontMatterPage) return;
    if ((safeConfig.paragraph?.align || 'justify') === 'justify') return;
    adjustWordSpacing(previewContentRef.current);
    adjustWordSpacing(magnifierContentRef.current);
  }, [currentPage, debugHtml, isFrontMatterPage, safeConfig.paragraph?.align]); // eslint-disable-line react-hooks/exhaustive-deps

  const {
    pageWidthPx, pageHeightPx,
    marginTop, marginBottom, marginLeft, marginRight,
    effectiveContentHeight,
    fontSize, fontFamily, lineHeightPx, textAlign, baseFontSize,
    showPageNumber, displayNum, pageNumStyle,
    showHeaders, hasHeaderContent, skipHeader, headerHtml,
  } = usePageRenderLayoutFromStore({
    pageData:    currentPageData,
    config:      safeConfig,
    bookConfig,
    pageFormat,
    previewScale,
    totalPages,
    bookTitle:   safeBookData.title,
  });

  // Visual gap between last text line and page number / header in preview.
  // 1 line of breathing room — does NOT affect engine contentHeight.
  const pageNumGapPx = lineHeightPx;

  // ── KP Rendering ─────────────────────────────────────────────────────────────
  // Frontmatter pages (title, TOC) skip KP rendering — their HTML uses flex
  // layout that would be corrupted by the word-spacing pass.
  const renderedHtml = useMemo(() => {
    if (!debugHtml || currentPageData?.isBlank || isFrontMatterPage || textAlign !== 'justify') return debugHtml;
    const cw = pageWidthPx - marginLeft - marginRight;
    return applyKpRendering(debugHtml, {
      baseFontSizePx: fontSize,
      fontFamily,
      contentWidth: cw,
      widthSlack: cw * JUSTIFY_SLACK_RATIO,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debugHtml, currentPageData?.isBlank, isFrontMatterPage, textAlign, pageWidthPx, marginLeft, marginRight, fontSize, fontFamily]);

  const { showMagnifier, setShowMagnifier, magnifierZoom, setMagnifierZoom, magnifierPanelRef,
    magnifierPos, updateMagnifierPosition, handleMouseEnterPreview, handleMouseLeavePreview,
    handleMouseEnterMagnifier, handleMouseLeaveMagnifier } = useMagnifier(previewPageRef);

  const pageNumHtml = showPageNumber ? (
    <span className="page-number" style={pageNumStyle}>{displayNum}</span>
  ) : null;

  const sharedPageProps = {
    pageWidthPx, pageHeightPx, marginTop, marginRight, marginBottom, marginLeft,
    fontSize, fontFamily, lineHeightPx, textAlign, effectiveContentHeight,
    debugHtml: renderedHtml, pageNumHtml, showHeaders, currentPageData, skipHeader,
    hasHeaderContent, headerHtml, isFrontMatterPage
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
        showLayoutGuides={showLayoutGuides}
        setShowLayoutGuides={setShowLayoutGuides}
      />

      {showDebugPanel && (
        <PreviewDebugPanel config={config} onChange={setConfig} onClose={() => setShowDebugPanel(false)} />
      )}

      {showTOCPanel && (
        <TOCPanel />
      )}

      <div className="preview-stage">
        <PaginationProgressBar progress={paginationPercent} isVisible={isPaginationRunning} />

        <div className="preview-scroll" ref={previewScrollRef}>
          <div
          ref={previewPageRef}
          className={`preview-page${isFrontMatterPage ? ' is-front-matter' : ''}`}
          lang="es"
          style={{
            width: `${pageWidthPx}px`, height: `${pageHeightPx}px`,
            padding: `${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px`,
            fontSize: `${fontSize}px`, fontFamily, lineHeight: `${lineHeightPx}px`,
            // Frontmatter pages (title, TOC) use left-aligned layout — no justify, no hyphens
            textAlign: isFrontMatterPage ? 'left' : textAlign,
            textJustify: isFrontMatterPage ? undefined : 'inter-word',
            hyphens: isFrontMatterPage ? 'none' : 'auto',
            wordBreak: 'break-word', overflowWrap: 'break-word'
          }}
          onMouseMove={updateMagnifierPosition}
          onMouseEnter={handleMouseEnterPreview}
          onMouseLeave={handleMouseLeavePreview}
        >
          {!isFrontMatterPage && showHeaders && !currentPageData.isBlank && !skipHeader && hasHeaderContent && (
            <div className="preview-header" dangerouslySetInnerHTML={{ __html: headerHtml }} style={{ marginBottom: `${pageNumGapPx}px` }} />
          )}
          <div
            ref={(el) => {
              previewContentRef.current = el;
              if (el && process.env.NODE_ENV === 'development') {
                requestAnimationFrame(() => {
                  const overflow = el.scrollHeight - el.clientHeight;
                  const pageType = currentPageData?.isTOCPage ? 'TOC'
                    : currentPageData?.isTitlePage ? 'TITLE'
                    : currentPageData?.isFrontMatter ? 'FM' : 'CONTENT';
                  if (overflow > 6) {
                    console.warn(`[OVERFLOW][${pageType}] Page ${currentPage + 1}: scrollH=${el.scrollHeight}px clientH=${el.clientHeight}px overflow=${overflow.toFixed(1)}px (${(overflow / lineHeightPx).toFixed(1)} lines)`);
                  } else if (pageType === 'TOC') {
                    console.log(`[TOC-RENDER] Page ${currentPage + 1}: scrollH=${el.scrollHeight}px clientH=${el.clientHeight}px ok (remain=${(el.clientHeight - el.scrollHeight).toFixed(1)}px)`);
                  }
                });
              }
            }}
            className="preview-content"
            style={{ height: `${effectiveContentHeight + 2}px` }}
            dangerouslySetInnerHTML={{ __html: renderedHtml || '' }}
          />
          {showLayoutGuides && !currentPageData.isBlank && !isFrontMatterPage && (
            <LayoutGuidesOverlay
              contentRef={previewContentRef}
              marginTop={marginTop}
              marginLeft={marginLeft}
              effectiveContentHeight={effectiveContentHeight}
              contentWidth={pageWidthPx - marginLeft - marginRight}
            />
          )}
          {pageNumHtml}
          </div>
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
