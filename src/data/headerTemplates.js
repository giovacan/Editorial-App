/**
 * Header Templates Configuration
 * Professional header templates for book publishing
 */

/**
 * Header display mode options for UI
 */
export const HEADER_DISPLAY_MODES = [
  { value: 'alternate', label: 'Alternar (par/impar)' },
  { value: 'both', label: 'Ambas páginas' },
  { value: 'even-only', label: 'Solo páginas pares' },
  { value: 'odd-only', label: 'Solo páginas impares' }
];

/**
 * Subtopic behavior options for UI
 */
export const SUBTOPIC_BEHAVIORS = [
  { value: 'none', label: 'No mostrar', description: 'Ignora los subtemas detectados' },
  { value: 'replace', label: 'Reemplazar', description: 'El subtema reemplaza el contenido del header' },
  { value: 'combine', label: 'Combinar', description: 'Muestra contenido + subtema con separador' },
  { value: 'odd-only', label: 'Solo impares', description: 'Subtema solo en páginas impares' },
  { value: 'even-only', label: 'Solo pares', description: 'Subtema solo en páginas pares' }
];

/**
 * Separator options for combining content with subtopics
 */
export const SEPARATOR_OPTIONS = [
  { value: ' | ', label: 'Barra vertical (|)', example: 'Mi Libro | Subtema' },
  { value: ' • ', label: 'Punto medio (•)', example: 'Mi Libro • Subtema' },
  { value: ' — ', label: 'Guión largo (—)', example: 'Mi Libro — Subtema' },
  { value: ' / ', label: 'Diagonal (/)', example: 'Mi Libro / Subtema' },
  { value: ' · ', label: 'Punto centrado (·)', example: 'Mi Libro · Subtema' },
  { value: 'custom', label: 'Personalizado', example: 'Escribir separador...' }
];

/**
 * Subtopic position options for intuitive placement
 */
export const SUBTOPIC_POSITIONS = [
  { value: 'none', label: 'No mostrar', icon: '×' },
  { value: 'left', label: 'Izquierda', icon: '←' },
  { value: 'center', label: 'Centro', icon: '↔' },
  { value: 'right', label: 'Derecha', icon: '→' },
  { value: 'replace-left', label: 'Reemplazar izq.', icon: '⇐' },
  { value: 'replace-center', label: 'Reemplazar centro', icon: '⇔' },
  { value: 'replace-right', label: 'Reemplazar der.', icon: '⇒' }
];

/**
 * Default header page configurations for each template
 */
export const HEADER_TEMPLATES = {
  classic: {
    id: 'classic',
    name: 'Clásico',
    description: 'Título del libro a la izquierda, capítulo a la derecha con línea inferior',
    icon: '📖',
    evenPage: {
      leftContent: 'title',
      centerContent: 'none',
      rightContent: 'none'
    },
    oddPage: {
      leftContent: 'none',
      centerContent: 'none',
      rightContent: 'chapter'
    },
    showLine: true,
    lineStyle: 'solid',
    lineWidth: 0.5,
    lineColor: 'black',
    fontSize: 70,
    fontFamily: 'same',
    subtopicBehavior: 'none',
    subtopicSeparator: ' | ',
    subtopicMaxLength: 60
  },
  
  modern: {
    id: 'modern',
    name: 'Moderno',
    description: 'Minimalista con línea fina y número de página integrado',
    icon: '✨',
    evenPage: {
      leftContent: 'chapter',
      centerContent: 'none',
      rightContent: 'page'
    },
    oddPage: {
      leftContent: 'page',
      centerContent: 'none',
      rightContent: 'chapter'
    },
    showLine: true,
    lineStyle: 'solid',
    lineWidth: 0.25,
    lineColor: 'gray',
    fontSize: 65,
    fontFamily: 'sans',
    subtopicBehavior: 'none',
    subtopicSeparator: ' | ',
    subtopicMaxLength: 60
  },
  
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    description: 'Solo texto centrado, sin líneas ni decoraciones',
    icon: '○',
    evenPage: {
      leftContent: 'none',
      centerContent: 'chapter',
      rightContent: 'none'
    },
    oddPage: {
      leftContent: 'none',
      centerContent: 'chapter',
      rightContent: 'none'
    },
    showLine: false,
    lineStyle: 'solid',
    lineWidth: 0,
    lineColor: 'light-gray',
    fontSize: 70,
    fontFamily: 'same',
    subtopicBehavior: 'none',
    subtopicSeparator: ' | ',
    subtopicMaxLength: 60
  },
  
  academic: {
    id: 'academic',
    name: 'Académico',
    description: 'Estilo tesis universitaria con línea doble y subtemas',
    icon: '🎓',
    evenPage: {
      leftContent: 'title',
      centerContent: 'none',
      rightContent: 'subheader'
    },
    oddPage: {
      leftContent: 'subheader',
      centerContent: 'none',
      rightContent: 'page'
    },
    showLine: true,
    lineStyle: 'double',
    lineWidth: 0.5,
    lineColor: 'black',
    fontSize: 70,
    fontFamily: 'same',
    trackSubheaders: true,
    subheaderLevels: ['h1', 'h2'],
    subheaderFormat: 'numbered',
    subtopicBehavior: 'combine',
    subtopicSeparator: ' • ',
    subtopicMaxLength: 40
  },
  
  literary: {
    id: 'literary',
    name: 'Literario',
    description: 'Estilo novela editorial, alterna título/capítulo en páginas par/impar',
    icon: '📚',
    evenPage: {
      leftContent: 'title',
      centerContent: 'none',
      rightContent: 'none'
    },
    oddPage: {
      leftContent: 'none',
      centerContent: 'none',
      rightContent: 'chapter'
    },
    showLine: true,
    lineStyle: 'solid',
    lineWidth: 0.5,
    lineColor: 'gray',
    fontSize: 65,
    fontFamily: 'small-caps',
    subtopicBehavior: 'replace',
    subtopicSeparator: ' — ',
    subtopicMaxLength: 50
  },
  
  subtopic: {
    id: 'subtopic',
    name: 'Con Subtemas',
    description: 'Enfocado en subtemas detectados automáticamente',
    icon: '🏷️',
    evenPage: {
      leftContent: 'subheader',
      centerContent: 'none',
      rightContent: 'title'
    },
    oddPage: {
      leftContent: 'title',
      centerContent: 'none',
      rightContent: 'subheader'
    },
    showLine: true,
    lineStyle: 'solid',
    lineWidth: 0.5,
    lineColor: 'black',
    fontSize: 70,
    fontFamily: 'same',
    trackSubheaders: true,
    subheaderLevels: ['h1', 'h2', 'h3'],
    subheaderFormat: 'full',
    subtopicBehavior: 'combine',
    subtopicSeparator: ' | ',
    subtopicMaxLength: 60
  },
  
  custom: {
    id: 'custom',
    name: 'Personalizado',
    description: 'Configura cada elemento según tus necesidades',
    icon: '⚙️',
    evenPage: {
      leftContent: 'title',
      centerContent: 'none',
      rightContent: 'chapter'
    },
    oddPage: {
      leftContent: 'chapter',
      centerContent: 'none',
      rightContent: 'page'
    },
    showLine: true,
    lineStyle: 'solid',
    lineWidth: 0.5,
    lineColor: 'black',
    fontSize: 70,
    fontFamily: 'same',
    subtopicBehavior: 'none',
    subtopicSeparator: ' | ',
    subtopicMaxLength: 60
  }
};

