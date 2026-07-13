/**
 * lineRenderer.test.js — deterministic line-by-line rendering invariants.
 */

import { renderPageAsEngineLines } from './lineRenderer';
import { countLines } from './lineBreaking';
import { buildFontString } from './textMeasurement';
import { htmlToText } from './layoutIr';
import { collapseWhitespace } from './textPreprocess';

const CTX = { contentWidth: 400, baseFontSizePx: 12, fontFamily: 'Georgia, serif' };

const PSTYLE = 'margin:0 0;padding:0;text-align:justify;text-indent:1.5em;text-justify:inter-word;hyphens:none;text-align-last:left;overflow-wrap:break-word;';

const LONG_TEXT = 'La batalla principal no está en las calles ni en las pantallas, sino en el lugar más invisible y poderoso de tu ser. Cada pensamiento que entra sin supervisión se convierte en una semilla que germina —a veces en virtud, a veces en ruina— y por eso los sabios de todos los tiempos insistieron en custodiar la mente con la misma seriedad con la que se custodia una ciudad amurallada. No es una tarea de un día, es una disciplina de por vida.';

describe('renderPageAsEngineLines', () => {
  const page = `<p style="${PSTYLE}">${LONG_TEXT}</p>`;

  it('genera un span por línea, coincidiendo con el conteo del motor', () => {
    const out = renderPageAsEngineLines(page, CTX);
    expect(out).not.toBe(page);
    expect(out).toContain('data-engine-lines="true"');
    const spans = (out.match(/<span class="el-line"/g) || []).length;
    const fontStr = buildFontString(CTX.baseFontSizePx, CTX.fontFamily);
    const expected = countLines(collapseWhitespace(LONG_TEXT), CTX.contentWidth, fontStr, 1.5 * CTX.baseFontSizePx, 0, 0, true);
    expect(spans).toBe(expected);
    expect(spans).toBeGreaterThan(3);
  });

  it('preserva el texto exactamente (sin perder ni duplicar palabras)', () => {
    const out = renderPageAsEngineLines(page, CTX);
    const original = collapseWhitespace(htmlToText(page)).trim();
    // Each span is one rendered line — lines join with a space (or nothing
    // after an em-dash break, where no space existed in the source).
    const lineTexts = (out.match(/<span class="el-line"[^>]*>[\s\S]*?<\/span>/g) || [])
      .map(s => collapseWhitespace(htmlToText(s)).trim());
    let rendered = '';
    for (const lt of lineTexts) {
      if (!rendered) { rendered = lt; continue; }
      if (/-$/.test(rendered)) rendered = rendered.slice(0, -1) + lt; // guionado: unir sin espacio
      else if (/[—–]$/.test(rendered)) rendered += lt;
      else rendered += ' ' + lt;
    }
    expect(rendered).toBe(original);
  });

  it('línea final hereda la alineación del bloque; interiores van justify', () => {
    const out = renderPageAsEngineLines(page, CTX);
    const spans = out.match(/<span class="el-line"[^>]*>/g) || [];
    for (let i = 0; i < spans.length - 1; i++) {
      expect(spans[i]).toContain('text-align-last:justify');
    }
    expect(spans[spans.length - 1]).toContain('text-align-last:left');
  });

  it('la línea de corte (split-head justify) mantiene justify en su última línea', () => {
    const cut = `<p style="${PSTYLE.replace('text-align-last:left', 'text-align-last:justify')}" data-split-head="true">${LONG_TEXT}</p>`;
    const out = renderPageAsEngineLines(cut, CTX);
    const spans = out.match(/<span class="el-line"[^>]*>/g) || [];
    expect(spans[spans.length - 1]).toContain('text-align-last:justify');
  });

  it('la primera línea lleva la sangría; las demás no', () => {
    const out = renderPageAsEngineLines(page, CTX);
    const spans = out.match(/<span class="el-line"[^>]*>/g) || [];
    expect(spans[0]).toContain('text-indent:18.00px');
    expect(spans[1]).not.toContain('text-indent');
  });

  it('bloques fuera de alcance pasan intactos', () => {
    const cases = [
      `<p style="${PSTYLE}">Verso uno<br>Verso dos<br>Verso tres</p>`,
      `<h2 style="text-align:center;">Un subtítulo</h2>`,
      `<ul style="padding-left:1.5em;"><li>item uno</li><li>item dos</li></ul>`,
      `<p style="${PSTYLE}">Con entidad &amp; especial dentro del texto largo que sigue y sigue.</p>`,
    ];
    for (const c of cases) {
      expect(renderPageAsEngineLines(c, CTX)).toBe(c);
    }
  });

  it('párrafos con negritas/cursivas se transforman preservando los tags', () => {
    const withRuns = `<p style="${PSTYLE}">${LONG_TEXT.slice(0, 120)} <strong>una frase en negritas dentro del texto</strong> ${LONG_TEXT.slice(120)}</p>`;
    const out = renderPageAsEngineLines(withRuns, CTX);
    expect(out).not.toBe(withRuns);
    expect(out).toContain('data-engine-lines');
    expect(out).toContain('<strong>');
    // texto preservado
    const spans = (out.match(/<span class="el-line"[^>]*>[\s\S]*?<\/span>/g) || [])
      .map(s => htmlToText(s).replace(/\s+/g, ' ').trim());
    let joined = '';
    for (const lt of spans) {
      if (!joined) { joined = lt; continue; }
      if (/-$/.test(joined)) joined = joined.slice(0, -1) + lt;
      else if (/[—–]$/.test(joined)) joined += lt;
      else joined += ' ' + lt;
    }
    expect(joined).toBe(collapseWhitespace(htmlToText(withRuns)).trim());
  });

  it('citas (blockquote) se transforman con su ancho reducido', () => {
    const quote = `<blockquote class="quote classic" style="margin:1em 2em 1em 2em;padding:0.5em 1em;border-left:3px solid #444;font-size:11pt;text-align:justify;text-align-last:left;">${LONG_TEXT}</blockquote>`;
    const out = renderPageAsEngineLines(quote, CTX);
    expect(out).not.toBe(quote);
    expect(out).toContain('data-engine-lines');
    const plainOut = renderPageAsEngineLines(`<p style="${PSTYLE}">${LONG_TEXT}</p>`, CTX);
    const qSpans = (out.match(/<span class="el-line"/g) || []).length;
    const pSpans = (plainOut.match(/<span class="el-line"/g) || []).length;
    expect(qSpans).toBeGreaterThan(pSpans); // columna más angosta → más líneas
  });

  it('es determinista', () => {
    expect(renderPageAsEngineLines(page, CTX)).toBe(renderPageAsEngineLines(page, CTX));
  });

  it('página completa: transforma los P planos y respeta el resto', () => {
    const mixed = `<h2>Título</h2><p style="${PSTYLE}">${LONG_TEXT}</p><ul><li>a</li></ul>`;
    const out = renderPageAsEngineLines(mixed, CTX);
    expect(out).toContain('<h2>Título</h2>');
    expect(out).toContain('<ul><li>a</li></ul>');
    expect(out).toContain('data-engine-lines');
  });
});
