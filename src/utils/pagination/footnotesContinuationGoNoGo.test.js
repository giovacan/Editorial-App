/**
 * Footnotes continuation go/no-go (roadmap B1-PR2). Validates — BEFORE touching
 * the engine — that the footnote block can be SPLIT between pages when a note is
 * too tall to fit, deterministically and without text loss. This is the risky
 * point (potential non-convergence), so we prove the splitting PRIMITIVE first.
 *
 * Strategy: the footnote block is a sequence of <p> notes. To continue a note
 * across pages we reuse the engine's own paragraph splitter
 * (splitParagraphByLines) — the SAME tool that already splits body paragraphs —
 * so heights and line-breaks stay consistent with the rest of the engine.
 */
import { describe, it, expect } from 'vitest';
import { splitParagraphByLines } from '../paginationEngine.js';
import { measureHtmlHeight, createLayoutContext, getCtx as getEngineCtx2d } from '../textLayoutEngine.js';
import { JUSTIFY_SLACK_RATIO } from '../layoutIr.js';
import { makeFootnoteCtx } from '../footnotes.js';

const CONTENT_WIDTH = 300;
const bodyCtx = {
  ...createLayoutContext(12, 1.5, CONTENT_WIDTH, 'Georgia, serif'),
  widthSlack: CONTENT_WIDTH * JUSTIFY_SLACK_RATIO,
  lineHeightPx: 18,
  textAlign: 'left',
  noHyphenation: true,
  ctx2d: getEngineCtx2d(), // required by findSplitPos (cut-line computation)
};
const fnCtx = makeFootnoteCtx({ ...bodyCtx, baseFontSizePx: 12, baseLineHeight: 1.5 }, { fontScale: 0.72, lineHeight: 1.4 });

// A long single note (one <p>) that will need to be split across pages.
const LONG = Array.from({ length: 12 }, () =>
  'Esta nota al pie es deliberadamente larga para forzar su división entre dos páginas consecutivas.'
).join(' ');
const noteHtml = `<p style="margin:0;">${LONG}</p>`;

const plain = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('footnote continuation go/no-go', () => {
  it('la nota larga mide más que el espacio de una página parcial', () => {
    const full = measureHtmlHeight(noteHtml, fnCtx);
    expect(full).toBeGreaterThan(60); // varias líneas
  });

  it('se puede partir a una altura objetivo → cabeza que cabe + resto', () => {
    const fullH = measureHtmlHeight(noteHtml, fnCtx);
    const targetH = Math.round(fullH / 2); // pedir ~la mitad
    const chunks = splitParagraphByLines(noteHtml, null, targetH, 'left', false, 1.5, false, fnCtx);
    expect(chunks).toBeTruthy();
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const head = chunks[0];
    const rest = chunks.slice(1).join('');
    const headH = measureHtmlHeight(head, fnCtx);
    // HALLAZGO go/no-go: la cabeza puede exceder el target hasta ~1 línea de
    // nota (el splitter body-oriented mide con el margen/redondeo del bloque).
    // → PR2 debe pedir el corte con 1 línea de margen sobre el hueco real.
    expect(headH).toBeLessThanOrEqual(targetH + fnCtx.lineHeightPx + 1);
    // El resto no está vacío y la cabeza es más corta que el original.
    expect(plain(rest).length).toBeGreaterThan(0);
    expect(headH).toBeLessThan(fullH);
  });

  it('conserva TODO el texto (cabeza + resto = original, sin pérdida)', () => {
    const chunks = splitParagraphByLines(noteHtml, null, 54, 'left', false, 1.5, false, fnCtx);
    const joined = plain(chunks.join(' '));
    const original = plain(noteHtml);
    // Mismo conjunto de palabras (el split no pierde ni duplica).
    expect(joined.split(' ').length).toBe(original.split(' ').length);
    expect(joined).toBe(original);
  });

  it('es determinista (mismo input → mismo corte)', () => {
    const a = splitParagraphByLines(noteHtml, null, 54, 'left', false, 1.5, false, fnCtx);
    const b = splitParagraphByLines(noteHtml, null, 54, 'left', false, 1.5, false, fnCtx);
    expect(a).toEqual(b);
  });

  it('objetivo mayor que la nota → no se parte (1 chunk)', () => {
    const big = measureHtmlHeight(noteHtml, fnCtx) + 100;
    const chunks = splitParagraphByLines(noteHtml, null, big, 'left', false, 1.5, false, fnCtx);
    // Cabe entero: 1 solo chunk (o null → no hay nada que partir).
    expect(!chunks || chunks.length <= 1).toBe(true);
  });
});