/**
 * Default header configuration
 */
export const DEFAULT_HEADER_CONFIG = {
  enabled: false,
  template: 'classic',
  displayMode: 'alternate',
  evenPage: {
    leftContent: 'title',
    centerContent: 'none',
    rightContent: 'none'
  },
  oddPage: {
    leftContent: 'none',
    centerContent: 'none',
    rightContent: 'chapter'
  },
  trackSubheaders: false,
  trackPseudoHeaders: false,
  subtopicBehavior: 'none',
  subtopicSeparator: ' | ',
  subtopicMaxLength: 60,
  subheaderLevels: ['h1', 'h2'],
  subheaderFormat: 'full',
  fontFamily: 'same',
  fontSize: 70,
  showLine: true,
  lineStyle: 'solid',
  lineWidth: 0.5,
  lineColor: 'black',
  marginTop: 0,
  marginBottom: 0.5,
  distanceFromPageNumber: 0.5,
  whenPaginationSamePosition: 'merge',
  skipFirstChapterPage: true
};

/**
 * Get header configuration for a specific template
 */
export function getHeaderTemplateConfig(templateId) {
  const template = HEADER_TEMPLATES[templateId];
  if (!template) {
    return DEFAULT_HEADER_CONFIG;
  }
  
  return {
    template: templateId,
    evenPage: { ...template.evenPage },
    oddPage: { ...template.oddPage },
    showLine: template.showLine,
    lineStyle: template.lineStyle,
    lineWidth: template.lineWidth,
    lineColor: template.lineColor,
    fontSize: template.fontSize,
    fontFamily: template.fontFamily,
    trackSubheaders: template.trackSubheaders || false,
    subheaderLevels: template.subheaderLevels || ['h1', 'h2'],
    subheaderFormat: template.subheaderFormat || 'full'
  };
}

/**
 * Get recommended header template based on book type
 */
export function getRecommendedHeaderTemplate(bookType) {
  const recommendations = {
    novela: 'literary',
    ensayo: 'classic',
    poesia: 'minimal',
    manual: 'academic',
    infantil: 'minimal'
  };
  
  return recommendations[bookType] || 'classic';
}

/**
 * Content type labels for UI
 */
export const HEADER_CONTENT_LABELS = {
  title: 'Título del libro',
  chapter: 'Capítulo actual',
  subheader: 'Subtema actual',
  page: 'Número de página',
  none: 'Vacío'
};

/**
 * Line style options for UI
 */
export const LINE_STYLE_OPTIONS = [
  { value: 'solid', label: 'Sólida' },
  { value: 'dashed', label: 'Guiones' },
  { value: 'dotted', label: 'Punteada' },
  { value: 'double', label: 'Doble' }
];

/**
 * Font style options for UI
 */
export const FONT_STYLE_OPTIONS = [
  { value: 'same', label: 'Misma que el texto' },
  { value: 'sans', label: 'Sans Serif' },
  { value: 'small-caps', label: 'Versalitas' }
];

/**
 * Subheader format options for UI
 */
export const SUBHEADER_FORMAT_OPTIONS = [
  { value: 'full', label: 'Texto completo' },
  { value: 'short', label: 'Texto corto (con ...)' },
  { value: 'numbered', label: 'Con numeración' }
];

/**
 * Pagination conflict resolution options
 */
export const PAGINATION_CONFLICT_OPTIONS = [
  { value: 'stack', label: 'Apilar (header arriba, página abajo)' },
  { value: 'merge', label: 'Fusionar (en misma línea)' },
  { value: 'separate', label: 'Separar (con espacio entre ellos)' }
];
