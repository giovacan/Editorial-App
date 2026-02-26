import { useState, useEffect, useRef, memo } from 'react';
import { KDP_STANDARDS } from '../../utils/kdpStandards';
import useEditorStore from '../../store/useEditorStore';
import './Preview.css';

function Preview() {
  const { bookData, config } = useEditorStore();
  const activeChapterId = useEditorStore((state) => state.editing?.activeChapterId);
  const [currentPage, setCurrentPage] = useState(0);
  const [magnifierZoom, setMagnifierZoom] = useState(200);
  const measureRef = useRef(null);
  const [pages, setPages] = useState([]);
  const navigatedChapterRef = useRef(null);
  
  const [showMagnifier, setShowMagnifier] = useState(false);
  const [magnifierPos, setMagnifierPos] = useState({ x: 50, y: 50 });
  const previewPageRef = useRef(null);
  const magnifierPanelRef = useRef(null);
  const previewScrollRef = useRef(null);
  
  const isOverPreview = useRef(false);
  const isOverMagnifier = useRef(false);
  const magnifierTimeoutRef = useRef(null);
  
  const updateMagnifierPosition = (e) => {
    if (!previewPageRef.current) return;
    
    try {
      const pageRect = previewPageRef.current.getBoundingClientRect();
      
      // Calcular posición relativa al viewport
      const viewportX = e.clientX;
      const viewportY = e.clientY;
      
      // Verificar si el cursor está dentro del área del preview
      if (viewportX < pageRect.left || viewportX > pageRect.right || 
          viewportY < pageRect.top || viewportY > pageRect.bottom) {
        return;
      }
      
      // Calcular posición porcentual dentro del preview con mejor precisión
      const x = Math.max(0, Math.min(100, ((viewportX - pageRect.left) / pageRect.width) * 100));
      const y = Math.max(0, Math.min(100, ((viewportY - pageRect.top) / pageRect.height) * 100));
      
      setMagnifierPos({ x, y });
      
      // Actualizar posición del panel de lupa
      if (magnifierPanelRef.current) {
        magnifierPanelRef.current.style.setProperty('--magnifier-x', `${x}%`);
        magnifierPanelRef.current.style.setProperty('--magnifier-y', `${y}%`);
      }
    } catch (error) {
      console.warn('Error updating magnifier position:', error);
    }
  };
  
  const safeBookData = bookData || { bookType: 'novela', chapters: [], title: '' };
  const safeConfig = config || { 
    pageFormat: 'a5', 
    fontSize: 12, 
    lineHeight: 1.6,
    chapterTitle: { align: 'center', bold: true, sizeMultiplier: 1.8, marginTop: 2, marginBottom: 1, startOnRightPage: true, showLines: false, lineWidth: 0.5, lineStyle: 'solid', lineColor: '#333333', lineWidthTitle: false },
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
  
  const bookConfig = KDP_STANDARDS.getBookTypeConfig(safeBookData.bookType);
  const pageFormat = KDP_STANDARDS.getPageFormat(safeConfig.pageFormat || bookConfig.recommendedFormat);

  const splitParagraphByLines = (html, measureDiv, maxHeight, textAlign) => {
    const lines = [];
    let remainingHtml = html;
    
    while (remainingHtml) {
      measureDiv.innerHTML = remainingHtml;
      
      if (measureDiv.offsetHeight <= maxHeight) {
        lines.push(remainingHtml);
        break;
      }
      
      const tmp = window.document.createElement('div');
      tmp.innerHTML = remainingHtml;
      const text = tmp.textContent || '';
      
      if (!text.trim()) {
        lines.push(remainingHtml);
        break;
      }
      
      let low = 0;
      let high = text.length;
      let fitLength = 0;
      
      while (low < high) {
        const mid = Math.floor((low + high + 1) / 2);
        const trialHtml = text.substring(0, mid);
        measureDiv.innerHTML = `<p style="margin:0;padding:0;text-align:${textAlign};text-indent:1.5em;text-justify:inter-word;hyphens:auto;text-align-last:left;overflow-wrap:break-word;">${trialHtml}</p>`;
        
        if (measureDiv.offsetHeight <= maxHeight) {
          fitLength = mid;
          low = mid;
        } else {
          high = mid - 1;
        }
      }
      
      if (fitLength === 0) {
        lines.push(remainingHtml);
        break;
      }
      
      const lastSpace = text.substring(0, fitLength).lastIndexOf(' ');
      const breakPoint = lastSpace > fitLength * 0.5 ? lastSpace : fitLength;

      const chunkText = text.substring(0, breakPoint);
      const endsWithSentence = /[.!?]\s*$/.test(chunkText);
      lines.push(`<p style="margin:0;padding:0;text-align:${textAlign};text-indent:0;text-justify:inter-word;hyphens:auto;text-align-last:${endsWithSentence ? 'left' : 'justify'};overflow-wrap:break-word;">${chunkText}</p>`);
      remainingHtml = text.substring(breakPoint);
      
      if (remainingHtml) {
        remainingHtml = `<p style="margin:0;padding:0;text-align:${textAlign};text-indent:0;text-justify:inter-word;hyphens:auto;text-align-last:left;overflow-wrap:break-word;">${remainingHtml}</p>`;
      }
    }
    
    return lines;
  };


  useEffect(() => {
    if (!safeBookData?.chapters?.length || !measureRef.current) {
      setPages([]);
      return;
    }

    const measureDiv = measureRef.current;

    const PX_PER_MM = 3.7795;
    // Escala ajustada al espacio real disponible en el sidebar (~220px)
    const previewScale = Math.min(0.42, 220 / (pageFormat.width * PX_PER_MM));

    const pageWidthPx = pageFormat.width * PX_PER_MM * previewScale;
    const pageHeightPx = pageFormat.height * PX_PER_MM * previewScale;

    const marginTop = bookConfig.marginTop * 96 * previewScale;
    const marginBottom = bookConfig.marginBottom * 96 * previewScale;
    const marginLeft = (bookConfig.marginLeft + (bookConfig.gutter || 0)) * 96 * previewScale;
    const marginRight = bookConfig.marginRight * 96 * previewScale;
    
    const contentWidth = pageWidthPx - marginLeft - marginRight;
    const contentHeight = pageHeightPx - marginTop - marginBottom;

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
    let chapterIdx = 0;

    const processChapter = (chapter, chapterIndex) => {
      const isSection = chapter.type === 'section';

      const shouldStartOnRight = isSection
        ? false
        : (safeConfig.chapterTitle?.startOnRightPage !== false);

      if (shouldStartOnRight && chapterIndex > 0) {
        if (generatedPages.length % 2 === 1) {
          generatedPages.push({ html: '', pageNumber: generatedPages.length + 1, isBlank: true });
        }
      }

      const ctConfig = safeConfig.chapterTitle || { align: 'center', bold: true, sizeMultiplier: 1.8, marginTop: 2, marginBottom: 1, layout: 'continuous', showLines: false, lineWidth: 0.5, lineStyle: 'solid', lineColor: '#333333', lineWidthTitle: false };
      const titleSize = Math.round(baseFontSize * ctConfig.sizeMultiplier);
      const titleMarginTop = ctConfig.marginTop * lineHeightPx;
      const titleMarginBottom = ctConfig.marginBottom * lineHeightPx;

      // Build title HTML based on layout
      const layout = ctConfig.layout || 'continuous';
      let titleHtml;
      let titleHeight;

      const titleBaseStyle = `font-size:${titleSize}pt;font-weight:${ctConfig.bold ? 'bold' : 'normal'};font-style:${isSection ? 'italic' : 'normal'};text-align:${ctConfig.align};`;

      // Measure base title height for layouts that need it
      let baseTitleHeight = 0;
      if (layout === 'halfPage' || layout === 'fullPage') {
        measureDiv.innerHTML = `<div style="${titleBaseStyle}">${chapter.title}</div>`;
        baseTitleHeight = measureDiv.offsetHeight;
      }

      // Line styles
      const lineWidth = ctConfig.lineWidth || 0.5;
      const lineStyle = ctConfig.lineStyle || 'solid';
      const lineColor = ctConfig.lineColor || '#333';
      const lineWidthTitle = ctConfig.lineWidthTitle || false;

      // Helper function for hr styles
      const getHrStyle = (isDouble = false, widthMult = 1) => {
        const w = lineWidth * widthMult;
        const thickness = lineStyle === 'double' ? Math.max(3, w * 2) : w;
        let hrWidth = '100%';
        let hrMargin = '0';
        if (lineWidthTitle) {
          hrWidth = '50%';
          hrMargin = '0 auto';
        }
        return `border:none;border-top:${thickness}px ${lineStyle} ${lineColor};width:${hrWidth};margin:${hrMargin};`;
      };

      switch (layout) {
        case 'spaced': {
          const spacedTop = Math.round(contentHeight * 0.25);
          if (ctConfig.showLines) {
            const hrTop = getHrStyle();
            const hrBottom = getHrStyle();
            titleHtml = `<div style="margin:${spacedTop}px 0 ${titleMarginBottom}px 0;text-align:center;"><div style="${hrTop}"></div><div style="${titleBaseStyle}padding:${titleMarginBottom / 2}px 0;">${chapter.title}</div><div style="${hrBottom}"></div></div>`;
          } else {
            titleHtml = `<div style="${titleBaseStyle}margin:${spacedTop}px 0 ${titleMarginBottom}px 0;">${chapter.title}</div>`;
          }
          break;
        }
        case 'halfPage': {
          const halfTop = Math.round((contentHeight * 0.5) - baseTitleHeight - titleMarginBottom);
          if (ctConfig.showLines) {
            const hrTop = getHrStyle();
            const hrBottom = getHrStyle();
            titleHtml = `<div style="margin:${Math.max(0, halfTop)}px 0 ${titleMarginBottom}px 0;text-align:center;"><div style="${hrTop}"></div><div style="${titleBaseStyle}padding:${titleMarginBottom / 2}px 0;">${chapter.title}</div><div style="${hrBottom}"></div></div>`;
          } else {
            titleHtml = `<div style="${titleBaseStyle}margin:${Math.max(0, halfTop)}px 0 ${titleMarginBottom}px 0;">${chapter.title}</div>`;
          }
          break;
        }
        case 'fullPage': {
          if (ctConfig.showLines) {
            const hrTop = getHrStyle(lineStyle === 'double', 3);
            const hrBottom = getHrStyle(lineStyle === 'double', 3);
            titleHtml = `<div style="${titleBaseStyle}display:flex;align-items:center;justify-content:center;min-height:${contentHeight}px;flex-direction:column;"><div style="${hrTop}"></div><div>${chapter.title}</div><div style="${hrBottom}"></div></div>`;
          } else {
            titleHtml = `<div style="${titleBaseStyle}display:flex;align-items:center;justify-content:center;min-height:${contentHeight}px;flex-direction:column;"><div>${chapter.title}</div></div>`;
          }
          break;
        }
        default: {
          if (ctConfig.showLines) {
            const hrTop = getHrStyle();
            const hrBottom = getHrStyle();
            titleHtml = `<div style="margin:${titleMarginTop}px 0 ${titleMarginBottom}px 0;text-align:center;"><div style="${hrTop}"></div><div style="${titleBaseStyle}padding:${titleMarginBottom / 2}px 0;">${chapter.title}</div><div style="${hrBottom}"></div></div>`;
          } else {
            titleHtml = `<div style="${titleBaseStyle}margin:${titleMarginTop}px 0 ${titleMarginBottom}px 0;">${chapter.title}</div>`;
          }
        }
      }

      measureDiv.innerHTML = titleHtml;
      titleHeight = measureDiv.offsetHeight;

      const tmp = window.document.createElement('div');
      tmp.innerHTML = chapter.html || '<p></p>';
      const children = Array.from(tmp.children).filter(el => el.textContent.trim() || el.tagName === 'HR');

      let currentHtml;
      let currentHeight;
      let paragraphCount = 0;
      
      // Track current subheader for header display
      let currentSubheader = '';
      const headerConfig = safeConfig.header || {};
      const trackSubheaders = headerConfig.trackSubheaders;
      const trackPseudoHeaders = headerConfig.trackPseudoHeaders;
      const subheaderLevels = headerConfig.subheaderLevels || ['h1', 'h2'];

      if (layout === 'fullPage') {
        // Full page title stands alone, text starts on next page
        generatedPages.push({ 
          html: titleHtml, 
          pageNumber: generatedPages.length + 1, 
          chapterTitle: chapter.title, 
          isBlank: false,
          isFirstChapterPage: true,
          currentSubheader: ''
        });
        
        // Text continues on next page (left page) - no blank page needed
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
        const el = children[childIdx];
        const tag = el.tagName;
        const tagLower = tag.toLowerCase();
        let elHtml = '';

        if (tag === 'P' || tag === 'DIV') {
          const isFirstParagraph = paragraphCount === 0;
          const indent = safeConfig.paragraph?.firstLineIndent || 1.5;

          const parentBlockquote = el.closest('blockquote');
          if (parentBlockquote && safeConfig.quote?.enabled) {
            const qConfig = safeConfig.quote;
            elHtml = `<p style="margin:${qConfig.marginTop}em 0 ${qConfig.marginBottom}em ${qConfig.indentLeft}em;padding:0;padding-right:${qConfig.indentRight}em;text-align:${textAlign};text-indent:${isFirstParagraph ? '0' : indent + 'em'};text-justify:inter-word;hyphens:auto;text-align-last:left;overflow-wrap:break-word;line-height:${baseLineHeight};font-style:${qConfig.italic ? 'italic' : 'normal'};font-size:${baseFontSize * qConfig.sizeMultiplier}pt;${qConfig.showLine ? 'border-left:3px solid #444;padding-left:0.75em;' : ''}">${el.innerHTML}</p>`;
          } else {
            const spacingBetween = safeConfig.paragraph?.spacingBetween || 0;
            elHtml = `<p style="margin:${spacingBetween > 0 ? spacingBetween + 'em' : '0'} 0;padding:0;text-align:${textAlign};text-indent:${isFirstParagraph ? '0' : indent + 'em'};text-justify:inter-word;hyphens:auto;text-align-last:left;overflow-wrap:break-word;line-height:${baseLineHeight};">${el.innerHTML}</p>`;
          }
          
          // Track pseudo-headers (bold short text) for header display
          const trackPseudoHeaders = headerConfig.trackPseudoHeaders;
          if (trackSubheaders && trackPseudoHeaders) {
            const text = el.textContent?.trim() || '';
            const innerHTML = el.innerHTML || '';
            const isBold = innerHTML.includes('<strong>') || 
                          innerHTML.includes('<b>') || 
                          innerHTML.includes('font-weight') ||
                          innerHTML.includes('bold');
            const isShortText = text.length > 0 && text.length < 100 && !text.includes('\n');
            const hasContent = text.length > 5;
            
            if (isBold && isShortText && hasContent) {
              currentSubheader = text;
            }
          }
          
          paragraphCount++;
        } else if (tag.match(/^H[1-6]$/i)) {
          const level = tag.slice(1).toLowerCase();
          const subConfig = safeConfig.subheaders?.[level] || safeConfig.subheaders?.h2 || { align: 'center', bold: true, sizeMultiplier: 1.25, marginTop: 1, marginBottom: 0.5, minLinesAfter: 1 };
          const subSize = Math.round(baseFontSize * subConfig.sizeMultiplier);
          const subMarginTop = subConfig.marginTop * lineHeightPx;
          const subMarginBottom = subConfig.marginBottom * lineHeightPx;
          elHtml = `<h${level} style="font-size:${subSize}pt;font-weight:${subConfig.bold ? 'bold' : 'normal'};margin:${subMarginTop}px 0 ${subMarginBottom}px 0;text-align:${subConfig.align};line-height:1.3;">${el.innerHTML}</h${level}>`;
          
          // Track subheader for header display
          if (trackSubheaders && subheaderLevels.includes(level)) {
            currentSubheader = el.textContent || '';
          }
        } else if (tag === 'BLOCKQUOTE' && safeConfig.quote?.enabled) {
          const qConfig = safeConfig.quote;
          elHtml = `<blockquote style="margin:${qConfig.marginTop}em ${qConfig.indentRight}em ${qConfig.marginBottom}em ${qConfig.indentLeft}em;padding:0.5em 1em;border-left:${qConfig.showLine ? '3px solid #444' : 'none'};font-style:${qConfig.italic ? 'italic' : 'normal'};font-size:${baseFontSize * qConfig.sizeMultiplier}pt;line-height:${baseLineHeight};text-align:${textAlign};text-justify:inter-word;hyphens:auto;">${el.innerHTML}</blockquote>`;
        } else if (tag === 'UL' || tag === 'OL') {
          elHtml = `<${tagLower} style="margin:0.5em 0;padding-left:1.5em;line-height:${baseLineHeight};text-align:${textAlign};text-justify:inter-word;hyphens:auto;">${el.innerHTML}</${tagLower}>`;
        } else if (tag === 'HR') {
          elHtml = '<hr style="border:none;border-top:1px solid #999;margin:1em 0;">';
        } else if (tag === 'BR') {
          elHtml = `<br>`;
        } else {
          elHtml = `<p style="margin:0;padding:0;text-align:${textAlign};text-indent:1.5em;text-justify:inter-word;hyphens:auto;text-align-last:left;overflow-wrap:break-word;line-height:${baseLineHeight};">${el.innerHTML}</p>`;
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
              currentSubheader: currentSubheader
            });
            currentHtml = '';
            currentHeight = 0;
          }

          if (splitLongParagraphs) {
            const lines = splitParagraphByLines(elHtml, measureDiv, contentHeight, textAlign);

            let lineHtml = '';

            lines.forEach((line, idx) => {
              const isLastLine = idx === lines.length - 1;

              if (isLastLine) {
                lineHtml += line;
                generatedPages.push({ 
                  html: lineHtml, 
                  pageNumber: generatedPages.length + 1, 
                  chapterTitle: chapter.title, 
                  isBlank: false,
                  currentSubheader: currentSubheader
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
                      currentSubheader: currentSubheader
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
                currentSubheader: currentSubheader
              });
              lineHtml = '';
            }
          } else {
            generatedPages.push({ 
              html: elHtml, 
              pageNumber: generatedPages.length + 1, 
              chapterTitle: chapter.title, 
              isBlank: false,
              currentSubheader: currentSubheader
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
              currentSubheader: currentSubheader
            });
            currentHtml = elHtml;
            currentHeight = elHeight;
            continue;
          }

          if (splitLongParagraphs) {
            const splitArr = splitParagraphByLines(elHtml, measureDiv, remainingSpace, textAlign);

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
                  currentSubheader: currentSubheader
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
                  currentSubheader: currentSubheader
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
                currentSubheader: currentSubheader
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
              currentSubheader: currentSubheader
            });
            currentHtml = elHtml;
            measureDiv.innerHTML = elHtml;
            currentHeight = measureDiv.offsetHeight;
          }
        } else {
          // No overflow — element fits. For headers/pseudo-headers, check if there are enough lines after
          const isRealHeader = tag.match(/^H[1-6]$/i);
          const isPseudoHeader = !isRealHeader && isHeaderLike(el);

          if (isRealHeader || isPseudoHeader) {
            console.log(`[FORWARD] ${isPseudoHeader ? 'PSEUDO' : 'REAL'} header: ${tag}, text="${el.textContent?.substring(0,30)}", checking minLines...`);
            const level = isRealHeader ? tag.slice(1).toLowerCase() : '3'; // Treat pseudo-headers as h3
            const subConfig = safeConfig.subheaders?.[level] || safeConfig.subheaders?.h2 || { align: 'center', bold: true, sizeMultiplier: 1.25, marginTop: 1, marginBottom: 0.5, minLinesAfter: 2 };
            const minLinesNeeded = subConfig.minLinesAfter ?? 2;

            // Lookahead: check if the next element is a paragraph
            const nextEl = children[childIdx + 1];
            const nextIsParagraph = nextEl && (nextEl.tagName === 'P' || nextEl.tagName === 'DIV');

            console.log(`[FORWARD] nextIsParagraph=${nextIsParagraph}, minLinesNeeded=${minLinesNeeded}`);

            if (nextIsParagraph) {
              // Calculate remaining space after placing this header
              const remainingAfterHeader = contentHeight - (currentHeight + elHeight);
              const linesAfterHeader = Math.floor(remainingAfterHeader / lineHeightPx);

              console.log(`[FORWARD] remainingAfterHeader=${remainingAfterHeader}px, linesAfterHeader=${linesAfterHeader}, minNeeded=${minLinesNeeded}`);

              // If not enough lines for minLinesAfter, force page break
              if (linesAfterHeader < minLinesNeeded) {
                console.log(`[FORWARD] ORPHAN DETECTED! Moving to next page. Lines ${linesAfterHeader} < ${minLinesNeeded}`);

                // Calculate the space that will be freed by removing this header
                const spaceFreed = elHeight;

                // Professional redistribution: expand line-height to fill the gap
                // This makes the page look fuller without leaving whitespace
                const expandedHtml = currentHtml.replace(
                  /line-height:[^;]*;/g,
                  (match) => {
                    // Increase line-height by distributing the freed space
                    const expansionFactor = 1 + (spaceFreed / (currentHeight * 1.5));
                    const newLineHeight = Math.min(2.0, baseLineHeight * expansionFactor);
                    return `line-height:${newLineHeight};`;
                  }
                );

                generatedPages.push({ 
                  html: expandedHtml, 
                  pageNumber: generatedPages.length + 1, 
                  chapterTitle: chapter.title, 
                  isBlank: false,
                  currentSubheader: currentSubheader
                });
                currentHtml = elHtml;
                currentHeight = elHeight;

                // Also include the next paragraph if it exists
                if (nextEl) {
                  childIdx++; // Skip next element in loop so it's not processed twice
                  let nextElHtml = '';
                  const nextTag = nextEl.tagName;

                  if (nextTag === 'P' || nextTag === 'DIV') {
                    const indent = safeConfig.paragraph?.firstLineIndent || 1.5;
                    nextElHtml = `<p style="margin:0 0;padding:0;text-align:${textAlign};text-indent:0;text-justify:inter-word;hyphens:auto;text-align-last:left;overflow-wrap:break-word;line-height:${baseLineHeight};">${nextEl.innerHTML}</p>`;
                    paragraphCount++;
                  }

                  if (nextElHtml) {
                    const combined = currentHtml + nextElHtml;
                    measureDiv.innerHTML = combined;
                    const combinedHeight = measureDiv.offsetHeight;

                    if (combinedHeight <= contentHeight) {
                      currentHtml = combined;
                      currentHeight = combinedHeight;
                    }
                  }
                }
                continue; // Skip to next iteration
              }
            }
          }

          // Normal placement
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
          isFirstChapterPage: currentHtml === titleHtml,
          currentSubheader: currentSubheader
        });
      }
    };

    const applyFillPass = () => {
      for (let pageIdx = 0; pageIdx < generatedPages.length - 1; pageIdx++) {
        // Inner loop: seguir rellenando esta página hasta que no se pueda más
        for (;;) {
          const page = generatedPages[pageIdx];
          if (page.isBlank) break;

          measureDiv.innerHTML = page.html;
          const remainingSpace = contentHeight - measureDiv.offsetHeight;
          const remainingLines = Math.floor(remainingSpace / lineHeightPx);

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
          const isPseudoHeader = isHeaderLike(firstEl);

          // NEVER move headers or pseudo-headers back - they were separated to prevent orphans!
          if (isHeader || isList || isPseudoHeader) {
            break;
          }

          const firstElOuter = firstEl.outerHTML;
          let moved = false;

          // Medir la combinación directamente para que los márgenes CSS se calculen en contexto
          measureDiv.innerHTML = page.html + firstElOuter;
          if (measureDiv.offsetHeight <= contentHeight) {
            // El elemento cabe completo — verificar restricción de viuda
            firstEl.remove();
            const restHtml = tmp.innerHTML;
            measureDiv.innerHTML = restHtml;
            const widowLines = restHtml.trim() ? Math.round(measureDiv.offsetHeight / lineHeightPx) : Infinity;

            if (!restHtml.trim() || widowLines >= minWidowLines) {
              generatedPages[pageIdx] = { ...page, html: page.html + firstElOuter };
              generatedPages[nextIdx] = { ...nextPage, html: restHtml };
              moved = true;
            }
          } else if (!isHeader && !isList && splitLongParagraphs) {
            // El elemento no cabe completo — intentar dividir el párrafo
            const fillSpace = remainingLines * lineHeightPx;
            const splitArr = splitParagraphByLines(firstElOuter, measureDiv, fillSpace, textAlign);

            if (splitArr.length > 1) {
              const chunk = splitArr[0];
              const rest = splitArr.slice(1).join('');

              // Verificar que el chunk realmente cabe (medición directa)
              measureDiv.innerHTML = page.html + chunk;
              if (measureDiv.offsetHeight <= contentHeight) {
                measureDiv.innerHTML = chunk;
                const chunkLines = Math.round(measureDiv.offsetHeight / lineHeightPx);

                // Widow: medir solo el fragmento restante del párrafo dividido
                measureDiv.innerHTML = rest;
                const widowLines = rest.trim() ? Math.round(measureDiv.offsetHeight / lineHeightPx) : Infinity;

                firstEl.remove();
                const restPageHtml = rest + tmp.innerHTML;

                if (chunkLines >= minOrphanLines && (!rest.trim() || widowLines >= minWidowLines)) {
                  generatedPages[pageIdx] = { ...page, html: page.html + chunk };
                  generatedPages[nextIdx] = { ...nextPage, html: restPageHtml };
                  moved = true;
                }
              }
            }
          }

          if (!moved) break; // No se pudo mover nada — pasar a la siguiente página
        }
      }
    };

    const intelligentHeaderOrphanFix = () => {
      // Post-fill validation: detect and fix orphaned headers using intelligent strategy selection
      for (let pageIdx = 0; pageIdx < generatedPages.length; pageIdx++) {
        const page = generatedPages[pageIdx];
        if (page.isBlank) continue;

        // Check if page ends with a header (actual <h*> tag or pseudo-header like bold <p>)
        const lastEl = getLastElement(page.html);
        if (!lastEl) {
          continue;
        }

        // Check if it's a real header or a pseudo-header (bold paragraph that looks like header)
        const isRealHeader = /^H[1-6]$/i.test(lastEl.tagName);
        const isBoldShort = lastEl.tagName === 'P' || lastEl.tagName === 'DIV';
        const text = lastEl.textContent?.trim() || '';
        const isBold = lastEl.style.fontWeight === 'bold' ||
                       lastEl.style.fontWeight >= '700' ||
                       lastEl.innerHTML.includes('font-weight');
        const isShortText = text.length > 0 && text.length < 100 && !text.includes('\n');
        const isPseudoHeader = isBoldShort && isBold && isShortText;

        if (!isRealHeader && !isPseudoHeader) {
          continue; // No header-like element at end
        }

        const headerHtml = lastEl.outerHTML;
        const headerLevel = isRealHeader ? lastEl.tagName.slice(1) : '3'; // Treat pseudo-headers as h3 equivalent

        const nextPage = generatedPages[pageIdx + 1];
        if (!nextPage || nextPage.isBlank) {
          continue;
        }

        // Measure space BEFORE the header to determine remaining space after it
        const pageWithoutHeader = page.html.replace(headerHtml, '');
        measureDiv.innerHTML = pageWithoutHeader;
        const heightWithoutHeader = measureDiv.offsetHeight;
        const remainingSpace = contentHeight - heightWithoutHeader;
        const linesRemaining = Math.floor(remainingSpace / lineHeightPx);

        const level = `h${headerLevel}`;
        const subConfig = safeConfig.subheaders?.[level] || { minLinesAfter: 2 };
        const minLinesNeeded = subConfig.minLinesAfter ?? 2;

        if (linesRemaining >= minLinesNeeded) {
          continue; // Not orphaned
        }

        // Calculate scores for each strategy
        const strategies = {};

        // Strategy A: Reduce header margins
        const needed = minLinesNeeded - linesRemaining;
        const marginPixels = needed * lineHeightPx;
        const headerMarginTotal = (subConfig.marginTop || 1) * lineHeightPx + (subConfig.marginBottom || 0.5) * lineHeightPx;
        const marginReducePercent = Math.min(1, marginPixels / headerMarginTotal);

        if (marginReducePercent > 0.30) {
          strategies.headerMargins = { score: 30, reason: 'too aggressive' };
        } else {
          strategies.headerMargins = { score: Math.max(50, 90 - (marginReducePercent * 200)), reason: `${Math.round(marginReducePercent * 100)}% reduction` };
        }

        // Strategy B: Reduce paragraph spacing (not implemented yet - set to 0)
        strategies.paragraphSpacing = { score: 0 };

        // Strategy C: Bring lines from next paragraph
        const firstElNext = getFirstElement(nextPage.html);
        if (firstElNext && (firstElNext.tagName === 'P' || firstElNext.tagName === 'DIV')) {
          measureDiv.innerHTML = firstElNext.outerHTML;
          const nextParaHeight = measureDiv.offsetHeight;
          const linesOfNextPara = Math.floor(nextParaHeight / lineHeightPx);
          if (linesOfNextPara >= needed && (remainingSpace + nextParaHeight) <= contentHeight) {
            strategies.nextParagraph = { score: 95, reason: 'perfect fit' };
          } else {
            strategies.nextParagraph = { score: 0 };
          }
        } else {
          strategies.nextParagraph = { score: 0 };
        }

        // Strategy D: Force page break
        if (remainingSpace <= 20) {
          strategies.pageBreak = { score: 85, reason: 'almost no space' };
        } else if (remainingSpace <= 50) {
          strategies.pageBreak = { score: 70, reason: 'acceptable space waste' };
        } else {
          strategies.pageBreak = { score: 40, reason: 'significant empty space' };
        }

        // Select best strategy
        const best = Object.entries(strategies).reduce((a, b) => b[1].score > a[1].score ? b : a);

        // Apply best strategy if score >= 50, otherwise fallback to page break
        if (best[1].score >= 50) {
          if (best[0] === 'headerMargins') {
            // Force page break is safer than margin adjustment for now
            generatedPages[pageIdx] = { ...page, html: pageWithoutHeader };
            generatedPages[pageIdx + 1] = { ...nextPage, html: headerHtml + nextPage.html };
          } else if (best[0] === 'nextParagraph') {
            // The fill pass already handles this - do nothing
          } else if (best[0] === 'pageBreak') {
            // Force page break - move header to next page
            generatedPages[pageIdx] = { ...page, html: pageWithoutHeader };
            generatedPages[pageIdx + 1] = { ...nextPage, html: headerHtml + nextPage.html };
          }
        } else {
          // Fallback: force page break
          generatedPages[pageIdx] = { ...page, html: pageWithoutHeader };
          generatedPages[pageIdx + 1] = { ...nextPage, html: headerHtml + nextPage.html };
        }
      }
    };

    const getLastElement = (html) => {
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const children = Array.from(tmp.children);
      return children.length > 0 ? children[children.length - 1] : null;
    };

    const getFirstElement = (html) => {
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const children = Array.from(tmp.children);
      return children.length > 0 ? children[0] : null;
    };

    // Check if an element is a real header OR pseudo-header (bold short text)
    const isHeaderLike = (el) => {
      if (!el) return false;

      // Real header
      if (/^H[1-6]$/i.test(el.tagName)) return true;

      // Pseudo-header: bold paragraph
      if (el.tagName === 'P' || el.tagName === 'DIV') {
        const text = el.textContent?.trim() || '';
        const innerHTML = el.innerHTML || '';

        // Check for bold via: CSS font-weight, <strong>, <b>, or bold class
        const isBold = el.style.fontWeight === 'bold' ||
                       el.style.fontWeight >= '700' ||
                       innerHTML.includes('font-weight') ||
                       innerHTML.includes('<strong>') ||
                       innerHTML.includes('<b>') ||
                       innerHTML.includes('class="bold"') ||
                       innerHTML.includes('bold');

        const isShortText = text.length > 0 && text.length < 100 && !text.includes('\n');
        const hasContent = text.length > 5; // At least 5 chars

        const result = isBold && isShortText && hasContent;
        if (result) {
          console.log(`[PSEUDO-HEADER] Detected: text="${text.substring(0,40)}", isBold=${isBold}, isShort=${isShortText}`);
        }
        return result;
      }

      return false;
    };

    const finalize = () => {
      applyFillPass();
      intelligentHeaderOrphanFix();
      const finalPages = generatedPages.filter(p => p.isBlank || p.html.trim());
      finalPages.forEach((p, idx) => { p.pageNumber = idx + 1; });
      setPages(finalPages);
      setCurrentPage(prev => Math.min(prev, finalPages.length - 1));
    };

    const processNextChapter = () => {
      if (cancelled) return;
      if (chapterIdx < safeBookData.chapters.length) {
        processChapter(safeBookData.chapters[chapterIdx], chapterIdx);
        chapterIdx++;
        requestAnimationFrame(processNextChapter);
      } else {
        finalize();
      }
    };

    requestAnimationFrame(processNextChapter);
    return () => { cancelled = true; };
  }, [safeBookData?.chapters, safeBookData?.bookType, safeConfig]);

  useEffect(() => {
    if (!activeChapterId || !pages.length) return;
    // Solo navegar cuando el capítulo activo cambia, no cuando páginas se recalculan
    if (navigatedChapterRef.current === activeChapterId) return;
    const chapter = safeBookData?.chapters?.find(c => c.id === activeChapterId);
    if (!chapter) return;
    const chapterPageIndex = pages.findIndex(p => p.chapterTitle === chapter.title);
    if (chapterPageIndex > -1) {
      setCurrentPage(chapterPageIndex);
      navigatedChapterRef.current = activeChapterId;
    }
  }, [activeChapterId, pages, safeBookData?.chapters]);

  const totalPages = pages.length;

  const goToPrevPage = () => {
    if (currentPage > 0) setCurrentPage(currentPage - 1);
  };

  const goToNextPage = () => {
    if (currentPage < totalPages - 1) setCurrentPage(currentPage + 1);
  };

  const goToFirstPage = () => {
    if (currentPage !== 0) setCurrentPage(0);
  };

  const goToLastPage = () => {
    if (currentPage !== totalPages - 1) setCurrentPage(totalPages - 1);
  };

  const goToPage = (pageNum) => {
    setCurrentPage(Math.max(0, Math.min(pageNum - 1, totalPages - 1)));
  };

  if (!safeBookData?.chapters?.length) {
    return (
      <div className="preview-empty">
        <p>Sube contenido para ver la vista previa</p>
      </div>
    );
  }

  const currentPageData = pages[currentPage] || { html: '', pageNumber: 1, isBlank: true };

  const PX_PER_MM = 3.7795;
  // Escala ajustada al espacio real disponible en el sidebar (~220px)
  const previewScale = Math.min(0.42, 220 / (pageFormat.width * PX_PER_MM));
  // Dimensiones del preview con la escala fija
  const pageWidth = pageFormat.width * PX_PER_MM * previewScale;
  const pageHeight = pageFormat.height * PX_PER_MM * previewScale;
  const marginTop = bookConfig.marginTop * 96 * previewScale;
  const marginBottom = bookConfig.marginBottom * 96 * previewScale;
  const marginLeft = (bookConfig.marginLeft + (bookConfig.gutter || 0)) * 96 * previewScale;
  const marginRight = bookConfig.marginRight * 96 * previewScale;
  const fontSize = (safeConfig.fontSize || bookConfig.fontSize) * (96 / 72) * previewScale;
  const fontFamily = safeConfig.fontFamily || bookConfig.fontFamily;
  const lineHeight = safeConfig.lineHeight || bookConfig.lineHeight;
  const textAlign = safeConfig.paragraph?.align || 'justify';

  const numPos = safeConfig.pageNumberPos || 'bottom';
  const numAlign = safeConfig.pageNumberAlign || 'center';
  const contentW = pageWidth - marginLeft - marginRight;

  const showNums = safeConfig.showPageNumbers !== false;
  
  // Header configuration - must be defined before paginationSamePosition
  const showHeaders = safeConfig.showHeaders;
  const headerConfig = { 
    template: 'classic',
    displayMode: 'alternate',
    evenPage: { leftContent: 'title', centerContent: 'none', rightContent: 'none' },
    oddPage: { leftContent: 'none', centerContent: 'none', rightContent: 'chapter' },
    trackSubheaders: false,
    trackPseudoHeaders: false,
    subheaderLevels: ['h1', 'h2'],
    showLine: true,
    lineStyle: 'solid',
    lineWidth: 0.5,
    lineColor: 'black',
    skipFirstChapterPage: true,
    fontSize: 70,
    fontFamily: 'same',
    ...(safeConfig.header || {})
  };
  const headerContent = safeConfig.headerContent || 'both';
  const headerPos = safeConfig.headerPosition || 'top';
  
  // Check if pagination is in same position as header
  const paginationSamePosition = numPos === headerPos && showNums && showHeaders;
  const conflictResolution = headerConfig.whenPaginationSamePosition || 'merge';
  
  // Page number rendering - will be modified if there's a conflict with header
  const pageNumHtml = (showNums && !currentPageData.isBlank) ? (
    <div className="page-number" style={{ position: 'absolute', ...(numPos === 'bottom' ? { bottom: `${Math.round(marginBottom * 0.45)}px` } : { top: `${Math.round(marginTop * 0.3)}px` }), ...(numAlign === 'center' ? { left: `${marginLeft}px`, width: `${contentW}px`, textAlign: 'center' } : {}) }}>
      {currentPageData.pageNumber}
    </div>
  ) : null;
  const headerLine = safeConfig.headerLine !== false;
  const bookTitle = safeBookData.title || '';

  // Determine if this is the first page of a chapter
  const isFirstChapterPage = currentPageData.isFirstChapterPage || 
    (currentPage === 0) || 
    (pages[currentPage - 1]?.chapterTitle !== currentPageData.chapterTitle);

  // Check if we should skip header on first chapter page
  const skipHeader = headerConfig.skipFirstChapterPage && isFirstChapterPage;

  // Get current subheader from page data (tracked during pagination)
  const currentSubheader = currentPageData.currentSubheader || '';
  
  // Determine if page is even or odd (1-indexed, so page 1 is odd)
  const isEvenPage = currentPageData.pageNumber % 2 === 0;
  
  // Get subtopic behavior configuration
  const subtopicBehavior = headerConfig.subtopicBehavior || 'none';
  const subtopicSeparator = headerConfig.subtopicSeparator || ' | ';
  const subtopicMaxLength = headerConfig.subtopicMaxLength || 60;
  
  // Truncate subtopic if needed
  const truncatedSubheader = currentSubheader.length > subtopicMaxLength 
    ? currentSubheader.substring(0, subtopicMaxLength - 3) + '...' 
    : currentSubheader;

  // Determine header content based on template configuration
  const getHeaderContent = (contentType) => {
    const baseContent = (() => {
      switch (contentType) {
        case 'title': return bookTitle || 'Sin título';
        case 'chapter': return currentPageData.chapterTitle || 'Capítulo';
        case 'subheader': return truncatedSubheader || '';
        case 'page': return String(currentPageData.pageNumber || '');
        default: return '';
      }
    })();
    
    // Apply subtopic behavior if we have a subtopic and behavior is not 'none'
    if (truncatedSubheader && subtopicBehavior !== 'none' && contentType !== 'page') {
      switch (subtopicBehavior) {
        case 'replace':
          // Subtopic replaces the content
          return truncatedSubheader;
        case 'combine':
          // Combine content with subtopic using separator
          return baseContent ? `${baseContent}${subtopicSeparator}${truncatedSubheader}` : truncatedSubheader;
        case 'odd-only':
          // Subtopic only on odd pages
          if (!isEvenPage) {
            return truncatedSubheader;
          }
          return baseContent;
        case 'even-only':
          // Subtopic only on even pages
          if (isEvenPage) {
            return truncatedSubheader;
          }
          return baseContent;
        default:
          return baseContent;
      }
    }
    
    return baseContent;
  };

  // Get display mode (default to 'alternate' for backward compatibility)
  const displayMode = headerConfig.displayMode || 'alternate';
  
  // Determine if we should show header based on display mode
  let shouldShowHeader = false;
  let pageConfig;
  
  switch (displayMode) {
    case 'both':
      // Show on all pages
      shouldShowHeader = true;
      pageConfig = headerConfig.evenPage || { leftContent: 'title', centerContent: 'none', rightContent: 'none' };
      break;
    case 'even-only':
      // Show only on even pages
      shouldShowHeader = isEvenPage;
      pageConfig = headerConfig.evenPage || { leftContent: 'title', centerContent: 'none', rightContent: 'none' };
      break;
    case 'odd-only':
      // Show only on odd pages
      shouldShowHeader = !isEvenPage;
      pageConfig = headerConfig.oddPage || { leftContent: 'none', centerContent: 'none', rightContent: 'chapter' };
      break;
    case 'alternate':
    default:
      // Alternate between even and odd page configs
      shouldShowHeader = true;
      pageConfig = isEvenPage 
        ? (headerConfig.evenPage || { leftContent: 'title', centerContent: 'none', rightContent: 'none' })
        : (headerConfig.oddPage || { leftContent: 'none', centerContent: 'none', rightContent: 'chapter' });
      break;
  }

  // Build header text based on template
  let headerLeft = '';
  let headerCenter = '';
  let headerRight = '';

  if (showHeaders && !currentPageData.isBlank && !skipHeader && shouldShowHeader) {
    // Use new template-based configuration if available
    if (headerConfig.template) {
      headerLeft = getHeaderContent(pageConfig.leftContent);
      headerCenter = getHeaderContent(pageConfig.centerContent);
      headerRight = getHeaderContent(pageConfig.rightContent);
    } else {
      // Fallback to legacy configuration
      if (headerContent === 'title') {
        headerCenter = bookTitle;
      } else if (headerContent === 'chapter') {
        headerCenter = currentPageData.chapterTitle || '';
      } else {
        // 'both' - alternate based on page
        if (isEvenPage) {
          headerLeft = bookTitle;
        } else {
          headerRight = currentPageData.chapterTitle || '';
        }
      }
    }
  }

  const headerTopPx = Math.round(marginTop * 0.3);
  const headerBottomPx = Math.round(marginBottom * 0.3);
  const PT2PX = 96 / 72;
  
  // Header font size based on config (percentage of base font size)
  const headerFontSizePercent = headerConfig.fontSize || 70;
  const baseHeaderFontSize = (safeConfig.fontSize || 12) * (headerFontSizePercent / 100);
  let headerFontSize = Math.max(7, Math.round(baseHeaderFontSize * PT2PX * previewScale));

  // Header font family
  const getHeaderFontFamily = () => {
    switch (headerConfig.fontFamily) {
      case 'sans': return 'Arial, sans-serif';
      case 'small-caps': return `${fontFamily}; font-variant: small-caps`;
      default: return fontFamily;
    }
  };

  // Line style - returns object with border properties
  const getLineStyleObj = () => {
    const width = headerConfig.lineWidth || 0.5;
    const color = headerConfig.lineColor === 'gray' ? '#999' : 
                  headerConfig.lineColor === 'light-gray' ? '#ccc' : '#333';
    
    switch (headerConfig.lineStyle) {
      case 'dashed': return { borderTop: `${width}px dashed ${color}` };
      case 'dotted': return { borderTop: `${width}px dotted ${color}` };
      case 'double': return { borderTop: `${width * 2}px double ${color}` };
      default: return { borderTop: `${width}px solid ${color}` };
    }
  };

  // Build header HTML
  const hasHeaderContent = headerLeft || headerCenter || headerRight;
  const showHeaderLine = (headerConfig.showLine !== false) && hasHeaderContent;

  // Auto-adjust font size to fit in single line
  // Measure text width and reduce font if needed
  const measureHeaderText = (text, fontSize) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${fontSize}px ${getHeaderFontFamily().split(';')[0]}`;
    return ctx.measureText(text).width;
  };

  // Combine all header text for measurement
  const allHeaderText = [headerLeft, headerCenter, headerRight].filter(Boolean).join('   ');
  
  // Reduce font size if text is too wide for single line
  if (allHeaderText && headerFontSize > 5) {
    let testFontSize = headerFontSize;
    const maxIterations = 15;
    let iteration = 0;
    
    while (iteration < maxIterations) {
      const textWidth = measureHeaderText(allHeaderText, testFontSize);
      if (textWidth <= contentW * 0.95) break; // 95% of content width to be safe
      testFontSize = Math.max(5, testFontSize - 0.5);
      iteration++;
    }
    
    headerFontSize = testFontSize;
  }

  // Calculate line height for spacing
  const headerLineHeight = headerFontSize * 1.2;
  
  // Space between header line and content (at least one line height)
  const headerLineSpacing = headerLineHeight;

  // Handle pagination/header conflict resolution
  const renderHeaderWithPagination = () => {
    if (!showHeaders || !hasHeaderContent) {
      return { headerHtml: null, pageNumHtml };
    }
    
    // If no conflict, render normally
    if (!paginationSamePosition) {
      return { headerHtml: (
        <div 
          className="preview-header" 
          style={{ 
            position: 'absolute', 
            ...(headerPos === 'top' ? { top: `${headerTopPx}px` } : { bottom: `${headerBottomPx}px` }), 
            left: `${marginLeft}px`, 
            width: `${contentW}px`, 
            fontSize: `${headerFontSize}px`, 
            fontFamily: getHeaderFontFamily(),
            color: '#444', 
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            whiteSpace: 'nowrap'
          }}
        >
          <span style={{ textAlign: 'left', flex: '1' }}>{headerLeft}</span>
          <span style={{ textAlign: 'center', flex: '1' }}>{headerCenter}</span>
          <span style={{ textAlign: 'right', flex: '1' }}>{headerRight}</span>
        </div>
      ), pageNumHtml };
    }
    
    // Handle conflict based on resolution strategy
    switch (conflictResolution) {
      case 'stack':
        // Header on top, page number below
        return {
          headerHtml: (
            <div 
              className="preview-header" 
              style={{ 
                position: 'absolute', 
                ...(headerPos === 'top' ? { top: `${headerTopPx}px` } : { bottom: `${headerBottomPx + headerLineHeight + 4}px` }), 
                left: `${marginLeft}px`, 
                width: `${contentW}px`, 
                fontSize: `${headerFontSize}px`, 
                fontFamily: getHeaderFontFamily(),
                color: '#444', 
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                whiteSpace: 'nowrap'
              }}
            >
              <span style={{ textAlign: 'left', flex: '1' }}>{headerLeft}</span>
              <span style={{ textAlign: 'center', flex: '1' }}>{headerCenter}</span>
              <span style={{ textAlign: 'right', flex: '1' }}>{headerRight}</span>
            </div>
          ),
          pageNumHtml: (showNums && !currentPageData.isBlank) ? (
            <div className="page-number" style={{ 
              position: 'absolute', 
              ...(headerPos === 'top' 
                ? { top: `${headerTopPx + headerLineHeight + 8}px` } 
                : { bottom: `${headerBottomPx}px` }), 
              ...(numAlign === 'center' ? { left: `${marginLeft}px`, width: `${contentW}px`, textAlign: 'center' } : {}),
              fontSize: `${headerFontSize}px`,
              color: '#444'
            }}>
              {currentPageData.pageNumber}
            </div>
          ) : null
        };
        
      case 'merge':
        // Merge header and page number on same line
        // Determine where to place page number based on alignment
        const mergedLeft = numAlign === 'left' ? `${currentPageData.pageNumber} | ${headerLeft}` : headerLeft;
        const mergedCenter = numAlign === 'center' ? `${headerCenter} | ${currentPageData.pageNumber}` : headerCenter;
        const mergedRight = numAlign === 'right' ? `${headerRight} | ${currentPageData.pageNumber}` : headerRight;
        
        return {
          headerHtml: (
            <div 
              className="preview-header" 
              style={{ 
                position: 'absolute', 
                ...(headerPos === 'top' ? { top: `${headerTopPx}px` } : { bottom: `${headerBottomPx}px` }), 
                left: `${marginLeft}px`, 
                width: `${contentW}px`, 
                fontSize: `${headerFontSize}px`, 
                fontFamily: getHeaderFontFamily(),
                color: '#444', 
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                whiteSpace: 'nowrap'
              }}
            >
              <span style={{ textAlign: 'left', flex: '1' }}>{mergedLeft}</span>
              <span style={{ textAlign: 'center', flex: '1' }}>{mergedCenter}</span>
              <span style={{ textAlign: 'right', flex: '1' }}>{mergedRight}</span>
            </div>
          ),
          pageNumHtml: null // Page number is merged into header
        };
        
      case 'separate':
        // Header and page number with space between them
        return {
          headerHtml: (
            <div 
              className="preview-header" 
              style={{ 
                position: 'absolute', 
                ...(headerPos === 'top' ? { top: `${headerTopPx}px` } : { bottom: `${headerBottomPx + headerLineHeight + 12}px` }), 
                left: `${marginLeft}px`, 
                width: `${contentW}px`, 
                fontSize: `${headerFontSize}px`, 
                fontFamily: getHeaderFontFamily(),
                color: '#444', 
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                whiteSpace: 'nowrap'
              }}
            >
              <span style={{ textAlign: 'left', flex: '1' }}>{headerLeft}</span>
              <span style={{ textAlign: 'center', flex: '1' }}>{headerCenter}</span>
              <span style={{ textAlign: 'right', flex: '1' }}>{headerRight}</span>
            </div>
          ),
          pageNumHtml: (showNums && !currentPageData.isBlank) ? (
            <div className="page-number" style={{ 
              position: 'absolute', 
              ...(headerPos === 'top' 
                ? { top: `${headerTopPx + headerLineHeight + 16}px` } 
                : { bottom: `${headerBottomPx}px` }), 
              ...(numAlign === 'center' ? { left: `${marginLeft}px`, width: `${contentW}px`, textAlign: 'center' } : {}),
              fontSize: `${headerFontSize}px`,
              color: '#444'
            }}>
              {currentPageData.pageNumber}
            </div>
          ) : null
        };
        
      default:
        return { headerHtml: null, pageNumHtml };
    }
  };
  
  const { headerHtml, pageNumHtml: resolvedPageNumHtml } = renderHeaderWithPagination();

  // Header line as separate element
  const headerLineHtml = (showHeaders && hasHeaderContent && showHeaderLine) ? (
    <div 
      className="preview-header-line"
      style={{ 
        position: 'absolute',
        left: `${marginLeft}px`,
        width: `${contentW}px`,
        ...(headerPos === 'top' 
          ? { top: `${headerTopPx + headerLineHeight + 4}px` } 
          : { bottom: `${headerBottomPx + headerLineHeight + 4}px` }),
        ...getLineStyleObj()
      }}
    />
  ) : null;

  return (
    <div className="preview-wrapper">
      <div ref={measureRef} lang="es" style={{ position: 'fixed', left: -99999, top: 0, visibility: 'hidden' }}></div>
      
      <div className="preview-controls">
        <div className="preview-controls-left">
          <button 
            className="btn btn-icon" 
            onClick={goToFirstPage}
            disabled={currentPage === 0}
            title="Primera página"
          >
            «
          </button>
          <button 
            className="btn btn-icon" 
            onClick={goToPrevPage}
            disabled={currentPage === 0}
            title="Página anterior"
          >
            ←
          </button>
          <span className="page-info">
            <input 
              type="number" 
              min="1" 
              max={totalPages}
              value={currentPage + 1}
              onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
              className="page-input"
            /> 
            / {totalPages}
          </span>
          <button 
            className="btn btn-icon" 
            onClick={goToNextPage}
            disabled={currentPage >= totalPages - 1}
            title="Página siguiente"
          >
            →
          </button>
          <button 
            className="btn btn-icon" 
            onClick={goToLastPage}
            disabled={currentPage >= totalPages - 1}
            title="Última página"
          >
            »
          </button>
        </div>
        <div className="preview-controls-right">
          <button 
            className={`zoom-btn ${magnifierZoom === 150 ? 'active' : ''}`}
            onClick={() => setMagnifierZoom(150)}
            title="Zoom 150%"
          >
            150%
          </button>
          <button 
            className={`zoom-btn ${magnifierZoom === 200 ? 'active' : ''}`}
            onClick={() => setMagnifierZoom(200)}
            title="Zoom 200%"
          >
            200%
          </button>
          <button 
            className={`zoom-btn ${magnifierZoom === 250 ? 'active' : ''}`}
            onClick={() => setMagnifierZoom(250)}
            title="Zoom 250%"
          >
            250%
          </button>
          <button 
            className={`zoom-btn ${magnifierZoom === 300 ? 'active' : ''}`}
            onClick={() => setMagnifierZoom(300)}
            title="Zoom 300%"
          >
            300%
          </button>
        </div>
      </div>

      <div className="preview-scroll">
          <div
          ref={previewPageRef}
          className="preview-page"
          lang="es"
          style={{
            width: `${pageWidth}px`,
            height: `${pageHeight}px`,
            padding: `${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px`,
            fontSize: `${fontSize}px`,
            fontFamily: fontFamily,
            lineHeight: lineHeight,
            textAlign: textAlign,
            textJustify: 'inter-word',
            hyphens: 'auto',
            wordBreak: 'break-word'
          }}
          onMouseEnter={(e) => {
            isOverPreview.current = true;
            isOverMagnifier.current = false;
            setShowMagnifier(true);
            updateMagnifierPosition(e);
          }}
          onMouseLeave={() => {
            isOverPreview.current = false;
            setShowMagnifier(false);
          }}
          onMouseMove={(e) => {
            if (isOverPreview.current) {
              updateMagnifierPosition(e);
            }
          }}
        >
          <div 
            className="preview-content"
            style={{
              height: '100%',
              overflow: 'hidden',
              pointerEvents: 'none'
            }}
          dangerouslySetInnerHTML={{ __html: currentPageData.isBlank ? '' : currentPageData.html }}
          />
          
          <div style={{ pointerEvents: 'none' }}>
            {resolvedPageNumHtml}
            {headerHtml}
            {headerLineHtml}
          </div>
        </div>
      </div>

      <div className="preview-info">
        <span>{pageFormat.name}</span>
        <span>{fontFamily}</span>
        <span>{safeConfig.fontSize || bookConfig.fontSize}pt</span>
      </div>

      {showMagnifier && (() => {
        const magScale = magnifierZoom / 100;
        const tx = (magnifierPos.x / 100 - 0.5) * pageWidth * (1 - magScale);
        const ty = (magnifierPos.y / 100 - 0.5) * pageHeight * (1 - magScale);

        return (
        <div 
          className="magnifier-panel" 
          ref={magnifierPanelRef}
          style={{ pointerEvents: 'none' }}
        >
          <div className="magnifier-panel-header">
            <span>Vista {magnifierZoom}%</span>
          </div>
          <div className="magnifier-panel-content">
            <div className="magnifier-page-wrapper">
              <div
                className="preview-page magnifier-page"
                lang="es"
                style={{
                  width: `${pageWidth}px`,
                  height: `${pageHeight}px`,
                  padding: `${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px`,
                  fontSize: `${fontSize}px`,
                  fontFamily: fontFamily,
                  lineHeight: lineHeight,
                  textAlign: textAlign,
                  textJustify: 'inter-word',
                  hyphens: 'auto',
                  wordBreak: 'break-word',
                  background: 'white',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                  transform: `scale(${magScale}) translate(${tx}px, ${ty}px)`,
                  transformOrigin: '0 0'
                }}
              >
                <div 
                  className="preview-content"
                  style={{ height: '100%', overflow: 'hidden' }}
                  dangerouslySetInnerHTML={{ __html: currentPageData.isBlank ? '' : currentPageData.html }}
                />
                {resolvedPageNumHtml}
                {headerHtml}
              </div>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

export default memo(Preview);
