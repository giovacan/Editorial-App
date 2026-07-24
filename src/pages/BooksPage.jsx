import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import { createBook, getUserBooks, deleteBook } from '../services/books';
import { UpgradeModal } from '../components/UpgradeModal';
import { SubscriptionBadge } from '../components/SubscriptionBadge';
import './BooksPage.css';

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
    return <div className="lx-books__loading">Cargando libros…</div>;
  }

  return (
    <div className="lx-books">
      <div className="lx-books__inner">
        {/* Header */}
        <div className="lx-books__header">
          <div>
            <div className="lx-books__brand">
              <span className="lx-books__logo">L</span>
              <span className="lx-books__wordmark">Librox</span>
            </div>
            <h1 className="lx-books__title">Mis Libros</h1>
            <p className="lx-books__subtitle">
              Tienes {books.length} libro{books.length !== 1 ? 's' : ''} guardado
              {books.length !== 1 ? 's' : ''}
              {planConfig.maxBooks !== -1 && ` de ${planConfig.maxBooks}`}
            </p>
            <div className="lx-books__badge">
              <SubscriptionBadge />
            </div>
          </div>
          <button
            className="lx-btn-primary"
            onClick={handleNewBook}
            disabled={creating}
          >
            {creating ? 'Creando…' : '+ Nuevo Libro'}
          </button>
        </div>

        {/* Error message */}
        {error && <div className="lx-books__error">{error}</div>}

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
          <div className="lx-books__empty">
            <div className="lx-books__empty-icon">📚</div>
            <h2 className="lx-books__empty-title">No tienes libros aún</h2>
            <p className="lx-books__empty-desc">
              Crea tu primer libro para empezar a escribir
            </p>
            <button className="lx-btn-primary" onClick={handleNewBook}>
              Crear mi primer libro
            </button>
          </div>
        ) : (
          <div className="lx-books__grid">
            {books.map((book) => (
              <div
                key={book.id}
                className="lx-book-card"
                role="button"
                tabIndex={0}
                onClick={() => handleOpenBook(book.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleOpenBook(book.id);
                  }
                }}
              >
                <div className="lx-book-card__head">
                  <h3 className="lx-book-card__title">{book.title}</h3>
                  <button
                    className="lx-book-card__delete"
                    onClick={(e) => handleDeleteBook(book.id, e)}
                    title="Eliminar"
                    aria-label={`Eliminar ${book.title}`}
                  >
                    ✕
                  </button>
                </div>

                <p className="lx-book-card__author">{book.author}</p>

                <div className="lx-book-card__meta">
                  <span>📖 {book.chapterCount} capítulo{book.chapterCount !== 1 ? 's' : ''}</span>
                  <span>📝 {book.wordCount} palabras</span>
                </div>

                <div className="lx-book-card__footer">
                  <span className="lx-book-card__date">
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
    </div>
  );
}
