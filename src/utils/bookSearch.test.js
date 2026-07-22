import { describe, it, expect } from 'vitest';
import { searchChapters, foldText, htmlPlainText } from './bookSearch';

const ch = (id, title, html) => ({ id, title, html });

describe('foldText', () => {
  it('quita acentos y baja a minúsculas', () => {
    expect(foldText('Canción')).toBe('cancion');
    expect(foldText('ÁÉÍÓÚ')).toBe('aeiou');
  });
  it('preserva la longitud (offsets alineados)', () => {
    const s = 'áéíóú ñ Ünïcode';
    expect(foldText(s).length).toBe(s.length);
  });
});

describe('htmlPlainText', () => {
  it('quita tags y colapsa espacios', () => {
    expect(htmlPlainText('<p>Hola   <strong>mundo</strong></p>')).toBe('Hola mundo');
  });
});

describe('searchChapters', () => {
  const chapters = [
    ch('c1', 'Cap 1', '<p>La batalla principal no está en las calles.</p>'),
    ch('c2', 'Cap 2', '<p>Cada pensamiento es una semilla. La batalla continúa.</p>'),
    ch('c3', 'Cap 3', '<p>Nada aquí.</p>'),
  ];

  it('encuentra ocurrencias en todos los capítulos', () => {
    const { matches, total } = searchChapters(chapters, 'batalla');
    expect(total).toBe(2);
    expect(matches.map((m) => m.chapterId)).toEqual(['c1', 'c2']);
  });

  it('es insensible a acentos y mayúsculas', () => {
    expect(searchChapters(chapters, 'ESTA').total).toBe(1);      // "está"
    expect(searchChapters(chapters, 'continua').total).toBe(1);  // "continúa"
  });

  it('devuelve wordIndex por capítulo (0-based)', () => {
    const c = [ch('x', 'X', '<p>eco eco eco</p>')];
    const { matches } = searchChapters(c, 'eco');
    expect(matches.map((m) => m.wordIndex)).toEqual([0, 1, 2]);
  });

  it('snippet resaltable en su offset', () => {
    const { matches } = searchChapters(chapters, 'semilla');
    const m = matches[0];
    const [s, e] = m.matchInSnippet;
    expect(m.snippet.slice(s, e).toLowerCase()).toBe('semilla');
  });

  it('query vacía → sin resultados', () => {
    expect(searchChapters(chapters, '   ').total).toBe(0);
    expect(searchChapters(chapters, '').total).toBe(0);
  });

  it('respeta maxMatches (capped)', () => {
    const c = [ch('x', 'X', '<p>' + 'x '.repeat(50) + '</p>')];
    const r = searchChapters(c, 'x', { maxMatches: 10 });
    expect(r.matches).toHaveLength(10);
    expect(r.capped).toBe(true);
  });
});
