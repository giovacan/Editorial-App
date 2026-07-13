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

  it('títulos del cuerpo que coinciden con la TDC abren capítulo (sin prefijo)', () => {
    const html3 = [
      '<p>CONTENIDO</p>',
      '<p>INTRODUCCIÓN</p>',
      '<p>LECCIÓN 1\tLa Intención Original De Dios</p>',
      '<p>LECCIÓN 2\tLas Actitudes Y Excusas</p>',
      '<p>INTRODUCCIÓN</p>',
      `<p>${CUERPO}</p>`,
      '<p>LA INTENCIÓN ORIGINAL DE DIOS</p>',   // título del cuerpo SIN "LECCIÓN 1"
      `<p>${CUERPO}</p>`,
      '<p>LAS ACTITUDES Y EXCUSAS</p>',
      `<p>${CUERPO}</p>`,
    ].join('');
    const { chapters } = parseHtmlContent(html3);
    const titles = chapters.map(c => c.title);
    expect(titles.some(t => /^INTRODUCCIÓN$/i.test(t))).toBe(true);
    expect(titles.some(t => /INTENCIÓN ORIGINAL/i.test(t))).toBe(true);
    expect(titles.some(t => /ACTITUDES Y EXCUSAS/i.test(t))).toBe(true);
    expect(chapters.length).toBe(3);
  });

  it('detecta el título del cuerpo aunque difiera del índice en una palabra', () => {
    const html4 = [
      '<p>CONTENIDO</p>',
      '<p>INTRODUCCIÓN</p>',
      '<p>LECCIÓN 2\tLas Actitudes Y Excusas Frente Al Llamado De Dios</p>',
      '<p>INTRODUCCIÓN</p>',
      `<p>${CUERPO}</p>`,
      // cuerpo con "LAS ... Y LAS EXCUSAS" (una palabra extra vs índice)
      '<p>LAS ACTITUDES Y LAS EXCUSAS FRENTE AL LLAMADO DE DIOS</p>',
      `<p>${CUERPO}</p>`,
    ].join('');
    const { chapters } = parseHtmlContent(html4);
    const titles = chapters.map(c => c.title);
    expect(titles.some(t => /ACTITUDES Y LAS EXCUSAS/i.test(t))).toBe(true);
  });

  it('matchea a pesar de signos ¿? y posesivos distintos (mi vs su)', () => {
    const html6 = [
      '<p>CONTENIDO</p>',
      '<p>LECCIÓN 5\t¿Cómo Descubrir Mi Propósito?</p>',
      '<p>INTRODUCCIÓN</p>',
      `<p>${CUERPO}</p>`,
      '<p>CÓMO DESCUBRIR SU PROPÓSITO</p>',   // sin signos, "su" en vez de "mi"
      `<p>${CUERPO}</p>`,
    ].join('');
    const { chapters } = parseHtmlContent(html6);
    expect(chapters.map(c => c.title).some(t => /DESCUBRIR SU PROPÓSITO/i.test(t))).toBe(true);
  });

  it('un subtítulo que es fragmento de una entrada del índice NO abre capítulo', () => {
    const html7 = [
      '<p>CONTENIDO</p>',
      '<p>LECCIÓN 2\tLas Actitudes Y Excusas Frente Al Llamado De Dios</p>',
      '<p>LECCIÓN 4\tViviendo Para Un Propósito</p>',
      '<p>INTRODUCCIÓN</p>',
      `<p>${CUERPO}</p>`,
      '<p>LAS ACTITUDES Y LAS EXCUSAS FRENTE AL LLAMADO DE DIOS</p>', // título real L2
      `<p>${CUERPO}</p>`,
      '<p>Excusas frente al llamado de Dios</p>',   // subtítulo interno (fragmento) → NO
      `<p>${CUERPO}</p>`,
      '<p>VIVIENDO PARA UN PROPÓSITO</p>',           // título real L4
      `<p>${CUERPO}</p>`,
      '<p>4. Una vida viviendo para un propósito</p>', // subtítulo interno → NO
      `<p>${CUERPO}</p>`,
    ].join('');
    const { chapters } = parseHtmlContent(html7);
    const titles = chapters.map(c => c.title);
    // Exactamente: INTRODUCCIÓN, L2 real, L4 real (los 2 fragmentos NO)
    expect(titles.some(t => /^INTRODUCCIÓN$/i.test(t))).toBe(true);
    expect(titles.filter(t => /ACTITUDES/i.test(t)).length).toBe(1);
    expect(titles.filter(t => /VIVIENDO PARA UN PROPÓSITO/i.test(t)).length).toBe(1);
    expect(titles.some(t => /^Excusas frente/i.test(t))).toBe(false);
    expect(titles.some(t => /Una vida viviendo/i.test(t))).toBe(false);
  });

  it('extrae el título del libro y lo saca del contenido', () => {
    const html = [
      '<p>CREADOS PARA UN PROPÓSITO</p>',   // título del libro
      '<p>CONTENIDO</p>',
      '<p>INTRODUCCIÓN</p>',
      '<p>LECCIÓN 1\tPrimera Lección</p>',
      '<p>INTRODUCCIÓN</p>',
      `<p>${CUERPO}</p>`,
    ].join('');
    const { chapters, bookTitle } = parseHtmlContent(html);
    expect(bookTitle).toBe('CREADOS PARA UN PROPÓSITO');
    // El título NO aparece como contenido/capítulo
    expect(chapters.map(c => c.title).some(t => /CREADOS PARA UN/i.test(t))).toBe(false);
    expect(chapters.map(c => c.html).join('')).not.toContain('CREADOS PARA UN PROPÓSITO');
  });

  it('no inventa título cuando el documento arranca con cuerpo', () => {
    const html = `<p>${CUERPO}</p><p>Más texto narrativo de cuerpo que sigue el flujo natural del documento sin ningún título.</p>`;
    const { bookTitle } = parseHtmlContent(html);
    expect(bookTitle).toBe('');
  });

  it('adjunta el rótulo (LECCIÓN N) del índice al capítulo, front-matter sin rótulo', () => {
    const html = [
      '<p>CONTENIDO</p>',
      '<p>INTRODUCCIÓN</p>',
      '<p>LECCIÓN 1\tLa Intención Original De Dios</p>',
      '<p>LECCIÓN 2\tLas Actitudes Y Excusas</p>',
      '<p>INTRODUCCIÓN</p>',
      `<p>${CUERPO}</p>`,
      '<p>LA INTENCIÓN ORIGINAL DE DIOS</p>',   // cuerpo sin rótulo → lo toma del índice
      `<p>${CUERPO}</p>`,
      '<p>LAS ACTITUDES Y EXCUSAS</p>',
      `<p>${CUERPO}</p>`,
    ].join('');
    const { chapters } = parseHtmlContent(html);
    const intro = chapters.find(c => /INTRODUCCIÓN/i.test(c.chapterName || c.title));
    expect(intro.chapterLabel).toBe('');                        // front-matter: sin rótulo
    const l1 = chapters.find(c => /INTENCIÓN ORIGINAL/i.test(c.chapterName || ''));
    expect(l1.chapterLabel).toBe('LECCIÓN 1');                  // rótulo del índice
    expect(l1.chapterName).toMatch(/INTENCIÓN ORIGINAL/i);
    expect(l1.title).toBe('LECCIÓN 1  LA INTENCIÓN ORIGINAL DE DIOS');
    const l2 = chapters.find(c => /ACTITUDES/i.test(c.chapterName || ''));
    expect(l2.chapterLabel).toBe('LECCIÓN 2');
  });

  it('rótulo ya presente en el texto del cuerpo se respeta tal cual', () => {
    const html = [
      '<p>CAPÍTULO 3 - La Virtud Del Pudor</p>',
      `<p>${CUERPO}</p>`,
    ].join('');
    const { chapters } = parseHtmlContent(html);
    const ch = chapters.find(c => /PUDOR|Virtud/i.test(c.title));
    expect(ch.chapterLabel).toBe('CAPÍTULO 3');
    expect(ch.chapterName).toMatch(/Virtud Del Pudor/i);
  });

  it('rótulo solo ("CAPÍTULO 1") toma el nombre de la línea siguiente, sin duplicar', () => {
    const html = [
      '<p>CAPÍTULO 1</p>',
      '<p>CAPÍTULO 1</p>',                       // Word duplica el rótulo
      '<p>UNA ANTORCHA EN LA OSCURIDAD</p>',     // el nombre real
      `<p>${CUERPO}</p>`,
      '<p>CAPÍTULO 2</p>',
      '<p>EL SEGUNDO NOMBRE</p>',
      `<p>${CUERPO}</p>`,
    ].join('');
    const { chapters } = parseHtmlContent(html);
    expect(chapters.length).toBe(2);
    const c1 = chapters[0];
    expect(c1.chapterLabel).toBe('CAPÍTULO 1');
    expect(c1.chapterName).toBe('UNA ANTORCHA EN LA OSCURIDAD');
    expect(c1.title).toBe('CAPÍTULO 1  UNA ANTORCHA EN LA OSCURIDAD');
    expect(c1.title).not.toMatch(/CAPÍTULO 1\s+CAPÍTULO 1/);
    // el nombre no debe quedar como párrafo del cuerpo
    expect(c1.html).not.toContain('UNA ANTORCHA EN LA OSCURIDAD');
    expect(chapters[1].chapterName).toBe('EL SEGUNDO NOMBRE');
  });

  it('auto-numera capítulos sin rótulo (y sin índice que consultar)', () => {
    const html = [
      '<p>CAPÍTULO 1 Primero</p>',      // trae rótulo → respeta y avanza contador
      `<p>${CUERPO}</p>`,
      '<h1>Un Título Sin Número</h1>',  // H1 sin rótulo → auto
      `<p>${CUERPO}</p>`,
    ].join('');
    const { chapters } = parseHtmlContent(html);
    const auto = chapters.find(c => /Sin Número/i.test(c.chapterName || c.title));
    expect(auto.chapterLabel).toMatch(/\b2\b/); // segundo capítulo → número 2
  });

  it('no descarta contenido que aparece antes del primer capítulo', () => {
    const html5 = [
      '<p>CONTENIDO</p>',
      '<p>LECCIÓN 1\tPrimera</p>',
      `<p>Texto de prólogo que aparece antes de cualquier título detectado y que no debe perderse jamás en la importación del documento.</p>`,
      '<p>PRIMERA</p>',
      `<p>${CUERPO}</p>`,
    ].join('');
    const { chapters } = parseHtmlContent(html5);
    const allHtml = chapters.map(c => c.html).join('');
    expect(allHtml).toContain('Texto de prólogo que aparece antes');
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
