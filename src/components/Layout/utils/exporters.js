import { KDP_STANDARDS } from '../../../utils/kdpStandards';
import { buildHeaderHtmlPure } from '../../../hooks/useHeaderFooter';
import { toast } from '../../../utils/toast';

/**
 * Creates a minimal ZIP file from an array of { name, content } entries.
 */
export const createSimpleZip = (files) => {
  const parts = [];
  let totalSize = 0;

  files.forEach(file => {
    const data = new TextEncoder().encode(file.content);
    parts.push({ name: file.name, data });
    totalSize += 30 + file.name.length + data.length;
  });

  const zip = new Uint8Array(totalSize + 1000);
  const view = new DataView(zip.buffer);
  let offset = 0;

  const writeUint32 = (val) => { view.setUint32(offset, val); offset += 4; };
  const writeUint16 = (val) => { view.setUint16(offset, val); offset += 2; };
  const writeString = (str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset++, str.charCodeAt(i));
    }
  };

  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[i] = c;
  }

  const crc32 = (data) => {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  };

  const localHeaders = [];
  const localData = [];

  parts.forEach(part => {
    localHeaders.push(offset);
    writeString('PK\x03\x04');
    writeUint16(20); writeUint16(0); writeUint16(0);
    writeUint16(0); writeUint16(0); writeUint16(0); writeUint16(0);
    writeUint32(0);
    const crc = crc32(part.data);
    writeUint32(crc);
    writeUint32(part.data.length);
    writeUint32(part.data.length);
    writeUint16(part.name.length);
    writeUint16(0);
    writeString(part.name);
    localData.push({ start: offset, size: part.data.length, crc });
    for (let i = 0; i < part.data.length; i++) {
      view.setUint8(offset++, part.data[i]);
    }
  });

  const centralDirStart = offset;
  parts.forEach((part, i) => {
    writeString('PK\x01\x02');
    writeUint16(20); writeUint16(20); writeUint16(0); writeUint16(0);
    writeUint16(0); writeUint16(0); writeUint16(0); writeUint16(0); writeUint16(0);
    writeUint32(localData[i].crc);
    writeUint32(localData[i].size);
    writeUint32(localData[i].size);
    writeUint16(part.name.length);
    writeUint16(0); writeUint32(0); writeUint32(0);
    writeString(part.name);
  });

  const centralDirEnd = offset;
  writeString('PK\x05\x06');
  writeUint16(0); writeUint16(0);
  writeUint16(parts.length); writeUint16(parts.length);
  writeUint32(centralDirEnd - centralDirStart);
  writeUint32(centralDirStart);
  writeUint16(0);

  return zip.slice(0, offset);
};

/**
 * Triggers a file download in the browser.
 */
const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * Export book as PDF using html2canvas + jsPDF.
 *
 * Renders each paginatedPage div (at previewScale) to a canvas, then
 * assembles a jsPDF at the correct book dimensions in mm.
 * Direct download — no print dialog.
 *
 * @param {object}   bookData
 * @param {object}   config
 * @param {Array}    paginatedPages  - Pages from usePagination (at previewScale)
 * @param {object}   dims            - { pageWidthPx, pageHeightPx, marginTop, marginRight,
 *                                       marginBottom, marginLeft, fontSize, fontFamily,
 *                                       lineHeightPx, previewScale }
 * @param {Function} onProgress      - (current, total) callback for progress updates
 * @param {string}  [quality]       - 'fast' (~80 DPI) | 'print' (~220 DPI, default)
 */
