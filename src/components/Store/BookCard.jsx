import { useState } from 'react';

const BADGE_CONFIG = {
  bestseller: { label: 'Bestseller', color: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' },
  'staff-pick': { label: 'Staff Pick', color: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)' },
  new: { label: 'Nuevo', color: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' },
  'top-rated': { label: 'Top Rated', color: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' },
  'award-winning': { label: 'Award Winning', color: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)' },
};

export function BookCard({ book, onQuickView, onAddToCart, onToggleFavorite, isFavorite = false, onClick }) {
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false);

  const mainBadge = book.badges?.[0];
  const badgeConfig = mainBadge ? BADGE_CONFIG[mainBadge] : null;

  const formatPrice = (price) => {
    return price.toFixed(2);
  };

  const renderStars = (rating) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalf = rating % 1 >= 0.5;
    
    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars.push(<span key={i} style={styles.starFilled}>★</span>);
      } else if (i === fullStars && hasHalf) {
        stars.push(<span key={i} style={styles.starHalf}>★</span>);
      } else {
        stars.push(<span key={i} style={styles.starEmpty}>★</span>);
      }
    }
    return stars;
  };

  const ratingPercent = (book.rating / 5) * 100;

  return (
    <div 
      style={{
        ...styles.card,
        ...(isHovered ? styles.cardHover : {})
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      tabIndex={0}
    >
      <div style={styles.imageContainer}>
        {!imageError && book.cover ? (
          <img 
            src={book.cover} 
            alt={book.title}
            style={{
              ...styles.coverImage,
              ...(isHovered ? styles.coverImageHover : {})
            }}
            onError={() => setImageError(true)}
          />
        ) : (
          <div style={styles.coverPlaceholder}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
          </div>
        )}
        
        {badgeConfig && (
          <div style={{...styles.badge, background: badgeConfig.color}}>
            {badgeConfig.label}
          </div>
        )}

        {book.discount > 0 && (
          <div style={styles.discountBadge}>
            -{book.discount}%
          </div>
        )}

        {book.format && book.format.includes('kindle') && (
          <div style={styles.formatBadge}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            Kindle
          </div>
        )}

        <div style={{
          ...styles.quickActions,
          opacity: isHovered ? 1 : 0,
          transform: isHovered ? 'translateY(0)' : 'translateY(10px)'
        }}>
          <button 
            style={styles.quickViewBtn}
            onClick={() => onQuickView?.(book)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
            </svg>
            Ver rápido
          </button>
        </div>
      </div>

      <div style={styles.content}>
        <h3 style={styles.title} title={book.title}>{book.title}</h3>
        
        <div style={styles.authorRow}>
          {book.authorAvatar && !imageError && (
            <img 
              src={book.authorAvatar} 
              alt={book.author}
              style={styles.authorAvatar}
              onError={(e) => e.target.style.display = 'none'}
            />
          )}
          <span style={styles.author}>{book.author}</span>
        </div>

        <div style={styles.ratingRow}>
          <div style={styles.starsContainer}>
            {renderStars(book.rating)}
          </div>
          <span style={styles.ratingNumber}>{book.rating}</span>
          <span style={styles.ratingCount}>({book.ratingCount})</span>
        </div>

        <div style={styles.ratingBar}>
          <div style={{...styles.ratingBarFill, width: `${ratingPercent}%`}} />
        </div>

        <div style={styles.metaRow}>
          <span style={styles.downloads}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {book.downloads?.toLocaleString()}
          </span>
          <span style={styles.pages}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            {book.pages} páginas
          </span>
        </div>

        <div style={styles.priceRow}>
          <span style={styles.price}>${formatPrice(book.price)}</span>
          {book.originalPrice > book.price && (
            <span style={styles.originalPrice}>${formatPrice(book.originalPrice)}</span>
          )}
        </div>

        <div style={styles.actionRow}>
          <button 
            style={styles.addToCartBtn}
            onClick={() => onAddToCart?.(book)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            )}
          </button>
        </div>

        <div style={styles.formatRow}>
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
    </div>
  );
}

const styles = {
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    border: '1px solid #f0f0f0',
    display: 'flex',
    flexDirection: 'column',
    outline: 'none',
  },
  cardHover: {
    transform: 'translateY(-8px)',
    boxShadow: '0 20px 40px rgba(0,0,0,0.12)',
    outline: 'none',
  },
  imageContainer: {
    position: 'relative',
    height: '220px',
    overflow: 'hidden',
    backgroundColor: '#f8fafc',
    outline: 'none',
  },
  coverImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transition: 'transform 0.4s ease',
    outline: 'none',
  },
  coverImageHover: {
    transform: 'scale(1.08)',
    outline: 'none',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)',
  },
  placeholderIcon: {
    fontSize: '64px',
    opacity: 0.5,
  },
  badge: {
    position: 'absolute',
    top: '12px',
    left: '12px',
    padding: '6px 12px',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: '700',
    color: 'white',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    textShadow: '0 1px 2px rgba(0,0,0,0.2)',
  },
  discountBadge: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    backgroundColor: '#ef4444',
    color: 'white',
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '800',
    boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
  },
  formatBadge: {
    position: 'absolute',
    bottom: '12px',
    right: '12px',
    backgroundColor: 'rgba(0,0,0,0.7)',
    color: 'white',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: '600',
  },
  quickActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: '12px',
    background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
    display: 'flex',
    justifyContent: 'center',
    transition: 'all 0.3s ease',
  },
  quickViewBtn: {
    padding: '10px 20px',
    backgroundColor: 'white',
    color: '#1e293b',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
    cursor: 'pointer',
  },
  content: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    flex: 1,
  },
  title: {
    fontSize: '15px',
    fontWeight: '700',
    color: '#1e293b',
    margin: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    lineHeight: 1.3,
  },
  authorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  authorAvatar: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  author: {
    fontSize: '13px',
    color: '#64748b',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'color 0.2s',
  },
  ratingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  starsContainer: {
    display: 'flex',
    gap: '1px',
  },
  starFilled: {
    color: '#fbbf24',
    fontSize: '14px',
  },
  starHalf: {
    color: '#fbbf24',
    fontSize: '14px',
    opacity: 0.5,
  },
  starEmpty: {
    color: '#d1d5db',
    fontSize: '14px',
  },
  ratingNumber: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#1e293b',
  },
  ratingCount: {
    fontSize: '12px',
    color: '#9ca3af',
  },
  ratingBar: {
    width: '100%',
    height: '4px',
    backgroundColor: '#e5e7eb',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  ratingBarFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
    borderRadius: '2px',
    transition: 'width 0.3s ease',
  },
  metaRow: {
    display: 'flex',
    gap: '12px',
    fontSize: '11px',
    color: '#9ca3af',
  },
  downloads: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  pages: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  priceRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    marginTop: '4px',
  },
  price: {
    fontSize: '20px',
    fontWeight: '800',
    color: '#059669',
  },
  originalPrice: {
    fontSize: '14px',
    color: '#9ca3af',
    textDecoration: 'line-through',
  },
  actionRow: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
  },
  addToCartBtn: {
    flex: 1,
    padding: '12px 16px',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
    transition: 'transform 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  },
  favoriteBtn: {
    padding: '12px',
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
    border: 'none',
    borderRadius: '10px',
    fontSize: '16px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  favoriteBtnActive: {
    backgroundColor: '#fee2e2',
    color: '#ef4444',
  },
  formatRow: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
    marginTop: '4px',
  },
  formatTag: {
    padding: '3px 8px',
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
};

export default BookCard;
