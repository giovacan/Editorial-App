import { useState, useEffect, useMemo } from 'react';
import { KDP_STANDARDS } from '../../utils/kdpStandards';
import useEditorStore from '../../store/useEditorStore';
import './Preview.css';

function Preview() {
  const { document, config, editing } = useEditorStore();
  const [currentPage, setCurrentPage] = useState(0);
  const [zoom, setZoom] = useState(50);
  
  const activeChapter = document.chapters.find(ch => ch.id === editing.activeChapterId);

  const bookConfig = useMemo(() => {
    return KDP_STANDARDS.getBookTypeConfig(document.bookType);
  }, [document.bookType]);

  const pageFormat = useMemo(() => {
    return KDP_STANDARDS.getPageFormat(config.pageFormat || bookConfig.recommendedFormat);
  }, [config.pageFormat, bookConfig]);

  const pages = useMemo(() => {
    if (!document.chapters.length) return [];
    
    const PX_PER_MM = 3.7795;
    const PT2PX = 96 / 72;
    
    const pageWidth = pageFormat.width * PX_PER_MM;
    const pageHeight = pageFormat.height * PX_PER_MM;
    
    const marginTop = bookConfig.marginTop * 96;
    const marginBottom = bookConfig.marginBottom * 96;
    const marginLeft = (bookConfig.marginLeft + (bookConfig.gutter || 0)) * 96;
    const marginRight = bookConfig.marginRight * 96;
    
    const contentWidth = pageWidth - marginLeft - marginRight;
    const contentHeight = pageHeight - marginTop - marginBottom;
    
    const pagesList = [];
    let currentPageContent = '';
    let pageNumber = 1;
    
    document.chapters.forEach((chapter, chapterIndex) => {
      const isSection = chapter.type === 'section';
      
      if (chapterIndex > 0 && !isSection) {
        if (pagesList.length % 2 === 1) {
          pagesList.push({ html: '', pageNumber: pageNumber++, isBlank: true });
        }
      }
      
      const titleHtml = `<div class="preview-title">${chapter.title}</div>`;
      currentPageContent += titleHtml;
      
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = chapter.html || '<p></p>';
      const paragraphs = Array.from(tempDiv.querySelectorAll('p, h2, h3, ul, ol, hr'));
      
      paragraphs.forEach(p => {
        const pHtml = `<div class="preview-paragraph">${p.innerHTML}</div>`;
        currentPageContent += pHtml;
        
        const testDiv = document.createElement('div');
        testDiv.style.cssText = `width:${contentWidth}px;font-family:${bookConfig.fontFamily};font-size:${bookConfig.fontSize}pt;line-height:${bookConfig.lineHeight};`;
        testDiv.innerHTML = currentPageContent;
        document.body.appendChild(testDiv);
        
        if (testDiv.offsetHeight > contentHeight) {
          document.body.removeChild(testDiv);
          pagesList.push({ html: currentPageContent, pageNumber: pageNumber++, isBlank: false });
          currentPageContent = pHtml;
        } else {
          document.body.removeChild(testDiv);
        }
      });
      
      if (currentPageContent) {
        pagesList.push({ html: currentPageContent, pageNumber: pageNumber++, isBlank: false });
        currentPageContent = '';
      }
    });
    
    return pagesList;
  }, [document.chapters, bookConfig, pageFormat]);

  const currentPageData = pages[currentPage];

  const goToPrevPage = () => {
    if (currentPage > 0) setCurrentPage(currentPage - 1);
  };

  const goToNextPage = () => {
    if (currentPage < pages.length - 1) setCurrentPage(currentPage + 1);
  };

  const handleZoomChange = (e) => {
    setZoom(parseInt(e.target.value));
  };

  if (!document.chapters.length) {
    return (
      <div className="preview-empty">
        <p>Sube contenido para ver la vista previa</p>
      </div>
    );
  }

  const PX_PER_MM = 3.7795;
  const scale = zoom / 100;
  const pageWidth = pageFormat.width * PX_PER_MM * scale;
  const pageHeight = pageFormat.height * PX_PER_MM * scale;
  const marginTop = bookConfig.marginTop * 96 * scale;
  const marginBottom = bookConfig.marginBottom * 96 * scale;
  const marginLeft = (bookConfig.marginLeft + (bookConfig.gutter || 0)) * 96 * scale;
  const marginRight = bookConfig.marginRight * 96 * scale;
  const fontSize = bookConfig.fontSize * (96 / 72) * scale;

  return (
    <div className="preview-wrapper">
      <div className="preview-controls">
        <button 
          className="btn btn-icon" 
          onClick={goToPrevPage}
          disabled={currentPage === 0}
          aria-label="Página anterior"
        >
          ←
        </button>
        <span className="page-info">
          {pages.length > 0 ? `${currentPage + 1} / ${pages.length}` : '0 / 0'}
        </span>
        <button 
          className="btn btn-icon" 
          onClick={goToNextPage}
          disabled={currentPage >= pages.length - 1}
          aria-label="Página siguiente"
        >
          →
        </button>
        <select value={zoom} onChange={handleZoomChange} className="zoom-select">
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
            fontFamily: bookConfig.fontFamily,
            lineHeight: bookConfig.lineHeight
          }}
        >
          {currentPageData?.isBlank ? (
            <div className="blank-page"></div>
          ) : (
            <div 
              className="preview-content"
              dangerouslySetInnerHTML={{ __html: currentPageData?.html || '' }}
            />
          )}
          
          {config.showPageNumbers && !currentPageData?.isBlank && (
            <div className="page-number">
              {currentPageData?.pageNumber}
            </div>
          )}
        </div>
      </div>

      <div className="preview-info">
        <span>{pageFormat.name}</span>
        <span>{bookConfig.fontFamily}</span>
        <span>{bookConfig.fontSize}pt</span>
      </div>
    </div>
  );
}

export default Preview;
