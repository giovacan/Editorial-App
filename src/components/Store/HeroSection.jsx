import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export function HeroSection({ featuredBook, onViewDeal }) {
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const targetDate = new Date();
    targetDate.setHours(targetDate.getHours() + 24);
    
    const timer = setInterval(() => {
      const now = new Date();
      const diff = targetDate - now;
      
      if (diff > 0) {
        setTimeLeft({
          hours: Math.floor(diff / (1000 * 60 * 60)),
          minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((diff % (1000 * 60)) / 1000),
        });
      }
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);

  const formatTime = (num) => String(num).padStart(2, '0');

  if (!featuredBook) return null;

  return (
    <section style={styles.hero}>
      <div style={styles.heroContent}>
        <div style={styles.badge}>
          ⚡ Oferta del día
        </div>
        
        <h1 style={styles.title}>
          {featuredBook.title}
        </h1>
        
        <p style={styles.author}>
          por <strong>{featuredBook.author}</strong>
        </p>
        
        <p style={styles.description}>
          {featuredBook.description?.substring(0, 120)}...
        </p>

        <div style={styles.priceRow}>
          <span style={styles.price}>${featuredBook.price?.toFixed(2)}</span>
          <span style={styles.originalPrice}>${featuredBook.originalPrice?.toFixed(2)}</span>
          <span style={styles.discount}>-{featuredBook.discount}%</span>
        </div>

        <div style={styles.countdown}>
          <span style={styles.countdownLabel}>La oferta termina en:</span>
          <div style={styles.timer}>
            <div style={styles.timeBlock}>
              <span style={styles.timeNumber}>{formatTime(timeLeft.hours)}</span>
              <span style={styles.timeLabel}>Horas</span>
            </div>
            <span style={styles.timeSeparator}>:</span>
            <div style={styles.timeBlock}>
              <span style={styles.timeNumber}>{formatTime(timeLeft.minutes)}</span>
              <span style={styles.timeLabel}>Min</span>
            </div>
            <span style={styles.timeSeparator}>:</span>
            <div style={styles.timeBlock}>
              <span style={styles.timeNumber}>{formatTime(timeLeft.seconds)}</span>
              <span style={styles.timeLabel}>Seg</span>
            </div>
          </div>
        </div>

        <div style={styles.actions}>
          <button 
            style={styles.ctaBtn}
            onClick={() => onViewDeal?.(featuredBook)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            🛒 Ver Oferta
          </button>
          <Link to="/app" style={styles.secondaryBtn}>
            ✍️ Crear tu libro
          </Link>
        </div>

        <div style={styles.stats}>
          <span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {featuredBook.downloads?.toLocaleString()} descargas
          </span>
          <span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            {featuredBook.rating} rating
          </span>
          <span>💬 {featuredBook.ratingCount} reseñas</span>
        </div>
      </div>

      <div style={styles.heroImage}>
        {featuredBook.cover ? (
          <img 
            src={featuredBook.cover} 
            alt={featuredBook.title}
            style={styles.coverImage}
          />
        ) : (
          <div style={styles.coverPlaceholder}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
          </div>
        )}
        <div style={styles.glow} />
      </div>
    </section>
  );
}

const styles = {
  hero: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '40px 48px',
    background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)',
    borderRadius: '24px',
    marginBottom: '40px',
    position: 'relative',
    overflow: 'hidden',
  },
  heroContent: {
    flex: 1,
    maxWidth: '650px',
    zIndex: 1,
  },
  badge: {
    display: 'inline-block',
    backgroundColor: '#fbbf24',
    color: '#1e1b4b',
    padding: '8px 16px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: '800',
    marginBottom: '20px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  title: {
    fontSize: '42px',
    fontWeight: '800',
    color: 'white',
    margin: '0 0 12px 0',
    lineHeight: 1.1,
    textShadow: '0 2px 20px rgba(0,0,0,0.3)',
  },
  author: {
    fontSize: '18px',
    color: 'rgba(255,255,255,0.7)',
    margin: '0 0 20px 0',
  },
  description: {
    fontSize: '16px',
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 1.6,
    margin: '0 0 24px 0',
  },
  priceRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '16px',
    marginBottom: '24px',
  },
  price: {
    fontSize: '40px',
    fontWeight: '800',
    color: '#10b981',
  },
  originalPrice: {
    fontSize: '22px',
    color: 'rgba(255,255,255,0.5)',
    textDecoration: 'line-through',
  },
  discount: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#fbbf24',
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: '4px 12px',
    borderRadius: '8px',
  },
  countdown: {
    marginBottom: '28px',
  },
  countdownLabel: {
    display: 'block',
    fontSize: '13px',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: '10px',
    fontWeight: '500',
  },
  timer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  timeBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: '10px 16px',
    borderRadius: '10px',
    backdropFilter: 'blur(10px)',
    minWidth: '60px',
  },
  timeNumber: {
    fontSize: '24px',
    fontWeight: '800',
    color: 'white',
  },
  timeLabel: {
    fontSize: '10px',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  timeSeparator: {
    fontSize: '28px',
    fontWeight: '800',
    color: 'rgba(255,255,255,0.3)',
  },
  actions: {
    display: 'flex',
    gap: '16px',
    marginBottom: '24px',
  },
  ctaBtn: {
    padding: '16px 36px',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 8px 25px rgba(16, 185, 129, 0.4)',
    transition: 'transform 0.2s',
  },
  secondaryBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '16px 28px',
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: 'white',
    border: '2px solid rgba(255,255,255,0.2)',
    borderRadius: '12px',
    textDecoration: 'none',
    fontSize: '15px',
    fontWeight: '600',
    backdropFilter: 'blur(10px)',
    transition: 'background 0.2s',
  },
  stats: {
    display: 'flex',
    gap: '24px',
    fontSize: '13px',
    color: 'rgba(255,255,255,0.5)',
  },
  heroImage: {
    position: 'relative',
    width: '380px',
    height: '520px',
    flexShrink: 0,
  },
  coverImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: '12px',
    boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
    transform: 'rotateY(-10deg) rotateX(5deg)',
    transition: 'transform 0.3s ease',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '100px',
    backgroundColor: '#e2e8f0',
    borderRadius: '12px',
  },
  glow: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '280%',
    height: '280%',
    background: 'radial-gradient(circle, rgba(251, 191, 36, 0.3) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
};

export default HeroSection;
