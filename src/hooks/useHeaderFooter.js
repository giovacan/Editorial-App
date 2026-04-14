import { useMemo } from 'react';

export const useHeaderFooter = (config, currentPageData, totalPages, bookTitle) => {
  const safePageData = currentPageData || { pageNumber: 1, chapterTitle: '', currentSubheader: '', isBlank: false, isFirstChapterPage: false };
  const headerConfig = config?.header || {};
  const showHeaders = config?.showHeaders !== false && headerConfig.enabled !== false;
  
  const isEvenPage = safePageData.pageNumber ? safePageData.pageNumber % 2 === 0 : false;
  const subtopicMaxLength = headerConfig.subtopicMaxLength || 60;
  const subtopicSeparator = headerConfig.subtopicSeparator || ' | ';
  
  const truncatedSubheader = useMemo(() => {
    const subheader = safePageData?.currentSubheader || '';
    if (subheader.length > subtopicMaxLength) {
      return subheader.substring(0, subtopicMaxLength - 3) + '...';
    }
    return subheader;
  }, [safePageData?.currentSubheader, subtopicMaxLength]);
  
  const subtopicBehavior = headerConfig.subtopicBehavior || 'none';
  
  // Si trackPseudoHeaders está activo pero subtopicBehavior es 'none', usar 'replace' por defecto
  const effectiveSubtopicBehavior = (headerConfig.trackPseudoHeaders && subtopicBehavior === 'none') 
    ? 'replace' 
    : subtopicBehavior;
  
  const getHeaderContent = (contentType) => {
    const baseContent = (() => {
      switch (contentType) {
        case 'title': return bookTitle || 'Sin título';
        case 'chapter': return safePageData?.chapterTitle || 'Capítulo';
        case 'subheader': return truncatedSubheader;
        case 'page': return String(safePageData?.pageNumber || '');
        default: return '';
      }
    })();
    
    if (truncatedSubheader && effectiveSubtopicBehavior !== 'none' && contentType !== 'page') {
      switch (effectiveSubtopicBehavior) {
        case 'replace':
          return truncatedSubheader;
        case 'combine':
          return baseContent ? `${baseContent}${subtopicSeparator}${truncatedSubheader}` : truncatedSubheader;
        case 'odd-only':
          if (!isEvenPage) return truncatedSubheader;
          return baseContent;
        case 'even-only':
          if (isEvenPage) return truncatedSubheader;
          return baseContent;
        default:
          return baseContent;
      }
    }
    
    return baseContent;
  };
  
  const displayMode = headerConfig.displayMode || 'alternate';
  
  const shouldSkipHeader = () => {
    if (!headerConfig.skipFirstChapterPage) return false;
    return safePageData?.isFirstChapterPage === true;
  };
  
  let shouldShowHeader = false;
  let pageConfig;
  
  switch (displayMode) {
    case 'both':
      shouldShowHeader = true;
      pageConfig = headerConfig.evenPage || { leftContent: 'title', centerContent: 'none', rightContent: 'none' };
      break;
    case 'even-only':
      shouldShowHeader = isEvenPage;
      pageConfig = headerConfig.evenPage || { leftContent: 'title', centerContent: 'none', rightContent: 'none' };
      break;
    case 'odd-only':
      shouldShowHeader = !isEvenPage;
      pageConfig = headerConfig.oddPage || { leftContent: 'none', centerContent: 'none', rightContent: 'chapter' };
      break;
    case 'alternate':
    default:
      shouldShowHeader = true;
      pageConfig = isEvenPage 
        ? (headerConfig.evenPage || { leftContent: 'title', centerContent: 'none', rightContent: 'none' })
        : (headerConfig.oddPage || { leftContent: 'none', centerContent: 'none', rightContent: 'chapter' });
      break;
  }
  
  const headerLeft = useMemo(() => {
    if (!showHeaders || safePageData?.isBlank || shouldSkipHeader() || !shouldShowHeader) return '';
    if (headerConfig.template) {
      return getHeaderContent(pageConfig?.leftContent);
    }
    return '';
  }, [showHeaders, safePageData, shouldShowHeader, headerConfig, pageConfig]);
  
  const headerCenter = useMemo(() => {
    if (!showHeaders || safePageData?.isBlank || shouldSkipHeader() || !shouldShowHeader) return '';
    if (headerConfig.template) {
      return getHeaderContent(pageConfig?.centerContent);
    }
    if (headerConfig.content === 'title') {
      return bookTitle;
    } else if (headerConfig.content === 'chapter') {
      return safePageData?.chapterTitle || '';
    }
    if (isEvenPage) {
      return bookTitle;
    }
    return safePageData?.chapterTitle || '';
  }, [showHeaders, safePageData, shouldShowHeader, headerConfig, bookTitle, isEvenPage]);
  
  const headerRight = useMemo(() => {
    if (!showHeaders || safePageData?.isBlank || shouldSkipHeader() || !shouldShowHeader) return '';
    if (headerConfig.template) {
      return getHeaderContent(pageConfig?.rightContent);
    }
    if (!isEvenPage) {
      return safePageData?.chapterTitle || '';
    }
    return '';
  }, [showHeaders, safePageData, shouldShowHeader, headerConfig, isEvenPage]);
  
  const showFooter = headerConfig.enabled !== false && headerConfig.showPageNumbers !== false;
  
  return {
    showHeaders,
    showFooter,
    headerLeft,
    headerCenter,
    headerRight,
    shouldShowHeader,
    isEvenPage,
    headerConfig,
    truncatedSubheader,
    subtopicBehavior: effectiveSubtopicBehavior,
    subtopicSeparator
  };
};

