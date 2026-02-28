import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { KDP_STANDARDS } from '../utils/kdpStandards';
import useEditorStore from '../store/useEditorStore';
import {
  splitParagraphByLines,
  buildParagraphHtml,
  buildChapterTitleHtml,
  getQuoteStyle,
  shouldStartOnRightPage
} from '../utils/paginationEngine';
import { calculateContentDimensions } from '../utils/textMeasurer';
import { useParagraphValidation } from './useParagraphValidation';


const DEFAULT_CONFIG = {
  pageFormat: 'a5',
  customPageFormat: { width: 6, height: 9, unit: 'in' },
  gutterStrategy: 'auto',
  gutterManual: 0.25,
  gutterUnit: 'in',
  extraEndPages: 0,
  extraEndPagesNumbered: false,
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
  quote: { enabled: true, indentLeft: 2, indentRight: 2, showLine: true, italic: true, sizeMultiplier: 0.95, marginTop: 1, marginBottom: 1, template: 'classic', autoDetect: true },
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

const validatePages = (pages) => {
  const validPages = [];
  let corruptedCount = 0;
  
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (page && typeof page.pageNumber === 'number' && page.pageNumber > 0) {
      validPages.push(page);
    } else {
      corruptedCount++;
      validPages.push({
        html: page?.html || '',
        pageNumber: i + 1,
        isBlank: true,
        chapterTitle: page?.chapterTitle || '',
        currentSubheader: page?.currentSubheader || ''
      });
    }
  }
  
  if (corruptedCount > 0) {
    console.warn(`⚠️ ${corruptedCount} páginas corregidas durante la paginación`);
  }
  
  return validPages;
};

