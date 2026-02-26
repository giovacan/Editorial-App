import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
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

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

const saveToStorage = (state: EditorState) => {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      const toSave = {
        bookData: state.bookData,
        config: state.config
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.error('Error saving to storage:', e);
    }
  }, 500);
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
    lineHeight: 1.5,
    chaptersOnRight: true,
    showPageNumbers: true,
    pageNumberPos: 'bottom' as const,
    pageNumberAlign: 'center' as const,
    showHeaders: false,
    headerContent: 'both' as const,
    headerPosition: 'top' as const,
    headerLine: true,
    header: {
      enabled: false,
      template: 'classic' as const,
      displayMode: 'alternate' as const,
      evenPage: {
        leftContent: 'title' as const,
        centerContent: 'none' as const,
        rightContent: 'none' as const
      },
      oddPage: {
        leftContent: 'none' as const,
        centerContent: 'none' as const,
        rightContent: 'chapter' as const
      },
      trackSubheaders: false,
      trackPseudoHeaders: false,
      subtopicBehavior: 'none' as const,
      subtopicSeparator: ' | ',
      subtopicMaxLength: 60,
      subheaderLevels: ['h1', 'h2'],
      subheaderFormat: 'full' as const,
      fontFamily: 'same' as const,
      fontSize: 70,
      showLine: true,
      lineStyle: 'solid' as const,
      lineWidth: 0.5,
      lineColor: 'black' as const,
      marginTop: 0,
      marginBottom: 0.5,
      distanceFromPageNumber: 0.5,
      whenPaginationSamePosition: 'merge' as const,
      skipFirstChapterPage: true
    },
    chapterTitle: {
      align: 'center' as const,
      bold: true,
      sizeMultiplier: 1.8,
      marginTop: 2,
      marginBottom: 1,
      startOnRightPage: true,
      layout: 'continuous' as 'continuous' | 'spaced' | 'halfPage' | 'fullPage',
      showLines: false,
      lineWidth: 0.5,
      lineStyle: 'solid',
      lineColor: '#333333',
      lineWidthTitle: false
    },
    subheaders: {
      h1: { align: 'center' as const, bold: true, sizeMultiplier: 1.5, marginTop: 1.5, marginBottom: 0.5, minLinesAfter: 2 },
      h2: { align: 'center' as const, bold: true, sizeMultiplier: 1.35, marginTop: 1.25, marginBottom: 0.5, minLinesAfter: 2 },
      h3: { align: 'center' as const, bold: true, sizeMultiplier: 1.25, marginTop: 1, marginBottom: 0.5, minLinesAfter: 2 },
      h4: { align: 'left' as const, bold: true, sizeMultiplier: 1.15, marginTop: 1, marginBottom: 0.5, minLinesAfter: 2 },
      h5: { align: 'left' as const, bold: true, sizeMultiplier: 1.1, marginTop: 0.75, marginBottom: 0.25, minLinesAfter: 2 },
      h6: { align: 'left' as const, bold: false, sizeMultiplier: 1.0, marginTop: 0.5, marginBottom: 0.25, minLinesAfter: 2 }
    },
    paragraph: {
      firstLineIndent: 1.5,
      align: 'justify' as const,
      spacingBetween: 0
    },
    quote: {
      enabled: true,
      indentLeft: 2,
      indentRight: 2,
      showLine: true,
      italic: true,
      sizeMultiplier: 0.95,
      marginTop: 1,
      marginBottom: 1
    },
    pagination: {
      minOrphanLines: 2,
      minWidowLines: 2,
      splitLongParagraphs: true
    }
  },
  ui: {
    showPreview: false,
    showUpload: true,
    activeTab: 'structure' as const
  }
};

const savedState = loadFromStorage();

const mergeDeep = (target: any, source: any): any => {
  if (source && typeof source === 'object') {
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        target[key] = mergeDeep(target[key] || {}, source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }
  return target;
};

const mergedInitialState = savedState 
  ? { 
      ...initialState, 
      bookData: { ...initialState.bookData, ...savedState.bookData },
      config: mergeDeep({ ...initialState.config }, savedState.config)
    }
  : initialState;

let cachedStats: { chapters: number; words: number; characters: number; pages: number; readingTime: number } | null = null;
let cachedChaptersLength = 0;

const calculateStats = (chapters: Chapter[]) => {
  const totalChapters = chapters.length;
  if (cachedStats && cachedChaptersLength === totalChapters && chapters.length > 0) {
    return cachedStats;
  }
  
  cachedChaptersLength = totalChapters;
  let totalWords = 0;
  
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    if (ch.html) {
      const text = ch.html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      totalWords += text.split(' ').filter(w => w.length > 0).length;
    }
  }
  
  cachedStats = {
    chapters: totalChapters,
    words: totalWords,
    characters: totalWords * 5,
    pages: Math.ceil(totalWords / 275),
    readingTime: Math.ceil(totalWords / 250)
  };
  
  return cachedStats;
};

const useEditorStore = create<EditorState>()(
  subscribeWithSelector(
    (set, get) => ({
    ...mergedInitialState,

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

    moveChapter: (fromIndex, toIndex) => set((state) => {
      const chapters = [...(state.bookData?.chapters || [])];
      if (fromIndex < 0 || fromIndex >= chapters.length || toIndex < 0 || toIndex >= chapters.length) {
        return state;
      }
      const [moved] = chapters.splice(fromIndex, 1);
      chapters.splice(toIndex, 0, moved);
      const newState = {
        bookData: { ...state.bookData, chapters }
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
      const chapters = get().bookData?.chapters || [];
      return calculateStats(chapters);
    },

    getStatsSelector: () => {
      const chapters = get().bookData?.chapters || [];
      return calculateStats(chapters);
    }
  })
  )
);

export default useEditorStore;
