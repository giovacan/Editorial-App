import { describe, it, expect } from 'vitest';
import { composeTitle, parseLabelAndName } from './chapterTitle';

describe('composeTitle', () => {
  it('une etiqueta y nombre con dos espacios', () => {
    expect(composeTitle('CAPÍTULO 2', 'Dios El Padre')).toBe('CAPÍTULO 2  Dios El Padre');
  });
  it('sin nombre → solo etiqueta', () => {
    expect(composeTitle('CAPÍTULO 2', '')).toBe('CAPÍTULO 2');
  });
  it('sin etiqueta → solo nombre', () => {
    expect(composeTitle('', 'La Biblia')).toBe('La Biblia');
  });
  it('no duplica cuando nombre == etiqueta', () => {
    expect(composeTitle('CAPÍTULO 1', 'CAPÍTULO 1')).toBe('CAPÍTULO 1');
  });
});

describe('parseLabelAndName', () => {
  it('separa "CAPÍTULO 2  Dios El Padre"', () => {
    expect(parseLabelAndName('CAPÍTULO 2  Dios El Padre')).toEqual({ label: 'CAPÍTULO 2', name: 'Dios El Padre' });
  });
  it('separa "LECCIÓN 5 - Título"', () => {
    expect(parseLabelAndName('LECCIÓN 5 - Título')).toEqual({ label: 'LECCIÓN 5', name: 'Título' });
  });
  it('sin etiqueta reconocible → todo es nombre', () => {
    expect(parseLabelAndName('La Biblia')).toEqual({ label: '', name: 'La Biblia' });
  });
});
