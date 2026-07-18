/**
 * tableLayoutEngine.test.js
 *
 * Unit tests for the deterministic table grid engine plus an end-to-end run
 * through paginateChapters() proving native tables paginate with row splits,
 * repeated headers, no overflow and full text conservation.
 */

import {
  parseTableGrid,
  layoutTableGrid,
  buildNativeTableElement,
  measureTableHeight,
  splitTableByRows,
  isTableMarkupSane,
  _clearTableLayoutCache,
} from './tableLayoutEngine';
import { measureHtmlHeight, createLayoutContext } from './textLayoutEngine';
import { JUSTIFY_SLACK_RATIO } from './layoutIr.js';
import { paginateChapters } from './pagination/paginateChapters';

const CONTENT_WIDTH = 400;
const CONTENT_HEIGHT = 600;
const LINE_HEIGHT_PX = 18;

const makeCtx = () => ({
  ...createLayoutContext(12, 1.5, CONTENT_WIDTH, 'Georgia, serif'),
  widthSlack: CONTENT_WIDTH * JUSTIFY_SLACK_RATIO,
  lineHeightPx: LINE_HEIGHT_PX,
  textAlign: 'justify',
  noHyphenation: true,
  engineLinesRender: true,
});

// ─── Fixture tables ──────────────────────────────────────────────────────────

const simpleTable = `<table><thead><tr><th>Concepto</th><th>Iglesia</th><th>Mundo</th></tr></thead><tbody>
<tr><td>Esperanza</td><td>La venida del Señor</td><td>El progreso humano</td></tr>
<tr><td>Fundamento</td><td>La palabra de Dios revelada</td><td>La razón</td></tr>
<tr><td>Destino</td><td>La ciudad celestial</td><td>La ciudad terrenal</td></tr>
</tbody></table>`;

const spanTable = `<table>
<tr><th>Grupo</th><th>Detalle</th><th>Valor</th></tr>
<tr><td rowspan="2">Primero</td><td>Uno</td><td>10</td></tr>
<tr><td>Dos</td><td>20</td></tr>
<tr><td colspan="2">Total general</td><td>30</td></tr>
</table>`;

const makeBigTable = (rows) => {
  const body = [];
  for (let i = 1; i <= rows; i++) {
    body.push(`<tr><td>Fila número ${i}</td><td>Contenido descriptivo de la fila ${i} con varias palabras para envolver</td><td>Valor ${i * 7}</td></tr>`);
  }
  return `<table><thead><tr><th>Nombre</th><th>Descripción</th><th>Dato</th></tr></thead><tbody>${body.join('')}</tbody></table>`;
};

const tableWords = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

beforeEach(() => _clearTableLayoutCache());

// ─── Grid parsing ────────────────────────────────────────────────────────────

describe('parseTableGrid', () => {
  it('parses a simple table with thead into a 3-column grid', () => {
    const g = parseTableGrid(simpleTable);
    expect(g).not.toBeNull();
    expect(g.colCount).toBe(3);
    expect(g.rows.length).toBe(4);
    expect(g.headerRowCount).toBe(1);
    expect(g.rows[0].isHeaderRow).toBe(true);
    expect(g.rows[1].cells[1].blocks[0].text).toBe('La venida del Señor');
  });

  it('resolves colspan/rowspan through the occupancy matrix', () => {
    const g = parseTableGrid(spanTable);
    expect(g).not.toBeNull();
    expect(g.colCount).toBe(3);
    // Row 2 has only 2 cells; the first starts at col 1 (col 0 covered by rowspan).
    expect(g.rows[2].cells[0].colStart).toBe(1);
    // Row 3: colspan cell covers cols 0-1, next cell lands on col 2.
    expect(g.rows[3].cells[0].colSpan).toBe(2);
    expect(g.rows[3].cells[1].colStart).toBe(2);
  });

  it('rejects unsupported structures', () => {
    expect(parseTableGrid('<table><tr><td><table><tr><td>x</td></tr></table></td></tr><tr><td>y</td></tr></table>')).toBeNull(); // nested
    expect(parseTableGrid('<table><caption>Cap</caption><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>')).toBeNull(); // caption
    expect(parseTableGrid('<table><tr><td><img src="x.png"></td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>')).toBeNull(); // image
    expect(parseTableGrid('<table><tr><td>solo</td></tr><tr><td>una</td></tr></table>')).toBeNull(); // 1 column
    expect(parseTableGrid('<table><tr><th>a</th><th>b</th></tr><tr><th>c</th><th>d</th></tr></table>')).toBeNull(); // header-only
    expect(parseTableGrid('<p>no table</p>')).toBeNull();
  });

  it('isTableMarkupSane mirrors the parser verdict', () => {
    expect(isTableMarkupSane(simpleTable)).toBe(true);
    expect(isTableMarkupSane('<table><tr><td>x</td></tr></table>')).toBe(false);
  });
});

