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
  const safeConfig = config || { pageFormat: 'a5', fontSize: 12, lineHeight: 1.6 };
  
  const bookConfig = KDP_STANDARDS.getBookTypeConfig(safeBookData.bookType);
  const pageFormat = KDP_STANDARDS.getPageFormat(safeConfig.pageFormat || bookConfig.recommendedFormat);

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

    measureDiv.style.width = `${contentWidth}px`;
    measureDiv.style.fontFamily = safeConfig.fontFamily || bookConfig.fontFamily;
    measureDiv.style.fontSize = `${safeConfig.fontSize || bookConfig.fontSize}pt`;
    measureDiv.style.lineHeight = safeConfig.lineHeight || bookConfig.lineHeight;
    measureDiv.style.textAlign = 'justify';
    measureDiv.style.textIndent = '1.5em';
    measureDiv.style.textJustify = 'inter-word';
    measureDiv.style.padding = '0';

    const generatedPages = [];
    
    safeBookData.chapters.forEach((chapter, chapterIndex) => {
      const isSection = chapter.type === 'section';
      
      if (chapterIndex > 0 && !isSection) {
        if (generatedPages.length % 2 === 1) {
          generatedPages.push({ html: '', pageNumber: generatedPages.length + 1, isBlank: true });
        }
      }
      
      const titleSize = Math.round((safeConfig.fontSize || bookConfig.fontSize) * 1.8);
      const titleHtml = isSection
        ? `<div style="font-size:${Math.round((safeConfig.fontSize || bookConfig.fontSize) * 1.35)}pt;font-weight:bold;font-style:italic;text-align:center;margin:0.25em 0 1em 0;">${chapter.title}</div>`
        : `<div style="font-size:${titleSize}pt;font-weight:bold;text-align:center;margin:0.5em 0 1.5em 0;">${chapter.title}</div>`;
      
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
        let elHtml = '';
        
        if (tag === 'P') {
          paragraphCount++;
          const isFirstParagraph = paragraphCount === 1;
          elHtml = `<p style="margin:0;padding:0;text-align:justify;text-indent:${isFirstParagraph ? '0' : '1.5em'};text-justify:inter-word;line-height:${safeConfig.lineHeight || bookConfig.lineHeight};">${el.innerHTML}</p>`;
        } else if (tag.match(/^H[1-6]$/i)) {
          const sz = Math.round((safeConfig.fontSize || bookConfig.fontSize) * 1.25);
          elHtml = `<h${el.tagName.slice(1)} style="font-size:${sz}pt;font-weight:bold;margin:1em 0 0.5em 0;text-align:center;line-height:1.3;">${el.innerHTML}</h${el.tagName.slice(1)}>`;
        } else if (tag === 'UL' || tag === 'OL') {
          elHtml = `<${tag.toLowerCase()} style="margin:0.5em 0;padding-left:1.5em;line-height:${safeConfig.lineHeight || bookConfig.lineHeight};">${el.innerHTML}</${tag.toLowerCase()}>`;
        } else if (tag === 'HR') {
          elHtml = '<hr style="border:none;border-top:1px solid #999;margin:1em 0;">';
        } else if (tag === 'DIV' || tag === 'BR') {
          elHtml = `<p style="margin:0;padding:0;text-align:justify;text-indent:1.5em;text-justify:inter-word;line-height:${safeConfig.lineHeight || bookConfig.lineHeight};">${el.innerHTML || '<br>'}</p>`;
        } else {
          elHtml = `<p style="margin:0;padding:0;text-align:justify;text-indent:1.5em;text-justify:inter-word;line-height:${safeConfig.lineHeight || bookConfig.lineHeight};">${el.innerHTML}</p>`;
        }
        
        const candidateHtml = currentHtml + elHtml;
        measureDiv.innerHTML = candidateHtml;
        const candidateHeight = measureDiv.offsetHeight;
        
        if (candidateHeight > contentHeight && currentHtml) {
          generatedPages.push({ html: currentHtml, pageNumber: generatedPages.length + 1, chapterTitle: chapter.title, isBlank: false });
          currentHtml = elHtml;
          measureDiv.innerHTML = elHtml;
          currentHeight = measureDiv.offsetHeight;
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
  }, [safeBookData?.chapters, safeBookData?.bookType, safeConfig.pageFormat, safeConfig.fontSize, safeConfig.lineHeight, safeConfig.fontFamily]);

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
