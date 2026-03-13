/**
 * TEXT PARSER — Detección de estructura sin IA
 * =============================================
 *
 * Detecta capítulos, títulos, subtítulos, párrafos, listas y formato
 * en texto plano y Markdown básico, usando solo expresiones regulares.
 *
 * Soporta:
 *   - Markdown: #, ##, ###, **negrita**, *cursiva*, listas, ---
 *   - Texto plano: "Capítulo N", "CAPÍTULO N", numeración romana
 *   - Separadores de sección: ---, ***, ~~~
 *   - Diálogos con guión largo: — Texto
 *   - Saltos de párrafo por línea en blanco
 */

class TextParser {

    // ================================================================
    // PATRONES DE DETECCIÓN
    // ================================================================

    static PATTERNS = {
        // Encabezados Markdown
        h1:  /^#{1}\s+(.+)$/,
        h2:  /^#{2}\s+(.+)$/,
        h3:  /^#{3}\s+(.+)$/,

        // Capítulo en texto plano
        chapterWord:   /^(cap[íi]tulo|chapter|parte|part|libro|book|secci[oó]n|section)\s+(.+)$/i,
        chapterNumber: /^(cap[íi]tulo|chapter)\s*[\dIVXLCDMivxlcdm]+[.:)–-]?\s*(.*)/i,
        chapterRoman:  /^(I{1,3}|IV|VI{0,3}|IX|XI{0,3}|XIV|XV|XVI{0,3}|XIX|XX)\s*[.:-]?\s+\S/,

        // Título en MAYÚSCULAS (línea corta, toda en mayús, sin puntuación final)
        allCaps: /^[A-ZÁÉÍÓÚÜÑ\s\d]{4,60}$/,

        // Separadores de sección
        separator: /^(-{3,}|\*{3,}|~{3,}|_{3,})$/,

