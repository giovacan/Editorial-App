import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

/**
 * Create a new book
 * @param {string} uid - User ID (Firebase Auth UID)
 * @param {Object} bookData - Initial book data (title, author, bookType, pageFormat, margins)
 * @returns {Promise<string>} - Book ID (Firestore doc ID)
 */
export async function createBook(uid, bookData) {
  try {
    const booksRef = collection(db, 'books');
    const docRef = await addDoc(booksRef, {
      uid,
      title: bookData.title || '',
      author: bookData.author || '',
      bookType: bookData.bookType || 'novela',
      pageFormat: bookData.pageFormat || '6x9',
      margins: bookData.margins || {},
      chapterCount: 0,
      wordCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating book:', error);
    throw error;
  }
}

/**
 * Get a single book by ID
 * @param {string} bookId - Book ID
 * @returns {Promise<Object|null>} - Book data or null if not found
 */
export async function getBook(bookId) {
  try {
    const docRef = doc(db, 'books', bookId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
  } catch (error) {
    console.error('Error getting book:', error);
    throw error;
  }
}

/**
 * Update book metadata (title, author, pageFormat, margins, etc.)
 * Note: Does NOT update chapters — use saveChapters() for that
 * @param {string} bookId - Book ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
export async function updateBook(bookId, updates) {
  try {
    const docRef = doc(db, 'books', bookId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating book:', error);
    throw error;
  }
}

/**
 * Delete a book and all its chapters
 * @param {string} bookId - Book ID
 * @returns {Promise<void>}
 */
export async function deleteBook(bookId) {
  try {
    const batch = writeBatch(db);

    // Delete all chapters in the subcollection
    const chaptersRef = collection(db, 'books', bookId, 'chapters');
    const chaptersSnap = await getDocs(chaptersRef);
    chaptersSnap.forEach((chapterDoc) => {
      batch.delete(chapterDoc.ref);
    });

    // Delete the book document itself
    const bookRef = doc(db, 'books', bookId);
    batch.delete(bookRef);

    await batch.commit();
  } catch (error) {
    console.error('Error deleting book:', error);
    throw error;
  }
}

/**
 * Get all books for a user
 * @param {string} uid - User ID
 * @returns {Promise<Array>} - Array of book objects with id
 */
export async function getUserBooks(uid) {
  try {
    const booksRef = collection(db, 'books');
    const q = query(
      booksRef,
      where('uid', '==', uid),
      orderBy('updatedAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    const books = [];
    querySnapshot.forEach((doc) => {
      books.push({ id: doc.id, ...doc.data() });
    });
    return books;
  } catch (error) {
    console.error('Error getting user books:', error);
    throw error;
  }
}

/**
 * Subscribe to a single book with real-time updates
 * @param {string} bookId - Book ID
 * @param {Function} callback - Called with updated book data
 * @returns {Function} - Unsubscribe function
 */
export function subscribeToBook(bookId, callback) {
  try {
    const docRef = doc(db, 'books', bookId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        callback({ id: docSnap.id, ...docSnap.data() });
      } else {
        callback(null);
      }
    });
    return unsubscribe;
  } catch (error) {
    console.error('Error subscribing to book:', error);
    throw error;
  }
}

/**
 * Get all chapters for a book
 * @param {string} bookId - Book ID
 * @returns {Promise<Array>} - Array of Chapter objects
 */
export async function getChapters(bookId) {
  try {
    const chaptersRef = collection(db, 'books', bookId, 'chapters');
    const q = query(chaptersRef, orderBy('order', 'asc'));
    const querySnapshot = await getDocs(q);
    const chapters = [];
    querySnapshot.forEach((doc) => {
      chapters.push({ id: doc.id, ...doc.data() });
    });
    return chapters;
  } catch (error) {
    console.error('Error getting chapters:', error);
    throw error;
  }
}

/**
 * Save all chapters for a book (batch write)
 * Call this when loading a book or doing a bulk update
 * @param {string} bookId - Book ID
 * @param {Array} chapters - Array of Chapter objects
 * @returns {Promise<void>}
 */
export async function saveChapters(bookId, chapters) {
  try {
    const batch = writeBatch(db);

    // Calculate total word count and chapter count
    let totalWords = 0;
    chapters.forEach((chapter) => {
      totalWords += chapter.wordCount || 0;
    });

    // Delete existing chapters (to avoid conflicts with concurrent edits)
    const chaptersRef = collection(db, 'books', bookId, 'chapters');
    const existingChapters = await getDocs(chaptersRef);
    existingChapters.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Write new chapters
    chapters.forEach((chapter, index) => {
      const chapterDocRef = doc(
        db,
        'books',
        bookId,
        'chapters',
        chapter.id
      );
      batch.set(chapterDocRef, {
        id: chapter.id,
        type: chapter.type,
        title: chapter.title,
        html: chapter.html,
        wordCount: chapter.wordCount || 0,
        order: index,
        updatedAt: serverTimestamp(),
      });
    });

    // Update book metadata with chapter count and word count
    const bookRef = doc(db, 'books', bookId);
    batch.update(bookRef, {
      chapterCount: chapters.length,
      wordCount: totalWords,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    console.error('Error saving chapters:', error);
    throw error;
  }
}

/**
 * Subscribe to chapters for a book with real-time updates
 * @param {string} bookId - Book ID
 * @param {Function} callback - Called with updated chapters array
 * @returns {Function} - Unsubscribe function
 */
export function subscribeToChapters(bookId, callback) {
  try {
    const chaptersRef = collection(db, 'books', bookId, 'chapters');
    const q = query(chaptersRef, orderBy('order', 'asc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const chapters = [];
      querySnapshot.forEach((doc) => {
        chapters.push({ id: doc.id, ...doc.data() });
      });
      callback(chapters);
    });
    return unsubscribe;
  } catch (error) {
    console.error('Error subscribing to chapters:', error);
    throw error;
  }
}

/**
 * Update a single chapter
 * @param {string} bookId - Book ID
 * @param {string} chapterId - Chapter ID
 * @param {Object} updates - Fields to update (html, title, wordCount, etc.)
 * @returns {Promise<void>}
 */
export async function updateChapter(bookId, chapterId, updates) {
  try {
    const chapterRef = doc(db, 'books', bookId, 'chapters', chapterId);
    await updateDoc(chapterRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating chapter:', error);
    throw error;
  }
}

/**
 * Delete a single chapter
 * @param {string} bookId - Book ID
 * @param {string} chapterId - Chapter ID
 * @returns {Promise<void>}
 */
export async function deleteChapter(bookId, chapterId) {
  try {
    const chapterRef = doc(db, 'books', bookId, 'chapters', chapterId);
    await deleteDoc(chapterRef);
  } catch (error) {
    console.error('Error deleting chapter:', error);
    throw error;
  }
}
