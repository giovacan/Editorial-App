import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export function StoreHeader({ 
  searchQuery, 
  onSearchChange,
  onSearch,
  cartCount = 0,
  favoritesCount = 0,
  user,
  onSignInClick,
  onGoogleSignIn
}) {
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
      setShowUserMenu(false);
      navigate('/home');
    } catch (err) {
      console.error('Error signing out:', err);
    }
  };

  const suggestions = [
    'El arte de escribir',
    'Misterio en la montaña',
    'Manual de cocina',
    'Cuentos infantiles',
    'Finanzas personales',
    'Yoga para principiantes',
    'Aprende programación',
    'Ciencia ficción',
  ].filter(s => (searchQuery || '').toLowerCase().includes((searchQuery || '').toLowerCase()));

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setShowSearchSuggestions(false);
      if (onSearch) onSearch();
    }
  };

  return (
    <header style={styles.header}>
      <div style={styles.container}>
        <div style={styles.left}>
          <Link to="/home" style={styles.logo}>
            <span style={styles.logoText}>BookHub</span>
          </Link>
          
          <nav style={styles.nav}>
            <Link to="/home" style={{...styles.navLink, ...styles.navLinkActive}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 0 1-8 0"/>
              </svg>
              Tienda
            </Link>
          </nav>
        </div>

        <div style={styles.center}>
          <form onSubmit={handleSearch} style={styles.searchForm}>
            <div style={styles.searchContainer}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '10px'}}>
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  onSearchChange(e.target.value);
                  setShowSearchSuggestions(true);
                }}
                onFocus={() => setShowSearchSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSearchSuggestions(false), 200)}
                placeholder="Buscar libros, autores, categorías..."
                style={styles.searchInput}
              />
              {searchQuery && (
                <button 
                  type="button"
                onClick={() => onSearchChange('')}
                style={styles.clearSearch}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
              )}
              <button type="submit" style={styles.searchBtn}>
                Buscar
              </button>
            </div>
            
            {showSearchSuggestions && suggestions.length > 0 && (
              <div style={styles.suggestions}>
                {suggestions.map((suggestion, i) => (
                  <button
                    key={i}
                    type="button"
                    style={styles.suggestionItem}
                    onClick={() => {
                      onSearchChange(suggestion);
                      setShowSearchSuggestions(false);
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </form>
        </div>

        <div style={styles.right}>
          <button style={styles.iconBtn} title="Favoritos">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
            {favoritesCount > 0 && (
              <span style={styles.badge}>{favoritesCount}</span>
            )}
          </button>
          
          <button style={styles.iconBtn} title="Carrito">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1"></circle>
              <circle cx="20" cy="21" r="1"></circle>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>
            {cartCount > 0 && (
              <span style={styles.badge}>{cartCount}</span>
            )}
          </button>

          {user ? (
            <div style={styles.userMenuContainer}>
              <button 
                style={styles.userBtn}
                onClick={() => setShowUserMenu(!showUserMenu)}
              >
                <img 
                  src={user.photoURL || 'https://via.placeholder.com/32'} 
                  alt={user.displayName}
                  style={styles.userAvatar}
                />
                <span style={styles.userName}>{user.displayName?.split(' ')[0]}</span>
                <span style={styles.dropdownArrow}>▼</span>
              </button>
              
              {showUserMenu && (
                <div style={styles.dropdownMenu}>
                  <div style={styles.dropdownHeader}>
                    <img 
                      src={user.photoURL || 'https://via.placeholder.com/40'} 
                      alt={user.displayName}
                      style={styles.dropdownAvatar}
                    />
                    <div>
                      <div style={styles.dropdownName}>{user.displayName}</div>
                      <div style={styles.dropdownEmail}>{user.email}</div>
                    </div>
                  </div>
                  <div style={styles.dropdownDivider} />
                  <Link to="/books" style={styles.dropdownItem} onClick={() => setShowUserMenu(false)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                    Mis Libros
                  </Link>
                  <Link to="/app" style={styles.dropdownItem} onClick={() => setShowUserMenu(false)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
                    Ir al Editor
                  </Link>
                  <div style={styles.dropdownDivider} />
                  <button style={styles.dropdownItem} onClick={handleSignOut}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={styles.authBtns}>
              <Link to="/app" style={styles.editorBtn}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19l7-7 3 3-7 7-3-3z"/>
                  <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                  <path d="M2 2l7.586 7.586"/>
                  <circle cx="11" cy="11" r="2"/>
                </svg>
                Editor
              </Link>
              <button onClick={onSignInClick} style={styles.signInBtn}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                  <polyline points="10 17 15 12 10 7"/>
                  <line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
                Iniciar sesión
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={styles.trustBar}>
        <div style={styles.trustItem}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Compra 100% segura
        </div>
        <div style={styles.trustItem}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
          Envío instantáneo
        </div>
        <div style={styles.trustItem}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
          Todos los métodos de pago
        </div>
        <div style={styles.trustItem}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Datos protegidos
        </div>
      </div>
    </header>
  );
}

const styles = {
  header: {
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #f0f0f0',
    position: 'sticky',
    top: 0,
    zIndex: 1000,
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  container: {
    width: '100%',
    padding: '12px 32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '24px',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '32px',
    flex: '0 0 auto',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    textDecoration: 'none',
  },
  logoText: {
    fontSize: '24px',
    fontWeight: '800',
    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    letterSpacing: '-0.5px',
  },
  nav: {
    display: 'flex',
    gap: '8px',
  },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    textDecoration: 'none',
    color: '#4b5563',
    fontSize: '14px',
    fontWeight: '500',
    padding: '8px 16px',
    borderRadius: '8px',
    transition: 'all 0.2s',
  },
  navLinkActive: {
    backgroundColor: '#f3f4f6',
    color: '#1e293b',
    fontWeight: '600',
  },
  center: {
    flex: 1,
    maxWidth: '700px',
    width: '100%',
  },
  searchForm: {
    position: 'relative',
  },
  searchContainer: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: '12px',
    padding: '4px 4px 4px 16px',
    border: '1px solid #e5e7eb',
    transition: 'all 0.2s',
    width: '100%',
  },
  searchInput: {
    flex: 1,
    border: 'none',
    background: 'transparent',
    fontSize: '14px',
    outline: 'none',
    padding: '10px 0',
  },
  clearSearch: {
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
    padding: '4px 8px',
    fontSize: '12px',
  },
  searchBtn: {
    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'transform 0.2s',
  },
  suggestions: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
    marginTop: '8px',
    overflow: 'hidden',
    zIndex: 100,
    border: '1px solid #f0f0f0',
  },
  suggestionItem: {
    width: '100%',
    textAlign: 'left',
    background: 'none',
    border: 'none',
    padding: '12px 16px',
    fontSize: '14px',
    color: '#4b5563',
    cursor: 'pointer',
    transition: 'background 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flexShrink: 0,
  },
  iconBtn: {
    position: 'relative',
    background: 'none',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '8px',
    borderRadius: '8px',
    transition: 'background 0.2s',
  },
  badge: {
    position: 'absolute',
    top: '0',
    right: '0',
    backgroundColor: '#ef4444',
    color: 'white',
    fontSize: '10px',
    fontWeight: '700',
    padding: '2px 6px',
    borderRadius: '10px',
    minWidth: '18px',
    textAlign: 'center',
  },
  userMenuContainer: {
    position: 'relative',
  },
  userBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    borderRadius: '10px',
    backgroundColor: '#f3f4f6',
    border: 'none',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  userAvatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  userName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1e293b',
  },
  dropdownArrow: {
    fontSize: '10px',
    color: '#9ca3af',
    marginLeft: '4px',
  },
  dropdownMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '8px',
    width: '240px',
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
    border: '1px solid #f0f0f0',
    overflow: 'hidden',
    zIndex: 1000,
  },
  dropdownHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    backgroundColor: '#f9fafb',
  },
  dropdownAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  dropdownName: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#1e293b',
  },
  dropdownEmail: {
    fontSize: '12px',
    color: '#9ca3af',
  },
  dropdownDivider: {
    height: '1px',
    backgroundColor: '#f0f0f0',
  },
  dropdownItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    padding: '12px 16px',
    fontSize: '14px',
    color: '#4b5563',
    textDecoration: 'none',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    transition: 'background 0.2s',
    textAlign: 'left',
  },
  authBtns: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  signInBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: '#3b82f6',
    color: 'white',
    borderRadius: '10px',
    border: 'none',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  editorBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: '#10b981',
    color: 'white',
    borderRadius: '10px',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '600',
    transition: 'all 0.2s',
  },
  googleBtn: {
    backgroundColor: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  trustBar: {
    display: 'flex',
    justifyContent: 'space-around',
    gap: '16px',
    padding: '10px 32px',
    backgroundColor: '#f9fafb',
    borderTop: '1px solid #f0f0f0',
  },
  trustItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: '#6b7280',
    fontWeight: '500',
  },
};

export default StoreHeader;
