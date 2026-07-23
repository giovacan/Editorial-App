/**
 * pdfVectorRenderer.js — TRUE vector PDF export (real, searchable text).
 *
 * Unlike the html2canvas path (a photo of the page) or the Puppeteer Cloud
 * Function, this draws the book with jsPDF's text/vector primitives:
 *   - Every line is drawn from the SAME line descriptors the preview renders
 *     (`layoutPageToLines` in lineRenderer.js) — no browser re-wrapping, so the
 *     PDF matches the preview line-for-line by construction.
 *   - Tables are drawn from the SAME grid the pagination engine measured
 *     (`tableLayoutEngine.js`) — real ruled cells, not a linearized blob.
 *   - Text is embedded Gelasio (a metric clone of Georgia, OFL) so glyph widths
 *     in the PDF equal the engine's Canvas measurements (validated ratio 1.000).
 *
 * Coordinate model
 * ────────────────
 * The engine works in CSS px at real size (contentWidth px wide, baseFontSizePx
 * px font — the `layoutDims` snapshot). jsPDF works in mm. One factor bridges
 * them: mmPerPx = contentWidthMm / contentWidthPx ≈ 25.4/96. Font size in jsPDF
 * is pt, and 1px = 0.75pt, so a px font renders at fontPx*0.75 pt. Because
 * Gelasio@Npx ≡ Georgia@Npx, justification widths (which come from the engine in
 * px) convert straight through mmPerPx and still fit exactly.
 *
 * Scope: <p>/<blockquote> body text (incl. inline bold/italic runs), headings,
 * native tables, running headers, folios. Out-of-scope blocks (lists, images,
 * <br> verse) fall back to a plain-text draw — the preview still audits those.
 */

import { KDP_STANDARDS } from '../../../utils/kdpStandards';
import { getPageLayout } from '../../../utils/pageLayout';
import { measureHtmlHeight } from '../../../utils/textLayoutEngine';
import { layoutPageToLines } from '../../../utils/lineRenderer';
import { parseTocPage } from './tocPdfParser';
import { parseTableGrid, layoutTableGrid } from '../../../utils/tableLayoutEngine';
import { htmlToText } from '../../../utils/layoutIr';
import { collapseWhitespace } from '../../../utils/textPreprocess';
import { toast } from '../../../utils/toast';

// Gelasio static faces (Vite resolves ?url to a served asset URL).
import gelasioRegularUrl    from '../../../assets/fonts/Gelasio-Regular.ttf?url';
import gelasioBoldUrl       from '../../../assets/fonts/Gelasio-Bold.ttf?url';
import gelasioItalicUrl     from '../../../assets/fonts/Gelasio-Italic.ttf?url';
import gelasioBoldItalicUrl from '../../../assets/fonts/Gelasio-BoldItalic.ttf?url';

const FONT_ID = 'Gelasio';

// Convert the engine's (scaled) px to jsPDF points using the SAME px→mm factor
// the column width uses. This is the single source of truth for sizing: font
// and width both scale by mmPerPx, so the text/column ratio the engine packed
// to is preserved in the PDF (mismatched factors caused the huge-word-gap bug).
const pxToPt = (px, mmPerPx) => px * mmPerPx * (72 / 25.4);

// Baseline offset from the TOP of a CSS line-box, in mm. The browser centers
// the glyph in the line-box: baseline = half-leading + ascent. Using a flat
// factor (0.78) placed every line too low; deriving it from the font's ascent
// matches where the preview draws each line (and works for headings too, whose
// font ≠ line height). ascent ≈ 0.73em for Gelasio/Georgia.
const ASCENT_RATIO = 0.73;
const baselineFromTopMm = (lineHeightMm, fontMm) =>
  (lineHeightMm - fontMm) / 2 + ASCENT_RATIO * fontMm;

// Metric correction: jsPDF's embedded-Gelasio advance widths run a hair WIDER
// than the engine's Canvas measurement (measured ~1.021 against node-canvas;
// ~1.000 against a real browser's Georgia — see pdf-vectorial memory). We draw
// the font very slightly condensed so a line the engine packed to full column
// width still fits. This is a uniform per-em factor, not per-glyph, so glyph
// shapes are visually unchanged. Any residual is caught per-line by drawLine's
// fit-to-column compression, so this constant only needs to be approximately
// right in either environment.
const METRIC_CORRECTION = 0.985;

// ── Font loading (once per session) ──────────────────────────────────────────

let _fontVfs = null; // { normal, bold, italic, bolditalic } → base64

const fetchAsBase64 = async (url) => {
  const buf = await fetch(url).then(r => {
    if (!r.ok) throw new Error(`No se pudo cargar la fuente Gelasio (${r.status})`);
    return r.arrayBuffer();
  });
  const bytes = new Uint8Array(buf);
  // Chunked to avoid call-stack overflow on large TTFs.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
};

const loadFontVfs = async () => {
  if (_fontVfs) return _fontVfs;
  const [normal, bold, italic, bolditalic] = await Promise.all([
    fetchAsBase64(gelasioRegularUrl),
    fetchAsBase64(gelasioBoldUrl),
    fetchAsBase64(gelasioItalicUrl),
    fetchAsBase64(gelasioBoldItalicUrl),
  ]);
  _fontVfs = { normal, bold, italic, bolditalic };
  return _fontVfs;
};

// jsPDF registers each face as a single STYLE of one family via the 3-arg
// addFont(name, id, style) — style ∈ {normal,bold,italic,bolditalic}. The 4-arg
// form (…, style, weight) does NOT select faces the way it looks like it does
// and silently mis-maps every face (everything rendered italic). Likewise
// setFont(id, style) takes ONE combined style token, not (style, weight).
const registerFonts = (doc, vfs) => {
  const files = {
    'Gelasio-Regular.ttf':    { b64: vfs.normal,     style: 'normal'     },
    'Gelasio-Bold.ttf':       { b64: vfs.bold,       style: 'bold'       },
    'Gelasio-Italic.ttf':     { b64: vfs.italic,     style: 'italic'     },
    'Gelasio-BoldItalic.ttf': { b64: vfs.bolditalic, style: 'bolditalic' },
  };
  for (const [name, f] of Object.entries(files)) {
    doc.addFileToVFS(name, f.b64);
    doc.addFont(name, FONT_ID, f.style);
  }
};

