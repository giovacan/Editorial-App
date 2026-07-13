/**
 * spanishHyphen.test.js — reglas de silabeo español.
 */
import { spanishBreakPoints } from './spanishHyphen';

const syl = (word) => {
  const pts = spanishBreakPoints(word);
  let out = '', prev = 0;
  for (const p of pts) { out += word.slice(prev, p) + '-'; prev = p; }
  return out + word.slice(prev);
};

describe('spanishBreakPoints', () => {
  it('divide V-CV', () => {
    expect(syl('camino')).toBe('ca-mi-no');
    expect(syl('poderoso')).toBe('po-de-ro-so');
  });

  it('respeta grupos inseparables (V-CCV)', () => {
    expect(syl('palabra')).toBe('pa-la-bra');
    expect(syl('supremo')).toBe('su-pre-mo');
    expect(syl('siglos')).toBe('si-glos');
  });

  it('separa VC-CV cuando no hay grupo', () => {
    expect(syl('cantar')).toBe('can-tar');
    expect(syl('esperanza')).toBe('es-pe-ran-za');
  });

  it('digrafos ll/rr/ch no se separan', () => {
    expect(syl('caballo')).toBe('ca-ba-llo');
    expect(syl('correr')).toBe('co-rrer');
    expect(syl('muchacho')).toBe('mu-cha-cho');
  });

  it('tres consonantes: VC-CCV / VCC-CV', () => {
    expect(syl('transformación')).toBe('trans-for-ma-ción');
    expect(syl('instante')).toBe('ins-tan-te');
  });

  it('no separa diptongos; separa hiatos', () => {
    expect(syl('tiempo')).toBe('tiem-po');
    expect(spanishBreakPoints('poeta')).toContain(2); // po-eta (hiato o-e)
    // í acentuada = hiato (lo-gí), pero gí-a se filtra por sufijo mínimo
    expect(syl('teología')).toBe('te-o-lo-gía');
  });

  it('respeta mínimos (prefijo ≥2, sufijo ≥2)', () => {
    for (const w of ['camino', 'esperanza', 'transformación']) {
      for (const p of spanishBreakPoints(w)) {
        expect(p).toBeGreaterThanOrEqual(2);
        expect(w.length - p).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('rechaza palabras cortas o con no-letras', () => {
    expect(spanishBreakPoints('sol')).toEqual([]);
    expect(spanishBreakPoints('2026')).toEqual([]);
    expect(spanishBreakPoints('auto-bus')).toEqual([]);
    expect(spanishBreakPoints('')).toEqual([]);
  });
});
