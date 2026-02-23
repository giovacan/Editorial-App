import { useState } from 'react';
import useEditorStore from '../../store/useEditorStore';
import './SidebarRight.css';

function SidebarRight({ onExportPdf, onExportEpub, onExportHtml }) {
  const [activeTab, setActiveTab] = useState('preview');
  const { ui, setUi, document } = useEditorStore();

  return (
    <aside className="sidebar sidebar-right" role="complementary" aria-label="Panel de vista previa y exportación">
      <div className="sidebar-tabs">
        <button 
          className={`sidebar-tab ${activeTab === 'preview' ? 'active' : ''}`}
          onClick={() => setActiveTab('preview')}
          aria-selected={activeTab === 'preview'}
        >
          Vista previa
        </button>
        <button 
          className={`sidebar-tab ${activeTab === 'export' ? 'active' : ''}`}
          onClick={() => setActiveTab('export')}
          aria-selected={activeTab === 'export'}
        >
          Exportar
        </button>
      </div>

      {activeTab === 'preview' && (
        <section className="sidebar-section">
          <h2 className="sidebar-title">Vista Previa del Libro</h2>
          
          <div className="preview-controls">
            <button 
              className="btn btn-secondary btn-small" 
              onClick={() => setUi({ showPreview: !ui.showPreview })}
            >
              {ui.showPreview ? '👁 Ocultar preview' : '👁 Mostrar preview'}
            </button>
            <select className="preview-zoom" aria-label="Nivel de zoom">
              <option value="40">40%</option>
              <option value="50" selected>50%</option>
              <option value="75">75%</option>
              <option value="100">100%</option>
            </select>
          </div>

          <div className={`preview-container ${ui.showPreview ? '' : 'hidden'}`} role="region" aria-label="Vista previa del libro">
            <div className="preview-content">
              {document.chapters.length === 0 ? (
                <div className="preview-placeholder">
                  <p>Procesa un documento para ver la vista previa aquí</p>
                </div>
              ) : (
                <div className="preview-page">
                  <p>Selecciona un capítulo para ver la vista previa</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'export' && (
        <section className="sidebar-section">
          <h2 className="sidebar-title">Exportar Libro</h2>
          
          <div className="export-section">
            <h3>Descargar como</h3>
            
            <div className="export-buttons">
              <button 
                className="btn btn-secondary btn-block" 
                onClick={onExportPdf}
                disabled={document.chapters.length === 0}
              >
                📄 PDF (Impresión)
              </button>
              
              <button 
                className="btn btn-secondary btn-block" 
                onClick={onExportEpub}
                disabled={document.chapters.length === 0}
              >
                📚 EPUB (E-reader)
              </button>
              
              <button 
                className="btn btn-secondary btn-block" 
                onClick={onExportHtml}
                disabled={document.chapters.length === 0}
              >
                🌐 HTML (Web)
              </button>
            </div>
          </div>

          <div className="export-section">
            <h3>Opciones de exportación</h3>
            
            <label className="checkbox-label">
              <input type="checkbox" defaultChecked />
              Incluir tabla de contenidos
            </label>

            <label className="checkbox-label">
              <input type="checkbox" defaultChecked />
              Incluir metadatos
            </label>

            <label className="checkbox-label">
              <input type="checkbox" defaultChecked />
              Comprimir archivo (EPUB)
            </label>
          </div>
        </section>
      )}
    </aside>
  );
}

export default SidebarRight;
