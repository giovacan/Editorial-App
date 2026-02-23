import { useState, useEffect, useRef } from 'react';
import { KDP_STANDARDS } from '../../utils/kdpStandards';
import useEditorStore from '../../store/useEditorStore';
import './Preview.css';

function Preview() {
  const { document, config } = useEditorStore();
  const [currentPage, setCurrentPage] = useState(0);
  const [zoom, setZoom] = useState(50);
  const containerRef = useRef(null);
  
  const bookConfig = KDP_STANDARDS.getBookTypeConfig(document.bookType);
  const pageFormat = KDP_STANDARDS.getPageFormat(config.pageFormat || bookConfig.recommendedFormat);

  const totalChars = document.chapters.reduce((sum, ch) => sum + (ch.html?.length || 0), 0);
  const charsPerPage = 1500;
  const totalPages = Math.max(1, Math.ceil(totalChars / charsPerPage));

  const currentPageData = document.chapters.length > 0 ? document.chapters[0] : null;

  const goToPrevPage = () => {
    if (currentPage > 0) setCurrentPage(currentPage - 1);
  };

  const goToNextPage = () => {
    if (currentPage < totalPages - 1) setCurrentPage(currentPage + 1);
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
        >
          ←
        </button>
        <span className="page-info">
          {currentPage + 1} / {totalPages}
        </span>
        <button 
          className="btn btn-icon" 
          onClick={goToNextPage}
          disabled={currentPage >= totalPages - 1}
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
          <div 
            className="preview-content"
            dangerouslySetInnerHTML={{ __html: currentPageData?.html || '' }}
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
