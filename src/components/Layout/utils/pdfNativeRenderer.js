/**
 * pdfNativeRenderer — exports PDF using jsPDF text API directly.
 *
 * No html2canvas. Uses the same data as the preview (page.html, buildHeaderHtmlPure,
 * config, bookData) and draws text/lines natively into jsPDF.
 *
 * ~50–100× faster than html2canvas approach (no canvas rendering, no pixel scaling).
 * File sizes are also smaller (real vector text instead of JPEG images).
 *
 * Limitations vs html2canvas:
 *  - Custom fonts require loading TTF/OTF — currently mapped to jsPDF built-ins.
 *  - Inline images in content are not rendered.
 */

import { KDP_STANDARDS } from '../../../utils/kdpStandards';
import { buildHeaderHtmlPure } from '../../../hooks/useHeaderFooter';

// ── Font mapping ────────────────────────────────────────────────────────────
// Maps common CSS font-family names to jsPDF built-in fonts.
// jsPDF ships with: 'helvetica', 'times', 'courier' (each with normal/bold/italic/bolditalic).
const FONT_MAP = {
  // serif
  'garamond':         'times',
  'palatino':         'times',
  'palatino linotype': 'times',
  'times new roman':  'times',
  'times':            'times',
  'georgia':          'times',
  'book antiqua':     'times',
  'libre baskerville': 'times',
  'merriweather':     'times',
  'pt serif':         'times',
  // sans-serif
  'helvetica':        'helvetica',
  'arial':            'helvetica',
  'lato':             'helvetica',
  'open sans':        'helvetica',
  'roboto':           'helvetica',
  'montserrat':       'helvetica',
  'nunito':           'helvetica',
  'source sans pro':  'helvetica',
  'pt sans':          'helvetica',
  // mono
  'courier new':      'courier',
  'courier':          'courier',
  'mono':             'courier',
};

function mapFont(fontFamily) {
  if (!fontFamily) return 'times';
  const key = fontFamily.toLowerCase().split(',')[0].trim().replace(/['"]/g, '');
  return FONT_MAP[key] || 'times';
}

// ── CSS unit helpers ────────────────────────────────────────────────────────

/** Converts a CSS length value to mm. fontSizePt is needed to resolve em units. */
function cssToMm(value, fontSizePt) {
  if (!value || value === '0') return 0;
  const n = parseFloat(value);
  if (isNaN(n)) return 0;
  if (value.endsWith('em'))  return n * fontSizePt * (25.4 / 72);
  if (value.endsWith('rem')) return n * fontSizePt * (25.4 / 72);
  if (value.endsWith('pt'))  return n * (25.4 / 72);
  if (value.endsWith('px'))  return n * (25.4 / 96);
  if (value.endsWith('cm'))  return n * 10;
  if (value.endsWith('mm'))  return n;
  return 0;
}

/** Parses the `margin` shorthand (1–4 values) → { top, bottom } in mm. */
function parseMarginShorthand(value, fontSizePt) {
  const parts = (value || '').trim().split(/\s+/);
  if (parts.length === 1) {
    const v = cssToMm(parts[0], fontSizePt);
    return { top: v, bottom: v };
  }
  if (parts.length === 2) {
    return { top: cssToMm(parts[0], fontSizePt), bottom: cssToMm(parts[0], fontSizePt) };
  }
  // 3 or 4 values: top is [0], bottom is [2]
  return { top: cssToMm(parts[0], fontSizePt), bottom: cssToMm(parts[2], fontSizePt) };
}

/** Parses an inline style string into a normalized props object (values in mm or pt). */
function parseInlineStyle(styleStr, fontSizePt) {
  const props = {};
  if (!styleStr) return props;
  styleStr.split(';').forEach(part => {
    const colon = part.indexOf(':');
    if (colon < 0) return;
    const key = part.slice(0, colon).trim().toLowerCase();
    const val = part.slice(colon + 1).trim();
    if (!key || !val) return;
    props[key] = val;
  });

  return {
    textIndentMm:   cssToMm(props['text-indent']  || '0', fontSizePt),
    marginTopMm:    props['margin-top']
                      ? cssToMm(props['margin-top'], fontSizePt)
                      : props['margin']
                        ? parseMarginShorthand(props['margin'], fontSizePt).top
                        : 0,
    marginBottomMm: props['margin-bottom']
                      ? cssToMm(props['margin-bottom'], fontSizePt)
                      : props['margin']
                        ? parseMarginShorthand(props['margin'], fontSizePt).bottom
                        : 0,
    fontSizePt:     props['font-size']
                      ? (props['font-size'].endsWith('pt')
                          ? parseFloat(props['font-size'])
                          : cssToMm(props['font-size'], fontSizePt) * 72 / 25.4)
                      : null,
    fontWeight:     props['font-weight'] || null,
    fontStyle:      props['font-style']  || null,
    textAlign:      props['text-align']  || null,
  };
}

// ── HTML block parser ───────────────────────────────────────────────────────
// Converts page.html into a list of renderable block objects.
// fontSizePt is needed to resolve em units correctly.

function parseHtmlBlocks(html, fontSizePt) {
  if (!html) return [];
  const div = document.createElement('div');
  div.innerHTML = html;
  return extractBlocksFromNode(div, fontSizePt);
}

function extractBlocksFromNode(parent, fontSizePt) {
  const blocks = [];
  for (const node of parent.childNodes) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      const text = (node.textContent || '').trim();
      if (text) blocks.push({ type: 'p', text, textIndentMm: 0, marginTopMm: 0, marginBottomMm: 0 });
      continue;
    }
    const tag = node.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      const s = parseInlineStyle(node.getAttribute('style'), fontSizePt);
      blocks.push({
        type:           'h',
        level:          parseInt(tag[1]),
        text:           node.textContent.trim(),
        align:          s.textAlign || 'center',
        fontSizePt:     s.fontSizePt,                   // direct pt from inline style
        bold:           s.fontWeight !== 'normal',
        marginTopMm:    s.marginTopMm,
        marginBottomMm: s.marginBottomMm,
      });
    } else if (tag === 'p') {
      const s = parseInlineStyle(node.getAttribute('style'), fontSizePt);
      const text = extractText(node).trim();
      if (text) blocks.push({ type: 'p', text, textIndentMm: s.textIndentMm, marginTopMm: s.marginTopMm, marginBottomMm: s.marginBottomMm });
    } else if (tag === 'hr') {
      blocks.push({ type: 'hr' });
    } else {
      blocks.push(...extractBlocksFromNode(node, fontSizePt));
    }
  }
  return blocks;
}

