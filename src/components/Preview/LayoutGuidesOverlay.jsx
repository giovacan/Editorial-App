/**
 * LayoutGuidesOverlay — visual layout diagnostic overlay for the preview.
 *
 * Shows:
 *   - Blue dashed rect  = actual content bounding box from DOM measurement
 *   - Colored outlines  = bounding box of each block element (p, h1-h6, blockquote)
 *
 * Uses direct DOM measurement to ensure guides always match actual rendered content,
 * regardless of any desync between calculated and actual dimensions.
 */

import { useEffect, useRef, useState, memo, useCallback } from 'react';

const LayoutGuidesOverlay = memo(function LayoutGuidesOverlay({
  contentRef,
  marginTop,
  marginLeft,
  effectiveContentHeight,
  contentWidth,
}) {
  const [guides, setGuides] = useState({
    contentTop: 0,
    contentLeft: 0,
    contentWidth: 0,
    contentHeight: 0,
    blocks: [],
  });
  const rafRef = useRef(null);

  const measure = useCallback(() => {
    if (!contentRef?.current?.parentElement) return;

    const container = contentRef.current;
    const pageEl = container.parentElement;
    const containerRect = container.getBoundingClientRect();
    const pageRect = pageEl.getBoundingClientRect();

    // Measure actual content bounding box from DOM
    const contentLeft = containerRect.left - pageRect.left;
    const contentTop = containerRect.top - pageRect.top;
    
    // Use the actual rendered content dimensions (not the calculated ones)
    // This accounts for any overflow or rendering differences
    const actualContentWidth = container.scrollWidth;
    const actualContentHeight = container.offsetHeight; // Use offsetHeight for the visible height

    // Measure block positions relative to content container
    const children = container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, blockquote');
    const blocks = [];
    for (const el of children) {
      const r = el.getBoundingClientRect();
      if (r.height < 1) continue;
      blocks.push({
        top:    r.top  - containerRect.top,
        left:   r.left - containerRect.left,
        width:  r.width,
        height: r.height,
        tag:    el.tagName.toLowerCase(),
      });
    }

    setGuides({
      contentTop,
      contentLeft,
      contentWidth: actualContentWidth,
      contentHeight: actualContentHeight,
      blocks,
    });
  }, [contentRef]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(measure);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [measure]);

  const { contentTop, contentLeft, contentWidth: actualContentWidth, contentHeight: actualContentHeight, blocks } = guides;

  const tagColor = (tag) => {
    if (tag === 'h1') return 'rgba(231,76,60,0.7)';
    if (tag === 'h2') return 'rgba(230,126,34,0.7)';
    if (tag === 'h3') return 'rgba(241,196,15,0.7)';
    if (/^h[456]$/.test(tag)) return 'rgba(39,174,96,0.7)';
    if (tag === 'blockquote') return 'rgba(155,89,182,0.7)';
    return 'rgba(52,152,219,0.6)';
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'visible',
        zIndex: 10,
      }}
    >
      <div style={{
        position: 'absolute',
        top:    contentTop,
        left:   contentLeft,
        width:  actualContentWidth,
        height: actualContentHeight,
        border: '1px dashed rgba(0,100,255,0.6)',
        boxSizing: 'border-box',
      }} />

      {blocks.map((b, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top:    contentTop + b.top,
            left:   contentLeft + b.left,
            width:  b.width,
            height: b.height,
            outline: `1px solid ${tagColor(b.tag)}`,
            boxSizing: 'border-box',
          }}
        />
      ))}
    </div>
  );
});

export default LayoutGuidesOverlay;