        // Listas
        bulletList:   /^[\-\*\+]\s+(.+)$/,
        numberedList: /^(\d+)[.)]\s+(.+)$/,

        // Formato inline
        bold:        /\*\*(.+?)\*\*/g,
        italic:      /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g,
        boldItalic:  /\*{3}(.+?)\*{3}/g,
        underline:   /__(.+?)__/g,

        // Línea en blanco
        emptyLine: /^\s*$/,

        // Diálogo (guión largo o doble guión al inicio)
        dialogue: /^[—–-]{1,2}\s+/,
    };

    // ================================================================
    // ENTRADA PRINCIPAL: parsea texto completo → array de capítulos
    // ================================================================

    /**
     * @param {string} rawText — texto crudo (plano o Markdown)
     * @returns {Array<{ title: string, html: string, wordCount: number }>}
     */
    parse(rawText) {
        if (!rawText || !rawText.trim()) return [];

        const lines = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        const blocks = this._groupBlocks(lines);
        const chapters = this._splitIntoChapters(blocks);

        return chapters.map(ch => ({
            id:        `chapter-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            title:     ch.title,
            html:      ch.html,
            wordCount: this._countWords(ch.rawText)
        }));
    }

    // ================================================================
    // PASO 1: Agrupar líneas en bloques lógicos
    // ================================================================

    _groupBlocks(lines) {
        const blocks = [];
        let para = [];

        const flush = () => {
            if (para.length > 0) {
                const text = para.join('\n').trim();
                if (text) blocks.push({ type: 'paragraph', text });
                para = [];
            }
        };

        for (const line of lines) {
            const P = TextParser.PATTERNS;

            // Separador de sección
            if (P.separator.test(line.trim())) {
                flush();
                blocks.push({ type: 'separator', text: line.trim() });
                continue;
            }

            // Encabezados Markdown
            const h1m = line.match(P.h1);
            const h2m = line.match(P.h2);
            const h3m = line.match(P.h3);

            if (h1m && !h2m && !h3m) {
                flush();
                blocks.push({ type: 'h1', text: h1m[1].trim() });
                continue;
            }
            if (h2m) {
                flush();
                blocks.push({ type: 'h2', text: h2m[1].trim() });
                continue;
            }
            if (h3m) {
                flush();
                blocks.push({ type: 'h3', text: h3m[1].trim() });
                continue;
            }

            // Línea vacía → cierra párrafo actual
            if (P.emptyLine.test(line)) {
                flush();
                continue;
            }

            // Encabezado en texto plano: "Capítulo N" o "Chapter N"
            const chapMatch = line.trim().match(P.chapterWord);
            if (chapMatch && line.trim().length < 80) {
                flush();
                blocks.push({ type: 'h1', text: line.trim() });
                continue;
            }

            // Título en MAYÚSCULAS (línea corta sola)
            if (P.allCaps.test(line.trim()) && line.trim().length >= 4 && line.trim().length <= 60) {
                flush();
                blocks.push({ type: 'h2', text: this._titleCase(line.trim()) });
                continue;
            }

            // Numeración romana al inicio de línea (ej: "III. El inicio")
            if (P.chapterRoman.test(line.trim()) && line.trim().length < 80) {
                flush();
                blocks.push({ type: 'h1', text: line.trim() });
                continue;
            }

            // Lista con viñetas
            const bulletM = line.match(P.bulletList);
            if (bulletM) {
                // Agrupar items de lista en el mismo bloque
                if (para.length > 0 && blocks.length > 0 && blocks[blocks.length - 1].type === 'ul') {
                    blocks[blocks.length - 1].items.push(bulletM[1].trim());
                } else {
                    flush();
                    blocks.push({ type: 'ul', items: [bulletM[1].trim()] });
                }
                continue;
            }

            // Lista numerada
            const numM = line.match(P.numberedList);
            if (numM) {
                if (para.length > 0 && blocks.length > 0 && blocks[blocks.length - 1].type === 'ol') {
                    blocks[blocks.length - 1].items.push(numM[2].trim());
                } else {
                    flush();
                    blocks.push({ type: 'ol', items: [numM[2].trim()] });
                }
                continue;
            }

            // Línea normal → acumular párrafo
            para.push(line);
        }

        flush();
        return blocks;
    }

    // ================================================================
    // PASO 2: Dividir bloques en capítulos (h1 = divisor de capítulo)
    // ================================================================

    _splitIntoChapters(blocks) {
        const chapters = [];
        let current = null;

        const isChapterBreak = (b) => b.type === 'h1';

        for (const block of blocks) {
            if (isChapterBreak(block)) {
                if (current) chapters.push(this._finalizeChapter(current));
                current = { titleBlock: block, blocks: [] };
            } else {
                if (!current) {
                    // Contenido antes del primer capítulo → capítulo implícito
                    current = { titleBlock: null, blocks: [] };
                }
                current.blocks.push(block);
            }
        }

        if (current) chapters.push(this._finalizeChapter(current));

        // Si no se detectó ningún capítulo, tratar todo como uno
        if (chapters.length === 0) {
            chapters.push({
                title: 'Capítulo 1',
                html: this._blocksToHtml(blocks),
                rawText: blocks.map(b => b.text || '').join('\n')
            });
        }

        return chapters;
    }

    _finalizeChapter(ch) {
        const title = ch.titleBlock
            ? this._cleanTitle(ch.titleBlock.text)
            : 'Sin título';

        const html    = this._blocksToHtml(ch.blocks);
        const rawText = ch.blocks.map(b => b.text || (b.items || []).join(' ')).join('\n');

        return { title, html, rawText };
    }

    // ================================================================
    // PASO 3: Convertir bloques a HTML
    // ================================================================

    _blocksToHtml(blocks) {
        return blocks.map(block => {
            switch (block.type) {
                case 'h2':
                    return `<h3>${this._inlineFormat(this._esc(block.text))}</h3>`;

                case 'h3':
                    return `<h4>${this._inlineFormat(this._esc(block.text))}</h4>`;

                case 'separator':
                    return `<hr>`;

                case 'ul':
                    return `<ul>${block.items.map(i =>
                        `<li>${this._inlineFormat(this._esc(i))}</li>`
                    ).join('')}</ul>`;

                case 'ol':
                    return `<ol>${block.items.map(i =>
                        `<li>${this._inlineFormat(this._esc(i))}</li>`
                    ).join('')}</ol>`;

                case 'paragraph':
                default: {
                    const text = block.text || '';
                    // Párrafo multilínea: cada línea interna → <br> o párrafo separado
                    const subLines = text.split('\n');
                    if (subLines.length === 1) {
                        return `<p>${this._inlineFormat(this._esc(text))}</p>`;
                    }
                    // Múltiples líneas agrupadas (ej: poesía o diálogos continuos)
                    return subLines
                        .map(l => `<p>${this._inlineFormat(this._esc(l.trim()))}</p>`)
                        .join('');
                }
            }
        }).join('\n');
    }

    // ================================================================
    // FORMATO INLINE: negrita, cursiva, etc.
    // ================================================================

    _inlineFormat(html) {
        // Orden importa: primero bold+italic, luego bold, luego italic
        return html
            .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
            .replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g,         '<em>$1</em>')
            .replace(/__(.+?)__/g,         '<u>$1</u>')
            .replace(/~~(.+?)~~/g,         '<del>$1</del>');
    }

    // ================================================================
    // UTILIDADES
    // ================================================================

    _cleanTitle(text) {
        return text
            .replace(/^#+\s*/, '')
            .replace(/^(cap[íi]tulo|chapter|parte|part)\s*/i, match => match) // conservar
            .trim();
    }

    _titleCase(str) {
        const minors = ['de', 'del', 'la', 'el', 'los', 'las', 'y', 'a', 'en', 'con', 'por', 'un', 'una'];
        return str.toLowerCase().split(' ').map((w, i) =>
            i === 0 || !minors.includes(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w
        ).join(' ');
    }

    _countWords(text) {
        return (text || '').trim().split(/\s+/).filter(w => w.length > 0).length;
    }

    _esc(text) {
        const m = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return String(text || '').replace(/[&<>"']/g, c => m[c]);
    }
}

if (typeof window !== 'undefined') {
    window.TextParser = TextParser;
}
