import { create } from 'zustand';
import type { EditorState, Chapter } from '../types';

const STORAGE_KEY = 'editorial-app-storage';

const loadFromStorage = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.bookData && parsed.bookData.chapters) {
        return parsed;
      }
      if (parsed.document && parsed.document.chapters) {
        return { bookData: parsed.document, config: parsed.config };
      }
    }
  } catch (e) {
    console.error('Error loading from storage:', e);
  }
  return null;
};

const saveToStorage = (state: EditorState) => {
  try {
    const toSave = {
      bookData: state.bookData,
      config: state.config
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.error('Error saving to storage:', e);
  }
};

const initialState = {
  bookData: {
    title: '',
    author: '',
    chapters: [],
    bookType: 'novela' as const,
    pageFormat: '6x9',
    margins: {}
  },
  editing: {
    activeChapterId: null,
    isDirty: false
  },
  config: {
    pageFormat: 'a5',
    fontSize: 12,
    fontFamily: 'Georgia, serif',
    lineHeight: 1.6,
    chaptersOnRight: true,
    showPageNumbers: true,
    pageNumberPos: 'bottom' as const,
    pageNumberAlign: 'center' as const,
    showHeaders: false,
    headerContent: 'both' as const,
    headerPosition: 'top' as const,
    headerLine: true
  },
  ui: {
    showPreview: false,
    showUpload: true,
    activeTab: 'structure' as const
  }
};

const savedState = loadFromStorage();

const useEditorStore = create<EditorState>()(
  (set, get) => ({
    ...(savedState || initialState),

    setBookData: (bookData) => {
      set((state) => {
        const newState = { bookData: { ...state.bookData, ...bookData } };
        saveToStorage(newState as EditorState);
        return newState;
      });
    },
    
    setConfig: (config) => {
      set((state) => {
        const newState = { config: { ...state.config, ...config } };
        saveToStorage(newState as EditorState);
        return newState;
      });
    },
    
    setUi: (ui) => set((state) => ({ ui: { ...state.ui, ...ui } })),

    addChapter: (title) => {
      const chapter: Chapter = {
        id: `chapter-${Date.now()}`,
        type: 'chapter',
        title: title || 'Sin título',
        html: '<p>Comienza a escribir aquí...</p>',
        wordCount: 0
      };
      set((state) => {
        const newState = {
          bookData: { ...state.bookData, chapters: [...(state.bookData?.chapters || []), chapter] },
          editing: { ...state.editing, activeChapterId: chapter.id }
        };
        saveToStorage(newState as EditorState);
        return newState;
      });
      return chapter;
    },

    addSection: (title) => {
      const section: Chapter = {
        id: `section-${Date.now()}`,
        type: 'section',
        title: title || 'Nueva sección',
        html: '<p>Escribe el contenido de esta sección...</p>',
        wordCount: 0
      };
      set((state) => {
        const newState = {
          bookData: { ...state.bookData, chapters: [...(state.bookData?.chapters || []), section] },
          editing: { ...state.editing, activeChapterId: section.id }
        };
        saveToStorage(newState as EditorState);
        return newState;
      });
      return section;
    },

    updateChapter: (id, updates) => set((state) => {
      const newState = {
        bookData: {
          ...state.bookData,
          chapters: (state.bookData?.chapters || []).map(ch => 
            ch.id === id ? { ...ch, ...updates } : ch
          )
        },
        editing: { ...state.editing, isDirty: true }
      };
      saveToStorage(newState as EditorState);
      return newState;
    }),

    deleteChapter: (id) => set((state) => {
      const chapters = (state.bookData?.chapters || []).filter(ch => ch.id !== id);
      const activeChapterId = state.editing.activeChapterId === id 
        ? (chapters[0]?.id || null)
        : state.editing.activeChapterId;
      const newState = {
        bookData: { ...state.bookData, chapters },
        editing: { ...state.editing, activeChapterId }
      };
      saveToStorage(newState as EditorState);
      return newState;
    }),

    setActiveChapter: (id) => set((state) => ({
      editing: { ...state.editing, activeChapterId: id }
    })),

    loadContent: (chapters) => set((state) => {
      const newState = {
        bookData: { ...state.bookData, chapters },
        editing: { 
          ...state.editing, 
          activeChapterId: chapters[0]?.id || null 
        },
        ui: { ...state.ui, showUpload: false, showPreview: true }
      };
      saveToStorage(newState as EditorState);
      return newState;
    }),

    newProject: () => {
      localStorage.removeItem(STORAGE_KEY);
      set({
        bookData: {
          title: '',
          author: '',
          chapters: [],
          bookType: 'novela',
          pageFormat: '6x9',
          margins: {}
        },
        editing: { activeChapterId: null, isDirty: false },
        ui: { showPreview: false, showUpload: true, activeTab: 'structure' }
      });
    },

    getStats: () => {
      const state = get();
      const chapters = state.bookData?.chapters || [];
      const totalChapters = chapters.length;
      const totalWords = chapters.reduce(
        (sum, ch) => sum + (ch.html?.replace(/<[^>]*>/g, '').trim().split(/\s+/).filter(w => w.length > 0).length || 0),
        0
      );
      const estimatedPages = Math.ceil(totalWords / 275);
      const readingTime = Math.ceil(totalWords / 250);
      
      return {
        chapters: totalChapters,
        words: totalWords,
        characters: totalWords * 5,
        pages: estimatedPages,
        readingTime
      };
    }
  })
);

export default useEditorStore;
