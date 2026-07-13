/**
 * chapterDetection.test.js — patrones de títulos de capítulo.
 */
import { isChapterHeading, filterIndexListings } from './chapterDetection';

const p = (text) => {
  const el = document.createElement('p');
  el.textContent = text;
  return el;
};

describe('isChapterHeading', () => {
  it('reconoce las familias clásicas', () => {
    expect(isChapterHeading(p('CAPÍTULO 3 La Verdad'))).toBe(true);
    expect(isChapterHeading(p('Capítulo #2 - Preparación'))).toBe(true);
    expect(isChapterHeading(p('PARTE 2'))).toBe(true);
    expect(isChapterHeading(p('INTRODUCCIÓN'))).toBe(true);
  });

  it('reconoce lecciones, módulos, unidades, temas y días numerados', () => {
    expect(isChapterHeading(p('LECCIÓN 1 La Intención Original De Dios'))).toBe(true);
    expect(isChapterHeading(p('Leccion 4 Viviendo Para Un Propósito'))).toBe(true);
    expect(isChapterHeading(p('MÓDULO 2'))).toBe(true);
    expect(isChapterHeading(p('Unidad 3: El llamado'))).toBe(true);
    expect(isChapterHeading(p('TEMA 5'))).toBe(true);
    expect(isChapterHeading(p('DÍA 7'))).toBe(true);
    expect(isChapterHeading(p('Session 2'))).toBe(true);
  });

  it('listados de índice (títulos consecutivos) no son capítulos', () => {
    // INTRODUCCIÓN (0), párrafo (1..2), listado consecutivo (3,4,5), LECCIÓN real (9)
    const approved = filterIndexListings([0, 3, 4, 5, 9]);
    expect(approved.has(0)).toBe(true);   // intro real
    expect(approved.has(3)).toBe(false);  // listado
    expect(approved.has(4)).toBe(false);
    expect(approved.has(5)).toBe(false);
    expect(approved.has(9)).toBe(true);   // lección real con cuerpo
  });

  it('la cola de un listado pegado al título real se rescata si sigue cuerpo', () => {
    // CONTENIDO glue: TOC en 3..8 y el título real en 9 (adyacente al listado),
    // seguido de texto narrativo → la cola se aprueba, el resto no.
    const bodyAfter = (idx) => idx === 9;
    const approved = filterIndexListings([3, 4, 5, 6, 7, 8, 9], bodyAfter);
    expect(approved.has(9)).toBe(true);
    for (const i of [3, 4, 5, 6, 7, 8]) expect(approved.has(i)).toBe(false);
    // sin rescate (cola seguida de más listado u otra cosa) → todo fuera
    const none = filterIndexListings([3, 4, 5, 6], () => false);
    expect(none.size).toBe(0);
  });

  it('no confunde párrafos narrativos', () => {
    expect(isChapterHeading(p('Día 1 fue el más difícil de todos porque no sabíamos qué esperar del viaje ni de las personas que encontraríamos en el camino hacia la ciudad.'))).toBe(false);
    expect(isChapterHeading(p('La lección más importante de mi vida llegó tarde.'))).toBe(false);
    expect(isChapterHeading(p('Dios creó todo con propósito'))).toBe(false);
  });
});