// ─── Layout / measurement ────────────────────────────────────────────────────

describe('layoutTableGrid / measureTableHeight', () => {
  it('produces a deterministic positive height with widths filling the block', () => {
    const ctx = makeCtx();
    const g = parseTableGrid(simpleTable);
    const layout = layoutTableGrid(g, ctx);
    expect(layout).not.toBeNull();
    expect(layout.totalHeight).toBeGreaterThan(0);
    expect(layout.colWidths.length).toBe(3);
    const tableWidth = Math.floor(ctx.contentWidth - ctx.widthSlack);
    expect(layout.tableWidth).toBe(tableWidth);
    // Widths + paddings + borders exactly reconstruct the table width.
    const sum = layout.colWidths.reduce((a, b) => a + b, 0)
      + 4 * 1 + 3 * layout.padH;
    expect(sum).toBe(tableWidth);
    // Determinism
    expect(measureTableHeight(simpleTable, ctx)).toBe(measureTableHeight(simpleTable, ctx));
  });

  it('more rows → taller table', () => {
    const ctx = makeCtx();
    expect(measureTableHeight(makeBigTable(12), ctx))
      .toBeGreaterThan(measureTableHeight(makeBigTable(4), ctx));
  });

  it('handles rowspan tables (span group height accounted)', () => {
    const ctx = makeCtx();
    const h = measureTableHeight(spanTable, ctx);
    expect(h).toBeGreaterThan(0);
  });
});

// ─── Styled emission round-trip ──────────────────────────────────────────────

describe('buildNativeTableElement', () => {
  it('emits styled HTML whose measured height matches the reported height', () => {
    const ctx = makeCtx();
    const native = buildNativeTableElement(simpleTable, ctx);
    expect(native).not.toBeNull();
    expect(native.html).toContain('data-native-table');
    expect(native.html).toContain('table-layout:fixed');
    expect(native.html).toContain('<colgroup>');
    // The engine-wide measurer must agree exactly (TABLE branch → native path).
    expect(measureHtmlHeight(native.html, ctx)).toBe(native.height);
  });

  it('re-parsing the emitted HTML honors the emitted col widths', () => {
    const ctx = makeCtx();
    const native = buildNativeTableElement(simpleTable, ctx);
    const g2 = parseTableGrid(native.html);
    expect(g2.fixedColWidths).not.toBeNull();
    const l1 = layoutTableGrid(parseTableGrid(simpleTable), ctx);
    expect(g2.fixedColWidths).toEqual(l1.colWidths);
  });

  it('conserves every word of the source table', () => {
    const ctx = makeCtx();
    const native = buildNativeTableElement(simpleTable, ctx);
    const src = tableWords(simpleTable);
    const out = tableWords(native.html.replace(/<colgroup>.*?<\/colgroup>/s, ''));
    expect(out.sort()).toEqual(src.sort());
  });
});

// ─── Row splitting ───────────────────────────────────────────────────────────

