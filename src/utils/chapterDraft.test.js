import { describe, it, expect } from 'vitest';
import { mergeIntoPrevious, moveChapter, removeChapter, updateFields } from './chapterDraft';

const ch = (id, title, html, extra = {}) => ({
  id, type: 'chapter', title, html,
  wordCount: html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length,
  ...extra,
});

describe('mergeIntoPrevious', () => {
  it('une al anterior conservando el título como subtítulo', () => {
    const draft = [
      ch('c1', 'CAPÍTULO 1  La Biblia', '<p>uno</p>', { chapterName: 'La Biblia' }),
      ch('c2', 'El Padre', '<p>dos tres</p>', { chapterName: 'El Padre' }),
    ];
    const out = mergeIntoPrevious(draft, 'c2');
    expect(out.length).toBe(1);
    expect(out[0].id).toBe('c1');
    expect(out[0].html).toBe('<p>uno</p><h3>El Padre</h3><p>dos tres</p>');
    // "uno" + "El Padre" (subtítulo) + "dos tres" = 5 palabras
    expect(out[0].wordCount).toBe(5);
  });
  it('funde footnotes', () => {
    const draft = [
      ch('c1', 'A', '<p>a</p>', { footnotes: [{ refId: 'f1' }] }),
      ch('c2', 'B', '<p>b</p>', { footnotes: [{ refId: 'f2' }] }),
    ];
    expect(mergeIntoPrevious(draft, 'c2')[0].footnotes.map(f => f.refId)).toEqual(['f1', 'f2']);
  });
  it('no hace nada en el primero', () => {
    const draft = [ch('c1', 'A', '<p>a</p>'), ch('c2', 'B', '<p>b</p>')];
    expect(mergeIntoPrevious(draft, 'c1').length).toBe(2);
  });
  it('es inmutable (no muta el original)', () => {
    const draft = [ch('c1', 'A', '<p>a</p>'), ch('c2', 'B', '<p>b</p>')];
    mergeIntoPrevious(draft, 'c2');
    expect(draft.length).toBe(2);
  });
});

describe('moveChapter', () => {
  it('reordena', () => {
    const draft = [ch('c1', 'A', 'a'), ch('c2', 'B', 'b'), ch('c3', 'C', 'c')];
    expect(moveChapter(draft, 0, 2).map(c => c.id)).toEqual(['c2', 'c3', 'c1']);
  });
  it('índices inválidos → sin cambio', () => {
    const draft = [ch('c1', 'A', 'a')];
    expect(moveChapter(draft, 0, 5)).toBe(draft);
  });
});

describe('removeChapter', () => {
  it('quita por id', () => {
    const draft = [ch('c1', 'A', 'a'), ch('c2', 'B', 'b')];
    expect(removeChapter(draft, 'c1').map(c => c.id)).toEqual(['c2']);
  });
  it('no quita el último', () => {
    const draft = [ch('c1', 'A', 'a')];
    expect(removeChapter(draft, 'c1').length).toBe(1);
  });
});

describe('updateFields', () => {
  it('cambia etiqueta y recompone título', () => {
    const draft = [ch('c1', 'El Padre', '<p>x</p>', { chapterName: 'El Padre', chapterLabel: '' })];
    const out = updateFields(draft, 'c1', { label: 'CAPÍTULO 2' });
    expect(out[0].chapterLabel).toBe('CAPÍTULO 2');
    expect(out[0].title).toBe('CAPÍTULO 2  El Padre');
  });
  it('cambia solo el nombre conservando la etiqueta', () => {
    const draft = [ch('c1', 'CAPÍTULO 2  X', '<p>x</p>', { chapterName: 'X', chapterLabel: 'CAPÍTULO 2' })];
    const out = updateFields(draft, 'c1', { name: 'Dios El Padre' });
    expect(out[0].title).toBe('CAPÍTULO 2  Dios El Padre');
  });
});
