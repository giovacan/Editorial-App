import { useState, memo } from 'react';
import useEditorStore from '../../store/useEditorStore';
import Preview from '../Preview/Preview';
import './SidebarRight.css';

function SidebarRight({ onExportPdf, onExportEpub, onExportHtml }) {
  const [activeTab, setActiveTab] = useState('preview');
  const chapters = useEditorStore((state) => state.bookData?.chapters);
  
  const safeChapters = chapters || [];

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
        <section className="sidebar-section preview-section">
          {safeChapters?.length === 0 ? (
            <div className="preview-placeholder">
              <p>Sube contenido para ver la vista previa</p>
            </div>
          ) : (
            <Preview />
          )}
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
                disabled={safeChapters?.length === 0}
              >
                📄 PDF (Impresión)
              </button>
              
              <button 
                className="btn btn-secondary btn-block" 
                onClick={onExportEpub}
                disabled={safeChapters?.length === 0}
              >
                📚 EPUB (E-reader)
              </button>
              
              <button 
                className="btn btn-secondary btn-block" 
                onClick={onExportHtml}
                disabled={safeChapters?.length === 0}
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

export default memo(SidebarRight);
