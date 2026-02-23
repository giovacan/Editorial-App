/**
 * PREVIEW RENDERER - Vista Previa Paginada
 * =========================================
 *
 * Renderiza el libro con márgenes, tipografía y paginación reales
 * según estándares Amazon KDP. Divide el contenido en páginas
 * individuales usando medición DOM y permite navegación página a página.
 */

class PreviewRenderer {

    constructor(previewContentElement) {
        this.previewContent = previewContentElement;
        this.currentZoom = 50;
        this.currentPage = 0;
        this.pages = [];
        this.config = {};
    }

    // ================================================================
    // RENDERIZADO PRINCIPAL
    // ================================================================

    render(chapters, bookType = 'novela', pageFormat = '6x9', appState = null) {
        this.appState = appState;
        if (!chapters || chapters.length === 0) {
            this.showEmpty();
            return;
        }

        try {
            const kdpConfig = AMAZON_KDP_STANDARDS.bookTypes[bookType]
                || AMAZON_KDP_STANDARDS.bookTypes['novela'];
            const formatConfig = AMAZON_KDP_STANDARDS.pageFormats[pageFormat]
                || AMAZON_KDP_STANDARDS.pageFormats['6x9'];

            this.config = { book: kdpConfig, format: formatConfig };

            const dims = this.calculateDimensions(kdpConfig, formatConfig);
            this.pages = this.paginateContent(chapters, kdpConfig, dims);

            this.currentPage = 0;
            this.showPage(this.currentPage);
            this.updatePaginationUI();

            console.log(`✓ Preview renderizado: ${this.pages.length} páginas`, {
                formato: formatConfig.name,
                tipografia: `${kdpConfig.fontFamily} ${kdpConfig.fontSize}pt`,
                zoom: `${this.currentZoom}%`
            });

        } catch (error) {
            console.error('Error renderizando preview:', error);
            if (this.previewContent) {
                this.previewContent.innerHTML =
                    `<p style="color:red;padding:16px;">Error: ${error.message}</p>`;
            }
        }
    }

    // ================================================================
    // CÁLCULO DE DIMENSIONES (100% — base para paginación)
    // ================================================================

    calculateDimensions(bookConfig, formatConfig) {
        const PX_PER_MM   = 3.7795;
        const PX_PER_INCH = 96;

        const pageWidthPx  = formatConfig.width  * PX_PER_MM;
        const pageHeightPx = formatConfig.height * PX_PER_MM;

        // Los márgenes de bookTypes están en pulgadas
        const marginTopPx    = bookConfig.marginTop    * PX_PER_INCH;
        const marginBottomPx = bookConfig.marginBottom * PX_PER_INCH;
        const marginLeftPx   = (bookConfig.marginLeft + (bookConfig.gutter || 0)) * PX_PER_INCH;
        const marginRightPx  = bookConfig.marginRight  * PX_PER_INCH;

        const contentWidthPx  = pageWidthPx  - marginLeftPx - marginRightPx;
        const contentHeightPx = pageHeightPx - marginTopPx  - marginBottomPx;

        return {
            pageWidthPx, pageHeightPx,
            marginTopPx, marginBottomPx, marginLeftPx, marginRightPx,
            contentWidthPx, contentHeightPx
        };
    }

    // ================================================================
    // PAGINACIÓN — divide el contenido midiendo con el DOM
    // ================================================================

