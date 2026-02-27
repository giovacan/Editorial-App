/**
 * Header and Page Number Conflict Resolution System
 * Handles positioning conflicts between headers and page numbers
 */

/**
 * Conflict resolution strategies
 */
export const CONFLICT_STRATEGIES = {
  STACK: 'stack',        // Header on top, page number below
  MERGE: 'merge',        // Both on same line with separator
  SEPARATE: 'separate',  // Header on top, page number at bottom
  HEADER_ONLY: 'header-only',  // Only show header
  PAGE_ONLY: 'page-only'       // Only show page number
};

/**
 * Calculate available space for header and page number
 */
export function calculateAvailableSpace(headerConfig, pageConfig, contentHeight, baseFontSize) {
  const headerHeight = calculateHeaderHeight(headerConfig, baseFontSize);
  const pageNumberHeight = calculatePageNumberHeight(pageConfig, baseFontSize);
  const marginBetween = headerConfig.distanceFromPageNumber || 0.5;
  
  return {
    headerHeight,
    pageNumberHeight,
    marginBetween,
    totalRequired: headerHeight + (marginBetween * baseFontSize) + pageNumberHeight,
    available: contentHeight
  };
}

/**
 * Calculate header height based on configuration
 */
export function calculateHeaderHeight(headerConfig, baseFontSize) {
  const fontSize = (headerConfig.fontSize || 70) * (baseFontSize / 12);
  const lineHeight = 1.2;
  const marginTop = headerConfig.marginTop || 0;
  const marginBottom = headerConfig.marginBottom || 0.5;
  
  // Header text height + margins + line height
  return (fontSize * lineHeight) + (marginTop * baseFontSize) + (marginBottom * baseFontSize);
}

/**
 * Calculate page number height
 */
export function calculatePageNumberHeight(pageConfig, baseFontSize) {
  const fontSize = baseFontSize * 0.8; // Page numbers are typically smaller
  const lineHeight = 1.2;
  return fontSize * lineHeight;
}

/**
 * Detect conflicts between header and page number positioning
 */
export function detectHeaderPageNumberConflict(headerConfig, pageConfig, contentHeight, baseFontSize) {
  const space = calculateAvailableSpace(headerConfig, pageConfig, contentHeight, baseFontSize);
  
  const hasConflict = space.totalRequired > space.available;
  
  return {
    hasConflict,
    space,
    conflictType: hasConflict ? 'overlap' : 'none',
    severity: hasConflict ? 'high' : 'none'
  };
}

/**
 * Resolve conflicts using the configured strategy
 */
export function resolveHeaderPageNumberConflict(headerConfig, pageConfig, contentHeight, baseFontSize, strategy = 'merge') {
  const conflict = detectHeaderPageNumberConflict(headerConfig, pageConfig, contentHeight, baseFontSize);
  
  if (!conflict.hasConflict) {
    return {
      resolved: true,
      strategy: 'none',
      headerPosition: { top: 0, bottom: conflict.space.headerHeight },
      pageNumberPosition: { top: contentHeight - conflict.space.pageNumberHeight, bottom: contentHeight },
      layout: 'normal'
    };
  }
  
  switch (strategy) {
    case CONFLICT_STRATEGIES.STACK:
      return resolveStackStrategy(headerConfig, pageConfig, contentHeight, baseFontSize, conflict);
      
    case CONFLICT_STRATEGIES.MERGE:
      return resolveMergeStrategy(headerConfig, pageConfig, contentHeight, baseFontSize, conflict);
      
    case CONFLICT_STRATEGIES.SEPARATE:
      return resolveSeparateStrategy(headerConfig, pageConfig, contentHeight, baseFontSize, conflict);
      
    case CONFLICT_STRATEGIES.HEADER_ONLY:
      return resolveHeaderOnlyStrategy(headerConfig, pageConfig, contentHeight, baseFontSize, conflict);
      
    case CONFLICT_STRATEGIES.PAGE_ONLY:
      return resolvePageOnlyStrategy(headerConfig, pageConfig, contentHeight, baseFontSize, conflict);
      
    default:
      return resolveMergeStrategy(headerConfig, pageConfig, contentHeight, baseFontSize, conflict);
  }
}

/**
 * Stack strategy: Header on top, page number below
 */
