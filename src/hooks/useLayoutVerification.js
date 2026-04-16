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
      chapterStartBottomClearance,
      chapterStartExtraLines,
    } = layoutDims;
    // Use pre-computed chStartExtra from dimsSnapshot (matches worker's value exactly).
    // Fall back to recalculating if not available (backwards compat).
    const chStartExtra = layoutDims.chStartExtra != null
      ? layoutDims.chStartExtra
      : Math.max(0, (headerSpaceEstimate || 0) - (chapterStartBottomClearance || 0))
        + (chapterStartExtraLines || 0) * lineHeightPx;

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

          // Measure where the last line of text actually ends (visual bottom of last element).
          // scrollHeight includes any trailing margin-bottom on the last child.
          // offsetTop + offsetHeight gives the border-box bottom of the last child
          // relative to the contentWrapper, without trailing margins.
          // Note: getBoundingClientRect() is unreliable when the element is off-screen
          // (position:fixed; left:-99999px), so use offsetTop/offsetHeight instead.
          const lastChild = contentWrapper.lastElementChild;
          let textBottom = domHeight; // fallback = scrollHeight
          if (lastChild) {
            const measured = lastChild.offsetTop + lastChild.offsetHeight;
            if (measured > 0) textBottom = measured;
          }

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
            textBottom: +textBottom.toFixed(1),
            textFill: +(textBottom / pageBudget * 100).toFixed(1),
          });
        }

        // Pre-compute worst fill pages (needed for element audit below AND for summary later)
        const normalPagesForAudit = results.filter(r =>
          !pages[r.pageIndex]?.isFirstChapterPage &&
          !pages[r.pageIndex]?.isTitleOnlyPage &&
          !pages[r.pageIndex]?.isChapterLastPage &&
          r.textBottom > 0 &&
          r.textFill >= 75
        );
        const worstFillPages = [...normalPagesForAudit].sort((a, b) => a.textBottom - b.textBottom).slice(0, 5);

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
        const domSlackBudget = Math.round(lineHeightPx * 0.5); // DOM_SLACK used in engine (0.5 lines)

        const worstByDelta = results.reduce((w, r) => Math.abs(r.delta) > Math.abs(w.delta) ? r : w, results[0]);
        const worstByOverflow = results.reduce((w, r) => r.overflow > w.overflow ? r : w, results[0]);

        // Fill uniformity — measure how far the last line of text reaches on normal pages.
        // Excludes chapter-start, title-only, chapter-last pages (structural whitespace expected).
        // Also excludes pages with textFill < 75% — these are chapter-ending pages whose last
        // paragraph happens to be short (no isChapterLastPage flag but structurally partial).
        const normalPages = normalPagesForAudit; // reuse pre-computed list
        const textBottoms = normalPages.map(r => r.textBottom);
        const avgTextBottom = textBottoms.length
          ? textBottoms.reduce((s, v) => s + v, 0) / textBottoms.length : 0;
        const maxTextBottomDev = textBottoms.length
          ? Math.max(...textBottoms.map(v => Math.abs(v - avgTextBottom))) : 0;
        const maxTextBottomDevLines = lineHeightPx > 0 ? maxTextBottomDev / lineHeightPx : 0;

        // Histogram: bucket pages by textFill % to show distribution
        const buckets = { '≥95%': 0, '90-94%': 0, '85-89%': 0, '80-84%': 0, '75-79%': 0, '<75%': 0 };
        for (const r of results) {
          if (pages[r.pageIndex]?.isFirstChapterPage || pages[r.pageIndex]?.isTitleOnlyPage) continue;
          if (r.textFill >= 95) buckets['≥95%']++;
          else if (r.textFill >= 90) buckets['90-94%']++;
          else if (r.textFill >= 85) buckets['85-89%']++;
          else if (r.textFill >= 80) buckets['80-84%']++;
          else if (r.textFill >= 75) buckets['75-79%']++;
          else buckets['<75%']++;
        }
        // worstFillPages already computed above (for element audit)

        const summary = {
          totalPages: results.length,
          contentHeight: +contentHeight.toFixed(1),
          headerSpaceEstimate: +(headerSpaceEstimate || 0).toFixed(1),
          chapterStartBottomClearance: +(chapterStartBottomClearance || 0).toFixed(1),
          chapterStartExtraLines: chapterStartExtraLines || 0,
          chStartExtra: +chStartExtra.toFixed(1),
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
          avgTextBottom: +avgTextBottom.toFixed(1),
          maxTextBottomDev: +maxTextBottomDev.toFixed(1),
          maxTextBottomDevLines: +maxTextBottomDevLines.toFixed(2),
          normalPagesAnalyzed: normalPages.length,
          fillHistogram: { ...buckets },
          worstFillPages: worstFillPages.map(r => ({ pageNumber: r.pageNumber, textFill: r.textFill, textBottom: +r.textBottom.toFixed(0) })),
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
  if (summary.chStartExtra != null) {
    lines.push(`  Dims: contentH=${summary.contentHeight}px headerEst=${summary.headerSpaceEstimate}px clearance=${summary.chapterStartBottomClearance}px extraLines=${summary.chapterStartExtraLines} chStartExtra=${summary.chStartExtra}px`);
  }

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

  // Fill uniformity
  if (summary.normalPagesAnalyzed != null) {
    lines.push(`  Fill uniformity (${summary.normalPagesAnalyzed} normal pages ≥75%): avg=${summary.avgTextBottom}px dev=±${summary.maxTextBottomDev}px (${summary.maxTextBottomDevLines} lines)`);
  }

  // Histogram
  if (summary.fillHistogram) {
    const hist = summary.fillHistogram;
    lines.push(`  Fill histogram: ` + Object.entries(hist).map(([k, v]) => `${k}:${v}`).join(' | '));
  }

  // Worst fill pages
  if (summary.worstFillPages && summary.worstFillPages.length > 0) {
    lines.push(`  Worst fill: ` + summary.worstFillPages.map(r => `p${r.pageNumber}=${r.textFill}%(${r.textBottom}px)`).join(', '));
  }

  return lines.join('\n');
}
