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

  it('normaliza espacios múltiples y etiquetas <em> sueltas del documento', () => {
    const html = [
      `<p>CAPÍTULO 1 Primero</p>`,
      `<p>panorama profético sobre cualquier           acontecimiento global que enfrentemos. ${CUERPO}</p>`,
      `<p>Rey, y él mismo nos salvará! </em> Él nos salvará de esos gobernantes. ${CUERPO}</p>`,
    ].join('');
    const { chapters } = parseHtmlContent(html);
    const allHtml = chapters.map(c => c.html).join('');
    // sin runs de 3+ espacios
    expect(/\S {3,}\S/.test(allHtml)).toBe(false);
    // sin </em> huérfano
    const emOpen = (allHtml.match(/<em[\s>]/gi) || []).length;
    const emClose = (allHtml.match(/<\/em>/gi) || []).length;
    expect(emClose).toBeLessThanOrEqual(emOpen);
    // el texto se conserva
    expect(allHtml).toContain('panorama profético sobre cualquier acontecimiento');
    expect(allHtml).toContain('Rey, y él mismo nos salvará');
  });
});

describe('títulos multilínea con PARTE N (libro El Traslado)', () => {
  it('funde el PARTE N apilado al título en vez de abrir capítulo fantasma', () => {
    const html = [
      '<p>CAPÍTULO 7</p>',
      '<p>EVENTOS DE LA SEMANA SETENTA O</p>',
      '<p>LA TRIBULACIÓN</p>',
      '<p>PARTE 1</p>',
      `<p>${CUERPO}</p><p>${CUERPO}</p>`,
      '<p>CAPÍTULO 8</p>',
      '<p>EVENTOS SEMANA SETENTA DE DANIEL</p>',
      '<p>LA TRIBULACIÓN</p>',
      '<p>PARTE 2</p>',
      `<p>${CUERPO}</p>`,
    ].join('');
    const { chapters } = parseHtmlContent(html);
    expect(chapters.length).toBe(2);
    // Título completo reconstruido, sin capítulos "PARTE N"
    expect(chapters[0].title).toContain('CAPÍTULO 7');
    expect(chapters[0].title).toContain('LA TRIBULACIÓN');
    expect(chapters[0].title).toContain('PARTE 1');
    expect(chapters[1].title).toContain('PARTE 2');
    expect(chapters.some(c => /^PARTE\s+\d+$/i.test(c.title))).toBe(false);
    // El contenido real quedó en su capítulo (no en uno fantasma)
    expect(chapters[0].html).toContain('Tarde o temprano');
    expect(chapters[0].html).not.toContain('<p>LA TRIBULACIÓN</p>');
    expect(chapters[1].html).toContain('Tarde o temprano');
  });

  it('una PARTE real (capítulo anterior con cuerpo) queda como divisoria fullPage', () => {
    const html = [
      '<p>PARTE 1</p>',
      '<p>CAPÍTULO 1</p>',
      '<p>El Principio</p>',
      `<p>${CUERPO}</p><p>${CUERPO}</p>`,
      '<p>PARTE 2</p>',
      '<p>CAPÍTULO 2</p>',
      '<p>El Final</p>',
      `<p>${CUERPO}</p><p>${CUERPO}</p>`,
    ].join('');
    const { chapters } = parseHtmlContent(html);
    const parts = chapters.filter(c => c.type === 'part');
    expect(parts.length).toBe(2);
    expect(parts[0].titleLayout).toBe('fullPage');
    expect(parts[1].titleLayout).toBe('fullPage');
    // Los capítulos numerados conservan su contenido
    const caps = chapters.filter(c => c.type === 'chapter' && c.chapterLabel);
    expect(caps.length).toBe(2);
    expect(caps[0].html).toContain('Tarde o temprano');
  });
});

