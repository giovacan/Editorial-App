"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePdf = void 0;
const functions = __importStar(require("firebase-functions"));
const puppeteer = __importStar(require("puppeteer"));
const KDP_FORMATS = {
    '5x8': { width: 5, height: 8, unit: 'inches' },
    '6x9': { width: 6, height: 9, unit: 'inches' },
    '8.5x11': { width: 8.5, height: 11, unit: 'inches' },
    'a4': { width: 210, height: 297, unit: 'mm' },
    'a5': { width: 148, height: 210, unit: 'mm' },
};
function getPageFormat(formatId) {
    return KDP_FORMATS[formatId] || KDP_FORMATS['6x9'];
}
exports.generatePdf = functions.https.onCall(async (data, context) => {
    const { bookData, config, paginatedPages, dims } = data;
    if (!paginatedPages?.length || !dims) {
        throw new functions.https.HttpsError('invalid-argument', 'No hay páginas para exportar');
    }
    const pageFormat = getPageFormat(config?.pageFormat || '6x9');
    const toMM = (val, unit) => unit === 'inches' ? val * 25.4 : val;
    const W = toMM(pageFormat.width, pageFormat.unit);
    const H = toMM(pageFormat.height, pageFormat.unit);
    const { pageWidthPx, pageHeightPx, marginTop, marginRight, marginBottom, marginLeft, fontSize, fontFamily, lineHeightPx, baseFontSize, effectiveContentHeight, } = dims;
    const bookTitle = bookData?.title || 'Libro';
    let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${bookTitle}</title>
  <style>
    @page {
      size: ${W}mm ${H}mm;
      margin: 0;
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
      hyphens: auto;
      position: relative;
      box-sizing: border-box;
      overflow: hidden;
      page-break-after: always;
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
        html += `<div class="print-page">\n`;
        if (!page.isBlank) {
            html += `  <div class="print-content">${page.html || ''}</div>\n`;
            if (page.pageNumber && config?.showPageNumbers !== false) {
                html += `  <span class="print-number">${page.pageNumber}</span>\n`;
            }
        }
        html += `</div>\n`;
    }
    html += `</body>\n</html>`;
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
        ],
    });
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdf = await page.pdf({
            width: `${W}mm`,
            height: `${H}mm`,
            printBackground: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
        });
        return {
            pdf: pdf.toString('base64'),
            filename: `${(bookData.title || 'libro').replace(/[^\w\sáéíóúñÁÉÍÓÚÑ.-]/g, '_')}.pdf`,
        };
    }
    finally {
        await browser.close();
    }
});
//# sourceMappingURL=generatePdf.js.map