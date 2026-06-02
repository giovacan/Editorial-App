import { useRef, useMemo, useCallback, useState, useEffect, useLayoutEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { KDP_STANDARDS } from '../../utils/kdpStandards';
import useEditorStore from '../../store/useEditorStore';
import { getPageLayout } from '../../utils/pageLayout';
import './PageLayoutView.css';

const PX_PER_MM = 3.7795;

// Quita spans de word-spacing que inyecta el motor KP (solo para display)
function cleanEngineHtml(html) {
  if (!html) return '';
  return html.replace(/<span\b[^>]*style="[^"]*word-spacing[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, '$1');
}

// Limpia estilos computados por el motor para guardar HTML "crudo" en el capítulo
function stripEngineStyles(html) {
  if (!html) return '';
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body><div>${html}</div></body>`, 'text/html');
  const container = doc.body.firstChild;

  // Quitar spans de word-spacing
  container.querySelectorAll('span[style*="word-spacing"]').forEach(span => {
    while (span.firstChild) span.parentNode.insertBefore(span.firstChild, span);
    span.remove();
  });

  // Quitar estilos inline de elementos de bloque (el motor los recalcula)
  container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, blockquote').forEach(el => {
    el.removeAttribute('style');
  });

  return container.innerHTML;
}

// Componente de contenido editable: previene que React sobreescriba los cambios del usuario
function EditableContent({ html, style, onInput, registerRef }) {
  const elRef = useRef(null);
  const lastHtmlRef = useRef(null);

  const setRef = useCallback(el => {
    elRef.current = el;
    if (registerRef) registerRef(el);
  }, [registerRef]);

  // Actualiza el DOM solo cuando el HTML del motor cambia (post-guardado)
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

// Tarjeta de una sola página
function PageCard({ page, config, bookConfig, pageFormat, scale, totalPages, bookTitle, layoutDims, onInput, registerRef }) {
  const layout = useMemo(() =>
    getPageLayout({ pageData: page, config, bookConfig, pageFormat, previewScale: scale, totalPages, layoutDims, bookTitle }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, config, bookConfig?.id, pageFormat?.id, scale, totalPages, layoutDims, bookTitle]
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

  const pageNumGapPx = lineHeightPx;

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
          style={{ marginBottom: `${pageNumGapPx}px` }}
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

// ──────────────────────────────────────────────────
// Componente principal
// ──────────────────────────────────────────────────
export default function PageLayoutView({ pushChange, onContentChange }) {
  const activeChapterId = useEditorStore(s => s.editing.activeChapterId);
  const chapters = useEditorStore(s => s.bookData?.chapters);
  const bookType = useEditorStore(s => s.bookData?.bookType || 'novela');
  const bookTitle = useEditorStore(s => s.bookData?.title || '');
  const config = useEditorStore(useShallow(s => s.config));
  const updateChapter = useEditorStore(s => s.updateChapter);
  // layoutDims está en la escala del preview (0.42); pasamos null para que
  // getPageLayout recalcule dimensiones a nuestra escala real del centro.
  const layoutDims = null;
  // Páginas calculadas por el motor (las mismas que ve el preview)
  const allPages = useEditorStore(s => s.paginatedPages || []);
  const frontMatterPages = useEditorStore(s => s.frontMatterPages || []);

  const activeChapter = chapters?.find(ch => ch.id === activeChapterId);
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const saveTimeoutRef = useRef(null);
  const [isEditing, setIsEditing] = useState(false);
  const [displayedPages, setDisplayedPages] = useState([]);
  const pageContentRefs = useRef({});

  // Mide el ancho del contenedor para calcular el scale
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    ro.observe(el);
    setContainerWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  // Calcula la escala y las dimensiones del libro
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
    const available = Math.max(300, containerWidth - 80);
    // Scale para que la página llene cómodamente el área central
    const s = Math.min(1.1, available / pageWidthPx);
    return { bookConfig: bCfg, pageFormat: pFormat, scale: Math.max(0.45, s) };
  }, [bookType, config?.pageFormat, config?.customPageFormat, containerWidth]);

  // Construye la lista completa de páginas (front matter + capítulos)
  const combinedPages = useMemo(() => {
    if (frontMatterPages.length > 0) {
      const offset = frontMatterPages.length;
      const offsetPages = allPages.map(p => ({
        ...p,
        pageNumber: (p.pageNumber || 0) + offset,
        displayPageNumber: p.displayPageNumber ?? p.pageNumber ?? 1,
      }));
      return [...frontMatterPages, ...offsetPages];
    }
    return allPages;
  }, [frontMatterPages, allPages]);

  // Filtra solo las páginas del capítulo activo
  const chapterPages = useMemo(() => {
    if (!activeChapter) return [];
    const title = activeChapter.title || '';
    return combinedPages.filter(p => {
      const pt = p.chapterTitle || '';
      return pt === title || pt.includes(title) || title.includes(pt);
    });
  }, [combinedPages, activeChapter?.title]);

  // Solo actualiza las páginas mostradas cuando NO estamos en medio de una edición
  useEffect(() => {
    if (!isEditing && chapterPages.length > 0) {
      setDisplayedPages(chapterPages);
    }
  }, [chapterPages, isEditing]);

  const handleInput = useCallback(() => {
    if (!activeChapter) return;
    setIsEditing(true);
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      // Recopila el HTML de todos los divs de contenido de página
      const indices = Object.keys(pageContentRefs.current)
        .map(Number)
        .sort((a, b) => a - b);
      const htmlParts = indices.map(i => pageContentRefs.current[i]?.innerHTML || '');
      const combined = htmlParts.map(h => stripEngineStyles(h)).join('\n');
      const text = combined.replace(/<[^>]+>/g, ' ');
      const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

      updateChapter(activeChapter.id, { html: combined, wordCount });
      setIsEditing(false);
      if (onContentChange) onContentChange(new Date());
      if (pushChange) pushChange('Editar en modo diseño');
    }, 1500);
  }, [activeChapter, updateChapter, onContentChange, pushChange]);

  if (!activeChapter) {
    return (
      <div className="plv-desk" ref={containerRef}>
        <div className="plv-empty">Selecciona un capítulo para empezar a editar</div>
      </div>
    );
  }

  return (
    <div className="plv-desk" ref={containerRef}>
      {displayedPages.length === 0 ? (
        <div className="plv-loading">Calculando páginas…</div>
      ) : (
        displayedPages.map((page, i) => (
          <PageCard
            key={`plv-${page.pageNumber ?? i}`}
            page={page}
            config={config}
            bookConfig={bookConfig}
            pageFormat={pageFormat}
            scale={scale}
            totalPages={combinedPages.length}
            bookTitle={bookTitle}
            layoutDims={layoutDims}
            onInput={handleInput}
            registerRef={(el) => { pageContentRefs.current[i] = el; }}
          />
        ))
      )}
    </div>
  );
}
