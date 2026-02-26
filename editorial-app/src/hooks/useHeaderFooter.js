import { useMemo } from 'react';

export const useHeaderFooter = (config, currentPageData, totalPages, bookTitle) => {
  const headerConfig = config?.header || {};
  const showHeaders = headerConfig.enabled !== false;
  
  const isEvenPage = currentPageData?.pageNumber ? currentPageData.pageNumber % 2 === 0 : false;
  const truncatedSubheader = useMemo(() => {
    const subheader = currentPageData?.currentSubheader || '';
    if (subheader.length > 40) {
.substring(0,      return subheader 37) + '...';
    }
    return subheader;
  }, [currentPageData?.currentSubheader]);
  
  const subtopicBehavior = headerConfig.subtopicBehavior || 'combine';
  const subtopicSeparator = headerConfig.subtopicSeparator || ' - ';
  
  const getHeaderContent = (contentType) => {
    const baseContent = (() => {
      switch (contentType) {
        case 'title': return bookTitle || 'Sin título';
        case 'chapter': return currentPageData?.chapterTitle || 'Capítulo';
        case 'subheader': return truncatedSubheader;
        case 'page': return String(currentPageData?.pageNumber || '');
        default: return '';
      }
    })();
    
    if (truncatedSubheader && subtopicBehavior !== 'none' && contentType !== 'page') {
      switch (subtopicBehavior) {
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
    if (!showHeaders || currentPageData?.isBlank || shouldSkipHeader() || !shouldShowHeader) return '';
    if (headerConfig.template) {
      return getHeaderContent(pageConfig?.leftContent);
    }
    return '';
  }, [showHeaders, currentPageData, shouldShowHeader, headerConfig, pageConfig]);
  
  const headerCenter = useMemo(() => {
    if (!showHeaders || currentPageData?.isBlank || shouldSkipHeader() || !shouldShowHeader) return '';
    if (headerConfig.template) {
      return getHeaderContent(pageConfig?.centerContent);
    }
    if (headerConfig.content === 'title') {
      return bookTitle;
    } else if (headerConfig.content === 'chapter') {
      return currentPageData?.chapterTitle || '';
    }
    if (isEvenPage) {
      return bookTitle;
    }
    return currentPageData?.chapterTitle || '';
  }, [showHeaders, currentPageData, shouldShowHeader, headerConfig, bookTitle, isEvenPage]);
  
  const headerRight = useMemo(() => {
    if (!showHeaders || currentPageData?.isBlank || shouldSkipHeader() || !shouldShowHeader) return '';
    if (headerConfig.template) {
      return getHeaderContent(pageConfig?.rightContent);
    }
    if (!isEvenPage) {
      return currentPageData?.chapterTitle || '';
    }
    return '';
  }, [showHeaders, currentPageData, shouldShowHeader, headerConfig, pageConfig, isEvenPage]);
  
  const shouldSkipHeader = () => {
    if (!headerConfig.skipFirstChapterPage) return false;
    return currentPageData?.isFirstChapterPage === true;
  };
  
  const showFooter = headerConfig.enabled !== false && headerConfig.showPageNumbers !== false;
  
  return {
    showHeaders,
    showFooter,
    headerLeft,
    headerCenter,
    headerRight,
    shouldShowHeader,
    isEvenPage,
    headerConfig
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