// Extracts plain text (preserving spaces) from a node tree.
function extractText(node) {
  let out = '';
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent;
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = child.tagName.toLowerCase();
      // Treat <br> as a space separator
      if (tag === 'br') { out += ' '; continue; }
      out += extractText(child);
    }
  }
  return out;
}

// ── Header parser ───────────────────────────────────────────────────────────
// Extracts { left, center, right, showLine, lineStyle, lineColor, fontSizePct }
// from the HTML produced by buildHeaderHtml (3 <span> children of a flex <div>).

function parseHeaderHtml(html) {
  if (!html) return null;
  const div = document.createElement('div');
  div.innerHTML = html.trim();
  const wrapper = div.querySelector('div') || div;
  const spans = wrapper.querySelectorAll('span');
  if (!spans.length) {
    const text = wrapper.textContent.trim();
    return text ? { left: '', center: text, right: '', showLine: false } : null;
  }
  // buildHeaderHtml always generates exactly 3 spans: left [0], center [1], right [2]
  const left   = (spans[0]?.textContent || '').trim();
  const center = (spans[1]?.textContent || '').trim();
  const right  = (spans[2]?.textContent || '').trim();
  if (!left && !center && !right) return null;

  // Parse border-bottom from wrapper style (e.g. "1px solid black")
  const wStyle = wrapper.getAttribute('style') || '';
  const showLine = /border-bottom:[^;]+(?:solid|dashed|dotted)/.test(wStyle);
  const lineColor = (wStyle.match(/border-bottom:[^;]+\s(#[0-9a-fA-F]+|[a-z]+)/) || [])[1] || '#000000';

  return { left, center, right, showLine, lineColor };
}

// ── Block renderer ──────────────────────────────────────────────────────────

/**
 * Renders a single block onto the jsPDF document.
 * All spacing values on blocks are already in mm (resolved from CSS units by parseHtmlBlocks).
 * @returns {number} Updated yMm (top of next element)
 */
function renderBlock(doc, block, xMm, widthMm, yMm, fontName, fontSizePt, lineHeightMm) {
  if (block.type === 'hr') {
    const hrY = yMm + lineHeightMm * 0.5;
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.2);
    doc.line(xMm, hrY, xMm + widthMm, hrY);
    return yMm + lineHeightMm;
  }

  if (block.type === 'h') {
    yMm += block.marginTopMm || 0;
    // Use font-size from inline style if available, otherwise fall back to level scale
    const scale = block.fontSizePt
      ? block.fontSizePt / fontSizePt
      : ([0, 1.8, 1.5, 1.25, 1.1, 1.0, 1.0][block.level] ?? 1.3);
    const hPt   = block.fontSizePt || fontSizePt * scale;
    const hLineH = lineHeightMm * scale;
    const weight = block.bold !== false ? 'bold' : 'normal';
    doc.setFont(fontName, weight);
    doc.setFontSize(hPt);
    const align = block.align || 'center';
    const lines = doc.splitTextToSize(block.text, widthMm);
    const xPos  = align === 'left' ? xMm : align === 'right' ? xMm + widthMm : xMm + widthMm / 2;
    lines.forEach(line => {
      doc.text(line, xPos, yMm + hLineH * 0.75, { align });
      yMm += hLineH;
    });
    yMm += block.marginBottomMm || (hLineH * 0.4);
    return yMm;
  }

  if (block.type === 'p') {
    yMm += block.marginTopMm || 0;
    doc.setFont(fontName, 'normal');
    doc.setFontSize(fontSizePt);

    const text = block.text;
    if (!text) return yMm;

    const indentMm = Math.min(block.textIndentMm || 0, widthMm * 0.25);
    const baseline = lineHeightMm * 0.75;

    if (indentMm > 0) {
      // First line indented (standard book paragraph)
      const allLines = doc.splitTextToSize(text, widthMm);
      const [firstLine, ...restLines] = allLines;
      doc.text(firstLine || '', xMm + indentMm, yMm + baseline);
      yMm += lineHeightMm;
      renderJustifiedLines(doc, restLines, xMm, yMm, widthMm, lineHeightMm, baseline);
      yMm += restLines.length * lineHeightMm;
    } else {
      const allLines = doc.splitTextToSize(text, widthMm);
      renderJustifiedLines(doc, allLines, xMm, yMm, widthMm, lineHeightMm, baseline);
      yMm += allLines.length * lineHeightMm;
    }

    yMm += block.marginBottomMm || 0;
    return yMm;
  }

  return yMm;
}

/**
 * Renders lines with justify (all but last), last line left-aligned.
 */
function renderJustifiedLines(doc, lines, xMm, yMm, widthMm, lineHeightMm, baseline) {
  lines.forEach((line, i) => {
    const isLast = i === lines.length - 1;
    if (isLast || lines.length === 1) {
      doc.text(line, xMm, yMm + baseline);
    } else {
      doc.text(line, xMm, yMm + baseline, { align: 'justify', maxWidth: widthMm });
    }
    yMm += lineHeightMm;
  });
}

// ── Main export function ────────────────────────────────────────────────────

/**
 * Exports the book as a PDF using jsPDF native text rendering.
 * No html2canvas — draws text directly using jsPDF API.
 * ~50–100× faster than the canvas-based approach.
 *
 * @param {object}   bookData
 * @param {object}   config
 * @param {Array}    paginatedPages
 * @param {object}   dims            – {pageWidthPx, pageHeightPx, marginTop, marginRight,
 *                                       marginBottom, marginLeft, previewScale, baseFontSize}
 * @param {Function} [onProgress]
 */
export const exportPdfNative = async (bookData, config, paginatedPages, dims, onProgress) => {
  if (!paginatedPages?.length || !dims) {
    alert('No hay páginas para exportar. Abre la Vista previa primero.');
    return;
  }

  const bookConfig = KDP_STANDARDS.getBookTypeConfig(bookData?.bookType || 'novela');
  const formatId   = config?.pageFormat || bookConfig?.recommendedFormat || '6x9';
  const pageFormat = KDP_STANDARDS.getPageFormat(formatId);

  if (!pageFormat) {
    alert('Formato de página no reconocido: ' + formatId);
    return;
  }

  const { jsPDF } = await import('jspdf');

  // ── Dimensions in mm ───────────────────────────────────────────────────────
  const toMM = (val, unit) => unit === 'inches' ? val * 25.4 : val;
  const W = toMM(pageFormat.width,  pageFormat.unit); // page width in mm
  const H = toMM(pageFormat.height, pageFormat.unit); // page height in mm

  const {
    pageWidthPx, pageHeightPx,
    marginTop, marginRight, marginBottom, marginLeft,
    previewScale = 0.42,
    baseFontSize,
  } = dims;

  const mmPerPx = W / pageWidthPx; // conversion factor: px@previewScale → mm

  const marginTopMm    = marginTop    * mmPerPx;
  const marginBottomMm = marginBottom * mmPerPx;
  const marginLeftMm   = marginLeft   * mmPerPx;
  const marginRightMm  = marginRight  * mmPerPx;
  const contentWidthMm = W - marginLeftMm - marginRightMm;
  const contentStartY  = marginTopMm;

  // Font & line height from config (real pt values, not scaled)
  const fontSizePt      = config?.fontSize      || bookConfig?.fontSize      || 11;
  const lineHeightFactor = config?.lineHeight   || bookConfig?.lineHeight    || 1.5;
  const fontFamilyStr   = config?.fontFamily    || bookConfig?.fontFamily    || 'Times New Roman';
  const fontName        = mapFont(fontFamilyStr);
  const lineHeightMm    = (fontSizePt / 72) * 25.4 * lineHeightFactor;

  // Header font size (baseFontSize is scaledFontPt = fontSizePt * previewScale;
  // we need to undo the scale to get the real pt value)
  const headerFontSizePct = config?.header?.fontSize || 70;
  const headerFontSizePt  = fontSizePt * (headerFontSizePct / 100);
  const headerLineH       = (headerFontSizePt / 72) * 25.4 * lineHeightFactor;

  // ── Create document ────────────────────────────────────────────────────────
  const doc = new jsPDF({
    unit:        'mm',
    format:      [W, H],
    orientation: 'portrait',
    compress:    true,
  });

  const bookTitle = bookData?.title || '';
  const total     = paginatedPages.length;

  // ── Render pages ───────────────────────────────────────────────────────────
  for (let i = 0; i < total; i++) {
    if (i > 0) doc.addPage([W, H], 'portrait');

    const page = paginatedPages[i];
    let yMm = contentStartY;

    if (!page.isBlank) {
      // ── Header ────────────────────────────────────────────────────────────
      const headerHtml = buildHeaderHtmlPure(page, config, bookTitle, baseFontSize);
      const header     = parseHeaderHtml(headerHtml);
      if (header) {
        doc.setFont(fontName, 'normal');
        doc.setFontSize(headerFontSizePt);
        const baselineY = yMm + headerLineH * 0.75;
        if (header.left)   doc.text(header.left,   marginLeftMm,                                      baselineY, { align: 'left'   });
        if (header.center) doc.text(header.center, marginLeftMm + contentWidthMm / 2,                  baselineY, { align: 'center' });
        if (header.right)  doc.text(header.right,  marginLeftMm + contentWidthMm,                      baselineY, { align: 'right'  });
        yMm += headerLineH;
        if (header.showLine) {
          const lineColorHex = header.lineColor || '#000000';
          // Parse hex color → R,G,B
          const r = parseInt(lineColorHex.slice(1,3) || 'AA', 16);
          const g = parseInt(lineColorHex.slice(3,5) || 'AA', 16);
          const b = parseInt(lineColorHex.slice(5,7) || 'AA', 16);
          doc.setDrawColor(r, g, b);
          doc.setLineWidth(0.2);
          doc.line(marginLeftMm, yMm, marginLeftMm + contentWidthMm, yMm);
        }
        yMm += headerLineH * 0.4; // gap below header (≈ 0.5em)
      }

      // ── Content blocks ────────────────────────────────────────────────────
      const blocks = parseHtmlBlocks(page.html || '', fontSizePt);
      for (const block of blocks) {
        yMm = renderBlock(doc, block, marginLeftMm, contentWidthMm, yMm,
                          fontName, fontSizePt, lineHeightMm);
      }
    }

    // ── Page number ──────────────────────────────────────────────────────────
    if (page.pageNumber && !page.isBlank && config?.showPageNumbers !== false) {
      doc.setFont(fontName, 'normal');
      doc.setFontSize(fontSizePt * 0.8);
      const pageNumY = H - marginBottomMm * 0.4;
      doc.text(String(page.pageNumber), marginLeftMm + contentWidthMm / 2, pageNumY, { align: 'center' });
    }

    onProgress?.(i + 1, total);

    // Yield every 20 pages to keep UI spinner responsive
    if (i % 20 === 0 && i > 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  const safeTitle = (bookData?.title || 'libro').replace(/[^\w\sáéíóúñÁÉÍÓÚÑ.-]/g, '_');
  doc.save(`${safeTitle}.pdf`);
};
