/**
 * optimalPaginate.test.js
 *
 * Invariant + comparative tests for the global DP pagination engine.
 * Runs through the public paginateChapters() entry point so the whole
 * pipeline (title handling, repairs, clamp) is exercised.
 */

import { paginateChapters } from './paginateChapters';
import { measureHtmlHeight, createLayoutContext } from '../textLayoutEngine';
import { parseTopLevelBlocks, JUSTIFY_SLACK_RATIO } from '../layoutIr.js';
import { evaluatePageQualityCanvas } from './evaluation.js';
import { mergeIntoOne } from './metrics.js';

// ─── Deterministic synthetic book ────────────────────────────────────────────

const mulberry32 = (seed) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const WORDS = [
  'la', 'vida', 'tiempo', 'camino', 'luz', 'sombra', 'palabra', 'corazón',
  'silencio', 'mirada', 'memoria', 'ciudad', 'viento', 'historia', 'verdad',
  'noche', 'día', 'mundo', 'alma', 'fuego', 'esperanza', 'pensamiento',
  'libertad', 'destino', 'sueño', 'realidad', 'momento', 'sentido',
];

const makeSentence = (rnd) => {
  const n = 6 + Math.floor(rnd() * 12);
  const words = [];
  for (let i = 0; i < n; i++) words.push(WORDS[Math.floor(rnd() * WORDS.length)]);
  const s = words.join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
};

const makeParagraph = (rnd) => {
  const n = 2 + Math.floor(rnd() * 6);
  const out = [];
  for (let i = 0; i < n; i++) out.push(makeSentence(rnd));
  return out.join(' ');
};

const makeChapterHtml = (seed, paragraphCount) => {
  const rnd = mulberry32(seed);
  const parts = [];
  for (let i = 0; i < paragraphCount; i++) {
    if (i > 0 && i % 9 === 0) {
      parts.push(`<h2>Sección ${Math.floor(i / 9)}</h2>`);
    }
    if (i === 5) {
      parts.push(`<blockquote>${makeSentence(rnd)} ${makeSentence(rnd)}</blockquote>`);
    }
    parts.push(`<p>${makeParagraph(rnd)}</p>`);
  }
  return parts.join('');
};

const makeBook = () => ([
  { id: 'ch1', type: 'chapter', title: 'Capítulo 1', html: makeChapterHtml(101, 35), wordCount: 3000 },
  { id: 'ch2', type: 'chapter', title: 'Capítulo 2', html: makeChapterHtml(202, 45), wordCount: 4000 },
  { id: 'ch3', type: 'chapter', title: 'Capítulo 3', html: makeChapterHtml(303, 25), wordCount: 2000 },
]);

// ─── Shared config ───────────────────────────────────────────────────────────

const CONTENT_HEIGHT = 600;
const CONTENT_WIDTH = 400;
const LINE_HEIGHT_PX = 18;

const makeLayoutCtx = () => ({
  contentHeight: CONTENT_HEIGHT,
  contentWidth: CONTENT_WIDTH,
  lineHeightPx: LINE_HEIGHT_PX,
  baseFontSize: 12,
  baseLineHeight: 1.5,
  textAlign: 'justify',
  minOrphanLines: 2,
  minWidowLines: 2,
  splitLongParagraphs: true,
  headerSpaceEstimate: 0,
  fontFamily: 'Georgia, serif',
});

const makeSafeConfig = (engineMode) => ({
  paragraph: { align: 'justify', firstLineIndent: 1.5 },
  quote: {
    enabled: true, indentLeft: 2, indentRight: 2, showLine: true,
    italic: true, sizeMultiplier: 0.95, marginTop: 1, marginBottom: 1,
  },
  header: { trackSubheaders: true, subheaderLevels: ['h1', 'h2'] },
  pagination: {
    minOrphanLines: 2, minWidowLines: 2, splitLongParagraphs: true,
    ...(engineMode ? { engineMode } : {}),
  },
  chapterTitle: { enabled: true, layout: 'spaced' },
});

const makeCanvasCtx = () => ({
  ...createLayoutContext(12, 1.5, CONTENT_WIDTH, 'Georgia, serif'),
  widthSlack: CONTENT_WIDTH * JUSTIFY_SLACK_RATIO,
  lineHeightPx: LINE_HEIGHT_PX,
  textAlign: 'justify',
  noHyphenation: true,
  // Same height model the engine uses (engine-lines default ON).
  engineLinesRender: true,
});

