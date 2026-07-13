/**
 * contentParser.test.js — split de capítulos con TDC del documento.
 */
import { parseHtmlContent } from './contentParser';

const CUERPO = 'Tarde o temprano, todos nos preguntamos cuál es la razón de nuestra existencia y qué propósito tiene la vida que se nos ha dado sobre esta tierra desde el principio.';

describe('parseHtmlContent con tabla de contenidos propia', () => {
  const html = [
    '<p>CREADOS PARA UN PROPÓSITO</p>',
    '<p>CONTENIDO</p>',
    '<p>INTRODUCCIÓN</p>',
    '<p>LECCIÓN 1\tLa Intención Original De Dios</p>',
    '<p>LECCIÓN 2\tLas Actitudes Y Excusas</p>',
    '<p>LECCIÓN 3\tProcesados Para Un Propósito</p>',
    '<p>INTRODUCCIÓN</p>',
    `<p>${CUERPO}</p>`,
    `<p>${CUERPO} Segunda parte del cuerpo introductorio.</p>`,
  ].join('');

  it('omite la TDC, rescata el título real y no inventa capítulos del listado', () => {
    const { chapters } = parseHtmlContent(html);
    const titles = chapters.map(c => c.title);
    // Un capítulo INTRODUCCIÓN real (el B6), nada del listado como capítulo
    expect(titles.some(t => /^INTRODUCCIÓN$/i.test(t))).toBe(true);
    expect(titles.some(t => /^LECCIÓN/i.test(t))).toBe(false);
    // El contenido del listado NO aparece en ningún capítulo
    const allHtml = chapters.map(c => c.html).join('');
    expect(allHtml).not.toContain('Procesados Para Un Propósito');
    expect(allHtml).not.toContain('CONTENIDO');
    // El cuerpo sí está
    expect(allHtml).toContain('Tarde o temprano');
  });

  it('lecciones reales con cuerpo siguen abriendo capítulo', () => {
    const html2 = [
      `<p>INTRODUCCIÓN</p>`,
      `<p>${CUERPO}</p>`,
      '<p>LECCIÓN 1 La Intención Original De Dios</p>',
      `<p>${CUERPO}</p>`,
      '<p>LECCIÓN 2 Las Actitudes</p>',
      `<p>${CUERPO}</p>`,
    ].join('');
    const { chapters } = parseHtmlContent(html2);
    const titles = chapters.map(c => c.title);
    expect(titles.filter(t => /^LECCIÓN/i.test(t)).length).toBe(2);
    expect(titles.some(t => /^INTRODUCCIÓN$/i.test(t))).toBe(true);
  });
});
