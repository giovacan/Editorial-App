import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { StoreHeader } from '../components/Store/StoreHeader';
import { FilterSidebar } from '../components/Store/FilterSidebar';
import { BookCard } from '../components/Store/BookCard';
import { getCommunityBooksByCategory, getCommunityBooks } from '../data/communityBooks';

const CATEGORIES = [
  { id: 'novela', label: 'Novela', icon: '📖', description: 'Historias ficticias de todos los géneros' },
  { id: 'ensayo', label: 'Ensayo', icon: '📝', description: 'Análisis y reflexiones sobre diversos temas' },
  { id: 'poesia', label: 'Poesía', icon: '🎭', description: 'Versos y expresiones artísticas' },
  { id: 'ciencia', label: 'Ciencia', icon: '🔬', description: 'Divulgación científica y conocimiento' },
  { id: 'historia', label: 'Historia', icon: '🏛️', description: 'Eventos históricos y biografías' },
  { id: 'negocios', label: 'Negocios', icon: '💼', description: 'Emprendimiento y empresa' },
  { id: 'desarrollo', label: 'Desarrollo Personal', icon: '🌱', description: 'Crecimiento personal y bienestar' },
  { id: 'infantil', label: 'Infantil', icon: '🧸', description: 'Cuentos para niños' },
];

