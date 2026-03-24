export function QuickViewModal({ book, onClose, onAddToCart, onToggleFavorite, isFavorite }) {
  if (!book) return null;

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
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button style={styles.closeBtn} onClick={onClose}>✕</button>
        
        <div style={styles.content}>
          <div style={styles.imageSection}>
            {book.cover ? (
              <img src={book.cover} alt={book.title} style={styles.cover} />
            ) : (
              <div style={styles.coverPlaceholder}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                </svg>
              </div>
            )}
            
            {book.badges?.includes('bestseller') && (
              <div style={styles.bestsellerBadge}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                </svg>
                Bestseller
              </div>
            )}
          </div>

          <div style={styles.detailsSection}>
            <div style={styles.category}>{book.category?.toUpperCase()}</div>
            <h2 style={styles.title}>{book.title}</h2>
            
            <div style={styles.authorRow}>
              {book.authorAvatar && (
                <img src={book.authorAvatar} alt={book.author} style={styles.authorAvatar} />
              )}
              <div>
                <span style={styles.authorLabel}>por</span>
                <span style={styles.authorName}>{book.author}</span>
              </div>
            </div>

            <div style={styles.ratingRow}>
              <div style={styles.stars}>{renderStars(book.rating)}</div>
              <span style={styles.ratingText}>
                {book.rating} ({book.ratingCount} reseñas)
              </span>
            </div>

            <p style={styles.description}>{book.description}</p>

            <div style={styles.metaGrid}>
              <div style={styles.metaItem}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={styles.metaIcon}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                <span style={styles.metaLabel}>Páginas</span>
                <span style={styles.metaValue}>{book.pages}</span>
              </div>
              <div style={styles.metaItem}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={styles.metaIcon}>
                  <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                <span style={styles.metaLabel}>Idioma</span>
                <span style={styles.metaValue}>{book.language || 'Español'}</span>
              </div>
              <div style={styles.metaItem}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={styles.metaIcon}>
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <span style={styles.metaLabel}>Publicado</span>
                <span style={styles.metaValue}>
                  {new Date(book.publishedDate).toLocaleDateString('es-ES', { 
                    year: 'numeric', 
                    month: 'short' 
                  })}
                </span>
              </div>
            </div>

            <div style={styles.formatSection}>
              <span style={styles.formatLabel}>Formatos disponibles:</span>
              <div style={styles.formatTags}>
                {book.format?.map(fmt => (
                  <span key={fmt} style={styles.formatTag}>
                    {fmt === 'ebook' && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>
                    )}
                    {fmt === 'pdf' && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    )}
                    {fmt === 'kindle' && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                    )}
                    {fmt.toUpperCase()}
                  </span>
                ))}
              </div>
            </div>

            <div style={styles.priceSection}>
              <div style={styles.priceMain}>
                <span style={styles.price}>${book.price?.toFixed(2)}</span>
                {book.originalPrice > book.price && (
                  <span style={styles.originalPrice}>${book.originalPrice?.toFixed(2)}</span>
                )}
                {book.discount > 0 && (
                  <span style={styles.discount}>-{book.discount}%</span>
                )}
              </div>
            </div>

            <div style={styles.actions}>
              <button style={styles.addToCartBtn} onClick={() => onAddToCart?.(book)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                </svg>
                Añadir al carrito
              </button>
              <button 
                style={{
                  ...styles.favoriteBtn,
                  ...(isFavorite ? styles.favoriteBtnActive : {})
                }}
                onClick={() => onToggleFavorite?.(book.id)}
              >
                {isFavorite ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                  </svg>
                )}
              </button>
            </div>

            {book.excerpt && (
              <div style={styles.excerptSection}>
                <div style={styles.excerptHeader}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                  </svg>
                  Vista previa
                </div>
                <div style={styles.excerptContent}>
                  {book.excerpt.substring(0, 300)}...
                </div>
                <button style={styles.readMoreBtn}>
                  Leer primer capítulo gratis →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '20px',
    backdropFilter: 'blur(4px)',
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: '20px',
    maxWidth: '900px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'hidden',
    position: 'relative',
    boxShadow: '0 25px 80px rgba(0,0,0,0.3)',
  },
  closeBtn: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    backgroundColor: '#f3f4f6',
    border: 'none',
    borderRadius: '50%',
    width: '36px',
    height: '36px',
    fontSize: '16px',
    cursor: 'pointer',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.2s',
  },
  content: {
    display: 'flex',
    maxHeight: '90vh',
    overflow: 'auto',
  },
  imageSection: {
    width: '320px',
    minWidth: '320px',
    backgroundColor: '#f8fafc',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cover: {
    width: '100%',
    maxWidth: '240px',
    height: 'auto',
    aspectRatio: '2/3',
    objectFit: 'cover',
    borderRadius: '8px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
  },
  coverPlaceholder: {
    width: '100%',
    maxWidth: '240px',
    aspectRatio: '2/3',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '80px',
    backgroundColor: '#e2e8f0',
    borderRadius: '8px',
  },
  bestsellerBadge: {
    marginTop: '16px',
    backgroundColor: '#ef4444',
    color: 'white',
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '700',
  },
  detailsSection: {
    flex: 1,
    padding: '32px',
    overflow: 'auto',
  },
  category: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#6366f1',
    letterSpacing: '1px',
    marginBottom: '8px',
  },
  title: {
    fontSize: '28px',
    fontWeight: '800',
    color: '#1e293b',
    margin: '0 0 16px 0',
    lineHeight: 1.2,
  },
  authorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  authorAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  authorLabel: {
    fontSize: '13px',
    color: '#9ca3af',
    marginRight: '4px',
  },
  authorName: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#4b5563',
    cursor: 'pointer',
  },
  ratingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '20px',
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
    fontSize: '14px',
    color: '#6b7280',
  },
  description: {
    fontSize: '15px',
    color: '#4b5563',
    lineHeight: 1.7,
    marginBottom: '24px',
  },
  metaGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '16px',
    marginBottom: '24px',
  },
  metaItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '12px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
    textAlign: 'center',
  },
  metaIcon: {
    fontSize: '20px',
  },
  metaLabel: {
    fontSize: '11px',
    color: '#9ca3af',
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  metaValue: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#1e293b',
  },
  formatSection: {
    marginBottom: '24px',
  },
  formatLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#4b5563',
    marginBottom: '10px',
    display: 'block',
  },
  formatTags: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  formatTag: {
    padding: '8px 14px',
    backgroundColor: '#f3f4f6',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#4b5563',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  priceSection: {
    marginBottom: '24px',
  },
  priceMain: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '12px',
  },
  price: {
    fontSize: '36px',
    fontWeight: '800',
    color: '#059669',
  },
  originalPrice: {
    fontSize: '20px',
    color: '#9ca3af',
    textDecoration: 'line-through',
  },
  discount: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#ef4444',
    backgroundColor: '#fee2e2',
    padding: '4px 10px',
    borderRadius: '6px',
  },
  actions: {
    display: 'flex',
    gap: '12px',
    marginBottom: '24px',
  },
  addToCartBtn: {
    flex: 1,
    padding: '16px 24px',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
    transition: 'transform 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  favoriteBtn: {
    padding: '16px 20px',
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
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
    color: '#ef4444',
  },
  excerptSection: {
    backgroundColor: '#f9fafb',
    borderRadius: '12px',
    padding: '20px',
  },
  excerptHeader: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  excerptContent: {
    fontSize: '13px',
    color: '#6b7280',
    lineHeight: 1.7,
    fontStyle: 'italic',
    marginBottom: '16px',
  },
  readMoreBtn: {
    background: 'none',
    border: 'none',
    color: '#6366f1',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    padding: 0,
  },
};

export default QuickViewModal;
