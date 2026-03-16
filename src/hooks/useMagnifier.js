import { useState, useRef, useCallback } from 'react';

export const useMagnifier = (previewPageRef) => {
  const [showMagnifier, setShowMagnifier] = useState(false);
  const [magnifierZoom, setMagnifierZoom] = useState(200);
  const magnifierPosRef = useRef({ x: 50, y: 50 });
  const magnifierPanelRef = useRef(null);
  const magnifierPageRef = useRef(null); // inner .preview-page inside magnifier
  const isOverPreview = useRef(false);
  const isOverMagnifier = useRef(false);
  const magnifierTimeoutRef = useRef(null);
  const rafRef = useRef(null);

  // Update magnifier position via direct DOM mutation (no React re-render)
  const updateMagnifierPosition = useCallback((e) => {
    const pageEl = previewPageRef?.current;
    if (!pageEl) return;

    try {
      const pageRect = pageEl.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((e.clientX - pageRect.left) / pageRect.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - pageRect.top) / pageRect.height) * 100));

      magnifierPosRef.current = { x, y };

      // Direct DOM update — no setState, no re-render
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const pageDiv = magnifierPageRef.current;
        if (!pageDiv) return;
        const magScale = magnifierZoom / 100;
        const w = parseFloat(pageDiv.style.width) || 0;
        const h = parseFloat(pageDiv.style.height) || 0;
        const tx = -(x / 100) * w * (magScale - 1);
        const ty = -(y / 100) * h * (magScale - 1);
        pageDiv.style.transform = `scale(${magScale}) translate(${tx / magScale}px, ${ty / magScale}px)`;
      });
    } catch (error) {
      console.warn('Error updating magnifier position:', error);
    }
  }, [previewPageRef, magnifierZoom]);

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
    magnifierPosRef,
    magnifierZoom,
    setMagnifierZoom,
    magnifierPanelRef,
    magnifierPageRef,
    updateMagnifierPosition,
    handleMouseEnterPreview,
    handleMouseLeavePreview,
    handleMouseEnterMagnifier,
    handleMouseLeaveMagnifier
  };
};
