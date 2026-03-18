import { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { StoreHeader } from '../components/Store/StoreHeader';
import { BookCard } from '../components/Store/BookCard';
import { getCommunityBooks, getBooksByAuthor } from '../data/communityBooks';

export function BookDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [selectedFormat, setSelectedFormat] = useState(() => {
    const allBooks = getCommunityBooks();
    const foundBook = allBooks.find(b => b.id === id);
    return foundBook?.format?.[0] || 'ebook';
  });
  const [favorites, setFavorites] = useState([]);
  const [cart, setCart] = useState([]);

  const allBooks = useMemo(() => getCommunityBooks(), []);
  
  const book = useMemo(() => {
    return allBooks.find(b => b.id === id) || null;
  }, [allBooks, id]);

  const authorBooks = useMemo(() => {
    if (!book) return [];
    return getBooksByAuthor(book.author).filter(b => b.id !== book.id);
  }, [book]);

  const relatedBooks = useMemo(() => {
    if (!book) return [];
    return allBooks
      .filter(b => b.category === book.category && b.id !== book.id)
      .slice(0, 4);
  }, [book, allBooks]);

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

  if (!book) {
    return (
      <div style={styles.page}>
        <StoreHeader />
        <div style={styles.notFound}>
          <h2>Libro no encontrado</h2>
          <p>El libro que buscas no existe o ha sido eliminado.</p>
          <Link to="/home" style={styles.backLink}>← Volver a la tienda</Link>
        </div>
      </div>
    );
  }

  const renderStars = (rating) => {
    const stars = [];
    for (let i = 0; i < 5; i++) {
      if (i < Math.floor(rating)) {
        stars.push(<span key={i} style={styles.starFilled}>★</span>);
      } else {
        stars.push(<span key={i} style={styles.starEmpty}>★</span>);
      }
    }
    return stars;
  };

  return (
    <div style={styles.page}>
      <StoreHeader />
      
      <div style={styles.breadcrumb}>
        <Link to="/home" style={styles.breadcrumbLink}>Tienda</Link>
        <span style={styles.breadcrumbSep}>/</span>
        <Link to={`/home?category=${book.category}`} style={styles.breadcrumbLink}>
          {book.category.charAt(0).toUpperCase() + book.category.slice(1)}
        </Link>
        <span style={styles.breadcrumbSep}>/</span>
        <span style={styles.breadcrumbCurrent}>{book.title}</span>
      </div>

      <main style={styles.container}>
        <div style={styles.bookGrid}>
          <div style={styles.coverSection}>
            <div style={styles.coverWrapper}>
              {book.cover ? (
                <img src={book.cover} alt={book.title} style={styles.cover} />
              ) : (
                <div style={styles.coverPlaceholder}>
                  <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                  </svg>
                </div>
              )}
              {book.badges?.includes('bestseller') && (
                <div style={styles.bestsellerBadge}>Bestseller</div>
              )}
            </div>
          </div>

          <div style={styles.detailsSection}>
            <div style={styles.category}>{book.category?.toUpperCase()}</div>
            <h1 style={styles.title}>{book.title}</h1>
            
            <Link 
              to={`/author/${encodeURIComponent(book.author)}`} 
              style={styles.authorLink}
            >
              {book.authorAvatar && (
                <img src={book.authorAvatar} alt={book.author} style={styles.authorAvatar} />
              )}
              <span>{book.author}</span>
            </Link>

            <div style={styles.ratingRow}>
              <div style={styles.stars}>{renderStars(book.rating)}</div>
              <span style={styles.ratingText}>
                {book.rating} ({book.ratingCount} reseñas)
              </span>
            </div>

            <p style={styles.description}>{book.description}</p>

            <div style={styles.metaGrid}>
              <div style={styles.metaItem}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                <div>
                  <span style={styles.metaLabel}>Páginas</span>
                  <span style={styles.metaValue}>{book.pages}</span>
                </div>
              </div>
              <div style={styles.metaItem}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                </svg>
                <div>
                  <span style={styles.metaLabel}>Idioma</span>
                  <span style={styles.metaValue}>{book.language === 'es' ? 'Español' : book.language}</span>
                </div>
              </div>
              <div style={styles.metaItem}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <div>
                  <span style={styles.metaLabel}>Publicado</span>
                  <span style={styles.metaValue}>
                    {new Date(book.publishedDate).toLocaleDateString('es-ES', { 
                      year: 'numeric', 
                      month: 'long' 
                    })}
                  </span>
                </div>
              </div>
              <div style={styles.metaItem}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                <div>
                  <span style={styles.metaLabel}>Descargas</span>
                  <span style={styles.metaValue}>{book.downloads?.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div style={styles.formatSection}>
              <span style={styles.formatLabel}>Formato:</span>
              <div style={styles.formatOptions}>
                {book.format?.map(fmt => (
                  <button
                    key={fmt}
                    style={{
                      ...styles.formatBtn,
                      ...(selectedFormat === fmt ? styles.formatBtnActive : {})
                    }}
                    onClick={() => setSelectedFormat(fmt)}
                  >
                    {fmt === 'ebook' && '📱'}
                    {fmt === 'pdf' && '📄'}
                    {fmt === 'kindle' && '☁️'}
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div style={styles.priceSection}>
              <div style={styles.priceMain}>
                <span style={styles.price}>${book.price?.toFixed(2)}</span>
                {book.originalPrice > book.price && (
                  <>
                    <span style={styles.originalPrice}>${book.originalPrice?.toFixed(2)}</span>
                    <span style={styles.discount}>-{book.discount}%</span>
                  </>
                )}
              </div>
            </div>

            <div style={styles.actions}>
              <button style={styles.buyBtn} onClick={() => handleAddToCart(book)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                </svg>
                Comprar ahora
              </button>
              <button 
                style={{
                  ...styles.favoriteBtn,
                  ...(favorites.includes(book.id) ? styles.favoriteBtnActive : {})
                }}
                onClick={() => handleToggleFavorite(book.id)}
              >
                {favorites.includes(book.id) ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {book.excerpt && (
          <section style={styles.excerptSection}>
            <h2 style={styles.sectionTitle}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
              </svg>
              Vista previa
            </h2>
            <div style={styles.excerptContent}>
              {book.excerpt}
            </div>
            <button style={styles.readMoreBtn}>
              Leer primer capítulo gratis →
            </button>
          </section>
        )}

        {authorBooks.length > 0 && (
          <section style={styles.relatedSection}>
            <h2 style={styles.sectionTitle}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
              </svg>
              Más de {book.author}
            </h2>
            <div style={styles.bookGrid2}>
              {authorBooks.map(b => (
                <BookCard
                  key={b.id}
                  book={b}
                  onQuickView={() => navigate(`/book/${b.id}`)}
                  onAddToCart={handleAddToCart}
                  onToggleFavorite={handleToggleFavorite}
                  isFavorite={favorites.includes(b.id)}
                />
              ))}
            </div>
          </section>
        )}

        {relatedBooks.length > 0 && (
          <section style={styles.relatedSection}>
            <h2 style={styles.sectionTitle}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              Libros relacionados
            </h2>
            <div style={styles.bookGrid2}>
              {relatedBooks.map(b => (
                <BookCard
                  key={b.id}
                  book={b}
                  onQuickView={() => navigate(`/book/${b.id}`)}
                  onAddToCart={handleAddToCart}
                  onToggleFavorite={handleToggleFavorite}
                  isFavorite={favorites.includes(b.id)}
                />
              ))}
            </div>
          </section>
        )}
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
  bookGrid: {
    display: 'grid',
    gridTemplateColumns: '400px 1fr',
    gap: '48px',
    marginBottom: '60px',
  },
  coverSection: {},
  coverWrapper: {
    position: 'relative',
    borderRadius: '16px',
    overflow: 'hidden',
    boxShadow: '0 25px 50px rgba(0,0,0,0.15)',
  },
  cover: {
    width: '100%',
    height: 'auto',
    display: 'block',
  },
  coverPlaceholder: {
    width: '100%',
    height: '500px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e2e8f0',
  },
  bestsellerBadge: {
    position: 'absolute',
    top: '16px',
    left: '16px',
    background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
    color: 'white',
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '700',
  },
  detailsSection: {},
  category: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#6366f1',
    letterSpacing: '1px',
    marginBottom: '8px',
  },
  title: {
    fontSize: '36px',
    fontWeight: '800',
    color: '#1e293b',
    margin: '0 0 16px 0',
    lineHeight: 1.2,
  },
  authorLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '10px',
    textDecoration: 'none',
    color: '#4b5563',
    marginBottom: '20px',
  },
  authorAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  ratingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '24px',
  },
  stars: {
    display: 'flex',
    gap: '2px',
  },
  starFilled: {
    color: '#fbbf24',
    fontSize: '18px',
  },
  starEmpty: {
    color: '#d1d5db',
    fontSize: '18px',
  },
  ratingText: {
    color: '#6b7280',
    fontSize: '14px',
  },
  description: {
    fontSize: '16px',
    lineHeight: 1.8,
    color: '#4b5563',
    marginBottom: '32px',
  },
  metaGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '24px',
    marginBottom: '32px',
  },
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  metaLabel: {
    display: 'block',
    fontSize: '12px',
    color: '#9ca3af',
    marginBottom: '2px',
  },
  metaValue: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: '#1e293b',
  },
  formatSection: {
    marginBottom: '24px',
  },
  formatLabel: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: '12px',
  },
  formatOptions: {
    display: 'flex',
    gap: '12px',
  },
  formatBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    backgroundColor: '#f3f4f6',
    border: '2px solid #e5e7eb',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#4b5563',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  formatBtnActive: {
    borderColor: '#6366f1',
    backgroundColor: '#eef2ff',
    color: '#6366f1',
  },
  priceSection: {
    marginBottom: '24px',
  },
  priceMain: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '16px',
  },
  price: {
    fontSize: '36px',
    fontWeight: '800',
    color: '#1e293b',
  },
  originalPrice: {
    fontSize: '20px',
    color: '#9ca3af',
    textDecoration: 'line-through',
  },
  discount: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#10b981',
    backgroundColor: '#d1fae5',
    padding: '4px 12px',
    borderRadius: '6px',
  },
  actions: {
    display: 'flex',
    gap: '16px',
  },
  buyBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '18px 32px',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 8px 25px rgba(16, 185, 129, 0.4)',
    transition: 'transform 0.2s',
  },
  favoriteBtn: {
    padding: '18px 20px',
    backgroundColor: '#f3f4f6',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  favoriteBtnActive: {
    backgroundColor: '#fee2e2',
  },
  excerptSection: {
    backgroundColor: '#fff',
    borderRadius: '16px',
    padding: '32px',
    marginBottom: '48px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  sectionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '20px',
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: '20px',
  },
  excerptContent: {
    fontSize: '15px',
    lineHeight: 1.8,
    color: '#4b5563',
    fontStyle: 'italic',
    whiteSpace: 'pre-wrap',
  },
  readMoreBtn: {
    marginTop: '20px',
    padding: '12px 24px',
    backgroundColor: '#f3f4f6',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#6366f1',
    cursor: 'pointer',
  },
  relatedSection: {
    marginBottom: '48px',
  },
  bookGrid2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: '24px',
  },
};

export default BookDetailPage;
