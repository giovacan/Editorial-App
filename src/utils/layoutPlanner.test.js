import { planLayoutHints } from './layoutPlanner';

describe('layoutPlanner', () => {
  test('returns stable global hints for structured manuscripts', () => {
    const result = planLayoutHints([
      {
        id: 'ch1',
        title: 'Capitulo 1',
        html: '<h1>Inicio</h1><p>Texto largo con suficiente densidad para una pagina estable.</p><blockquote><p>Cita importante.</p></blockquote>'
      },
      {
        id: 'ch2',
        title: 'Capitulo 2',
        html: '<p>Otro parrafo.</p><ul><li>Uno</li><li>Dos</li></ul>'
      }
    ], {
      pagination: { targetFillPct: 0.92 }
    });

    expect(result.version).toBe('local-heuristic-v1');
    expect(result.global.avoidSplitTags).toContain('BLOCKQUOTE');
    expect(result.global.avoidSplitTags).toContain('UL');
    expect(result.global.keepWithNextTags).toContain('H1');
    expect(result.global.minLastLineWords).toBe(6);
    expect(result.global.targetFillPct).toBeLessThanOrEqual(0.92);
    expect(result.chapters).toHaveLength(2);
  });

  test('relaxes fill target for airy short-line content', () => {
    const result = planLayoutHints([
      {
        id: 'poem',
        title: 'Poema',
        html: '<p>Linea uno</p><p>Linea dos</p><p>Linea tres</p><p>Linea cuatro</p>'
      }
    ], {
      pagination: { targetFillPct: 0.92 }
    });

    expect(result.global.targetFillPct).toBe(0.86);
    expect(result.chapters[0].notes).toContain('airy_chapter');
  });
});