// style bit → jsPDF combined style token (bits: 1=bold, 2=italic).
const STYLE_TOKEN = ['normal', 'bold', 'italic', 'bolditalic'];
const setStyle = (doc, styleBit) => {
  doc.setFont(FONT_ID, STYLE_TOKEN[styleBit & 3]);
};

// ── Justified line drawing ───────────────────────────────────────────────────

/**
 * Draw one line's styled runs at (xMm, baselineMm). When `justify` and the line
 * is short of `lineWidthMm`, the slack is distributed evenly across the inter-
 * word gaps (charSpace would distort letter spacing; we widen spaces instead by
 * inserting proportional x-advance between words). Mixed-style runs are drawn
 * segment by segment, tracking the running x.
 */
const drawLine = (doc, line, xMm, baselineMm, lineWidthMm) => {
  // A hyphen-pulled line ends mid-word: append the print '-' to the last run so
  // it's measured and drawn as part of that word (never a justification gap).
  const runs = line.hyphen && line.runs.length
    ? line.runs.map((r, i) => i === line.runs.length - 1 ? { ...r, text: r.text + '-' } : r)
    : line.runs;
  const plain = runs.map(r => r.text).join('');
  if (!plain) return;

  // Natural width of the line in mm (measured with the embedded font at size).
  // We measure per run in its own style so bold/italic widths are exact.
  let naturalMm = 0;
  const runWidths = runs.map(r => {
    setStyle(doc, r.style);
    const w = doc.getTextWidth(r.text);
    naturalMm += w;
    return w;
  });

  // Count inter-word gaps (spaces between words, across the whole line).
  const gapCount = (plain.match(/ /g) || []).length;

  // Per-gap slack (mm): POSITIVE widens spaces (justify a short line), NEGATIVE
  // tightens them (fit an overflowing line to the column instead of spilling).
  // A justified interior line targets the full column; a short last/left line
  // is drawn at natural width. Compression is capped at half a space so it
  // never collapses words together — beyond that the residual is left as a tiny
  // overhang (rare, and far less ugly than crushed text).
  let extraPerGap = 0;
  if (gapCount > 0) {
    const spaceMm = doc.getTextWidth(' ');
    if (line.align === 'justify') {
      extraPerGap = (lineWidthMm - naturalMm) / gapCount;      // may be + or −
    } else if (naturalMm > lineWidthMm) {
      extraPerGap = (lineWidthMm - naturalMm) / gapCount;      // fit a long non-justified line
    }
    const minGap = -spaceMm * 0.5;                             // don't crush spaces past 50%
    if (extraPerGap < minGap) extraPerGap = minGap;
  }

  let x = xMm;
  for (let ri = 0; ri < runs.length; ri++) {
    const run = runs[ri];
    setStyle(doc, run.style);
    if (extraPerGap === 0) {
      doc.text(run.text, x, baselineMm, { baseline: 'alphabetic' });
      x += runWidths[ri];
    } else {
      // Split the run on spaces so we can inject extra advance per gap while
      // keeping each word contiguous. A leading/trailing space in the run is
      // preserved as its own (empty-word) gap.
      const parts = run.text.split(' ');
      for (let pi = 0; pi < parts.length; pi++) {
        const word = parts[pi];
        if (word) {
          doc.text(word, x, baselineMm, { baseline: 'alphabetic' });
          x += doc.getTextWidth(word);
        }
        if (pi < parts.length - 1) {
          x += doc.getTextWidth(' ') + extraPerGap; // the space + justification slack
        }
      }
    }
  }
};

// ── Heading / passthrough helpers ────────────────────────────────────────────

