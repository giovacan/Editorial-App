/**
 * tableLayoutEngine.js
 *
 * Deterministic 2-D table layout: measure, style and row-split HTML tables
 * so the pagination engine can treat them as first-class splittable blocks
 * instead of atomic estimated-height boxes (the folios 88-89 craters) or
 * linearized paragraphs (which lose the grid/borders).
 *
 * Design rules (same guarantees as textLayoutEngine):
 *   - Canvas measureText only — zero DOM layout reads, worker-safe parsing
 *     (string/regex based, no DOMParser).
 *   - The SAME column widths the measurer used are written inline into the
 *     generated HTML (<colgroup> + table-layout:fixed), so the browser cannot
 *     re-distribute them: preview, html2canvas PDF and EPUB all render the
 *     grid the engine measured.
 *   - Conservative counting: cell wrapping is measured with hyphenation off
 *     and per-block, matching the normalized cell markup this module emits.
 *
 * Grid model: colspan/rowspan are resolved through a standard occupancy
 * matrix. Rows covered by a rowspan become one atomic "row group" — splits
 * only happen between groups, never inside one.
 *
 * Fallback contract: every entry point returns null when the table is not
 * sane for native layout (nested tables, caption, >MAX_COLS columns,
 * min-content wider than the page...). Callers keep the legacy treatment
 * (row-count estimate / linearization) in that case, so the worst case is
 * exactly today's behavior.
 */

import { buildFontString, measureTextWidth } from './textMeasurement.js';
import { countLines } from './lineBreaking.js';
import { collapseWhitespace } from './textPreprocess.js';

// ─── Tunables ────────────────────────────────────────────────────────────────

const MAX_COLS = 6;            // beyond this nothing fits an A5/6x9 text block
const MAX_HEADER_ROWS = 2;     // more than this → don't repeat on continuation
const BORDER_PX = 1;
const CELL_PAD_H_EM = 0.35;    // horizontal cell padding (each side)
const CELL_PAD_V_EM = 0.22;    // vertical cell padding (each side)
const TABLE_MARGIN_EM = 0.75;  // vertical margin around the table block
const BORDER_COLOR = '#444';

// Layout cache — measuring a grid costs one countLines per cell block; the DP
// asks for the same table height from many states.
const _tableLayoutCache = new Map();
const MAX_TABLE_CACHE = 400;

// ─── Small helpers ───────────────────────────────────────────────────────────

const stripTags = (html = '') => collapseWhitespace(html.replace(/<[^>]+>/g, ' ')).trim();

const countWords = (html = '') => {
  const t = stripTags(html);
  return t ? t.split(/\s+/).length : 0;
};

const intAttr = (attrs, name) => {
  const m = (attrs || '').match(new RegExp(`${name}\\s*=\\s*["']?(\\d+)`, 'i'));
  return m ? Math.max(1, parseInt(m[1], 10)) : 1;
};

// ─── Grid parsing (string based, worker-safe) ────────────────────────────────

/**
 * Parse table HTML (outer <table>…</table> or bare row markup) into a grid.
 * Returns null when the table is not sane for native layout.
 *
 * Grid shape:
 * {
 *   rows: [{ cells: [{ blocks: [{html,text,bold}], colStart, colSpan, rowSpan,
 *                      isHeader }], isHeaderRow }],
 *   colCount, headerRowCount,
 * }
 */
