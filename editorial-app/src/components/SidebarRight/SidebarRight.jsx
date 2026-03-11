import { useState, memo } from 'react';
import useEditorStore from '../../store/useEditorStore';
import Preview from '../Preview/Preview';
import PaginationProgressBar from '../PaginationProgressBar/PaginationProgressBar';
import './SidebarRight.css';

function SidebarRight({ onExportPdf, onExportEpub, onExportHtml }) {
  const [activeTab, setActiveTab] = useState('preview');
  const chapters = useEditorStore((state) => state.bookData?.chapters);
  const paginationProgress = useEditorStore((s) => s.paginationProgress);
  const isPaginationRunning = paginationProgress > 0 && paginationProgress < 100;
  
  const safeChapters = chapters || [];

  return (
    <aside className="sidebar sidebar-right" role="complementary" aria-label="Panel de vista previa y exportación">
      <div className="sidebar-tabs">
        <button 
          className={`sidebar-tab ${activeTab === 'preview' ? 'active' : ''}`}
          onClick={() => setActiveTab('preview')}
          aria-selected={activeTab === 'preview'}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
          Vista previa
        </button>
        <button 
          className={`sidebar-tab ${activeTab === 'export' ? 'active' : ''}`}
          onClick={() => setActiveTab('export')}
          aria-selected={activeTab === 'export'}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
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
            <>
              {/* Barra de progreso de paginación en SidebarRight */}
              <PaginationProgressBar 
                progress={paginationProgress}
                isVisible={isPaginationRunning}
                compact={true}
              />
              <Preview />
            </>
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
                style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-start', padding: '10px 12px' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                </svg>
                PDF (Impresión)
              </button>
              
              <button 
                className="btn btn-secondary btn-block" 
                onClick={onExportEpub}
                disabled={safeChapters?.length === 0}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-start', padding: '10px 12px' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                </svg>
                EPUB (E-reader)
              </button>
              
              <button 
                className="btn btn-secondary btn-block" 
                onClick={onExportHtml}
                disabled={safeChapters?.length === 0}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-start', padding: '10px 12px' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                HTML (Web)
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
