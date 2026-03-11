import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { UserMenu } from '../Auth/UserMenu';
import './Header.css';

function Header({ 
  onNewProject, 
  onSaveProject, 
  onOpenProject,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  changeLog,
  showHistoryPanel,
  setShowHistoryPanel,
  onRestore,
  lastSaveTime
}) {
  const navigate = useNavigate();
  const { user, isAdmin, logOut } = useAuth();

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <header className="app-header" role="banner">
      <div className="header-content">
        <div className="header-brand" onClick={() => navigate('/home')} style={{ cursor: 'pointer' }}>
          <svg className="logo" width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M8 4h16v24H8z" fill="currentColor" />
          </svg>
          <h1 className="app-title">Editorial App</h1>
        </div>

        <nav className="header-nav" role="navigation" aria-label="Navegación principal">
          <div className="history-controls" style={{ display: 'flex', gap: '8px', marginRight: '20px', paddingRight: '20px', borderRight: '1px solid #e5e7eb' }}>
            <button 
              className="btn btn-icon" 
              onClick={onUndo} 
              disabled={!canUndo}
              title="Deshacer (Ctrl+Z)"
              aria-label="Deshacer"
              style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
              </svg>
              Deshacer
            </button>
            <button 
              className="btn btn-icon" 
              onClick={onRedo} 
              disabled={!canRedo}
              title="Rehacer (Ctrl+Shift+Z)"
              aria-label="Rehacer"
              style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/>
              </svg>
              Rehacer
            </button>
            <button 
              className="btn btn-icon" 
              onClick={() => setShowHistoryPanel(!showHistoryPanel)}
              title="Historial de cambios"
              aria-label="Ver historial"
              style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              Historial
            </button>
          </div>

          <button className="btn btn-secondary" onClick={() => navigate('/home')} aria-label="Ir a comunidad" style={{ fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            Comunidad
          </button>

          <button className="btn btn-primary" onClick={onNewProject} aria-label="Crear nuevo proyecto" style={{ fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Nuevo
          </button>
          <button 
            className={`btn ${lastSaveTime ? 'btn-success' : 'btn-secondary'}`} 
            onClick={onSaveProject} 
            aria-label="Guardar proyecto actual" 
            style={{ fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px', minWidth: '90px', justifyContent: 'center' }}
          >
            {lastSaveTime ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Guardado
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Guardar
              </>
            )}
          </button>
        </nav>

        {showHistoryPanel && (
          <div className="history-panel" style={{
            position: 'absolute',
            top: '60px',
            right: '200px',
            width: '320px',
            maxHeight: '400px',
            overflowY: 'auto',
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            padding: '12px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Historial de Cambios</h3>
              <button 
                onClick={() => setShowHistoryPanel(false)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px' }}
              >
                ×
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {changeLog && changeLog.length > 0 ? (
                [...changeLog].reverse().map((entry) => (
                  <div 
                    key={entry.id}
                    onClick={() => onRestore(entry.config)}
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      background: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      transition: 'background 0.2s'
                    }}
                    title="Click para restaurar esta versión"
                  >
                    <div style={{ fontSize: '12px', fontWeight: 500, color: '#1f2937' }}>
                      {entry.action}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                      {formatTime(entry.timestamp)}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: '12px', color: '#6b7280', textAlign: 'center', padding: '20px' }}>
                  No hay cambios registrados
                </div>
              )}
            </div>
          </div>
        )}

        <div className="header-actions">
          {user ? (
            <UserMenu user={user} isAdmin={isAdmin} onSignOut={logOut} />
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => navigate('/login')}
              aria-label="Iniciar sesión"
            >
              Iniciar sesión
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
