/**
 * Ley de línea de corte — regresión del caso real "Es la" (folio 35, libro
 * EL TRASLADO DE LA IGLESIA): un split-head con run <strong> cuya última
 * línea el modelo plano bendecía como llena, pero el walker del renderer
 * (fuentes por run, indent) la dibujaba como "Es la" — 2 palabras estiradas
 * de extremo a extremo. La ley debe medir con el MISMO walker que dibuja.
 */
import { describe, it, expect } from 'vitest';
import { enforceCutLineAlignment } from './paginateChapters';
import { createLayoutContext, getCtx as getEngineCtx2d } from '../textLayoutEngine';
import { renderPageAsEngineLines } from '../lineRenderer';
import { htmlToText, JUSTIFY_SLACK_RATIO } from '../layoutIr';

// Bloques REALES del libro (folios 35→36), A5: 153.925px de columna.
const HEAD = '<p style="margin:0 0;padding:0;text-align:justify;text-justify:inter-word;hyphens:none;overflow-wrap:break-word;text-indent:1.5em;text-align-last:justify;" data-split-head="true"><strong>2. La Resurrección de Condenación o la Segunda Muerte.</strong> La Escritura predice otra parte del programa de resurrección que trata con los perdidos. Es la</p>';
const CONT = '<p style="margin:0 0;padding:0;text-align:justify;text-justify:inter-word;hyphens:none;overflow-wrap:break-word;text-indent:0;text-align-last:left;padding-bottom:2.7px;" data-continuation="true">segunda resurrección, la resurrección de condenación o la segunda muerte; ocurrirá al final del reinado de mil años de Cristo:</p>';

const CTX0 = {
  baseFontSizePx: 6.29283867807482,
  baseLineHeight: 1.5,
  contentWidth: 153.92519388021438,
  lineHeightPx: 10,
  fontFamily: 'Georgia, serif',
};

const makeCanvasCtx = () => ({
  ...createLayoutContext(CTX0.baseFontSizePx, CTX0.baseLineHeight, CTX0.contentWidth, CTX0.fontFamily),
  widthSlack: CTX0.contentWidth * JUSTIFY_SLACK_RATIO,
  lineHeightPx: CTX0.lineHeightPx,
  ctx2d: getEngineCtx2d(),
  noHyphenation: true,
  engineLinesRender: true,
});

const lastEngineLine = (html, ctx) => {
  const out = renderPageAsEngineLines(html, ctx);
  const lines = out.match(/<span class="el-line"[^>]*>[\s\S]*?<\/span>/g) || [];
  const last = lines[lines.length - 1];
  if (!last) return null;
  const text = last.replace(/<[^>]+>/g, '').trim();
  return {
    text,
    words: text.split(/\s+/).filter(Boolean).length,
    align: (last.match(/text-align-last:([a-z]+)/) || [])[1] || '?',
  };
};

describe('ley de línea de corte medida con el walker del renderer', () => {
  it('caso real folio 35: la última línea dibujada nunca queda corta Y estirada', () => {
    const canvasCtx = makeCanvasCtx();
    const pages = [
      { html: HEAD, chapterTitle: 'CAP 3', isBlank: false },
      { html: CONT, chapterTitle: 'CAP 3', isBlank: false },
    ];
    const textOf = () => pages.map(p => htmlToText(p.html).replace(/\s+/g, ' ').trim()).join(' ');
    const before = textOf();
    enforceCutLineAlignment(pages, canvasCtx);
    const after = textOf();

    // el texto completo se conserva (ni pérdida ni duplicado)
    expect(after).toBe(before);

    // la última línea DIBUJADA del head no puede ser corta y estirada
    const last = lastEngineLine(pages[0].html, canvasCtx);
    expect(last).not.toBeNull();
    const stretchedShort = last.align === 'justify' && last.words < 4;
    expect(stretchedShort, `última línea dibujada: [${last.align}] "${last.text}"`).toBe(false);

    // la continuación sigue existiendo y sigue marcada
    expect(pages[1].html).toContain('data-continuation');
    expect(htmlToText(pages[1].html).trim().length).toBeGreaterThan(0);
  });

  it('un split-head con línea final llena se queda como está', () => {
    const canvasCtx = makeCanvasCtx();
    // línea final naturalmente llena: párrafo largo sin runs
    const head = '<p style="margin:0 0;padding:0;text-align:justify;text-indent:1.5em;text-align-last:justify;" data-split-head="true">' +
      'Estamos viviendo en un periodo conocido como la Gracia, en donde todas aquellas personas que deciden recibir a Cristo como su Señor y Salvador son integradas para formar parte de la Iglesia' +
      '</p>';
    const cont = '<p style="margin:0 0;padding:0;text-align:justify;text-indent:0;text-align-last:left;" data-continuation="true">o el Cuerpo de Cristo, no importando su nacionalidad.</p>';
    const pages = [
      { html: head, chapterTitle: 'CAP 1', isBlank: false },
      { html: cont, chapterTitle: 'CAP 1', isBlank: false },
    ];
    enforceCutLineAlignment(pages, canvasCtx);
    const last = lastEngineLine(pages[0].html, canvasCtx);
    // no se degrada a left ni queda corta+estirada
    const stretchedShort = last.align === 'justify' && last.words < 4;
    expect(stretchedShort).toBe(false);
  });
});
