import { describe, it, expect } from 'vitest';
import { findNthMatchInDoc } from './editorSearch';

// Minimal ProseMirror-like doc: one paragraph whose text starts at pos 1.
// Splitting into "text nodes" lets us exercise the cross-node mapping.
const makeDoc = (segments) => {
  // segments: [{ text, pos }]
  return {
    descendants(fn) {
      for (const seg of segments) fn({ isText: true, text: seg.text }, seg.pos);
    },
  };
};

describe('findNthMatchInDoc', () => {
  it('encuentra la primera ocurrencia y mapea posiciones PM', () => {
    // "Hola mundo" starting at pos 1 → 'm' of "mundo" at pos 1+5=6, ends at 6+5=11
    const doc = makeDoc([{ text: 'Hola mundo', pos: 1 }]);
    const r = findNthMatchInDoc(doc, 'mundo', 0);
    expect(r).toEqual({ from: 6, to: 11 });
  });

  it('encuentra la Nth ocurrencia', () => {
    const doc = makeDoc([{ text: 'eco eco eco', pos: 1 }]);
    expect(findNthMatchInDoc(doc, 'eco', 0)).toEqual({ from: 1, to: 4 });
    expect(findNthMatchInDoc(doc, 'eco', 1)).toEqual({ from: 5, to: 8 });
    expect(findNthMatchInDoc(doc, 'eco', 2)).toEqual({ from: 9, to: 12 });
  });

  it('es insensible a acentos', () => {
    const doc = makeDoc([{ text: 'la canción', pos: 1 }]);
    const r = findNthMatchInDoc(doc, 'cancion', 0);
    // 'c' of canción at pos 1+3 = 4, length 7 → to = 4+7 = 11
    expect(r).toEqual({ from: 4, to: 11 });
  });

  it('mapea a través de límites de nodo (marca en medio de palabra)', () => {
    // "mun" (pos 1..) + "do" as a separate node (e.g. bold) at pos 4..
    const doc = makeDoc([{ text: 'mun', pos: 1 }, { text: 'do', pos: 4 }]);
    const r = findNthMatchInDoc(doc, 'mundo', 0);
    expect(r).toEqual({ from: 1, to: 6 });
  });

  it('devuelve null si no hay coincidencia', () => {
    const doc = makeDoc([{ text: 'nada', pos: 1 }]);
    expect(findNthMatchInDoc(doc, 'xyz', 0)).toBeNull();
  });
});