export const usePagination = (bookData, config, measureRef) => {
  const [pages, setPages] = useState([]);
  const [calculatedPageCount, setCalculatedPageCount] = useState(0);
  
  const safeBookData = bookData || { bookType: 'novela', chapters: [], title: '' };
  const safeConfig = config || DEFAULT_CONFIG;

  const bookConfig = useMemo(
    () => KDP_STANDARDS.getBookTypeConfig(safeBookData.bookType),
    [safeBookData.bookType]
  );

  const pageFormat = useMemo(() => {
    if (safeConfig.pageFormat === 'custom') {
      const customDims = KDP_STANDARDS.getCustomPageDimensions(
        safeConfig.customPageFormat?.width || 6,
        safeConfig.customPageFormat?.height || 9,
        safeConfig.customPageFormat?.unit || 'in'
      );
      return {
        id: 'custom',
        name: 'Custom',
        width: customDims.widthMm,
        height: customDims.heightMm,
        unit: 'mm',
        description: `Custom (${customDims.widthIn.toFixed(2)}" × ${customDims.heightIn.toFixed(2)}")`,
        minMargins: { top: 12.7, bottom: 12.7, left: 12.7, right: 12.7 },
        recommended: false,
        type: 'paperback'
      };
    }
    return KDP_STANDARDS.getPageFormat(safeConfig.pageFormat || bookConfig.recommendedFormat);
  }, [safeConfig.pageFormat, safeConfig.customPageFormat, bookConfig])

  const calculateGutter = useCallback((pageCount) => {
    if (safeConfig.gutterStrategy === 'custom') {
      return safeConfig.gutterManual;
    }
    return KDP_STANDARDS.getDynamicGutter(safeConfig.pageFormat, safeBookData.bookType, pageCount);
  }, [safeConfig.gutterStrategy, safeConfig.gutterManual, safeConfig.pageFormat, safeBookData.bookType]);
  
  const [gutterValue, setGutterValue] = useState(() => calculateGutter(0));
  const gutterValueRef = useRef(gutterValue);
  const previousPageCountRef = useRef(0);

  // Keep ref in sync with state, but don't trigger pagination effect
  useEffect(() => {
    gutterValueRef.current = gutterValue;
  }, [gutterValue]);

  const extraEndPages = safeConfig.extraEndPages || 0;
  const extraEndPagesNumbered = safeConfig.extraEndPagesNumbered || false;

  // Gutter recalculation - NOT dependent on pages.length to avoid loops
  useEffect(() => {
    if (safeConfig.gutterStrategy === 'auto' && pages.length > 0) {
      if (previousPageCountRef.current !== pages.length) {
        previousPageCountRef.current = pages.length;
        const newGutter = calculateGutter(pages.length);
        if (Math.abs(newGutter - gutterValueRef.current) > 0.001) {
          setGutterValue(newGutter);
        }
      }
    }
  }, [pages, safeConfig.gutterStrategy, calculateGutter]);
  
  useEffect(() => {
    // Only run pagination if there's actual content
    const hasContent = safeBookData?.chapters?.some(ch => ch.html && ch.html.trim().length > 0);
    if (!hasContent || !measureRef.current) {
      if (!hasContent) {
        setPages([]);
      }
      return;
    }

    // Skip if we've already paginated this exact data
    const contentHash = JSON.stringify(safeBookData.chapters.map(ch => ch.id + (ch.html?.length || 0)));
    if (measureRef.current._lastContentHash === contentHash) {
      return;
    }
    measureRef.current._lastContentHash = contentHash;

    useEditorStore.getState().startPagination();

    const measureDiv = measureRef.current;
    
    try {
      measureDiv.innerHTML = '';
      measureDiv.style.cssText = '';
      // Asegurar estilos consistentes para medición
      measureDiv.style.position = 'absolute';
      measureDiv.style.visibility = 'hidden';
      measureDiv.style.left = '-9999px';
      measureDiv.style.top = '0';
      measureDiv.style.width = '1px';
      measureDiv.style.height = 'auto';
      measureDiv.style.minHeight = '0';
      measureDiv.style.maxHeight = 'none';
      measureDiv.style.overflow = 'visible';
      measureDiv.style.whiteSpace = 'normal';
      measureDiv.style.wordWrap = 'break-word';
      measureDiv.style.boxSizing = 'border-box';
    } catch (e) {
      console.warn('Error resetting measureDiv:', e);
    }
    const previewScale = Math.min(0.42, AVAILABLE_SIDEBAR_WIDTH / (pageFormat.width * PX_PER_MM));
    
    const dimsOdd = calculateContentDimensions(pageFormat, bookConfig, previewScale, gutterValueRef.current, false);
    const dimsEven = calculateContentDimensions(pageFormat, bookConfig, previewScale, gutterValueRef.current, true);
    
    const contentWidth = Math.min(dimsOdd.contentWidth, dimsEven.contentWidth);
    const pageWidthPx = dimsOdd.pageWidthPx;
    const pageHeightPx = dimsOdd.pageHeightPx;
    const marginTop = dimsOdd.marginTop;
    const marginBottom = dimsOdd.marginBottom;

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

    // Safety margin: 1px buffer to prevent sub-pixel rendering overflow
    // Header is positioned absolutely in render, so doesn't affect content height calculation
    const contentHeight = Math.min(dimsOdd.contentHeight, dimsEven.contentHeight) - 1;
    const minOrphanLines = safeConfig.pagination?.minOrphanLines || 1;
    const minWidowLines = safeConfig.pagination?.minWidowLines || 1;
    const splitLongParagraphs = safeConfig.pagination?.splitLongParagraphs !== false;

    // Quote config for consistent split measurement - always provide config to prevent style degradation
    const quoteOptions = {
      config: safeConfig.quote || {
        enabled: true,
        indentLeft: 2,
        indentRight: 2,
        showLine: true,
        italic: true,
        sizeMultiplier: 0.95,
        marginTop: 1,
        marginBottom: 1
      },
      baseFontSize,
      baseLineHeight,
      textAlign
    };

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
      
      console.log(`[CHAPTER ${chapter.title}] HTML length:`, chapter.html?.length);
      console.log(`[CHAPTER ${chapter.title}] Children count:`, children.length);
      console.log(`[CHAPTER ${chapter.title}] First child tag:`, children[0]?.tagName);
      console.log(`[CHAPTER ${chapter.title}] First child HTML:`, children[0]?.outerHTML?.substring(0, 200));
      
      let currentHtml = '';
      let currentHeight = 0;
      const headerConfig = safeConfig.header || {};
      const trackSubheaders = headerConfig.trackSubheaders;
      const trackPseudoHeaders = !!headerConfig.trackPseudoHeaders;
      let currentSubheader = '';
      let paragraphCount = 0;
      
      const layout = ctConfig.layout || 'continuous';
      const isTitleOnlyPage = layout === 'fullPage';
      
      if (layout === 'fullPage') {
        generatedPages.push({ 
          html: titleHtml, 
          pageNumber: generatedPages.length + 1, 
          chapterTitle: chapter.title, 
          isBlank: false,
          isFirstChapterPage: true,
          isTitleOnlyPage: true,
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
          isTitleOnlyPage: true,
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
        const isFirstParagraph = paragraphCount === 0;
        if (el.tagName === 'P' || el.tagName === 'DIV') {
          paragraphCount++;
        }
        const elHtml = buildParagraphHtml(el, safeConfig, baseFontSize, baseLineHeight, textAlign, isFirstParagraph);

        if (headerConfig.trackSubheaders && el.tagName.match(/^H[1-6]$/i)) {
          const level = el.tagName.slice(1).toLowerCase();
          const subheaderLevels = headerConfig.subheaderLevels || ['h1', 'h2'];
          if (subheaderLevels.includes(level)) {
            currentSubheader = el.textContent || '';
          }
        }

        if (trackPseudoHeaders && (el.tagName === 'P' || el.tagName === 'DIV')) {
          if (!currentSubheader) {
            const boldElements = el.querySelectorAll('strong, b');
            for (const boldEl of boldElements) {
              const text = boldEl.textContent?.trim() || '';
              if (text.length > 3) {
                currentSubheader = text;
                break;
              }
            }

            if (!currentSubheader) {
              const style = el.getAttribute('style') || '';
              if (style.includes('font-weight: bold') || style.includes('font-weight:700') || style.includes('font-weight:600')) {
                const text = el.textContent?.trim() || '';
                if (text.length > 3) {
                  currentSubheader = text;
                }
              }
            }
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
              isTitleOnlyPage: false,
              currentSubheader
            });
            currentHtml = '';
            currentHeight = 0;
          }
          
          if (splitLongParagraphs) {
            const indentValue = safeConfig.paragraph?.firstLineIndent || 1.5;
            const lines = splitParagraphByLines(elHtml, measureDiv, contentHeight, textAlign, !isFirstParagraph, indentValue, true, quoteOptions);
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
                    isFirstPageOfChapter = false;
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
          const remainingSpace = contentHeight - currentHeight;
          const remainingLinesOnPage = Math.round(remainingSpace / lineHeightPx);

          const shouldBreakPage = (el) => {
            const tag = el.tagName;
            const isList = tag === 'UL' || tag === 'OL';
            const isHeader = tag.match(/^H[1-6]$/i);
            if (isHeader || isList) return true;
            if (remainingLinesOnPage < minOrphanLines) return true;
            return false;
          };

          if (shouldBreakPage(el)) {
            generatedPages.push({ 
              html: currentHtml, 
              pageNumber: generatedPages.length + 1, 
              chapterTitle: chapter.title, 
              isBlank: false,
              currentSubheader
            });
            currentHtml = elHtml;
            currentHeight = elHeight;
            continue;
          }

          if (splitLongParagraphs) {
            // GUARD: If paragraph fits on a complete new page, move it without splitting
            if (elHeight <= contentHeight) {
              generatedPages.push({
                html: currentHtml,
                pageNumber: generatedPages.length + 1,
                chapterTitle: chapter.title,
                isBlank: false,
                currentSubheader
              });
              currentHtml = elHtml;
              currentHeight = elHeight;
              continue;
            }

            const indentValue = safeConfig.paragraph?.firstLineIndent || 1.5;
            const splitArr = splitParagraphByLines(elHtml, measureDiv, remainingSpace, textAlign, !isFirstParagraph, indentValue, true, quoteOptions);

            if (splitArr.length > 1) {
              const firstChunk = splitArr[0];
              const restHtml = splitArr.slice(1).join('');

              measureDiv.innerHTML = firstChunk;
              const orphanLines = Math.round(measureDiv.offsetHeight / lineHeightPx);
              measureDiv.innerHTML = restHtml;
              const widowLines = Math.round(measureDiv.offsetHeight / lineHeightPx);

              if (orphanLines >= minOrphanLines && widowLines >= minWidowLines) {
                generatedPages.push({
                  html: currentHtml + firstChunk,
                  pageNumber: generatedPages.length + 1,
                  chapterTitle: chapter.title,
                  isBlank: false,
                  currentSubheader
                });
                currentHtml = restHtml;
                measureDiv.innerHTML = currentHtml;
                currentHeight = measureDiv.offsetHeight;
              } else {
                generatedPages.push({
                  html: currentHtml,
                  pageNumber: generatedPages.length + 1,
                  chapterTitle: chapter.title,
                  isBlank: false,
                  currentSubheader
                });
                currentHtml = elHtml;
                currentHeight = elHeight;
              }
            } else {
              generatedPages.push({
                html: currentHtml,
                pageNumber: generatedPages.length + 1,
                chapterTitle: chapter.title,
                isBlank: false,
                currentSubheader
              });
              isFirstPageOfChapter = false; // Moving to next page
              currentHtml = elHtml;
              currentHeight = elHeight;
            }
          } else {
            generatedPages.push({
              html: currentHtml,
              pageNumber: generatedPages.length + 1,
              chapterTitle: chapter.title,
              isBlank: false,
              currentSubheader
            });
            isFirstPageOfChapter = false; // Moving to next page
            currentHtml = elHtml;
            measureDiv.innerHTML = elHtml;
            currentHeight = measureDiv.offsetHeight;
          }
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
        const progress = Math.round(((index + 1) / safeBookData.chapters.length) * 70);
        useEditorStore.getState().setPaginationProgress(progress);
      }
    });
    
    useEditorStore.getState().setPaginationProgress(75);
    
    const applyFillPass = () => {
      let totalIterations = 0;
      const maxIterations = 10000;
      
      for (let pageIdx = 0; pageIdx < generatedPages.length - 1; pageIdx++) {
        if (totalIterations >= maxIterations) break;
        
        for (let fillAttempts = 0; fillAttempts < 50; fillAttempts++) {
          if (totalIterations >= maxIterations) break;
          totalIterations++;
          
          const page = generatedPages[pageIdx];
          if (page.isBlank) break;

          let remainingSpace = 0;
          let remainingLines = 0;
          try {
            measureDiv.innerHTML = page.html;
            remainingSpace = contentHeight - (measureDiv.offsetHeight || 0);
            remainingLines = Math.floor(remainingSpace / lineHeightPx);
          } catch (e) {
            console.warn('Fill pass measurement error at page', pageIdx, e);
            break;
          }

          if (remainingLines < minOrphanLines) break;

          let nextIdx = pageIdx + 1;
          while (nextIdx < generatedPages.length && generatedPages[nextIdx].isBlank) nextIdx++;
          if (nextIdx >= generatedPages.length) break;

          const nextPage = generatedPages[nextIdx];
          if (page.chapterTitle !== nextPage.chapterTitle) break;

          const tmp = document.createElement('div');
          tmp.innerHTML = nextPage.html;
          const firstEl = tmp.firstElementChild;
          if (!firstEl) break;

          const isHeader = /^H[1-6]$/i.test(firstEl.tagName);
          const isList = firstEl.tagName === 'UL' || firstEl.tagName === 'OL';
          const isBlockquote = firstEl.tagName === 'BLOCKQUOTE';
          
          if (isBlockquote && remainingLines < 10) break;

          const firstElOuter = firstEl.outerHTML;
          
          let quoteConfig = null;
          let quoteClass = '';
          if (isBlockquote) {
            const classes = Array.from(firstEl.classList).find(c => ['classic', 'bar', 'italic', 'indent', 'minimal'].includes(c));
            quoteClass = classes || 'classic';
            quoteConfig = safeConfig.quote || {};
          }

          measureDiv.innerHTML = page.html + firstElOuter;
          const pageWithElHeight = measureDiv.offsetHeight;

          if (pageWithElHeight < contentHeight) {
            firstEl.remove();
            const restHtml = tmp.innerHTML;
            measureDiv.innerHTML = restHtml;
            const widowLines = restHtml.trim() ? Math.round(measureDiv.offsetHeight / lineHeightPx) : Infinity;

            if (!restHtml.trim() || widowLines >= minWidowLines) {
              generatedPages[pageIdx] = { ...page, html: page.html + firstElOuter };
              generatedPages[nextIdx] = { ...nextPage, html: restHtml };
            } else {
              break;
            }
          } else if (!isHeader && !isList && splitLongParagraphs && !isBlockquote) {
            const pageHasParagraph = /<p[^>]*>/i.test(page.html);
            const pageHasBlockquote = /<blockquote/i.test(page.html);
            const isFirstParagraphOfChapter = !pageHasParagraph && !pageHasBlockquote && firstEl.tagName === 'P';

            // Use remainingSpace directly instead of truncating to line multiples
            const splitArr = splitParagraphByLines(firstElOuter, measureDiv, remainingSpace, textAlign, !isFirstParagraphOfChapter, safeConfig.paragraph?.firstLineIndent || 1.5, true, quoteOptions);

            if (splitArr.length > 1) {
              const chunk = splitArr[0];
              const rest = splitArr.slice(1).join('');

              measureDiv.innerHTML = page.html + chunk;
              if (measureDiv.offsetHeight < contentHeight) {
                measureDiv.innerHTML = chunk;
                const chunkLines = Math.round(measureDiv.offsetHeight / lineHeightPx);

                measureDiv.innerHTML = rest;
                const widowLines = rest.trim() ? Math.round(measureDiv.offsetHeight / lineHeightPx) : Infinity;

                firstEl.remove();
                const restPageHtml = rest + tmp.innerHTML;

                if (chunkLines >= minOrphanLines && (!rest.trim() || widowLines >= minWidowLines)) {
                  let updatedChunk = chunk;
                  let updatedRest = rest;
                  
                  if (isBlockquote && quoteClass) {
                    const quoteStyle = getQuoteStyle(quoteConfig, quoteClass, baseFontSize, baseLineHeight, textAlign);
                    updatedChunk = chunk.replace(/<blockquote/, `<blockquote class="quote ${quoteClass}" style="${quoteStyle}"`);
                  }
                  
                  generatedPages[pageIdx] = { ...page, html: page.html + updatedChunk };
                  generatedPages[nextIdx] = { ...nextPage, html: updatedRest + tmp.innerHTML };
                } else {
                  break;
                }
              } else {
                break;
              }
            } else {
              break;
            }
          } else {
            break;
          }
        }
      }
    };

    applyFillPass();
    
    useEditorStore.getState().setPaginationProgress(95);
    
    for (let i = 0; i < extraEndPages; i++) {
      generatedPages.push({
        html: '',
        pageNumber: generatedPages.length + 1,
        isBlank: true,
        isExtraEndPage: true,
        shouldShowPageNumber: extraEndPagesNumbered
      });
    }
    
    if (!cancelled) {
      const validatedPages = validatePages(generatedPages);
      
      setPages(validatedPages);
      useEditorStore.getState().setPaginationProgress(100);
    }
    
    return () => { 
      cancelled = true; 
      useEditorStore.getState().endPagination();
    };
  }, [bookData, config, measureRef, bookConfig, pageFormat, extraEndPages, extraEndPagesNumbered]);
  
  const confirmedChapterTitles = useEditorStore(s => s.confirmedChapterTitles ?? []);

  const {
    validateAll,
    validationState,
    showErrorDialog,
    currentError,
    handleErrorAction,
    closeErrorDialog
  } = useParagraphValidation();

  useEffect(() => {
    if (pages.length > 0 && safeBookData.chapters) {
      const validation = validateAll(safeBookData.chapters, pages, safeConfig, confirmedChapterTitles);

      if (process.env.NODE_ENV === 'development') {
        console.log('[ParagraphValidation] Result:', validation);
      }
    }
  }, [pages, safeBookData.chapters, safeConfig, confirmedChapterTitles]);
  
  return { 
    pages,
    validationState,
    showErrorDialog,
    currentError,
    handleErrorAction,
    closeErrorDialog
  };
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
