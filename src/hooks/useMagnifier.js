import { useState, useRef, useCallback } from 'react';

export const useMagnifier = (previewPageRef) => {
  // showMagnifier is a REF, not state — toggling it does NOT trigger React re-renders.
  // This prevents the browser from reflowing preview text at small scales on hover.
  const showMagnifierRef = useRef(false);
  const magnifierWrapperRef = useRef(null);
  const [magnifierZoom, setMagnifierZoom] = useState(200);
  const magnifierPosRef = useRef({ x: 50, y: 50 });
  const magnifierPanelRef = useRef(null);
  const magnifierPageRef = useRef(null);
  const isOverPreview = useRef(false);
  const isOverMagnifier = useRef(false);
  const magnifierTimeoutRef = useRef(null);
  const rafRef = useRef(null);
  const onShowCallbackRef = useRef(null);

  // Direct DOM show/hide — zero React re-renders
  const setMagnifierVisible = useCallback((visible) => {
    showMagnifierRef.current = visible;
    if (magnifierWrapperRef.current) {
      magnifierWrapperRef.current.style.display = visible ? 'block' : 'none';
    }
    if (visible && onShowCallbackRef.current) {
      requestAnimationFrame(() => onShowCallbackRef.current?.());
    }
  }, []);

  // Update magnifier position via direct DOM mutation (no React re-render)
  const updateMagnifierPosition = useCallback((e) => {
    const pageEl = previewPageRef?.current;
    if (!pageEl) return;

    try {
      const pageRect = pageEl.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((e.clientX - pageRect.left) / pageRect.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - pageRect.top) / pageRect.height) * 100));

      magnifierPosRef.current = { x, y };

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
      // silently ignore
    }
  }, [previewPageRef, magnifierZoom]);

  const handleMouseEnterPreview = useCallback(() => {
    isOverPreview.current = true;
    if (magnifierTimeoutRef.current) {
      clearTimeout(magnifierTimeoutRef.current);
    }
    setMagnifierVisible(true);
  }, [setMagnifierVisible]);

  const handleMouseLeavePreview = useCallback(() => {
    isOverPreview.current = false;
    magnifierTimeoutRef.current = setTimeout(() => {
      if (!isOverMagnifier.current) {
        setMagnifierVisible(false);
      }
    }, 300);
  }, [setMagnifierVisible]);

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
        setMagnifierVisible(false);
      }
    }, 300);
  }, [setMagnifierVisible]);

  return {
    showMagnifierRef,
    magnifierWrapperRef,
    magnifierPosRef,
    magnifierZoom,
    setMagnifierZoom,
    magnifierPanelRef,
    magnifierPageRef,
    onShowCallbackRef,
    updateMagnifierPosition,
    handleMouseEnterPreview,
    handleMouseLeavePreview,
    handleMouseEnterMagnifier,
    handleMouseLeaveMagnifier
  };
};