function resolveStackStrategy(headerConfig, pageConfig, contentHeight, baseFontSize, conflict) {
  const headerHeight = conflict.space.headerHeight;
  const pageNumberHeight = conflict.space.pageNumberHeight;
  const marginBetween = conflict.space.marginBetween;
  
  const totalHeight = headerHeight + marginBetween + pageNumberHeight;
  const scale = contentHeight / totalHeight;
  
  const scaledHeaderHeight = headerHeight * scale;
  const scaledMargin = marginBetween * scale;
  const scaledPageNumberHeight = pageNumberHeight * scale;
  
  return {
    resolved: true,
    strategy: 'stack',
    headerPosition: { top: 0, bottom: scaledHeaderHeight },
    pageNumberPosition: { top: scaledHeaderHeight + scaledMargin, bottom: contentHeight },
    layout: 'stacked',
    scaling: scale,
    adjustments: {
      headerFontSize: (headerConfig.fontSize || 70) * scale,
      pageNumberFontSize: baseFontSize * 0.8 * scale
    }
  };
}

/**
 * Merge strategy: Both on same line with separator
 */
function resolveMergeStrategy(headerConfig, pageConfig, contentHeight, baseFontSize, conflict) {
  const headerHeight = conflict.space.headerHeight;
  const pageNumberHeight = conflict.space.pageNumberHeight;
  
  // Find the maximum height and use it for both
  const maxHeight = Math.max(headerHeight, pageNumberHeight);
  
  // Scale down if necessary
  const scale = contentHeight / maxHeight;
  
  return {
    resolved: true,
    strategy: 'merge',
    headerPosition: { top: 0, bottom: maxHeight * scale },
    pageNumberPosition: { top: 0, bottom: maxHeight * scale },
    layout: 'merged',
    scaling: scale,
    adjustments: {
      headerFontSize: (headerConfig.fontSize || 70) * scale,
      pageNumberFontSize: baseFontSize * 0.8 * scale
    }
  };
}

/**
 * Separate strategy: Header on top, page number at bottom
 */
function resolveSeparateStrategy(headerConfig, pageConfig, contentHeight, baseFontSize, conflict) {
  const headerHeight = conflict.space.headerHeight;
  const pageNumberHeight = conflict.space.pageNumberHeight;
  
  // Scale both elements proportionally
  const totalNeeded = headerHeight + pageNumberHeight;
  const scale = contentHeight / totalNeeded;
  
  const scaledHeaderHeight = headerHeight * scale;
  const scaledPageNumberHeight = pageNumberHeight * scale;
  
  return {
    resolved: true,
    strategy: 'separate',
    headerPosition: { top: 0, bottom: scaledHeaderHeight },
    pageNumberPosition: { top: contentHeight - scaledPageNumberHeight, bottom: contentHeight },
    layout: 'separated',
    scaling: scale,
    adjustments: {
      headerFontSize: (headerConfig.fontSize || 70) * scale,
      pageNumberFontSize: baseFontSize * 0.8 * scale
    }
  };
}

/**
 * Header only strategy: Hide page number
 */
function resolveHeaderOnlyStrategy(headerConfig, pageConfig, contentHeight, baseFontSize, conflict) {
  const headerHeight = conflict.space.headerHeight;
  const scale = contentHeight / headerHeight;
  
  return {
    resolved: true,
    strategy: 'header-only',
    headerPosition: { top: 0, bottom: headerHeight * scale },
    pageNumberPosition: null,
    layout: 'header-only',
    scaling: scale,
    adjustments: {
      headerFontSize: (headerConfig.fontSize || 70) * scale,
      pageNumberFontSize: 0
    }
  };
}

/**
 * Page only strategy: Hide header
 */
function resolvePageOnlyStrategy(headerConfig, pageConfig, contentHeight, baseFontSize, conflict) {
  const pageNumberHeight = conflict.space.pageNumberHeight;
  const scale = contentHeight / pageNumberHeight;
  
  return {
    resolved: true,
    strategy: 'page-only',
    headerPosition: null,
    pageNumberPosition: { top: contentHeight - pageNumberHeight * scale, bottom: contentHeight },
    layout: 'page-only',
    scaling: scale,
    adjustments: {
      headerFontSize: 0,
      pageNumberFontSize: baseFontSize * 0.8 * scale
    }
  };
}

