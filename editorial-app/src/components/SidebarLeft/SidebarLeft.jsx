import { useState } from 'react';
import useEditorStore from '../../store/useEditorStore';
import { KDP_STANDARDS } from '../../utils/kdpStandards';
import './SidebarLeft.css';

function SidebarLeft() {
  const [activeTab, setActiveTab] = useState('structure');
  
  const { 
    bookData, 
    config, 
    editing, 
    getStats,
    addChapter,
    addSection,
    deleteChapter,
    setActiveChapter,
    setConfig,
    setBookData,
    updateChapter
  } = useEditorStore();
  
  const safeBookData = bookData || { title: '', author: '', chapters: [], bookType: 'novela' };
  const safeConfig = config || { pageFormat: 'a5', fontSize: 12, lineHeight: 1.6, chaptersOnRight: true, showPageNumbers: true, pageNumberPos: 'bottom', pageNumberAlign: 'center', showHeaders: false, headerContent: 'both', headerPosition: 'top', headerLine: true };
  
  const stats = getStats();

  const handleAddChapter = () => {
    const title = prompt('Título del capítulo:');
    if (title) {
      addChapter(title);
    }
  };

  const handleAddSection = () => {
    const title = prompt('Nombre de la sección (ej: Prólogo, Dedicatoria):');
    if (title) {
      addSection(title);
    }
  };

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

  return (
    <aside className="sidebar sidebar-left" role="complementary" aria-label="Panel de estructura y safeConfiguración">
      <div className="sidebar-tabs">
        <button 
          className={`sidebar-tab ${activeTab === 'structure' ? 'active' : ''}`}
          onClick={() => setActiveTab('structure')}
          aria-selected={activeTab === 'structure'}
        >
          Estructura
        </button>
        <button 
          className={`sidebar-tab ${activeTab === 'safeConfig' ? 'active' : ''}`}
          onClick={() => setActiveTab('safeConfig')}
          aria-selected={activeTab === 'safeConfig'}
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

      {activeTab === 'safeConfig' && (
        <section className="sidebar-section">
          <h2 className="sidebar-title">Configuración Editorial</h2>
          
          <fieldset className="safeConfig-group">
            <legend>Tipo de libro</legend>
            <select 
              value={safeBookData?.bookType || 'novela'} 
              onChange={handleBookTypeChange}
              aria-label="Seleccionar tipo de libro"
            >
              <option value="novela">Novela / Ficción</option>
              <option value="ensayo">Ensayo / No ficción</option>
              <option value="poesia">Poesía</option>
              <option value="manual">Manual / Técnico</option>
              <option value="infantil">Libro Infantil</option>
            </select>
          </fieldset>

          <fieldset className="safeConfig-group">
            <legend>Formato de página</legend>
            <select 
              value={safeConfig.pageFormat} 
              onChange={(e) => setConfig({ pageFormat: e.target.value })}
              aria-label="Seleccionar formato de página"
            >
              <option value="a5">A5 (14.8 × 21 cm)</option>
              <option value="a4">A4 (21 × 29.7 cm)</option>
              <option value="letter">Letter (8.5 × 11 in)</option>
              <option value="5x8">5 × 8 inches</option>
              <option value="6x9">6 × 9 inches</option>
              <option value="8x10">8 × 10 inches</option>
            </select>
          </fieldset>

          <fieldset className="safeConfig-group">
            <legend>Tipografía</legend>
            <select 
              value={safeConfig.fontFamily} 
              onChange={(e) => setConfig({ fontFamily: e.target.value })}
              aria-label="Seleccionar tipografía"
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

          <fieldset className="safeConfig-group">
            <legend>Tamaño de fuente (pt)</legend>
            <input 
              type="number" 
              min="10" 
              max="16" 
              value={safeConfig.fontSize}
              onChange={(e) => setConfig({ fontSize: parseInt(e.target.value) })}
              aria-label="Tamaño base de fuente"
            />
          </fieldset>

          <fieldset className="safeConfig-group">
            <legend>Interlineado</legend>
            <select 
              value={safeConfig.lineHeight}
              onChange={(e) => setConfig({ lineHeight: parseFloat(e.target.value) })}
              aria-label="Seleccionar interlineado"
            >
              <option value="1.4">1.4 (Apretado)</option>
              <option value="1.5">1.5</option>
              <option value="1.6">1.6 (Recomendado)</option>
              <option value="1.8">1.8 (Espaciado)</option>
              <option value="2.0">2.0 (Doble)</option>
            </select>
          </fieldset>

          <fieldset className="safeConfig-group">
            <legend>Opciones de composición</legend>
            
            <label className="checkbox-label">
              <input 
                type="checkbox" 
                checked={safeConfig.chaptersOnRight}
                onChange={(e) => setConfig({ chaptersOnRight: e.target.checked })}
              />
              Iniciar capítulos en página derecha
            </label>

            <label className="checkbox-label">
              <input 
                type="checkbox" 
                checked={safeConfig.showPageNumbers}
                onChange={(e) => setConfig({ showPageNumbers: e.target.checked })}
              />
              Mostrar números de página
            </label>
          </fieldset>

          <fieldset className="safeConfig-group">
            <legend>Encabezados (Headers)</legend>
            
            <label className="checkbox-label">
              <input 
                type="checkbox" 
                checked={safeConfig.showHeaders}
                onChange={(e) => setConfig({ showHeaders: e.target.checked })}
              />
              Mostrar encabezados
            </label>

            {safeConfig.showHeaders && (
              <>
                <label className="select-label">
                  Contenido del header:
                  <select 
                    value={safeConfig.headerContent}
                    onChange={(e) => setConfig({ headerContent: e.target.value })}
                  >
                    <option value="title">Título del libro</option>
                    <option value="chapter">Título del capítulo</option>
                    <option value="both">Alternar (libro/capítulo)</option>
                  </select>
                </label>

                <label className="select-label">
                  Posición:
                  <select 
                    value={safeConfig.headerPosition}
                    onChange={(e) => setConfig({ headerPosition: e.target.value })}
                  >
                    <option value="top">Arriba</option>
                    <option value="bottom">Abajo</option>
                  </select>
                </label>

                <label className="checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={safeConfig.headerLine}
                    onChange={(e) => setConfig({ headerLine: e.target.checked })}
                  />
                  Mostrar línea divisoria
                </label>
              </>
            )}
          </fieldset>

          <fieldset className="safeConfig-group">
            <legend>Números de página</legend>
            
            <label className="select-label">
              Posición:
              <select 
                value={safeConfig.pageNumberPos}
                onChange={(e) => setConfig({ pageNumberPos: e.target.value })}
              >
                <option value="top">Arriba</option>
                <option value="bottom">Abajo</option>
              </select>
            </label>

            <label className="select-label">
              Alineación:
              <select 
                value={safeConfig.pageNumberAlign}
                onChange={(e) => setConfig({ pageNumberAlign: e.target.value })}
              >
                <option value="left">Izquierda</option>
                <option value="center">Centro</option>
                <option value="right">Derecha</option>
                <option value="outer">Exterior (alterno)</option>
              </select>
            </label>
          </fieldset>
        </section>
      )}
    </aside>
  );
}

export default SidebarLeft;
