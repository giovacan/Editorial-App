import { useRef, useMemo, useCallback, useState, useEffect, useLayoutEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { KDP_STANDARDS } from '../../utils/kdpStandards';
import useEditorStore from '../../store/useEditorStore';
import { usePageNavigation } from '../../hooks/usePagination';
import { getPageLayout } from '../../utils/pageLayout';
import './PageLayoutView.css';

const PX_PER_MM = 3.7795;

function cleanEngineHtml(html) {
  if (!html) return '';
  return html.replace(/<span\b[^>]*style="[^"]*word-spacing[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, '$1');
}

function stripEngineStyles(html) {
  if (!html) return '';
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body><div>${html}</div></body>`, 'text/html');
  const container = doc.body.firstChild;
  container.querySelectorAll('span[style*="word-spacing"]').forEach(span => {
    while (span.firstChild) span.parentNode.insertBefore(span.firstChild, span);
    span.remove();
  });
  container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, blockquote').forEach(el => {
    el.removeAttribute('style');
  });
  return container.innerHTML;
}

// Div editable que evita que React sobreescriba los cambios del usuario
function EditableContent({ html, style, onInput, registerRef }) {
  const elRef = useRef(null);
  const lastHtmlRef = useRef(null);

  const setRef = useCallback(el => {
    elRef.current = el;
    if (registerRef) registerRef(el);
  }, [registerRef]);

  useLayoutEffect(() => {
    if (!elRef.current) return;
    const cleaned = cleanEngineHtml(html || '');
    if (cleaned !== lastHtmlRef.current) {
      elRef.current.innerHTML = cleaned;
      lastHtmlRef.current = cleaned;
    }
  }, [html]);

  return (
    <div
      ref={setRef}
      className="plv-page-content"
      style={style}
      contentEditable
      suppressContentEditableWarning
      onInput={onInput}
    />
  );
}

// Tarjeta de una página
function PageCard({ page, config, bookConfig, pageFormat, scale, totalPages, bookTitle, onInput, registerRef }) {
  const layout = useMemo(() =>
    getPageLayout({ pageData: page, config, bookConfig, pageFormat, previewScale: scale, totalPages, layoutDims: null, bookTitle }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, config, bookConfig, pageFormat?.id, scale, totalPages, bookTitle]
  );

  const {
    pageWidthPx, pageHeightPx,
    marginTop, marginBottom, marginLeft, marginRight,
    fontSize, fontFamily, lineHeightPx, textAlign,
    effectiveContentHeight,
    showPageNumber, displayNum, pageNumStyle,
    showHeaders, hasHeaderContent, skipHeader, headerHtml,
    isFrontMatterPage,
  } = layout;

  return (
    <div
      className={`plv-page${isFrontMatterPage ? ' is-front-matter' : ''}`}
      style={{
        width: `${pageWidthPx}px`,
        height: `${pageHeightPx}px`,
        padding: `${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px`,
        fontSize: `${fontSize}px`,
        fontFamily,
        lineHeight: `${lineHeightPx}px`,
        textAlign: isFrontMatterPage ? 'left' : textAlign,
        textJustify: 'inter-word',
        hyphens: 'none',
        wordBreak: 'break-word',
        overflowWrap: 'break-word',
      }}
    >
      {showHeaders && !page.isBlank && !skipHeader && hasHeaderContent && (
        <div
          className="plv-page-header"
          dangerouslySetInnerHTML={{ __html: headerHtml }}
          style={{ marginBottom: `${lineHeightPx}px` }}
        />
      )}
      <EditableContent
        html={page.html}
        style={{ height: `${effectiveContentHeight}px` }}
        onInput={onInput}
        registerRef={registerRef}
      />
      {showPageNumber && (
        <span className="plv-page-folio" style={pageNumStyle}>{displayNum}</span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
export default function PageLayoutView({ pushChange, onContentChange }) {
  const activeChapterId  = useEditorStore(s => s.editing.activeChapterId);
  const chapters         = useEditorStore(s => s.bookData?.chapters);
  const bookType         = useEditorStore(s => s.bookData?.bookType || 'novela');
  const bookTitle        = useEditorStore(s => s.bookData?.title || '');
  const config           = useEditorStore(useShallow(s => s.config));
  const updateChapter    = useEditorStore(s => s.updateChapter);
  // Páginas ya calculadas por el motor (las mismas que muestra el preview)
  const allPages         = useEditorStore(s => s.paginatedPages || []);
  const frontMatterPages = useEditorStore(s => s.frontMatterPages || []);

  const activeChapter = chapters?.find(ch => ch.id === activeChapterId);

  const containerRef   = useRef(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const saveTimeoutRef = useRef(null);
  const contentRef     = useRef(null);
  const isDirtyRef     = useRef(false);

  // Mide el ancho del contenedor para calcular el scale
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    ro.observe(el);
    setContainerWidth(el.getBoundingClientRect().width || 600);
    return () => ro.disconnect();
  }, []);

  // Scale y formatos del libro
  const { bookConfig, pageFormat, scale } = useMemo(() => {
    const bCfg = KDP_STANDARDS.getBookTypeConfig(bookType);
    let pFormat;
    if (config?.pageFormat === 'custom') {
      const cd = KDP_STANDARDS.getCustomPageDimensions(
        config?.customPageFormat?.width || 6,
        config?.customPageFormat?.height || 9,
        config?.customPageFormat?.unit || 'in'
      );
      pFormat = {
        id: 'custom', name: 'Custom',
        width: cd.widthMm, height: cd.heightMm,
        minMargins: { top: 12.7, bottom: 12.7, left: 12.7, right: 12.7 },
        type: 'paperback',
      };
    } else {
      pFormat = KDP_STANDARDS.getPageFormat(config?.pageFormat || bCfg.recommendedFormat);
    }
    const pageWidthPx = pFormat.width * PX_PER_MM;
    const available   = Math.max(300, containerWidth - 80);
    const s = Math.min(1.1, available / pageWidthPx);
    return { bookConfig: bCfg, pageFormat: pFormat, scale: Math.max(0.45, s) };
  }, [bookType, config?.pageFormat, config?.customPageFormat, containerWidth]);

  // Combina front matter + páginas del motor (igual que el preview)
  const combinedPages = useMemo(() => {
    if (frontMatterPages.length > 0) {
      const offset = frontMatterPages.length;
      return [
        ...frontMatterPages,
        ...allPages.map(p => ({
          ...p,
          pageNumber: (p.pageNumber || 0) + offset,
          displayPageNumber: p.displayPageNumber ?? p.pageNumber ?? 1,
        })),
      ];
    }
    return allPages;
  }, [frontMatterPages, allPages]);

  // Páginas del capítulo activo
  const chapterPages = useMemo(() => {
    if (!activeChapter || !combinedPages.length) return [];
    const title = activeChapter.title || '';
    return combinedPages.filter(p => {
      const pt = p.chapterTitle || '';
      return pt === title || pt.includes(title) || title.includes(pt);
    });
  }, [combinedPages, activeChapter?.title]);

  // Navegación
  const { currentPage, goToNextPage, goToPrevPage, goToPage } =
    usePageNavigation(chapterPages.length);

  const page = chapterPages[currentPage] ?? null;

  // Vuelve a la primera página al cambiar de capítulo
  useEffect(() => {
    goToPage(1);
  }, [activeChapterId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Guarda solo si el usuario editó algo
  const flushSave = useCallback(() => {
    clearTimeout(saveTimeoutRef.current);
    if (!isDirtyRef.current || !activeChapter || !contentRef.current) return;
    isDirtyRef.current = false;
    const html = stripEngineStyles(contentRef.current.innerHTML);
    const text = html.replace(/<[^>]+>/g, ' ');
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    updateChapter(activeChapter.id, { html, wordCount });
    if (onContentChange) onContentChange(new Date());
    if (pushChange) pushChange('Editar en modo diseño', config);
  }, [activeChapter, updateChapter, onContentChange, pushChange, config]);

  const handleInput = useCallback(() => {
    isDirtyRef.current = true;
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(flushSave, 1500);
  }, [flushSave]);

  const handlePrev = useCallback(() => { flushSave(); goToPrevPage(); }, [flushSave, goToPrevPage]);
  const handleNext = useCallback(() => { flushSave(); goToNextPage(); }, [flushSave, goToNextPage]);
  const handleGoTo = useCallback((num) => { flushSave(); goToPage(num); }, [flushSave, goToPage]);

  if (!activeChapter) {
    return (
      <div className="plv-shell" ref={containerRef}>
        <div className="plv-desk">
          <div className="plv-empty">Selecciona un capítulo para empezar a editar</div>
        </div>
      </div>
    );
  }

  const totalChapterPages = chapterPages.length;

  return (
    <div className="plv-shell" ref={containerRef}>

      {/* Navegación */}
      <div className="plv-nav">
        <button
          className="plv-nav-btn"
          onClick={handlePrev}
          disabled={currentPage === 0}
          title="Página anterior"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>

        <div className="plv-nav-info">
          <input
            type="number"
            min={1}
            max={totalChapterPages || 1}
            value={currentPage + 1}
            onChange={e => {
              const v = parseInt(e.target.value);
              if (!isNaN(v)) handleGoTo(v);
            }}
            onFocus={e => e.target.select()}
            className="plv-nav-input"
          />
          <span className="plv-nav-sep">de</span>
          <span className="plv-nav-total">{totalChapterPages > 0 ? totalChapterPages : '…'}</span>
          {page && (
            <span className="plv-nav-global">
              (p. {page.displayPageNumber ?? page.pageNumber})
            </span>
          )}
        </div>

        <button
          className="plv-nav-btn"
          onClick={handleNext}
          disabled={currentPage >= totalChapterPages - 1}
          title="Página siguiente"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>

      {/* Página */}
      <div className="plv-desk">
        {totalChapterPages === 0 ? (
          <div className="plv-loading">Calculando páginas…</div>
        ) : page ? (
          <PageCard
            key={`plv-${page.pageNumber}`}
            page={page}
            config={config}
            bookConfig={bookConfig}
            pageFormat={pageFormat}
            scale={scale}
            totalPages={combinedPages.length}
            bookTitle={bookTitle}
            onInput={handleInput}
            registerRef={el => { contentRef.current = el; }}
          />
        ) : null}
    </div>

    </div>
  );
}
