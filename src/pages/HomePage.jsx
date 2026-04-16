import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getRecentBooks, removeRecentBook } from '../utils/recentBooks';
import { 
  getCommunityBooks, 
  getFeaturedBooks, 
  getBestsellers, 
  getNewBooks,
  getTopRated,
  getRecentlyEdited 
} from '../data/communityBooks';
import { 
  BookCard, 
  FilterSidebar, 
  StoreHeader, 
  TrustSignals, 
  QuickViewModal, 
  HeroSection,
  MoodCategories,
  MiniCart
} from '../components/Store';

export function HomePage() {
  const navigate = useNavigate();
  const { user, signIn, signInGoogle } = useAuth();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [priceRange, setPriceRange] = useState([0, 50]);
  const [selectedFormats, setSelectedFormats] = useState([]);
  const [selectedRatings, setSelectedRatings] = useState([]);
  const [sortBy, setSortBy] = useState('rating');
  const [hoveredCard, setHoveredCard] = useState(null);
  const [quickViewBook, setQuickViewBook] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);

  const allBooks = useMemo(() => getCommunityBooks(), []);
  const featuredBook = useMemo(() => {
    const featured = getFeaturedBooks();
    return featured[Math.floor(Date.now() / 86400000) % featured.length] || featured[0];
  }, []);
  const bestsellers = useMemo(() => getBestsellers(), []);
  const newBooks = useMemo(() => getNewBooks(), []);
  const topRated = useMemo(() => getTopRated(), []);
  const recentlyEdited = useMemo(() => getRecentlyEdited(), []);

  const categories = useMemo(() => [
    { id: 'all', label: 'Todos', count: allBooks.length },
    { id: 'novela', label: 'Novela', count: allBooks.filter(b => b.category === 'novela').length },
    { id: 'ensayo', label: 'Ensayo', count: allBooks.filter(b => b.category === 'ensayo').length },
    { id: 'poesia', label: 'Poesía', count: allBooks.filter(b => b.category === 'poesia').length },
    { id: 'manual', label: 'Manual', count: allBooks.filter(b => b.category === 'manual').length },
    { id: 'infantil', label: 'Infantil', count: allBooks.filter(b => b.category === 'infantil').length },
  ], [allBooks]);

  const filteredBooks = useMemo(() => {
    let filtered = [...allBooks];
    
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(book => book.category === selectedCategory);
    }
    
    filtered = filtered.filter(book => 
      book.price >= priceRange[0] && book.price <= priceRange[1]
    );
    
    if (selectedFormats.length > 0) {
      filtered = filtered.filter(book => 
        book.format?.some(f => selectedFormats.includes(f))
      );
    }
    
    if (selectedRatings.length > 0) {
      filtered = filtered.filter(book => 
        selectedRatings.some(r => book.rating >= r)
      );
    }
    
    if (searchQuery) {
      const query = (searchQuery || '').toLowerCase();
      filtered = filtered.filter(book => 
        (book.title || '').toLowerCase().includes(query) ||
        (book.author || '').toLowerCase().includes(query) ||
        (book.description || '').toLowerCase().includes(query)
      );
    }
    
    switch (sortBy) {
      case 'rating':
        filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case 'price-low':
        filtered.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case 'price-high':
        filtered.sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
      case 'downloads':
        filtered.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
        break;
      case 'newest':
        filtered.sort((a, b) => new Date(b.publishedDate) - new Date(a.publishedDate));
        break;
    }
    
    return filtered;
  }, [allBooks, selectedCategory, priceRange, selectedFormats, selectedRatings, searchQuery, sortBy]);

  const bookCounts = useMemo(() => ({
    ebook: allBooks.filter(b => b.format?.includes('ebook')).length,
    pdf: allBooks.filter(b => b.format?.includes('pdf')).length,
    kindle: allBooks.filter(b => b.format?.includes('kindle')).length,
    '4plus': allBooks.filter(b => b.rating >= 4).length,
    '3plus': allBooks.filter(b => b.rating >= 3).length,
  }), [allBooks]);

  const handleAddToCart = (book) => {
    setCart(prev => {
      const exists = prev.find(item => item.id === book.id);
      if (exists) {
        return prev.map(item => 
          item.id === book.id 
            ? { ...item, quantity: (item.quantity || 1) + 1 }
            : item
        );
      }
      return [...prev, { ...book, quantity: 1 }];
    });
  };

  const handleRemoveFromCart = (bookId) => {
    setCart(prev => prev.filter(item => item.id !== bookId));
  };

  const handleToggleFavorite = (bookId) => {
    setFavorites(prev => 
      prev.includes(bookId) 
        ? prev.filter(id => id !== bookId)
        : [...prev, bookId]
    );
  };

  const handleQuickView = (book) => {
    setQuickViewBook(book);
  };

  const handleViewDeal = (book) => {
    setQuickViewBook(book);
  };

  return (
    <div style={styles.page}>
      <StoreHeader 
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        cartCount={cart.reduce((sum, item) => sum + (item.quantity || 1), 0)}
        favoritesCount={favorites.length}
        user={user}
        onSignInClick={() => document.getElementById('auth-section')?.scrollIntoView({ behavior: 'smooth' })}
        onGoogleSignIn={async () => {
          try {
            await signInGoogle();
            navigate('/books');
          } catch (err) {
            console.error(err);
          }
        }}
      />

      <HeroSection 
        featuredBook={featuredBook}
        onViewDeal={handleViewDeal}
      />

      <MoodCategories 
        onSelectMood={(mood) => {}}
      />

      <TrustSignals />

      <section style={styles.carouselSection}>
        <div style={styles.carouselHeader}>
          <h2 style={styles.carouselTitle}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Últimos Editados
          </h2>
          <span style={styles.seeAll}>Ver todos →</span>
        </div>
        <div style={styles.carousel}>
          {recentlyEdited.slice(0, 8).map(book => (
            <div key={book.id} style={styles.carouselItem}>
              <BookCard
                book={book}
                onQuickView={handleQuickView}
                onAddToCart={handleAddToCart}
                onToggleFavorite={handleToggleFavorite}
                isFavorite={favorites.includes(book.id)}
                onClick={() => navigate(`/book/${book.id}`)}
              />
            </div>
          ))}
        </div>
      </section>

      <section style={styles.mainSection}>
        <aside style={styles.sidebar}>
          <FilterSidebar 
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            priceRange={priceRange}
            onPriceRangeChange={setPriceRange}
            selectedFormats={selectedFormats}
            onFormatChange={setSelectedFormats}
            selectedRatings={selectedRatings}
            onRatingChange={setSelectedRatings}
            bookCounts={bookCounts}
          />
        </aside>

        <main style={styles.content}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
              Todos los Libros
              <span style={styles.resultCount}>({filteredBooks.length} resultados)</span>
            </h2>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={styles.sortSelect}
            >
              <option value="rating">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                Mejor valorados
              </option>
              <option value="downloads">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Más descargados
              </option>
              <option value="price-low">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                Precio: menor
              </option>
              <option value="price-high">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                Precio: mayor
              </option>
              <option value="newest">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Más recientes
              </option>
            </select>
          </div>

          {filteredBooks.length === 0 ? (
            <div style={styles.noResults}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={styles.noResultsIcon}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <h3 style={styles.noResultsTitle}>No se encontraron libros</h3>
              <p style={styles.noResultsText}>Intenta con otros filtros o términos de búsqueda</p>
              <button 
                style={styles.resetBtn}
                onClick={() => {
                  setSelectedCategory('all');
                  setSearchQuery('');
                  setPriceRange([0, 50]);
                  setSelectedFormats([]);
                  setSelectedRatings([]);
                }}
              >
                Limpiar filtros
              </button>
            </div>
          ) : (
            <div style={styles.bookGrid}>
              {filteredBooks.map(book => (
                <BookCard
                  key={book.id}
                  book={book}
                  onQuickView={handleQuickView}
                  onAddToCart={handleAddToCart}
                  onToggleFavorite={handleToggleFavorite}
                  isFavorite={favorites.includes(book.id)}
                  onClick={() => navigate(`/book/${book.id}`)}
                />
              ))}
            </div>
          )}
        </main>
      </section>

      <section style={styles.carouselSection}>
        <div style={styles.carouselHeader}>
          <h2 style={styles.carouselTitle}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
            Bestsellers
          </h2>
          <span style={styles.seeAll}>Ver todos →</span>
        </div>
        <div style={styles.carousel}>
          {bestsellers.slice(0, 8).map(book => (
            <div key={book.id} style={styles.carouselItem}>
              <BookCard
                book={book}
                onQuickView={handleQuickView}
                onAddToCart={handleAddToCart}
                onToggleFavorite={handleToggleFavorite}
                isFavorite={favorites.includes(book.id)}
                onClick={() => navigate(`/book/${book.id}`)}
              />
            </div>
          ))}
        </div>
      </section>

      <section style={styles.carouselSection}>
        <div style={styles.carouselHeader}>
          <h2 style={styles.carouselTitle}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            Recién Llegados
          </h2>
          <span style={styles.seeAll}>Ver todos →</span>
        </div>
        <div style={styles.carousel}>
          {newBooks.slice(0, 8).map(book => (
            <div key={book.id} style={styles.carouselItem}>
              <BookCard
                book={book}
                onQuickView={handleQuickView}
                onAddToCart={handleAddToCart}
                onToggleFavorite={handleToggleFavorite}
                isFavorite={favorites.includes(book.id)}
                onClick={() => navigate(`/book/${book.id}`)}
              />
            </div>
          ))}
        </div>
      </section>

      <section style={styles.carouselSection}>
        <div style={styles.carouselHeader}>
          <h2 style={styles.carouselTitle}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            Top Valorados
          </h2>
          <span style={styles.seeAll}>Ver todos →</span>
        </div>
        <div style={styles.carousel}>
          {topRated.slice(0, 8).map(book => (
            <div key={book.id} style={styles.carouselItem}>
              <BookCard
                book={book}
                onQuickView={handleQuickView}
                onAddToCart={handleAddToCart}
                onToggleFavorite={handleToggleFavorite}
                isFavorite={favorites.includes(book.id)}
                onClick={() => navigate(`/book/${book.id}`)}
              />
            </div>
          ))}
        </div>
      </section>

      <section id="auth-section" style={styles.authSection}>
        <div style={styles.authCard}>
          <h2 style={styles.authTitle}>Únete a la comunidad</h2>
          <p style={styles.authSubtitle}>
            Crea tu cuenta para publicar tus propios libros, gestionar tu biblioteca y conectar con lectores de todo el mundo.
          </p>
          <button onClick={signInGoogle} style={styles.googleBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Continuar con Google
          </button>
          <div style={styles.authFeatures}>
            <div style={styles.authFeature}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
              </svg>
              Publica tus libros
            </div>
            <div style={styles.authFeature}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
              Gana por tus ventas
            </div>
            <div style={styles.authFeature}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              Conecta con lectores
            </div>
          </div>
        </div>
      </section>

      <footer style={styles.footer}>
        <div style={styles.footerContent}>
          <div style={styles.footerBrand}>
            <span style={styles.footerLogo}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
              BookHub
            </span>
            <p style={styles.footerTagline}>La tienda de libros de autores independientes</p>
          </div>
          <div style={styles.footerLinks}>
            <a href="#" style={styles.footerLink}>Acerca de</a>
            <a href="#" style={styles.footerLink}>Autores</a>
            <a href="#" style={styles.footerLink}>Términos</a>
            <a href="#" style={styles.footerLink}>Privacidad</a>
            <a href="#" style={styles.footerLink}>Contacto</a>
          </div>
        </div>
        <div style={styles.footerBottom}>
          © 2024 BookHub. Todos los derechos reservados.
        </div>
      </footer>

      {quickViewBook && (
        <QuickViewModal
          book={quickViewBook}
          onClose={() => setQuickViewBook(null)}
          onAddToCart={handleAddToCart}
          onToggleFavorite={handleToggleFavorite}
          isFavorite={favorites.includes(quickViewBook.id)}
        />
      )}
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#f8fafc',
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  mainSection: {
    display: 'flex',
    maxWidth: '1600px',
    margin: '0 auto',
    padding: '40px 24px',
    gap: '32px',
  },
  sidebar: {
    width: '280px',
    flexShrink: 0,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    flexWrap: 'wrap',
    gap: '16px',
  },
  sectionTitle: {
    fontSize: '24px',
    fontWeight: '800',
    color: '#1e293b',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  resultCount: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#9ca3af',
  },
  sortSelect: {
    padding: '10px 16px',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    fontSize: '14px',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontWeight: '500',
    color: '#4b5563',
  },
  bookGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: '24px',
  },
  noResults: {
    textAlign: 'center',
    padding: '80px 40px',
    backgroundColor: 'white',
    borderRadius: '16px',
    border: '1px solid #f0f0f0',
  },
  noResultsIcon: {
    fontSize: '64px',
    display: 'block',
    marginBottom: '20px',
  },
  noResultsTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#1e293b',
    margin: '0 0 12px 0',
  },
  noResultsText: {
    fontSize: '15px',
    color: '#6b7280',
    margin: '0 0 24px 0',
  },
  resetBtn: {
    padding: '12px 24px',
    backgroundColor: '#6366f1',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  carouselSection: {
    maxWidth: '1600px',
    margin: '0 auto',
    padding: '40px 24px',
  },
  carouselHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  carouselTitle: {
    fontSize: '24px',
    fontWeight: '800',
    color: '#1e293b',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  seeAll: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#6366f1',
    cursor: 'pointer',
  },
  carousel: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: '24px',
  },
  carouselItem: {
    minWidth: 0,
  },
  authSection: {
    padding: '80px 24px',
    backgroundColor: '#f9fafb',
    display: 'flex',
    justifyContent: 'center',
  },
  authCard: {
    backgroundColor: 'white',
    padding: '48px',
    borderRadius: '20px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
    maxWidth: '500px',
    width: '100%',
    textAlign: 'center',
  },
  authTitle: {
    fontSize: '28px',
    fontWeight: '800',
    color: '#1e293b',
    margin: '0 0 12px 0',
  },
  authSubtitle: {
    fontSize: '15px',
    color: '#6b7280',
    margin: '0 0 28px 0',
    lineHeight: 1.6,
  },
  googleBtn: {
    width: '100%',
    padding: '16px',
    backgroundColor: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    marginBottom: '28px',
    transition: 'background 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    color: '#374151',
  },
  authFeatures: {
    display: 'flex',
    justifyContent: 'center',
    gap: '32px',
    flexWrap: 'wrap',
  },
  authFeature: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: '#6b7280',
    fontWeight: '500',
  },
  footer: {
    backgroundColor: '#1e293b',
    color: 'white',
    padding: '60px 24px 32px',
  },
  footerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '40px',
  },
  footerBrand: {},
  footerLogo: {
    fontSize: '24px',
    fontWeight: '800',
    display: 'block',
    marginBottom: '8px',
  },
  footerTagline: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.6)',
    margin: 0,
  },
  footerLinks: {
    display: 'flex',
    gap: '24px',
    flexWrap: 'wrap',
  },
  footerLink: {
    color: 'rgba(255,255,255,0.7)',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'color 0.2s',
  },
  footerBottom: {
    maxWidth: '1200px',
    margin: '40px auto 0',
    paddingTop: '24px',
    borderTop: '1px solid rgba(255,255,255,0.1)',
    textAlign: 'center',
    fontSize: '13px',
    color: 'rgba(255,255,255,0.5)',
  },
};

export default HomePage;
