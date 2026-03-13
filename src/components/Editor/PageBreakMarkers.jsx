import { useEffect, useState, useMemo, memo } from 'react';

const PageBreakMarkers = memo(function PageBreakMarkers({ 
  pages, 
  chapterTitle, 
  editorRef,
  visible 
}) {
  const [markerPositions, setMarkerPositions] = useState([]);
  const [editorElement, setEditorElement] = useState(null);

  // Get the editor element from ref
  useEffect(() => {
    if (editorRef?.current) {
      setEditorElement(editorRef.current);
    }
  }, [editorRef]);

  // Calculate marker positions when pages or editor change
  useEffect(() => {
    if (!visible || !editorElement || !pages || pages.length === 0) {
      return;
    }

    const calculatePositions = () => {
      // Get pages for current chapter - use flexible matching
      const chapterPages = pages.filter(p => {
        if (!p.chapterTitle || !chapterTitle) return false;
        return p.chapterTitle === chapterTitle || 
               chapterTitle.includes(p.chapterTitle) || 
               p.chapterTitle.includes(chapterTitle);
      });
      
      console.log('[PageBreakMarkers] chapterTitle:', chapterTitle, 'matched pages:', chapterPages.length);
      console.log('[PageBreakMarkers] First few pages:', JSON.stringify(chapterPages.slice(0, 5).map(p => ({ title: p.chapterTitle, pageNum: p.pageNumber, firstEl: p.firstElementIndex }))));
      
      if (chapterPages.length <= 1) {
        setMarkerPositions([]);
        return;
      }

      // Get all content elements from editor - query inside ProseMirror
      const proseMirror = editorElement.querySelector?.('.ProseMirror') || editorElement.querySelector('.main-editor');
      if (!proseMirror) {
        return;
      }
      
      const contentElements = proseMirror.querySelectorAll('p, h1, h2, h3, h4, h5, h6, blockquote, hr');
      
      if (contentElements.length === 0) {
        setMarkerPositions([]);
        return;
      }

      const positions = [];

      // Get the starting page number for this chapter
      const chapterStartPage = chapterPages[0]?.pageNumber || 1;

      // For each page after the first, find the position
      for (let i = 1; i < chapterPages.length; i++) {
        const page = chapterPages[i];
        
        // Calculate chapter-relative page number
        const chapterPageNum = page.pageNumber - chapterStartPage + 1;
        
        // Get the firstElementIndex - no adjustment needed because:
        // - page 1 is title page (no marker needed as it's the first)
        // - page 2 onwards: firstElementIndex corresponds to content
        let firstElementIndex = page.firstElementIndex;
        
        // If it's a title-only page (firstElementIndex = 0 and it's page 2+ of chapter),
        // use index 0 for first content element
        if (firstElementIndex === 0 && chapterPageNum > 1) {
          firstElementIndex = 0; // First content paragraph
        }

        if (firstElementIndex !== undefined && firstElementIndex >= 0 && firstElementIndex < contentElements.length) {
          const targetElement = contentElements[firstElementIndex];
          
          if (targetElement) {
            // Get position relative to the editor content container
            const elementRect = targetElement.getBoundingClientRect();
            const containerRect = proseMirror.getBoundingClientRect();
            
            // Calculate position relative to the scrollable container
            const position = elementRect.top - containerRect.top;

            positions.push({
              pageNumber: chapterPageNum,
              y: position,
              elementIndex: firstElementIndex
            });
          }
        }
      }
      
      // Sort by position
      positions.sort((a, b) => a.y - b.y);
      
      // Remove markers that are too close together or duplicates
      // Also handle the case where page 1 and page 2 have same firstElementIndex
      const uniquePositions = [];
      let prevY = -1000;
      
      for (const pos of positions) {
        // Skip if too close to previous marker (within 100px)
        if (pos.y - prevY < 100) {
          console.log('[PageBreakMarkers] Skipping marker at y=' + pos.y.toFixed(0) + ' (too close to previous)');
          continue;
        }
        uniquePositions.push(pos);
        prevY = pos.y;
      }
      
      console.log('[PageBreakMarkers] Final markers:', uniquePositions.map(p => ({ page: p.pageNumber, y: p.y.toFixed(0) })));
      setMarkerPositions(uniquePositions);
    };

    // Delay to ensure DOM is ready
    const timer = setTimeout(calculatePositions, 200);

    // Recalculate on scroll
    const handleScroll = () => calculatePositions();
    editorElement.addEventListener('scroll', handleScroll, { passive: true });

    // Initial calculation after a short delay
    const resizeObserver = new ResizeObserver(() => calculatePositions());
    if (editorElement) {
      resizeObserver.observe(editorElement);
    }

    return () => {
      clearTimeout(timer);
      if (editorElement) {
        editorElement.removeEventListener('scroll', handleScroll);
      }
      resizeObserver.disconnect();
    };
  }, [pages, chapterTitle, editorElement, visible]);

  // Don't render if not visible or no markers
  if (!visible || markerPositions.length === 0) {
    return null;
  }

  return (
    <div className="page-break-markers-container">
      {markerPositions.map((marker, index) => (
        <div
          key={`${marker.pageNumber}-${index}`}
          className="page-break-marker"
          style={{ top: `${marker.y}px` }}
        >
          <span className="page-break-label">Página {marker.pageNumber}</span>
        </div>
      ))}
    </div>
  );
});

export default PageBreakMarkers;
