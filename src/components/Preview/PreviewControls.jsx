import useEditorStore from '../../store/useEditorStore';

function PreviewControls({
  currentPage,
  totalPages,
  goToPage,
  goToNextPage,
  goToPrevPage,
  goToFirstPage,
  goToLastPage,
  magnifierZoom,
  setMagnifierZoom,
  showDebugPanel,
  setShowDebugPanel
}) {
  const handleEditClick = () => {
    const state = useEditorStore.getState();
    const firstChapterId = state.bookData?.chapters?.[0]?.id;
    useEditorStore.setState((s) => ({
      ui: { ...s.ui, showUpload: false, showPreview: false },
      editing: {
        ...s.editing,
        activeChapterId: firstChapterId || s.editing.activeChapterId
      }
    }));
  };

  return (
    <div className="preview-controls">
      <div className="preview-edit-button" style={{ flex: '1 1 100%', padding: '6px 0' }}>
        <button
          onClick={handleEditClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            width: '100%',
            padding: '10px 16px',
            background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)'; }}
          onMouseOut={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'; }}
          title="Abrir editor de texto"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Editar
        </button>
      </div>

      <div className="preview-controls-left">
        <button className="btn btn-icon" onClick={goToFirstPage} disabled={currentPage === 0} title="Primera página">«</button>
        <button className="btn btn-icon" onClick={goToPrevPage} disabled={currentPage === 0} title="Página anterior">←</button>
        <span className="page-info">
          <input
            type="number"
            min="1"
            max={totalPages}
            value={currentPage + 1}
            onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
            className="page-input"
          />
          / {totalPages}
        </span>
        <button className="btn btn-icon" onClick={goToNextPage} disabled={currentPage >= totalPages - 1} title="Página siguiente">→</button>
        <button className="btn btn-icon" onClick={goToLastPage} disabled={currentPage >= totalPages - 1} title="Última página">»</button>
      </div>

      <div className="preview-controls-right">
        {[150, 200, 250, 300].map(zoom => (
          <button
            key={zoom}
            className={`zoom-btn ${magnifierZoom === zoom ? 'active' : ''}`}
            onClick={() => setMagnifierZoom(zoom)}
            title={`Zoom ${zoom}%`}
          >
            {zoom}%
          </button>
        ))}
        <button
          className={`zoom-btn ${showDebugPanel ? 'active' : ''}`}
          onClick={() => setShowDebugPanel(!showDebugPanel)}
          title="Modo Developer"
          style={{ fontSize: '12px', padding: '4px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

export default PreviewControls;
