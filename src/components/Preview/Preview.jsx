import { useRef, memo, useEffect, useLayoutEffect, useState, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { KDP_STANDARDS } from '../../utils/kdpStandards';
import useEditorStore from '../../store/useEditorStore';
import { usePagination, usePageNavigation } from '../../hooks/usePagination';
import { useMagnifier } from '../../hooks/useMagnifier';
import { usePageRenderLayoutFromStore, computeFolioFromEdge } from '../../hooks/usePageRenderLayout';
import { DEFAULT_CONFIG } from './utils/previewConfig';
// import { insertPageLineBreaks, createLayoutContext } from '../../utils/textLayoutEngine';
import { addDebugTags } from './utils/debugTags';
import PreviewControls from './PreviewControls';
import MagnifierPanel from './MagnifierPanel';
import PreviewDebugPanel from './PreviewDebugPanel';
import LayoutGuidesOverlay from './LayoutGuidesOverlay';
import TOCPanel from './TOCPanel';
import ValidationErrorDialog from '../ValidationErrorDialog/ValidationErrorDialog';
import PaginationProgressBar from '../PaginationProgressBar/PaginationProgressBar';
import { useLayoutVerification, formatLayoutAuditText } from '../../hooks/useLayoutVerification';
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

  // P6: Layout verification — DOM vs Canvas audit (dev mode only)
  const layoutDims = useEditorStore((s) => s.layoutDims);
  const layoutAuditReport = useLayoutVerification(pages, layoutDims);

  // When DOM audit completes, append it to the pagination log
  useEffect(() => {
    if (!layoutAuditReport || process.env.NODE_ENV !== 'development') return;
    const auditText = formatLayoutAuditText(layoutAuditReport);
    if (!auditText) return;
    // Update the stored pagination log with audit data
    const currentLog = useEditorStore.getState().paginationLog;
    if (currentLog && !currentLog.layoutAudit) {
      useEditorStore.getState().setPaginationLog({
        ...currentLog,
        layoutAudit: auditText,
      });
      // Also re-post the log with audit appended
      fetch('/api/pagination-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          log: { ...currentLog, layoutAudit: auditText },
          summaryText: (currentLog.summaryText || '') + '\n\n' + auditText,
        })
      }).catch(() => {});
    }
  }, [layoutAuditReport]);

  const paginationProgressObj = useEditorStore((s) => s.paginationProgress);
  const isPaginationRunning = paginationProgressObj?.isActive ?? false;
  const paginationPercent = paginationProgressObj?.percent ?? 0;
  const layoutPlannerState = useEditorStore((s) => s.layoutPlanner);
  const { currentPage, goToPage, goToNextPage, goToPrevPage, goToFirstPage, goToLastPage, totalPages } =
    usePageNavigation(allPages.length);

  const plannerBadge = useMemo(() => {
    const provider = layoutPlannerState?.provider || 'local';
    const phase = layoutPlannerState?.phase || 'idle';
    const progress = Math.max(0, Math.min(100, Number(layoutPlannerState?.progress) || 0));
    const modelLabel = layoutPlannerState?.modelLabel || '';

    if (provider === 'webllm' && phase === 'loading') {
      return {
        tone: 'loading',
        text: progress > 0
          ? `Preparando IA local (${progress}%)`
          : 'Preparando IA local',
        detail: modelLabel,
      };
    }

    if (provider === 'webllm' && phase === 'ready') {
      return {
        tone: 'ready',
        text: 'IA local lista',
        detail: modelLabel,
      };
    }

    if (provider === 'remote' && phase === 'ready') {
      return {
        tone: 'remote',
        text: 'Planner remoto activo',
        detail: modelLabel,
      };
    }

    return {
      tone: phase === 'fallback' ? 'fallback' : 'local',
      text: 'Usando planner local',
      detail: layoutPlannerState?.reason === 'webgpu_unavailable'
        ? 'WebGPU no disponible'
        : '',
    };
  }, [layoutPlannerState]);

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
    effectiveContentHeight, engineContentHeight,
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

  // Use page HTML directly — <br> injection disabled (CSS last-line semantics
  // prevent justify on lines before <br>, making pages taller not shorter).
  const renderedHtml = debugHtml;

  const { showMagnifier, setShowMagnifier, magnifierZoom, setMagnifierZoom, magnifierPanelRef,
    magnifierPos, updateMagnifierPosition, handleMouseEnterPreview, handleMouseLeavePreview,
    handleMouseEnterMagnifier, handleMouseLeaveMagnifier } = useMagnifier(previewPageRef);

  const folioPos   = config?.pageNumberPos   || 'bottom';
  const folioAlign = config?.pageNumberAlign || 'center';
  const folioOnOuter = folioAlign === 'outer' || folioAlign === 'paragraph-edge' || folioAlign === 'paragraph';
  const folioEmbeddedInHeader = folioPos === 'top' && folioOnOuter
    && showHeaders && !currentPageData?.isBlank && !skipHeader && hasHeaderContent
    && !isFrontMatterPage;
  const pageNumHtml = showPageNumber && !folioEmbeddedInHeader ? (
    <span className="page-number" style={pageNumStyle}>{displayNum}</span>
  ) : null;

  const sharedPageProps = {
    pageWidthPx, pageHeightPx, marginTop, marginRight, marginBottom, marginLeft,
    fontSize, fontFamily, lineHeightPx, textAlign, effectiveContentHeight,
    engineContentHeight, previewScale, showLayoutGuides,
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

      <div className={`planner-status planner-status-${plannerBadge.tone}`}>
        <span className="planner-status-text">{plannerBadge.text}</span>
        {plannerBadge.detail && (
          <span className="planner-status-detail">{plannerBadge.detail}</span>
        )}
      </div>

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
            // hyphens: 'none' — engine handles hyphenation via Liang patterns in KP.
            // Browser hyphens: auto would break at different points than Canvas measured,
            // causing DOM height to diverge from engine prediction.
            hyphens: 'none',
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
                  const isChStart = !!(currentPageData?.isFirstChapterPage || (currentPageData?.html && currentPageData.html.includes('data-chapter-start')));
                  if (isChStart) {
                    console.log(`[CH-START-RENDER] Page ${currentPage + 1}: scrollH=${el.scrollHeight}px clientH=${el.clientHeight}px effectiveCH=${effectiveContentHeight}px engineCH=${engineContentHeight}px remain=${(el.clientHeight - el.scrollHeight).toFixed(1)}px blocks=${el.children.length}`);
                  }
                  if (overflow > 6) {
                    console.warn(`[OVERFLOW][${pageType}] Page ${currentPage + 1}: scrollH=${el.scrollHeight}px clientH=${el.clientHeight}px overflow=${overflow.toFixed(1)}px (${(overflow / lineHeightPx).toFixed(1)} lines)${isChStart ? ' [CHAPTER-START]' : ''}`);
                    // P6: Visual overflow indicator — red outline on clipped pages
                    el.style.outline = '2px solid red';
                    el.title = `OVERFLOW: ${overflow.toFixed(1)}px (${(overflow / lineHeightPx).toFixed(1)} lines)`;
                  } else {
                    console.log(`[RENDER] Page ${currentPage + 1} [${pageType}]: scrollH=${el.scrollHeight}px clientH=${el.clientHeight}px remain=${(el.clientHeight - el.scrollHeight).toFixed(1)}px${isChStart ? ' [CHAPTER-START]' : ''}`);
                    el.style.outline = '';
                    el.title = '';
                  }
                });
              }
            }}
            className="preview-content"
            style={{ height: `${effectiveContentHeight}px` }}
            dangerouslySetInnerHTML={{ __html: renderedHtml || '' }}
          />
          {showLayoutGuides && !currentPageData.isBlank && !isFrontMatterPage && (
            <LayoutGuidesOverlay
              contentRef={previewContentRef}
              engineContentHeight={engineContentHeight}
              effectiveContentHeight={effectiveContentHeight}
              folioFromEdge={computeFolioFromEdge(previewScale)}
              marginBottom={marginBottom}
              marginLeft={marginLeft}
              contentWidth={pageWidthPx - marginLeft - marginRight}
              pageKey={currentPage}
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