/**
 * Generate CSS styles for resolved layout
 */
export function generateResolvedStyles(resolution, headerConfig, pageConfig, baseFontSize) {
  const styles = {
    header: {},
    pageNumber: {},
    container: {}
  };
  
  if (resolution.headerPosition) {
    styles.header = {
      position: 'absolute',
      top: `${resolution.headerPosition.top}px`,
      left: '0',
      right: '0',
      height: `${resolution.headerPosition.bottom - resolution.headerPosition.top}px`,
      fontSize: `${resolution.adjustments?.headerFontSize || (headerConfig.fontSize || 70)}pt`,
      lineHeight: '1.2',
      display: 'flex',
      alignItems: 'center',
      justifyContent: headerConfig.evenPage?.centerContent === 'none' && headerConfig.oddPage?.centerContent === 'none' 
        ? 'space-between' 
        : 'center'
    };
  }
  
  if (resolution.pageNumberPosition) {
    styles.pageNumber = {
      position: 'absolute',
      top: `${resolution.pageNumberPosition.top}px`,
      right: '24px',
      fontSize: `${resolution.adjustments?.pageNumberFontSize || (baseFontSize * 0.8)}pt`,
      lineHeight: '1.2'
    };
  }
  
  if (resolution.layout === 'merged') {
    styles.container.display = 'flex';
    styles.container.justifyContent = 'space-between';
    styles.container.alignItems = 'center';
  }
  
  return styles;
}

/**
 * Auto-detect best strategy based on content and preferences
 */
export function autoDetectBestStrategy(headerConfig, pageConfig, contentHeight, baseFontSize) {
  const conflict = detectHeaderPageNumberConflict(headerConfig, pageConfig, contentHeight, baseFontSize);
  
  if (!conflict.hasConflict) {
    return CONFLICT_STRATEGIES.MERGE; // Default when no conflict
  }
  
  // Prefer merge for academic and professional documents
  if (headerConfig.template === 'academic') {
    return CONFLICT_STRATEGIES.MERGE;
  }
  
  // Prefer stack for literary and classic templates
  if (headerConfig.template === 'literary' || headerConfig.template === 'classic') {
    return CONFLICT_STRATEGIES.STACK;
  }
  
  // Prefer separate for minimal templates
  if (headerConfig.template === 'minimal') {
    return CONFLICT_STRATEGIES.SEPARATE;
  }
  
  // Default to merge for custom templates
  return CONFLICT_STRATEGIES.MERGE;
}

/**
 * Validate resolution and provide warnings
 */
export function validateResolution(resolution, headerConfig, pageConfig, contentHeight) {
  const warnings = [];
  const errors = [];
  
  if (resolution.scaling < 0.5) {
    warnings.push('La escala de elementos es muy pequeña, puede afectar la legibilidad');
  }
  
  if (resolution.scaling > 1.2) {
    warnings.push('La escala de elementos es muy grande, puede causar desbordamiento');
  }
  
  if (resolution.strategy === 'header-only' && pageConfig.showPageNumbers) {
    warnings.push('Se está ocultando el número de página según la configuración de conflicto');
  }
  
  if (resolution.strategy === 'page-only' && headerConfig.enabled) {
    warnings.push('Se está ocultando el encabezado según la configuración de conflicto');
  }
  
  return {
    warnings,
    errors,
    isValid: errors.length === 0
  };
}

/**
 * Complete conflict resolution pipeline
 */
export function resolveHeaderPageNumberConflicts(headerConfig, pageConfig, contentHeight, baseFontSize) {
  const strategy = autoDetectBestStrategy(headerConfig, pageConfig, contentHeight, baseFontSize);
  const resolution = resolveHeaderPageNumberConflict(headerConfig, pageConfig, contentHeight, baseFontSize, strategy);
  const validation = validateResolution(resolution, headerConfig, pageConfig, contentHeight);
  const styles = generateResolvedStyles(resolution, headerConfig, pageConfig, baseFontSize);
  
  return {
    resolution,
    validation,
    styles,
    strategy,
    conflict: detectHeaderPageNumberConflict(headerConfig, pageConfig, contentHeight, baseFontSize)
  };
}