describe('documento con TDC + rótulos bare + secciones libres (escenario El Traslado)', () => {
  it('sin duplicados, sin fantasmas del fuzzy, secciones all-caps separadas y acomodadas', () => {
    const html = [
      '<p>EL TRASLADO DE LA IGLESIA</p>',
      '<p>CONTENIDO</p>',
      '<p>INTRODUCCIÓN</p>',
      '<p>CAPÍTULO 1 UNA ANTORCHA EN LA OSCURIDAD</p>',
      '<p>CAPÍTULO 2 EVENTOS SEMANA SETENTA DE DANIEL</p>',
      '<p>CAPÍTULO 3 EL REINO ETERNO PROMETIDO</p>',
      // cuerpo
      '<p>CAPÍTULO 1</p>',
      '<p>UNA ANTORCHA EN LA OSCURIDAD</p>',
      `<p>${CUERPO}</p>`,
      // subtítulo interno MUY parecido a la entrada TDC del cap 2 (fuzzy bait)
      '<p>LA SEMANA SETENTA DE DANIEL</p>',
      `<p>${CUERPO}</p>`,
      '<p>CAPÍTULO 2</p>',
      '<p>EVENTOS SEMANA SETENTA DE DANIEL</p>',
      `<p>${CUERPO}</p>`,
      '<p>CAPÍTULO 3</p>',
      '<p>EL REINO ETERNO PROMETIDO</p>',
      `<p>${CUERPO}</p>`,
      // bloque final no numerado con secciones embebidas
      '<p>INTRODUCCIÓN</p>',
      `<p>${CUERPO}</p>`,
      '<p>LA INMINENCIA DEL TRASLADO</p>',
      `<p>${CUERPO}</p>`,
      // rótulos de comparación (NO secciones: siguen líneas cortas)
      '<p>TRASLADO</p>',
      '<p>SEGUNDA VENIDA</p>',
      '<p>Una línea corta.</p>',
      '<p>REFERENCIAS BIBLIOGRÁFICAS</p>',
      '<p>AUTOR UNO. (1989). OBRA DE REFERENCIA COMPLETA. PAÍS. EDITORIAL.</p>',
    ].join('');
    const { chapters, bookTitle } = parseHtmlContent(html);
    expect(bookTitle).toBe('EL TRASLADO DE LA IGLESIA');
    const labels = chapters.map(c => `${c.chapterLabel}|${c.chapterName}`);
    // Sin capítulos duplicados vacíos (bare label + nombre aprobado por TDC)
    const cap1 = chapters.filter(c => c.chapterLabel === 'CAPÍTULO 1');
    expect(cap1.length).toBe(1);
    expect(cap1[0].chapterName).toBe('UNA ANTORCHA EN LA OSCURIDAD');
    expect(cap1[0].html).toContain('Tarde o temprano');
    // El subtítulo interno NO abrió capítulo fantasma (fuzzy desactivado con bare labels)
    expect(labels.some(l => /LA SEMANA SETENTA DE DANIEL/.test(l) && /CAPÍTULO/.test(l))).toBe(false);
    expect(cap1[0].html).toContain('LA SEMANA SETENTA DE DANIEL');
    // Secciones libres separadas; rótulos de comparación NO
    expect(chapters.some(c => c.chapterName === 'LA INMINENCIA DEL TRASLADO')).toBe(true);
    expect(chapters.some(c => /^TRASLADO/.test(c.chapterName || ''))).toBe(false);
    // REFERENCIAS al final (back matter), INTRODUCCIÓN al frente
    const names = chapters.map(c => (c.chapterName || c.title).toUpperCase());
    const iIntro = names.findIndex(n => /INTRODUCCIÓN/.test(n));
    const iRef = names.findIndex(n => /REFERENCIAS/.test(n));
    expect(iIntro).toBe(0);
    expect(iRef).toBe(chapters.length - 1);
  });
});

describe('piezas vacías del final del documento (Panorama)', () => {
  it('descarta el heading huérfano del índice y fusiona APÉNDICE con su sección libre', () => {
    const html = [
      '<p>CAPÍTULO 1</p>',
      '<p>El Principio</p>',
      `<p>${CUERPO}</p><p>${CUERPO}</p>`,
      '<p>INTRODUCCIÓN</p>',      // título de la página del índice — sin contenido propio
      '<p>INDICE</p>',
      '<p>INTRODUCCIÓN ………… 5</p>',
      '<p>1. UNA ANTORCHA EN LA OSCURIDAD .. 7</p>',
      '<p>APENDICE …. 249</p>',
      '<p>APÉNDICE</p>',           // heading real, cuerpo capturado por la sección libre
      '<p>MATEO 24 UN CAPÍTULO</p>',
      '<p>MAL ENTENDIDO</p>',
      `<p>${CUERPO}</p><p>${CUERPO}</p>`,
    ].join('');
    const { chapters } = parseHtmlContent(html);
    const names = chapters.map(c => (c.chapterName || c.title).toUpperCase());
    // Sin INTRODUCCIÓN fantasma (el doc no tiene texto de intro)
    expect(names.some(n => /^INTRODUCCIÓN$/.test(n))).toBe(false);
    // APÉNDICE fusionado con su sección y con el cuerpo
    const ap = chapters.find(c => /^APÉNDICE — MATEO 24/.test(c.chapterName || c.title || ''));
    expect(ap).toBeTruthy();
    expect(ap.html).toContain('Tarde o temprano');
    // El listado del índice no contaminó nada
    const allHtml = chapters.map(c => c.html).join('');
    expect(allHtml).not.toContain('UNA ANTORCHA EN LA OSCURIDAD ..');
    expect(chapters.length).toBe(2);
  });
});

describe('reorden canónico de front/back matter', () => {
  it('mueve intro/dedicatoria/agradecimientos al inicio y epílogo al final, sin importar el orden del documento', () => {
    const html = [
      '<p>CAPÍTULO 1</p>',
      '<p>El Principio</p>',
      `<p>${CUERPO}</p><p>${CUERPO}</p>`,
      '<p>EPÍLOGO</p>',
      `<p>${CUERPO}</p>`,
      '<p>CAPÍTULO 2</p>',
      '<p>El Final</p>',
      `<p>${CUERPO}</p><p>${CUERPO}</p>`,
      '<p>INTRODUCCIÓN</p>',
      `<p>${CUERPO}</p>`,
      '<p>DEDICATORIA</p>',
      '<p>Para mi familia, con amor y gratitud eterna por su apoyo en este proyecto de vida y de fe.</p>',
      '<p>AGRADECIMIENTOS</p>',
      `<p>${CUERPO}</p>`,
    ].join('');
    const { chapters } = parseHtmlContent(html);
    const names = chapters.map(c => (c.chapterName || c.title).toUpperCase());
    const idx = (re) => names.findIndex(n => re.test(n));
    // Front matter en orden canónico, antes del cuerpo
    expect(idx(/DEDICATORIA/)).toBeLessThan(idx(/AGRADECIMIENTOS/));
    expect(idx(/AGRADECIMIENTOS/)).toBeLessThan(idx(/INTRODUCCIÓN/));
    expect(idx(/INTRODUCCIÓN/)).toBeLessThan(idx(/PRINCIPIO/));
    // Cuerpo mantiene orden relativo
    expect(idx(/PRINCIPIO/)).toBeLessThan(idx(/FINAL/));
    // Back matter al final
    expect(idx(/EPÍLOGO/)).toBeGreaterThan(idx(/FINAL/));
    // Nada se perdió
    expect(chapters.length).toBe(6);
  });
});
