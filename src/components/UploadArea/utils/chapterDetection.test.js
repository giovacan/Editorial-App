/**
 * chapterDetection.test.js — patrones de títulos de capítulo.
 */
import { isChapterHeading } from './chapterDetection';

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

  it('no confunde párrafos narrativos', () => {
    expect(isChapterHeading(p('Día 1 fue el más difícil de todos porque no sabíamos qué esperar del viaje ni de las personas que encontraríamos en el camino hacia la ciudad.'))).toBe(false);
    expect(isChapterHeading(p('La lección más importante de mi vida llegó tarde.'))).toBe(false);
    expect(isChapterHeading(p('Dios creó todo con propósito'))).toBe(false);
  });
});