    paginateContent(chapters, bookConfig, dims) {
        const pages = [];

        // Contenedor oculto para medir alturas reales acumuladas
        const measureDiv = document.createElement('div');
        measureDiv.setAttribute('aria-hidden', 'true');
        measureDiv.style.cssText = [
            `position:fixed`,
            `left:-99999px`,
            `top:0`,
            `width:${dims.contentWidthPx}px`,
            `font-family:${bookConfig.fontFamily}`,
            `font-size:${bookConfig.fontSize}pt`,
            `line-height:${bookConfig.lineHeight}`,
            `text-align:justify`,
            `hyphens:auto`,
            `word-wrap:break-word`,
            `visibility:hidden`,
            `pointer-events:none`,
            `z-index:-999`,
            `padding:0`,
            `margin:0`,
            `box-sizing:border-box`,
            // Aislar del CSS base del body (p, h2, ul tienen margin por defecto)
            `color:#000`,
            `background:transparent`,
            `list-style-position:inside`
        ].join(';');

        document.body.appendChild(measureDiv);

        try {
            chapters.forEach(chapter => {
                const isSection = chapter.type === 'section';

                if (pages.length > 0) {
                    if (!isSection) {
                        // Capítulos arrancan siempre en página derecha (impar)
                        if (pages.length % 2 === 1) {
                            pages.push(this._blankPage(pages.length + 1));
                        }
                    } else {
                        // Secciones: empiezan en página nueva pero no necesariamente derecha
                        // Si la última página tiene contenido, abrimos página nueva
                        const lastPage = pages[pages.length - 1];
                        if (lastPage && !lastPage.isBlank && lastPage.html) {
                            // La sección continúa en la siguiente página disponible
                            // No insertamos blank — fluye naturalmente
                        }
                    }
                }

                const titleHtml    = isSection
                    ? this._buildSectionTitleHtml(chapter.title, bookConfig)
                    : this._buildTitleHtml(chapter.title, bookConfig);
                const bodyElements = this._parseElements(chapter.html, bookConfig);

                let currentElements = [titleHtml];
                let currentHtml     = titleHtml;

                bodyElements.forEach(elHtml => {
                    // Intentar agregar el elemento completo primero
                    const candidateHtml = currentHtml + elHtml;
                    measureDiv.innerHTML = candidateHtml;
                    const candidateHeight = measureDiv.offsetHeight;

                    const cabe       = candidateHeight <= dims.contentHeightPx;
                    const soloTitulo = currentElements.length === 1;

                    if (!cabe && !soloTitulo) {
                        // El elemento no cabe — intentar dividir si es un párrafo largo
                        const split = this._splitElementIntoParts(elHtml, currentHtml, dims.contentHeightPx, measureDiv, bookConfig);

                        if (split) {
                            // La parte que cabe va en la página actual
                            pages.push(this._makePage(currentHtml + split.fits, pages.length + 1, chapter.title));
                            currentElements = [split.remainder];
                            currentHtml     = split.remainder;
                        } else {
                            // No se puede dividir — guardar página y continuar
                            pages.push(this._makePage(currentHtml, pages.length + 1, chapter.title));
                            currentElements = [elHtml];
                            currentHtml     = elHtml;
                        }
                    } else {
                        currentElements.push(elHtml);
                        currentHtml = candidateHtml;
                    }
                });

                // Guardar última página del capítulo
                if (currentHtml) {
                    pages.push(this._makePage(currentHtml, pages.length + 1, chapter.title));
                }
            });

        } finally {
            document.body.removeChild(measureDiv);
        }

        return pages;
    }

    // ================================================================
    // HELPERS DE PAGINACIÓN
    // ================================================================

    _buildTitleHtml(title, bookConfig) {
        const titleSize = Math.round(bookConfig.fontSize * 1.8);
        return `<div style="
            font-size:${titleSize}pt;
            font-weight:bold;
            text-align:center;
            margin-top:0.5em;
            margin-bottom:1.5em;
            padding:0;
            letter-spacing:0.05em;
        ">${this._esc(title)}</div>`;
    }

    // Título de sección: más pequeño, sin tanto margen, fluye con el texto
    _buildSectionTitleHtml(title, bookConfig) {
        const titleSize = Math.round(bookConfig.fontSize * 1.35);
        return `<div style="
            font-size:${titleSize}pt;
            font-weight:bold;
            font-style:italic;
            text-align:center;
            margin-top:0.25em;
            margin-bottom:1em;
            padding:0;
            letter-spacing:0.03em;
        ">${this._esc(title)}</div>`;
    }

