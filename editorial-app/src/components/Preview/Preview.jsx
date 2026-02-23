import { useState, useEffect, useMemo } from 'react';
import { KDP_STANDARDS } from '../../utils/kdpStandards';
import useEditorStore from '../../store/useEditorStore';
import './Preview.css';

function Preview() {
  const { document, config } = useEditorStore();
  const [currentPage, setCurrentPage] = useState(0);
  const [zoom, setZoom] = useState(50);
  
  const bookConfig = KDP_STANDARDS.getBookTypeConfig(document.bookType);
  const pageFormat = KDP_STANDARDS.getPageFormat(config.pageFormat || bookConfig.recommendedFormat);

  const pages = useMemo(() => {
    if (!document.chapters.length) return [];
    
    const allContent = document.chapters.map(ch => ({
      title: ch.title,
      html: ch.html,
      type: ch.type
    }));
    
    const CHARS_PER_PAGE = 1200;
    const result = [];
    
    allContent.forEach((chapter) => {
      const textLength = chapter.html.replace(/<[^>]*>/g, '').length;
      const numPages = Math.max(1, Math.ceil(textLength / CHARS_PER_PAGE));
      
      for (let i = 0; i < numPages; i++) {
        result.push({
          chapterTitle: chapter.title,
          chapterType: chapter.type,
          pageInChapter: i + 1,
          totalInChapter: numPages,
          html: chapter.html,
          isFirstPage: i === 0
        });
      }
    });
    
    return result;
  }, [document.chapters, document.bookType]);

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

  if (!document.chapters.length) {
    return (
      <div className="preview-empty">
        <p>Sube contenido para ver la vista previa</p>
      </div>
    );
  }

  const currentPageData = pages[currentPage] || pages[0];

  const PX_PER_MM = 3.7795;
  const scale = zoom / 100;
  const pageWidth = pageFormat.width * PX_PER_MM * scale;
  const pageHeight = pageFormat.height * PX_PER_MM * scale;
  const marginTop = bookConfig.marginTop * 96 * scale;
  const marginBottom = bookConfig.marginBottom * 96 * scale;
  const marginLeft = (bookConfig.marginLeft + (bookConfig.gutter || 0)) * 96 * scale;
  const marginRight = bookConfig.marginRight * 96 * scale;
  const fontSize = bookConfig.fontSize * (96 / 72) * scale;

  const renderPageContent = (html) => {
    if (!html) return '';
    
    const text = html.replace(/<[^>]*>/g, '');
    const CHARS_PER_PAGE = 1200;
    const start = currentPageData.pageInChapter === 1 ? 0 : (currentPageData.pageInChapter - 1) * CHARS_PER_PAGE;
    const end = start + CHARS_PER_PAGE;
    
    const pageText = text.substring(start, end);
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    const charsRemaining = pageText.length;
    let currentLength = 0;
    let resultHtml = '';
    
    const walk = (node) => {
      if (currentLength >= charsRemaining) return;
      
      if (node.nodeType === Node.TEXT_NODE) {
        const remaining = charsRemaining - currentLength;
        if (node.textContent.length <= remaining) {
          resultHtml += node.textContent;
          currentLength += node.textContent.length;
        } else {
          resultHtml += node.textContent.substring(0, remaining);
          currentLength = charsRemaining;
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName.toLowerCase();
        if (['p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
          if (resultHtml && !resultHtml.endsWith('<')) {
            resultHtml += `<${tag}>`;
          }
          Array.from(node.childNodes).forEach(walk);
          if (tag !== 'br') resultHtml += `</${tag}>`;
        } else {
          Array.from(node.childNodes).forEach(walk);
        }
      }
    };
    
    tempDiv.childNodes.forEach(walk);
    
    return resultHtml || pageText;
  };

  return (
    <div className="preview-wrapper">
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
            fontFamily: bookConfig.fontFamily,
            lineHeight: bookConfig.lineHeight
          }}
        >
          {currentPageData.isFirstPage && (
            <div className="preview-chapter-title">
              {currentPageData.chapterType === 'section' ? '§ ' : 'Capítulo '}
              {currentPageData.chapterTitle}
            </div>
          )}
          
          <div 
            className="preview-content"
            dangerouslySetInnerHTML={{ __html: currentPageData.html || '' }}
          />
          
          {config.showPageNumbers && (
            <div className="page-number">
              {currentPage + 1}
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
