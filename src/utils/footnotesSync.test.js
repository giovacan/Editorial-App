import { describe, it, expect } from 'vitest';
import { syncFootnotes } from './footnotes.js';

describe('syncFootnotes', () => {
  const notes = [
    { refId: 'a', index: 1, html: 'Nota A' },
    { refId: 'b', index: 2, html: 'Nota B' },
    { refId: 'c', index: 3, html: 'Nota C' },
  ];

  it('renumera por orden de aparición de las marcas', () => {
    const out = syncFootnotes(notes, ['c', 'a', 'b']);
    expect(out).toEqual([
      { refId: 'c', index: 1, html: 'Nota C' },
      { refId: 'a', index: 2, html: 'Nota A' },
      { refId: 'b', index: 3, html: 'Nota B' },
    ]);
  });

  it('poda las notas cuya marca ya no existe (huérfanas)', () => {
    const out = syncFootnotes(notes, ['a', 'c']); // 'b' se borró del cuerpo
    expect(out.map((n) => n.refId)).toEqual(['a', 'c']);
    expect(out.map((n) => n.index)).toEqual([1, 2]);
  });

  it('crea entrada vacía para una marca nueva sin contenido aún', () => {
    const out = syncFootnotes(notes, ['a', 'nuevo', 'b', 'c']);
    const nueva = out.find((n) => n.refId === 'nuevo');
    expect(nueva).toMatchObject({ refId: 'nuevo', index: 2, html: '' });
  });

  it('conserva el texto de las notas existentes', () => {
    const out = syncFootnotes(notes, ['b']);
    expect(out).toEqual([{ refId: 'b', index: 1, html: 'Nota B' }]);
  });

  it('sin marcas → lista vacía', () => {
    expect(syncFootnotes(notes, [])).toEqual([]);
  });

  it('notas undefined → maneja sin romper', () => {
    expect(syncFootnotes(undefined, ['x'])).toEqual([{ refId: 'x', index: 1, html: '' }]);
  });
});
