export interface PageFormat {
  id: string;
  name: string;
  width: number;
  height: number;
  unit: 'mm' | 'inches';
  description: string;
  minMargins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  minMarginsImperial?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  recommended: boolean;
  type: 'paperback' | 'hardcover';
}

export interface BookType {
  id: string;
  name: string;
  recommendedFormat: string;
  lineHeight: number;
  fontSize: number;
  fontFamily: string;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  gutter: number;
  indent: number;
  description: string;
}

export interface Margins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface MarginsConfig {
  minimum: {
    paperback: Margins & { unit: string };
    hardcover: Margins & { unit: string };
  };
  recommended: Margins & { unit: string };
}

export interface Typography {
  fonts: {
    serif: string[];
    sansSerif: string[];
  };
  fontSizes: {
    body: { min: number; max: number; recommended: number };
    heading1: { min: number; max: number; recommended: number };
    heading2: { min: number; max: number; recommended: number };
    heading3: { min: number; max: number; recommended: number };
  };
  lineHeight: {
    min: number;
    recommended: number;
    max: number;
  };
}

export interface KDPStandards {
  pageFormats: Record<string, PageFormat>;
  bookTypes: Record<string, BookType>;
  margins: MarginsConfig;
  typography: Typography;
  getBookTypeConfig: (bookType: string) => BookType;
  getPageFormat: (formatId: string) => PageFormat;
  getRecommendations: (bookType: string) => {
    bookType: BookType;
    pageFormat: PageFormat;
    margins: Margins;
    typography: Typography;
  };
  validateMargins: (margins: Margins, bookType?: string) => {
    isValid: boolean;
    minMargins: Margins;
    userMargins: Margins;
  };
}

export const KDP_STANDARDS: KDPStandards = {
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
    },
    'half-letter': {
      id: 'half-letter',
      name: 'Half Letter',
      width: 140,
      height: 216,
      unit: 'mm',
      description: 'Media Carta (5.5" × 8.5")',
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
      serif: ['Georgia', 'Times New Roman', 'Garamond', 'Merriweather', 'Palatino', 'Book Antiqua', 'Cambria', 'Baskerville'],
      sansSerif: ['Arial', 'Helvetica', 'Trebuchet MS', 'Verdana', 'Calibri', 'Segoe UI', 'Tahoma', 'Gill Sans'],
      display: ['Courier New', 'Consolas', 'Lucida Console']
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
      max: 2.0
    }
  },

  getBookTypeConfig(bookType: string): BookType {
    return this.bookTypes[bookType] || this.bookTypes.novela;
  },

  getPageFormat(formatId: string): PageFormat {
    return this.pageFormats[formatId] || this.pageFormats['6x9'];
  },

  getRecommendations(bookType: string) {
    const config = this.getBookTypeConfig(bookType);
    const format = this.getPageFormat(config.recommendedFormat);
    return {
      bookType: config,
      pageFormat: format,
      margins: this.margins.recommended,
      typography: this.typography
    };
  },

  validateMargins(margins: Margins, bookType: string = 'paperback') {
    const minMargins = this.margins.minimum[bookType as 'paperback' | 'hardcover'];
    return {
      isValid: 
        margins.top >= minMargins.top &&
        margins.bottom >= minMargins.bottom &&
        margins.left >= minMargins.left &&
        margins.right >= minMargins.right,
      minMargins,
      userMargins: margins
    };
  },

  getDynamicGutter(pageFormatId: string, bookType: string, pageCount: number = 0): number {
    const format = this.getPageFormat(pageFormatId);
    
    const widthInches = format.unit === 'mm' ? format.width / 25.4 : format.width;
    
    let baseGutter: number;
    if (widthInches <= 5.5) {
      baseGutter = 0.25;
    } else if (widthInches <= 6.5) {
      baseGutter = 0.25;
    } else if (widthInches <= 8.5) {
      baseGutter = 0.375;
    } else if (widthInches <= 11) {
      baseGutter = 0.5;
    } else {
      baseGutter = 0.625;
    }

    if (pageCount <= 0) {
      return baseGutter;
    }

    const pageCountGutter = this.getGutterByPageCount(pageCount, widthInches);
    
    return Math.max(baseGutter, pageCountGutter);
  },

  getGutterByPageCount(pageCount: number, widthInches: number): number {
    const isLargeFormat = widthInches > 7;
    
    if (pageCount <= 60) {
      return isLargeFormat ? 0.375 : 0.25;
    } else if (pageCount <= 100) {
      return isLargeFormat ? 0.5 : 0.375;
    } else if (pageCount <= 200) {
      return isLargeFormat ? 0.625 : 0.5;
    } else if (pageCount <= 300) {
      return isLargeFormat ? 0.75 : 0.625;
    } else if (pageCount <= 400) {
      return isLargeFormat ? 0.875 : 0.75;
    } else if (pageCount <= 500) {
      return isLargeFormat ? 1.0 : 0.875;
    } else {
      return isLargeFormat ? 1.125 : 1.0;
    }
  },

  getCustomPageDimensions(width: number, height: number, unit: 'mm' | 'cm' | 'in'): { widthMm: number; heightMm: number; widthIn: number; heightIn: number } {
    let widthMm: number, heightMm: number;
    
    switch (unit) {
      case 'mm':
        widthMm = width;
        heightMm = height;
        break;
      case 'cm':
        widthMm = width * 10;
        heightMm = height * 10;
        break;
      case 'in':
        widthMm = width * 25.4;
        heightMm = height * 25.4;
        break;
    }
    
    return {
      widthMm,
      heightMm,
      widthIn: widthMm / 25.4,
      heightIn: heightMm / 25.4
    };
  }
};

export default KDP_STANDARDS;
