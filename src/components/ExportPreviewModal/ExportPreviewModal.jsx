import { useState, useEffect, useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import useEditorStore from '../../store/useEditorStore';
import { KDP_STANDARDS } from '../../utils/kdpStandards';
import { calculateContentDimensions, PX_PER_MM, PX_PER_INCH } from '../../utils/textMeasurer';
import { fitPageScaleToViewport } from '../../utils/transformes';
import { exportEpub, exportHtml } from '../Layout/utils/exporters';
import PageFrame from '../PageFrame/PageFrame';
import './ExportPreviewModal.css';

const TOOLBAR_H = 64;
const NAVBAR_H  = 56;
const H_PAD     = 48;
const V_PAD     = 24;
const SPREAD_GAP = 20;

function getGutterInInches(value, unit) {
  if (unit === 'mm') return value / 25.4;
  if (unit === 'cm') return value / 2.54;
  return value;
}

export default function ExportPreviewModal({ initialFormat, onClose }) {
  const paginatedPages   = useEditorStore((s) => s.paginatedPages);
  const frontMatterPages = useEditorStore((s) => s.frontMatterPages ?? []);
  const storeDims        = useEditorStore((s) => s.layoutDims);
  const config           = useEditorStore(useShallow((s) => s.config));
  const bookData         = useEditorStore(useShallow((s) => s.bookData));
  const tocConfig        = useEditorStore((s) => s.tocConfig);

  const [format, setFormat]           = useState(initialFormat || 'pdf');
  const [showMargins, setShowMargins] = useState(false);
  const [spreadIndex, setSpreadIndex] = useState(0);
  const [viewport, setViewport]       = useState({ w: window.innerWidth, h: window.innerHeight });
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
  const [zoom, setZoom]               = useState(1.0);
  const [pageInput, setPageInput]     = useState('');

  // Track viewport for scale recalculation
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── Page format & book config ──────────────────────────────────────────────
  const safeConfig   = config || {};
  const safeBookData = bookData || { bookType: 'novela', chapters: [] };
  const bookConfig   = KDP_STANDARDS.getBookTypeConfig(safeBookData.bookType);

  let pageFormat;
  if (safeConfig.pageFormat === 'custom') {
    const cd = KDP_STANDARDS.getCustomPageDimensions(
      safeConfig.customPageFormat?.width  || 6,
      safeConfig.customPageFormat?.height || 9,
      safeConfig.customPageFormat?.unit   || 'in',
    );
    pageFormat = { id: 'custom', name: 'Custom', width: cd.widthMm, height: cd.heightMm, unit: 'mm' };
  } else {
    pageFormat = KDP_STANDARDS.getPageFormat(safeConfig.pageFormat || bookConfig.recommendedFormat);
  }

  // Full book = FM pages (portada, TDC) + content pages (numbers offset by FM count)
  const allPages = useMemo(() => {
    if (frontMatterPages.length > 0) {
      const offset = frontMatterPages.length;
      const offsetPages = paginatedPages.map(p => ({
        ...p,
        pageNumber: (p.pageNumber || 0) + offset,
        displayPageNumber: p.displayPageNumber ?? p.pageNumber ?? 1,
      }));
      return [...frontMatterPages, ...offsetPages];
    }
    return paginatedPages;
  }, [frontMatterPages, paginatedPages]);
  const totalPages = allPages.length;

  const gutterValue = safeConfig.gutterStrategy === 'custom'
    ? getGutterInInches(safeConfig.gutterManual, safeConfig.gutterUnit || 'in')
    : KDP_STANDARDS.getDynamicGutter(safeConfig.pageFormat, safeBookData.bookType, totalPages);

  const applyDynamicMargins = (safeConfig.marginStrategy || 'auto') === 'auto';
  const effectiveGutter     = storeDims?.gutterValue ?? gutterValue;

  // ── Compute page dimensions at PREVIEW_SCALE ───────────────────────────────────
  // Use scale from store (synced with Preview.jsx dynamic scaling) or default
  const PREVIEW_SCALE = storeDims?.previewScale ?? 0.42;

  const fontSize   = (safeConfig.fontSize || bookConfig.fontSize) * (PX_PER_INCH / 72) * PREVIEW_SCALE;
  const lineHeightPx = storeDims?.lineHeightPx ?? Math.ceil(fontSize * (safeConfig.lineHeight || bookConfig.lineHeight));
  const fontFamily = safeConfig.fontFamily || bookConfig.fontFamily;
  const textAlign  = safeConfig.paragraph?.align || 'justify';
  const baseFontSize = (safeConfig.fontSize || bookConfig.fontSize) * PREVIEW_SCALE;

  // Compute dims per page — mirrors Preview.jsx logic exactly:
  //   - isTitleOnlyPage → gutter = 0 (symmetric margins, same as Preview)
  //   - isEven derived from actual pageNumber (not hardcoded by spread slot)
  const computeDimsForPage = useCallback((page) => {
    const isTitleOnly  = page?.isTitleOnlyPage === true || page?.isTitlePage === true || page?.isTOCPage === true;
    const isEven       = page ? (page.pageNumber % 2 === 0) : false;
    const gutterForPage = isTitleOnly ? 0 : effectiveGutter;
    const d = calculateContentDimensions(pageFormat, bookConfig, PREVIEW_SCALE, gutterForPage, isEven, totalPages, applyDynamicMargins);
    const baseContentHeight = storeDims?.contentHeight ?? d.contentHeight;
    // Chapter-start pages skip the header — expand content box to match engine budget.
    const pageHasChTitle = !!(page?.html && page.html.includes('data-chapter-start="true"'));
    const isChStart = page?.isFirstChapterPage === true || pageHasChTitle;
    const skipFirstCh = safeConfig?.header?.skipFirstChapterPage !== false;
    const headerEst = storeDims?.headerSpaceEstimate ?? 0;
    const clearance = storeDims?.chapterStartBottomClearance ?? 0;
    const extraLines = storeDims?.chapterStartExtraLines ?? 0;
    const effectiveContentHeight = (isChStart && skipFirstCh)
      ? baseContentHeight + Math.max(0, headerEst - clearance) + extraLines * lineHeightPx
      : baseContentHeight;
    return { ...d, fontSize, fontFamily, lineHeightPx, textAlign, effectiveContentHeight, baseFontSize, previewScale: PREVIEW_SCALE };
  }, [storeDims, safeConfig, pageFormat, effectiveGutter, totalPages, fontSize, lineHeightPx, fontFamily, textAlign, baseFontSize, applyDynamicMargins]);

  // Reference dims (odd/right page, no title) used for scale calculation
  const refDims      = calculateContentDimensions(pageFormat, bookConfig, PREVIEW_SCALE, effectiveGutter, false, totalPages, applyDynamicMargins);
  const pageWidthPx  = refDims.pageWidthPx;
  const pageHeightPx = refDims.pageHeightPx;

  // ── CSS scale: fit pages into available viewport ───────────────────────────
  const availW = viewport.w - H_PAD;
  const availH = viewport.h - TOOLBAR_H - NAVBAR_H - V_PAD * 2;

  const cssScale = fitPageScaleToViewport({
    pageWidth: pageWidthPx,
    pageHeight: pageHeightPx,
    viewportWidth: availW,
    viewportHeight: availH,
    mode: format === 'pdf' ? 'spread' : 'single',
    gap: SPREAD_GAP,
    minScale: 0.2,
    maxScale: 3,
  });

  // ── Spread navigation ──────────────────────────────────────────────────────
  const totalSpreads = format === 'pdf'
    ? Math.ceil(totalPages / 2)
    : totalPages;

  const clampSpread  = useCallback((idx) => Math.max(0, Math.min(idx, totalSpreads - 1)), [totalSpreads]);
  const prevSpread   = () => setSpreadIndex((i) => clampSpread(i - 1));
  const nextSpread   = () => setSpreadIndex((i) => clampSpread(i + 1));

  // ── Zoom ───────────────────────────────────────────────────────────────────
  const zoomIn    = () => setZoom(z => Math.min(+(z + 0.15).toFixed(2), 2.5));
  const zoomOut   = () => setZoom(z => Math.max(+(z - 0.15).toFixed(2), 0.3));
  const zoomReset = () => setZoom(1.0);
  const effectiveCssScale = cssScale * zoom;

  // ── Page jump ──────────────────────────────────────────────────────────────
  // "Page N" refers to 1-based position in allPages (full book including FM).
  const currentPagePos = format === 'pdf'
    ? Math.min(spreadIndex * 2 + 1, allPages.length)
    : spreadIndex + 1;

  const goToPage = useCallback((val) => {
    const n = parseInt(val, 10);
    if (isNaN(n) || n < 1 || n > allPages.length) return;
    const idx = n - 1; // 0-based index in allPages
    setSpreadIndex(clampSpread(
      format === 'pdf' ? Math.floor((idx + 1) / 2) : idx
    ));
  }, [allPages.length, format, clampSpread]);

  useEffect(() => { setSpreadIndex(0); }, [format]);

  // ── Pages to show ──────────────────────────────────────────────────────────
  let leftPage  = null;
  let rightPage = null;

  if (format === 'pdf') {
    // Page 1 (index 0) always lands on the right (odd page). Spread 0 → blank | page 1.
    const leftIdx  = spreadIndex * 2 - 1;
    const rightIdx = spreadIndex * 2;
    leftPage  = leftIdx  >= 0 ? allPages[leftIdx]  : null;
    rightPage = rightIdx >= 0 ? allPages[rightIdx] : null;
  } else {
    rightPage = allPages[spreadIndex] || null;
  }

  // Per-page dims — gutter and isEven computed from actual page data
  const leftDims  = computeDimsForPage(leftPage);
  const rightDims = computeDimsForPage(rightPage);

  // ── Export handlers ────────────────────────────────────────────────────────
  const handleDownload = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportProgress({ current: 0, total: allPages.length });
    try {
      if (format === 'pdf') {
        const pdfDims = {
          pageWidthPx,
          pageHeightPx,
          marginTop:            refDims.marginTop,
          marginRight:          refDims.marginRight,
          marginBottom:         refDims.marginBottom,
          marginLeft:           refDims.marginLeft,
          fontSize,
          fontFamily,
          lineHeightPx,
          baseFontSize,
          effectiveContentHeight: storeDims?.contentHeight ?? refDims.contentHeight,
          previewScale:         PREVIEW_SCALE,
        };

        const response = await fetch('http://127.0.0.1:5002/editorial-app-test/us-central1/generatePdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookData: safeBookData,
            config: safeConfig,
            paginatedPages: allPages,
            dims: pdfDims,
          }),
        });

        if (!response.ok) {
          throw new Error('Error al generar PDF: ' + response.statusText);
        }

        const result = await response.json();

        const { pdf, filename } = result.data;
        const binaryString = atob(pdf);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
      if (format === 'epub') exportEpub(safeBookData);
      if (format === 'html') exportHtml(safeBookData);
    } catch (err) {
      alert('Error al exportar: ' + err.message);
    } finally {
      setIsExporting(false);
      setExportProgress({ current: 0, total: 0 });
    }
  };

  // ── Format tab display names ───────────────────────────────────────────────
  const formatLabel = { pdf: 'PDF (Impresión)', epub: 'EPUB (E-reader)', html: 'HTML (Web)' }[format];

  // ── Spread info text ───────────────────────────────────────────────────────
  let spreadInfo = '';
  if (format === 'pdf') {
    const l = spreadIndex * 2 - 1;
    const r = spreadIndex * 2;
    const lLabel = l < 0 ? '—' : l + 1;
    const rLabel = r < totalPages ? r + 1 : '—';
    spreadInfo = `Páginas ${lLabel}–${rLabel}  /  ${totalPages}`;
  } else {
    spreadInfo = `Página ${spreadIndex + 1} / ${totalPages}`;
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  const isEmpty = allPages.length === 0;

  return (
    <div className="epv-overlay" role="dialog" aria-modal="true" aria-label="Vista previa de exportación">
      {/* ── Top toolbar ─────────────────────────────────────────────────── */}
      <div className="epv-toolbar">
        <div className="epv-toolbar-left">
          <button className="epv-close-btn" onClick={onClose} title="Cerrar (Esc)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <span className="epv-title">Vista previa de exportación</span>
        </div>

        <div className="epv-format-tabs">
          {[['pdf', 'PDF'], ['epub', 'EPUB'], ['html', 'HTML']].map(([key, label]) => (
            <button
              key={key}
              className={`epv-tab ${format === key ? 'active' : ''}`}
              onClick={() => setFormat(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="epv-toolbar-right">
          {/* Zoom controls */}
          <div className="epv-zoom-controls">
            <button className="epv-zoom-btn" onClick={zoomOut} title="Alejar">−</button>
            <button className="epv-zoom-level" onClick={zoomReset} title="Restablecer zoom">
              {Math.round(zoom * 100)}%
            </button>
            <button className="epv-zoom-btn" onClick={zoomIn} title="Acercar">+</button>
          </div>

          <button
            className={`epv-toggle-btn ${showMargins ? 'active' : ''}`}
            onClick={() => setShowMargins((v) => !v)}
            title="Mostrar/ocultar guías de márgenes"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
            Márgenes
          </button>


          <button
            className={`epv-download-btn ${isExporting ? 'loading' : ''}`}
            onClick={handleDownload}
            disabled={isExporting || isEmpty}
          >
            {isExporting ? (
              <>
                <span className="epv-spinner" />
                {exportProgress.total > 0
                  ? `${exportProgress.current}/${exportProgress.total}`
                  : '…'}
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Descargar {format.toUpperCase()}
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Canvas area ─────────────────────────────────────────────────── */}
      <div className="epv-canvas">
        {isEmpty ? (
          <div className="epv-empty">
            <p>La paginación aún está en proceso.<br />Abre la pestaña <strong>Vista previa</strong> para generarla.</p>
          </div>
        ) : format === 'pdf' ? (
          <div className="epv-spread">
            {/* Left page (even — mirrored gutter) */}
            <PageFrame
              page={leftPage}
              dims={leftDims}
              cssScale={effectiveCssScale}
              showMargins={showMargins}
              config={safeConfig}
              bookTitle={safeBookData.title}
              tocConfig={tocConfig}
            />
            {/* Spine */}
            <div className="epv-spine" style={{ width: SPREAD_GAP }} />
            {/* Right page (odd) */}
            <PageFrame
              page={rightPage}
              dims={rightDims}
              cssScale={effectiveCssScale}
              showMargins={showMargins}
              config={safeConfig}
              bookTitle={safeBookData.title}
              tocConfig={tocConfig}
            />
          </div>
        ) : (
          <div className="epv-single">
            <PageFrame
              page={rightPage}
              dims={rightDims}
              cssScale={effectiveCssScale}
              showMargins={showMargins}
              config={safeConfig}
              bookTitle={safeBookData.title}
              tocConfig={tocConfig}
            />
          </div>
        )}
      </div>

      {/* ── Bottom navigation ────────────────────────────────────────────── */}
      <div className="epv-navbar">
        <button className="epv-nav-btn" onClick={prevSpread} disabled={spreadIndex === 0} title="Anterior (←)">
          ←
        </button>

        <div className="epv-page-jump">
          <input
            type="number"
            className="epv-page-input"
            min="1"
            max={allPages.length}
            value={pageInput}
            placeholder={String(currentPagePos)}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { goToPage(pageInput); setPageInput(''); }
              if (e.key === 'ArrowUp')   { e.preventDefault(); goToPage(currentPagePos + 1); }
              if (e.key === 'ArrowDown') { e.preventDefault(); goToPage(currentPagePos - 1); }
            }}
            onBlur={() => { if (pageInput) { goToPage(pageInput); setPageInput(''); } }}
            title="Escribe un número y presiona Enter"
          />
          <span className="epv-page-total">/ {isEmpty ? '—' : allPages.length}</span>
        </div>

        <button className="epv-nav-btn" onClick={nextSpread} disabled={spreadIndex >= totalSpreads - 1} title="Siguiente (→)">
          →
        </button>
      </div>
    </div>
  );
}
