import { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { StoreHeader } from '../components/Store/StoreHeader';
import { BookCard } from '../components/Store/BookCard';
import { getBooksByAuthor } from '../data/communityBooks';

export function AuthorPage() {
  const { authorName } = useParams();
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState([]);
  const [cart, setCart] = useState([]);

  const authorBooks = useMemo(() => {
    if (!authorName) return [];
    return getBooksByAuthor(decodeURIComponent(authorName));
  }, [authorName]);

  const author = authorBooks.length > 0 ? {
    name: authorBooks[0].author,
    avatar: authorBooks[0].authorAvatar,
    bio: authorBooks[0].authorBio,
  } : null;

  const handleAddToCart = (book) => {
    setCart(prev => [...prev, book]);
  };

  const handleToggleFavorite = (bookId) => {
    setFavorites(prev => 
      prev.includes(bookId) 
        ? prev.filter(id => id !== bookId)
        : [...prev, bookId]
    );
  };

  if (!author) {
    return (
      <div style={styles.page}>
        <StoreHeader />
        <div style={styles.notFound}>
          <h2>Autor no encontrado</h2>
          <p>El autor que buscas no existe.</p>
          <Link to="/home" style={styles.backLink}>← Volver a la tienda</Link>
        </div>
      </div>
    );
  }

  const totalDownloads = authorBooks.reduce((sum, book) => sum + (book.downloads || 0), 0);
  const avgRating = (authorBooks.reduce((sum, book) => sum + (book.rating || 0), 0) / authorBooks.length).toFixed(1);

  return (
    <div style={styles.page}>
      <StoreHeader />
      
      <div style={styles.breadcrumb}>
        <Link to="/home" style={styles.breadcrumbLink}>Tienda</Link>
        <span style={styles.breadcrumbSep}>/</span>
        <span style={styles.breadcrumbCurrent}>{author.name}</span>
      </div>

      <main style={styles.container}>
        <div style={styles.authorHeader}>
          <div style={styles.authorInfo}>
            {author.avatar ? (
              <img src={author.avatar} alt={author.name} style={styles.authorAvatar} />
            ) : (
              <div style={styles.avatarPlaceholder}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
            )}
            <div style={styles.authorDetails}>
              <h1 style={styles.authorName}>{author.name}</h1>
              {author.bio && <p style={styles.authorBio}>{author.bio}</p>}
              <div style={styles.authorStats}>
                <div style={styles.statItem}>
                  <span style={styles.statValue}>{authorBooks.length}</span>
                  <span style={styles.statLabel}>Libros</span>
                </div>
                <div style={styles.statItem}>
                  <span style={styles.statValue}>{totalDownloads.toLocaleString()}</span>
                  <span style={styles.statLabel}>Descargas</span>
                </div>
                <div style={styles.statItem}>
                  <span style={styles.statValue}>⭐ {avgRating}</span>
                  <span style={styles.statLabel}>Rating promedio</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section style={styles.booksSection}>
          <h2 style={styles.sectionTitle}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
            Libros de {author.name}
          </h2>
          <div style={styles.bookGrid}>
            {authorBooks.map(book => (
              <BookCard
                key={book.id}
                book={book}
                onQuickView={() => navigate(`/book/${book.id}`)}
                onAddToCart={handleAddToCart}
                onToggleFavorite={handleToggleFavorite}
                isFavorite={favorites.includes(book.id)}
              />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#f8fafc',
  },
  notFound: {
    textAlign: 'center',
    padding: '60px 20px',
  },
  backLink: {
    color: '#6366f1',
    textDecoration: 'none',
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '16px 32px',
    backgroundColor: '#fff',
    borderBottom: '1px solid #f0f0f0',
  },
  breadcrumbLink: {
    color: '#6b7280',
    textDecoration: 'none',
    fontSize: '14px',
  },
  breadcrumbSep: {
    color: '#9ca3af',
  },
  breadcrumbCurrent: {
    color: '#1e293b',
    fontSize: '14px',
    fontWeight: '500',
  },
  container: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '40px 32px',
  },
  authorHeader: {
    backgroundColor: '#fff',
    borderRadius: '20px',
    padding: '40px',
    marginBottom: '48px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  authorInfo: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '32px',
  },
  authorAvatar: {
    width: '140px',
    height: '140px',
    borderRadius: '50%',
    objectFit: 'cover',
    boxShadow: '0 8px 25px rgba(0,0,0,0.15)',
  },
  avatarPlaceholder: {
    width: '140px',
    height: '140px',
    borderRadius: '50%',
    backgroundColor: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorDetails: {
    flex: 1,
  },
  authorName: {
    fontSize: '36px',
    fontWeight: '800',
    color: '#1e293b',
    margin: '0 0 12px 0',
  },
  authorBio: {
    fontSize: '16px',
    color: '#6b7280',
    lineHeight: 1.6,
    marginBottom: '24px',
    maxWidth: '600px',
  },
  authorStats: {
    display: 'flex',
    gap: '40px',
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: '800',
    color: '#1e293b',
  },
  statLabel: {
    fontSize: '13px',
    color: '#6b7280',
  },
  booksSection: {},
  sectionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '24px',
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: '24px',
  },
  bookGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: '24px',
  },
};

export default AuthorPage;
