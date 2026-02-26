import { useState, useEffect, useRef, useCallback } from 'react';
import { KDP_STANDARDS } from '../utils/kdpStandards';
import { 
  splitParagraphByLines, 
  buildParagraphHtml, 
  buildChapterTitleHtml, 
  shouldStartOnRightPage 
} from '../utils/paginationEngine';
import { calculateContentDimensions } from '../utils/textMeasurer';

const DEFAULT_CONFIG = {
  pageFormat: 'a5',
  fontSize: 12,
  lineHeight: 1.6,
  chapterTitle: { 
    align: 'center', 
    bold: true, 
    sizeMultiplier: 1.8, 
    marginTop: 2, 
    marginBottom: 1, 
    startOnRightPage: true, 
    showLines: false, 
    lineWidth: 0.5, 
    lineStyle: 'solid', 
    lineColor: '#333333', 
    lineWidthTitle: false 
  },
  subheaders: {
    h1: { align: 'center', bold: true, sizeMultiplier: 1.5, marginTop: 1.5, marginBottom: 0.5, minLinesAfter: 1 },
    h2: { align: 'center', bold: true, sizeMultiplier: 1.35, marginTop: 1.25, marginBottom: 0.5, minLinesAfter: 1 },
    h3: { align: 'center', bold: true, sizeMultiplier: 1.25, marginTop: 1, marginBottom: 0.5, minLinesAfter: 1 },
    h4: { align: 'left', bold: true, sizeMultiplier: 1.15, marginTop: 1, marginBottom: 0.5, minLinesAfter: 1 },
    h5: { align: 'left', bold: true, sizeMultiplier: 1.1, marginTop: 0.75, marginBottom: 0.25, minLinesAfter: 1 },
    h6: { align: 'left', bold: false, sizeMultiplier: 1.0, marginTop: 0.5, marginBottom: 0.25, minLinesAfter: 1 }
  },
  paragraph: { firstLineIndent: 1.5, align: 'justify', spacingBetween: 0 },
  quote: { enabled: true, indentLeft: 2, indentRight: 2, showLine: true, italic: true, sizeMultiplier: 0.95, marginTop: 1, marginBottom: 1 },
  pagination: { minOrphanLines: 2, minWidowLines: 2, splitLongParagraphs: true },
  header: {
    enabled: false,
    template: 'classic',
    displayMode: 'alternate',
    evenPage: { leftContent: 'title', centerContent: 'none', rightContent: 'none' },
    oddPage: { leftContent: 'none', centerContent: 'none', rightContent: 'chapter' },
    trackSubheaders: false,
    trackPseudoHeaders: false,
    subheaderLevels: ['h1', 'h2'],
    subheaderFormat: 'full',
    fontFamily: 'same',
    fontSize: 70,
    showLine: true,
    lineStyle: 'solid',
    lineWidth: 0.5,
    lineColor: 'black',
    skipFirstChapterPage: true
  }
};

const AVAILABLE_SIDEBAR_WIDTH = 220;
const PX_PER_MM = 3.7795;
const PX_PER_INCH = 96;