    _parseElements(chapterHtml, bookConfig) {
        const tmp = document.createElement('div');
        tmp.innerHTML = chapterHtml || '<p></p>';

        let children = Array.from(tmp.children);

        // Si no hay hijos estructurados, envolver texto en párrafos
        if (children.length === 0 && tmp.textContent.trim()) {
            tmp.innerHTML = `<p>${tmp.textContent}</p>`;
            children = Array.from(tmp.children);
        }

        const indentPx = bookConfig.indent > 0 ? bookConfig.indent * 96 : 0;
        // Espacio entre párrafos: media línea en pt→px
        const paraGap  = Math.round(bookConfig.fontSize * (96 / 72) * bookConfig.lineHeight * 0.15);

        const filteredChildren = children.filter(el => el.textContent.trim() || el.tagName === 'HR');
        let firstParagraph = true; // primera <p> tras el título no lleva sangría

        return filteredChildren.map(el => {
                const tag = el.tagName;

                if (tag === 'P') {
                    // Sin sangría en el primer párrafo tras título, h2, h3 o hr
                    const applyIndent = !firstParagraph && indentPx > 0;
                    firstParagraph = false;
                    const indent = applyIndent ? `text-indent:${indentPx}px;` : '';
                    return `<p style="${indent}margin:0 0 ${paraGap}px 0;padding:0;">${el.innerHTML}</p>`;
                }

                // Los elementos que no son párrafos resetean el flag de "primer párrafo"
                firstParagraph = true;

                if (tag === 'H3' || tag === 'H4') {
                    const sz = tag === 'H3'
                        ? Math.round(bookConfig.fontSize * 1.25)
                        : Math.round(bookConfig.fontSize * 1.1);
                    return `<${tag.toLowerCase()} style="font-size:${sz}pt;font-weight:bold;margin:0.8em 0 0.4em 0;padding:0;">${el.innerHTML}</${tag.toLowerCase()}>`;
                }

                if (tag === 'UL' || tag === 'OL') {
                    return `<${tag.toLowerCase()} style="margin:0 0 ${paraGap}px 1.5em;padding:0;">${el.innerHTML}</${tag.toLowerCase()}>`;
                }

                if (tag === 'HR') {
                    return `<hr style="border:none;border-top:1px solid #999;margin:1em 0;">`;
                }

                // Resto de elementos: quitar márgenes heredados del CSS base
                return `<div style="margin:0 0 ${paraGap}px 0;padding:0;">${el.innerHTML}</div>`;
            });
    }

