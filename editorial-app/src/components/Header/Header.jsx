import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { UserMenu } from '../Auth/UserMenu';
import './Header.css';

function Header({ onNewProject, onSaveProject, onOpenProject }) {
  const navigate = useNavigate();
  const { user, isAdmin, logOut } = useAuth();

  return (
    <header className="app-header" role="banner">
      <div className="header-content">
        <div className="header-brand">
          <svg className="logo" width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M8 4h16v24H8z" fill="currentColor" />
          </svg>
          <h1 className="app-title">Editorial App</h1>
        </div>

        <nav className="header-nav" role="navigation" aria-label="Navegación principal">
          <button className="btn btn-secondary" onClick={() => navigate('/books')} aria-label="Ver mis libros">
            Mis Libros
          </button>
          <button className="btn btn-primary" onClick={onNewProject} aria-label="Crear nuevo proyecto">
            + Nuevo
          </button>
          <button className="btn btn-secondary" onClick={onOpenProject} aria-label="Abrir proyecto existente">
            Abrir
          </button>
          <button className="btn btn-secondary" onClick={onSaveProject} aria-label="Guardar proyecto actual">
            Guardar
          </button>
        </nav>

        <div className="header-actions">
          <button className="btn btn-icon" aria-label="Configuración">
            ⚙
          </button>
          <button className="btn btn-icon" aria-label="Ayuda">
            ?
          </button>

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
