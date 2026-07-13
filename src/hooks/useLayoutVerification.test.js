/**
 * Tests de computeDomCorrections — el loop de correcciones DOM.
 *
 * Regresión del bug "los libros se desconfiguran": los splices (insertar
 * página nueva / quitar blanca de paridad) desplazaban los índices del array,
 * y las iteraciones posteriores usaban r.pageIndex viejo → robaban bloques de
 * páginas sanas y los amontonaban en receptores equivocados (páginas con 2-3x
 * su presupuesto, texto revuelto). Además la cascada dependía de re-pasadas
 * del audit (máx 6) y podía morir a la mitad.
 */
import { describe, it, expect } from 'vitest';
import { computeDomCorrections } from './useLayoutVerification';
import { htmlToText } from '../utils/layoutIr';

// Wrapper falso: altura DOM = nº de bloques <p> × 10px (modelo simple y determinista)
const makeWrapper = () => ({
  _html: '',
  set innerHTML(v) { this._html = v; },
  get innerHTML() { return this._html; },
  get scrollHeight() { return (this._html.match(/<p[\s>]/g) || []).length * 10; },
});

const P = (txt) => `<p style="margin:0;">${txt}</p>`;
const pageOf = (n, chapterTitle, opts = {}) => ({
  html: Array.from({ length: n }, (_, i) => P(`${opts.tag || 'x'}${i}`)).join(''),
  blocks: [],
  pageNumber: 0,
  chapterTitle,
  isBlank: false,
  isTitleOnlyPage: false,
  isFirstChapterPage: false,
  ...opts,
});
const blank = () => ({ html: '', blocks: [], isBlank: true, chapterTitle: '', pageNumber: 0 });

const CONTENT_H = 30; // presupuesto = 3 bloques de 10px
const run = (pages, clippedIdx) => {
  const results = pages.map((p, i) => ({ pageIndex: i, clipped: clippedIdx.includes(i) }));
  return computeDomCorrections(pages, results, makeWrapper(), CONTENT_H, 0, 10, null);
};

const allWords = (pages) => htmlToText(pages.filter(p => !p.isBlank).map(p => p.html).join('')).match(/[a-z]\d+/g) || [];

describe('computeDomCorrections', () => {
  it('mueve el exceso al receptor del mismo capítulo sin perder contenido', () => {
    const pages = [pageOf(5, 'CAP 1', { tag: 'a' }), pageOf(1, 'CAP 1', { tag: 'b' })];
    const fixed = run(pages, [0]);
    expect(fixed).not.toBeNull();
    // donante queda en presupuesto, receptor recibe el carry AL INICIO
    expect((fixed[0].html.match(/<p/g) || []).length).toBeLessThanOrEqual(3);
    expect(htmlToText(fixed[1].html)).toBe('a3a4b0');
    // nada se pierde ni duplica
    expect(allWords(fixed).sort().join(',')).toBe('a0,a1,a2,a3,a4,b0');
  });

  it('REGRESIÓN índices: página final de capítulo clipped + otra clipped después con blanca de por medio', () => {
    // [L(ch1 última, 5 bloques), BLANCA, C2first, X(ch2, 5 bloques), Y(ch2, 1 bloque)]
    const pages = [
      pageOf(5, 'CAP 1', { tag: 'a' }),
      blank(),
      pageOf(3, 'CAP 2', { tag: 'c', isFirstChapterPage: true }),
      pageOf(5, 'CAP 2', { tag: 'x' }),
      pageOf(1, 'CAP 2', { tag: 'y' }),
    ];
    const fixed = run(pages, [0, 3]);
    expect(fixed).not.toBeNull();
    // TODAS las páginas quedan dentro del presupuesto (nadie acumula 2-3x)
    for (const p of fixed.filter(p => !p.isBlank)) {
      expect((p.html.match(/<p/g) || []).length).toBeLessThanOrEqual(3);
    }
    // el contenido completo sobrevive exactamente una vez y EN ORDEN
    expect(allWords(fixed).join(',')).toBe('a0,a1,a2,a3,a4,c0,c1,c2,x0,x1,x2,x3,x4,y0');
    // X (por identidad de contenido) se corrigió aunque hubo splice antes
    const xPage = fixed.find(p => htmlToText(p.html).startsWith('x0'));
    expect((xPage.html.match(/<p/g) || []).length).toBeLessThanOrEqual(3);
  });

  it('REGRESIÓN índices: frontera de capítulo SIN blanca — la compensación insertaba 2 páginas y corría los índices', () => {
    // [L(ch1 última, clipped), C2first, X(ch2, clipped), Y(ch2)]
    // Código viejo: procesar L insertaba página nueva + blanca compensatoria
    // (+2 posiciones) y el índice viejo de X apuntaba a la blanca → X quedaba
    // desbordada para siempre (o robaba bloques de una página equivocada).
    const pages = [
      pageOf(5, 'CAP 1', { tag: 'a' }),
      pageOf(3, 'CAP 2', { tag: 'c', isFirstChapterPage: true }),
      pageOf(5, 'CAP 2', { tag: 'x' }),
      pageOf(1, 'CAP 2', { tag: 'y' }),
    ];
    const fixed = run(pages, [0, 2]);
    expect(fixed).not.toBeNull();
    for (const p of fixed.filter(p => !p.isBlank)) {
      expect((p.html.match(/<p/g) || []).length).toBeLessThanOrEqual(3);
    }
    expect(allWords(fixed).join(',')).toBe('a0,a1,a2,a3,a4,c0,c1,c2,x0,x1,x2,x3,x4,y0');
  });

  it('cascada en una sola pasada: un desborde de 3 páginas se reparte completo', () => {
    // P1 con 9 bloques (3 páginas de contenido), P2 y P3 casi llenos
    const pages = [
      pageOf(9, 'CAP 1', { tag: 'a' }),
      pageOf(2, 'CAP 1', { tag: 'b' }),
      pageOf(2, 'CAP 1', { tag: 'c' }),
    ];
    const fixed = run(pages, [0]);
    expect(fixed).not.toBeNull();
    for (const p of fixed.filter(p => !p.isBlank)) {
      expect((p.html.match(/<p/g) || []).length).toBeLessThanOrEqual(3);
    }
    // orden global intacto
    expect(allWords(fixed).join(',')).toBe('a0,a1,a2,a3,a4,a5,a6,a7,a8,b0,b1,c0,c1');
    // hubo que insertar al menos una página nueva al final del capítulo
    expect(fixed.filter(p => !p.isBlank).length).toBeGreaterThan(3);
  });

  it('no toca nada cuando ninguna página está clipped', () => {
    const pages = [pageOf(3, 'CAP 1'), pageOf(2, 'CAP 1')];
    expect(run(pages, [])).toBeNull();
  });

  it('página final del libro desbordada inserta página nueva sin perder texto', () => {
    const pages = [pageOf(2, 'CAP 1', { tag: 'a' }), pageOf(6, 'CAP 1', { tag: 'z' })];
    const fixed = run(pages, [1]);
    expect(fixed).not.toBeNull();
    for (const p of fixed.filter(p => !p.isBlank)) {
      expect((p.html.match(/<p/g) || []).length).toBeLessThanOrEqual(3);
    }
    expect(allWords(fixed).join(',')).toBe('a0,a1,z0,z1,z2,z3,z4,z5');
    expect(fixed.some(p => p.isDomCorrected)).toBe(true);
  });
});
