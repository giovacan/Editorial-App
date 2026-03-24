export function MoodCategories({ onSelectMood }) {
  const moods = [
    { id: 'drama', emoji: '😢', label: 'Drama', description: 'Emocionante', color: '#8b5cf6' },
    { id: 'comedy', emoji: '😂', label: 'Comedia', description: 'Para reír', color: '#f59e0b' },
    { id: 'terror', emoji: '😱', label: 'Terror', description: 'Suspenso', color: '#ef4444' },
    { id: 'romance', emoji: '💕', label: 'Romance', description: 'Amor', color: '#ec4899' },
    { id: 'learning', emoji: '🧠', label: 'Aprendizaje', description: 'Crecimiento', color: '#3b82f6' },
    { id: 'inspiration', emoji: '🌟', label: 'Inspiración', description: 'Motivación', color: '#10b981' },
    { id: 'sleep', emoji: '🌙', label: 'Para dormir', description: 'Relajación', color: '#6366f1' },
    { id: 'adventure', emoji: '⚔️', label: 'Aventura', description: 'Acción', color: '#f97316' },
  ];

  return (
    <section style={styles.container}>
      <h2 style={styles.title}>🎯 ¿Qué buscas hoy?</h2>
      <p style={styles.subtitle}>Explora por mood, no solo por género</p>
      
      <div style={styles.grid}>
        {moods.map(mood => (
          <button
            key={mood.id}
            style={{...styles.moodCard, '--mood-color': mood.color}}
            onClick={() => onSelectMood?.(mood.id)}
          >
            <span style={styles.emoji}>{mood.emoji}</span>
            <span style={styles.label}>{mood.label}</span>
            <span style={styles.description}>{mood.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

const styles = {
  container: {
    padding: '40px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  title: {
    fontSize: '28px',
    fontWeight: '800',
    color: '#1e293b',
    margin: '0 0 8px 0',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: '16px',
    color: '#6b7280',
    margin: '0 0 32px 0',
    textAlign: 'center',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '16px',
  },
  moodCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '24px 16px',
    backgroundColor: 'white',
    border: '2px solid #f0f0f0',
    borderRadius: '16px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    position: 'relative',
    overflow: 'hidden',
  },
  emoji: {
    fontSize: '36px',
    marginBottom: '4px',
  },
  label: {
    fontSize: '15px',
    fontWeight: '700',
    color: '#1e293b',
  },
  description: {
    fontSize: '12px',
    color: '#9ca3af',
    fontWeight: '500',
  },
};

export default MoodCategories;