export const parseTableGrid = (html = '') => {
  if (!html || !/<tr[\s>]/i.test(html)) return null;

  // Nested tables / captions / images: not supported natively.
  const tableOpens = (html.match(/<table[\s>]/gi) || []).length;
  const startsWithTable = /^\s*<table[\s>]/i.test(html);
  if (tableOpens > (startsWithTable ? 1 : 0)) return null;
  if (/<caption[\s>]/i.test(html)) return null;
  if (/<img[\s>]/i.test(html)) return null;

  const theadMatch = html.match(/<thead[\s>][^>]*>([\s\S]*?)<\/thead>/i);
  const theadHtml = theadMatch ? theadMatch[0] : '';

  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const rawRows = [];
  let rm;
  while ((rm = rowRe.exec(html)) !== null) {
    rawRows.push({ inner: rm[1], inThead: theadHtml ? theadHtml.indexOf(rm[0]) !== -1 : false });
  }
  if (rawRows.length < 2) return null;

  // Word "filler" colspans: comparison tables exported from Word often sit on
  // an inflated column grid (e.g. a 2-column ISRAEL|IGLESIA table whose rows
  // carry colspan 5, 3+2, 2+2 inconsistently). The colspans encode column
  // WIDTH in Word's internal grid, not real spanning — every data row still
  // has the same small number of content cells. When no rowspan is present and
  // the max content-cells-per-row is small, ignore the numeric colspans and
  // lay cells out on a clean per-content-cell grid (a full-width row of 1 cell
  // becomes a spanning header). This rescues tables that would otherwise be
  // rejected and linearized (folio 27 report).
  const hasRowspan = /rowspan\s*=\s*["']?[2-9]/i.test(html);
  const cellCounts = rawRows.map(r => (r.inner.match(/<t[dh][\s>]/gi) || []).length);
  const maxContentCells = Math.max(...cellCounts, 0);
  const spanValues = [...html.matchAll(/colspan\s*=\s*["']?(\d+)/gi)].map(m => +m[1]);
  const colspanInflated = spanValues.some(v => v > 1);
  const normalizeSpans = !hasRowspan && colspanInflated
    && maxContentCells >= 2 && maxContentCells <= MAX_COLS;

  // Occupancy matrix for colspan/rowspan → colStart per cell.
  const rows = [];
  const pending = []; // pending[col] = remaining rows the rowspan still covers
  for (const raw of rawRows) {
    const cells = [];
    let col = 0;
    const rowCells = (raw.inner.match(/<t[dh][\s>]/gi) || []).length;
    const cellRe = /<t([dh])\b([^>]*)>([\s\S]*?)<\/t\1>/gi;
    let cm;
    while ((cm = cellRe.exec(raw.inner)) !== null) {
      while (pending[col] > 0) col++;             // skip columns covered from above
      const isHeader = cm[1].toLowerCase() === 'h';
      let colSpan = Math.min(intAttr(cm[2], 'colspan'), MAX_COLS);
      const rowSpan = intAttr(cm[2], 'rowspan');
      const blocks = parseCellBlocks(cm[3]);
      if (normalizeSpans) {
        // A lone cell spans the whole (normalized) table; otherwise 1 col each.
        colSpan = rowCells === 1 ? maxContentCells : 1;
      }
      cells.push({ blocks, colStart: col, colSpan, rowSpan, isHeader });
      for (let c = col; c < col + colSpan; c++) {
        if (rowSpan > 1) pending[c] = rowSpan;    // will be decremented below
      }
      col += colSpan;
    }
    // Advance occupancy one row.
    for (let c = 0; c < pending.length; c++) {
      if (pending[c] > 0) pending[c]--;
    }
    if (cells.length === 0) continue;             // skip empty <tr>
    const isHeaderRow = raw.inThead || cells.every(c => c.isHeader);
    rows.push({ cells, isHeaderRow });
  }
  if (rows.length < 2) return null;

  const colCount = Math.max(...rows.map(r => {
    const last = r.cells[r.cells.length - 1];
    return last.colStart + last.colSpan;
  }));
  if (colCount < 2 || colCount > MAX_COLS) return null;

  // Header rows must be a prefix (leading rows); cap the repeatable count.
  let headerRowCount = 0;
  while (headerRowCount < rows.length && rows[headerRowCount].isHeaderRow) headerRowCount++;
  if (headerRowCount >= rows.length) return null; // header-only table
  if (headerRowCount > MAX_HEADER_ROWS) headerRowCount = 0; // present but not repeatable

  // Header inference: Word rarely exports <thead>/<th>, so a comparison table's
  // label row ("ISRAEL | IGLESIA", "BESTIA | IMPERIO") arrives as a plain <td>
  // row and would never repeat across a page break — the reader loses which
  // column is which (user request). Infer it: the first row is a header when
  // it spans the full column count with SHORT label cells (no sentences) AND
  // the data rows below are clearly longer. Only for tables that split (worth
  // repeating) — a 2-3 row table stays as-is.
  if (headerRowCount === 0 && rows.length >= 4) {
    const first = rows[0];
    const spansAll = first.cells.reduce((a, c) => a + c.colSpan, 0) >= colCount
      && first.cells.length >= 2;
    const cellLen = (row) => row.cells.reduce((a, c) =>
      a + c.blocks.reduce((s, b) => s + b.text.length, 0), 0) / Math.max(1, row.cells.length);
    const firstLen = cellLen(first);
    const isLabelRow = spansAll
      && first.cells.every(c => {
        const t = c.blocks.map(b => b.text).join(' ').trim();
        return t.length > 0 && t.length <= 30 && !/[.!?]$/.test(t); // short, no sentence
      });
    // The following data rows must be meaningfully longer (real content).
    const dataLen = (cellLen(rows[1]) + cellLen(rows[2])) / 2;
    if (isLabelRow && dataLen > firstLen * 1.6) {
      rows[0].isHeaderRow = true;
      rows[0].inferredHeader = true; // marks emitted <th> so re-parse re-detects
      headerRowCount = 1;
    }
  }

  // Engine-emitted tables carry a <colgroup> with the widths that were used
  // for measurement. Honoring them (instead of recomputing from a partial row
  // range) keeps head/tail sub-tables column-aligned with the original AND
  // makes re-measuring an emitted table exactly reproduce its layout.
  let fixedColWidths = null;
  const colMatches = html.match(/<col\b[^>]*width:\s*(\d+)px[^>]*>/gi);
  if (colMatches && colMatches.length === colCount) {
    fixedColWidths = colMatches.map(c => parseInt(c.match(/width:\s*(\d+)px/i)[1], 10));
  }

  return { rows, colCount, headerRowCount, fixedColWidths };
};

/**
 * Normalize a cell's inner HTML into a flat list of text blocks.
 * Inline formatting (strong/em/span) is preserved; block wrappers and their
 * document styles are dropped so the emitted markup matches what we measure.
 */
const parseCellBlocks = (inner = '') => {
  const blocks = [];
  const blockRe = /<(p|h[1-6]|div|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let hadBlock = false;
  let bm;
  while ((bm = blockRe.exec(inner)) !== null) {
    hadBlock = true;
    pushCellBlock(blocks, bm[2], /^h[1-6]$/i.test(bm[1]));
  }
  if (!hadBlock) pushCellBlock(blocks, inner.replace(/<\/?(ul|ol|tbody|thead)[^>]*>/gi, ''), false);
  return blocks;
};

const pushCellBlock = (blocks, html, forceBold) => {
  const text = stripTags(html);
  if (!text) return;
  // Keep only inline formatting tags; drop everything else (spans keep their
  // text but lose custom styles — measurement can't honor arbitrary fonts).
  const clean = collapseWhitespace(
    html
      .replace(/<(?!\/?(strong|b|em|i|u|sup|sub)\b)[^>]+>/gi, ' ')
      .replace(/\s+</g, ' <')
  ).trim();
  const boldRatio = (() => {
    const boldText = (html.match(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi) || [])
      .map(s => stripTags(s)).join(' ');
    return text.length ? boldText.length / text.length : 0;
  })();
  blocks.push({ html: clean, text, bold: forceBold || boldRatio >= 0.8 });
};

// ─── Column widths ───────────────────────────────────────────────────────────

/**
 * Deterministic auto-layout: distribute the available inner width across
 * columns proportionally to max-content, clamped to min-content (longest
 * word). Integer px; leftover pixels go to the widest columns.
 * Returns null when min-content alone cannot fit (grid not sane).
 */
const computeColWidths = (grid, ctx) => {
  const { colCount } = grid;
  const padH = Math.round(CELL_PAD_H_EM * ctx.baseFontSizePx) * 2;
  const tableWidth = Math.floor(ctx.contentWidth - (ctx.widthSlack || 0));
  const innerWidth = tableWidth - (colCount + 1) * BORDER_PX - colCount * padH;
  if (innerWidth < colCount * ctx.baseFontSizePx * 2) return null;

  const minC = new Array(colCount).fill(0);
  const maxC = new Array(colCount).fill(0);

  for (const row of grid.rows) {
    for (const cell of row.cells) {
      let cellMin = 0;
      let cellMax = 0;
      for (const blk of cell.blocks) {
        const font = buildFontString(ctx.baseFontSizePx, ctx.fontFamily, blk.bold || cell.isHeader || row.isHeaderRow, false);
        cellMax = Math.max(cellMax, measureTextWidth(blk.text, font));
        for (const word of blk.text.split(/\s+/)) {
          cellMin = Math.max(cellMin, measureTextWidth(word, font));
        }
      }
      // Spanning cells spread their demand equally over covered columns.
      const perColMin = cellMin / cell.colSpan;
      const perColMax = cellMax / cell.colSpan;
      for (let c = cell.colStart; c < cell.colStart + cell.colSpan && c < colCount; c++) {
        minC[c] = Math.max(minC[c], perColMin);
        maxC[c] = Math.max(maxC[c], perColMax);
      }
    }
  }

  // Ceil + 1px measurement slack per column on the mins; mild slack on max.
  for (let c = 0; c < colCount; c++) {
    minC[c] = Math.ceil(minC[c]) + 2;
    maxC[c] = Math.max(Math.ceil(maxC[c]) + 2, minC[c]);
  }

  const sumMin = minC.reduce((a, b) => a + b, 0);
  if (sumMin > innerWidth) return null; // longest words can't fit → fallback

  // Proportional to max-content, then clamp-to-min and redistribute (2 passes).
  const widths = new Array(colCount).fill(0);
  let free = innerWidth;
  const flexible = new Set(Array.from({ length: colCount }, (_, i) => i));
  for (let pass = 0; pass < colCount; pass++) {
    const sumMax = [...flexible].reduce((a, c) => a + maxC[c], 0) || 1;
    let clampedAny = false;
    for (const c of [...flexible]) {
      const w = (free * maxC[c]) / sumMax;
      if (w < minC[c]) {
        widths[c] = minC[c];
        free -= minC[c];
        flexible.delete(c);
        clampedAny = true;
      }
    }
    if (!clampedAny) {
      for (const c of flexible) widths[c] = Math.floor((free * maxC[c]) / sumMax);
      break;
    }
  }
  // Distribute leftover integer pixels deterministically (widest first).
  let leftover = innerWidth - widths.reduce((a, b) => a + b, 0);
  const order = Array.from({ length: colCount }, (_, i) => i)
    .sort((a, b) => widths[b] - widths[a] || a - b);
  for (let i = 0; leftover > 0; i = (i + 1) % colCount) {
    widths[order[i]] += 1;
    leftover--;
  }

  return { widths, padH, tableWidth };
};

// ─── Measurement ─────────────────────────────────────────────────────────────

/**
 * Full deterministic layout of a parsed grid.
 * Returns null when the grid can't be laid out natively.
 *
 * {
 *   rowHeights[], groups: [{start, end, height}], headerHeight,
 *   colWidths[], padH, padV, marginV, tableWidth, lineHeightPx, totalHeight,
 * }
 */
export const layoutTableGrid = (grid, ctx) => {
  let cols;
  if (grid.fixedColWidths) {
    const padH = Math.round(CELL_PAD_H_EM * ctx.baseFontSizePx) * 2;
    const widths = grid.fixedColWidths;
    const tableWidth = widths.reduce((a, b) => a + b, 0)
      + (grid.colCount + 1) * BORDER_PX + grid.colCount * padH;
    cols = { widths, padH, tableWidth };
  } else {
    cols = computeColWidths(grid, ctx);
  }
  if (!cols) return null;
  const { widths, padH, tableWidth } = cols;

  const lineHeightPx = ctx.lineHeightPx || Math.ceil(ctx.baseFontSizePx * ctx.baseLineHeight);
  const padV = Math.round(CELL_PAD_V_EM * ctx.baseFontSizePx);
  const marginV = Math.round(TABLE_MARGIN_EM * ctx.baseFontSizePx);

  const rowHeights = new Array(grid.rows.length).fill(lineHeightPx + 2 * padV);
  const spanFixups = []; // {lastRow, height} for rowspan cells

  for (let r = 0; r < grid.rows.length; r++) {
    for (const cell of grid.rows[r].cells) {
      // Effective wrap width: own columns + the padding/borders they absorb.
      let w = 0;
      for (let c = cell.colStart; c < cell.colStart + cell.colSpan && c < widths.length; c++) w += widths[c];
      w += (cell.colSpan - 1) * (padH + BORDER_PX);
      if (w <= 0) return null;

      let lines = 0;
      for (const blk of cell.blocks) {
        const font = buildFontString(ctx.baseFontSizePx, ctx.fontFamily, blk.bold || cell.isHeader || grid.rows[r].isHeaderRow, false);
        lines += countLines(blk.text, w, font, 0, 0, 0, true);
      }
      const cellH = Math.max(1, lines) * lineHeightPx + 2 * padV;

      if (cell.rowSpan > 1) {
        spanFixups.push({ lastRow: Math.min(r + cell.rowSpan - 1, grid.rows.length - 1), height: cellH, firstRow: r });
      } else {
        rowHeights[r] = Math.max(rowHeights[r], cellH);
      }
    }
  }

  // Rowspan cells: if the covered rows are shorter than the cell, grow the
  // last covered row (exactly what the browser does with collapsed borders).
  for (const fx of spanFixups) {
    let covered = 0;
    for (let r = fx.firstRow; r <= fx.lastRow; r++) covered += rowHeights[r] + (r > fx.firstRow ? BORDER_PX : 0);
    if (covered < fx.height) rowHeights[fx.lastRow] += fx.height - covered;
  }

  // Atomic row groups: union of rows covered by any rowspan.
  const groupOf = Array.from({ length: grid.rows.length }, (_, i) => i);
  for (const fx of spanFixups) {
    for (let r = fx.firstRow; r <= fx.lastRow; r++) groupOf[r] = groupOf[fx.firstRow];
  }
  const groups = [];
  for (let r = 0; r < grid.rows.length; ) {
    let end = r;
    while (end + 1 < grid.rows.length && groupOf[end + 1] === groupOf[r]) end++;
    // A group's height includes the bottom border of each row in it.
    let h = 0;
    for (let i = r; i <= end; i++) h += rowHeights[i] + BORDER_PX;
    groups.push({ start: r, end, height: h });
    r = end + 1;
  }

  let headerHeight = 0;
  for (let r = 0; r < grid.headerRowCount; r++) headerHeight += rowHeights[r] + BORDER_PX;

  const bodyH = groups.reduce((a, g) => a + g.height, 0);
  const totalHeight = marginV + BORDER_PX + bodyH + marginV;

  return {
    rowHeights, groups, headerHeight, colWidths: widths,
    padH, padV, marginV, tableWidth, lineHeightPx, totalHeight,
  };
};

// ─── Styled HTML generation ──────────────────────────────────────────────────

/**
 * Emit self-contained table HTML for a row range. All layout-relevant values
 * are inline (fixed layout, explicit col widths, borders, paddings) so the
 * preview, html2canvas PDF and EPUB reproduce exactly what was measured.
 */
export const buildStyledTableHtml = (grid, layout, ctx, opts = {}) => {
  const { fromRow = 0, toRow = grid.rows.length - 1, repeatHeader = false, continuation = false } = opts;
  const { colWidths, padH, padV, marginV, tableWidth } = layout;
  const fontPx = ctx.baseFontSizePx;

  const cellStyle = (isHeader) =>
    `border:${BORDER_PX}px solid ${BORDER_COLOR};padding:${padV}px ${Math.round(padH / 2)}px;` +
    `vertical-align:top;overflow-wrap:break-word;hyphens:none;` +
    (isHeader ? 'font-weight:bold;text-align:center;' : 'text-align:left;');

  const renderRow = (row) => {
    let tds = '';
    for (const cell of row.cells) {
      // Header rows always emit <th> (even when the source used <thead><td>)
      // so re-parsing the emitted HTML re-detects the same header prefix.
      const isHdr = cell.isHeader || row.isHeaderRow;
      const tag = isHdr ? 'th' : 'td';
      const span = (cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : '')
                 + (cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : '');
      const inner = cell.blocks
        .map(b => `<p style="margin:0;padding:0;text-indent:0;text-align:inherit;">${b.html}</p>`)
        .join('');
      tds += `<${tag}${span} style="${cellStyle(isHdr)}">${inner || '&nbsp;'}</${tag}>`;
    }
    return `<tr>${tds}</tr>`;
  };

  let rowsHtml = '';
  if (repeatHeader && fromRow >= grid.headerRowCount) {
    for (let r = 0; r < grid.headerRowCount; r++) rowsHtml += renderRow(grid.rows[r]);
  }
  for (let r = fromRow; r <= toRow && r < grid.rows.length; r++) rowsHtml += renderRow(grid.rows[r]);

  const colgroup = '<colgroup>' + colWidths.map(w => `<col style="width:${w}px">`).join('') + '</colgroup>';

  // line-height in EXACT px (the ceiled value the measurer counted with) so
  // the browser cannot accumulate sub-pixel drift over many rows.
  return `<table data-native-table="1"${continuation ? ' data-table-cont="1"' : ''} ` +
    `style="table-layout:fixed;border-collapse:collapse;width:${tableWidth}px;` +
    `margin:${marginV}px 0;font-size:${fontPx}px;line-height:${layout.lineHeightPx}px;border:0;">` +
    colgroup + '<tbody>' + rowsHtml + '</tbody></table>';
};

// ─── Public API ──────────────────────────────────────────────────────────────

const cacheKey = (html, ctx) =>
  `${html.length}|${html.slice(0, 80)}|${html.slice(-40)}|${ctx.contentWidth}|${ctx.baseFontSizePx}|${ctx.baseLineHeight}|${ctx.fontFamily}|${ctx.widthSlack || 0}`;

const getLayout = (html, ctx) => {
  if (!html || !ctx || !ctx.contentWidth || !ctx.baseFontSizePx) return null;
  const key = cacheKey(html, ctx);
  if (_tableLayoutCache.has(key)) return _tableLayoutCache.get(key);
  let entry = null;
  try {
    const grid = parseTableGrid(html);
    if (grid) {
      const layout = layoutTableGrid(grid, ctx);
      if (layout) entry = { grid, layout };
    }
  } catch {
    entry = null; // malformed markup → caller falls back to legacy treatment
  }
  if (_tableLayoutCache.size > MAX_TABLE_CACHE) _tableLayoutCache.clear();
  _tableLayoutCache.set(key, entry);
  return entry;
};

/**
 * Deterministic height of a table (px, margins included), or null when the
 * table can't be natively laid out (caller keeps its legacy estimate).
 */
export const measureTableHeight = (html, ctx) => {
  const e = getLayout(html, ctx);
  return e ? e.layout.totalHeight : null;
};

/**
 * Build the fully-styled, engine-owned HTML for a whole table.
 * Returns { html, height } or null (→ caller linearizes as before).
 */
export const buildNativeTableElement = (html, ctx) => {
  const e = getLayout(html, ctx);
  if (!e) return null;
  const styled = buildStyledTableHtml(e.grid, e.layout, ctx);
  // The styled HTML must round-trip through our own parser/measurer — it is
  // what the DP will re-measure. Same grid → same layout by construction, but
  // verify to be safe; a mismatch means unsupported markup somewhere.
  const back = getLayout(styled, ctx);
  if (!back) return null;
  return { html: styled, height: back.layout.totalHeight };
};

/**
 * Split a (styled) table at a row-group boundary so the head fits maxHeight.
 * Mirrors splitListByItems' contract: returns [headHtml, tailHtml] or null.
 * The tail repeats the header rows. Conservation-guarded: any word lost or
 * duplicated (beyond the repeated header) rejects the split.
 *
 * opts: { minOrphanRows = 2, minWidowRows = 2 } — counted in DATA row groups.
 *
 * Short tables with tall rows: a comparison table with only 2-3 data rows,
 * each several lines high, can never satisfy 2+2 and would jump WHOLE to the
 * next page leaving a half-empty hole (folio 90/91 report). When the caller's
 * floors can't be met, we retry with 1+1 as long as the head still fills the
 * offered space well (≥60%) — one row above, one below beats a big hole.
 */
export const splitTableByRows = (html, maxHeight, ctx, opts = {}) => {
  let { minOrphanRows = 2, minWidowRows = 2 } = opts;
  if (!html || maxHeight <= 0) return null;
  const e = getLayout(html, ctx);
  if (!e) return null;
  const { grid, layout } = e;
  const { groups, headerHeight, marginV } = layout;
  const hdrRows = grid.headerRowCount;

  // Data groups = groups past the header prefix.
  const dataGroups = groups.filter(g => g.start >= hdrRows);
  if (dataGroups.length < minOrphanRows + minWidowRows) {
    // Relax to 1+1 for short/tall tables so they can still start on the
    // current page instead of leaving a hole (only if 1+1 is now satisfiable).
    if (dataGroups.length >= 2 && (minOrphanRows > 1 || minWidowRows > 1)) {
      minOrphanRows = 1;
      minWidowRows = 1;
    } else {
      return null;
    }
  }

  // Head height = top margin + top border + header + first k data groups
  // (+ bottom margin: the sub-table keeps the same block margins).
  const fixed = marginV * 2 + BORDER_PX + headerHeight;
  let k = 0;
  let acc = fixed;
  for (const g of dataGroups) {
    if (acc + g.height > maxHeight) break;
    acc += g.height;
    k++;
  }
  if (k < minOrphanRows) return null;
  if (dataGroups.length - k < minWidowRows) {
    k = dataGroups.length - minWidowRows;         // keep a legal widow count
    if (k < minOrphanRows) return null;
  }

  const cutRow = dataGroups[k - 1].end;            // last row on the head page
  const headHtml = buildStyledTableHtml(grid, layout, ctx, { fromRow: 0, toRow: cutRow });
  const tailHtml = buildStyledTableHtml(grid, layout, ctx, {
    fromRow: cutRow + 1, toRow: grid.rows.length - 1,
    repeatHeader: hdrRows > 0, continuation: true,
  });

  // Conservation guard (cf. splitParagraphByLines): data words must be exactly
  // partitioned; the only allowed duplication is the repeated header. Each
  // grid skips ITS OWN header prefix (the tail's repeated header re-parses as
  // header rows of the tail grid).
  const dataWords = (g) => {
    let w = 0;
    for (let r = g.headerRowCount; r < g.rows.length; r++) {
      for (const cell of g.rows[r].cells) for (const b of cell.blocks) w += countWords(b.html);
    }
    return w;
  };
  const headGrid = parseTableGrid(headHtml);
  const tailGrid = parseTableGrid(tailHtml);
  if (!headGrid || !tailGrid) return null;
  if (headGrid.headerRowCount !== hdrRows) return null;
  if (tailGrid.headerRowCount !== (hdrRows > 0 ? hdrRows : 0)) return null;
  if (dataWords(headGrid) + dataWords(tailGrid) !== dataWords(grid)) return null;

  // Both halves must measure (tail may itself exceed a page — the DP will
  // call us again on it; it just needs to be measurable).
  if (measureTableHeight(headHtml, ctx) == null) return null;
  if (measureTableHeight(tailHtml, ctx) == null) return null;

  return [headHtml, tailHtml];
};

// Quick sanity probe for import-time decisions (no layout ctx available):
// keep the table only when it structurally parses into a supported grid.
export const isTableMarkupSane = (html) => parseTableGrid(html) != null;

// Test hook.
export const _clearTableLayoutCache = () => _tableLayoutCache.clear();
