/**
 * Footnotes go/no-go (roadmap B1). Isolated technical validation of Strategy A
 * BEFORE touching the DP engine. Proves two things the design hinges on:
 *
 *   (a) A footnote block rendered at a reduced size (8–9pt) can be measured
 *       deterministically with the SAME measureHtmlHeight the engine uses, and
 *       its height grows monotonically with the number of notes.
 *   (b) Subtracting that height from a page budget makes strictly LESS body
 *       content fit — i.e. the presence of a note on a page reduces its budget
 *       in a stable, predictable way (the core of Strategy A).
 *
 * No engine code is modified; this only exercises measureHtmlHeight.
 */
import { describe, it, expect } from 'vitest';
import { measureHtmlHeight } from '../textLayoutEngine.js';

// A5-ish real-book layout context (scaled px), mirrors the corpus fixture.
const bodyCtx = {
  baseFontSizePx: 6.29,
  baseLineHeight: 10 / 6.29, // lineHeightPx ≈ 10
  contentWidth: 172.8,
  fontFamily: 'Georgia, serif',
};
const lineHeightPx = 10;

// Footnote context: notes render smaller (≈8pt vs ~11pt body → 0.72×) with a
// tighter line-height (1.4). Same measurement engine, reduced font.
const footnoteCtx = {
  ...bodyCtx,
  baseFontSizePx: bodyCtx.baseFontSizePx * 0.72,
  baseLineHeight: 1.4,
};

// Build a footnote block: a thin rule + N short notes at the reduced size.
const footnoteBlock = (notes) => {
  const rule = `<div style="border-top:0.5px solid #000;margin:6px 0 3px 0;height:0;"></div>`;
  const items = notes
    .map((t, i) => `<p style="margin:0 0 2px 0;"><sup>${i + 1}</sup> ${t}</p>`)
    .join('');
  return rule + items;
};

const NOTE = 'Véase la obra citada, capítulo tercero, donde se desarrolla en detalle este punto.';

describe('footnotes go/no-go — (a) measurement', () => {
  it('mide un bloque de notas con measureHtmlHeight (altura > 0)', () => {
    const h = measureHtmlHeight(footnoteBlock([NOTE]), footnoteCtx);
    expect(h).toBeGreaterThan(0);
  });

  it('es determinista (mismo input → misma altura)', () => {
    const html = footnoteBlock([NOTE, NOTE]);
    expect(measureHtmlHeight(html, footnoteCtx)).toBe(measureHtmlHeight(html, footnoteCtx));
  });

  it('crece monotónicamente con el número de notas', () => {
    const h1 = measureHtmlHeight(footnoteBlock([NOTE]), footnoteCtx);
    const h2 = measureHtmlHeight(footnoteBlock([NOTE, NOTE]), footnoteCtx);
    const h3 = measureHtmlHeight(footnoteBlock([NOTE, NOTE, NOTE]), footnoteCtx);
    expect(h2).toBeGreaterThan(h1);
    expect(h3).toBeGreaterThan(h2);
  });

  it('las notas ocupan MENOS que el mismo texto a tamaño de cuerpo', () => {
    const html = footnoteBlock([NOTE, NOTE]);
    const small = measureHtmlHeight(html, footnoteCtx);
    const big = measureHtmlHeight(html, bodyCtx);
    expect(small).toBeLessThan(big);
  });
});

describe('footnotes go/no-go — (b) budget reduction changes the cut', () => {
  // How many body paragraphs fit within a budget (greedy, using the SAME
  // measurer the engine uses per accumulated block).
  const para = `<p style="margin:0;text-indent:1.5em;">${NOTE} ${NOTE} ${NOTE}</p>`;
  const fitParas = (budget) => {
    let count = 0, acc = '';
    for (let i = 0; i < 40; i++) {
      const next = acc + para;
      if (measureHtmlHeight(next, bodyCtx) > budget) break;
      acc = next; count++;
    }
    return count;
  };

  it('restar la altura de notas del budget hace caber menos contenido', () => {
    const baseBudget = 230; // page content budget (px), like the corpus fixture
    const fnHeight = measureHtmlHeight(footnoteBlock([NOTE, NOTE, NOTE]), footnoteCtx);
    const reduced = baseBudget - fnHeight;

    const withoutNotes = fitParas(baseBudget);
    const withNotes = fitParas(reduced);

    // The footnote block must cost at least ~1 line, and the reduced budget must
    // fit strictly fewer paragraphs → the page cut moves. This is the go signal.
    expect(fnHeight).toBeGreaterThan(lineHeightPx); // ≥ ~1 line of real cost
    expect(withNotes).toBeLessThan(withoutNotes);
    expect(withNotes).toBeGreaterThan(0); // still fits some body (sane)
  });

  it('el budget reducido es estable (determinista)', () => {
    const fnHeight = measureHtmlHeight(footnoteBlock([NOTE]), footnoteCtx);
    expect(fitParas(230 - fnHeight)).toBe(fitParas(230 - fnHeight));
  });
});
