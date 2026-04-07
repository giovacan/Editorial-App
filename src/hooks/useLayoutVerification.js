/**
 * useLayoutVerification.js — P6: Layout Verification System
 *
 * Measures EVERY paginated page with a real DOM element and compares
 * against the Canvas-predicted height and the content-height budget.
 *
 * Layer 1: Post-pagination DOM audit (all pages, off-screen)
 * Layer 2: Per-page overflow data for visual indicators
 *
 * Only active in development mode. Zero overhead in production.
 *
 * Usage (in Preview.jsx):
 *   const auditReport = useLayoutVerification(pages, layoutDims);
 *   // auditReport.summary.clippedCount, auditReport.pages[i].clipped, etc.
 */

import { useState, useEffect, useRef } from 'react';
import { measureHtmlHeight, createLayoutContext } from '../utils/textLayoutEngine';

const IS_DEV = process.env.NODE_ENV === 'development';

/**
 * @param {Array} pages - paginated pages array (each has .html, .isBlank, .pageNumber)
 * @param {object|null} layoutDims - { contentHeight, contentWidth, lineHeightPx, baseFontSizePx, baseLineHeight, fontFamily, textAlign }
 * @returns {object|null} - { summary, pages[] } or null if not ready / production
 */
export function useLayoutVerification(pages, layoutDims) {
  const [report, setReport] = useState(null);
  const measureDivRef = useRef(null);

  useEffect(() => {
    if (!IS_DEV) return;
    if (!pages?.length || !layoutDims) return;

    const {
      contentHeight,
      contentWidth,
      lineHeightPx,
      baseFontSizePx,
      baseLineHeight,
      fontFamily,
      textAlign,
      headerSpaceEstimate,
    } = layoutDims;
    const chStartExtra = headerSpaceEstimate || 0;

    if (!contentHeight || !contentWidth || !lineHeightPx) return;

    // Build canvasCtx for measureHtmlHeight comparison.
    // MUST include widthSlack to match the engine's canvasCtx — without it, Canvas
    // measures fewer lines (wider available width) and reports lower heights, creating
    // a false discrepancy with DOM. The engine uses JUSTIFY_SLACK_RATIO = 0.06.
    const widthSlack = textAlign === 'justify' ? contentWidth * 0.06 : 0;
    const canvasCtx = { ...createLayoutContext(baseFontSizePx, baseLineHeight, contentWidth, fontFamily), widthSlack, lineHeightPx, noHyphenation: true };

    // Wait for render + fonts to settle (double rAF)
    let cancelled = false;
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        if (cancelled) return;

        // Create or reuse off-screen measurement div
        if (!measureDivRef.current) {
          measureDivRef.current = document.createElement('div');
          document.body.appendChild(measureDivRef.current);
        }
        const measureDiv = measureDivRef.current;
        measureDiv.style.cssText = [
          'position:fixed', 'left:-99999px', 'top:0',
          'visibility:hidden', 'pointer-events:none',
          `width:${contentWidth}px`,
          `font-size:${baseFontSizePx}px`,
          `font-family:${fontFamily || 'serif'}`,
          `line-height:${lineHeightPx}px`,
          `text-align:${textAlign || 'justify'}`,
          'text-justify:inter-word',
          'hyphens:none',
          'word-break:break-word',
          'overflow-wrap:break-word',
          'overflow:visible',
          'padding:0', 'margin:0',
          'box-sizing:border-box',
        ].join(';');

        // Apply the same CSS resets as .preview-content.
        // Use a persistent <style> tag + a separate content wrapper so that
        // setting innerHTML on the wrapper doesn't destroy the reset rules.
        measureDiv.classList.add('lv-measure');
        const styleTag = document.createElement('style');
        styleTag.textContent = `
          .lv-measure p, .lv-measure h1, .lv-measure h2, .lv-measure h3,
          .lv-measure h4, .lv-measure h5, .lv-measure h6,
          .lv-measure ul, .lv-measure ol, .lv-measure li,
          .lv-measure blockquote { margin:0; padding:0; border:0; }
          .lv-measure li { text-indent:0; }
        `;
        measureDiv.innerHTML = '';
        measureDiv.appendChild(styleTag);
        const contentWrapper = document.createElement('div');
        measureDiv.appendChild(contentWrapper);

        const results = [];

        for (let i = 0; i < pages.length; i++) {
          const page = pages[i];
          if (!page.html || page.isBlank) continue;

          // DOM measurement — set content inside wrapper, style tag persists
          contentWrapper.innerHTML = page.html;
          const domHeight = contentWrapper.scrollHeight;

          // Canvas measurement
          const canvasHeight = measureHtmlHeight(page.html, canvasCtx);

          // Chapter-start pages have extra budget (header space reclaimed).
          const isChStart = !!(page.isFirstChapterPage || (page.html && page.html.includes('data-chapter-start="true"')));
          const pageBudget = contentHeight + (isChStart ? chStartExtra : 0);

          const delta = domHeight - canvasHeight;       // positive = DOM taller
          const overflow = domHeight - pageBudget;      // positive = clipped
          const deltaLines = lineHeightPx > 0 ? delta / lineHeightPx : 0;
          const overflowLines = lineHeightPx > 0 ? overflow / lineHeightPx : 0;

          results.push({
            pageIndex: i,
            pageNumber: page.pageNumber || i + 1,
            chapterTitle: page.chapterTitle || '',
            domHeight: +domHeight.toFixed(1),
            canvasHeight: +canvasHeight.toFixed(1),
            budget: +pageBudget.toFixed(1),
            delta: +delta.toFixed(1),
            overflow: +overflow.toFixed(1),
            deltaLines: +deltaLines.toFixed(2),
            overflowLines: +overflowLines.toFixed(2),
            clipped: overflow > 6,  // 6px tolerance (half-line subpixel rounding)
          });
        }

        // Per-element diagnostic for worst pages
        if (process.env.NODE_ENV === 'development') {
          const worstPages = results
            .filter(r => r.clipped)
            .sort((a, b) => b.delta - a.delta)
            .slice(0, 3);

          for (const wp of worstPages) {
            const page = pages[wp.pageIndex];
            contentWrapper.innerHTML = page.html;
            const children = contentWrapper.children;
            const elDetails = [];
            let domSum = 0;
            for (let ci = 0; ci < children.length; ci++) {
              const child = children[ci];
              const domH = child.offsetHeight;
              const cs = window.getComputedStyle(child);
              const mt = parseFloat(cs.marginTop) || 0;
              const mb = parseFloat(cs.marginBottom) || 0;
              const tag = child.tagName;
              const textSnippet = (child.textContent || '').substring(0, 40);
              const outerHtml = child.outerHTML;
              const canvasH = measureHtmlHeight(outerHtml, canvasCtx);
              const elLh = parseFloat(cs.lineHeight) || lineHeightPx;
              const domLines = Math.round(domH / elLh);
              const canvasLines = Math.round(canvasH / elLh);
              domSum += domH + mt + mb;
              elDetails.push(
                `  ${tag} domH=${domH} canvasH=${canvasH} Δ=${domH-canvasH} lines=${domLines}/${canvasLines} lh=${elLh.toFixed(1)} mt=${mt.toFixed(1)} mb=${mb.toFixed(1)} "${textSnippet}"`
              );
            }
            console.warn(
              `[ELEMENT-AUDIT] p${wp.pageNumber} (pageDelta=${wp.delta}px dom=${wp.domHeight} canvas=${wp.canvasHeight}):\n` +
              `  scrollH=${contentWrapper.scrollHeight} domChildSum=${domSum.toFixed(1)} children=${children.length}\n` +
              `  pageFlags: titleOnly=${page.isTitleOnlyPage} firstCh=${page.isFirstChapterPage} blank=${page.isBlank} ch="${page.chapterTitle}"\n` +
              `  canvasCtx: bf=${canvasCtx.baseFontSizePx.toFixed(2)} lh=${canvasCtx.baseLineHeight} w=${canvasCtx.contentWidth.toFixed(1)} ws=${canvasCtx.widthSlack?.toFixed(1)} noHyph=${canvasCtx.noHyphenation}\n` +
              elDetails.join('\n')
            );
            // Also log first page's raw HTML (truncated)
            if (wp === worstPages[0]) {
              console.warn(`[ELEMENT-AUDIT-HTML] p${wp.pageNumber} html (first 2000 chars):\n${page.html.substring(0, 2000)}`);
            }
          }
        }

        // Clear innerHTML to release memory
        measureDiv.innerHTML = '';

        // Summary
        if (results.length === 0) {
          setReport(null);
          return;
        }

        const clippedPages = results.filter(r => r.clipped);
        const deltas = results.map(r => r.delta);
        const maxDelta = Math.max(...deltas);
        const minDelta = Math.min(...deltas);
        const avgDelta = deltas.reduce((s, d) => s + d, 0) / deltas.length;
        const domSlackBudget = Math.round(lineHeightPx * 1.0); // DOM_SLACK used in engine

        const worstByDelta = results.reduce((w, r) => Math.abs(r.delta) > Math.abs(w.delta) ? r : w, results[0]);
        const worstByOverflow = results.reduce((w, r) => r.overflow > w.overflow ? r : w, results[0]);

        const summary = {
          totalPages: results.length,
          clippedCount: clippedPages.length,
          clippedPages: clippedPages.map(r => `p${r.pageNumber}`),
          maxDelta: +maxDelta.toFixed(1),
          minDelta: +minDelta.toFixed(1),
          avgDelta: +avgDelta.toFixed(1),
          maxDeltaLines: +(maxDelta / lineHeightPx).toFixed(2),
          domSlackBudget: +domSlackBudget.toFixed(1),
          domSlackSufficient: maxDelta <= domSlackBudget,
          worstDeltaPage: worstByDelta.pageNumber,
          worstOverflowPage: worstByOverflow.pageNumber,
          worstOverflowPx: +worstByOverflow.overflow.toFixed(1),
        };

        const newReport = { summary, pages: results };
        setReport(newReport);

        // Console output
        if (clippedPages.length > 0) {
          console.error(
            `[LAYOUT-AUDIT] ${clippedPages.length} CLIPPED pages:`,
            clippedPages.map(r => `p${r.pageNumber}(+${r.overflow.toFixed(1)}px/${r.overflowLines.toFixed(1)}ln)`).join(', ')
          );
        }
        console.log(
          `[LAYOUT-AUDIT] ${results.length} pages measured. ` +
          `Max DOM-Canvas delta: ${maxDelta.toFixed(1)}px (${(maxDelta / lineHeightPx).toFixed(2)} lines). ` +
          `Avg delta: ${avgDelta.toFixed(1)}px. ` +
          `DOM_SLACK budget: ${domSlackBudget.toFixed(1)}px — ${maxDelta <= domSlackBudget ? 'SUFFICIENT' : 'EXCEEDED'}. ` +
          `Clipped: ${clippedPages.length}`
        );

        // Post to API for persistent logging
        try {
          fetch('/api/layout-audit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              summary,
              // Only send clipped + worst pages to keep payload small
              worstPages: results
                .filter(r => r.clipped || Math.abs(r.delta) > domSlackBudget * 0.8)
                .slice(0, 20),
              timestamp: new Date().toISOString(),
            })
          }).catch(() => {});
        } catch { /* no-op */ }
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
    };
  }, [pages, layoutDims]);

  // Cleanup DOM on unmount
  useEffect(() => {
    return () => {
      if (measureDivRef.current?.parentNode) {
        measureDivRef.current.parentNode.removeChild(measureDivRef.current);
        measureDivRef.current = null;
      }
    };
  }, []);

  return report;
}

