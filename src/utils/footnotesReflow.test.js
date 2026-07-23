/**
 * footnotesReflow.test.js — B1-PR2 continuation reflow.
 *
 * The reflow pass moves overflowing footnotes forward (a page's note block that
 * exceeds its foot space splits; the remainder carries to the next page). Tests
 * the invariants: no note lost, head fits, terminates (monotonic), and pages
 * without overflow are untouched.
 */
import { describe, it, expect } from 'vitest';
import { splitParagraphByLines } from './paginationEngine.js';
import { createLayoutContext, getCtx } from './textLayoutEngine.js';
import { JUSTIFY_SLACK_RATIO } from './layoutIr.js';
import { makeFootnoteCtx, reflowFootnotes, measureNotes } from './footnotes.js';

const CW = 300;
const fnCtx = makeFootnoteCtx(
  { ...createLayoutContext(12, 1.5, CW, 'Georgia, serif'), widthSlack: CW * JUSTIFY_SLACK_RATIO,
    lineHeightPx: 18, textAlign: 'left', noHyphenation: true, ctx2d: getCtx(), baseFontSizePx: 12, baseLineHeight: 1.5 },
  { fontScale: 0.72, lineHeight: 1.4 }
);

const shortNote = (i) => ({ index: i, html: `Nota corta ${i}.` });
const longNote = (i) => ({ index: i, html: Array.from({ length: 10 }, () => `Fragmento ${i} de una nota muy larga.`).join(' ') });

// Count all note "identities" (by index+continued) present across pages, and
// concatenate their text to check nothing is lost.
const allText = (pages) =>
  pages.flatMap((p) => p.footnotes || []).map((n) => n.html).join(' ').replace(/\s+/g, ' ').trim();

describe('reflowFootnotes', () => {
  it('páginas sin overflow quedan intactas', () => {
    const pages = [
      { footnotes: [shortNote(1)], footnoteHeightPx: 0 },
      { footnotes: [shortNote(2)], footnoteHeightPx: 0 },
    ];
    const before = allText(pages);
    reflowFootnotes(pages, fnCtx, 500, splitParagraphByLines);
    expect(pages[0].footnotes).toHaveLength(1);
    expect(pages[1].footnotes).toHaveLength(1);
    expect(allText(pages)).toBe(before);
  });

  it('una nota que no cabe se parte y el resto pasa a la página siguiente', () => {
    const pages = [
      { footnotes: [longNote(1)], footnoteHeightPx: 0 },
      { footnotes: [], footnoteHeightPx: 0 },
    ];
    const fullH = measureNotes([longNote(1)], fnCtx);
    const maxFootH = Math.round(fullH / 2); // fuerza el corte
    reflowFootnotes(pages, fnCtx, maxFootH, splitParagraphByLines);
    // La página 1 tiene una cabeza que cabe.
    expect(pages[0].footnotes.length).toBeGreaterThan(0);
    expect(pages[0].footnoteHeightPx).toBeLessThanOrEqual(maxFootH + fnCtx.lineHeightPx + 2);
    // La página 2 recibió la continuación (marcada continued).
    expect(pages[1].footnotes.length).toBeGreaterThan(0);
    expect(pages[1].footnotes[0].continued).toBe(true);
  });

  it('no pierde texto (cabeza + continuación reconstruyen la nota)', () => {
    const note = longNote(1);
    const pages = [
      { footnotes: [note], footnoteHeightPx: 0 },
      { footnotes: [], footnoteHeightPx: 0 },
      { footnotes: [], footnoteHeightPx: 0 },
    ];
    const fullH = measureNotes([note], fnCtx);
    reflowFootnotes(pages, fnCtx, Math.round(fullH / 3), splitParagraphByLines);
    const words = allText(pages).split(' ').filter(Boolean).length;
    const originalWords = note.html.replace(/\s+/g, ' ').trim().split(' ').length;
    // El texto total conservado ≈ el original (± la numeración inyectada).
    expect(words).toBeGreaterThanOrEqual(originalWords - 2);
  });

  it('una nota gigante fluye por varias páginas (termina, no bucle)', () => {
    const giant = { index: 1, html: Array.from({ length: 40 }, () => 'palabra larga de relleno para la nota gigante').join(' ') };
    const pages = Array.from({ length: 6 }, () => ({ footnotes: [], footnoteHeightPx: 0 }));
    pages[0].footnotes = [giant];
    const started = Date.now();
    reflowFootnotes(pages, fnCtx, 60, splitParagraphByLines); // foot space pequeño
    // Terminó rápido (no bucle) y repartió la nota en varias páginas.
    expect(Date.now() - started).toBeLessThan(3000);
    const pagesWithNotes = pages.filter((p) => p.footnotes.length > 0).length;
    expect(pagesWithNotes).toBeGreaterThan(1);
  });

  it('es determinista', () => {
    const mk = () => [{ footnotes: [longNote(1), shortNote(2)], footnoteHeightPx: 0 }, { footnotes: [], footnoteHeightPx: 0 }];
    const a = mk(); const b = mk();
    reflowFootnotes(a, fnCtx, 50, splitParagraphByLines);
    reflowFootnotes(b, fnCtx, 50, splitParagraphByLines);
    expect(allText(a)).toBe(allText(b));
    expect(a.map((p) => p.footnotes.length)).toEqual(b.map((p) => p.footnotes.length));
  });
});
