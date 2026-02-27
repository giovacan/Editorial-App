import { useState } from 'react';
import { useNavigate, Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleLogout = async () => {
    await logOut();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;

  const navItems = [
    { path: '/admin/config', label: 'Configuración', icon: '⚙️' },
    { path: '/admin/users', label: 'Usuarios', icon: '👥' },
    { path: '/admin/plans', label: 'Planes', icon: '💳' },
    { path: '/admin/stats', label: 'Estadísticas', icon: '📊' },
  ];

  return (
    <div style={styles.container}>
      {/* Sidebar */}
      <aside style={{ ...styles.sidebar, width: sidebarOpen ? '250px' : '0' }}>
        <div style={styles.sidebarContent}>
          <div style={styles.sidebarHeader}>
            <h2 style={styles.sidebarTitle}>Admin Panel</h2>
          </div>

          <nav style={styles.sidebarNav}>
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  ...styles.navItem,
                  ...(isActive(item.path) ? styles.navItemActive : {}),
                }}
              >
                <span style={styles.navIcon}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          <button
            onClick={handleLogout}
            style={styles.logoutButton}
          >
            🚪 Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={styles.main}>
        {/* Header */}
        <header style={styles.header}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={styles.toggleButton}
          >
            ☰
          </button>
          <h1 style={styles.headerTitle}>Panel de Administración</h1>
          <Link to="/app" style={styles.backButton}>
            ← Volver al Editor
          </Link>
        </header>

        {/* Content area */}
        <div style={styles.content}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    height: '100vh',
    backgroundColor: '#f9fafb',
  },
  sidebar: {
    backgroundColor: '#1f2937',
    color: 'white',
    overflowY: 'auto',
    transition: 'width 0.3s',
    borderRight: '1px solid #374151',
    display: 'flex',
    flexDirection: 'column',
  },
  sidebarContent: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  sidebarHeader: {
    padding: '20px',
    borderBottom: '1px solid #374151',
  },
  sidebarTitle: {
    margin: '0',
    fontSize: '18px',
    fontWeight: '600',
  },
  sidebarNav: {
    flex: '1',
    padding: '20px 0',
    display: 'flex',
    flexDirection: 'column',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 20px',
    color: '#d1d5db',
    textDecoration: 'none',
    transition: 'background-color 0.2s',
    fontSize: '14px',
    gap: '10px',
  },
  navItemActive: {
    backgroundColor: '#3b82f6',
    color: 'white',
    borderLeft: '3px solid #60a5fa',
  },
  navIcon: {
    fontSize: '18px',
  },
  logoutButton: {
    margin: '20px',
    padding: '10px',
    backgroundColor: '#7f1d1d',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
  main: {
    flex: '1',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    padding: '20px',
    backgroundColor: 'white',
    borderBottom: '1px solid #e5e7eb',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },
  toggleButton: {
    padding: '8px 12px',
    backgroundColor: 'transparent',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '18px',
  },
  headerTitle: {
    flex: '1',
    margin: '0',
    fontSize: '24px',
    fontWeight: '600',
    color: '#1f2937',
  },
  backButton: {
    padding: '8px 12px',
    backgroundColor: '#3b82f6',
    color: 'white',
    textDecoration: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
  },
  content: {
    flex: '1',
    overflowY: 'auto',
    padding: '20px',
  },
};