describe('splitTableByRows', () => {
  it('splits so the head fits and the tail repeats the header', () => {
    const ctx = makeCtx();
    const native = buildNativeTableElement(makeBigTable(20), ctx);
    const maxH = 300;
    const split = splitTableByRows(native.html, maxH, ctx);
    expect(split).not.toBeNull();
    const [head, tail] = split;
    expect(measureHtmlHeight(head, ctx)).toBeLessThanOrEqual(maxH);
    // Both halves keep the header labels.
    expect(head).toContain('Descripción');
    expect(tail).toContain('Descripción');
    expect(tail).toContain('data-table-cont');
    // Conservation: data words partition exactly (header duplicated once).
    const dataOf = (html) => tableWords(html).filter(w => !['Nombre', 'Descripción', 'Dato'].includes(w));
    expect([...dataOf(head), ...dataOf(tail)].sort())
      .toEqual(dataOf(native.html.replace(/<colgroup>.*?<\/colgroup>/s, '')).sort());
  });

  it('returns null when there is no room for a legal split', () => {
    const ctx = makeCtx();
    const native = buildNativeTableElement(makeBigTable(20), ctx);
    expect(splitTableByRows(native.html, 20, ctx)).toBeNull();
  });

  it('returns null for tables with too few data rows', () => {
    const ctx = makeCtx();
    const native = buildNativeTableElement(makeBigTable(3), ctx);
    expect(splitTableByRows(native.html, 100, ctx, { minOrphanRows: 2, minWidowRows: 2 })).toBeNull();
  });

  it('never cuts inside a rowspan group', () => {
    const ctx = makeCtx();
    // rowspan group = rows 1-2; force a tiny budget that could only fit row 1.
    const rows = [];
    for (let i = 0; i < 8; i++) {
      rows.push(i === 1
        ? `<tr><td rowspan="2">Grupo atado ${i}</td><td>celda ${i} con texto</td></tr>`
        : i === 2
          ? `<tr><td>celda ${i} con texto</td></tr>`
          : `<tr><td>fila ${i}</td><td>celda ${i} con texto</td></tr>`);
    }
    const html = `<table><tr><th>A</th><th>B</th></tr>${rows.join('')}</table>`;
    const ctx2 = makeCtx();
    const native = buildNativeTableElement(html, ctx2);
    if (!native) return; // grid rejected → nothing to verify
    for (let maxH = 80; maxH <= 400; maxH += 40) {
      const split = splitTableByRows(native.html, maxH, ctx);
      if (!split) continue;
      const [head, tail] = split;
      // The bound pair must never be separated.
      const headHasFirst = head.includes('Grupo atado');
      const headHasSecond = head.includes('celda 2 con texto');
      expect(headHasFirst).toBe(headHasSecond);
      const tailHasFirst = tail.includes('Grupo atado');
      const tailHasSecond = tail.includes('celda 2 con texto');
      expect(tailHasFirst).toBe(tailHasSecond);
    }
  });
});

// ─── End-to-end through the pagination engine ────────────────────────────────

describe('native tables through paginateChapters', () => {
  const makeLayoutCtx = () => ({
    contentHeight: CONTENT_HEIGHT,
    contentWidth: CONTENT_WIDTH,
    lineHeightPx: LINE_HEIGHT_PX,
    baseFontSize: 12,
    baseLineHeight: 1.5,
    textAlign: 'justify',
    minOrphanLines: 2,
    minWidowLines: 2,
    splitLongParagraphs: true,
    headerSpaceEstimate: 0,
    fontFamily: 'Georgia, serif',
  });

  const makeSafeConfig = () => ({
    paragraph: { align: 'justify', firstLineIndent: 1.5 },
    quote: { enabled: true, indentLeft: 2, indentRight: 2, showLine: true, italic: true, sizeMultiplier: 0.95, marginTop: 1, marginBottom: 1 },
    header: { trackSubheaders: true, subheaderLevels: ['h1', 'h2'] },
    pagination: { minOrphanLines: 2, minWidowLines: 2, splitLongParagraphs: true },
    chapterTitle: { enabled: true, layout: 'spaced' },
  });

  const para = (i) =>
    `<p>Párrafo ${i} con texto corrido suficiente para ocupar espacio en la página y dar contexto narrativo alrededor de la tabla comparativa que sigue en el capítulo.</p>`;

  let pages;
  let ctx;

  beforeAll(() => {
    ctx = makeCtx();
    const html = [para(1), para(2), makeBigTable(24), para(3), para(4)].join('');
    const book = [{ id: 'ch1', type: 'chapter', title: 'Capítulo 1', html, wordCount: 800 }];
    ({ pages } = paginateChapters(book, makeLayoutCtx(), null, makeSafeConfig()));
  }, 120000);

  const contentPages = () => pages.filter(p => !p.isBlank && !p.isTitleOnlyPage && p.html);

  it('renders the table natively (grid markup survives)', () => {
    const all = contentPages().map(p => p.html).join('');
    expect(all).toContain('data-native-table');
    expect(all).toContain('<colgroup>');
  });

  it('splits the table across pages with the header repeated', () => {
    const withTable = contentPages().filter(p => p.html.includes('data-native-table'));
    expect(withTable.length).toBeGreaterThan(1);
    for (const p of withTable) {
      expect(p.html).toContain('Descripción'); // header present on every part
    }
  });

  it('never overflows the page budget', () => {
    for (const p of contentPages()) {
      const h = measureHtmlHeight(p.html, ctx);
      expect(h).toBeLessThanOrEqual(CONTENT_HEIGHT + 0.01);
    }
  });

  it('conserves every table cell and every paragraph word', () => {
    const all = contentPages().map(p => p.html).join(' ');
    for (let i = 1; i <= 24; i++) {
      expect(all).toContain(`Fila número ${i}`);
      expect(all).toContain(`Valor ${i * 7}`);
    }
    for (let i = 1; i <= 4; i++) expect(all).toContain(`Párrafo ${i}`);
  });
});
