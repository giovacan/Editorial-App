const RECENT_BOOKS_KEY = 'editorial-app-recent-books';
const MAX_RECENT = 10;

export const getRecentBooks = () => {
  try {
    const stored = localStorage.getItem(RECENT_BOOKS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Error loading recent books:', e);
  }
  return [];
};

export const addRecentBook = (book) => {
  try {
    const recent = getRecentBooks();
    
    const filtered = recent.filter(b => b.id !== book.id);
    
    const newRecent = [
      { ...book, lastOpened: Date.now() },
      ...filtered
    ].slice(0, MAX_RECENT);
    
    localStorage.setItem(RECENT_BOOKS_KEY, JSON.stringify(newRecent));
    
    return newRecent;
  } catch (e) {
    console.error('Error saving recent book:', e);
  }
};

export const removeRecentBook = (bookId) => {
  try {
    const recent = getRecentBooks();
    const filtered = recent.filter(b => b.id !== bookId);
    localStorage.setItem(RECENT_BOOKS_KEY, JSON.stringify(filtered));
    return filtered;
  } catch (e) {
    console.error('Error removing recent book:', e);
  }
};

export const clearRecentBooks = () => {
  try {
    localStorage.removeItem(RECENT_BOOKS_KEY);
  } catch (e) {
    console.error('Error clearing recent books:', e);
  }
};

export default { getRecentBooks, addRecentBook, removeRecentBook, clearRecentBooks };
