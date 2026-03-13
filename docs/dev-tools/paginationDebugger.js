/**
 * paginationDebugger.js
 *
 * Lightweight diagnostic tool for pagination issues.
 * Logs real measurements and decisions without refactoring core logic.
 */

export const paginationDebugger = {
  /**
   * Analyze paginated output for visual issues
   */
  analyzePages(pages, contentHeight, lineHeightPx) {
    console.group('[DEBUG] Pagination Analysis');

    let totalLines = 0;
    let totalHeight = 0;
    let blankPageCount = 0;
    let orphanIssues = 0;
    let overflowIssues = 0;

    pages.forEach((page, idx) => {
      // Skip blank pages
      if (page.isBlank || !page.html.trim()) {
        blankPageCount++;
        console.log(`📄 Page ${idx + 1}: BLANK (skipped in preview)`);
        return;
      }

      // Create temp div to measure actual rendered height
      const tempDiv = document.createElement('div');
      tempDiv.style.cssText = `
        position: fixed;
        left: -99999px;
        top: 0;
        width: 120px;
        font-size: 5pt;
        line-height: 1.6;
        visibility: hidden;
      `;
      tempDiv.innerHTML = page.html;
      document.body.appendChild(tempDiv);
      const pageHeight = tempDiv.offsetHeight;
      document.body.removeChild(tempDiv);

      const pageLines = Math.floor(pageHeight / lineHeightPx);
      totalLines += pageLines;
      totalHeight += pageHeight;

      // Detect issues
      const overflow = pageHeight - contentHeight;
      const overflowPercent = ((overflow / contentHeight) * 100).toFixed(1);

      if (overflow > lineHeightPx) {
        overflowIssues++;
        console.warn(
          `⚠️  Page ${idx + 1}: OVERFLOW by ${overflow.toFixed(0)}px (${overflowPercent}% over limit)`,
          { actualHeight: pageHeight.toFixed(0), limit: contentHeight.toFixed(0), lineHeight: lineHeightPx.toFixed(1) }
        );
      } else if (overflow > 0) {
        console.log(
          `📄 Page ${idx + 1}: Minor overflow ${overflow.toFixed(0)}px (${pageLines} lines)`,
          { safeMargin: 'insufficient', lineHeight: lineHeightPx.toFixed(1) }
        );
      } else {
        const percentFull = ((pageHeight / contentHeight) * 100).toFixed(0);
        console.log(`📄 Page ${idx + 1}: OK (${percentFull}% full, ${pageLines} lines)`);
      }

      // Check for orphan lines (heading alone at bottom)
      if (page.html.match(/<h[1-6][^>]*>[^<]*<\/h[1-6]>/)) {
        const lastElement = page.html.match(/(<[^>]+>[^<]*<\/[^>]+>)(?!.*<[^>]+>[^<]*<\/[^>]+>)/);
        if (lastElement && lastElement[0].match(/<h[1-6]/)) {
          orphanIssues++;
          console.warn(`⚠️  Page ${idx + 1}: Heading alone at bottom (orphan header)`);
        }
      }

      // Check for very underfilled pages
      const percentFull = ((pageHeight / contentHeight) * 100).toFixed(0);
      if (percentFull < 30) {
        console.warn(`⚠️  Page ${idx + 1}: Severely underfilled (only ${percentFull}%)`);
      }
    });

    // Summary
    console.group('[SUMMARY]');
    console.log(`Total pages: ${pages.length}, Blank: ${blankPageCount}, Content: ${pages.length - blankPageCount}`);
    console.log(`Average page height: ${(totalHeight / (pages.length - blankPageCount)).toFixed(0)}px / ${contentHeight.toFixed(0)}px limit`);
    console.log(`Issues: ${overflowIssues} overflow, ${orphanIssues} orphan headers`);
    if (overflowIssues === 0 && orphanIssues === 0) {
      console.log('✅ No major issues detected!');
    }
    console.groupEnd();
    console.groupEnd();

    return {
      totalPages: pages.length,
      blankPages: blankPageCount,
      overflowPages: overflowIssues,
      orphanHeaders: orphanIssues,
      avgPageHeight: totalHeight / (pages.length - blankPageCount),
      contentHeightLimit: contentHeight
    };
  },

  /**
   * Log pagination setup parameters
   */
  logSetup(setup) {
    console.group('[PAGINATION-SETUP] Configuration');
    console.log(`previewScale: ${setup.previewScale.toFixed(3)}`);
    console.log(`baseFontSize: ${setup.baseFontSize.toFixed(1)}pt`);
    console.log(`contentWidth: ${setup.contentWidth.toFixed(0)}px`);
    console.log(`pageHeight: ${setup.pageHeightPx.toFixed(0)}px`);
    console.log(`contentHeight: ${setup.contentHeight.toFixed(0)}px (after safety margin)`);
    console.log(`safetyMargin: ${setup.safetyMargin.toFixed(0)}px (lineHeightPx=${setup.lineHeightPx.toFixed(1)}px + headerSpace=${setup.headerSpaceEstimate.toFixed(0)}px)`);
    console.log(`lineHeightPx: ${setup.lineHeightPx.toFixed(1)}px`);
    console.groupEnd();
  }
};

export default paginationDebugger;