    /**
     * Intenta dividir un elemento (párrafo) en dos partes:
     * - fits:      texto que cabe en la página actual
     * - remainder: texto que pasa a la siguiente página
     * Divide por oraciones para no cortar palabras a la mitad.
     * Devuelve null si el elemento no es divisible o es muy corto.
     */
    _splitElementIntoParts(elHtml, currentPageHtml, maxHeight, measureDiv, bookConfig) {
        // Solo dividir párrafos — no títulos, listas ni separadores
        const isP = /^<p[\s>]/i.test(elHtml.trim());
        if (!isP) return null;

        // Extraer el contenido interior y los atributos del <p>
        const openTag  = elHtml.match(/^(<p[^>]*>)/i)?.[1] || '<p>';
        const inner    = elHtml.replace(/^<p[^>]*>/i, '').replace(/<\/p>$/i, '');

        // Dividir por oraciones: punto/exclamación/interrogación seguido de espacio o fin
        const sentences = inner.split(/(?<=[.!?»"']\s)|(?<=\.\s)/u).filter(s => s.trim());

        if (sentences.length < 2) return null; // párrafo de una sola oración, no dividir

        const indentStyle = elHtml.match(/text-indent:[^;]+;/)?.[0] || '';
        const marginStyle = elHtml.match(/margin:[^;]+;/)?.[0] || 'margin:0;';

        let fitsText = '';
        let lastFitIndex = -1;

        for (let i = 0; i < sentences.length - 1; i++) {
            fitsText += sentences[i];
            const candidate = currentPageHtml + `${openTag}${fitsText}</p>`;
            measureDiv.innerHTML = candidate;
            if (measureDiv.offsetHeight <= maxHeight) {
                lastFitIndex = i;
            } else {
                break;
            }
        }

        if (lastFitIndex < 0) return null; // ni una oración cabe — no dividir

        const fitPart       = sentences.slice(0, lastFitIndex + 1).join('');
        const remainderPart = sentences.slice(lastFitIndex + 1).join('');

        if (!remainderPart.trim()) return null;

        // El remainder es un párrafo nuevo sin sangría (continuación del anterior)
        const fits     = `${openTag}${fitPart}</p>`;
        const remainder = `<p style="${marginStyle}padding:0;">${remainderPart}</p>`;

        return { fits, remainder };
    }

    _makePage(html, pageNumber, chapterTitle) {
        return { html, pageNumber, chapterTitle, isBlank: false };
    }

    _blankPage(pageNumber) {
        return { html: '', pageNumber, chapterTitle: '', isBlank: true };
    }

    // ================================================================
    // MOSTRAR PÁGINA — renderiza una página individual escalada
    // ================================================================

    showPage(pageIndex) {
        if (!this.previewContent) return;
        if (!this.pages.length)   { this.showEmpty(); return; }

        const page = this.pages[pageIndex];
        if (!page) return;

        const { book, format } = this.config;
        const dims  = this.calculateDimensions(book, format);
        const scale = this.currentZoom / 100;

        // Dimensiones escaladas al zoom actual
        const W  = Math.round(dims.pageWidthPx    * scale);
        const H  = Math.round(dims.pageHeightPx   * scale);
        const mT = Math.round(dims.marginTopPx    * scale);
        const mB = Math.round(dims.marginBottomPx * scale);
        const mL = Math.round(dims.marginLeftPx   * scale);
        const mR = Math.round(dims.marginRightPx  * scale);

        // Fuente: pt → px → escalada
        const PT2PX   = 96 / 72;
        const fontSize = Math.round(book.fontSize * PT2PX * scale);

        const numSize = Math.max(8, Math.round(9 * PT2PX * scale));

        // Número de página — configurable
        const showNums    = this.appState?.config?.showPageNumbers !== false;
        const numPos      = this.appState?.config?.pageNumberPos   || 'bottom';
        const numAlign    = this.appState?.config?.pageNumberAlign || 'center';
        const contentW_px = W - mL - mR;

        let numCss = '';
        if (numPos === 'bottom') {
            numCss += `bottom:${Math.round(mB * 0.45)}px;`;
        } else {
            numCss += `top:${Math.round(mT * 0.3)}px;`;
        }
        if (numAlign === 'left') {
            numCss += `left:${mL}px;`;
        } else if (numAlign === 'right') {
            numCss += `right:${mR}px;`;
        } else if (numAlign === 'outer') {
            // par (0,2,4…) → izquierda exterior; impar (1,3,5…) → derecha exterior
            if (pageIndex % 2 === 0) {
                numCss += `left:${mL}px;`;
            } else {
                numCss += `right:${mR}px;`;
            }
        } else {
            // center: centrado en el área de contenido
            numCss += `left:${mL}px;width:${contentW_px}px;text-align:center;`;
        }

        const pageNumHtml = (showNums && !page.isBlank) ? `
            <div style="
                position:absolute;
                ${numCss}
                font-size:${numSize}px;
                color:#888;
                font-family:${book.fontFamily};
                line-height:1;
            ">${page.pageNumber}</div>` : '';

        // Encabezado — configurable
        const showHeaders  = this.appState?.config?.showHeaders;
        const headerPos    = this.appState?.config?.headerPosition || 'top';
        const headerContent = this.appState?.config?.headerContent || 'both';
        const headerLine   = this.appState?.config?.headerLine !== false;
        const bookTitle    = this.appState?.document?.title || '';

        let headerText = '';
        if (showHeaders && !page.isBlank) {
            if (headerContent === 'title') {
                headerText = bookTitle;
            } else if (headerContent === 'chapter') {
                headerText = page.chapterTitle || '';
            } else {
                // 'both': par → título del libro, impar → título del capítulo
                headerText = (pageIndex % 2 === 0) ? bookTitle : (page.chapterTitle || '');
            }
        }

        const headerTopPx    = Math.round(mT * 0.3);
        const headerBottomPx = Math.round(mB * 0.3);
        const lineTopPx      = Math.round(mT * 0.55);
        const lineBottomPx   = Math.round(mB * 0.55);
        const headerFontSize = Math.max(7, Math.round(8 * PT2PX * scale));

        const headerHtml = (showHeaders && !page.isBlank && headerText) ? `
            <div style="
                position:absolute;
                ${headerPos === 'top' ? `top:${headerTopPx}px;` : `bottom:${headerBottomPx}px;`}
                left:${mL}px;
                width:${contentW_px}px;
                font-size:${headerFontSize}px;
                color:#666;
                font-family:${book.fontFamily};
                font-style:italic;
                text-align:center;
                line-height:1;
                pointer-events:none;
            ">
                ${this._esc(headerText)}
                ${headerLine ? `<div style="border-top:1px solid #ccc;margin-top:3px;position:absolute;left:0;right:0;${headerPos === 'top' ? `top:${lineTopPx - headerTopPx}px;` : `bottom:${lineBottomPx - headerBottomPx}px;`}"></div>` : ''}
            </div>` : '';

        this.previewContent.innerHTML = `
            <div style="
                background:#d0d0d0;
                padding:16px;
                display:flex;
                justify-content:center;
                min-height:${H + 32}px;
                box-sizing:border-box;
            ">
                <div style="
                    width:${W}px;
                    height:${H}px;
                    background:white;
                    border:1px solid #b0b0b0;
                    box-shadow:0 4px 16px rgba(0,0,0,0.25);
                    position:relative;
                    padding:${mT}px ${mR}px ${mB}px ${mL}px;
                    box-sizing:border-box;
                    overflow:hidden;
                    flex-shrink:0;
                ">
                    <div style="
                        font-family:${book.fontFamily};
                        font-size:${fontSize}px;
                        line-height:${book.lineHeight};
                        color:#1a1a1a;
                        text-align:justify;
                        hyphens:auto;
                        word-wrap:break-word;
                        overflow:hidden;
                        height:100%;
                    ">${page.isBlank ? '' : page.html}</div>
                    ${pageNumHtml}
                    ${headerHtml}
                </div>
            </div>`;

        this.currentPage = pageIndex;
    }

    showEmpty() {
        if (this.previewContent) {
            this.previewContent.innerHTML = `
                <div class="preview-placeholder">
                    <p>Procesa un documento para ver la vista previa aquí</p>
                </div>`;
        }
        this.updatePaginationUI();
    }

    // ================================================================
    // NAVEGACIÓN
    // ================================================================

    previousPage() {
        if (this.currentPage > 0) {
            this.currentPage--;
            this.showPage(this.currentPage);
            this.updatePaginationUI();
        }
    }

    nextPage() {
        if (this.currentPage < this.pages.length - 1) {
            this.currentPage++;
            this.showPage(this.currentPage);
            this.updatePaginationUI();
        }
    }

    // ================================================================
    // ZOOM — re-renderiza la página actual al nuevo nivel
    // ================================================================

    applyZoom(zoomLevel) {
        this.currentZoom = zoomLevel;
        if (this.pages.length > 0) {
            this.showPage(this.currentPage);
        }
    }

    // ================================================================
    // ACTUALIZAR UI DE PAGINACIÓN
    // ================================================================

    updatePaginationUI() {
        const paginationInfo = document.querySelector('.pagination-info');
        if (paginationInfo) {
            paginationInfo.hidden = this.pages.length === 0;
        }

        const elCurrent = document.getElementById('current-page');
        const elTotal   = document.getElementById('total-pages');
        if (elCurrent) elCurrent.textContent = this.pages.length ? this.currentPage + 1 : 0;
        if (elTotal)   elTotal.textContent   = this.pages.length;

        const btnPrev = document.getElementById('btn-prev-page');
        const btnNext = document.getElementById('btn-next-page');
        if (btnPrev) btnPrev.disabled = this.currentPage === 0;
        if (btnNext) btnNext.disabled = this.currentPage >= this.pages.length - 1;
    }

    // ================================================================
    // UTILIDADES
    // ================================================================

    getBookInfo() {
        return {
            format:      this.config.format?.name,
            bookType:    this.config.book?.name,
            fontSize:    `${this.config.book?.fontSize}pt`,
            fontFamily:  this.config.book?.fontFamily,
            totalPages:  this.pages.length,
            currentPage: this.currentPage + 1
        };
    }

    _esc(text) {
        const m = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return String(text || '').replace(/[&<>"']/g, c => m[c]);
    }
}

if (typeof window !== 'undefined') {
    window.PreviewRenderer = PreviewRenderer;
}