const paginate = (engineMode) => {
  const { pages } = paginateChapters(makeBook(), makeLayoutCtx(), null, makeSafeConfig(engineMode));
  return pages;
};

const contentPages = (pages) =>
  pages.filter(p => !p.isBlank && !p.isTitleOnlyPage && p.html);

const pageStats = (pages, canvasCtx) => {
  const stats = { fills: [], severeUnderfill: 0, violations: {}, totalScore: 0 };
  for (const p of contentPages(pages)) {
    const h = measureHtmlHeight(p.html, canvasCtx);
    const fill = h / CONTENT_HEIGHT;
    if (!p.isChapterLastPage) {
      stats.fills.push(fill);
      if (fill < 0.75) stats.severeUnderfill++;
    }
    const q = evaluatePageQualityCanvas(p.html, CONTENT_HEIGHT, LINE_HEIGHT_PX, canvasCtx, false, {
      isChapterLastPage: p.isChapterLastPage === true,
    });
    stats.totalScore += q.score;
    for (const v of q.violations) stats.violations[v] = (stats.violations[v] || 0) + 1;
  }
  stats.avgFill = stats.fills.reduce((a, b) => a + b, 0) / Math.max(1, stats.fills.length);
  return stats;
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('optimalPaginate (global DP engine)', () => {
  let optimalPages;
  let canvasCtx;

  beforeAll(() => {
    canvasCtx = makeCanvasCtx();
    optimalPages = paginate(undefined); // default = 'optimal'
  }, 180000);

  it('produces pages', () => {
    expect(optimalPages.length).toBeGreaterThan(5);
  });

  it('no page opens with a pullable 1-line widow (widow-kill invariant)', () => {
    // A ≤1-line data-continuation fragment at the top of a page must only
    // survive when the previous page genuinely has no room for it.
    const budget = CONTENT_HEIGHT;
    for (let i = 1; i < optimalPages.length; i++) {
      const page = optimalPages[i];
      if (!page?.html || page.isBlank || page.isTitleOnlyPage) continue;
      let prevIdx = i - 1;
      while (prevIdx >= 0 && optimalPages[prevIdx]?.isBlank) prevIdx--;
      const prev = optimalPages[prevIdx];
      if (!prev?.html || prev.isTitleOnlyPage || prev.chapterTitle !== page.chapterTitle) continue;
      const blocks = parseTopLevelBlocks(page.html);
      const first = blocks[0];
      if (!first || !/data-continuation/.test(first.outerHtml)) continue;
      const fragH = measureHtmlHeight(first.outerHtml, canvasCtx);
      if (fragH > LINE_HEIGHT_PX * 1.6) continue;
      const prevBlocks = parseTopLevelBlocks(prev.html);
      const last = prevBlocks[prevBlocks.length - 1];
      if (!last || !/data-split-head/.test(last.outerHtml)) continue;
      // Rebuild exactly what widow-kill would have produced: if THAT fits the
      // budget, the widow should have been pulled — surviving it is a bug.
      const merged = mergeIntoOne(last.outerHtml, first.outerHtml)
        .replace(/\s*data-split-head="[^"]*"/i, '');
      const newPrevHtml = prevBlocks.slice(0, -1).map(b => b.outerHtml).join('') + merged;
      expect(measureHtmlHeight(newPrevHtml, canvasCtx), `widow at page index ${i} was pullable`)
        .toBeGreaterThan(budget);
    }
  });

  it('no blank page sits mid-chapter (only allowed before a chapter start)', () => {
    // A blank page is legal ONLY as a parity blank right before a chapter
    // start. A blank surrounded by same-chapter content is a spurious white
    // page (folio 121 report: merged-away page left as a blank mid-chapter).
    for (let i = 1; i < optimalPages.length - 1; i++) {
      const p = optimalPages[i];
      if (!p?.isBlank) continue;
      // Find the next non-blank page.
      let n = i + 1;
      while (n < optimalPages.length && optimalPages[n]?.isBlank) n++;
      const next = optimalPages[n];
      if (!next) continue;
      // Legal if the next page starts a chapter (parity blank). Otherwise the
      // previous non-blank must be a different chapter (end-of-chapter slack).
      if (next.isFirstChapterPage) continue;
      let pr = i - 1;
      while (pr >= 0 && optimalPages[pr]?.isBlank) pr--;
      const prev = optimalPages[pr];
      if (prev && !prev.isBlank) {
        expect(
          prev.chapterTitle !== next.chapterTitle,
          `blank page at index ${i} sits mid-chapter "${next.chapterTitle}"`
        ).toBe(true);
      }
    }
  });

  it('every chapter start lands on a right (odd) page after ALL passes', () => {
    // Parity must survive the page-inserting passes (heading fixes, safety
    // clamp) — the folios 128/129 report: chapter 7 opened on a left page.
    optimalPages.forEach((p, i) => {
      if (p.isFirstChapterPage) {
        expect((i + 1) % 2, `chapter start at physical position ${i + 1}`).toBe(1);
      }
    });
  });

  it('never overflows the page budget (canvas measurement)', () => {
    for (const p of contentPages(optimalPages)) {
      const h = measureHtmlHeight(p.html, canvasCtx);
      expect(h).toBeLessThanOrEqual(CONTENT_HEIGHT + 2);
    }
  });

  it('numbers pages sequentially', () => {
    const nonBlank = optimalPages.filter(p => !p.isBlank);
    let expected = 1;
    for (const p of optimalPages) {
      if (!p.isBlank) {
        expect(p.pageNumber).toBe(expected);
      }
      expected++;
    }
    expect(nonBlank.length).toBeGreaterThan(0);
  });

  it('sets chapterTitle on every content page', () => {
    for (const p of contentPages(optimalPages)) {
      expect(p.chapterTitle).toBeTruthy();
    }
  });

  it('never leaves a heading as the last block of a page with following content', () => {
    const pages = contentPages(optimalPages);
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      if (p.isChapterLastPage) continue;
      const blocks = parseTopLevelBlocks(p.html);
      if (blocks.length === 0) continue;
      const last = blocks[blocks.length - 1];
      expect(/^H[1-6]$/i.test(last.tag)).toBe(false);
    }
  });

  it('places continuation fragments only at the top of a page', () => {
    for (const p of contentPages(optimalPages)) {
      const blocks = parseTopLevelBlocks(p.html);
      for (let bi = 1; bi < blocks.length; bi++) {
        expect(blocks[bi].dataset?.continuation === 'true').toBe(false);
      }
    }
  });

  it('keeps orphan fragments at ≥2 lines (top-of-page continuations)', () => {
    for (const p of contentPages(optimalPages)) {
      const blocks = parseTopLevelBlocks(p.html);
      const first = blocks[0];
      if (!first || first.dataset?.continuation !== 'true') continue;
      const h = measureHtmlHeight(first.outerHtml, canvasCtx);
      const lines = Math.round(h / LINE_HEIGHT_PX);
      expect(lines).toBeGreaterThanOrEqual(2);
    }
  });

  it('is deterministic (two runs produce identical pages)', () => {
    const again = paginate(undefined);
    expect(again.length).toBe(optimalPages.length);
    for (let i = 0; i < again.length; i++) {
      expect(again[i].html).toBe(optimalPages[i].html);
    }
  }, 180000);

  it('legacy greedy engine still works via engineMode config', () => {
    const greedyPages = paginate('greedy');
    expect(greedyPages.length).toBeGreaterThan(5);
  }, 180000);

  it('is not worse than greedy on fill and quality score', () => {
    const greedyPages = paginate('greedy');
    const opt = pageStats(optimalPages, canvasCtx);
    const gre = pageStats(greedyPages, canvasCtx);

    console.log('[COMPARE] optimal:', {
      pages: optimalPages.length, avgFill: +(opt.avgFill * 100).toFixed(1),
      severeUnderfill: opt.severeUnderfill, score: +opt.totalScore.toFixed(0),
      violations: opt.violations,
    });
    console.log('[COMPARE] greedy :', {
      pages: greedyPages.length, avgFill: +(gre.avgFill * 100).toFixed(1),
      severeUnderfill: gre.severeUnderfill, score: +gre.totalScore.toFixed(0),
      violations: gre.violations,
    });

    expect(opt.severeUnderfill).toBeLessThanOrEqual(gre.severeUnderfill);
    expect(opt.avgFill).toBeGreaterThanOrEqual(Math.min(gre.avgFill, 0.85) - 0.02);
    expect(opt.totalScore).toBeLessThanOrEqual(gre.totalScore * 1.05 + 50);
  }, 180000);

  it('fills non-final pages reasonably (avg ≥ 70%)', () => {
    const opt = pageStats(optimalPages, canvasCtx);
    expect(opt.avgFill).toBeGreaterThanOrEqual(0.70);
  });
});
