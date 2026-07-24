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
  // IMPORTANT: do NOT subscribe to the whole store (`useEditorStore()`), or this
  // hook re-renders on EVERY state change and its subscribe effect (dep `store`)
  // tears down + re-runs loadBook() constantly — which re-loaded the book on a
  // loop, churning bookData identity so pagination never finished (stuck at 0)
  // and the active chapter kept resetting. Read actions via getState() (stable)
  // and subscribe reactively only to the specific fields the write effects need.
  const unsubscribeRefs = useRef({});
  const writeTimeoutRef = useRef({});

  useEffect(() => {
    if (!bookId) {
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
          useEditorStore.getState().loadBook(bookWithChapters);
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

      // Update store with new metadata (but preserve chapters). Skip if nothing
      // meaningful changed, so a self-echo metadata snapshot doesn't churn
      // bookData identity (which would restart pagination).
      const st = useEditorStore.getState();
      const cur = st.bookData;
      if (cur.title === updatedBook.title && cur.author === updatedBook.author
        && cur.bookType === updatedBook.bookType && cur.pageFormat === updatedBook.pageFormat) {
        return;
      }
      st.setBookData({
        ...cur,
        title: updatedBook.title,
        author: updatedBook.author,
        bookType: updatedBook.bookType,
        pageFormat: updatedBook.pageFormat,
        margins: updatedBook.margins,
      });
    });

    // Subscribe to real-time chapter changes. Use syncChaptersFromCloud (NOT
    // loadContent) so a background snapshot only updates data and never flips
    // the view — otherwise "Nuevo libro" flashes the UploadArea then hides it.
    unsubscribeRefs.current.chapters = subscribeToChapters(
      bookId,
      (updatedChapters) => {
        if (!isMounted) return;
        useEditorStore.getState().syncChaptersFromCloud(updatedChapters);
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
  }, [bookId]);

  // Reactive selectors — the ONLY store state this hook subscribes to. These
  // drive the debounced writes without re-subscribing the whole hook.
  const metaTitle = useEditorStore((s) => s.bookData.title);
  const metaAuthor = useEditorStore((s) => s.bookData.author);
  const metaBookType = useEditorStore((s) => s.bookData.bookType);
  const metaPageFormat = useEditorStore((s) => s.bookData.pageFormat);
  const metaMargins = useEditorStore((s) => s.bookData.margins);
  const chaptersSel = useEditorStore((s) => s.bookData.chapters);

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
      const { title, author, bookType, pageFormat, margins } = useEditorStore.getState().bookData;

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
  }, [bookId, metaTitle, metaAuthor, metaBookType, metaPageFormat, metaMargins]);

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
      const { chapters } = useEditorStore.getState().bookData;

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
  }, [bookId, chaptersSel]);

  /**
   * Flush pending writes immediately (e.g., on save button click)
   */
  return {
    flushWrites: async () => {
      // Cancel pending timeouts and write immediately
      Object.values(writeTimeoutRef.current).forEach(clearTimeout);

      const { title, author, bookType, pageFormat, margins, chapters } =
        useEditorStore.getState().bookData;

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
