import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getRecentBooks, removeRecentBook } from '../utils/recentBooks';
import { getCommunityBooks } from '../data/communityBooks';

export function HomePage() {
  const navigate = useNavigate();
  const { user, signIn, signInGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recentBooks, setRecentBooks] = useState([]);
  const [communityBooks, setCommunityBooks] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    setRecentBooks(getRecentBooks());
    setCommunityBooks(getCommunityBooks());
  }, []);

  useEffect(() => {
    const filtered = selectedCategory === 'all' 
      ? getCommunityBooks() 
      : getCommunityBooks().filter(book => book.category === selectedCategory);
    setCommunityBooks(filtered);
  }, [selectedCategory]);

  const handleRemoveRecent = (bookId, e) => {
    e.stopPropagation();
    if (window.confirm('¿Eliminar de recientes?')) {
      const updated = removeRecentBook(bookId);
      setRecentBooks(updated);
    }
  };

  const handleOpenRecent = (book) => {
    navigate(`/app?bookId=${book.id}`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
      navigate('/books');
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      await signInGoogle();
      navigate('/books');
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión con Google');
    } finally {
      setLoading(false);
    }
  };

  const categories = [
    { id: 'all', label: 'Todos' },
    { id: 'novela', label: 'Novela' },
    { id: 'ensayo', label: 'Ensayo' },
    { id: 'poesia', label: 'Poesía' },
    { id: 'manual', label: 'Manual' },
    { id: 'infantil', label: 'Infantil' },
  ];

  return (
    <div style={styles.page}>
      {/* HEADER */}
      <header style={styles.header}>
        <div style={styles.headerBrand}>
          <span style={styles.logo}>📖</span>
          <span style={styles.brandName}>Editorial App</span>
        </div>
        <nav style={styles.headerNav}>
          <Link to="/app" style={styles.navLink}>Editor</Link>
          <Link to="/pricing" style={styles.navLink}>Precios</Link>
          {user ? (
            <Link to="/books" style={styles.btnPrimary}>Mis Libros</Link>
          ) : (
            <button onClick={() => document.getElementById('auth-section')?.scrollIntoView({ behavior: 'smooth' })} style={styles.btnSecondary}>Iniciar Sesión</button>
          )}
        </nav>
      </header>

      {/* HERO */}
      <section style={styles.hero}>
        <h1 style={styles.heroTitle}>Crea libros profesionales para KDP</h1>
        <p style={styles.heroSubtitle}>Editor de libros con paginación automática, exportación PDF y más</p>
        <div style={styles.heroButtons}>
          <Link to="/app" style={styles.heroBtnPrimary}>Empezar Gratis</Link>
          <Link to="/pricing" style={styles.heroBtnSecondary}>Ver Precios</Link>
        </div>
      </section>

      {/* ÚLTIMOS EDITADOS */}
      {recentBooks.length > 0 && (
        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Tus Últimos Editados</h2>
            <Link to="/books" style={styles.seeAllLink}>Ver todos →</Link>
          </div>
          <div style={styles.bookGrid}>
            {recentBooks.slice(0, 6).map(book => (
              <div key={book.id} style={styles.bookCard} onClick={() => handleOpenRecent(book)}>
                <div style={styles.bookCover}>
                  {book.cover ? (
                    <img src={book.cover} alt={book.title} style={styles.bookCoverImg} />
                  ) : (
                    <div style={styles.bookCoverPlaceholder}>📖</div>
                  )}
                </div>
                <div style={styles.bookInfo}>
                  <h3 style={styles.bookTitle}>{book.title}</h3>
                  <p style={styles.bookAuthor}>{book.author || 'Sin autor'}</p>
                  <div style={styles.bookActions}>
                    <button 
                      style={styles.openBtn}
                      onClick={(e) => { e.stopPropagation(); handleOpenRecent(book); }}
                    >
                      Abrir
                    </button>
                    <button 
                      style={styles.removeBtn}
                      onClick={(e) => handleRemoveRecent(book.id, e)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* LIBROS DE LA COMUNIDAD */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Libros de la Comunidad</h2>
        </div>
        
        <div style={styles.categoryTabs}>
          {categories.map(cat => (
            <button
              key={cat.id}
              style={{
                ...styles.categoryTab,
                ...(selectedCategory === cat.id ? styles.categoryTabActive : {})
              }}
              onClick={() => setSelectedCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div style={styles.bookGrid}>
          {communityBooks.map(book => (
            <div key={book.id} style={styles.bookCard}>
              <div style={styles.bookCover}>
                {book.cover ? (
                  <img src={book.cover} alt={book.title} style={styles.bookCoverImg} />
                ) : (
                  <div style={styles.bookCoverPlaceholder}>📖</div>
                )}
                <div style={styles.priceTag}>${book.price}</div>
              </div>
              <div style={styles.bookInfo}>
                <h3 style={styles.bookTitle}>{book.title}</h3>
                <p style={styles.bookAuthor}>{book.author}</p>
                <p style={styles.bookDescription}>{book.description}</p>
                <div style={styles.bookMeta}>
                  <span>⭐ {book.rating}</span>
                  <span>📥 {book.downloads}</span>
                </div>
                <button style={styles.buyBtn}>Comprar</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* AUTH SECTION */}
      {!user && (
        <section id="auth-section" style={styles.authSection}>
          <div style={styles.authCard}>
            <h2 style={styles.authTitle}>Inicia sesión</h2>
            {error && <div style={styles.error}>{error}</div>}
            
            <form onSubmit={handleSubmit} style={styles.form}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                style={styles.input}
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={styles.input}
              />
              <button type="submit" disabled={loading} style={styles.submitBtn}>
                {loading ? 'Iniciando...' : 'Iniciar sesión'}
              </button>
            </form>

            <div style={styles.divider}>O</div>

            <button onClick={handleGoogleSignIn} disabled={loading} style={styles.googleBtn}>
              🔐 Entrar con Google
            </button>

            <p style={styles.footer}>
              ¿No tienes cuenta? <Link to="/register" style={styles.link}>Regístrate</Link>
            </p>
          </div>
        </section>
      )}

      {/* FOOTER */}
      <footer style={styles.footerSection}>
        <p>© 2024 Editorial App. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#f8fafc',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 40px',
    backgroundColor: 'white',
    borderBottom: '1px solid #e2e8f0',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  headerBrand: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  logo: {
    fontSize: '28px',
  },
  brandName: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#1e293b',
  },
  headerNav: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
  },
  navLink: {
    textDecoration: 'none',
    color: '#475569',
    fontSize: '15px',
    fontWeight: '500',
  },
  btnPrimary: {
    padding: '8px 16px',
    backgroundColor: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  btnSecondary: {
    padding: '8px 16px',
    backgroundColor: 'transparent',
    color: '#475569',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  hero: {
    textAlign: 'center',
    padding: '80px 20px',
    background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
    color: 'white',
  },
  heroTitle: {
    fontSize: '48px',
    fontWeight: 'bold',
    margin: '0 0 16px 0',
  },
  heroSubtitle: {
    fontSize: '20px',
    opacity: 0.9,
    margin: '0 0 32px 0',
  },
  heroButtons: {
    display: 'flex',
    gap: '16px',
    justifyContent: 'center',
  },
  heroBtnPrimary: {
    padding: '14px 32px',
    backgroundColor: 'white',
    color: '#2563eb',
    borderRadius: '8px',
    textDecoration: 'none',
    fontWeight: '600',
    fontSize: '16px',
  },
  heroBtnSecondary: {
    padding: '14px 32px',
    backgroundColor: 'transparent',
    color: 'white',
    border: '2px solid rgba(255,255,255,0.5)',
    borderRadius: '8px',
    textDecoration: 'none',
    fontWeight: '600',
    fontSize: '16px',
  },
  section: {
    padding: '48px 40px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#1e293b',
    margin: 0,
  },
  seeAllLink: {
    color: '#2563eb',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '500',
  },
  bookGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '24px',
  },
  bookCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  bookCover: {
    height: '160px',
    backgroundColor: '#e2e8f0',
    position: 'relative',
  },
  bookCoverImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  bookCoverPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '48px',
  },
  priceTag: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    backgroundColor: '#10b981',
    color: 'white',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 'bold',
  },
  bookInfo: {
    padding: '12px',
  },
  bookTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1e293b',
    margin: '0 0 4px 0',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  bookAuthor: {
    fontSize: '12px',
    color: '#64748b',
    margin: '0 0 8px 0',
  },
  bookDescription: {
    fontSize: '11px',
    color: '#94a3b8',
    margin: '0 0 8px 0',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  bookMeta: {
    display: 'flex',
    gap: '12px',
    fontSize: '11px',
    color: '#64748b',
    marginBottom: '8px',
  },
  bookActions: {
    display: 'flex',
    gap: '8px',
  },
  openBtn: {
    flex: 1,
    padding: '6px 12px',
    backgroundColor: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  removeBtn: {
    padding: '6px 10px',
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  buyBtn: {
    width: '100%',
    padding: '8px',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  categoryTabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '24px',
    flexWrap: 'wrap',
  },
  categoryTab: {
    padding: '8px 16px',
    backgroundColor: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: '20px',
    fontSize: '13px',
    color: '#64748b',
    cursor: 'pointer',
  },
  categoryTabActive: {
    backgroundColor: '#2563eb',
    color: 'white',
    borderColor: '#2563eb',
  },
  authSection: {
    padding: '60px 20px',
    backgroundColor: '#f1f5f9',
    display: 'flex',
    justifyContent: 'center',
  },
  authCard: {
    backgroundColor: 'white',
    padding: '40px',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    width: '100%',
    maxWidth: '400px',
  },
  authTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1e293b',
    margin: '0 0 24px 0',
    textAlign: 'center',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  input: {
    padding: '12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
  },
  submitBtn: {
    padding: '12px',
    backgroundColor: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  googleBtn: {
    width: '100%',
    padding: '12px',
    backgroundColor: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    cursor: 'pointer',
    marginTop: '16px',
  },
  divider: {
    textAlign: 'center',
    color: '#94a3b8',
    margin: '20px 0',
  },
  error: {
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    padding: '12px',
    borderRadius: '8px',
    fontSize: '14px',
    marginBottom: '16px',
  },
  footer: {
    textAlign: 'center',
    marginTop: '20px',
    color: '#64748b',
    fontSize: '14px',
  },
  link: {
    color: '#2563eb',
    textDecoration: 'none',
  },
  footerSection: {
    textAlign: 'center',
    padding: '24px',
    color: '#94a3b8',
    fontSize: '14px',
    borderTop: '1px solid #e2e8f0',
  },
};

export default HomePage;