/**
 * Pure function — builds the header HTML string directly from a Page object + config.
 * No React hooks. Safe to call in loops, workers, and non-React contexts
 * (ExportPreviewModal, exporters.js, usePagination measurement).
 *
 * @param {object} page        - Page object {pageNumber, chapterTitle, currentSubheader,
 *                               isBlank, isFirstChapterPage}
 * @param {object} config      - safeConfig (config.header, config.showHeaders, …)
 * @param {string} bookTitle   - bookData.title
 * @param {number} baseFontSize - scaledFontPt = config.fontSize * previewScale
 * @returns {string} HTML string, or '' if header should not be shown
 */
/**
 * Pure: returns resolved text for each header cell on this page.
 * Extracts the content-resolution logic so PDF renderer and other consumers
 * can access it directly without building HTML.
 *
 * @param {object} page      - {pageNumber, chapterTitle, currentSubheader, isBlank, isFirstChapterPage}
 * @param {object} config    - safeConfig
 * @param {string} bookTitle
 * @returns {{ left: string, center: string, right: string, show: boolean }}
 */
export function resolveHeaderContent(page, config, bookTitle) {
  const headerConfig = config?.header || {};
  const showHeaders  = config?.showHeaders !== false && headerConfig.enabled !== false;
  if (!showHeaders || page?.isBlank) return { left: '', center: '', right: '', show: false };
  if (headerConfig.skipFirstChapterPage && page?.isFirstChapterPage) return { left: '', center: '', right: '', show: false };

  const pageNumber   = page?.pageNumber || 1;
  const isEvenPage   = pageNumber % 2 === 0;
  const chapterTitle = page?.chapterTitle || '';
  const rawSubheader = page?.currentSubheader || '';

  const subtopicMaxLength = headerConfig.subtopicMaxLength || 60;
  const truncatedSubheader = rawSubheader.length > subtopicMaxLength
    ? rawSubheader.substring(0, subtopicMaxLength - 3) + '...'
    : rawSubheader;

  const subtopicBehavior = headerConfig.subtopicBehavior || 'none';
  const effectiveSubtopicBehavior =
    (headerConfig.trackPseudoHeaders && subtopicBehavior === 'none') ? 'replace' : subtopicBehavior;
  const subtopicSeparator = headerConfig.subtopicSeparator || ' | ';

  const getContent = (contentType) => {
    const base = (() => {
      switch (contentType) {
        case 'title':     return bookTitle || 'Sin título';
        case 'chapter':   return chapterTitle || 'Capítulo';
        case 'subheader': return truncatedSubheader;
        case 'page':      return String(pageNumber);
        default:          return '';
      }
    })();
    if (truncatedSubheader && effectiveSubtopicBehavior !== 'none' && contentType !== 'page') {
      switch (effectiveSubtopicBehavior) {
        case 'replace':   return truncatedSubheader;
        case 'combine':   return base ? `${base}${subtopicSeparator}${truncatedSubheader}` : truncatedSubheader;
        case 'odd-only':  return !isEvenPage ? truncatedSubheader : base;
        case 'even-only': return isEvenPage  ? truncatedSubheader : base;
        default:          return base;
      }
    }
    return base;
  };

  const displayMode = headerConfig.displayMode || 'alternate';
  let shouldShowHeader = false;
  let pageConfig;

  switch (displayMode) {
    case 'both':
      shouldShowHeader = true;
      pageConfig = headerConfig.evenPage || { leftContent: 'title',  centerContent: 'none', rightContent: 'none' };
      break;
    case 'even-only':
      shouldShowHeader = isEvenPage;
      pageConfig = headerConfig.evenPage || { leftContent: 'title',  centerContent: 'none', rightContent: 'none' };
      break;
    case 'odd-only':
      shouldShowHeader = !isEvenPage;
      pageConfig = headerConfig.oddPage  || { leftContent: 'none',   centerContent: 'none', rightContent: 'chapter' };
      break;
    case 'alternate':
    default:
      shouldShowHeader = true;
      pageConfig = isEvenPage
        ? (headerConfig.evenPage || { leftContent: 'title',  centerContent: 'none', rightContent: 'none' })
        : (headerConfig.oddPage  || { leftContent: 'none',   centerContent: 'none', rightContent: 'chapter' });
      break;
  }

  if (!shouldShowHeader) return { left: '', center: '', right: '', show: false };

  let left = '', center = '', right = '';

  if (headerConfig.template) {
    left   = getContent(pageConfig?.leftContent);
    center = getContent(pageConfig?.centerContent);
    right  = getContent(pageConfig?.rightContent);
  } else {
    // Legacy mode (no template)
    center = isEvenPage ? (bookTitle || '') : '';
    right  = !isEvenPage ? (chapterTitle || '') : '';
  }

  return { left, center, right, show: !!(left || center || right) };
}

