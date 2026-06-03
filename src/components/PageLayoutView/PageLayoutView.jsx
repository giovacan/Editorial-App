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

// Divide html en lo que cabe dentro de budget px y lo que sobra
function splitAtBudget(html, budget, mDiv) {
  if (!html?.trim()) return { fits: '', overflow: '' };
  mDiv.innerHTML = '';
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body><div>${html}</div></body>`, 'text/html');
  const blocks = Array.from(doc.body.firstChild.childNodes);
  if (!blocks.length) return { fits: html, overflow: '' };

  let fitsCount = 0;
  for (let i = 0; i < blocks.length; i++) {
    mDiv.appendChild(blocks[i].cloneNode(true));
    if (mDiv.scrollHeight <= budget) fitsCount = i + 1;
    else break;
  }

  const ser = arr => arr.map(n => n.outerHTML ?? n.textContent ?? '').join('');
  return { fits: ser(blocks.slice(0, fitsCount)), overflow: ser(blocks.slice(fitsCount)) };
}

// Div editable que evita que React sobreescriba los cambios del usuario
function EditableContent({ html, style, onInput, onKeyDown, registerRef }) {
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
      onKeyDown={onKeyDown}
    />
  );
}

// Tarjeta de una página
function PageCard({ page, config, bookConfig, pageFormat, scale, totalPages, bookTitle, layoutDims, onInput, onKeyDown, registerRef }) {
  const layout = useMemo(() =>
    getPageLayout({ pageData: page, config, bookConfig, pageFormat, previewScale: scale, totalPages, layoutDims, bookTitle }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, config, bookConfig, pageFormat?.id, scale, totalPages, layoutDims, bookTitle]
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
        onKeyDown={onKeyDown}
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
  const allPages         = useEditorStore(s => s.paginatedPages || []);
  const frontMatterPages = useEditorStore(s => s.frontMatterPages || []);
  const storeLayoutDims  = useEditorStore(s => s.layoutDims);

  const activeChapter = chapters?.find(ch => ch.id === activeChapterId);

  const containerRef    = useRef(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const saveTimeoutRef  = useRef(null);
  const reflowTimeoutRef = useRef(null);
  const contentRef      = useRef(null);
  const isDirtyRef      = useRef(false);
  const measureDivRef   = useRef(null);

  // Div off-screen para medir alturas de bloques
  useLayoutEffect(() => {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;word-break:break-word;overflow-wrap:break-word;hyphens:none;';
    document.body.appendChild(div);
    measureDivRef.current = div;
    return () => {
      measureDivRef.current?.parentNode?.removeChild(measureDivRef.current);
      measureDivRef.current = null;
    };
  }, []);

  // Mide el ancho del contenedor
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
      pFormat = { id: 'custom', name: 'Custom', width: cd.widthMm, height: cd.heightMm, minMargins: { top: 12.7, bottom: 12.7, left: 12.7, right: 12.7 }, type: 'paperback' };
    } else {
      pFormat = KDP_STANDARDS.getPageFormat(config?.pageFormat || bCfg.recommendedFormat);
    }
    const pageWidthPx = pFormat.width * PX_PER_MM;
    const available   = Math.max(300, containerWidth - 80);
    const s = Math.min(1.1, available / pageWidthPx);
    return { bookConfig: bCfg, pageFormat: pFormat, scale: Math.max(0.45, s) };
  }, [bookType, config?.pageFormat, config?.customPageFormat, containerWidth]);

  // layoutDims escalado a nuestra escala
  const scaledLayoutDims = useMemo(() => {
    if (!storeLayoutDims?.previewScale) return null;
    const ratio = scale / storeLayoutDims.previewScale;
    return {
      ...storeLayoutDims,
      contentHeight:               storeLayoutDims.contentHeight * ratio,
      contentWidth:                storeLayoutDims.contentWidth  * ratio,
      lineHeightPx:                storeLayoutDims.lineHeightPx  * ratio,
      baseFontSizePx:              storeLayoutDims.baseFontSizePx * ratio,
      headerSpaceEstimate:         (storeLayoutDims.headerSpaceEstimate        ?? 0) * ratio,
      chapterStartBottomClearance: (storeLayoutDims.chapterStartBottomClearance ?? 0) * ratio,
      chapterStartExtraLines:      storeLayoutDims.chapterStartExtraLines ?? 0,
      previewScale:                scale,
    };
  }, [storeLayoutDims, scale]);

  // Páginas del motor combinadas con front matter
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

  // Páginas del capítulo activo (del motor)
  const chapterPages = useMemo(() => {
    if (!activeChapter || !combinedPages.length) return [];
    const title = activeChapter.title || '';
    return combinedPages.filter(p => {
      if (p.isTitlePage || p.isTOCPage || p.isFrontMatter) return false;
      const pt = p.chapterTitle || '';
      if (!pt && !title) return true;
      return pt === title || (pt && title && (pt.includes(title) || title.includes(pt)));
    });
  }, [combinedPages, activeChapter?.title]);

  // ── Estado local de páginas (modificable por reflow) ──
  const [localPages, setLocalPages] = useState([]);

  // Sync desde el motor cuando el usuario está idle
  useEffect(() => {
    if (!isDirtyRef.current) setLocalPages(chapterPages);
  }, [chapterPages]);

  // Al cambiar de capítulo, siempre sincronizar
  useEffect(() => {
    isDirtyRef.current = false;
    setLocalPages(chapterPages);
  }, [activeChapterId]); // eslint-disable-line

  // Referencia siempre actualizada a localPages para usarla en callbacks
  const localPagesRef = useRef(localPages);
  useEffect(() => { localPagesRef.current = localPages; }, [localPages]);

  // Navegación sobre páginas locales
  const { currentPage, goToNextPage, goToPrevPage, goToPage } =
    usePageNavigation(localPages.length);

  const currentPageRef = useRef(currentPage);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);

  const page = localPages[currentPage] ?? null;

  // Al cambiar de capítulo volver a página 1
  useEffect(() => {
    goToPage(1);
  }, [activeChapterId]); // eslint-disable-line

  // ── Reflow: redistribuye contenido entre páginas locales ──
  const doReflow = useCallback(() => {
    const el  = contentRef.current;
    const mDiv = measureDivRef.current;
    if (!el || !mDiv) return;

    const budget = el.clientHeight;
    if (budget <= 0) return;

    const computed  = window.getComputedStyle(el);
    const lineH     = parseFloat(computed.lineHeight) || 20;

    // Aplicar estilos al div de medición
    mDiv.style.width      = `${el.clientWidth}px`;
    mDiv.style.fontSize   = computed.fontSize;
    mDiv.style.fontFamily = computed.fontFamily;
    mDiv.style.lineHeight = computed.lineHeight;
    mDiv.style.textAlign  = computed.textAlign;

    const idx = currentPageRef.current;

    // ── Overflow → empujar a la siguiente página ──
    if (el.scrollHeight > budget + lineH * 0.3) {
      const html = stripEngineStyles(el.innerHTML);
      const { fits, overflow } = splitAtBudget(html, budget, mDiv);
      if (!overflow || !fits) return;

      setLocalPages(prev => {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], html: fits };
        if (idx + 1 < updated.length) {
          updated[idx + 1] = {
            ...updated[idx + 1],
            html: overflow + (updated[idx + 1].html || ''),
          };
        } else {
          // Crear nueva página local al final
          updated.push({
            ...updated[idx],
            pageNumber: updated[updated.length - 1].pageNumber + 1,
            html: overflow,
            isBlank: false,
          });
        }
        return updated;
      });

      // Cursor al final de la página actual
      requestAnimationFrame(() => {
        if (!contentRef.current) return;
        contentRef.current.focus();
        const range = document.createRange();
        range.selectNodeContents(contentRef.current);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      });
      return;
    }

    // ── Underflow → jalar primer bloque de la siguiente página ──
    if (el.scrollHeight < budget - lineH * 2) {
      const pages = localPagesRef.current;
      if (idx >= pages.length - 1) return;
      const nextPage = pages[idx + 1];
      if (!nextPage?.html?.trim()) return;

      const parser = new DOMParser();
      const doc    = parser.parseFromString(`<body><div>${nextPage.html}</div></body>`, 'text/html');
      const blocks = Array.from(doc.body.firstChild.childNodes);
      if (!blocks.length) return;

      const firstBlock = blocks[0].outerHTML ?? blocks[0].textContent ?? '';
      const restHtml   = blocks.slice(1).map(n => n.outerHTML ?? n.textContent ?? '').join('');
      const currentHtml = stripEngineStyles(el.innerHTML);

      // Verificar que el primer bloque cabe
      mDiv.innerHTML = currentHtml + firstBlock;
      if (mDiv.scrollHeight > budget) return;

      setLocalPages(prev => {
        const updated = [...prev];
        updated[idx]     = { ...updated[idx],     html: currentHtml + firstBlock };
        updated[idx + 1] = { ...updated[idx + 1], html: restHtml };
        return updated;
      });
    }
  }, []); // Sin deps — usa refs

  // ── Guardar ──
  const flushSaveRef = useRef(null);
  const flushSave = useCallback(() => {
    clearTimeout(saveTimeoutRef.current);
    if (!isDirtyRef.current || !activeChapter) return;
    isDirtyRef.current = false;

    const pages = localPagesRef.current;
    const title = activeChapter.title || '';
    const chPages = pages.filter(p => {
      if (p.isTitlePage || p.isTOCPage || p.isFrontMatter) return false;
      const pt = p.chapterTitle || '';
      if (!pt && !title) return true;
      return pt === title || (pt && title && (pt.includes(title) || title.includes(pt)));
    });

    const html = chPages.map(p => p.html || '').join('\n').trim();
    if (!html) return;
    const wordCount = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(w => w.length > 0).length;
    updateChapter(activeChapter.id, { html, wordCount });
    if (onContentChange) onContentChange(new Date());
    if (pushChange) pushChange('Editar en modo diseño', config);
  }, [activeChapter, updateChapter, onContentChange, pushChange, config]);

  // Mantener ref actualizada para los timeouts
  useEffect(() => { flushSaveRef.current = flushSave; }, [flushSave]);

  // ── Input handler ──
  const handleInput = useCallback(() => {
    isDirtyRef.current = true;
    clearTimeout(reflowTimeoutRef.current);
    clearTimeout(saveTimeoutRef.current);
    reflowTimeoutRef.current = setTimeout(doReflow, 200);
    saveTimeoutRef.current   = setTimeout(() => flushSaveRef.current?.(), 1500);
  }, [doReflow]);

  // ── Teclas especiales en límites de página ──
  const handleKeyDown = useCallback((e) => {
    const el = contentRef.current;
    if (!el) return;

    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);

    // Backspace al inicio → ir a página anterior
    if (e.key === 'Backspace' && currentPageRef.current > 0) {
      const isAtStart = range.collapsed &&
        range.startOffset === 0 &&
        (range.startContainer === el || range.startContainer === el.firstChild);
      if (isAtStart) {
        e.preventDefault();
        flushSaveRef.current?.();
        goToPrevPage();
        // Cursor al final de la página anterior
        requestAnimationFrame(() => {
          if (!contentRef.current) return;
          contentRef.current.focus();
          const r = document.createRange();
          r.selectNodeContents(contentRef.current);
          r.collapse(false);
          const s = window.getSelection();
          s.removeAllRanges();
          s.addRange(r);
        });
      }
    }

    // Enter al final → ir a página siguiente
    if (e.key === 'Enter') {
      const pages = localPagesRef.current;
      const idx   = currentPageRef.current;
      if (idx >= pages.length - 1) return;

      // Verificar si el cursor está al final del contenido
      const endRange = document.createRange();
      endRange.selectNodeContents(el);
      endRange.collapse(false);
      const isAtEnd = range.collapsed &&
        range.startContainer === endRange.startContainer &&
        range.startOffset   === endRange.startOffset;
      if (isAtEnd) {
        e.preventDefault();
        goToNextPage();
        requestAnimationFrame(() => {
          if (!contentRef.current) return;
          contentRef.current.focus();
          const r = document.createRange();
          r.selectNodeContents(contentRef.current);
          r.collapse(true);
          const s = window.getSelection();
          s.removeAllRanges();
          s.addRange(r);
        });
      }
    }
  }, [goToPrevPage, goToNextPage]);

  const handlePrev = useCallback(() => { flushSaveRef.current?.(); goToPrevPage(); }, [goToPrevPage]);
  const handleNext = useCallback(() => { flushSaveRef.current?.(); goToNextPage(); }, [goToNextPage]);
  const handleGoTo = useCallback((num) => { flushSaveRef.current?.(); goToPage(num); }, [goToPage]);

  if (!activeChapter) {
    return (
      <div className="plv-shell" ref={containerRef}>
        <div className="plv-desk">
          <div className="plv-empty">Selecciona un capítulo para empezar a editar</div>
        </div>
      </div>
    );
  }

  const totalChapterPages = localPages.length;

  return (
    <div className="plv-shell" ref={containerRef}>

      {/* Navegación */}
      <div className="plv-nav">
        <button className="plv-nav-btn" onClick={handlePrev} disabled={currentPage === 0} title="Página anterior">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>

        <div className="plv-nav-info">
          <input
            type="number" min={1} max={totalChapterPages || 1} value={currentPage + 1}
            onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) handleGoTo(v); }}
            onFocus={e => e.target.select()}
            className="plv-nav-input"
          />
          <span className="plv-nav-sep">de</span>
          <span className="plv-nav-total">{totalChapterPages > 0 ? totalChapterPages : '…'}</span>
          {page && (
            <span className="plv-nav-global">(p. {page.displayPageNumber ?? page.pageNumber})</span>
          )}
        </div>

        <button className="plv-nav-btn" onClick={handleNext} disabled={currentPage >= totalChapterPages - 1} title="Página siguiente">
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
            key={`plv-${page.pageNumber}-${currentPage}`}
            page={page}
            config={config}
            bookConfig={bookConfig}
            pageFormat={pageFormat}
            scale={scale}
            totalPages={combinedPages.length}
            bookTitle={bookTitle}
            layoutDims={scaledLayoutDims}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            registerRef={el => { contentRef.current = el; }}
          />
        ) : null}
      </div>

    </div>
  );
}
