export const KDP_STANDARDS = {
  pageFormats: {
    a5: {
      id: 'a5',
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
      id: '5x8',
      name: '5" × 8"',
      width: 127,
      height: 203,
      unit: 'mm',
      description: 'Pequeño (5" × 8")',
      minMargins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
      minMarginsImperial: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
      recommended: true,
      type: 'paperback'
    },
    a4: {
      id: 'a4',
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
      id: '6x9',
      name: '6" × 9"',
      width: 152,
      height: 229,
      unit: 'mm',
      description: 'Estándar (6" × 9")',
      minMargins: { top: 0.5, bottom: 0.5, left: 0.75, right: 0.75 },
      minMarginsImperial: { top: 0.5, bottom: 0.5, left: 0.75, right: 0.75 },
      recommended: true,
      type: 'paperback'
    },
    '8x10': {
      id: '8x10',
      name: '8" × 10"',
      width: 203,
      height: 254,
      unit: 'mm',
      description: 'Grande (8" × 10")',
      minMargins: { top: 0.5, bottom: 0.5, left: 0.75, right: 0.75 },
      minMarginsImperial: { top: 0.5, bottom: 0.5, left: 0.75, right: 0.75 },
      recommended: false,
      type: 'paperback'
    },
    letter: {
      id: 'letter',
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

  bookTypes: {
    novela: {
      id: 'novela',
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
    ensayo: {
      id: 'ensayo',
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
    poesia: {
      id: 'poesia',
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
    manual: {
      id: 'manual',
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
    infantil: {
      id: 'infantil',
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
    }
  },

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
    }
  },

  getBookTypeConfig(bookType) {
    return this.bookTypes[bookType] || this.bookTypes.novela;
  },

  getPageFormat(formatId) {
    return this.pageFormats[formatId] || this.pageFormats['6x9'];
  },

  getRecommendations(bookType) {
    const config = this.getBookTypeConfig(bookType);
    const format = this.getPageFormat(config.recommendedFormat);
    return {
      bookType: config,
      pageFormat: format,
      margins: this.margins.recommended,
      typography: this.typography,
      spacing: this.spacing
    };
  },

  validateMargins(margins, bookType = 'paperback') {
    const minMargins = this.margins.minimum[bookType];
    return {
      isValid: margins.top >= minMargins.top &&
        margins.bottom >= minMargins.bottom &&
        margins.left >= minMargins.left &&
        margins.right >= minMargins.right,
      minMargins,
      userMargins: margins
    };
  }
};

export default KDP_STANDARDS;
