import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { EditorState, Chapter } from '../types';

const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
  document: {
    title: '',
    author: '',
    chapters: [],
    bookType: 'novela',
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
    lineHeight: 1.6,
    chaptersOnRight: true,
    showPageNumbers: true,
    pageNumberPos: 'bottom',
    pageNumberAlign: 'center',
    showHeaders: false,
    headerContent: 'both',
    headerPosition: 'top',
    headerLine: true
  },
  ui: {
    showPreview: false,
    showUpload: true,
    activeTab: 'structure'
  },

  setDocument: (doc) => set((state) => ({ document: { ...state.document, ...doc } })),
  
  setConfig: (config) => set((state) => ({ config: { ...state.config, ...config } })),
  
  setUi: (ui) => set((state) => ({ ui: { ...state.ui, ...ui } })),

  addChapter: (title) => {
    const chapter: Chapter = {
      id: `chapter-${Date.now()}`,
      type: 'chapter',
      title: title || 'Sin título',
      html: '<p>Comienza a escribir aquí...</p>',
      wordCount: 0
    };
    set((state) => ({
      document: { ...state.document, chapters: [...state.document.chapters, chapter] },
      editing: { ...state.editing, activeChapterId: chapter.id }
    }));
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
    set((state) => ({
      document: { ...state.document, chapters: [...state.document.chapters, section] },
      editing: { ...state.editing, activeChapterId: section.id }
    }));
    return section;
  },

  updateChapter: (id, updates) => set((state) => ({
    document: {
      ...state.document,
      chapters: state.document.chapters.map(ch => 
        ch.id === id ? { ...ch, ...updates } : ch
      )
    },
    editing: { ...state.editing, isDirty: true }
  })),

  deleteChapter: (id) => set((state) => {
    const chapters = state.document.chapters.filter(ch => ch.id !== id);
    const activeChapterId = state.editing.activeChapterId === id 
      ? (chapters[0]?.id || null)
      : state.editing.activeChapterId;
    return {
      document: { ...state.document, chapters },
      editing: { ...state.editing, activeChapterId }
    };
  }),

  setActiveChapter: (id) => set((state) => ({
    editing: { ...state.editing, activeChapterId: id }
  })),

  loadContent: (chapters) => set((state) => ({
    document: { ...state.document, chapters },
    editing: { 
      ...state.editing, 
      activeChapterId: chapters[0]?.id || null 
    },
    ui: { ...state.ui, showUpload: false, showPreview: true }
  })),

  newProject: () => set({
    document: {
      title: '',
      author: '',
      chapters: [],
      bookType: 'novela',
      pageFormat: '6x9',
      margins: {}
    },
    editing: { activeChapterId: null, isDirty: false },
    ui: { showPreview: false, showUpload: true, activeTab: 'structure' }
  }),

  getStats: () => {
    const state = get();
    const totalChapters = state.document.chapters.length;
    const totalWords = state.document.chapters.reduce(
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
  })),
  {
    name: 'editorial-app-storage',
    partialize: (state) => ({
      document: state.document,
      config: state.config
    })
  }
);

export default useEditorStore;
