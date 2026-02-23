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
  
  const isOverPreview = useRef(false);
  
  const updateMagnifierPosition = (e) => {
    if (previewPageRef.current) {
      const rect = previewPageRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
      setMagnifierPos({ x, y });
      
      if (magnifierPanelRef.current) {
        magnifierPanelRef.current.style.setProperty('--magnifier-x', `${x}%`);
        magnifierPanelRef.current.style.setProperty('--magnifier-y', `${y}%`);
      }
    }
  };
  
  const safeBookData = bookData || { bookType: 'novela', chapters: [], title: '' };
  const safeConfig = config || { 
    pageFormat: 'a5', 
    fontSize: 12, 
    lineHeight: 1.6,
    chapterTitle: { align: 'center', bold: true, sizeMultiplier: 1.8, marginTop: 2, marginBottom: 1, startOnRightPage: true },
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
    pagination: { minOrphanLines: 2, minWidowLines: 2, splitLongParagraphs: true }
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

      const ctConfig = safeConfig.chapterTitle || { align: 'center', bold: true, sizeMultiplier: 1.8, marginTop: 2, marginBottom: 1, layout: 'continuous' };
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

      switch (layout) {
        case 'spaced': {
          // Title centered at ~1/3 of page height
          const spacedTop = Math.round(contentHeight * 0.25);
          titleHtml = `<div style="${titleBaseStyle}margin:${spacedTop}px 0 ${titleMarginBottom}px 0;">${chapter.title}</div>`;
          break;
        }
        case 'halfPage': {
          // Title in upper half, text in lower half
          const halfTop = Math.round((contentHeight * 0.5) - baseTitleHeight - titleMarginBottom);
          titleHtml = `<div style="${titleBaseStyle}margin:${Math.max(0, halfTop)}px 0 ${titleMarginBottom}px 0;">${chapter.title}</div>`;
          break;
        }
        case 'fullPage': {
          // Title centered on its own page
          const fullTop = Math.round((contentHeight - baseTitleHeight) / 2);
          titleHtml = `<div style="${titleBaseStyle}margin:${Math.max(0, fullTop)}px 0 0 0;">${chapter.title}</div>`;
          break;
        }
        case 'ruled': {
          // Title with decorative lines
          const hrMargin = Math.round(titleMarginBottom / 2);
          const hrStyle = `border:none;border-top:1px solid #333;margin:${hrMargin}px 0;`;
          titleHtml = `<div style="margin:${titleMarginTop}px 0 ${titleMarginBottom}px 0;"><div style="${hrStyle}"></div><div style="${titleBaseStyle}padding:${hrMargin}px 0;">${chapter.title}</div><div style="${hrStyle}"></div></div>`;
          break;
        }
        default: {
          // 'continuous' - title at top with normal margins
          titleHtml = `<div style="${titleBaseStyle}margin:${titleMarginTop}px 0 ${titleMarginBottom}px 0;">${chapter.title}</div>`;
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

      if (layout === 'fullPage') {
        // Full page title stands alone, text starts on next page
        generatedPages.push({ html: titleHtml, pageNumber: generatedPages.length + 1, chapterTitle: chapter.title, isBlank: false });
        currentHtml = '';
        currentHeight = 0;
      } else if (titleHeight > contentHeight) {
        generatedPages.push({ html: titleHtml, pageNumber: generatedPages.length + 1, chapterTitle: chapter.title, isBlank: false });
        currentHtml = '';
        currentHeight = 0;
      } else {
        currentHtml = titleHtml;
        currentHeight = titleHeight;
      }

      children.forEach(el => {
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
          paragraphCount++;
        } else if (tag.match(/^H[1-6]$/i)) {
          const level = tag.slice(1).toLowerCase();
          const subConfig = safeConfig.subheaders?.[level] || safeConfig.subheaders?.h2 || { align: 'center', bold: true, sizeMultiplier: 1.25, marginTop: 1, marginBottom: 0.5, minLinesAfter: 1 };
          const subSize = Math.round(baseFontSize * subConfig.sizeMultiplier);
          const subMarginTop = subConfig.marginTop * lineHeightPx;
          const subMarginBottom = subConfig.marginBottom * lineHeightPx;
          elHtml = `<h${level} style="font-size:${subSize}pt;font-weight:${subConfig.bold ? 'bold' : 'normal'};margin:${subMarginTop}px 0 ${subMarginBottom}px 0;text-align:${subConfig.align};line-height:1.3;">${el.innerHTML}</h${level}>`;
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
            generatedPages.push({ html: currentHtml, pageNumber: generatedPages.length + 1, chapterTitle: chapter.title, isBlank: false });
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
                generatedPages.push({ html: lineHtml, pageNumber: generatedPages.length + 1, chapterTitle: chapter.title, isBlank: false });
                lineHtml = '';
              } else {
                const testHtml = lineHtml + line;
                measureDiv.innerHTML = testHtml;

                if (measureDiv.offsetHeight > contentHeight) {
                  if (lineHtml) {
                    generatedPages.push({ html: lineHtml, pageNumber: generatedPages.length + 1, chapterTitle: chapter.title, isBlank: false });
                  }
                  lineHtml = line;
                  measureDiv.innerHTML = line;
                } else {
                  lineHtml = testHtml;
                }
              }
            });

            if (lineHtml) {
              generatedPages.push({ html: lineHtml, pageNumber: generatedPages.length + 1, chapterTitle: chapter.title, isBlank: false });
              lineHtml = '';
            }
          } else {
            generatedPages.push({ html: elHtml, pageNumber: generatedPages.length + 1, chapterTitle: chapter.title, isBlank: false });
          }
          return;
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
            generatedPages.push({ html: currentHtml, pageNumber: generatedPages.length + 1, chapterTitle: chapter.title, isBlank: false });
            currentHtml = elHtml;
            currentHeight = elHeight;
            return;
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
                generatedPages.push({ html: currentHtml + firstChunk, pageNumber: generatedPages.length + 1, chapterTitle: chapter.title, isBlank: false });
                currentHtml = restHtml;
                measureDiv.innerHTML = currentHtml;
                currentHeight = measureDiv.offsetHeight;
              } else {
                generatedPages.push({ html: currentHtml, pageNumber: generatedPages.length + 1, chapterTitle: chapter.title, isBlank: false });
                currentHtml = elHtml;
                currentHeight = elHeight;
              }
            } else {
              generatedPages.push({ html: currentHtml, pageNumber: generatedPages.length + 1, chapterTitle: chapter.title, isBlank: false });
              currentHtml = elHtml;
              currentHeight = elHeight;
            }
          } else {
            generatedPages.push({ html: currentHtml, pageNumber: generatedPages.length + 1, chapterTitle: chapter.title, isBlank: false });
            currentHtml = elHtml;
            measureDiv.innerHTML = elHtml;
            currentHeight = measureDiv.offsetHeight;
          }
        } else {
          currentHtml = candidateHtml;
          currentHeight = candidateHeight;
        }
      });

      if (currentHtml) {
        generatedPages.push({ html: currentHtml, pageNumber: generatedPages.length + 1, chapterTitle: chapter.title, isBlank: false });
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

    const finalize = () => {
      applyFillPass();
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
  const pageNumHtml = (showNums && !currentPageData.isBlank) ? (
    <div className="page-number" style={{ position: 'absolute', ...(numPos === 'bottom' ? { bottom: `${Math.round(marginBottom * 0.45)}px` } : { top: `${Math.round(marginTop * 0.3)}px` }), ...(numAlign === 'center' ? { left: `${marginLeft}px`, width: `${contentW}px`, textAlign: 'center' } : {}) }}>
      {currentPageData.pageNumber}
    </div>
  ) : null;

  const showHeaders = safeConfig.showHeaders;
  const headerContent = safeConfig.headerContent || 'both';
  const headerPos = safeConfig.headerPosition || 'top';
  const headerLine = safeConfig.headerLine !== false;
  const bookTitle = safeBookData.title || '';

  let headerText = '';
  if (showHeaders && !currentPageData.isBlank) {
    if (headerContent === 'title') {
      headerText = bookTitle;
    } else if (headerContent === 'chapter') {
      headerText = currentPageData.chapterTitle || '';
    } else {
      headerText = currentPage % 2 === 0 ? bookTitle : (currentPageData.chapterTitle || '');
    }
  }

  const headerTopPx = Math.round(marginTop * 0.3);
  const headerBottomPx = Math.round(marginBottom * 0.3);
  const PT2PX = 96 / 72;
  const headerFontSize = Math.max(7, Math.round(8 * PT2PX));

  const headerHtml = (showHeaders && headerText) ? (
    <div className="preview-header" style={{ position: 'absolute', ...(headerPos === 'top' ? { top: `${headerTopPx}px` } : { bottom: `${headerBottomPx}px` }), left: `${marginLeft}px`, width: `${contentW}px`, fontSize: `${headerFontSize}px`, color: '#666', fontStyle: 'italic', textAlign: 'center' }}>
      {headerText}
      {headerLine && <div style={{ borderTop: '1px solid #ccc', marginTop: 3 }}></div>}
    </div>
  ) : null;

  return (
    <div className="preview-wrapper">
      <div ref={measureRef} lang="es" style={{ position: 'fixed', left: -99999, top: 0, visibility: 'hidden' }}></div>
      
      <div className="preview-controls">
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
        <select value={magnifierZoom} onChange={(e) => setMagnifierZoom(parseInt(e.target.value))} className="zoom-select" title="Zoom de lupa">
          <option value="150">🔍 150%</option>
          <option value="200">🔍 200%</option>
          <option value="250">🔍 250%</option>
          <option value="300">🔍 300%</option>
        </select>
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
            setShowMagnifier(true);
            updateMagnifierPosition(e);
          }}
          onMouseLeave={() => {
            isOverPreview.current = false;
            setShowMagnifier(false);
          }}
          onMouseMove={(e) => {
            if (isOverPreview.current && previewPageRef.current && magnifierPanelRef.current) {
              const rect = previewPageRef.current.getBoundingClientRect();
              const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
              const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
              magnifierPanelRef.current.style.setProperty('--magnifier-x', `${x}%`);
              magnifierPanelRef.current.style.setProperty('--magnifier-y', `${y}%`);
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
            {pageNumHtml}
            {headerHtml}
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
        const tx = -(magnifierPos.x / 100) * pageWidth * (magScale - 1);
        const ty = -(magnifierPos.y / 100) * pageHeight * (magScale - 1);

        return (
        <div className="magnifier-panel" ref={magnifierPanelRef}>
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
                  transform: `scale(${magScale}) translate(${tx / magScale}px, ${ty / magScale}px)`,
                  transformOrigin: '0 0'
                }}
              >
                <div 
                  className="preview-content"
                  style={{ height: '100%', overflow: 'hidden' }}
                  dangerouslySetInnerHTML={{ __html: currentPageData.isBlank ? '' : currentPageData.html }}
                />
                {pageNumHtml}
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
