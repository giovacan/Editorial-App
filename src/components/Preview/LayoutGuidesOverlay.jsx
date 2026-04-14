/**
 * LayoutGuidesOverlay — visual layout diagnostic overlay for the preview.
 *
 * Lines shown (all absolute from top of page content area):
 *   Red solid      = engine budget (contentHeight - DOM_SLACK) — paginator hard cut
 *   Orange solid   = render box bottom (effectiveContentHeight) — overflow:hidden clips here
 *   Green dashed   = folio zone top (effectiveContentHeight + marginBottom - folioFromEdge)
 *   Blue dashed    = actual text bottom (last DOM child)
 *   Colored rects  = bounding box per block element
 */

import { useEffect, useRef, useState, memo, useCallback } from 'react';

const LayoutGuidesOverlay = memo(function LayoutGuidesOverlay({
  contentRef,
  engineContentHeight,
  effectiveContentHeight,
  folioFromEdge,
  marginBottom,
  contentWidth,
  pageKey,       // changes with each page navigation → forces re-measure
  marginLeft,    // gutter-aware left margin → used as fallback offset
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

    // Use getBoundingClientRect offset — correctly accounts for gutter/margin changes.
    // Fall back to marginLeft prop if rects are zero (e.g. hidden panel).
    const rectLeft = containerRect.left - pageRect.left;
    const rectTop  = containerRect.top  - pageRect.top;
    const contentLeft = rectLeft > 0 ? rectLeft : (marginLeft ?? 0);
    const contentTop  = rectTop  > 0 ? rectTop  : 0;

    const actualContentWidth = container.scrollWidth;
    const allChildren = container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, blockquote, div');
    let lastChildBottom = 0;
    for (const el of allChildren) {
      const r = el.getBoundingClientRect();
      const bottom = r.bottom - containerRect.top;
      if (bottom > lastChildBottom) lastChildBottom = bottom;
    }
    const actualContentHeight = lastChildBottom > 0 ? lastChildBottom : container.offsetHeight;

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

    setGuides({ contentTop, contentLeft, contentWidth: actualContentWidth, contentHeight: actualContentHeight, blocks });
  }, [contentRef]);

  useEffect(() => {
    // Re-measure on every page change (pageKey) and whenever measure fn changes.
    // Double rAF: first frame renders content, second frame has settled layout.
    const raf1 = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(measure);
    });
    return () => { cancelAnimationFrame(raf1); if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [measure, pageKey, marginLeft]);

  const { contentTop, contentLeft, contentWidth: actualContentWidth, contentHeight: actualContentHeight, blocks } = guides;
  const w = actualContentWidth || contentWidth;

  const tagColor = (tag) => {
    if (tag === 'h1') return 'rgba(231,76,60,0.7)';
    if (tag === 'h2') return 'rgba(230,126,34,0.7)';
    if (tag === 'h3') return 'rgba(241,196,15,0.7)';
    if (/^h[456]$/.test(tag)) return 'rgba(39,174,96,0.7)';
    if (tag === 'blockquote') return 'rgba(155,89,182,0.7)';
    return 'rgba(52,152,219,0.6)';
  };

  const line = (top, color, style, label, labelSide = 'right') => (
    <div style={{
      position: 'absolute',
      top: contentTop + top,
      left: contentLeft,
      width: w,
      height: 0,
      borderTop: `1.5px ${style} ${color}`,
      boxSizing: 'border-box',
    }}>
      <span style={{
        position: 'absolute',
        [labelSide]: 0,
        top: -10,
        fontSize: 7,
        color,
        background: 'rgba(255,255,255,0.85)',
        padding: '0 2px',
        whiteSpace: 'nowrap',
        lineHeight: '10px',
        fontFamily: 'monospace',
      }}>{label}</span>
    </div>
  );

  // Folio zone top = effectiveContentHeight + marginBottom - folioFromEdge
  // (distance from content box top to where the folio number sits)
  const folioZoneTop = (effectiveContentHeight ?? engineContentHeight) + (marginBottom ?? 0) - (folioFromEdge ?? 0);

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible', zIndex: 10 }}>

      {/* Red = engine hard cut (DOM_SLACK already subtracted by engine) */}
      {line(engineContentHeight, 'rgba(210,30,30,0.9)', 'solid', `motor ${engineContentHeight}px`)}

      {/* Orange = render box bottom (overflow:hidden clips here) */}
      {effectiveContentHeight != null && effectiveContentHeight !== engineContentHeight &&
        line(effectiveContentHeight, 'rgba(230,120,0,0.9)', 'solid', `render ${effectiveContentHeight}px`, 'left')}

      {/* Green dashed = folio zone top */}
      {folioFromEdge != null &&
        line(folioZoneTop, 'rgba(30,160,30,0.85)', 'dashed', `folio ↑`, 'right')}

      {/* Blue dashed = actual text bottom from DOM */}
      <div style={{
        position: 'absolute',
        top:    contentTop,
        left:   contentLeft,
        width:  w,
        height: actualContentHeight,
        border: '1px dashed rgba(0,100,255,0.55)',
        boxSizing: 'border-box',
      }}>
        <span style={{
          position: 'absolute',
          left: 0,
          bottom: -10,
          fontSize: 7,
          color: 'rgba(0,80,200,0.9)',
          background: 'rgba(255,255,255,0.85)',
          padding: '0 2px',
          whiteSpace: 'nowrap',
          lineHeight: '10px',
          fontFamily: 'monospace',
        }}>DOM {Math.round(actualContentHeight)}px</span>
      </div>

      {/* Colored outlines per block element */}
      {blocks.map((b, i) => (
        <div key={i} style={{
          position: 'absolute',
          top:    contentTop + b.top,
          left:   contentLeft + b.left,
          width:  b.width,
          height: b.height,
          outline: `1px solid ${tagColor(b.tag)}`,
          boxSizing: 'border-box',
        }} />
      ))}
    </div>
  );
});

export default LayoutGuidesOverlay;
