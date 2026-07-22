import { describe, it, expect } from 'vitest';
import {
  detectFootnotes,
  footnoteRefsIn,
  footnoteBlockHeight,
  makeFootnoteCtx,
} from './footnotes.js';

// Realistic-ish mammoth output: body refs + note-definition blocks at the end.
const mammothHtml =
  '<p>Primera afirmación<sup><a href="#ftn1" id="ftnref1">1</a></sup> con nota.</p>' +
  '<p>Segunda afirmación<sup><a href="#ftn2" id="ftnref2">2</a></sup> aquí.</p>' +
  '<div id="ftn1"><p><a href="#ftnref1">↑</a> Primera nota al pie.</p></div>' +
  '<div id="ftn2"><p><a href="#ftnref2">↑</a> Segunda nota al pie.</p></div>';

describe('detectFootnotes', () => {
  it('detecta las notas y normaliza las marcas del cuerpo', () => {
    const { cleanHtml, notes } = detectFootnotes(mammothHtml);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({ refId: 'fn1', index: 1 });
    expect(notes[1]).toMatchObject({ refId: 'fn2', index: 2 });
    // Body markers normalized.
    expect(cleanHtml).toContain('<sup data-fn="fn1">1</sup>');
    expect(cleanHtml).toContain('<sup data-fn="fn2">2</sup>');
    // Original mammoth anchors gone.
    expect(cleanHtml).not.toContain('href="#ftn1"');
    // Note-definition blocks removed from the body.
    expect(cleanHtml).not.toContain('id="ftn1"');
    expect(cleanHtml).not.toContain('id="ftn2"');
  });

  it('extrae el contenido de la nota sin la flecha de retorno', () => {
    const { notes } = detectFootnotes(mammothHtml);
    expect(notes[0].html).toContain('Primera nota al pie');
    expect(notes[0].html).not.toContain('↑');
  });

  it('numera por ORDEN de aparición de las marcas', () => {
    const { notes } = detectFootnotes(mammothHtml);
    expect(notes.map((n) => n.index)).toEqual([1, 2]);
  });

  it('es idempotente: HTML ya normalizado no se re-procesa', () => {
    const { cleanHtml } = detectFootnotes(mammothHtml);
    const again = detectFootnotes(cleanHtml);
    expect(again.notes).toHaveLength(0);       // ya no hay <sup><a href="#ftn…">
    expect(again.cleanHtml).toBe(cleanHtml);   // sin cambios
  });

  it('sin notas → devuelve el html tal cual', () => {
    const plain = '<p>Sin ninguna nota aquí.</p>';
    expect(detectFootnotes(plain)).toEqual({ cleanHtml: plain, notes: [] });
  });
});

describe('footnoteRefsIn', () => {
  it('lista los refIds presentes, en orden y sin duplicar', () => {
    const html = '<p>a<sup data-fn="fn1">1</sup> b<sup data-fn="fn2">2</sup> c<sup data-fn="fn1">1</sup></p>';
    expect(footnoteRefsIn(html)).toEqual(['fn1', 'fn2']);
  });
  it('sin marcas → vacío', () => {
    expect(footnoteRefsIn('<p>nada</p>')).toEqual([]);
  });
});

describe('footnoteBlockHeight', () => {
  const bodyCtx = {
    baseFontSizePx: 6.29, baseLineHeight: 10 / 6.29,
    contentWidth: 172.8, fontFamily: 'Georgia, serif', lineHeightPx: 10,
  };
  const fnCtx = makeFootnoteCtx(bodyCtx, { fontScale: 0.72, lineHeight: 1.4 });
  const notesMap = new Map([
    ['fn1', { index: 1, html: 'Véase la obra citada, capítulo tercero.' }],
    ['fn2', { index: 2, html: 'Otra nota igualmente relevante y algo larga.' }],
    ['fn3', { index: 3, html: 'Tercera.' }],
  ]);

  it('0 cuando no hay refIds', () => {
    expect(footnoteBlockHeight([], notesMap, fnCtx)).toBe(0);
  });

  it('altura > 0 y determinista', () => {
    const h = footnoteBlockHeight(['fn1'], notesMap, fnCtx);
    expect(h).toBeGreaterThan(0);
    expect(footnoteBlockHeight(['fn1'], notesMap, fnCtx)).toBe(h);
  });

  it('crece con más notas', () => {
    const h1 = footnoteBlockHeight(['fn1'], notesMap, fnCtx);
    const h2 = footnoteBlockHeight(['fn1', 'fn2'], notesMap, fnCtx);
    expect(h2).toBeGreaterThan(h1);
  });
});