export const usePagination = (bookData, config, measureRef) => {
  const [pages, setPages] = useState([]);
  
  const safeBookData = bookData || { bookType: 'novela', chapters: [], title: '' };
  const safeConfig = config || DEFAULT_CONFIG;
  
  const bookConfig = KDP_STANDARDS.getBookTypeConfig(safeBookData.bookType);
  const pageFormat = KDP_STANDARDS.getPageFormat(safeConfig.pageFormat || bookConfig.recommendedFormat);
  
  useEffect(() => {
    if (!safeBookData?.chapters?.length || !measureRef.current) {
      setPages([]);
      return;
    }

    const measureDiv = measureRef.current;
    const previewScale = Math.min(0.42, AVAILABLE_SIDEBAR_WIDTH / (pageFormat.width * PX_PER_MM));
    
    const { 
      pageWidthPx, 
      pageHeightPx, 
      marginTop, 
      marginBottom, 
      marginLeft, 
      marginRight, 
      contentWidth, 
      contentHeight 
    } = calculateContentDimensions(pageFormat, bookConfig, previewScale);
    
    const baseFontSize = (safeConfig.fontSize || bookConfig.fontSize) * previewScale;
    const baseLineHeight = safeConfig.lineHeight || bookConfig.lineHeight;
    const textAlign = safeConfig.paragraph?.align || 'justify';
    
    measureDiv.style.width = `${contentWidth}px`;
    measureDiv.style.fontFamily = safeConfig.fontFamily || bookConfig.fontFamily;
    measureDiv.style.fontSize = `${baseFontSize}pt`;
    measureDiv.style.lineHeight = baseLineHeight;
    measureDiv.style.textAlign = textAlign;
    measureDiv.style.textJustify = 'inter-word';
    measureDiv.style.hyphens = 'auto';
    measureDiv.style.wordBreak = 'break-word';
    measureDiv.style.padding = '0';
    
    measureDiv.innerHTML = 'Ag';
    const lineHeightPx = measureDiv.offsetHeight;
    const minOrphanLines = safeConfig.pagination?.minOrphanLines || 1;
    const minWidowLines = safeConfig.pagination?.minWidowLines || 1;
    const splitLongParagraphs = safeConfig.pagination?.splitLongParagraphs !== false;
    
    const generatedPages = [];
    let cancelled = false;
    
    const processChapter = (chapter, chapterIndex) => {
      const isSection = chapter.type === 'section';
      const shouldStartOnRight = shouldStartOnRightPage(chapter, chapterIndex, safeConfig);
      
      if (shouldStartOnRight && chapterIndex > 0) {
        if (generatedPages.length % 2 === 1) {
          generatedPages.push({ html: '', pageNumber: generatedPages.length + 1, isBlank: true });
        }
      }
      
      const { titleHtml, ctConfig } = buildChapterTitleHtml(
        chapter, 
        safeConfig, 
        baseFontSize, 
        lineHeightPx, 
        contentHeight
      );
      
      measureDiv.innerHTML = titleHtml;
      const titleHeight = measureDiv.offsetHeight;
      
      const tmp = window.document.createElement('div');
      tmp.innerHTML = chapter.html || '<p></p>';
      const children = Array.from(tmp.children).filter(el => el.textContent.trim() || el.tagName === 'HR');
      
      let currentHtml = '';
      let currentHeight = 0;
      const headerConfig = safeConfig.header || {};
      const trackSubheaders = headerConfig.trackSubheaders;
      let currentSubheader = '';
      
      const layout = ctConfig.layout || 'continuous';
      
      if (layout === 'fullPage') {
        generatedPages.push({ 
          html: titleHtml, 
          pageNumber: generatedPages.length + 1, 
          chapterTitle: chapter.title, 
          isBlank: false,
          isFirstChapterPage: true,
          currentSubheader: ''
        });
        currentHtml = '';
        currentHeight = 0;
      } else if (titleHeight > contentHeight) {
        generatedPages.push({ 
          html: titleHtml, 
          pageNumber: generatedPages.length + 1, 
          chapterTitle: chapter.title, 
          isBlank: false,
          isFirstChapterPage: true,
          currentSubheader: ''
        });
        currentHtml = '';
        currentHeight = 0;
      } else {
        currentHtml = titleHtml;
        currentHeight = titleHeight;
      }
      
      for (let childIdx = 0; childIdx < children.length; childIdx++) {
        if (cancelled) return;
        
        const el = children[childIdx];
        const elHtml = buildParagraphHtml(el, safeConfig, baseFontSize, baseLineHeight, textAlign);
        
        if (headerConfig.trackSubheaders && el.tagName.match(/^H[1-6]$/i)) {
          const level = el.tagName.slice(1).toLowerCase();
          const subheaderLevels = headerConfig.subheaderLevels || ['h1', 'h2'];
          if (subheaderLevels.includes(level)) {
            currentSubheader = el.textContent || '';
          }
        }
        
        measureDiv.innerHTML = elHtml;
        const elHeight = measureDiv.offsetHeight;
        
        if (elHeight > contentHeight) {
          if (currentHtml) {
            generatedPages.push({ 
              html: currentHtml, 
              pageNumber: generatedPages.length + 1, 
              chapterTitle: chapter.title, 
              isBlank: false,
              currentSubheader
            });
            currentHtml = '';
            currentHeight = 0;
          }
          
          if (splitLongParagraphs) {
            const lines = splitParagraphByLines(elHtml, measureDiv, contentHeight, textAlign, false, 1.5, true);
            let lineHtml = '';
            
            lines.forEach((line, idx) => {
              if (cancelled) return;
              const isLastLine = idx === lines.length - 1;
              
              if (isLastLine) {
                lineHtml += line;
                generatedPages.push({ 
                  html: lineHtml, 
                  pageNumber: generatedPages.length + 1, 
                  chapterTitle: chapter.title, 
                  isBlank: false,
                  currentSubheader
                });
                lineHtml = '';
              } else {
                const testHtml = lineHtml + line;
                measureDiv.innerHTML = testHtml;
                
                if (measureDiv.offsetHeight > contentHeight) {
                  if (lineHtml) {
                    generatedPages.push({ 
                      html: lineHtml, 
                      pageNumber: generatedPages.length + 1, 
                      chapterTitle: chapter.title, 
                      isBlank: false,
                      currentSubheader
                    });
                  }
                  lineHtml = line;
                  measureDiv.innerHTML = line;
                } else {
                  lineHtml = testHtml;
                }
              }
            });
            
            if (lineHtml) {
              generatedPages.push({ 
                html: lineHtml, 
                pageNumber: generatedPages.length + 1, 
                chapterTitle: chapter.title, 
                isBlank: false,
                currentSubheader
              });
              lineHtml = '';
            }
          } else {
            generatedPages.push({ 
              html: elHtml, 
              pageNumber: generatedPages.length + 1, 
              chapterTitle: chapter.title, 
              isBlank: false,
              currentSubheader
            });
          }
          continue;
        }
        
        const candidateHtml = currentHtml + elHtml;
        measureDiv.innerHTML = candidateHtml;
        const candidateHeight = measureDiv.offsetHeight;
        
        if (candidateHeight > contentHeight) {
          generatedPages.push({ 
            html: currentHtml, 
            pageNumber: generatedPages.length + 1, 
            chapterTitle: chapter.title, 
            isBlank: false,
            currentSubheader
          });
          currentHtml = elHtml;
          currentHeight = elHeight;
        } else {
          currentHtml = candidateHtml;
          currentHeight = candidateHeight;
        }
      }
      
      if (currentHtml) {
        generatedPages.push({ 
          html: currentHtml, 
          pageNumber: generatedPages.length + 1, 
          chapterTitle: chapter.title, 
          isBlank: false,
          currentSubheader
        });
      }
    };
    
    safeBookData.chapters.forEach((chapter, index) => {
      if (!cancelled) {
        processChapter(chapter, index);
      }
    });
    
    if (!cancelled) {
      setPages(generatedPages);
    }
    
    return () => { cancelled = true; };
  }, [bookData, config, measureRef, bookConfig, pageFormat]);
  
  return { pages };
};

export const usePageNavigation = (totalPages) => {
  const [currentPage, setCurrentPage] = useState(0);
  
  const goToPage = useCallback((pageNum) => {
    const page = Math.max(0, Math.min(pageNum - 1, totalPages - 1));
    setCurrentPage(page);
  }, [totalPages]);
  
  const goToNextPage = useCallback(() => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages - 1));
  }, [totalPages]);
  
  const goToPrevPage = useCallback(() => {
    setCurrentPage(prev => Math.max(prev - 1, 0));
  }, []);
  
  const goToFirstPage = useCallback(() => {
    setCurrentPage(0);
  }, []);
  
  const goToLastPage = useCallback(() => {
    setCurrentPage(Math.max(0, totalPages - 1));
  }, [totalPages]);
  
  return {
    currentPage,
    setCurrentPage,
    goToPage,
    goToNextPage,
    goToPrevPage,
    goToFirstPage,
    goToLastPage,
    totalPages
  };
};