export function CategoryPage() {
  const { categoryId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const categoryParam = searchParams.get('category');
  const activeCategory = categoryId || categoryParam || 'all';
  
  const [selectedCategory, setSelectedCategory] = useState(activeCategory);
  const [priceRange, setPriceRange] = useState([0, 50]);
  const [selectedFormats, setSelectedFormats] = useState([]);
  const [selectedRatings, setSelectedRatings] = useState([]);
  const [sortBy, setSortBy] = useState('rating');
  const [favorites, setFavorites] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const contentRef = useRef(null);

  useEffect(() => {
    setSelectedCategory(activeCategory);
  }, [activeCategory]);

  const handleSearch = () => {
    const element = document.getElementById('search-results');
    if (element) {
      const headerOffset = 120;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  const category = CATEGORIES.find(c => c.id === selectedCategory);

  const allBooks = useMemo(() => {
    let books = selectedCategory === 'all' 
      ? getCommunityBooks() 
      : getCommunityBooksByCategory(selectedCategory);
    
    // Filter by search query (title or author)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      books = books.filter(book => 
        (book.title || '').toLowerCase().includes(query) ||
        (book.author || '').toLowerCase().includes(query)
      );
    }
    
    if (priceRange[0] > 0 || priceRange[1] < 50) {
      books = books.filter(book => 
        book.price >= priceRange[0] && book.price <= priceRange[1]
      );
    }
    
    if (selectedFormats.length > 0) {
      books = books.filter(book => 
        book.format?.some(f => selectedFormats.includes(f))
      );
    }
    
    if (selectedRatings.length > 0) {
      books = books.filter(book => 
        selectedRatings.some(r => book.rating >= r)
      );
    }
    
    switch (sortBy) {
      case 'rating':
        books = [...books].sort((a, b) => b.rating - a.rating);
        break;
      case 'price-low':
        books = [...books].sort((a, b) => a.price - b.price);
        break;
      case 'price-high':
        books = [...books].sort((a, b) => b.price - a.price);
        break;
      case 'downloads':
        books = [...books].sort((a, b) => b.downloads - a.downloads);
        break;
      case 'newest':
        books = [...books].sort((a, b) => new Date(b.publishedDate) - new Date(a.publishedDate));
        break;
      default:
        break;
    }
    
    return books;
  }, [selectedCategory, priceRange, selectedFormats, selectedRatings, sortBy, searchQuery]);

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

  const categoriesWithCount = CATEGORIES.map(cat => ({
    ...cat,
    count: getCommunityBooksByCategory(cat.id).length
  }));

  return (
    <div style={styles.page}>
      <StoreHeader 
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearch={handleSearch}
        cartCount={cart.length}
        favoritesCount={favorites.length}
        user={user}
        onSignInClick={() => navigate('/app')}
        onGoogleSignIn={() => {}}
      />
      
      <div style={styles.breadcrumb}>
        <Link to="/home" style={styles.breadcrumbLink}>Tienda</Link>
        <span style={styles.breadcrumbSep}>/</span>
        <span style={styles.breadcrumbCurrent}>
          {category ? category.label : 'Todas las categorías'}
        </span>
      </div>

      <div style={styles.categoryNav}>
        <button
          style={{
            ...styles.categoryBtn,
            ...(selectedCategory === 'all' ? styles.categoryBtnActive : {})
          }}
          onClick={() => setSelectedCategory('all')}
        >
          <span style={styles.categoryIcon}>📚</span>
          <span>Todos</span>
        </button>
        {categoriesWithCount.map(cat => (
          <button
            key={cat.id}
            style={{
              ...styles.categoryBtn,
              ...(selectedCategory === cat.id ? styles.categoryBtnActive : {})
            }}
            onClick={() => setSelectedCategory(cat.id)}
          >
            <span style={styles.categoryIcon}>{cat.icon}</span>
            <span>{cat.label}</span>
            <span style={styles.categoryCount}>{cat.count}</span>
          </button>
        ))}
      </div>

      {category && (
        <div style={styles.categoryHeader}>
          <h1 style={styles.categoryTitle}>
            <span style={styles.categoryIconLarge}>{category.icon}</span>
            {category.label}
          </h1>
          {category.description && (
            <p style={styles.categoryDescription}>{category.description}</p>
          )}
        </div>
      )}

      <main style={styles.mainContent} id="search-results">
        <aside style={styles.sidebar}>
          <FilterSidebar 
            categories={categoriesWithCount.map(c => ({ id: c.id, label: c.label, count: c.count }))}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            priceRange={priceRange}
            onPriceRangeChange={setPriceRange}
            selectedFormats={selectedFormats}
            onFormatChange={setSelectedFormats}
            selectedRatings={selectedRatings}
            onRatingChange={setSelectedRatings}
            bookCounts={{
              ebook: getCommunityBooks().filter(b => b.format?.includes('ebook')).length,
              pdf: getCommunityBooks().filter(b => b.format?.includes('pdf')).length,
              kindle: getCommunityBooks().filter(b => b.format?.includes('kindle')).length,
            }}
          />
        </aside>

        <div style={styles.content}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.resultCount}>
              {searchQuery ? `Resultados para "${searchQuery}"` : (category ? category.label : 'Todos los libros')}
              <span>({allBooks.length} resultados)</span>
            </h2>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={styles.sortSelect}
            >
              <option value="rating">Mejor valorados</option>
              <option value="price-low">Precio: menor</option>
              <option value="price-high">Precio: mayor</option>
              <option value="downloads">Más descargados</option>
              <option value="newest">Más recientes</option>
            </select>
          </div>

          {allBooks.length === 0 ? (
            <div style={styles.noResults}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <h3>No se encontraron libros</h3>
              <p>Intenta con otros filtros</p>
            </div>
          ) : (
            <div style={styles.bookGrid}>
              {allBooks.map(book => (
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
          )}
        </div>
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#f8fafc',
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
  categoryNav: {
    display: 'flex',
    gap: '12px',
    padding: '16px 32px',
    backgroundColor: '#fff',
    borderBottom: '1px solid #f0f0f0',
    overflowX: 'auto',
  },
  categoryBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    backgroundColor: '#f3f4f6',
    border: 'none',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#4b5563',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.2s',
  },
  categoryBtnActive: {
    backgroundColor: '#6366f1',
    color: 'white',
  },
  categoryIcon: {
    fontSize: '16px',
  },
  categoryCount: {
    fontSize: '12px',
    padding: '2px 8px',
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: '10px',
  },
  categoryHeader: {
    padding: '32px',
    backgroundColor: '#fff',
    marginBottom: '24px',
  },
  categoryTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    fontSize: '32px',
    fontWeight: '800',
    color: '#1e293b',
    margin: '0 0 8px 0',
  },
  categoryIconLarge: {
    fontSize: '36px',
  },
  categoryDescription: {
    fontSize: '16px',
    color: '#6b7280',
    margin: 0,
  },
  mainContent: {
    display: 'flex',
    gap: '32px',
    maxWidth: '1600px',
    margin: '0 auto',
    padding: '0 32px 40px',
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
  },
  resultCount: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#1e293b',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  sortSelect: {
    padding: '10px 16px',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#4b5563',
    backgroundColor: '#fff',
    cursor: 'pointer',
  },
  noResults: {
    textAlign: 'center',
    padding: '80px 20px',
    backgroundColor: '#fff',
    borderRadius: '16px',
  },
  bookGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: '24px',
  },
};

export default CategoryPage;
