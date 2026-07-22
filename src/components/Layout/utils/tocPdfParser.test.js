/**
 * tocPdfParser.test.js — parser del TOC contra el markup EXACTO que emite
 * generateFrontMatter (Phase 4, template clásico + variantes).
 */
import { describe, it, expect } from 'vitest';
import { parseTocPage, parseTocEntry } from './tocPdfParser';

const DOTS = '<span style="color:#bbb;letter-spacing:0.08em;font-weight:normal;">. . . . . . . . . . . . . . . . . . . . . . . .</span>';

const entryClassic = (title, page, { mt = 4, mb = 2, fs = '0.88em', fw = 700, indent = 0, lh = 10, h = 10, numW = 18 } = {}) =>
  `<div style="display:flex;align-items:flex-end;margin-top:${mt}px;margin-bottom:${mb}px;font-size:${fs};font-weight:${fw};text-transform:none;letter-spacing:normal;padding-left:${indent}px;line-height:${lh}px;">` +
  `<span style="flex:1 1 0;min-width:0;height:${h}px;overflow:hidden;overflow-wrap:break-word;word-break:normal;">${title} ${DOTS}</span>` +
  `<span style="flex:0 0 ${numW}px;text-align:right;white-space:nowrap;font-weight:normal;color:#555;font-size:0.9em;padding-left:1px;line-height:${lh}px;transform:translateY(-1px);">${page}</span></div>`;

const TITLE = `<div style="text-align:center; font-size:1.1em; font-weight:bold; margin-bottom:16px; line-height:10px; letter-spacing:normal;">Índice</div>`;

const PAGE = `<div style="padding: 0 12px; text-align:left; position:relative;">${TITLE}` +
  entryClassic('CAPÍTULO 1 — UNA ANTORCHA EN LA OSCURIDAD', 3, { h: 20 }) + // 2 líneas
  entryClassic('CAPÍTULO 2', 15) +
  entryClassic('Subtema indentado', 21, { fs: '0.82em', fw: 400, indent: 12 }) +
  `</div>`;

describe('parseTocEntry', () => {
  it('extrae métricas y texto del entry clásico', () => {
    const e = parseTocEntry(entryClassic('MI CAPÍTULO', 7, { mt: 6, mb: 3, indent: 12, h: 10, numW: 22 }));
    expect(e).toBeTruthy();
    expect(e.titleText).toBe('MI CAPÍTULO');
    expect(e.numText).toBe('7');
    expect(e.marginTopPx).toBe(6);
    expect(e.marginBottomPx).toBe(3);
    expect(e.indentPx).toBe(12);
    expect(e.titleHeightPx).toBe(10);
    expect(e.numColPx).toBe(22);
    expect(e.fontEm).toBeCloseTo(0.88);
    expect(e.bold).toBe(true);
    expect(e.lineHPx).toBe(10);
    expect(e.sepType).toBe('dots');
    expect(e.numFontEm).toBeCloseTo(0.9);
    expect(e.alignTop).toBe(false);
  });

  it('devuelve null para divs que no son entries', () => {
    expect(parseTocEntry(TITLE)).toBeNull();
    expect(parseTocEntry('<div style="margin:0">texto</div>')).toBeNull();
  });

  it('sin separador → sepType none', () => {
    const noSep = `<div style="display:flex;align-items:flex-end;font-size:0.88em;line-height:10px;">` +
      `<span style="flex:1 1 0;height:10px;">Título</span>` +
      `<span style="flex:0 0 18px;text-align:right;font-size:0.9em;">4</span></div>`;
    expect(parseTocEntry(noSep).sepType).toBe('none');
  });
});

describe('parseTocPage', () => {
  it('parsea página completa: padding, título y 3 entries en orden', () => {
    const t = parseTocPage(PAGE);
    expect(t).toBeTruthy();
    expect(t.xPadPx).toBe(12);
    expect(t.title.text).toBe('Índice');
    expect(t.title.fontEm).toBeCloseTo(1.1);
    expect(t.title.marginBottomPx).toBe(16);
    expect(t.entries).toHaveLength(3);
    expect(t.entries[0].titleText).toContain('ANTORCHA');
    expect(t.entries[0].titleHeightPx).toBe(20); // multilinea
    expect(t.entries[2].indentPx).toBe(12);
    expect(t.entries[2].bold).toBe(false);
  });

  it('página sin título (continuación) parsea solo entries', () => {
    const cont = `<div style="padding: 0 12px; text-align:left; position:relative;">` +
      entryClassic('CAPÍTULO 9', 88) + entryClassic('CAPÍTULO 10', 99) + `</div>`;
    const t = parseTocPage(cont);
    expect(t.title).toBeNull();
    expect(t.entries).toHaveLength(2);
    expect(t.entries[1].numText).toBe('99');
  });

  it('html que no es TOC → null', () => {
    expect(parseTocPage('<p>hola</p>')).toBeNull();
    expect(parseTocPage('<div style="padding:0 12px;"><div>solo texto</div></div>')).toBeNull();
  });
});
