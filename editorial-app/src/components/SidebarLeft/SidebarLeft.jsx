import { useState } from 'react';
import useEditorStore from '../../store/useEditorStore';
import { KDP_STANDARDS } from '../../utils/kdpStandards';
import './SidebarLeft.css';

function SidebarLeft() {
  const [activeTab, setActiveTab] = useState('structure');
  
  const { 
    document, 
    config, 
    editing, 
    getStats,
    addChapter,
    addSection,
    deleteChapter,
    setActiveChapter,
    setConfig
  } = useEditorStore();
  
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
    
    setConfig({
      pageFormat: bookConfig.recommendedFormat,
      fontSize: bookConfig.fontSize,
      lineHeight: bookConfig.lineHeight
    });
  };

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
              {document.chapters.length === 0 ? (
                <p className="empty-state">Sin capítulos cargados</p>
              ) : (
                document.chapters.map((chapter) => (
                  <div 
                    key={chapter.id}
                    className={`chapter-item ${editing.activeChapterId === chapter.id ? 'active' : ''}`}
                    onClick={() => setActiveChapter(chapter.id)}
                  >
                    <div className="chapter-item-header">
                      <span className={`item-type-badge ${chapter.type === 'section' ? 'section-badge' : 'chapter-badge'}`}>
                        {chapter.type === 'section' ? 'Sección' : 'Cap.'}
                      </span>
                      <span className="chapter-item-title">{chapter.title}</span>
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
          
          <fieldset className="config-group">
            <legend>Tipo de libro</legend>
            <select 
              value={document.bookType} 
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

          <fieldset className="config-group">
            <legend>Formato de página</legend>
            <select 
              value={config.pageFormat} 
              onChange={(e) => setConfig({ pageFormat: e.target.value })}
              aria-label="Seleccionar formato de página"
            >
              <option value="a5">A5 (14.8 × 21 cm)</option>
              <option value="a4">A4 (21 × 29.7 cm)</option>
              <option value="letter">Letter (8.5 × 11 in)</option>
              <option value="5x8">5 × 8 inches</option>
              <option value="6x9">6 × 9 inches</option>
            </select>
          </fieldset>

          <fieldset className="config-group">
            <legend>Tamaño de fuente (pt)</legend>
            <input 
              type="number" 
              min="10" 
              max="16" 
              value={config.fontSize}
              onChange={(e) => setConfig({ fontSize: parseInt(e.target.value) })}
              aria-label="Tamaño base de fuente"
            />
          </fieldset>

          <fieldset className="config-group">
            <legend>Interlineado</legend>
            <select 
              value={config.lineHeight}
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

          <fieldset className="config-group">
            <legend>Opciones de composición</legend>
            
            <label className="checkbox-label">
              <input 
                type="checkbox" 
                checked={config.chaptersOnRight}
                onChange={(e) => setConfig({ chaptersOnRight: e.target.checked })}
              />
              Iniciar capítulos en página derecha
            </label>

            <label className="checkbox-label">
              <input 
                type="checkbox" 
                checked={config.showPageNumbers}
                onChange={(e) => setConfig({ showPageNumbers: e.target.checked })}
              />
              Mostrar números de página
            </label>
          </fieldset>
        </section>
      )}
    </aside>
  );
}

export default SidebarLeft;
