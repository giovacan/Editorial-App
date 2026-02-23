/**
 * ESTÁNDARES AMAZON KDP
 * =====================
 * 
 * Especificaciones oficiales de Amazon KDP para publicación de libros
 * Fuente: https://kdp.amazon.com/es/help/topic/G200645310
 * Última actualización: 2024
 */

const AMAZON_KDP_STANDARDS = {
    // ================================================================
    // FORMATOS DE PÁGINA DISPONIBLES
    // ================================================================
    pageFormats: {
        'a5': {
            name: 'A5',
            width: 148,
            height: 210,
            unit: 'mm',
            description: 'Pequeño (148 x 210 mm)',
            minMargins: { top: 12.7, bottom: 12.7, left: 12.7, right: 12.7 },
            recommended: true,
            type: 'paperback'
        },
        '5x8': {
            name: '5" × 8"',
            width: 127,
            height: 203,
            unit: 'mm',
            description: 'Pequeño (5" × 8")',
            minMargins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
            unit_imperial: 'inches',
            minMargins_imperial: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
            recommended: true,
            type: 'paperback'
        },
        'a4': {
            name: 'A4',
            width: 210,
            height: 297,
            unit: 'mm',
            description: 'Estándar (210 x 297 mm)',
            minMargins: { top: 15, bottom: 15, left: 15, right: 15 },
            recommended: true,
            type: 'paperback'
        },
        '6x9': {
            name: '6" × 9"',
            width: 152,
            height: 229,
            unit: 'mm',
            description: 'Estándar (6" × 9")',
            minMargins: { top: 0.5, bottom: 0.5, left: 0.75, right: 0.75 },
            unit_imperial: 'inches',
            minMargins_imperial: { top: 0.5, bottom: 0.5, left: 0.75, right: 0.75 },
            recommended: true,
            type: 'paperback'
        },
        '8x10': {
            name: '8" × 10"',
            width: 203,
            height: 254,
            unit: 'mm',
            description: 'Grande (8" × 10")',
            minMargins: { top: 0.5, bottom: 0.5, left: 0.75, right: 0.75 },
            unit_imperial: 'inches',
            minMargins_imperial: { top: 0.5, bottom: 0.5, left: 0.75, right: 0.75 },
            recommended: false,
            type: 'paperback'
        },
        'letter': {
            name: 'Letter',
            width: 216,
            height: 279,
            unit: 'mm',
            description: 'Carta (8.5" × 11")',
            minMargins: { top: 12.7, bottom: 12.7, left: 12.7, right: 12.7 },
            recommended: false,
            type: 'paperback'
        }
    },

    // ================================================================
    // CONFIGURACIONES POR TIPO DE LIBRO
    // ================================================================
    bookTypes: {
        'novela': {
            name: 'Novela / Ficción',
            recommendedFormat: '6x9',
            lineHeight: 1.5,
            fontSize: 12,
            fontFamily: 'Georgia, serif',
            marginTop: 0.75,
            marginBottom: 0.75,
            marginLeft: 0.75,
            marginRight: 0.75,
            gutter: 0.25,
            indent: 0.5,
            description: 'Configuración estándar para novelas y obras de ficción'
        },
        'ensayo': {
            name: 'Ensayo / No ficción',
            recommendedFormat: '6x9',
            lineHeight: 1.5,
            fontSize: 12,
            fontFamily: 'Times New Roman, serif',
            marginTop: 0.75,
            marginBottom: 0.75,
            marginLeft: 0.75,
            marginRight: 0.75,
            gutter: 0.25,
            indent: 0.5,
            description: 'Configuración para ensayos y libros de no ficción'
        },
        'poesia': {
            name: 'Poesía',
            recommendedFormat: '5x8',
            lineHeight: 1.6,
            fontSize: 11,
            fontFamily: 'Georgia, serif',
            marginTop: 1.0,
            marginBottom: 1.0,
            marginLeft: 1.0,
            marginRight: 1.0,
            gutter: 0.25,
            indent: 0,
            description: 'Configuración para libros de poesía'
        },
        'manual': {
            name: 'Manual / Técnico',
            recommendedFormat: 'a4',
            lineHeight: 1.4,
            fontSize: 10,
            fontFamily: 'Arial, sans-serif',
            marginTop: 1.0,
            marginBottom: 1.0,
            marginLeft: 1.0,
            marginRight: 1.0,
            gutter: 0.5,
            indent: 0,
            description: 'Configuración para manuales y libros técnicos'
        },
        'infantil': {
            name: 'Libro Infantil',
            recommendedFormat: '8x10',
            lineHeight: 1.6,
            fontSize: 14,
            fontFamily: 'Georgia, serif',
            marginTop: 0.75,
            marginBottom: 0.75,
            marginLeft: 0.75,
            marginRight: 0.75,
            gutter: 0.25,
            indent: 0.5,
            description: 'Configuración para libros infantiles'
        }
    },

    // ================================================================
    // ESTÁNDARES TIPOGRÁFICOS KDP
    // ================================================================
    typography: {
        fonts: {
            serif: ['Georgia', 'Times New Roman', 'Garamond', 'Merriweather'],
            sansSerif: ['Arial', 'Helvetica', 'Trebuchet MS', 'Verdana']
        },
        fontSizes: {
            body: { min: 10, max: 14, recommended: 12 },
            heading1: { min: 18, max: 24, recommended: 20 },
            heading2: { min: 16, max: 20, recommended: 18 },
            heading3: { min: 14, max: 18, recommended: 16 }
        },
        lineHeight: {
            min: 1.4,
            recommended: 1.5,
            max: 1.8
        },
        paragraphSpacing: {
            afterParagraph: { min: 6, max: 12, recommended: 8, unit: 'pt' }
        },
        indent: {
            firstLine: { min: 0.25, max: 0.75, recommended: 0.5, unit: 'inches' }
        }
    },

    // ================================================================
    // MÁRGENES MÍNIMOS POR KDP
    // ================================================================
    margins: {
        minimum: {
            paperback: {
                top: 0.5,
                bottom: 0.5,
                left: 0.75,
                right: 0.75,
                unit: 'inches'
            },
            hardcover: {
                top: 0.75,
                bottom: 0.75,
                left: 1.0,
                right: 1.0,
                unit: 'inches'
            }
        },
        recommended: {
            top: 0.75,
            bottom: 0.75,
            left: 0.75,
            right: 0.75,
            unit: 'inches'
        },
        gutter: {
            description: 'Espacio adicional en el lomo (hacia el margen interior)',
            min: 0,
            recommended: 0.25,
            max: 0.5,
            unit: 'inches'
        }
    },

    // ================================================================
    // SANGRÍA Y ESPACIADO
    // ================================================================
    spacing: {
        firstLineIndent: {
            description: 'Sangría de primera línea del párrafo',
            min: 0,
            recommended: 0.5,
            max: 0.75,
            unit: 'inches'
        },
        betweenParagraphs: {
            description: 'Espacio entre párrafos',
            min: 0,
            recommended: 0,
            note: 'Usar sangría de primera línea en lugar de espacio'
        },
        chapterBreak: {
            description: 'Espacio después del título de capítulo',
            min: 0.5,
            recommended: 1.0,
            max: 2.0,
            unit: 'inches'
        }
    },

    // ================================================================
    // ESPECIFICACIONES DE ARCHIVO
    // ================================================================
    fileRequirements: {
        format: ['PDF', 'DOCX', 'HTML', 'EPUB'],
        pdf: {
            colorSpace: 'CMYK o Escala de grises',
            resolution: '300 DPI mínimo',
            fonts: 'Todos embebidos',
            layers: 'Sin capas'
        },
        docx: {
            encoding: 'UTF-8',
            styles: 'Usar estilos de párrafo',
            images: 'Mínimo 300 DPI',
            maxSize: '50 MB'
        },
        epub: {
            version: 'EPUB 2.0 o superior',
            validation: 'Debe pasar validación EPUB'
        }
    },

    // ================================================================
    // NÚMERO DE PÁGINAS MÍNIMAS POR KDP
    // ================================================================
    minPages: {
        paperback: 24,
        hardcover: 28,
        description: 'Número mínimo de páginas recomendadas'
    },

    // ================================================================
    // NÚMERO MÁXIMO DE PÁGINAS
    // ================================================================
    maxPages: {
        paperback: 800,
        hardcover: 800,
        description: 'Número máximo de páginas por KDP'
    },

    // ================================================================
    // MÉTODO PARA OBTENER CONFIGURACIÓN POR TIPO DE LIBRO
    // ================================================================
    getBookTypeConfig: function(bookType) {
        return this.bookTypes[bookType] || this.bookTypes['novela'];
    },

    // ================================================================
    // MÉTODO PARA OBTENER FORMATO DE PÁGINA
    // ================================================================
    getPageFormat: function(formatId) {
        return this.pageFormats[formatId] || this.pageFormats['6x9'];
    },

    // ================================================================
    // MÉTODO PARA VALIDAR MÁRGENES
    // ================================================================
    validateMargins: function(margins, bookType = 'paperback') {
        const minMargins = this.margins.minimum[bookType];
        
        return {
            isValid: margins.top >= minMargins.top &&
                    margins.bottom >= minMargins.bottom &&
                    margins.left >= minMargins.left &&
                    margins.right >= minMargins.right,
            minMargins: minMargins,
            userMargins: margins
        };
    },

    // ================================================================
    // MÉTODO PARA OBTENER RECOMENDACIONES
    // ================================================================
    getRecommendations: function(bookType) {
        const config = this.getBookTypeConfig(bookType);
        const format = this.getPageFormat(config.recommendedFormat);
        
        return {
            bookType: config,
            pageFormat: format,
            margins: this.margins.recommended,
            typography: this.typography,
            spacing: this.spacing
        };
    }
};

// ================================================================
// EXPORTAR PARA USO EN LA APLICACIÓN
// ================================================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AMAZON_KDP_STANDARDS;
}
