/**
 * lineRenderer.test.js — deterministic line-by-line rendering invariants.
 */

import { renderPageAsEngineLines, layoutPageToLines } from './lineRenderer';
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

// ─── layoutPageToLines: same truth as the DOM renderer, but as data ──────────

// Reconstruct the original text from a list of line texts, honoring hyphen
// pulls (line ends in '-' → join without space) and em-dash breaks.
const joinLineTexts = (lineTexts) => {
  let joined = '';
  for (const lt of lineTexts) {
    if (!joined) { joined = lt; continue; }
    if (/-$/.test(joined)) joined = joined.slice(0, -1) + lt;
    else if (/[—–]$/.test(joined)) joined += lt;
    else joined += ' ' + lt;
  }
  return joined;
};

describe('layoutPageToLines', () => {
  const page = `<p style="${PSTYLE}">${LONG_TEXT}</p>`;

  it('produce el MISMO número de líneas que el renderer HTML', () => {
    const spans = (renderPageAsEngineLines(page, CTX).match(/<span class="el-line"/g) || []).length;
    const desc = layoutPageToLines(page, CTX);
    expect(desc).toHaveLength(1);
    expect(desc[0].type).toBe('lines');
    expect(desc[0].lines).toHaveLength(spans);
  });

  it('el texto de cada línea coincide con el span homólogo del renderer', () => {
    const spanTexts = (renderPageAsEngineLines(page, CTX).match(/<span class="el-line"[^>]*>[\s\S]*?<\/span>/g) || [])
      .map(s => collapseWhitespace(htmlToText(s)).trim());
    const desc = layoutPageToLines(page, CTX);
    const lineTexts = desc[0].lines.map(l => (l.text + (l.hyphen ? '-' : '')).trim());
    expect(lineTexts).toEqual(spanTexts);
  });

  it('reconstruye el texto original sin perder ni duplicar palabras', () => {
    const desc = layoutPageToLines(page, CTX);
    const lineTexts = desc[0].lines.map(l => (l.text + (l.hyphen ? '-' : '')).trim());
    expect(joinLineTexts(lineTexts)).toBe(collapseWhitespace(htmlToText(page)).trim());
  });

  it('primera línea con sangría, interiores justify, última con la del bloque', () => {
    const desc = layoutPageToLines(page, CTX);
    const lines = desc[0].lines;
    expect(lines[0].indent).toBeCloseTo(1.5 * CTX.baseFontSizePx, 1);
    expect(lines[1].indent).toBe(0);
    for (let i = 0; i < lines.length - 1; i++) expect(lines[i].align).toBe('justify');
    expect(lines[lines.length - 1].align).toBe('left');
  });

  it('párrafos con runs devuelven segmentos por estilo que reconstruyen el texto', () => {
    const withRuns = `<p style="${PSTYLE}">${LONG_TEXT.slice(0, 120)} <strong>una frase en negritas dentro del texto</strong> ${LONG_TEXT.slice(120)}</p>`;
    const desc = layoutPageToLines(withRuns, CTX);
    expect(desc[0].type).toBe('lines');
    expect(desc[0].styled).toBe(true);
    // cada línea = concatenación de sus runs
    for (const line of desc[0].lines) {
      expect(line.runs.map(r => r.text).join('')).toBe(line.text);
    }
    // algún run debe ir en negrita (style bit 1)
    const anyBold = desc[0].lines.some(l => l.runs.some(r => (r.style & 1) === 1));
    expect(anyBold).toBe(true);
    // texto completo preservado
    const lineTexts = desc[0].lines.map(l => (l.text + (l.hyphen ? '-' : '')).trim());
    expect(joinLineTexts(lineTexts)).toBe(collapseWhitespace(htmlToText(withRuns)).trim());
  });

  it('bloques fuera de alcance vuelven como passthrough', () => {
    const mixed = `<h2 style="text-align:center;">Título</h2><p style="${PSTYLE}">${LONG_TEXT}</p><ul><li>a</li></ul>`;
    const desc = layoutPageToLines(mixed, CTX);
    expect(desc).toHaveLength(3);
    expect(desc[0]).toMatchObject({ type: 'passthrough', tag: 'H2' });
    expect(desc[1].type).toBe('lines');
    expect(desc[2]).toMatchObject({ type: 'passthrough', tag: 'UL' });
  });

  it('es determinista', () => {
    expect(layoutPageToLines(page, CTX)).toEqual(layoutPageToLines(page, CTX));
  });
});
