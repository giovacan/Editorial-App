import { useEffect, useRef } from 'react';
import useEditorStore from '../store/useEditorStore';
import {
  getBook,
  getChapters,
  subscribeToBook,
  subscribeToChapters,
  saveChapters,
  updateBook,
} from '../services/books';

/**
 * Hook to synchronize the editor store with Firestore
 * Handles:
 * - Initial load of book metadata and chapters
 * - Real-time subscriptions to book changes
 * - Debounced writes back to Firestore on local mutations
 * @param {string} bookId - The Firestore book ID to sync with
 */
export function useBookSync(bookId) {
  const store = useEditorStore();
  const unsubscribeRefs = useRef({});
  const writeTimeoutRef = useRef({});

  useEffect(() => {
    if (!bookId) {
      console.warn('useBookSync: bookId not provided');
      return;
    }

    let isMounted = true;

    /**
     * Load initial book data from Firestore
     */
    const loadBook = async () => {
      try {
        // Get book metadata and chapters
        const [bookData, chaptersData] = await Promise.all([
          getBook(bookId),
          getChapters(bookId),
        ]);

        if (!isMounted) return;

        if (bookData) {
          // Merge chapters into bookData
          const bookWithChapters = {
            ...bookData,
            chapters: chaptersData,
          };

          // Load into store
          store.loadBook(bookWithChapters);
        } else {
          console.error(`Book ${bookId} not found`);
        }
      } catch (error) {
        console.error('Error loading book:', error);
      }
    };

    // Initial load
    loadBook();

    // Subscribe to real-time book metadata changes
    unsubscribeRefs.current.book = subscribeToBook(bookId, (updatedBook) => {
      if (!isMounted || !updatedBook) return;

      // Update store with new metadata (but preserve chapters)
      const currentBookData = store.bookData;
      store.setBookData({
        ...currentBookData,
        title: updatedBook.title,
        author: updatedBook.author,
        bookType: updatedBook.bookType,
        pageFormat: updatedBook.pageFormat,
        margins: updatedBook.margins,
      });
    });

    // Subscribe to real-time chapter changes
    unsubscribeRefs.current.chapters = subscribeToChapters(
      bookId,
      (updatedChapters) => {
        if (!isMounted) return;
        // Update store with new chapters
        store.loadContent(updatedChapters);
      }
    );

    // Cleanup subscriptions on unmount or bookId change
    return () => {
      isMounted = false;
      if (unsubscribeRefs.current.book) {
        unsubscribeRefs.current.book();
      }
      if (unsubscribeRefs.current.chapters) {
        unsubscribeRefs.current.chapters();
      }
      // Cancel any pending writes
      Object.values(writeTimeoutRef.current).forEach(clearTimeout);
    };
  }, [bookId, store]);

  /**
   * Debounced write to Firestore for book metadata
   */
  useEffect(() => {
    if (!bookId) return;

    // Cancel previous timeout
    if (writeTimeoutRef.current.metadata) {
      clearTimeout(writeTimeoutRef.current.metadata);
    }

    // Debounce 1500ms before writing
    writeTimeoutRef.current.metadata = setTimeout(async () => {
      const { title, author, bookType, pageFormat, margins } = store.bookData;

      try {
        await updateBook(bookId, {
          title,
          author,
          bookType,
          pageFormat,
          margins,
        });
      } catch (error) {
        console.error('Error syncing book metadata to Firestore:', error);
      }
    }, 1500);

    return () => {
      if (writeTimeoutRef.current.metadata) {
        clearTimeout(writeTimeoutRef.current.metadata);
      }
    };
  }, [
    bookId,
    store.bookData.title,
    store.bookData.author,
    store.bookData.bookType,
    store.bookData.pageFormat,
    store.bookData.margins,
  ]);

  /**
   * Debounced write to Firestore for chapters
   * (triggered by any change to the chapters array or individual chapter content)
   */
  useEffect(() => {
    if (!bookId) return;

    // Cancel previous timeout
    if (writeTimeoutRef.current.chapters) {
      clearTimeout(writeTimeoutRef.current.chapters);
    }

    // Debounce 1500ms before writing
    writeTimeoutRef.current.chapters = setTimeout(async () => {
      const { chapters } = store.bookData;

      try {
        await saveChapters(bookId, chapters);
      } catch (error) {
        console.error('Error syncing chapters to Firestore:', error);
      }
    }, 1500);

    return () => {
      if (writeTimeoutRef.current.chapters) {
        clearTimeout(writeTimeoutRef.current.chapters);
      }
    };
  }, [bookId, store.bookData.chapters]);

  /**
   * Flush pending writes immediately (e.g., on save button click)
   */
  return {
    flushWrites: async () => {
      // Cancel pending timeouts and write immediately
      Object.values(writeTimeoutRef.current).forEach(clearTimeout);

      const { title, author, bookType, pageFormat, margins, chapters } =
        store.bookData;

      try {
        await Promise.all([
          updateBook(bookId, {
            title,
            author,
            bookType,
            pageFormat,
            margins,
          }),
          saveChapters(bookId, chapters),
        ]);
      } catch (error) {
        console.error('Error flushing writes:', error);
        throw error;
      }
    },
  };
}