export const buildHeaderHtmlPure = (page, config, bookTitle, baseFontSize) => {
  const { left, center, right, show } = resolveHeaderContent(page, config, bookTitle);
  if (!show) return '';
  const pageNumber  = page?.pageNumber || 1;
  const isEvenPage  = pageNumber % 2 === 0;
  const folioPos    = config?.pageNumberPos   || 'bottom';
  const folioAlign  = config?.pageNumberAlign || 'center';
  // When the folio is at the top on the outer edge, embed the number directly
  // in the header flex row (avoids absolute-position overlap).
  // For center alignment, the folio stays absolute and the header stacks below it.
  const folioOnOuter = folioAlign === 'outer' || folioAlign === 'paragraph-edge' || folioAlign === 'paragraph';
  const displayNum  = (folioPos === 'top' && folioOnOuter) ? (page?.displayPageNumber ?? pageNumber) : null;
  return buildHeaderHtml(left, center, right, config?.header || {}, baseFontSize, {
    folioPos,
    folioAlign,
    isEvenPage,
    displayNum,
  });
};

/**
 * @param {string} headerLeft
 * @param {string} headerCenter
 * @param {string} headerRight
 * @param {object} headerConfig
 * @param {number} baseFontSize
 * @param {object} [folioCtx]  - { folioPos, folioAlign, isEvenPage, displayNum }
 *   When folioPos==='top', displayNum is injected directly into the flex row so
 *   the folio and header text share the same line without absolute-position overlap.
 *   The folio always gets visual priority: it sits on its edge, the text fills
 *   remaining space with a thin separator between them.
 *   Callers (PageFrame) must suppress the separate absolute folio span when
 *   folioPos==='top' and a header is showing.
 */
export const buildHeaderHtml = (headerLeft, headerCenter, headerRight, headerConfig, baseFontSize, folioCtx = {}) => {
  if (!headerLeft && !headerCenter && !headerRight) return '';

  const fontSizePercent = headerConfig.fontSize || 70;
  const fontSize  = baseFontSize * (fontSizePercent / 100);
  const fontFamily = headerConfig.fontFamily === 'same' ? 'inherit' : (headerConfig.fontFamily || 'inherit');

  const { folioPos = 'bottom', folioAlign = 'center', isEvenPage = false, displayNum = null } = folioCtx;
  const folioAtTop = folioPos === 'top' && displayNum !== null;

  const headerStyle = `display:flex;justify-content:space-between;align-items:center;font-size:${fontSize}pt;font-family:${fontFamily};padding-bottom:0.5em;border-bottom:${headerConfig.showLine ? `1px ${headerConfig.lineStyle || 'solid'} ${headerConfig.lineColor || 'black'}` : 'none'};`;

  const spanBase = 'overflow:hidden;white-space:nowrap;text-overflow:ellipsis;';

  if (!folioAtTop) {
    // ── Normal case: no folio in header row ───────────────────────────────
    const leftFlex   = headerLeft   ? '1' : '0';
    const centerFlex = headerCenter ? '1' : '0';
    const rightFlex  = headerRight  ? '1' : '0';
    return `<div style="${headerStyle}"><span style="flex:${leftFlex};text-align:left;${spanBase}">${headerLeft}</span><span style="flex:${centerFlex};text-align:center;${spanBase}">${headerCenter}</span><span style="flex:${rightFlex};text-align:right;${spanBase}">${headerRight}</span></div>`;
  }

  // ── Folio-at-top: embed page number in the flex row ───────────────────────
  // 'outer'/'paragraph-edge'/'paragraph' → left edge on even, right edge on odd.
  // 'center' and everything else → folio on right (most common book convention).
  const folioEdge = (folioAlign === 'outer' || folioAlign === 'paragraph-edge' || folioAlign === 'paragraph')
    ? (isEvenPage ? 'left' : 'right')
    : 'right';

  const sepColor = headerConfig.lineColor || '#999';
  const sep = `<span style="flex:0 0 auto;padding:0 0.3em;color:${sepColor};">|</span>`;

  const folioSpan  = `<span style="flex:0 0 auto;white-space:nowrap;">${displayNum}</span>`;
  // Collect the non-empty text content (prefer left, then right, then center)
  const textContent = headerLeft || headerRight || headerCenter || '';

  if (folioEdge === 'left') {
    // [number | text→right-aligned]
    return `<div style="${headerStyle}">${folioSpan}${sep}<span style="flex:1;text-align:right;${spanBase}">${textContent}</span></div>`;
  }

  // folioEdge === 'right': [text→left-aligned | number]
  return `<div style="${headerStyle}"><span style="flex:1;text-align:left;${spanBase}">${textContent}</span>${sep}${folioSpan}</div>`;
};
