import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import { createBook, getUserBooks, deleteBook } from '../services/books';
import { UpgradeModal } from '../components/UpgradeModal';
import { SubscriptionBadge } from '../components/SubscriptionBadge';

export default function BooksPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { subscription, planConfig, canCreateBook } = useSubscription();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Load user's books
  useEffect(() => {
    const loadBooks = async () => {
      if (!user) return;

      try {
        const userBooks = await getUserBooks(user.uid);
        setBooks(userBooks);
      } catch (err) {
        console.error('Error loading books:', err);
        setError('Error al cargar los libros');
      } finally {
        setLoading(false);
      }
    };

    loadBooks();
  }, [user]);

  // Create new book
  const handleNewBook = async () => {
    if (!user) return;

    // Check subscription limits
    if (!canCreateBook(books.length)) {
      setShowUpgradeModal(true);
      return;
    }

    setCreating(true);
    try {
      const bookId = await createBook(user.uid, {
        title: 'Nuevo Libro',
        author: user.displayName || '',
        bookType: 'novela',
        pageFormat: '6x9',
      });

      // Navigate to editor with the new book
      navigate(`/app?bookId=${bookId}`);
    } catch (err) {
      console.error('Error creating book:', err);
      setError('Error al crear el libro');
      setCreating(false);
    }
  };

  // Open book in editor
  const handleOpenBook = (bookId) => {
    navigate(`/app?bookId=${bookId}`);
  };

  // Delete book with confirmation
  const handleDeleteBook = async (bookId, e) => {
    e.stopPropagation();

    if (!window.confirm('¿Estás seguro de que deseas eliminar este libro?')) {
      return;
    }

    try {
      await deleteBook(bookId);
      setBooks((prev) => prev.filter((b) => b.id !== bookId));
    } catch (err) {
      console.error('Error deleting book:', err);
      setError('Error al eliminar el libro');
    }
  };

  if (loading) {
    return <div style={styles.container}>Cargando libros...</div>;
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Mis Libros</h1>
          <p style={styles.subtitle}>
            Tienes {books.length} libro{books.length !== 1 ? 's' : ''} guardado
            {books.length !== 1 ? 's' : ''}
            {planConfig.maxBooks !== -1 && ` de ${planConfig.maxBooks}`}
          </p>
          <div style={styles.badge}>
            <SubscriptionBadge />
          </div>
        </div>
        <button
          onClick={handleNewBook}
          disabled={creating}
          style={{
            ...styles.newButton,
            opacity: creating ? 0.6 : 1,
            cursor: creating ? 'not-allowed' : 'pointer',
          }}
        >
          {creating ? 'Creando...' : '+ Nuevo Libro'}
        </button>
      </div>

      {/* Error message */}
      {error && <div style={styles.error}>{error}</div>}

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <UpgradeModal
          type="books"
          currentPlan={subscription.plan}
          planConfig={planConfig}
          onClose={() => setShowUpgradeModal(false)}
        />
      )}

      {/* Books grid or empty state */}
      {books.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>📚</div>
          <h2 style={styles.emptyTitle}>No tienes libros aún</h2>
          <p style={styles.emptyDescription}>
            Crea tu primer libro para empezar a escribir
          </p>
          <button onClick={handleNewBook} style={styles.emptyButton}>
            Crear Mi Primer Libro
          </button>
        </div>
      ) : (
        <div style={styles.grid}>
          {books.map((book) => (
            <div
              key={book.id}
              style={styles.card}
              onClick={() => handleOpenBook(book.id)}
            >
              <div style={styles.cardHeader}>
                <h3 style={styles.cardTitle}>{book.title}</h3>
                <button
                  onClick={(e) => handleDeleteBook(book.id, e)}
                  style={styles.deleteButton}
                  title="Eliminar"
                >
                  ✕
                </button>
              </div>

              <p style={styles.cardAuthor}>{book.author}</p>

              <div style={styles.cardMeta}>
                <span>📖 {book.chapterCount} capítulo{book.chapterCount !== 1 ? 's' : ''}</span>
                <span>📝 {book.wordCount} palabras</span>
              </div>

              <div style={styles.cardFooter}>
                <span style={styles.cardDate}>
                  {new Date(
                    book.updatedAt?.toDate?.() || book.updatedAt
                  ).toLocaleDateString('es-ES')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '40px 20px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '40px',
  },
  title: {
    fontSize: '32px',
    fontWeight: '700',
    color: '#1f2937',
    margin: '0 0 8px 0',
  },
  subtitle: {
    fontSize: '16px',
    color: '#6b7280',
    margin: '0 0 12px 0',
  },
  badge: {
    display: 'inline-block',
  },
  newButton: {
    padding: '12px 24px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  error: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: '12px 16px',
    borderRadius: '6px',
    marginBottom: '20px',
    fontSize: '14px',
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 20px',
    backgroundColor: '#f9fafb',
    borderRadius: '12px',
  },
  emptyIcon: {
    fontSize: '64px',
    marginBottom: '20px',
  },
  emptyTitle: {
    fontSize: '24px',
    fontWeight: '600',
    color: '#1f2937',
    margin: '0 0 12px 0',
  },
  emptyDescription: {
    fontSize: '16px',
    color: '#6b7280',
    margin: '0 0 24px 0',
  },
  emptyButton: {
    padding: '12px 32px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '20px',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    padding: '20px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    ':hover': {
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      transform: 'translateY(-4px)',
    },
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px',
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1f2937',
    margin: '0',
    flex: 1,
    wordBreak: 'break-word',
  },
  deleteButton: {
    padding: '4px 8px',
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    border: 'none',
    borderRadius: '4px',
    fontSize: '16px',
    cursor: 'pointer',
    fontWeight: '600',
    marginLeft: '8px',
    flexShrink: 0,
  },
  cardAuthor: {
    fontSize: '14px',
    color: '#6b7280',
    margin: '0 0 16px 0',
  },
  cardMeta: {
    display: 'flex',
    gap: '16px',
    fontSize: '13px',
    color: '#9ca3af',
    marginBottom: '12px',
  },
  cardFooter: {
    borderTop: '1px solid #e5e7eb',
    paddingTop: '12px',
  },
  cardDate: {
    fontSize: '12px',
    color: '#9ca3af',
  },
};
