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

export const buildHeaderHtml = (headerLeft, headerCenter, headerRight, headerConfig, baseFontSize) => {
  if (!headerLeft && !headerCenter && !headerRight) return '';
  
  const fontSizePercent = headerConfig.fontSize || 70;
  const fontSize = baseFontSize * (fontSizePercent / 100);
  const fontFamily = headerConfig.fontFamily === 'same' ? 'inherit' : (headerConfig.fontFamily || 'inherit');
  
  const headerStyle = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: ${fontSize}pt;
    font-family: ${fontFamily};
    padding-bottom: 0.5em;
    border-bottom: ${headerConfig.showLine ? `1px ${headerConfig.lineStyle || 'solid'} ${headerConfig.lineColor || 'black'}` : 'none'};
  `;
  
  return `
    <div style="${headerStyle}">
      <span style="flex: 1; text-align: left;">${headerLeft}</span>
      <span style="flex: 1; text-align: center;">${headerCenter}</span>
      <span style="flex: 1; text-align: right;">${headerRight}</span>
    </div>
  `;
};