export const exportPdf = async (bookData, config, paginatedPages, dims, onProgress, quality = 'print') => {
  if (!paginatedPages?.length || !dims) {
    toast.error('No hay páginas para exportar. Abre la Vista previa primero.');
    return;
  }

  const bookConfig = KDP_STANDARDS.getBookTypeConfig(bookData?.bookType || 'novela');
  const formatId   = config?.pageFormat || bookConfig?.recommendedFormat || '6x9';
  const pageFormat = KDP_STANDARDS.getPageFormat(formatId);

  if (!pageFormat) {
    toast.error('Formato de página no reconocido: ' + formatId);
    return;
  }

  let jsPDFModule, html2canvasModule;
  try {
    [jsPDFModule, html2canvasModule] = await Promise.all([
      import('jspdf'),
      import('html2canvas'),
    ]);
  } catch (err) {
    toast.error('Error cargando dependencias PDF: ' + err.message);
    return;
  }
  const { jsPDF } = jsPDFModule;
  const html2canvas = html2canvasModule.default;

  const toMM = (val, unit) => unit === 'inches' ? val * 25.4 : val;
  const W = toMM(pageFormat.width,  pageFormat.unit);
  const H = toMM(pageFormat.height, pageFormat.unit);

  const {
    pageWidthPx, pageHeightPx,
    marginTop, marginRight, marginBottom, marginLeft,
    fontSize, fontFamily, lineHeightPx,
    baseFontSize,
    previewScale = 0.42,
  } = dims;

  const TARGET_DPI   = quality === 'fast' ? 80 : quality === 'high' ? 300 : 220;
  const CANVAS_SCALE = (TARGET_DPI / 96) * (1 / previewScale);
  // Example A5 (previewScale=0.42): fast → 1.98×, print → 5.46×, high → 7.44×

  const doc = new jsPDF({
    unit: 'mm',
    format: [W, H],
    orientation: 'portrait',
    compress: true,
  });

  // Off-screen render container — position:absolute below page content
  // (position:fixed confuses html2canvas scroll-offset logic)
  const container = document.createElement('div');
  container.setAttribute('aria-hidden', 'true');
  container.style.cssText = [
    'position:absolute',
    'left:0',
    `top:${document.documentElement.scrollHeight + 2000}px`,
    `width:${pageWidthPx}px`,
    'pointer-events:none',
    'z-index:-1',
  ].join(';');
  document.body.appendChild(container);

  const bookTitle = bookData?.title || '';
  const pageBaseStyle = [
    `width:${pageWidthPx}px`,
    `height:${pageHeightPx}px`,
    'background:#fff',
    'color:#000',
    'box-sizing:border-box',
    `padding:${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px`,
    `font-size:${fontSize}px`,
    `font-family:${fontFamily}`,
    `line-height:${lineHeightPx}px`,
    'text-align:justify',
    'text-justify:inter-word',
    'word-break:break-word',
    'overflow-wrap:break-word',
    'overflow:hidden',
    'hyphens:none',
    'position:relative',
  ].join(';');

  // Build a single page's DOM element (does not append to DOM)
  const buildPageDiv = (page) => {
    const headerHtml = buildHeaderHtmlPure(page, config, bookTitle, baseFontSize);
    const pageDiv = document.createElement('div');
    pageDiv.style.cssText = pageBaseStyle;

    if (headerHtml) {
      const headerDiv = document.createElement('div');
      headerDiv.style.cssText = 'margin-bottom:0.5em;';
      headerDiv.innerHTML = headerHtml;
      pageDiv.appendChild(headerDiv);
    }

    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = `height:${dims.effectiveContentHeight ?? (pageHeightPx - marginTop - marginBottom)}px;overflow:hidden;`;
    contentDiv.innerHTML = page.html || '';
    pageDiv.appendChild(contentDiv);

    if (page.pageNumber && !page.isBlank && config?.showPageNumbers !== false) {
      const numSpan = document.createElement('span');
      numSpan.style.cssText = `position:absolute;bottom:${marginBottom * 0.4}px;left:50%;transform:translateX(-50%);font-size:${fontSize * 0.8}px;color:#333;`;
      numSpan.textContent = String(page.pageNumber);
      pageDiv.appendChild(numSpan);
    }

    return pageDiv;
  };

  const h2cOptions = {
    scale: CANVAS_SCALE,
    useCORS: true,
    allowTaint: false,
    backgroundColor: '#ffffff',
    width: pageWidthPx,
    height: pageHeightPx,
    logging: false,
    scrollX: 0,
    scrollY: 0,
    imageTimeout: 0,
    removeDOM: true,
    onclone: (clonedDoc, clone) => {
      clone.style.visibility = 'hidden';
    },
  };

  // Render pages in parallel batches to maximise throughput.
  // CONCURRENCY = 3 keeps peak canvas memory to ~28 MB (220 DPI) / ~52 MB (300 DPI).
  const CONCURRENCY = 3;
  const total = paginatedPages.length;

  try {
    for (let i = 0; i < total; i += CONCURRENCY) {
      const batch = paginatedPages.slice(i, Math.min(i + CONCURRENCY, total));

      // Attach all batch divs to the off-screen container
      const divs = batch.map((page) => {
        const div = buildPageDiv(page);
        container.appendChild(div);
        return div;
      });

      // Render batch in parallel
      const canvases = await Promise.all(divs.map((div) => html2canvas(div, h2cOptions)));

      // Add pages to PDF in order
      canvases.forEach((canvas, j) => {
        const pageIdx = i + j;
        if (pageIdx > 0) doc.addPage([W, H], 'portrait');
        doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, W, H);
      });

      // Clean up batch divs before next batch
      divs.forEach((div) => container.removeChild(div));

      onProgress?.(Math.min(i + CONCURRENCY, total), total);

      // Yield once per batch so the spinner stays responsive
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  } finally {
    document.body.removeChild(container);
  }

  const safeTitle = (bookData.title || 'libro').replace(/[^\w\sáéíóúñÁÉÍÓÚÑ.-]/g, '_');
  doc.save(`${safeTitle}.pdf`);
};