/**
 * Format the audit report as text for the pagination log.
 * @param {object|null} report - from useLayoutVerification
 * @returns {string}
 */
export function formatLayoutAuditText(report) {
  if (!report) return '';
  const { summary, pages } = report;
  const lines = [];

  lines.push(`LAYOUT AUDIT (${summary.totalPages} pages measured):`);

  if (summary.clippedCount > 0) {
    lines.push(`  ⚠️ CLIPPED: ${summary.clippedCount} pages [${summary.clippedPages.join(', ')}]`);
  } else {
    lines.push(`  Clipped: 0 pages ✓`);
  }

  lines.push(`  Max DOM-Canvas delta: ${summary.maxDelta}px (${summary.maxDeltaLines} lines) on p${summary.worstDeltaPage}`);
  lines.push(`  Avg DOM-Canvas delta: ${summary.avgDelta}px`);
  lines.push(`  DOM_SLACK budget: ${summary.domSlackBudget}px — ${summary.domSlackSufficient ? 'SUFFICIENT ✓' : 'EXCEEDED ✖'}`);

  // Show worst cases (clipped or near-boundary)
  const worst = pages
    .filter(r => r.clipped || Math.abs(r.delta) > summary.domSlackBudget * 0.5)
    .sort((a, b) => b.overflow - a.overflow)
    .slice(0, 10);

  if (worst.length > 0) {
    lines.push('  Worst cases:');
    for (const r of worst) {
      const status = r.clipped
        ? `OVERFLOW ${r.overflow}px (${r.overflowLines} lines)`
        : `OK (${(r.budget - r.domHeight).toFixed(1)}px margin)`;
      lines.push(`    p${r.pageNumber}: DOM=${r.domHeight}px Canvas=${r.canvasHeight}px budget=${r.budget}px → ${status}`);
    }
  }

  return lines.join('\n');
}
