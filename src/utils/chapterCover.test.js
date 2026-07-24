import { describe, it, expect } from 'vitest';
import { buildChapterCoverHtml, COVER_LAYOUTS } from './chapterCover';

const base = { title: 'El Espíritu Santo', label: 'CAPÍTULO 3', imageSrc: 'data:img', dims: { contentWidth: 300, contentHeight: 480 } };

describe('buildChapterCoverHtml', () => {
  it('cada layout emite un bloque data-chapter-start con la imagen y el título', () => {
    for (const l of COVER_LAYOUTS) {
      const html = buildChapterCoverHtml({ ...base, layout: l.id });
      expect(html, l.id).toContain('data-chapter-start="true"');
      expect(html, l.id).toContain('<img');
      expect(html, l.id).toContain('src="data:img"');
      expect(html, l.id).toContain('El Espíritu Santo');
      // 'numeral' shows the big chapter number ("3") instead of the full label.
      if (l.id === 'numeral') expect(html, l.id).toMatch(/>3</);
      else expect(html, l.id).toContain('CAPÍTULO 3');
    }
  });

  it('díptico usa las dos imágenes', () => {
    const html = buildChapterCoverHtml({ ...base, layout: 'diptych', imageSrc: 'data:a', imageSrc2: 'data:b' });
    expect(html).toContain('src="data:a"');
    expect(html).toContain('src="data:b"');
  });

  it('aplica efectos: sombra, radio, borde, filtro', () => {
    const html = buildChapterCoverHtml({
      ...base, layout: 'title-top',
      effects: { shadow: true, radius: 12, border: { width: 3, color: '#000000' }, filter: 'grayscale', size: 0.5 },
    });
    expect(html).toContain('box-shadow');
    expect(html).toContain('border-radius:12px');
    expect(html).toContain('border:3px solid #000000');
    expect(html).toContain('grayscale');
  });

  it('medallón: recorte circular por defecto', () => {
    const html = buildChapterCoverHtml({ ...base, layout: 'medallion' });
    expect(html).toContain('border-radius:50%');
  });

  it('full-bleed: título superpuesto (posición absoluta + scrim)', () => {
    const html = buildChapterCoverHtml({ ...base, layout: 'full-bleed' });
    expect(html).toContain('position:absolute');
    expect(html).toContain('linear-gradient');
  });

  it('sin título/label no rompe', () => {
    const html = buildChapterCoverHtml({ layout: 'title-top', imageSrc: 'x', dims: base.dims });
    expect(html).toContain('<img');
  });
});
