// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { FootnoteMark } from './FootnoteMark.js';
import { footnoteRefsIn } from '../../../utils/footnotes.js';

const makeEditor = (content) =>
  new Editor({ extensions: [Document, Paragraph, Text, FootnoteMark], content });

describe('FootnoteMark extension', () => {
  it('conserva la marca <sup data-fn> en getHTML() (round-trip)', () => {
    const ed = makeEditor('<p>Texto<sup data-fn="fn1">1</sup> más texto.</p>');
    const html = ed.getHTML();
    expect(html).toContain('data-fn="fn1"');
    // El refId sigue siendo detectable por el pipeline del motor.
    expect(footnoteRefsIn(html)).toEqual(['fn1']);
    ed.destroy();
  });

  it('editar OTRO texto no borra la marca', () => {
    const ed = makeEditor('<p>Antes<sup data-fn="fn1">1</sup> después.</p>');
    // Simular una edición: insertar texto al inicio.
    ed.commands.insertContentAt(1, 'X');
    const html = ed.getHTML();
    expect(html).toContain('data-fn="fn1"');
    ed.destroy();
  });

  it('insertFootnote añade una marca nueva', () => {
    const ed = makeEditor('<p>Hola mundo.</p>');
    ed.commands.setTextSelection(3);
    ed.commands.insertFootnote('fnNueva');
    const refs = footnoteRefsIn(ed.getHTML());
    expect(refs).toContain('fnNueva');
    ed.destroy();
  });

  it('varias marcas se preservan en orden', () => {
    const ed = makeEditor('<p>A<sup data-fn="fa">1</sup> B<sup data-fn="fb">2</sup> C.</p>');
    expect(footnoteRefsIn(ed.getHTML())).toEqual(['fa', 'fb']);
    ed.destroy();
  });
});