const parseHeadingFromHtml = (outerHtml, tag, baseFontPx) => {
  const open = (outerHtml.match(/^<[^>]+>/) || [''])[0];
  const style = (open.match(/style="([^"]*)"/) || ['', ''])[1];
  const text = collapseWhitespace(htmlToText(outerHtml)).trim();
  const align = (style.match(/text-align:\s*([^;"]+)/i) || ['', 'center'])[1].trim();
  const fsM = style.match(/font-size:\s*([\d.]+)(pt|px)/i);
  let fontPx;
  if (fsM) {
    fontPx = fsM[2] === 'pt' ? parseFloat(fsM[1]) * (96 / 72) : parseFloat(fsM[1]);
  } else {
    const level = parseInt((tag.match(/H([1-6])/) || [])[1] || '2', 10);
    fontPx = baseFontPx * ([0, 1.8, 1.5, 1.25, 1.1, 1.0, 1.0][level] ?? 1.3);
  }
  const bold = !/font-weight:\s*normal/i.test(style);
  const italic = /font-style:\s*italic/i.test(style);
  // Margins from the element's own style (em resolves against the heading's own
  // font, px absolute) — the same inputs textLayoutEngine.measureBlock uses, so
  // the drawn height equals the paginated height.
  const resolveMargin = (prop) => {
    const m = style.match(new RegExp(`${prop}:\\s*(-?[\\d.]+)(em|px|rem)?`, 'i'));
    if (!m) return 0;
    const n = parseFloat(m[1]); const u = m[2] || 'px';
    return u === 'em' || u === 'rem' ? n * fontPx : n;
  };
  // `margin:` shorthand (top … bottom) as a fallback for top/bottom.
  const short = style.match(/(?:^|;)\s*margin:\s*([^;]+)/i);
  let mTop = resolveMargin('margin-top'), mBot = resolveMargin('margin-bottom');
  if (short && !/margin-top/i.test(style)) {
    const parts = short[1].trim().split(/\s+/);
    const toPx = (v) => { const mm = /(-?[\d.]+)(em|px|rem)?/.exec(v); if (!mm) return 0; const n = parseFloat(mm[1]); return (mm[2] === 'em' || mm[2] === 'rem') ? n * fontPx : n; };
    mTop = toPx(parts[0]); mBot = toPx(parts[2] ?? parts[0]);
  }
  return { text, align, fontPx, bold, italic, marginTopPx: mTop, marginBottomPx: mBot };
};

// ── Header parsing (3-span flex row produced by buildHeaderHtmlPure) ──────────

const parseHeaderHtml = (html) => {
  if (!html) return null;
  // String-based (no DOM): the header is a <div><span>…</span>×3</div>.
  const spans = [...html.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)].map(m =>
    collapseWhitespace(htmlToText(m[1])).trim());
  const left = spans[0] || '';
  const center = spans[1] || '';
  const right = spans[2] || '';
  if (!left && !center && !right) return null;
  const wrapper = (html.match(/^<div[^>]*style="([^"]*)"/i) || ['', ''])[1];
  const showLine = /border-bottom:[^;]+(?:solid|dashed|dotted)/i.test(wrapper);
  return { left, center, right, showLine };
};

const hexToRgb = (hex, fallback = [68, 68, 68]) => {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// ── Table drawing ────────────────────────────────────────────────────────────

/**
 * Draw a native table from the engine's measured grid. Returns the y (mm) below
 * the table, or null when the table isn't natively layout-able (caller falls
 * back to a plain-text passthrough).
 */
const drawTable = (doc, tableHtml, engineCtx, xMm, yMm, mmPerPx) => {
  const grid = parseTableGrid(tableHtml);
  if (!grid) return null;
  const layout = layoutTableGrid(grid, engineCtx);
  if (!layout) return null;

  const { colWidths, rowHeights, padH, padV, marginV, lineHeightPx } = layout;
  const px = (v) => v * mmPerPx;
  const cellFontPt = pxToPt(engineCtx.baseFontSizePx, mmPerPx);

  // Column x-offsets (px) from the table's left edge.
  const colX = [0];
  for (let c = 0; c < colWidths.length; c++) colX.push(colX[c] + colWidths[c] + padH);

  let yPx = 0; // relative to table top (below the top margin)
  const topMm = yMm + px(marginV);

  doc.setDrawColor(68, 68, 68);
  doc.setLineWidth(Math.max(0.1, px(1)));

  const rowTopPx = [];
  for (let r = 0; r < grid.rows.length; r++) { rowTopPx.push(yPx); yPx += rowHeights[r]; }
  const tableBottomMm = topMm + px(yPx);

  // Cell text + per-cell borders (collapsed look: draw each cell's rectangle).
  for (let r = 0; r < grid.rows.length; r++) {
    const row = grid.rows[r];
    for (const cell of row.cells) {
      const cx0 = colX[cell.colStart];
      let cw = 0;
      for (let c = cell.colStart; c < cell.colStart + cell.colSpan && c < colWidths.length; c++) {
        cw += colWidths[c] + padH;
      }
      const cellRowSpan = Math.max(1, cell.rowSpan || 1);
      let ch = 0;
      for (let rr = r; rr < r + cellRowSpan && rr < rowHeights.length; rr++) ch += rowHeights[rr];

      const cxMm = xMm + px(cx0);
      const cyMm = topMm + px(rowTopPx[r]);
      const cwMm = px(cw);
      const chMm = px(ch);

      doc.rect(cxMm, cyMm, cwMm, chMm); // border

      const isHdr = cell.isHeader || row.isHeaderRow;
      doc.setFont(FONT_ID, isHdr ? 'bold' : 'normal');
      doc.setFontSize(cellFontPt);
      const textXMm = cxMm + px(padH / 2);
      const availMm = cwMm - px(padH);
      let lineY = cyMm + px(padV) + px(lineHeightPx) * 0.78;
      for (const blk of cell.blocks) {
        // The engine measured wrapping at this width; re-wrap identically via
        // jsPDF's splitter (Gelasio metrics ≡ engine metrics, so counts match).
        const wrapped = doc.splitTextToSize(blk.text, availMm);
        for (const wl of wrapped) {
          const align = isHdr ? 'center' : 'left';
          const tx = align === 'center' ? cxMm + cwMm / 2 : textXMm;
          doc.text(wl, tx, lineY, { align, baseline: 'alphabetic' });
          lineY += px(lineHeightPx);
        }
      }
    }
  }

  return tableBottomMm + px(marginV);
};

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Export the book as a true vector PDF.
 *
 * @param {object}   bookData
 * @param {object}   config
 * @param {Array}    paginatedPages
 * @param {object}   dims  – the modal's pdfDims + the engine layoutDims fields
 *                           (contentWidth, baseFontSizePx, baseLineHeight,
 *                            lineHeightPx, fontFamily). See ExportPreviewModal.
 * @param {Function} [onProgress]
 */
export const exportPdfVector = async (bookData, config, paginatedPages, dims, onProgress) => {
  if (!paginatedPages?.length || !dims) {
    toast.error('No hay páginas para exportar. Abre la Vista previa primero.');
    return;
  }
  if (!dims.contentWidth || !dims.baseFontSizePx) {
    toast.error('Faltan medidas del motor (layoutDims). Reabre la Vista previa e intenta de nuevo.');
    return;
  }

  const bookConfig = KDP_STANDARDS.getBookTypeConfig(bookData?.bookType || 'novela');
  const formatId   = config?.pageFormat || bookConfig?.recommendedFormat || '6x9';
  const pageFormat = KDP_STANDARDS.getPageFormat(formatId);
  if (!pageFormat) { toast.error('Formato de página no reconocido: ' + formatId); return; }

  const { jsPDF } = await import('jspdf');
  const vfs = await loadFontVfs();

  const toMM = (val, unit) => unit === 'inches' ? val * 25.4 : val;
  const W = toMM(pageFormat.width,  pageFormat.unit);
  const H = toMM(pageFormat.height, pageFormat.unit);

  const {
    pageWidthPx,
    contentWidth: contentWidthPx,
    baseFontSizePx,
    lineHeightPx,
    baseLineHeight,
    fontFamily,
    previewScale = 0.42,
    totalPages = paginatedPages.length,
    tocConfig = null,
    layoutDims = null,
  } = dims;

  // px @ previewScale → physical mm. Font and column width both use this factor
  // so the text/column ratio the engine packed to is preserved (see pxToPt).
  const mmPerPx = W / pageWidthPx;

  const fontPtSize   = pxToPt(baseFontSizePx, mmPerPx);
  const lineHeightMm = lineHeightPx * mmPerPx;

  // Engine ctx for tables (same px space the DP paginated in).
  const engineCtx = {
    contentWidth: contentWidthPx,
    baseFontSizePx,
    baseLineHeight: baseLineHeight || (lineHeightPx / baseFontSizePx),
    lineHeightPx,
    fontFamily,
  };
  // Line-layout ctx (same one Preview.jsx builds).
  const lineCtx = { contentWidth: contentWidthPx, baseFontSizePx, fontFamily };

  const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: 'portrait', compress: true });
  registerFonts(doc, vfs);
  doc.setFont(FONT_ID, 'normal');

  const bookTitle = bookData?.title || '';
  const total = paginatedPages.length;

  for (let i = 0; i < total; i++) {
    if (i > 0) doc.addPage([W, H], 'portrait');
    const page = paginatedPages[i];

    // Authoritative per-page layout — the SAME engine the preview uses. Gives
    // folio/header visibility + position and the real margins (gutter alternates
    // by odd/even page), so we never reinvent placement. All values are px @
    // previewScale → convert to mm with mmPerPx.
    const L = getPageLayout({
      pageData: page, config, bookConfig, pageFormat, previewScale,
      totalPages, layoutDims, tocConfig, bookTitle,
    });

    // Real per-page horizontal geometry: the engine's contentWidth (what the DP
    // measured lines against) anchored at the engine's own left margin.
    // NOTE: getPageLayout exposes contentWidth under `typography`, not as a flat
    // prop — reading L.contentWidth gives undefined → NaN coords → jsPDF throws
    // "Invalid arguments passed to jsPDF.text".
    const colWidthMm = L.typography.contentWidth * mmPerPx;
    const leftMm     = L.marginLeft   * mmPerPx;
    let yMm = L.marginTop * mmPerPx;

    // ── DEBUG GRID (config.debugGrid) ──────────────────────────────────────────
    // Faint horizontal ruling every lineHeightPx from marginTop down to the
    // folio, numbered, so the line-grid can be counted and compared against the
    // preview 1:1. Also marks the content-box floor (effectiveContentHeight) and
    // the folio baseline. Off by default; the preview draws the SAME grid.
    if (config?.debugGrid && !page.isBlank) {
      const startMm = L.marginTop * mmPerPx;
      const folioMm = (L.page.height - L.folio.fromEdge) * mmPerPx;
      const boxFloorMm = (L.marginTop + (L.effectiveContentHeight ?? L.engineContentHeight)) * mmPerPx;
      let g = 0;
      for (let gy = startMm; gy <= folioMm + 0.01; gy += lineHeightMm, g++) {
        doc.setDrawColor(210, 210, 255);
        doc.setLineWidth(0.05);
        doc.line(leftMm, gy, leftMm + colWidthMm, gy);
        doc.setFont(FONT_ID, 'normal'); doc.setFontSize(4);
        doc.setTextColor(150, 150, 210);
        doc.text(String(g), leftMm - 3, gy + 0.6, { align: 'right', baseline: 'alphabetic' });
      }
      // content-box floor (red) + folio line (green)
      doc.setDrawColor(230, 120, 120); doc.setLineWidth(0.2);
      doc.line(leftMm, boxFloorMm, leftMm + colWidthMm, boxFloorMm);
      doc.setDrawColor(120, 200, 120);
      doc.line(leftMm, folioMm, leftMm + colWidthMm, folioMm);
      doc.setTextColor(0, 0, 0);
    }

    if (!page.isBlank) {
      // Running header — only when the layout engine says to show it (skips
      // chapter-start pages, front matter, blanks — "some pages have no header").
      if (L.header.show) {
        const hs = L.header.style;
        const headerFontPt = pxToPt(hs.fontSize, mmPerPx);
        const headerLineMm = hs.fontSize * (baseLineHeight || 1.5) * mmPerPx;
        doc.setFont(FONT_ID, 'normal');
        doc.setFontSize(headerFontPt);
        const header = parseHeaderHtml(L.header.content);
        if (header) {
          const baseY = yMm + baselineFromTopMm(headerLineMm, hs.fontSize * mmPerPx);
          if (header.left)   doc.text(header.left,   leftMm, baseY, { align: 'left', baseline: 'alphabetic' });
          if (header.center) doc.text(header.center, leftMm + colWidthMm / 2, baseY, { align: 'center', baseline: 'alphabetic' });
          if (header.right)  doc.text(header.right,  leftMm + colWidthMm, baseY, { align: 'right', baseline: 'alphabetic' });
          yMm += headerLineMm;
          if (hs.showLine) {
            yMm += hs.fontSize * 0.5 * mmPerPx; // padding-bottom: 0.5em
            doc.setDrawColor(...hexToRgb(hs.lineColor === 'black' ? '#000000' : hs.lineColor));
            doc.setLineWidth((hs.lineWidth ?? 0.5) * 0.352778);
            doc.line(leftMm, yMm, leftMm + colWidthMm, yMm);
          }
          // margin-bottom: 1 line (matches the engine's headerSpaceUsed).
          yMm += lineHeightMm;
        }
      }

      // TOC pages: one wrapper div with flex entries — needs its own layout
      // (title left + leader dots + right-aligned number). Flattening it
      // overlapped everything ("tabla de contenido solapada").
      const tocEnd = page.isTOCPage
        ? drawTocPage(doc, page.html || '', leftMm, colWidthMm, yMm, mmPerPx, baseFontSizePx)
        : null;
      if (tocEnd != null) {
        yMm = tocEnd;
      } else {
      // Body: one descriptor per top-level block.
      const bodyBaseMm = baselineFromTopMm(lineHeightMm, baseFontSizePx * mmPerPx);
      const descriptors = layoutPageToLines(page.html || '', lineCtx);
      for (const desc of descriptors) {
        if (desc.type === 'lines') {
          doc.setFont(FONT_ID, 'normal');
          doc.setFontSize(pxToPt(desc.fontPx, mmPerPx) * METRIC_CORRECTION);
          // The engine's height for this block is marginTop + paddingV +
          // lines×lineHeightPx + marginBottom (textLayoutEngine). Consume the
          // SAME vertical space or the body under-advances and leaves a gap at
          // the bottom (the "huecote"). padding-bottom:3.3px on every paragraph
          // was being dropped → ~4 lines of drift per page.
          yMm += (desc.marginTopPx || 0) * mmPerPx;
          for (const line of desc.lines) {
            const indentMm = (line.indent || 0) * mmPerPx;
            const baselineMm = yMm + bodyBaseMm;
            drawLine(doc, line, leftMm + indentMm, baselineMm, colWidthMm - indentMm);
            yMm += lineHeightMm;
          }
          yMm += ((desc.paddingVPx || 0) + (desc.marginBottomPx || 0)) * mmPerPx;
        } else {
          // Passthrough blocks (chapter title, headings, tables, lists): draw
          // the visuals, but advance by the ENGINE-measured height of the block
          // — the same measureHtmlHeight the DP paginated with. This makes the
          // vertical flow identical to the preview BY CONSTRUCTION: any error
          // in how we draw inside a block can no longer shift everything below
          // it (the residual "huecote" came from title/heading advance drift).
          const blockStartMm = yMm;
          const drawnEndMm = drawPassthrough(doc, desc, engineCtx, leftMm, colWidthMm,
                                             yMm, mmPerPx, fontPtSize, lineHeightMm, baseFontSizePx);
          let engineHPx = 0;
          try { engineHPx = measureHtmlHeight(desc.outerHtml, engineCtx) || 0; } catch { engineHPx = 0; }
          // Authoritative advance = engine height; fall back to what the drawer
          // consumed only if measurement failed.
          yMm = engineHPx > 0 ? blockStartMm + engineHPx * mmPerPx : drawnEndMm;
        }
      }
      }
    }

    // Footnotes — draw the note block (rule + notes at reduced size) just above
    // the folio on the page that holds each marker. The engine already reserved
    // this vertical space, so it never overlaps the body.
    if (page.footnotes && page.footnotes.length > 0) {
      const fnCfg = config?.footnotes || {};
      const fnFontPx = baseFontSizePx * (fnCfg.fontScale ?? 0.72);
      const fnFontPt = pxToPt(fnFontPx, mmPerPx);
      const fnLineMm = fnFontPx * (fnCfg.lineHeight ?? 1.4) * mmPerPx;
      // Total block height (rule + one line per wrapped note line) in mm.
      const wrappedPerNote = page.footnotes.map((n) => {
        doc.setFont(FONT_ID, 'normal'); doc.setFontSize(fnFontPt);
        // Continued fragments (from the previous page) show no number.
        const prefix = n.continued ? '' : `${n.index}. `;
        return doc.splitTextToSize(`${prefix}${(n.html || '').replace(/<[^>]+>/g, '')}`, colWidthMm);
      });
      const totalLines = wrappedPerNote.reduce((s, w) => s + w.length, 0);
      const ruleGapMm = fnLineMm * 0.5;
      const blockH = ruleGapMm + totalLines * fnLineMm;
      const folioTopMm = (L.page.height - L.folio.fromEdge) * mmPerPx;
      // Block bottom sits ~1.2 lines above the folio.
      let y = folioTopMm - fnLineMm * 1.2 - blockH;
      // Separator rule (⅓ column, left-aligned).
      doc.setDrawColor(80, 80, 80);
      doc.setLineWidth(Math.max(0.1, 0.5 * mmPerPx));
      doc.line(leftMm, y, leftMm + colWidthMm / 3, y);
      y += ruleGapMm + fnLineMm * 0.8;
      doc.setTextColor(0, 0, 0);
      doc.setFont(FONT_ID, 'normal'); doc.setFontSize(fnFontPt);
      for (const wrapped of wrappedPerNote) {
        for (const line of wrapped) {
          doc.text(line, leftMm, y, { baseline: 'alphabetic' });
          y += fnLineMm;
        }
      }
    }

    // Folio — visibility + alignment + distance from edge all from the engine.
    if (L.folio.show) {
      doc.setFont(FONT_ID, 'normal');
      doc.setFontSize(pxToPt(baseFontSizePx, mmPerPx) * 0.8);
      const numY = (L.page.height - L.folio.fromEdge) * mmPerPx;
      const align = L.folio.align;
      let numX, opt;
      if (align === 'outer' || align === 'paragraph-edge' || align === 'paragraph') {
        // Outer edge: left on even pages, right on odd.
        numX = L.isCurrentPageEven ? leftMm : leftMm + colWidthMm;
        opt = { align: L.isCurrentPageEven ? 'left' : 'right', baseline: 'alphabetic' };
      } else {
        numX = leftMm + colWidthMm / 2;
        opt = { align: 'center', baseline: 'alphabetic' };
      }
      doc.text(String(L.folio.value), numX, numY, opt);
    }

    onProgress?.(i + 1, total);
    if (i % 20 === 0 && i > 0) await new Promise(r => setTimeout(r, 0));
  }

  const safeTitle = (bookData?.title || 'libro').replace(/[^\w\sáéíóúñÁÉÍÓÚÑ.-]/g, '_');
  doc.save(`${safeTitle}.pdf`);
};

/**
 * Parse a chapter-title block (`<div data-chapter-start>`). The engine emits a
 * wrapper div (with a top/bottom margin) containing, in order: an optional top
 * divider div, the title inner (either a bare title, or a label div + title div
 * each with an inline `font-size` in pt), and an optional bottom divider. We
 * return the ordered pieces so the PDF can center each at its own size — drawing
 * the raw text as one blob is exactly the "CAPÍTULO 1UNA ANTORCHA…" bug.
 *
 * Returns { marginTopPx, marginBottomPx, hasTopRule, hasBottomRule, parts:
 * [{ text, fontPx, bold, marginTopPx }] } or null when it isn't a title block.
 */
// Parse a CSS font-weight / font-style token to a boolean; returns null when
// the property is absent (so callers can fall back to the inherited value).
const readWeight = (style) => /font-weight:/i.test(style)
  ? /font-weight:\s*(bold|[6-9]00)/i.test(style) : null;
const readItalic = (style) => /font-style:/i.test(style)
  ? /font-style:\s*italic/i.test(style) : null;

const parseChapterTitle = (html, baseFontPx) => {
  if (!/data-chapter-start/.test(html)) return null;
  const wrapOpen = (html.match(/^<div[^>]*>/i) || [''])[0];
  const wrapStyle = (wrapOpen.match(/style="([^"]*)"/) || ['', ''])[1];
  const mMargin = wrapStyle.match(/margin:\s*([\d.]+)px\s+[\d.]+(?:px)?\s+([\d.]+)px/i);
  const marginTopPx = mMargin ? parseFloat(mMargin[1]) : baseFontPx;
  const marginBottomPx = mMargin ? parseFloat(mMargin[2]) : baseFontPx;

  // The engine puts titleBaseStyle (font-weight:bold, font-style, text-align)
  // on the WRAPPER; the inner title div inherits it via the CSS cascade and
  // only the label div overrides font-weight to normal. So the wrapper's
  // weight/style is the inherited default for any child that doesn't set its own.
  const inheritBold = readWeight(wrapStyle) === true;
  const inheritItalic = readItalic(wrapStyle) === true;

  // Inner content between the wrapper's own tags.
  const inner = html.replace(/^<div[^>]*>/i, '').replace(/<\/div>\s*$/i, '');
  // Collect immediate child divs.
  const parts = [];
  const childRe = /<div([^>]*)>([\s\S]*?)<\/div>/gi;
  let m;
  while ((m = childRe.exec(inner)) !== null) {
    const style = (m[1].match(/style="([^"]*)"/) || ['', ''])[1];
    // Skip divider rules (empty text, border-top).
    const txt = collapseWhitespace(htmlToText(m[2])).trim();
    if (!txt) continue;
    const fsM = style.match(/font-size:\s*([\d.]+)(pt|px)/i);
    const fontPx = fsM ? (fsM[2] === 'pt' ? parseFloat(fsM[1]) * (96 / 72) : parseFloat(fsM[1])) : baseFontPx;
    const ownBold = readWeight(style);
    const ownItalic = readItalic(style);
    const bold = ownBold === null ? inheritBold : ownBold;      // inherit unless overridden
    const italic = ownItalic === null ? inheritItalic : ownItalic;
    const mbM = style.match(/margin-bottom:\s*([\d.]+)px/i);
    const lhM = style.match(/line-height:\s*([\d.]+)(?![\d.]*(px|pt|%|em))/i); // unitless factor
    parts.push({ text: txt, fontPx, bold, italic,
      marginBottomPx: mbM ? parseFloat(mbM[1]) : 0,
      lineHeightRatio: lhM ? parseFloat(lhM[1]) : 1.3 });
  }
  // No nested title divs → the wrapper holds the bare title text directly.
  if (parts.length === 0) {
    const txt = collapseWhitespace(htmlToText(inner)).trim();
    if (txt) parts.push({ text: txt, fontPx: baseFontPx * 1.3, bold: inheritBold, italic: inheritItalic, marginBottomPx: 0 });
  }
  return {
    marginTopPx, marginBottomPx,
    hasTopRule: /border-top/i.test(inner),
    parts,
  };
};

const drawChapterTitle = (doc, ct, xMm, widthMm, yMm, mmPerPx, lineHeightMm) => {
  yMm += ct.marginTopPx * mmPerPx;
  const centerX = xMm + widthMm / 2;
  if (ct.hasTopRule) {
    doc.setDrawColor(51, 51, 51);
    doc.setLineWidth(Math.max(0.15, mmPerPx));
    doc.line(xMm + widthMm * 0.25, yMm, xMm + widthMm * 0.75, yMm);
    yMm += lineHeightMm * 0.4;
  }
  for (const part of ct.parts) {
    doc.setFont('Gelasio', part.bold && part.italic ? 'bolditalic' : part.italic ? 'italic' : part.bold ? 'bold' : 'normal');
    doc.setFontSize(pxToPt(part.fontPx, mmPerPx));
    // The engine emits the title with line-height:1.3 (renderTitleInner), NOT
    // proportional to the body grid. Advancing by lineHeightMm×(font/base) made
    // the title consume too many rows and pushed the body down (measured with the
    // debug grid: body started lower, last line drifted to row 24 vs preview 23).
    const partLineMm = (part.lineHeightRatio ?? 1.3) * part.fontPx * mmPerPx;
    const partBaseMm = baselineFromTopMm(partLineMm, part.fontPx * mmPerPx);
    const wrapped = doc.splitTextToSize(part.text, widthMm);
    for (const wl of wrapped) {
      doc.text(wl, centerX, yMm + partBaseMm, { align: 'center', baseline: 'alphabetic' });
      yMm += partLineMm;
    }
    yMm += (part.marginBottomPx || 0) * mmPerPx;
  }
  if (ct.hasTopRule) {
    yMm += lineHeightMm * 0.2;
    doc.setDrawColor(51, 51, 51);
    doc.setLineWidth(Math.max(0.15, mmPerPx));
    doc.line(xMm + widthMm * 0.25, yMm, xMm + widthMm * 0.75, yMm);
  }
  return yMm + ct.marginBottomPx * mmPerPx;
};

/**
 * Draw a full TOC page: centered heading + flex entries (title left, leader
 * dots, page number right-aligned in its fixed column). Uses the CSS-authored
 * px metrics (margins, line-height, span height, number column width) that
 * generateFrontMatter computed, so heights match the preview exactly.
 * Returns the final yMm, or null when the html isn't a parseable TOC page
 * (caller falls back to the normal flow).
 */
const drawTocPage = (doc, pageHtml, xMm, colWidthMm, yMm, mmPerPx, baseFontSizePx) => {
  const toc = parseTocPage(pageHtml);
  if (!toc) return null;
  const padMm = (toc.xPadPx || 0) * mmPerPx;
  const x = xMm + padMm;
  const w = colWidthMm - 2 * padMm;

  if (toc.title) {
    const fontPx = toc.title.fontPxRaw ?? ((toc.title.fontEm ?? 1.1) * baseFontSizePx);
    const lhMm = (toc.title.lineHeightPx || fontPx * 1.3) * mmPerPx;
    doc.setFont(FONT_ID, toc.title.bold ? 'bold' : 'normal');
    doc.setFontSize(pxToPt(fontPx, mmPerPx));
    doc.setTextColor(0, 0, 0);
    doc.text(toc.title.text, x + w / 2, yMm + baselineFromTopMm(lhMm, fontPx * mmPerPx),
             { align: 'center', baseline: 'alphabetic' });
    yMm += lhMm + (toc.title.marginBottomPx || 0) * mmPerPx;
  }

  // Seed the collapse with the title's margin-bottom so the first entry's
  // margin-top collapses against it (adjacent siblings in the wrapper) — same as
  // the browser. null title → first entry adds its full margin-top.
  let prevMarginBottomPx = toc.title ? (toc.title.marginBottomPx || 0) : null;
  for (const e of toc.entries) {
    // Vertical margin collapse: adjacent block entries in the browser collapse
    // their touching margins to max(prevMB, curMT), NOT the sum. Advancing by the
    // full marginTop here (as before) over-spaced every gap vs the preview — the
    // PDF's TOC looked more stretched than the previews ("no se ve igual" en la
    // distribución). Subtract the collapsed overlap so the flow matches the DOM.
    const collapse = prevMarginBottomPx == null
      ? 0
      : Math.min(prevMarginBottomPx, e.marginTopPx || 0);
    yMm += ((e.marginTopPx || 0) - collapse) * mmPerPx;
    const fontPx = e.fontPxRaw ?? ((e.fontEm ?? 0.85) * baseFontSizePx);
    const lhPx = e.lineHPx || Math.ceil(fontPx * 1.3);
    const lhMm = lhPx * mmPerPx;
    const indentMm = (e.indentPx || 0) * mmPerPx;
    const numColMm = (e.numColPx || 0) * mmPerPx;
    const titleWMm = Math.max(4, w - indentMm - numColMm);
    const text = e.uppercase ? e.titleText.toUpperCase() : e.titleText;

    doc.setFont(FONT_ID, e.bold ? 'bold' : 'normal');
    doc.setFontSize(pxToPt(fontPx, mmPerPx) * METRIC_CORRECTION);
    doc.setTextColor(0, 0, 0);
    let wrapped = doc.splitTextToSize(text, titleWMm);
    // The CSS span is clipped at titleHeightPx (overflow:hidden) — mirror it.
    const cssLines = e.titleHeightPx && lhPx ? Math.max(1, Math.round(e.titleHeightPx / lhPx)) : wrapped.length;
    if (wrapped.length > cssLines) wrapped = wrapped.slice(0, cssLines);
    const baseOff = baselineFromTopMm(lhMm, fontPx * mmPerPx);
    let lastLineW = 0;
    for (let i = 0; i < wrapped.length; i++) {
      doc.text(wrapped[i], x + indentMm, yMm + i * lhMm + baseOff, { baseline: 'alphabetic' });
      if (i === wrapped.length - 1) lastLineW = doc.getTextWidth(wrapped[i]);
    }
    const lastBaseMm = yMm + (wrapped.length - 1) * lhMm + baseOff;

    // Leader (dots/dash/line/asterisk) from the title's end to the number column.
    if (e.sepType && e.sepType !== 'none') {
      const sepStart = x + indentMm + lastLineW + 1.2;
      const sepEnd = x + w - numColMm - 1.0;
      if (sepEnd > sepStart + 2) {
        doc.setFont(FONT_ID, 'normal');
        doc.setFontSize(pxToPt(fontPx * 0.9, mmPerPx));
        doc.setTextColor(160, 160, 160);
        const unit = e.sepType === 'dash' ? '– ' : e.sepType === 'line' ? '__ '
                   : e.sepType === 'asterisk' ? '* ' : '. ';
        const uw = doc.getTextWidth(unit);
        const n = uw > 0 ? Math.floor((sepEnd - sepStart) / uw) : 0;
        if (n > 0) doc.text(unit.repeat(n), sepStart, lastBaseMm, { baseline: 'alphabetic' });
      }
    }

    // Page number: right-aligned in its column; baseline on the last title
    // line (align-items:flex-end) or the first (editorial H1, flex-start).
    doc.setFont(FONT_ID, 'normal');
    doc.setFontSize(pxToPt(fontPx * (e.numFontEm ?? 0.9), mmPerPx));
    doc.setTextColor(85, 85, 85);
    doc.text(e.numText, x + w, e.alignTop ? yMm + baseOff : lastBaseMm,
             { align: 'right', baseline: 'alphabetic' });
    doc.setTextColor(0, 0, 0);

    if (e.hasBottomRule) {
      doc.setDrawColor(221, 221, 221);
      doc.setLineWidth(Math.max(0.1, 0.5 * mmPerPx));
      const ruleY = yMm + (e.titleHeightPx || wrapped.length * lhPx) * mmPerPx;
      doc.line(x + indentMm, ruleY, x + w, ruleY);
    }

    // Advance by the CSS-authored height (authoritative — matches preview).
    yMm += (e.titleHeightPx || wrapped.length * lhPx) * mmPerPx
         + (e.marginBottomPx || 0) * mmPerPx;
    prevMarginBottomPx = e.marginBottomPx || 0; // for next entry's margin collapse
  }
  return yMm;
};

/**
 * Render an out-of-scope block (heading, table, list, …). Tables use the grid
 * engine; headings use their inline size; everything else degrades to a plain
 * justified-off text draw so no content silently vanishes.
 */
const drawPassthrough = (doc, desc, engineCtx, xMm, widthMm, yMm, mmPerPx,
                         baseFontPt, lineHeightMm, baseFontSizePx) => {
  const html = desc.outerHtml;
  const tag = desc.tag;

  // Chapter-title block: nested label + title divs, centered, each at its own
  // size. Must run before the generic div fallback (which flattens it to one
  // tiny left-aligned blob — the "CAPÍTULO 1UNA ANTORCHA…" bug).
  if (/data-chapter-start/.test(html)) {
    const ct = parseChapterTitle(html, baseFontSizePx);
    if (ct && ct.parts.length) {
      return drawChapterTitle(doc, ct, xMm, widthMm, yMm, mmPerPx, lineHeightMm);
    }
  }

  // Image (B2): draw the embedded/linked image at the engine-sized box.
  if (tag === 'IMG' || /^<img[\s>]/i.test(html)) {
    const src = (html.match(/\bsrc="([^"]+)"/i) || [])[1];
    const wPx = parseFloat((html.match(/width:\s*([\d.]+)px/i) || [])[1] || 0);
    const hPx = parseFloat((html.match(/height:\s*([\d.]+)px/i) || [])[1] || 0);
    if (src && wPx > 0 && hPx > 0) {
      const wMm = wPx * mmPerPx;
      const hMm = hPx * mmPerPx;
      // Center within the column (align was baked into the margin, but the PDF
      // draws from an x; center by default like the preview's margin:auto).
      const alignM = html.match(/margin:\s*[\d.]+em\s+(auto|0)/i);
      const imgX = alignM && alignM[1] === 'auto' ? xMm + (widthMm - wMm) / 2 : xMm;
      const topGapMm = lineHeightMm * 0.5; // matches the 0.5em top margin
      try {
        const fmt = /^data:image\/jpe?g/i.test(src) ? 'JPEG' : 'PNG';
        doc.addImage(src, fmt, imgX, yMm + topGapMm, wMm, hMm);
      } catch { /* unsupported src → skip rather than crash the export */ }
      return yMm + topGapMm + hMm + topGapMm;
    }
    // No usable dims → skip (don't fall through to a text draw of the tag).
    return yMm + lineHeightMm;
  }

  if (tag === 'TABLE' || /^<table[\s>]/i.test(html)) {
    const below = drawTable(doc, html, engineCtx, xMm, yMm, mmPerPx);
    if (below != null) return below;
    // fall through to plain-text if the table isn't native-layoutable
  }

  if (/^H[1-6]$/.test(tag)) {
    const h = parseHeadingFromHtml(html, tag, baseFontSizePx);
    doc.setFont('Gelasio', h.bold && h.italic ? 'bolditalic' : h.italic ? 'italic' : h.bold ? 'bold' : 'normal');
    doc.setFontSize(pxToPt(h.fontPx, mmPerPx));
    // Match the engine's block model EXACTLY (textLayoutEngine measureBlock):
    // height = marginTop + lineCount×lineHeightPx + marginBottom, with margins
    // from the element's OWN inline style and each line advancing by the BODY
    // lineHeightPx — NOT proportional to font size and with NO invented ×0.3/×0.4
    // padding. Inventing extra space here fabricated gap and drifted the body
    // down (the "huecote" the user measured with the grid).
    yMm += (h.marginTopPx || 0) * mmPerPx;
    const hBaseMm = baselineFromTopMm(lineHeightMm, h.fontPx * mmPerPx);
    const wrapped = doc.splitTextToSize(h.text, widthMm);
    const xPos = h.align === 'left' ? xMm : h.align === 'right' ? xMm + widthMm : xMm + widthMm / 2;
    for (const wl of wrapped) {
      doc.text(wl, xPos, yMm + hBaseMm, { align: h.align || 'center', baseline: 'alphabetic' });
      yMm += lineHeightMm;
    }
    return yMm + (h.marginBottomPx || 0) * mmPerPx;
  }

  if (tag === 'HR') {
    const hrY = yMm + lineHeightMm * 0.5;
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.2);
    doc.line(xMm, hrY, xMm + widthMm, hrY);
    return yMm + lineHeightMm;
  }

  // Generic fallback: draw the plain text left-aligned (lists, verse, entities).
  const text = collapseWhitespace(htmlToText(html)).trim();
  if (!text) return yMm;
  doc.setFont('Gelasio', 'normal');
  doc.setFontSize(baseFontPt);
  const wrapped = doc.splitTextToSize(text, widthMm);
  for (const wl of wrapped) {
    doc.text(wl, xMm, yMm + lineHeightMm * 0.78, { baseline: 'alphabetic' });
    yMm += lineHeightMm;
  }
  return yMm;
};
