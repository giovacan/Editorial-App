/**
 * PDF EXPORTER — Exportación directa con jsPDF
 * ==============================================
 *
 * Genera un PDF real con dimensiones KDP exactas directamente en el
 * navegador usando jsPDF. No requiere backend ni intervención del usuario.
 *
 * Unidades internas de jsPDF: puntos (pt). 1 pt = 1/72 in = 0.3528 mm.
 * Conversión: mm → pt = mm * (72 / 25.4)
 */

class PdfExporter {

    constructor(kdpStandards) {
        this.kdp = kdpStandards;
        this.MM_TO_PT = 72 / 25.4;
        this.IN_TO_PT = 72;
    }

    // ================================================================
    // ENTRADA PRINCIPAL
    // ================================================================

    generate(chapters, bookType = 'novela', pageFormat = '6x9', meta = {}, appState = null) {
        if (!chapters || chapters.length === 0) {
            throw new Error('No hay capítulos para exportar.');
        }

        if (!window.jspdf && !window.jsPDF) {
            throw new Error('jsPDF no cargado. Verifica tu conexión a internet.');
        }

        const bookConfig   = this.kdp.bookTypes[bookType]   || this.kdp.bookTypes['novela'];
        const formatConfig = this.kdp.pageFormats[pageFormat] || this.kdp.pageFormats['6x9'];

        // Dimensiones de página en pt
        const pageW = formatConfig.width  * this.MM_TO_PT;
        const pageH = formatConfig.height * this.MM_TO_PT;

        // Márgenes en pt (bookConfig usa pulgadas)
        // Usamos márgenes fijos (sin espejo) para que el PDF coincida con el preview.
        // El gutter se suma a ambos lados por igual para mantener área de texto consistente.
        const mTop    = bookConfig.marginTop    * this.IN_TO_PT;
        const mBottom = bookConfig.marginBottom * this.IN_TO_PT;
        const mLeft   = (bookConfig.marginLeft + (bookConfig.gutter || 0)) * this.IN_TO_PT;
        const mRight  = bookConfig.marginRight  * this.IN_TO_PT;

        // Área de contenido — fija para todas las páginas
        const contentW = pageW - mLeft - mRight;
        const contentH = pageH - mTop - mBottom;

        // Fuente y tamaño
        const fontSize   = bookConfig.fontSize;       // pt
        const lineHeightFactor = bookConfig.lineHeight; // ej: 1.5
        const lineH      = fontSize * lineHeightFactor; // pt entre líneas
        const indentPt   = bookConfig.indent > 0 ? bookConfig.indent * this.IN_TO_PT : 0;

        const JsPDF = window.jspdf?.jsPDF || window.jsPDF;
        const doc = new JsPDF({
            unit:        'pt',
            format:      [pageW, pageH],
            orientation: pageW < pageH ? 'portrait' : 'landscape',
            compress:     true,
        });

        // jsPDF usa fuentes embebidas (Helvetica, Times, Courier)
        // Mapear fuentes KDP a las disponibles en jsPDF
        const fontName = bookConfig.fontFamily.toLowerCase().includes('times')   ? 'times'
                       : bookConfig.fontFamily.toLowerCase().includes('courier')  ? 'courier'
                       : bookConfig.fontFamily.toLowerCase().includes('arial')    ? 'helvetica'
                       : bookConfig.fontFamily.toLowerCase().includes('helvetica')? 'helvetica'
                       : 'times'; // Georgia → times (más parecido serif)

        doc.setFont(fontName, 'normal');
        doc.setFontSize(fontSize);

        let currentPage = 1;
        let y = mTop; // cursor vertical
        let currentChapterTitle = ''; // para drawHeader en saltos de página internos
        let onPageAdded = null; // callback invocado después de cada addPage interno

        // ================================================================
        // Helpers
        // ================================================================

        const addPage = (side = 'any', internal = false) => {
            doc.addPage([pageW, pageH]);
            currentPage++;
            y = mTop;

            // Si se pide página derecha (impar) y caemos en par, añadir una en blanco más
            if (side === 'right' && currentPage % 2 === 0) {
                doc.addPage([pageW, pageH]);
                currentPage++;
            }

            // En saltos internos, ejecutar callback (dibujar encabezado)
            if (internal && onPageAdded) onPageAdded();
        };

        const pageMarginLeft = () => mLeft; // margen fijo igual para todas las páginas

        const drawPageNumber = () => {
            const showNums = appState?.config?.showPageNumbers !== false;
            if (!showNums) return;

            const numSize  = 9;
            const numPos   = appState?.config?.pageNumberPos  || 'bottom';
            const numAlign = appState?.config?.pageNumberAlign || 'center';

            doc.setFontSize(numSize);
            doc.setFont(fontName, 'normal');

            const numStr = String(currentPage);
            const numW   = doc.getTextWidth(numStr);

            // Posición Y
            const numY = numPos === 'top'
                ? mTop * 0.6
                : pageH - mBottom * 0.45;

            // Posición X según alineación
            let numX;
            if (numAlign === 'left') {
                numX = mLeft;
            } else if (numAlign === 'right') {
                numX = mLeft + contentW - numW;
            } else if (numAlign === 'outer') {
                // par → izquierda exterior, impar → derecha exterior
                numX = currentPage % 2 === 0
                    ? mLeft
                    : mLeft + contentW - numW;
            } else {
                // center
                numX = mLeft + (contentW - numW) / 2;
            }

            doc.text(numStr, numX, numY);
            doc.setFontSize(fontSize);
        };

        const drawHeader = (chapterTitle) => {
            if (!appState?.config?.showHeaders) return;

            const pos     = appState?.config?.headerPosition || 'top';
            const content = appState?.config?.headerContent  || 'both';
            const hasLine = appState?.config?.headerLine !== false;
            const bookTitle = meta.title || '';

            let text = '';
            if (content === 'title') {
                text = bookTitle;
            } else if (content === 'chapter') {
                text = chapterTitle || '';
            } else {
                // 'both': par → título del libro, impar → título del capítulo
                text = currentPage % 2 === 0 ? bookTitle : (chapterTitle || '');
            }

            if (!text) return;

            const hSize = 8;
            doc.setFontSize(hSize);
            doc.setFont(fontName, 'italic');

            const hY = pos === 'top'
                ? mTop * 0.6
                : pageH - mBottom * 0.6;

            // Truncar si es muy largo para el ancho disponible
            const lines = doc.splitTextToSize(text, contentW);
            const displayText = lines[0] || text;
            const tw = doc.getTextWidth(displayText);
            const hX = mLeft + (contentW - tw) / 2;
            doc.text(displayText, hX, hY);

            if (hasLine) {
                const lineY = pos === 'top'
                    ? mTop * 0.75
                    : pageH - mBottom * 0.75;
                doc.setDrawColor(180);
                doc.line(mLeft, lineY, mLeft + contentW, lineY);
                doc.setDrawColor(0);
            }

            doc.setFont(fontName, 'normal');
            doc.setFontSize(fontSize);
        };

        // Extraer bloques de HTML preservando formato inline (bold/italic)
        // Cada bloque tiene: { type, runs }
        // runs = array de { text, bold, italic }
        const parseInlineRuns = (el) => {
            const runs = [];
            const walk = (node, bold, italic) => {
                if (node.nodeType === Node.TEXT_NODE) {
                    const t = node.textContent;
                    if (t) runs.push({ text: t, bold, italic });
                    return;
                }
                if (node.nodeType !== Node.ELEMENT_NODE) return;
                const tag = node.tagName;
                const isBold   = bold   || tag === 'STRONG' || tag === 'B';
                const isItalic = italic || tag === 'EM'     || tag === 'I';
                for (const child of node.childNodes) {
                    walk(child, isBold, isItalic);
                }
            };
            walk(el, false, false);
            // Colapsar runs consecutivos con iguales atributos
            const merged = [];
            for (const r of runs) {
                const last = merged[merged.length - 1];
                if (last && last.bold === r.bold && last.italic === r.italic) {
                    last.text += r.text;
                } else {
                    merged.push({ ...r });
                }
            }
            return merged;
        };

        const htmlToBlocks = (html) => {
            const tmp = document.createElement('div');
            tmp.innerHTML = html || '';
            const blocks = [];
            tmp.querySelectorAll('p, h1, h2, h3, h4, li, hr').forEach(el => {
                const tag = el.tagName;
                if (tag === 'HR') { blocks.push({ type: 'hr' }); return; }
                const runs = parseInlineRuns(el);
                const plainText = runs.map(r => r.text).join('').trim();
                if (!plainText) return;
                if (tag === 'H1' || tag === 'H2') blocks.push({ type: 'h2', runs, text: plainText });
                else if (tag === 'H3' || tag === 'H4') blocks.push({ type: 'h3', runs, text: plainText });
                else if (tag === 'LI') blocks.push({ type: 'li', runs, text: plainText });
                else blocks.push({ type: 'p', runs, text: plainText });
            });
            // Si no hay bloques estructurados, usar texto plano
            if (blocks.length === 0 && tmp.innerText?.trim()) {
                tmp.innerText.split('\n').filter(l => l.trim()).forEach(line => {
                    blocks.push({ type: 'p', runs: [{ text: line.trim(), bold: false, italic: false }], text: line.trim() });
                });
            }
            return blocks;
        };

        // Escribe runs (bold/italic mixtos) con word-wrap, justificación y salto de página.
        // firstLineIndent: sangría solo en la primera línea (como CSS text-indent).
        // Las líneas siguientes del mismo párrafo van al margen izquierdo normal.
        const writeRuns = (runs, opts = {}) => {
            const { size = fontSize, firstLineIndent = 0, center = false, justify = true,
                    boldAll = false, italicAll = false } = opts;
            const lh = size * lineHeightFactor;

            const fullText = runs.map(r => r.text).join('');
            if (!fullText.trim()) return;

            // La primera línea usa firstLineIndent; las demás usan el ancho completo
            const firstLineW = contentW - firstLineIndent;
            doc.setFont(fontName, 'normal');
            doc.setFontSize(size);

            // Calcular las líneas manualmente: primera línea más angosta (por el indent),
            // las demás con ancho completo
            const allLines = [];
            if (firstLineIndent > 0) {
                const firstLines = doc.splitTextToSize(fullText, firstLineW);
                const firstLine  = firstLines[0];
                allLines.push({ text: firstLine, indent: firstLineIndent });
                if (firstLine.length < fullText.length) {
                    // El resto del texto va con ancho completo
                    let rest = fullText.slice(firstLine.length);
                    if (rest[0] === ' ') rest = rest.slice(1); // espacio consumido
                    const restLines = doc.splitTextToSize(rest, contentW);
                    restLines.forEach(l => allLines.push({ text: l, indent: 0 }));
                }
            } else {
                const lines = doc.splitTextToSize(fullText, contentW);
                lines.forEach(l => allLines.push({ text: l, indent: 0 }));
            }

            // globalPos rastrea dónde estamos en fullText
            let globalPos = 0;

            for (let lineIdx = 0; lineIdx < allLines.length; lineIdx++) {
                const { text: line, indent } = allLines[lineIdx];
                const isLastLine = lineIdx === allLines.length - 1;
                const lineW = contentW - indent;

                if (y + lh > pageH - mBottom) {
                    drawPageNumber();
                    addPage('any', true); // internal = true → triggers onPageAdded (drawHeader)
                }
                const lx = pageMarginLeft();

                // Saltar espacio separador que jsPDF consume al dividir
                if (globalPos > 0 && globalPos < fullText.length && fullText[globalPos] === ' ') {
                    globalPos++;
                }

                if (center) {
                    doc.setFont(fontName, 'normal');
                    doc.setFontSize(size);
                    const cx = lx + (contentW - doc.getTextWidth(line)) / 2;
                    _drawLineOfRuns(line, runs, globalPos, cx, y + size, size, boldAll, italicAll);
                } else if (justify && !isLastLine) {
                    _drawJustifiedMixedRuns(line, runs, globalPos, lx + indent, y + size, size, lineW, boldAll, italicAll);
                } else {
                    _drawLineOfRuns(line, runs, globalPos, lx + indent, y + size, size, boldAll, italicAll);
                }

                globalPos += line.length;
                y += lh;
            }

            doc.setFont(fontName, 'normal');
            doc.setFontSize(fontSize);
        };

        // Dibuja una línea de runs con formato mixto (sin justificar — alineación izquierda)
        const _drawLineOfRuns = (line, runs, startPos, x, baseline, size, boldAll, italicAll) => {
            let runX = x;
            let charsLeft = line.length;
            let pos = startPos;

            while (charsLeft > 0) {
                let acc = 0, run = null, localOff = 0;
                for (const r of runs) {
                    if (acc + r.text.length > pos) { run = r; localOff = pos - acc; break; }
                    acc += r.text.length;
                }
                if (!run) break;

                const take    = Math.min(run.text.length - localOff, charsLeft);
                const segment = run.text.slice(localOff, localOff + take);
                const isBold   = boldAll || run.bold;
                const isItalic = italicAll || run.italic;
                const style    = isBold && isItalic ? 'bolditalic' : isBold ? 'bold' : isItalic ? 'italic' : 'normal';
                doc.setFont(fontName, style);
                doc.setFontSize(size);
                doc.text(segment, runX, baseline);
                runX += doc.getTextWidth(segment);
                pos += take;
                charsLeft -= take;
            }
        };

        // Mide el ancho real de un segmento de texto respetando los runs (bold/italic)
        const _measureSegmentWidth = (text, runs, startPos, size, boldAll, italicAll) => {
            let w = 0;
            let left = text.length;
            let pos  = startPos;
            while (left > 0) {
                let acc = 0, run = null, localOff = 0;
                for (const r of runs) {
                    if (acc + r.text.length > pos) { run = r; localOff = pos - acc; break; }
                    acc += r.text.length;
                }
                if (!run) break;
                const take = Math.min(run.text.length - localOff, left);
                const seg  = run.text.slice(localOff, localOff + take);
                const isBold   = boldAll || run.bold;
                const isItalic = italicAll || run.italic;
                const style    = isBold && isItalic ? 'bolditalic' : isBold ? 'bold' : isItalic ? 'italic' : 'normal';
                doc.setFont(fontName, style);
                doc.setFontSize(size);
                w    += doc.getTextWidth(seg);
                pos  += take;
                left -= take;
            }
            return w;
        };

        // Dibuja una línea con justificación manual (funciona con runs uniformes y mixtos)
        const _drawJustifiedMixedRuns = (line, runs, startPos, x, baseline, size, lineWidth, boldAll, italicAll) => {
            const words = line.split(' ');
            if (words.length <= 1) {
                _drawLineOfRuns(line, runs, startPos, x, baseline, size, boldAll, italicAll);
                return;
            }

            // Medir ancho de cada palabra con su estilo real
            let pos = startPos;
            const wordWidths = [];
            for (const word of words) {
                wordWidths.push(_measureSegmentWidth(word, runs, pos, size, boldAll, italicAll));
                pos += word.length + 1; // +1 por el espacio
            }

            // Calcular el ancho natural de la línea (palabras + espacios normales)
            doc.setFont(fontName, 'normal');
            doc.setFontSize(size);
            const normalSpaceW = doc.getTextWidth(' ');
            const naturalWidth = wordWidths.reduce((a, b) => a + b, 0) + normalSpaceW * (words.length - 1);
            const extraSpace   = (lineWidth - naturalWidth) / (words.length - 1);
            const justSpaceW   = normalSpaceW + extraSpace;

            // Dibujar palabra a palabra
            pos = startPos;
            let runX = x;
            for (let wi = 0; wi < words.length; wi++) {
                const word = words[wi];
                _drawLineOfRuns(word, runs, pos, runX, baseline, size, boldAll, italicAll);
                runX += wordWidths[wi];
                pos  += word.length;
                if (wi < words.length - 1) {
                    runX += justSpaceW;
                    pos++;  // el espacio entre palabras
                }
            }
        };

        // ================================================================
        // PÁGINA DE TÍTULO
        // ================================================================
        if (meta.title) {
            const titleSize = Math.round(fontSize * 2.5);
            const authorSize = Math.round(fontSize * 1.2);
            const centerY = pageH / 2;
            y = centerY - titleSize;

            doc.setFont(fontName, 'bold');
            doc.setFontSize(titleSize);
            const titleLines = doc.splitTextToSize(meta.title, contentW);
            titleLines.forEach((line) => {
                const tx = mLeft + (contentW - doc.getTextWidth(line)) / 2;
                doc.text(line, tx, y + titleSize);
                y += titleSize * lineHeightFactor;
            });

            if (meta.author) {
                y += titleSize * 0.5;
                doc.setFont(fontName, 'normal');
                doc.setFontSize(authorSize);
                const ax = mLeft + (contentW - doc.getTextWidth(meta.author)) / 2;
                doc.text(meta.author, ax, y + authorSize);
            }
            doc.setFont(fontName, 'normal');
            doc.setFontSize(fontSize);
        }

        // ================================================================
        // CAPÍTULOS
        // ================================================================
        chapters.forEach((chapter, idx) => {
            const isSection = chapter.type === 'section';

            // Actualizar título de capítulo actual (para encabezados en saltos internos)
            currentChapterTitle = chapter.title || '';
            onPageAdded = () => drawHeader(currentChapterTitle);

            if (idx === 0 && meta.title) {
                // Primer capítulo tras portada → siempre página nueva derecha
                addPage('right');
            } else if (!isSection) {
                // Capítulos normales → página derecha (impar)
                drawPageNumber();
                addPage('right');
            } else {
                // Secciones → página nueva sin forzar lado
                drawPageNumber();
                addPage();
            }
            drawHeader(chapter.title);

            // Título del capítulo
            const titleSize = isSection
                ? Math.round(fontSize * 1.35)
                : Math.round(fontSize * 1.8);

            y += titleSize * 0.5; // espacio antes del título
            writeRuns(
                [{ text: chapter.title || `Capítulo ${idx + 1}`, bold: true, italic: isSection }],
                { size: titleSize, center: true }
            );
            y += titleSize * lineHeightFactor; // espacio tras el título

            // Contenido del capítulo
            const blocks = htmlToBlocks(chapter.html);
            let firstParagraph = true;

            blocks.forEach((block) => {
                if (block.type === 'hr') {
                    if (y + fontSize > pageH - mBottom) {
                        drawPageNumber(); addPage('any', true);
                    }
                    const lx = pageMarginLeft();
                    doc.setDrawColor(150);
                    doc.line(lx + contentW * 0.2, y + fontSize / 2,
                             lx + contentW * 0.8, y + fontSize / 2);
                    y += fontSize * lineHeightFactor;
                    firstParagraph = true;

                } else if (block.type === 'h2') {
                    y += fontSize * lineHeightFactor * 0.5;
                    writeRuns(block.runs, {
                        boldAll: true, size: Math.round(fontSize * 1.25), center: true
                    });
                    y += fontSize * lineHeightFactor * 0.25;
                    firstParagraph = true;

                } else if (block.type === 'h3') {
                    y += fontSize * lineHeightFactor * 0.3;
                    writeRuns(block.runs, {
                        boldAll: true, size: Math.round(fontSize * 1.1)
                    });
                    y += fontSize * lineHeightFactor * 0.15;
                    firstParagraph = true;

                } else if (block.type === 'li') {
                    const liRuns = [
                        { text: '• ', bold: false, italic: false },
                        ...block.runs
                    ];
                    writeRuns(liRuns, { firstLineIndent: fontSize * 0.5 });

                } else {
                    // Párrafo — sangría solo en primera línea, excepto el primero tras título/hr
                    const paragraphIndent = (!firstParagraph && indentPt > 0) ? indentPt : 0;
                    writeRuns(block.runs, { firstLineIndent: paragraphIndent });
                    firstParagraph = false;
                }
            });
        });

        // Número de página de la última página
        drawPageNumber();

        // ================================================================
        // DESCARGA
        // ================================================================
        const safeName = (meta.title || 'libro')
            .replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-')
            .toLowerCase()
            .substring(0, 60);

        doc.save(`${safeName || 'libro'}-kdp.pdf`);
    }
}

if (typeof window !== 'undefined') {
    window.PdfExporter = PdfExporter;
}
