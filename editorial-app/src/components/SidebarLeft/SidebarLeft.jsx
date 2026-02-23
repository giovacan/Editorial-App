import { useState, useMemo, useCallback } from 'react';
import useEditorStore from '../../store/useEditorStore';
import { KDP_STANDARDS } from '../../utils/kdpStandards';
import Accordion from '../Accordion/Accordion';
import './SidebarLeft.css';

function SidebarLeft() {
  const [activeTab, setActiveTab] = useState('structure');
  const [selectedSubheaderLevel, setSelectedSubheaderLevel] = useState('h1');
  
  const bookData = useEditorStore((state) => state.bookData);
  const config = useEditorStore((state) => state.config);
  const editing = useEditorStore((state) => state.editing);
  const getStats = useEditorStore((state) => state.getStatsSelector);
  const addChapter = useEditorStore((state) => state.addChapter);
  const addSection = useEditorStore((state) => state.addSection);
  const deleteChapter = useEditorStore((state) => state.deleteChapter);
  const setActiveChapter = useEditorStore((state) => state.setActiveChapter);
  const setConfig = useEditorStore((state) => state.setConfig);
  const setBookData = useEditorStore((state) => state.setBookData);
  const updateChapter = useEditorStore((state) => state.updateChapter);
  
  const safeBookData = bookData || { title: '', author: '', chapters: [], bookType: 'novela' };
  const safeConfig = config || { 
    pageFormat: 'a5', 
    fontSize: 12, 
    lineHeight: 1.6,
    chapterTitle: { align: 'center', bold: true, sizeMultiplier: 1.8, marginTop: 2, marginBottom: 1, startOnRightPage: true },
    subheaders: {
      h1: { align: 'center', bold: true, sizeMultiplier: 1.5, marginTop: 1.5, marginBottom: 0.5, minLinesAfter: 2 },
      h2: { align: 'center', bold: true, sizeMultiplier: 1.35, marginTop: 1.25, marginBottom: 0.5, minLinesAfter: 2 },
      h3: { align: 'center', bold: true, sizeMultiplier: 1.25, marginTop: 1, marginBottom: 0.5, minLinesAfter: 1 },
      h4: { align: 'left', bold: true, sizeMultiplier: 1.15, marginTop: 1, marginBottom: 0.5, minLinesAfter: 1 },
      h5: { align: 'left', bold: true, sizeMultiplier: 1.1, marginTop: 0.75, marginBottom: 0.25, minLinesAfter: 1 },
      h6: { align: 'left', bold: false, sizeMultiplier: 1.0, marginTop: 0.5, marginBottom: 0.25, minLinesAfter: 1 }
    },
    paragraph: { firstLineIndent: 1.5, align: 'justify', spacingBetween: 0 },
    quote: { enabled: true, indentLeft: 2, indentRight: 2, showLine: true, italic: true, sizeMultiplier: 0.95, marginTop: 1, marginBottom: 1 },
    pagination: { minOrphanLines: 2, minWidowLines: 2, splitLongParagraphs: true }
  };
  
const stats = useMemo(() => getStats(), [getStats, safeBookData?.chapters]);

  const handleAddChapter = useCallback(() => {
    const title = prompt('Título del capítulo:');
    if (title) {
      addChapter(title);
    }
  }, [addChapter]);

  const handleAddSection = useCallback(() => {
    const title = prompt('Nombre de la sección (ej: Prólogo, Dedicatoria):');
    if (title) {
      addSection(title);
    }
  }, [addSection]);

  const handleBookTypeChange = (e) => {
    const bookType = e.target.value;
    const bookConfig = KDP_STANDARDS.getBookTypeConfig(bookType);
    setBookData({ bookType });
    setConfig({
      pageFormat: bookConfig.recommendedFormat,
      fontSize: bookConfig.fontSize,
      lineHeight: bookConfig.lineHeight
    });
  };

  const handleTitleChange = (chapterId, newTitle) => {
    updateChapter(chapterId, { title: newTitle });
  };

  const handleDocumentTitleChange = (e) => {
    setBookData({ title: e.target.value });
  };

  const handleDocumentAuthorChange = (e) => {
    setBookData({ author: e.target.value });
  };

  const updateChapterTitle = (key, value) => {
    setConfig({ chapterTitle: { ...safeConfig.chapterTitle, [key]: value } });
  };

  const updateSubheader = (key, value) => {
    setConfig({
      subheaders: {
        ...safeConfig.subheaders,
        [selectedSubheaderLevel]: { ...safeConfig.subheaders[selectedSubheaderLevel], [key]: value }
      }
    });
  };

  const updateParagraph = (key, value) => {
    setConfig({ paragraph: { ...safeConfig.paragraph, [key]: value } });
  };

  const updateQuote = (key, value) => {
    setConfig({ quote: { ...safeConfig.quote, [key]: value } });
  };

  const updatePagination = (key, value) => {
    setConfig({ pagination: { ...safeConfig.pagination, [key]: value } });
  };

  const accordionItems = [
    {
      id: 'formato',
      title: 'Formato del Libro',
      icon: '📐',
      content: (
        <>
          <fieldset className="config-group">
            <legend>Tipo de libro</legend>
            <select 
              value={safeBookData?.bookType || 'novela'} 
              onChange={handleBookTypeChange}
            >
              <option value="novela">Novela / Ficción</option>
              <option value="ensayo">Ensayo / No ficción</option>
              <option value="poesia">Poesía</option>
              <option value="manual">Manual / Técnico</option>
              <option value="infantil">Libro Infantil</option>
            </select>
          </fieldset>

          <fieldset className="config-group">
            <legend>Formato de página</legend>
            <select 
              value={safeConfig.pageFormat} 
              onChange={(e) => setConfig({ pageFormat: e.target.value })}
            >
              <option value="a5">A5 (14.8 × 21 cm)</option>
              <option value="a4">A4 (21 × 29.7 cm)</option>
              <option value="letter">Letter (8.5 × 11 in)</option>
              <option value="5x8">5 × 8 inches</option>
              <option value="6x9">6 × 9 inches</option>
              <option value="8x10">8 × 10 inches</option>
            </select>
          </fieldset>
        </>
      )
    },
    {
      id: 'tipografia',
      title: 'Tipografía Base',
      icon: '🔤',
      content: (
        <>
          <fieldset className="config-group">
            <legend>Familia de fuente</legend>
            <select 
              value={safeConfig.fontFamily} 
              onChange={(e) => setConfig({ fontFamily: e.target.value })}
            >
              <optgroup label="Serif">
                <option value="Georgia, serif">Georgia</option>
                <option value="'Times New Roman', serif">Times New Roman</option>
                <option value="Garamond, serif">Garamond</option>
                <option value="Merriweather, serif">Merriweather</option>
                <option value="Palatino, serif">Palatino</option>
                <option value="'Book Antiqua', serif">Book Antiqua</option>
                <option value="Cambria, serif">Cambria</option>
                <option value="Baskerville, serif">Baskerville</option>
              </optgroup>
              <optgroup label="Sans Serif">
                <option value="Arial, sans-serif">Arial</option>
                <option value="Helvetica, sans-serif">Helvetica</option>
                <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
                <option value="Verdana, sans-serif">Verdana</option>
                <option value="Calibri, sans-serif">Calibri</option>
                <option value="'Segoe UI', sans-serif">Segoe UI</option>
                <option value="Tahoma, sans-serif">Tahoma</option>
              </optgroup>
              <optgroup label="Monoespaciada">
                <option value="'Courier New', monospace">Courier New</option>
                <option value="Consolas, monospace">Consolas</option>
              </optgroup>
            </select>
          </fieldset>

          <fieldset className="config-group">
            <legend>Tamaño de fuente (pt)</legend>
            <input 
              type="number" 
              min="10" 
              max="16" 
              value={safeConfig.fontSize}
              onChange={(e) => setConfig({ fontSize: parseInt(e.target.value) })}
            />
          </fieldset>

          <fieldset className="config-group">
            <legend>Interlineado</legend>
            <select 
              value={safeConfig.lineHeight}
              onChange={(e) => setConfig({ lineHeight: parseFloat(e.target.value) })}
            >
              <option value="1.4">1.4 (Apretado)</option>
              <option value="1.5">1.5</option>
              <option value="1.6">1.6 (Recomendado)</option>
              <option value="1.8">1.8 (Espaciado)</option>
              <option value="2.0">2.0 (Doble)</option>
            </select>
          </fieldset>
        </>
      )
    },
    {
      id: 'capitulos',
      title: 'Títulos de Capítulo',
      icon: '📖',
      content: (
        <>
          <fieldset className="config-group">
            <legend>Alineación</legend>
            <div className="radio-group">
              <label><input type="radio" name="chapterAlign" value="left" checked={safeConfig.chapterTitle.align === 'left'} onChange={(e) => updateChapterTitle('align', e.target.value)} /> Izquierda</label>
              <label><input type="radio" name="chapterAlign" value="center" checked={safeConfig.chapterTitle.align === 'center'} onChange={(e) => updateChapterTitle('align', e.target.value)} /> Centro</label>
              <label><input type="radio" name="chapterAlign" value="right" checked={safeConfig.chapterTitle.align === 'right'} onChange={(e) => updateChapterTitle('align', e.target.value)} /> Derecha</label>
            </div>
          </fieldset>

          <fieldset className="config-group">
            <legend>Estilo</legend>
            <label className="checkbox-label">
              <input type="checkbox" checked={safeConfig.chapterTitle.bold} onChange={(e) => updateChapterTitle('bold', e.target.checked)} />
              Negrita
            </label>
          </fieldset>

          <fieldset className="config-group">
            <legend>Tamaño relativo</legend>
            <div className="number-row">
              <input type="number" min="1.0" max="3.0" step="0.1" value={safeConfig.chapterTitle.sizeMultiplier} onChange={(e) => updateChapterTitle('sizeMultiplier', parseFloat(e.target.value))} />
              <span>({safeConfig.fontSize * safeConfig.chapterTitle.sizeMultiplier}pt)</span>
            </div>
          </fieldset>

          <fieldset className="config-group">
            <legend>Espaciado</legend>
            <div className="number-row">
              <label>Antes:</label>
              <input type="number" min="0" max="4" step="0.25" value={safeConfig.chapterTitle.marginTop} onChange={(e) => updateChapterTitle('marginTop', parseFloat(e.target.value))} />
              <span>líneas</span>
            </div>
            <div className="number-row">
              <label>Después:</label>
              <input type="number" min="0" max="3" step="0.25" value={safeConfig.chapterTitle.marginBottom} onChange={(e) => updateChapterTitle('marginBottom', parseFloat(e.target.value))} />
              <span>líneas</span>
            </div>
          </fieldset>

          <fieldset className="config-group">
            <legend>Posición</legend>
            <label className="checkbox-label">
              <input type="checkbox" checked={safeConfig.chapterTitle.startOnRightPage} onChange={(e) => updateChapterTitle('startOnRightPage', e.target.checked)} />
              Iniciar capítulo en página derecha
            </label>
          </fieldset>
        </>
      )
    },
    {
      id: 'subheaders',
      title: 'Subencabezados (H1-H6)',
      icon: '📋',
      content: (
        <>
          <div className="level-selector">
            {['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map(level => (
              <button 
                key={level}
                className={`level-btn ${selectedSubheaderLevel === level ? 'active' : ''}`}
                onClick={() => setSelectedSubheaderLevel(level)}
              >
                {level.toUpperCase()}
              </button>
            ))}
          </div>

          <fieldset className="config-group">
            <legend>Alineación</legend>
            <div className="radio-group">
              <label><input type="radio" name="subAlign" value="left" checked={safeConfig.subheaders[selectedSubheaderLevel].align === 'left'} onChange={(e) => updateSubheader('align', e.target.value)} /> Izquierda</label>
              <label><input type="radio" name="subAlign" value="center" checked={safeConfig.subheaders[selectedSubheaderLevel].align === 'center'} onChange={(e) => updateSubheader('align', e.target.value)} /> Centro</label>
              <label><input type="radio" name="subAlign" value="right" checked={safeConfig.subheaders[selectedSubheaderLevel].align === 'right'} onChange={(e) => updateSubheader('align', e.target.value)} /> Derecha</label>
            </div>
          </fieldset>

          <fieldset className="config-group">
            <legend>Estilo</legend>
            <label className="checkbox-label">
              <input type="checkbox" checked={safeConfig.subheaders[selectedSubheaderLevel].bold} onChange={(e) => updateSubheader('bold', e.target.checked)} />
              Negrita
            </label>
          </fieldset>

          <fieldset className="config-group">
            <legend>Tamaño relativo</legend>
            <div className="number-row">
              <input type="number" min="0.8" max="2.0" step="0.05" value={safeConfig.subheaders[selectedSubheaderLevel].sizeMultiplier} onChange={(e) => updateSubheader('sizeMultiplier', parseFloat(e.target.value))} />
              <span>({Math.round(safeConfig.fontSize * safeConfig.subheaders[selectedSubheaderLevel].sizeMultiplier)}pt)</span>
            </div>
          </fieldset>

          <fieldset className="config-group">
            <legend>Espaciado</legend>
            <div className="number-row">
              <label>Antes:</label>
              <input type="number" min="0" max="3" step="0.25" value={safeConfig.subheaders[selectedSubheaderLevel].marginTop} onChange={(e) => updateSubheader('marginTop', parseFloat(e.target.value))} />
              <span>líneas</span>
            </div>
            <div className="number-row">
              <label>Después:</label>
              <input type="number" min="0" max="2" step="0.25" value={safeConfig.subheaders[selectedSubheaderLevel].marginBottom} onChange={(e) => updateSubheader('marginBottom', parseFloat(e.target.value))} />
              <span>líneas</span>
            </div>
          </fieldset>

          <fieldset className="config-group">
            <legend>Paginación</legend>
            <div className="number-row">
              <label>Mín. líneas después:</label>
              <input type="number" min="1" max="4" value={safeConfig.subheaders[selectedSubheaderLevel].minLinesAfter} onChange={(e) => updateSubheader('minLinesAfter', parseInt(e.target.value))} />
            </div>
          </fieldset>
        </>
      )
    },
    {
      id: 'parrafos',
      title: 'Párrafos',
      icon: '📝',
      content: (
        <>
          <fieldset className="config-group">
            <legend>Sangría primera línea</legend>
            <div className="number-row">
              <input type="number" min="0" max="3" step="0.25" value={safeConfig.paragraph.firstLineIndent} onChange={(e) => updateParagraph('firstLineIndent', parseFloat(e.target.value))} />
              <span>em</span>
            </div>
          </fieldset>

          <fieldset className="config-group">
            <legend>Alineación</legend>
            <div className="radio-group">
              <label><input type="radio" name="paraAlign" value="justify" checked={safeConfig.paragraph.align === 'justify'} onChange={(e) => updateParagraph('align', e.target.value)} /> Justificar</label>
              <label><input type="radio" name="paraAlign" value="left" checked={safeConfig.paragraph.align === 'left'} onChange={(e) => updateParagraph('align', e.target.value)} /> Izquierda</label>
            </div>
          </fieldset>

          <fieldset className="config-group">
            <legend>Espaciado entre párrafos</legend>
            <div className="number-row">
              <input type="number" min="0" max="1" step="0.25" value={safeConfig.paragraph.spacingBetween} onChange={(e) => updateParagraph('spacingBetween', parseFloat(e.target.value))} />
              <span>líneas</span>
            </div>
          </fieldset>
        </>
      )
    },
    {
      id: 'citas',
      title: 'Citas',
      icon: '❝',
      content: (
        <>
          <fieldset className="config-group">
            <legend>Habilitar estilo</legend>
            <label className="checkbox-label">
              <input type="checkbox" checked={safeConfig.quote.enabled} onChange={(e) => updateQuote('enabled', e.target.checked)} />
              Aplicar estilo especial a citas
            </label>
          </fieldset>

          <fieldset className="config-group">
            <legend>Sangría</legend>
            <div className="number-row">
              <label>Izquierda:</label>
              <input type="number" min="0" max="4" step="0.5" value={safeConfig.quote.indentLeft} onChange={(e) => updateQuote('indentLeft', parseFloat(e.target.value))} />
              <span>em</span>
            </div>
            <div className="number-row">
              <label>Derecha:</label>
              <input type="number" min="0" max="4" step="0.5" value={safeConfig.quote.indentRight} onChange={(e) => updateQuote('indentRight', parseFloat(e.target.value))} />
              <span>em</span>
            </div>
          </fieldset>

          <fieldset className="config-group">
            <legend>Estilo</legend>
            <label className="checkbox-label">
              <input type="checkbox" checked={safeConfig.quote.italic} onChange={(e) => updateQuote('italic', e.target.checked)} />
              Cursiva
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={safeConfig.quote.showLine} onChange={(e) => updateQuote('showLine', e.target.checked)} />
              Línea decorativa izquierda
            </label>
          </fieldset>

          <fieldset className="config-group">
            <legend>Tamaño</legend>
            <div className="number-row">
              <input type="number" min="0.7" max="1.2" step="0.05" value={safeConfig.quote.sizeMultiplier} onChange={(e) => updateQuote('sizeMultiplier', parseFloat(e.target.value))} />
              <span>({Math.round(safeConfig.fontSize * safeConfig.quote.sizeMultiplier)}pt)</span>
            </div>
          </fieldset>

          <fieldset className="config-group">
            <legend>Márgenes</legend>
            <div className="number-row">
              <label>Superior:</label>
              <input type="number" min="0" max="2" step="0.25" value={safeConfig.quote.marginTop} onChange={(e) => updateQuote('marginTop', parseFloat(e.target.value))} />
              <span>em</span>
            </div>
            <div className="number-row">
              <label>Inferior:</label>
              <input type="number" min="0" max="2" step="0.25" value={safeConfig.quote.marginBottom} onChange={(e) => updateQuote('marginBottom', parseFloat(e.target.value))} />
              <span>em</span>
            </div>
          </fieldset>
        </>
      )
    },
    {
      id: 'headers',
      title: 'Encabezados (Headers)',
      icon: '📑',
      content: (
        <>
          <fieldset className="config-group">
            <legend>Mostrar</legend>
            <label className="checkbox-label">
              <input type="checkbox" checked={safeConfig.showHeaders} onChange={(e) => setConfig({ showHeaders: e.target.checked })} />
              Mostrar encabezados en páginas
            </label>
          </fieldset>

          {safeConfig.showHeaders && (
            <>
              <fieldset className="config-group">
                <legend>Contenido</legend>
                <select value={safeConfig.headerContent} onChange={(e) => setConfig({ headerContent: e.target.value })}>
                  <option value="title">Título del libro</option>
                  <option value="chapter">Título del capítulo</option>
                  <option value="both">Alternar (pár/impar)</option>
                </select>
              </fieldset>

              <fieldset className="config-group">
                <legend>Posición</legend>
                <select value={safeConfig.headerPosition} onChange={(e) => setConfig({ headerPosition: e.target.value })}>
                  <option value="top">Arriba</option>
                  <option value="bottom">Abajo</option>
                </select>
              </fieldset>

              <fieldset className="config-group">
                <legend>Línea divisoria</legend>
                <label className="checkbox-label">
                  <input type="checkbox" checked={safeConfig.headerLine} onChange={(e) => setConfig({ headerLine: e.target.checked })} />
                  Mostrar línea
                </label>
              </fieldset>
            </>
          )}
        </>
      )
    },
    {
      id: 'paginas',
      title: 'Números de Página',
      icon: '#️⃣',
      content: (
        <>
          <fieldset className="config-group">
            <legend>Mostrar</legend>
            <label className="checkbox-label">
              <input type="checkbox" checked={safeConfig.showPageNumbers} onChange={(e) => setConfig({ showPageNumbers: e.target.checked })} />
              Mostrar números de página
            </label>
          </fieldset>

          {safeConfig.showPageNumbers && (
            <>
              <fieldset className="config-group">
                <legend>Posición</legend>
                <select value={safeConfig.pageNumberPos} onChange={(e) => setConfig({ pageNumberPos: e.target.value })}>
                  <option value="top">Arriba</option>
                  <option value="bottom">Abajo</option>
                </select>
              </fieldset>

              <fieldset className="config-group">
                <legend>Alineación</legend>
                <select value={safeConfig.pageNumberAlign} onChange={(e) => setConfig({ pageNumberAlign: e.target.value })}>
                  <option value="left">Izquierda</option>
                  <option value="center">Centro</option>
                  <option value="right">Derecha</option>
                  <option value="outer">Exterior (alterno)</option>
                </select>
              </fieldset>
            </>
          )}
        </>
      )
    },
    {
      id: 'paginacion',
      title: 'Reglas de Paginación',
      icon: '📄',
      content: (
        <>
          <fieldset className="config-group">
            <legend>Páginas huérfanas (orphan)</legend>
            <div className="number-row">
              <label>Mín. líneas al final:</label>
              <input type="number" min="1" max="4" value={safeConfig.pagination.minOrphanLines} onChange={(e) => updatePagination('minOrphanLines', parseInt(e.target.value))} />
            </div>
          </fieldset>

          <fieldset className="config-group">
            <legend>Páginas viudas (widow)</legend>
            <div className="number-row">
              <label>Mín. líneas al inicio:</label>
              <input type="number" min="1" max="4" value={safeConfig.pagination.minWidowLines} onChange={(e) => updatePagination('minWidowLines', parseInt(e.target.value))} />
            </div>
          </fieldset>

          <fieldset className="config-group">
            <legend>Párrafos largos</legend>
            <label className="checkbox-label">
              <input type="checkbox" checked={safeConfig.pagination.splitLongParagraphs} onChange={(e) => updatePagination('splitLongParagraphs', e.target.checked)} />
              Dividir párrafos entre páginas
            </label>
          </fieldset>
        </>
      )
    }
  ];

  return (
    <aside className="sidebar sidebar-left" role="complementary" aria-label="Panel de estructura y configuración">
      <div className="sidebar-tabs">
        <button 
          className={`sidebar-tab ${activeTab === 'structure' ? 'active' : ''}`}
          onClick={() => setActiveTab('structure')}
          aria-selected={activeTab === 'structure'}
        >
          Estructura
        </button>
        <button 
          className={`sidebar-tab ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
          aria-selected={activeTab === 'config'}
        >
          Configuración
        </button>
      </div>

      {activeTab === 'structure' && (
        <section className="sidebar-section">
          <h2 className="sidebar-title">Estructura del Libro</h2>
          
          <div className="document-metadata">
            <label className="metadata-label">
              <span>Título del libro</span>
              <input 
                type="text" 
                value={safeBookData?.title || ''} 
                onChange={handleDocumentTitleChange}
                placeholder="Título de tu libro"
                className="metadata-input"
              />
            </label>
            <label className="metadata-label">
              <span>Autor</span>
              <input 
                type="text" 
                value={safeBookData?.author || ''} 
                onChange={handleDocumentAuthorChange}
                placeholder="Nombre del autor"
                className="metadata-input"
              />
            </label>
          </div>
          
          <div className="structure-controls">
            <button className="btn btn-small" onClick={handleAddChapter}>
              + Capítulo
            </button>
            <button className="btn btn-small btn-secondary" onClick={handleAddSection}>
              + Sección
            </button>
          </div>

          <nav className="structure-panel" aria-label="Estructura de capítulos">
            <div className="chapters-list">
              {safeBookData?.chapters?.length === 0 ? (
                <p className="empty-state">Sin capítulos cargados</p>
              ) : (
                safeBookData?.chapters?.map((chapter) => (
                  <div 
                    key={chapter.id}
                    className={`chapter-item ${editing?.activeChapterId === chapter.id ? 'active' : ''}`}
                    onClick={() => setActiveChapter(chapter.id)}
                  >
                    <div className="chapter-item-header">
                      <span className={`item-type-badge ${chapter.type === 'section' ? 'section-badge' : 'chapter-badge'}`}>
                        {chapter.type === 'section' ? 'Sección' : 'Cap.'}
                      </span>
                      <input 
                        className="chapter-item-title-input"
                        value={chapter.title}
                        onChange={(e) => handleTitleChange(chapter.id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onFocus={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.target.blur();
                          }
                        }}
                        onBlur={(e) => {
                          if (!e.target.value.trim()) {
                            handleTitleChange(chapter.id, 'Sin título');
                          }
                        }}
                      />
                      <button 
                        className="btn-delete-item" 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`¿Eliminar "${chapter.title}"?`)) {
                            deleteChapter(chapter.id);
                          }
                        }}
                        aria-label="Eliminar"
                      >
                        ✕
                      </button>
                    </div>
                    <span className="chapter-item-meta">{chapter.wordCount} palabras</span>
                  </div>
                ))
              )}
            </div>
          </nav>

          <div className="document-stats">
            <h3 className="stats-title">Estadísticas</h3>
            <dl className="stats-list">
              <dt>Capítulos:</dt>
              <dd>{stats.chapters}</dd>
              <dt>Palabras:</dt>
              <dd>{stats.words}</dd>
              <dt>Caracteres:</dt>
              <dd>{stats.characters}</dd>
              <dt>Páginas estimadas:</dt>
              <dd>{stats.pages}</dd>
              <dt>Tiempo de lectura:</dt>
              <dd>{stats.readingTime} min</dd>
            </dl>
          </div>
        </section>
      )}

      {activeTab === 'config' && (
        <section className="sidebar-section">
          <h2 className="sidebar-title">Configuración Editorial</h2>
          <Accordion items={accordionItems} defaultOpen="formato" />
        </section>
      )}
    </aside>
  );
}

export default SidebarLeft;
