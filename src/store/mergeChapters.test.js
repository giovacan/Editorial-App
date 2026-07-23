/**
 * mergeChapters.test.js — mergeChapterIntoPrevious store action.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import useEditorStore from './useEditorStore';

const chapter = (id, title, html, extra = {}) => ({
  id, type: 'chapter', title, html,
  wordCount: html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length,
  ...extra,
});

const loadChapters = (chs) => {
  useEditorStore.setState((s) => ({ bookData: { ...s.bookData, chapters: chs } }));
};

beforeEach(() => {
  useEditorStore.setState((s) => ({
    bookData: { ...s.bookData, chapters: [] },
    editing: { ...s.editing, activeChapterId: null },
  }));
});

describe('mergeChapterIntoPrevious', () => {
  it('fusiona el capítulo con el anterior conservando su título como subtítulo', () => {
    loadChapters([
      chapter('c1', 'CAPÍTULO 1  La Biblia', '<p>Primera parte.</p>', { chapterName: 'La Biblia' }),
      chapter('c2', 'El Padre', '<p>Segunda parte del texto.</p>', { chapterName: 'El Padre' }),
    ]);
    useEditorStore.getState().mergeChapterIntoPrevious('c2');
    const chs = useEditorStore.getState().bookData.chapters;
    expect(chs.length).toBe(1);
    expect(chs[0].id).toBe('c1');
    // El html del absorbido se concatena, con su título como <h3>.
    expect(chs[0].html).toContain('Primera parte.');
    expect(chs[0].html).toContain('<h3>El Padre</h3>');
    expect(chs[0].html).toContain('Segunda parte del texto.');
    // wordCount sumado.
    expect(chs[0].wordCount).toBe(2 + 4);
  });

  it('funde los footnotes de ambos capítulos', () => {
    loadChapters([
      chapter('c1', 'Cap 1', '<p>a</p>', { footnotes: [{ refId: 'f1', index: 1, html: 'n1' }] }),
      chapter('c2', 'Cap 2', '<p>b</p>', { footnotes: [{ refId: 'f2', index: 1, html: 'n2' }] }),
    ]);
    useEditorStore.getState().mergeChapterIntoPrevious('c2');
    const chs = useEditorStore.getState().bookData.chapters;
    expect(chs.length).toBe(1);
    expect(chs[0].footnotes.map((f) => f.refId)).toEqual(['f1', 'f2']);
  });

  it('no hace nada en el primer capítulo (no hay anterior)', () => {
    loadChapters([
      chapter('c1', 'Cap 1', '<p>a</p>'),
      chapter('c2', 'Cap 2', '<p>b</p>'),
    ]);
    useEditorStore.getState().mergeChapterIntoPrevious('c1');
    expect(useEditorStore.getState().bookData.chapters.length).toBe(2);
  });

  it('deja activo el capítulo anterior tras fusionar', () => {
    loadChapters([
      chapter('c1', 'Cap 1', '<p>a</p>'),
      chapter('c2', 'Cap 2', '<p>b</p>'),
    ]);
    useEditorStore.getState().mergeChapterIntoPrevious('c2');
    expect(useEditorStore.getState().editing.activeChapterId).toBe('c1');
  });
});
