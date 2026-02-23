import { useState, useEffect, useRef, useMemo } from 'react';
import { KDP_STANDARDS } from '../../utils/kdpStandards';
import useEditorStore from '../../store/useEditorStore';
import './Preview.css';

function Preview() {
  const { bookData, config } = useEditorStore();
  const [currentPage, setCurrentPage] = useState(0);
  const [zoom, setZoom] = useState(50);
  const measureRef = useRef(null);
  const [pages, setPages] = useState([]);
  
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
        measureDiv.innerHTML = `<p style="margin:0;padding:0;text-align:${textAlign};text-indent:1.5em;text-justify:inter-word;">${trialHtml}</p>`;
        
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
      
      lines.push(text.substring(0, breakPoint));
      remainingHtml = text.substring(breakPoint);
      
      if (remainingHtml) {
        remainingHtml = `<p style="margin:0;padding:0;text-align:${textAlign};text-indent:0;text-justify:inter-word;">${remainingHtml}</p>`;
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
    const pageWidthPx = pageFormat.width * PX_PER_MM;
    const pageHeightPx = pageFormat.height * PX_PER_MM;
    
    const marginTop = bookConfig.marginTop * 96;
    const marginBottom = bookConfig.marginBottom * 96;
    const marginLeft = (bookConfig.marginLeft + (bookConfig.gutter || 0)) * 96;
    const marginRight = bookConfig.marginRight * 96;
    
    const contentWidth = pageWidthPx - marginLeft - marginRight;
    const contentHeight = pageHeightPx - marginTop - marginBottom;

    const baseFontSize = safeConfig.fontSize || bookConfig.fontSize;
    const baseLineHeight = safeConfig.lineHeight || bookConfig.lineHeight;
    const textAlign = safeConfig.paragraph?.align || 'justify';
    
    measureDiv.style.width = `${contentWidth}px`;
    measureDiv.style.fontFamily = safeConfig.fontFamily || bookConfig.fontFamily;
    measureDiv.style.fontSize = `${baseFontSize}pt`;
    measureDiv.style.lineHeight = baseLineHeight;
    measureDiv.style.textAlign = textAlign;
    measureDiv.style.textJustify = 'inter-word';
    measureDiv.style.padding = '0';

    measureDiv.innerHTML = 'Ag';
    const lineHeightPx = measureDiv.offsetHeight;
    const minOrphanLines = safeConfig.pagination?.minOrphanLines || 1;
    const minWidowLines = safeConfig.pagination?.minWidowLines || 1;
    const splitLongParagraphs = safeConfig.pagination?.splitLongParagraphs !== false;

    const generatedPages = [];
    
    safeBookData.chapters.forEach((chapter, chapterIndex) => {
      const isSection = chapter.type === 'section';
      
      const shouldStartOnRight = isSection 
        ? false 
        : (safeConfig.chapterTitle?.startOnRightPage !== false);
      
      if (shouldStartOnRight && chapterIndex > 0) {
        if (generatedPages.length % 2 === 1) {
          generatedPages.push({ html: '', pageNumber: generatedPages.length + 1, isBlank: true });
        }
      }
      
      const ctConfig = safeConfig.chapterTitle || { align: 'center', bold: true, sizeMultiplier: 1.8, marginTop: 2, marginBottom: 1 };
      const titleSize = Math.round(baseFontSize * ctConfig.sizeMultiplier);
      const titleMarginTop = ctConfig.marginTop * lineHeightPx;
      const titleMarginBottom = ctConfig.marginBottom * lineHeightPx;
      
      const titleHtml = `<div style="font-size:${titleSize}pt;font-weight:${ctConfig.bold ? 'bold' : 'normal'};font-style:${isSection ? 'italic' : 'normal'};text-align:${ctConfig.align};margin:${titleMarginTop}px 0 ${titleMarginBottom}px 0;">${chapter.title}</div>`;
      
      measureDiv.innerHTML = titleHtml;
      const titleHeight = measureDiv.offsetHeight;
      
      let remainingHeight = contentHeight - titleHeight;
      
      if (remainingHeight < 0) {
        generatedPages.push({ html: titleHtml, pageNumber: generatedPages.length + 1, chapterTitle: chapter.title, isBlank: false });
        remainingHeight = contentHeight;
      } else {
        generatedPages.push({ html: titleHtml, pageNumber: generatedPages.length + 1, chapterTitle: chapter.title, isBlank: false });
      }
      
      const tmp = window.document.createElement('div');
      tmp.innerHTML = chapter.html || '<p></p>';
      const children = Array.from(tmp.children).filter(el => el.textContent.trim() || el.tagName === 'HR');
      
      let currentHtml = '';
      let currentHeight = 0;
      let paragraphCount = 0;
      
      children.forEach(el => {
        const tag = el.tagName;
        const tagLower = tag.toLowerCase();
        let elHtml = '';
        
        if (tag === 'P' || tag === 'DIV') {
          const isFirstParagraph = paragraphCount === 1;
          const indent = safeConfig.paragraph?.firstLineIndent || 1.5;
          
          const parentBlockquote = el.closest('blockquote');
          if (parentBlockquote && safeConfig.quote?.enabled) {
            const qConfig = safeConfig.quote;
            elHtml = `<p style="margin:${qConfig.marginTop}em 0 ${qConfig.marginBottom}em ${qConfig.indentLeft}em;padding:0;padding-right:${qConfig.indentRight}em;text-align:${textAlign};text-indent:${isFirstParagraph ? '0' : indent + 'em'};text-justify:inter-word;line-height:${baseLineHeight};font-style:${qConfig.italic ? 'italic' : 'normal'};font-size:${baseFontSize * qConfig.sizeMultiplier}pt;${qConfig.showLine ? 'border-left:3px solid #444;padding-left:0.75em;' : ''}">${el.innerHTML}</p>`;
          } else {
            const spacingBetween = safeConfig.paragraph?.spacingBetween || 0;
            elHtml = `<p style="margin:${spacingBetween > 0 ? spacingBetween + 'em' : '0'} 0;padding:0;text-align:${textAlign};text-indent:${isFirstParagraph ? '0' : indent + 'em'};text-justify:inter-word;line-height:${baseLineHeight};">${el.innerHTML}</p>`;
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
          elHtml = `<blockquote style="margin:${qConfig.marginTop}em ${qConfig.indentRight}em ${qConfig.marginBottom}em ${qConfig.indentLeft}em;padding:0.5em 1em;border-left:${qConfig.showLine ? '3px solid #444' : 'none'};font-style:${qConfig.italic ? 'italic' : 'normal'};font-size:${baseFontSize * qConfig.sizeMultiplier}pt;line-height:${baseLineHeight};">${el.innerHTML}</blockquote>`;
        } else if (tag === 'UL' || tag === 'OL') {
          elHtml = `<${tagLower} style="margin:0.5em 0;padding-left:1.5em;line-height:${baseLineHeight};">${el.innerHTML}</${tagLower}>`;
        } else if (tag === 'HR') {
          elHtml = '<hr style="border:none;border-top:1px solid #999;margin:1em 0;">';
        } else if (tag === 'BR') {
          elHtml = `<br>`;
        } else {
          elHtml = `<p style="margin:0;padding:0;text-align:${textAlign};text-indent:1.5em;text-justify:inter-word;line-height:${baseLineHeight};">${el.innerHTML}</p>`;
        }
        
        measureDiv.innerHTML = elHtml;
        const elHeight = measureDiv.offsetHeight;
        const isHeader = tag.match(/^H[1-6]$/i);
        const headerLevel = isHeader ? tag.slice(1).toLowerCase() : null;
        const subheaderConfig = headerLevel ? (safeConfig.subheaders?.[headerLevel] || safeConfig.subheaders?.h2) : null;
        const minLinesAfterHeader = subheaderConfig?.minLinesAfter || 1;
        
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
            
            if (isHeader && remainingLinesOnPage < minLinesAfterHeader) return true;
            if (remainingLinesOnPage < minOrphanLines) return true;
            if (isList && remainingLinesOnPage < 2) return true;
            return false;
          };
          
          if (shouldBreakPage(el)) {
            generatedPages.push({ html: currentHtml, pageNumber: generatedPages.length + 1, chapterTitle: chapter.title, isBlank: false });
            currentHtml = elHtml;
            measureDiv.innerHTML = elHtml;
            currentHeight = measureDiv.offsetHeight;
            return;
          }
          
          const tryToFillPage = () => {
            const currentIdx = children.indexOf(el);
            if (currentIdx < 0 || currentIdx >= children.length - 1) return null;
            
            let testHtml = currentHtml;
            let testHeight = currentHeight;
            
            for (let j = currentIdx + 1; j < children.length; j++) {
              const nextEl = children[j];
              const nextTag = nextEl.tagName;
              const isNextList = nextTag === 'UL' || nextTag === 'OL';
              
              let nextElHtml = '';
              if (nextTag === 'P' || nextTag === 'DIV') {
                const nextIndent = safeConfig.paragraph?.firstLineIndent || 1.5;
                const nextSpacing = safeConfig.paragraph?.spacingBetween || 0;
                nextElHtml = `<p style="margin:${nextSpacing > 0 ? nextSpacing + 'em' : '0'} 0;padding:0;text-align:${textAlign};text-indent:${nextSpacing > 0 ? '0' : nextIndent + 'em'};text-justify:inter-word;line-height:${baseLineHeight};">${nextEl.innerHTML}</p>`;
              } else if (nextTag === 'UL' || nextTag === 'OL') {
                nextElHtml = `<${nextTag.toLowerCase()} style="margin:0.5em 0;padding-left:1.5em;line-height:${baseLineHeight};">${nextEl.innerHTML}</${nextTag.toLowerCase()}>`;
              } else if (nextTag.match(/^H[1-6]$/i)) {
                const level = nextTag.slice(1).toLowerCase();
                const subCfg = safeConfig.subheaders?.[level] || safeConfig.subheaders?.h2;
                const subSize = Math.round(baseFontSize * (subCfg?.sizeMultiplier || 1.25));
                const subMT = (subCfg?.marginTop || 1) * lineHeightPx;
                const subMB = (subCfg?.marginBottom || 0.5) * lineHeightPx;
                nextElHtml = `<h${level} style="font-size:${subSize}pt;font-weight:${subCfg?.bold ? 'bold' : 'normal'};margin:${subMT}px 0 ${subMB}px 0;text-align:${subCfg?.align || 'center'};line-height:1.3;">${nextEl.innerHTML}</h${level}>`;
              } else {
                nextElHtml = `<p style="margin:0;padding:0;text-align:${textAlign};text-indent:1.5em;text-justify:inter-word;line-height:${baseLineHeight};">${nextEl.innerHTML}</p>`;
              }
              
              measureDiv.innerHTML = testHtml + nextElHtml;
              const newHeight = measureDiv.offsetHeight;
              
              if (newHeight <= contentHeight) {
                testHtml += nextElHtml;
                testHeight = newHeight;
              } else {
                break;
              }
            }
            
            const newRemainingSpace = contentHeight - testHeight;
            if (newRemainingSpace < lineHeightPx * 3 && testHeight > currentHeight) {
              return { html: testHtml, height: testHeight };
            }
            return null;
          };
          
          const fillResult = tryToFillPage();
          
          if (fillResult) {
            generatedPages.push({ html: fillResult.html, pageNumber: generatedPages.length + 1, chapterTitle: chapter.title, isBlank: false });
            currentHtml = elHtml;
            measureDiv.innerHTML = elHtml;
            currentHeight = measureDiv.offsetHeight;
          } else if (splitLongParagraphs) {
            const elLinesArr = splitParagraphByLines(elHtml, measureDiv, contentHeight, textAlign);
            
            let pageContent = currentHtml;
            let pageH = currentHeight;
            
            for (let i = 0; i < elLinesArr.length; i++) {
              const line = elLinesArr[i];
              const isLastLineOfParagraph = i === elLinesArr.length - 1;
              
              const testContent = pageContent + line;
              measureDiv.innerHTML = testContent;
              const testH = measureDiv.offsetHeight;
              
              if (testH > contentHeight) {
                generatedPages.push({ html: pageContent, pageNumber: generatedPages.length + 1, chapterTitle: chapter.title, isBlank: false });
                
                const remainingElLines = elLinesArr.slice(i);
                const isShortRest = remainingElLines.length <= minWidowLines;
                
                if (isShortRest) {
                  currentHtml = remainingElLines.join('');
                  measureDiv.innerHTML = currentHtml;
                  currentHeight = measureDiv.offsetHeight;
                  break;
                } else {
                  pageContent = line;
                  measureDiv.innerHTML = line;
                  pageH = measureDiv.offsetHeight;
                }
              } else {
                pageContent = testContent;
                pageH = testH;
                
                if (isLastLineOfParagraph) {
                  currentHtml = pageContent;
                  currentHeight = pageH;
                }
              }
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
    });
    
    setPages(generatedPages);
    setCurrentPage(0);
  }, [safeBookData?.chapters, safeBookData?.bookType, safeConfig]);

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
  const scale = zoom / 100;
  const pageWidth = pageFormat.width * PX_PER_MM * scale;
  const pageHeight = pageFormat.height * PX_PER_MM * scale;
  const marginTop = bookConfig.marginTop * 96 * scale;
  const marginBottom = bookConfig.marginBottom * 96 * scale;
  const marginLeft = (bookConfig.marginLeft + (bookConfig.gutter || 0)) * 96 * scale;
  const marginRight = bookConfig.marginRight * 96 * scale;
  const fontSize = (safeConfig.fontSize || bookConfig.fontSize) * (96 / 72) * scale;
  const fontFamily = safeConfig.fontFamily || bookConfig.fontFamily;
  const lineHeight = safeConfig.lineHeight || bookConfig.lineHeight;

  const PT2PX = 96 / 72;
  const numSize = Math.max(8, Math.round(9 * PT2PX * scale));

  const numPos = safeConfig.pageNumberPos || 'bottom';
  const numAlign = safeConfig.pageNumberAlign || 'center';
  const contentW = pageWidth - marginLeft - marginRight;

  let numCss = '';
  if (numPos === 'bottom') {
    numCss += `bottom:${Math.round(marginBottom * 0.45)}px;`;
  } else {
    numCss += `top:${Math.round(marginTop * 0.3)}px;`;
  }
  if (numAlign === 'left') {
    numCss += `left:${marginLeft}px;`;
  } else if (numAlign === 'right') {
    numCss += `right:${marginRight}px;`;
  } else if (numAlign === 'outer') {
    numCss += currentPage % 2 === 0 ? `left:${marginLeft}px;` : `right:${marginRight}px;`;
  } else {
    numCss += `left:${marginLeft}px;width:${contentW}px;text-align:center;`;
  }

  const showNums = safeConfig.showPageNumbers !== false;
  const pageNumHtml = (showNums && !currentPageData.isBlank) ? (
    <div className="page-number" style={{ position: 'absolute', ...(numPos === 'bottom' ? { bottom: Math.round(marginBottom * 0.45) } : { top: Math.round(marginTop * 0.3) }), ...(numAlign === 'center' ? { left: marginLeft, width: contentW, textAlign: 'center' } : {}) }}>
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
  const headerFontSize = Math.max(7, Math.round(8 * PT2PX * scale));

  const headerHtml = (showHeaders && headerText) ? (
    <div className="preview-header" style={{ position: 'absolute', ...(headerPos === 'top' ? { top: headerTopPx } : { bottom: headerBottomPx }), left: marginLeft, width: contentW, fontSize: headerFontSize, color: '#666', fontStyle: 'italic', textAlign: 'center' }}>
      {headerText}
      {headerLine && <div style={{ borderTop: '1px solid #ccc', marginTop: 3 }}></div>}
    </div>
  ) : null;

  return (
    <div className="preview-wrapper">
      <div ref={measureRef} style={{ position: 'fixed', left: -99999, top: 0, visibility: 'hidden' }}></div>
      
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
        <select value={zoom} onChange={(e) => setZoom(parseInt(e.target.value))} className="zoom-select">
          <option value="40">40%</option>
          <option value="50">50%</option>
          <option value="75">75%</option>
          <option value="100">100%</option>
        </select>
      </div>

      <div className="preview-scroll">
        <div 
          className="preview-page"
          style={{
            width: pageWidth,
            height: pageHeight,
            padding: `${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px`,
            fontSize: fontSize,
            fontFamily: fontFamily,
            lineHeight: lineHeight
          }}
        >
          <div 
            className="preview-content"
            style={{
              height: '100%',
              overflow: 'hidden'
            }}
            dangerouslySetInnerHTML={{ __html: currentPageData.isBlank ? '' : currentPageData.html }}
          />
          
          {pageNumHtml}
          {headerHtml}
        </div>
      </div>

      <div className="preview-info">
        <span>{pageFormat.name}</span>
        <span>{fontFamily}</span>
        <span>{safeConfig.fontSize || bookConfig.fontSize}pt</span>
      </div>
    </div>
  );
}

export default Preview;
