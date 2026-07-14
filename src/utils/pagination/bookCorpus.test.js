/**
 * Corpus de regresión multi-libro.
 *
 * Corre el motor COMPLETO (DP + post-passes + ley de corte) sobre cada libro
 * real guardado en src/__fixtures__/books/ y aplica el gate de calidad
 * (computeQualityReport — las mismas reglas que ve el usuario en el badge).
 *
 * Regla de oro: cada libro que falló en producción se agrega aquí con
 * `node scripts/addBookToCorpus.mjs <slug> [minScore]` después de paginarlo
 * en dev. Un fix para el libro A ya no puede romper el libro B sin que esta
 * suite lo detecte ANTES del deploy.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { paginateChapters } from './paginateChapters';

// Extracción de texto que NO fusiona palabras en las fronteras de bloque
// (htmlToText de layoutIr quita etiquetas sin insertar espacio).
const textOf = (html) => (html || '').replace(/<[^>]+>/g, ' ');

const FIXTURES_DIR = path.resolve(__dirname, '../../__fixtures__/books');
const books = fs.existsSync(FIXTURES_DIR)
  ? fs.readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.json'))
  : [];

const SAFE_CONFIG = {
  pageFormat: 'a5',
  paragraph: { align: 'justify', firstLineIndent: 1.5 },
  quote: {
    enabled: true, indentLeft: 2, indentRight: 2, showLine: true,
    italic: true, sizeMultiplier: 0.95, marginTop: 1, marginBottom: 1,
  },
  header: { trackSubheaders: true, trackPseudoHeaders: false, subheaderLevels: ['h1', 'h2'] },
  pagination: { targetFillPct: 0.88 },
  render: { engineLines: true },
};

const buildLayoutCtx = (fx) => {
  const c = fx.layoutCtx || {};
  const lineHeightPx = c.lineHeightPx || 10;
  const baseLineHeight = c.baseLineHeight || 1.5;
  return {
    contentHeight: c.contentHeight || 230,
    contentWidth: c.contentWidth || 154,
    lineHeightPx,
    baseFontSize: (c.baseFontSizePx || lineHeightPx / baseLineHeight) * (72 / 96),
    baseFontSizePx: c.baseFontSizePx || lineHeightPx / baseLineHeight,
    baseLineHeight,
    textAlign: c.textAlign || 'justify',
    fontFamily: c.fontFamily || 'Georgia, serif',
    minOrphanLines: c.minOrphanLines || 2,
    minWidowLines: c.minWidowLines || 2,
    splitLongParagraphs: true,
    headerSpaceEstimate: 19,
    chapterStartBottomClearance: 0,
    chapterStartExtraLines: 0,
  };
};

const wordCount = (s) => (s.match(/\S+/g) || []).length;

describe('corpus de regresión multi-libro', () => {
  if (books.length === 0) {
    it.skip('sin fixtures — agrega libros con scripts/addBookToCorpus.mjs', () => {});
    return;
  }

  for (const file of books) {
    const fx = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf8'));

    it(`${fx.name}: pagina completo y pasa el gate de calidad`, { timeout: 600000 }, () => {
      const layoutCtx = buildLayoutCtx(fx);
      const result = paginateChapters(fx.chapters, layoutCtx, null, SAFE_CONFIG);

      expect(result.pages.length).toBeGreaterThan(0);
      const report = result.qualityReport;
      expect(report, 'el motor debe producir qualityReport').toBeTruthy();

      // ── Invariantes duros (nunca negociables) ──────────────────────────
      // 1. Ningún texto se pierde ni duplica (palabras entrada ≈ salida).
      const inWords = fx.chapters.reduce((a, ch) => a + wordCount(textOf(ch.html)), 0);
      const outWords = result.pages.reduce((a, p) => a + (p.isBlank ? 0 : wordCount(textOf(p.html || ''))), 0);
      // los títulos de capítulo se re-generan (label + nombre) → tolerancia pequeña
      const titleWords = fx.chapters.reduce((a, ch) => a + wordCount(ch.title || ''), 0);
      expect(Math.abs(outWords - inWords), `palabras entrada=${inWords} salida=${outWords}`)
        .toBeLessThanOrEqual(titleWords * 3 + 30);

      // 2. Cero desbordes y cero líneas de corte cortas estiradas.
      expect(report.counts.overflow || 0, JSON.stringify(report.defects.filter(d => d.type === 'overflow').slice(0, 5))).toBe(0);
      expect(report.counts.stretched_cut || 0, JSON.stringify(report.defects.filter(d => d.type === 'stretched_cut').slice(0, 5))).toBe(0);

      // ── Gate de puntaje (por libro, definido en el fixture) ────────────
      const minScore = fx.gate?.minScore ?? 9.0;
      expect(report.score, `score=${report.score} < gate=${minScore} — defectos: ${JSON.stringify(report.counts)}`)
        .toBeGreaterThanOrEqual(minScore);
    });
  }
});
