import { useState, useRef, useCallback } from 'react';

export const useMagnifier = (previewPageRef) => {
  const [showMagnifier, setShowMagnifier] = useState(false);
  const [magnifierPos, setMagnifierPos] = useState({ x: 50, y: 50 });
  const [magnifierZoom, setMagnifierZoom] = useState(200);
  const magnifierPanelRef = useRef(null);
  const isOverPreview = useRef(false);
  const isOverMagnifier = useRef(false);
  const magnifierTimeoutRef = useRef(null);
  
  const updateMagnifierPosition = useCallback((e) => {
    const pageEl = previewPageRef?.current;
    if (!pageEl) return;
    
    try {
      const pageRect = pageEl.getBoundingClientRect();
      const viewportX = e.clientX;
      const viewportY = e.clientY;
      
      const x = Math.max(0, Math.min(100, ((viewportX - pageRect.left) / pageRect.width) * 100));
      const y = Math.max(0, Math.min(100, ((viewportY - pageRect.top) / pageRect.height) * 100));
      
      setMagnifierPos({ x, y });
    } catch (error) {
      console.warn('Error updating magnifier position:', error);
    }
  }, [previewPageRef]);
  
  const handleMouseEnterPreview = useCallback(() => {
    isOverPreview.current = true;
    if (magnifierTimeoutRef.current) {
      clearTimeout(magnifierTimeoutRef.current);
    }
    setShowMagnifier(true);
  }, []);
  
  const handleMouseLeavePreview = useCallback(() => {
    isOverPreview.current = false;
    magnifierTimeoutRef.current = setTimeout(() => {
      if (!isOverMagnifier.current) {
        setShowMagnifier(false);
      }
    }, 300);
  }, []);
  
  const handleMouseEnterMagnifier = useCallback(() => {
    isOverMagnifier.current = true;
    if (magnifierTimeoutRef.current) {
      clearTimeout(magnifierTimeoutRef.current);
    }
  }, []);
  
  const handleMouseLeaveMagnifier = useCallback(() => {
    isOverMagnifier.current = false;
    magnifierTimeoutRef.current = setTimeout(() => {
      if (!isOverPreview.current) {
        setShowMagnifier(false);
      }
    }, 300);
  }, []);
  
  return {
    showMagnifier,
    setShowMagnifier,
    magnifierPos,
    magnifierZoom,
    setMagnifierZoom,
    magnifierPanelRef,
    updateMagnifierPosition,
    handleMouseEnterPreview,
    handleMouseLeavePreview,
    handleMouseEnterMagnifier,
    handleMouseLeaveMagnifier
  };
};