/**
 * Export book as ePub
 */
export const exportEpub = (bookData) => {
  const title = bookData.title || 'Sin título';
  const author = bookData.author || 'Autor desconocido';
  const uid = 'urn:uid:' + Date.now();

  const chaptersHtml = bookData.chapters.map((ch, i) =>
    `    <item id="chapter${i}" href="chapter${i}.xhtml" media-type="application/xhtml+xml"/>`
  ).join('\n');

  const spineHtml = bookData.chapters.map((ch, i) =>
    `    <itemref idref="chapter${i}"/>`
  ).join('\n');

  const chaptersContent = bookData.chapters.map((ch) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${ch.title}</title></head>
<body>
  <section>
    <h2>${ch.title}</h2>
    ${ch.html}
  </section>
</body>
</html>`);

  const packageOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    <dc:language>es</dc:language>
    <dc:identifier id="bookid">${uid}</dc:identifier>
    <meta property="dcterms:modified">${new Date().toISOString().split('T')[0]}T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="toc"/>
${chaptersHtml}
  </manifest>
  <spine>
${spineHtml}
  </spine>
</package>`;

  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Tabla de contenidos</title></head>
<body>
  <nav epub:type="toc">
    <h1>Tabla de contenidos</h1>
    <ol>
${bookData.chapters.map((ch, i) => `      <li><a href="chapter${i}.xhtml">${ch.title}</a></li>`).join('\n')}
    </ol>
  </nav>
</body>
</html>`;

  const tocXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${title}</title></head>
<body>
  <h1>${title}</h1>
  <p>Por ${author}</p>
</body>
</html>`;

  const files = [
    { name: 'mimetype', content: 'application/epub+zip' },
    { name: 'META-INF/container.xml', content: '<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n  <rootfiles>\n    <rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/>\n  </rootfiles>\n</container>' },
    { name: 'OEBPS/package.opf', content: packageOpf },
    { name: 'OEBPS/nav.xhtml', content: navXhtml },
    { name: 'OEBPS/toc.xhtml', content: tocXhtml },
    ...bookData.chapters.map((ch, i) => ({ name: `OEBPS/chapter${i}.xhtml`, content: chaptersContent[i] }))
  ];

  try {
    const zip = createSimpleZip(files);
    downloadBlob(new Blob([zip], { type: 'application/epub+zip' }), `${title.replace(/[^a-z0-9]/gi, '_')}.epub`);
  } catch (error) {
    toast.error('Error al generar EPUB: ' + error.message);
  }
};

/**
 * Export book as HTML
 */
export const exportHtml = (bookData) => {
  let html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${bookData.title || 'Sin título'}</title>
</head>
<body>
    <h1>${bookData.title || 'Sin título'}</h1>
`;

  bookData.chapters.forEach(chapter => {
    html += `
    <section>
        <h2>${chapter.title}</h2>
        ${chapter.html}
    </section>
`;
  });

  html += `\n</body>\n</html>`;

  downloadBlob(new Blob([html], { type: 'text/html' }), `libro-${Date.now()}.html`);
};

/**
 * Export PDF using window.print() - fast and faithful to preview.
 * Uses browser's native print dialog which renders HTML exactly like the preview.
 */
export const exportPdfPrint = async (bookData, config, paginatedPages, dims, onProgress) => {
  if (!paginatedPages?.length || !dims) {
    toast.error('No hay páginas para exportar. Abre la Vista previa primero.');
    return;
  }

  const bookConfig = KDP_STANDARDS.getBookTypeConfig(bookData?.bookType || 'novela');
  const formatId   = config?.pageFormat || bookConfig?.recommendedFormat || '6x9';
  const pageFormat = KDP_STANDARDS.getPageFormat(formatId);

  if (!pageFormat) {
    toast.error('Formato de página no reconocido: ' + formatId);
    return;
  }

  const { pageWidthPx, pageHeightPx, marginTop, marginRight, marginBottom, marginLeft, fontSize, fontFamily, lineHeightPx, previewScale = 0.42, baseFontSize, effectiveContentHeight } = dims;

  const W = pageFormat.width;
  const H = pageFormat.height;
  const unit = pageFormat.unit || 'in';
  const toMM = (val, u) => u === 'inches' ? val * 25.4 : val;
  const Wmm = toMM(W, unit);
  const Hmm = toMM(H, unit);
  const widthInches = Wmm / 25.4;
  const heightInches = Hmm / 25.4;

  const pageBaseStyle = [
    `width:${pageWidthPx}px`,
    `height:${pageHeightPx}px`,
    'background:#fff',
    'color:#000',
    'box-sizing:border-box',
    `padding:${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px`,
    `font-size:${fontSize}px`,
    `font-family:${fontFamily}`,
    `line-height:${lineHeightPx}px`,
    'text-align:justify',
    'text-justify:inter-word',
    'word-break:break-word',
    'overflow-wrap:break-word',
    'overflow:hidden',
    'hyphens:none',
    'position:relative',
    'page-break-after:always',
    'break-after:always',
  ].join(';');

  const headerStyle = 'margin-bottom:0.5em;';
  const numStyle = `position:absolute;bottom:${marginBottom * 0.4}px;left:50%;transform:translateX(-50%);font-size:${fontSize * 0.8}px;color:#333;`;

  const bookTitle = bookData?.title || '';

  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${bookData?.title || 'Libro'}</title>
  <style>
    @page {
      size: ${widthInches}in ${heightInches}in;
      margin: 0;
    }
    @media print {
      body { margin: 0 !important; }
      .print-page { break-after: page; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: ${fontFamily};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .print-page {
      width: ${pageWidthPx}px;
      height: ${pageHeightPx}px;
      background: #fff;
      color: #000;
      padding: ${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px;
      font-size: ${fontSize}px;
      line-height: ${lineHeightPx}px;
      text-align: justify;
      text-justify: inter-word;
      word-break: break-word;
      overflow-wrap: break-word;
      hyphens: none;
      position: relative;
      box-sizing: border-box;
      overflow: hidden;
    }
    .print-header { margin-bottom: 0.5em; }
    .print-content { height: ${effectiveContentHeight ?? (pageHeightPx - marginTop - marginBottom)}px; overflow: hidden; }
    .print-number { position: absolute; bottom: ${marginBottom * 0.4}px; left: 50%; transform: translateX(-50%); font-size: ${fontSize * 0.8}px; color: #333; }
  </style>
</head>
<body>
`;

  const total = paginatedPages.length;
  for (let i = 0; i < total; i++) {
    const page = paginatedPages[i];
    
    if (i > 0) {
      html += `<div class="print-page">\n`;
    } else {
      html += `<div class="print-page">\n`;
    }

    if (!page.isBlank) {
      const headerHtml = buildHeaderHtmlPure(page, config, bookTitle, baseFontSize);
      if (headerHtml) {
        html += `  <div class="print-header">${headerHtml}</div>\n`;
      }

      html += `  <div class="print-content">${page.html || ''}</div>\n`;

      if (page.pageNumber && config?.showPageNumbers !== false) {
        html += `  <span class="print-number">${page.pageNumber}</span>\n`;
      }
    }

    html += `</div>\n`;
    onProgress?.(i + 1, total);
  }

  html += `</body>\n</html>`;

  const safeTitle = (bookData?.title || 'libro').replace(/[^\w\sáéíóúñÁÉÍÓÚÑ.-]/g, '_');
  const blob = new Blob([html], { type: 'text/html' });
  downloadBlob(blob, `${safeTitle}_print.html`);
};
