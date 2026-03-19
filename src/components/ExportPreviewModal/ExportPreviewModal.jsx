import { useState, useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import useEditorStore from '../../store/useEditorStore';
import { KDP_STANDARDS } from '../../utils/kdpStandards';
import { calculateContentDimensions, PX_PER_MM, PX_PER_INCH } from '../../utils/textMeasurer';
import { exportEpub, exportHtml } from '../Layout/utils/exporters';
import { exportPdfNative } from '../Layout/utils/pdfNativeRenderer';
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
  const paginatedPages = useEditorStore((s) => s.paginatedPages);
  const storeDims      = useEditorStore((s) => s.layoutDims);
  const config         = useEditorStore(useShallow((s) => s.config));
  const bookData       = useEditorStore(useShallow((s) => s.bookData));

  const [format, setFormat]           = useState(initialFormat || 'pdf');
  const [showMargins, setShowMargins] = useState(false);
  const [spreadIndex, setSpreadIndex] = useState(0); // index of LEFT page in PDF spread
  const [viewport, setViewport]       = useState({ w: window.innerWidth, h: window.innerHeight });
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });

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

  // ── Compute page dimensions at PREVIEW_SCALE (same scale used by pagination) ─
  const PREVIEW_SCALE = storeDims?.previewScale ?? 0.42;
  const totalPages    = paginatedPages.length;

  const gutterValue = safeConfig.gutterStrategy === 'custom'
    ? getGutterInInches(safeConfig.gutterManual, safeConfig.gutterUnit || 'in')
    : KDP_STANDARDS.getDynamicGutter(safeConfig.pageFormat, safeBookData.bookType, totalPages);

  const applyDynamicMargins = (safeConfig.marginStrategy || 'auto') === 'auto';

  // Compute dims for the current page pair (use right-page dims as reference for scale)
  const isEvenLeft  = format === 'pdf' ? true  : false; // left page = even in spread
  const isEvenRight = format === 'pdf' ? false : false;

  const dimsLeft  = calculateContentDimensions(pageFormat, bookConfig, PREVIEW_SCALE, storeDims?.gutterValue ?? gutterValue, isEvenLeft,  totalPages, applyDynamicMargins);
  const dimsRight = calculateContentDimensions(pageFormat, bookConfig, PREVIEW_SCALE, storeDims?.gutterValue ?? gutterValue, isEvenRight, totalPages, applyDynamicMargins);

  const pageWidthPx  = dimsRight.pageWidthPx;
  const pageHeightPx = dimsRight.pageHeightPx;

  const fontSize      = (safeConfig.fontSize || bookConfig.fontSize) * (PX_PER_INCH / 72) * PREVIEW_SCALE;
  const lineHeightPx  = storeDims?.lineHeightPx ?? Math.ceil(fontSize * (safeConfig.lineHeight || bookConfig.lineHeight));
  const effectiveContentHeight = storeDims?.contentHeight ?? dimsRight.contentHeight;
  const fontFamily    = safeConfig.fontFamily || bookConfig.fontFamily;
  const textAlign     = safeConfig.paragraph?.align || 'justify';

  // ── CSS scale: fit pages into available viewport ───────────────────────────
  const availW = viewport.w - H_PAD;
  const availH = viewport.h - TOOLBAR_H - NAVBAR_H - V_PAD * 2;

  let cssScale;
  if (format === 'pdf') {
    cssScale = Math.min(
      (availW - SPREAD_GAP) / (pageWidthPx * 2),
      availH / pageHeightPx,
    );
  } else {
    cssScale = Math.min(availW / pageWidthPx, availH / pageHeightPx);
  }
  cssScale = Math.max(0.2, Math.min(cssScale, 3));

  // ── Spread navigation ──────────────────────────────────────────────────────
  const totalSpreads = format === 'pdf'
    ? Math.ceil(totalPages / 2)
    : totalPages;

  const clampSpread  = useCallback((idx) => Math.max(0, Math.min(idx, totalSpreads - 1)), [totalSpreads]);
  const prevSpread   = () => setSpreadIndex((i) => clampSpread(i - 1));
  const nextSpread   = () => setSpreadIndex((i) => clampSpread(i + 1));

  useEffect(() => { setSpreadIndex(0); }, [format]);

  // ── Pages to show ──────────────────────────────────────────────────────────
  let leftPage  = null;
  let rightPage = null;

  if (format === 'pdf') {
    // In a book, page 1 is on the right, page 0 (blank/cover) on the left
    const leftIdx  = spreadIndex * 2 - 1;   // -1 for spread 0 (blank cover)
    const rightIdx = spreadIndex * 2;
    leftPage  = leftIdx  >= 0 ? paginatedPages[leftIdx]  : null;
    rightPage = rightIdx >= 0 ? paginatedPages[rightIdx] : null;
  } else {
    rightPage = paginatedPages[spreadIndex] || null;
  }

  // baseFontSize = config.fontSize * previewScale ("pseudo-pt at previewScale")
  // Used by buildHeaderHtmlPure inside PageFrame to size the header text.
  const baseFontSize = (safeConfig.fontSize || bookConfig.fontSize) * PREVIEW_SCALE;

  // Shared render props — include baseFontSize for PageFrame's buildHeaderHtmlPure
  const leftDims  = { ...dimsLeft,  fontSize, fontFamily, lineHeightPx, textAlign, effectiveContentHeight, baseFontSize };
  const rightDims = { ...dimsRight, fontSize, fontFamily, lineHeightPx, textAlign, effectiveContentHeight, baseFontSize };

  // ── Export handlers ────────────────────────────────────────────────────────
  const handleDownload = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportProgress({ current: 0, total: paginatedPages.length });
    try {
      if (format === 'pdf') {
        const pdfDims = {
          pageWidthPx,
          pageHeightPx,
          marginTop:            dimsRight.marginTop,
          marginRight:          dimsRight.marginRight,
          marginBottom:         dimsRight.marginBottom,
          marginLeft:           dimsRight.marginLeft,
          fontSize,
          fontFamily,
          lineHeightPx,
          baseFontSize,
          effectiveContentHeight,
          previewScale:         PREVIEW_SCALE,
        };
        await exportPdfNative(
          safeBookData,
          safeConfig,
          paginatedPages,
          pdfDims,
          (current, total) => setExportProgress({ current, total }),
        );
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
  const isEmpty = paginatedPages.length === 0;

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
              cssScale={cssScale}
              showMargins={showMargins}
              config={safeConfig}
              bookTitle={safeBookData.title}
            />
            {/* Spine */}
            <div className="epv-spine" style={{ width: SPREAD_GAP }} />
            {/* Right page (odd) */}
            <PageFrame
              page={rightPage}
              dims={rightDims}
              cssScale={cssScale}
              showMargins={showMargins}
              config={safeConfig}
              bookTitle={safeBookData.title}
            />
          </div>
        ) : (
          <div className="epv-single">
            <PageFrame
              page={rightPage}
              dims={rightDims}
              cssScale={cssScale}
              showMargins={showMargins}
              config={safeConfig}
              bookTitle={safeBookData.title}
            />
          </div>
        )}
      </div>

      {/* ── Bottom navigation ────────────────────────────────────────────── */}
      <div className="epv-navbar">
        <button
          className="epv-nav-btn"
          onClick={prevSpread}
          disabled={spreadIndex === 0}
          title="Anterior"
        >
          ← Anterior
        </button>
        <span className="epv-spread-info">{isEmpty ? '—' : spreadInfo}</span>
        <button
          className="epv-nav-btn"
          onClick={nextSpread}
          disabled={spreadIndex >= totalSpreads - 1}
          title="Siguiente"
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}
