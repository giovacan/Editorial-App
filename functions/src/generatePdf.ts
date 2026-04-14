import * as functions from 'firebase-functions';
import * as puppeteer from 'puppeteer';

interface PageData {
  html?: string;
  pageNumber?: number;
  isBlank?: boolean;
}

interface BookData {
  title?: string;
  bookType?: string;
  chapters?: Array<{ title: string; html: string }>;
}

interface Config {
  pageFormat?: string;
  showPageNumbers?: boolean;
  customPageFormat?: {
    width?: number;
    height?: number;
    unit?: string;
  };
}

interface Dims {
  pageWidthPx: number;
  pageHeightPx: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  fontSize: number;
  fontFamily: string;
  lineHeightPx: number;
  baseFontSize: number;
  effectiveContentHeight?: number;
}

const KDP_FORMATS: Record<string, { width: number; height: number; unit: string }> = {
  '5x8': { width: 5, height: 8, unit: 'inches' },
  '6x9': { width: 6, height: 9, unit: 'inches' },
  '8.5x11': { width: 8.5, height: 11, unit: 'inches' },
  'a4': { width: 210, height: 297, unit: 'mm' },
  'a5': { width: 148, height: 210, unit: 'mm' },
};

function getPageFormat(formatId: string) {
  return KDP_FORMATS[formatId] || KDP_FORMATS['6x9'];
}

export const generatePdf = functions.https.onCall(async (data: {
  bookData: BookData;
  config: Config;
  paginatedPages: PageData[];
  dims: Dims;
}, context) => {
  const { bookData, config, paginatedPages, dims } = data;

  if (!paginatedPages?.length || !dims) {
    throw new functions.https.HttpsError('invalid-argument', 'No hay páginas para exportar');
  }

  const pageFormat = getPageFormat(config?.pageFormat || '6x9');
  const toMM = (val: number, unit: string) => unit === 'inches' ? val * 25.4 : val;
  const W = toMM(pageFormat.width, pageFormat.unit);
  const H = toMM(pageFormat.height, pageFormat.unit);

  const {
    pageWidthPx,
    pageHeightPx,
    marginTop,
    marginRight,
    marginBottom,
    marginLeft,
    fontSize,
    fontFamily,
    lineHeightPx,
    baseFontSize,
    effectiveContentHeight,
  } = dims;

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
  } finally {
    await browser.close();
  }
});
