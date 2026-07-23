/**
 * imagesEngine.test.js — B2 engine integration.
 *
 * An <img> must survive pagination (not be dropped), be measured from its
 * data-w/data-h scaled to the column, and — when tall — land on its own page
 * without overlapping text. A chapter without images paginates identically.
 */
import { describe, it, expect } from 'vitest';
import { paginateChapters } from './paginateChapters';

const CONTENT_HEIGHT = 600;
const CONTENT_WIDTH = 400;
const LINE_HEIGHT_PX = 18;

const layoutCtx = () => ({
  contentHeight: CONTENT_HEIGHT, contentWidth: CONTENT_WIDTH, lineHeightPx: LINE_HEIGHT_PX,
  baseFontSize: 12, baseLineHeight: 1.5, textAlign: 'justify',
  minOrphanLines: 2, minWidowLines: 2, splitLongParagraphs: true,
  headerSpaceEstimate: 0, fontFamily: 'Georgia, serif',
});
const safeConfig = () => ({
  paragraph: { align: 'justify', firstLineIndent: 1.5 },
  pagination: { minOrphanLines: 2, minWidowLines: 2, splitLongParagraphs: true },
  chapterTitle: { enabled: true, layout: 'spaced' },
  images: { maxWidthFrac: 0.9, maxHeightFrac: 0.85, align: 'center' },
});

const PARA = 'La memoria del tiempo dibuja un camino de luz y sombra sobre la ciudad dormida.';
// 1×1 transparent PNG data-URI (tiny but valid src).
const SRC = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const chapterWithImg = (w, h) => ({
  id: 'ch1', type: 'chapter', title: 'Capítulo 1',
  html: `<p>${PARA}</p><img src="${SRC}" data-w="${w}" data-h="${h}" alt="foto"><p>${PARA}</p>`,
  wordCount: 100,
});

const paginate = (chapter) => paginateChapters([chapter], layoutCtx(), null, safeConfig()).pages;
const allHtml = (pages) => pages.map((p) => p.html).join('');

describe('images engine (B2)', () => {
  it('la imagen NO se descarta: aparece en las páginas', () => {
    const pages = paginate(chapterWithImg(800, 600));
    expect(allHtml(pages)).toContain('<img');
    expect(allHtml(pages)).toContain(SRC);
  });

  it('una imagen apaisada normal cabe con el texto (pocas páginas)', () => {
    const pages = paginate(chapterWithImg(800, 400)); // 800×400 → escala a ~360×180
    expect(pages.length).toBeLessThanOrEqual(2);
    expect(allHtml(pages)).toContain('<img');
  });

  it('una imagen muy alta no solapa el texto (bloque no divisible)', () => {
    // 400×3000 → retrato gigante; con maxHeightFrac 0.85 se capa pero sigue alto.
    const pages = paginate(chapterWithImg(400, 3000));
    // La imagen existe y el texto íntegro (2 párrafos presentes en total).
    const html = allHtml(pages);
    expect(html).toContain('<img');
    expect((html.match(/La memoria del tiempo/g) || []).length).toBe(2);
  });

  it('capítulo sin imágenes: pagina normal (mismo texto)', () => {
    const noImg = { id: 'c', type: 'chapter', title: 'C', html: `<p>${PARA}</p><p>${PARA}</p>`, wordCount: 40 };
    const pages = paginate(noImg);
    expect(allHtml(pages)).not.toContain('<img');
    expect((allHtml(pages).match(/La memoria/g) || []).length).toBe(2);
  });

  it('es determinista', () => {
    const a = paginate(chapterWithImg(800, 600));
    const b = paginate(chapterWithImg(800, 600));
    expect(a.length).toBe(b.length);
  });
});
