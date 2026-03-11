/**
 * paginationSandbox.js
 * Measurement-first sandbox approach for accurate pagination.
 */

export const paginationSandbox = {
  createSandbox(contentWidthPx, styleConfig = {}) {
    const sandbox = document.createElement('div');
    sandbox.style.cssText = `
      position: fixed;
      left: -99999px;
      top: 0;
      width: ${contentWidthPx}px;
      visibility: hidden;
      pointer-events: none;
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    `;

    if (styleConfig.fontSize) sandbox.style.fontSize = styleConfig.fontSize;
    if (styleConfig.lineHeight) sandbox.style.lineHeight = styleConfig.lineHeight;
    if (styleConfig.fontFamily) sandbox.style.fontFamily = styleConfig.fontFamily;

    document.body.appendChild(sandbox);
    return sandbox;
  },

  measureBlockExact(blockHtml, sandbox) {
    sandbox.innerHTML = blockHtml;
    const element = sandbox.firstElementChild;

    if (!element) {
      return { height: 0, lines: 0, error: 'No element found' };
    }

    const styles = window.getComputedStyle(element);
    const marginTop = parseFloat(styles.marginTop) || 0;
    const marginBottom = parseFloat(styles.marginBottom) || 0;

    const offsetHeight = element.offsetHeight;
    const totalHeight = offsetHeight + marginTop + marginBottom;

    return {
      offsetHeight,
      totalHeight,
      margins: { top: marginTop, bottom: marginBottom },
      raw: sandbox.offsetHeight
    };
  },

  measureChapterBlocks(chapterHtml, sandbox, lineHeightPx) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = chapterHtml;

    const blocks = [];
    let totalHeight = 0;

    Array.from(tempDiv.children).forEach((el, idx) => {
      const blockHtml = el.outerHTML;
      const measurement = this.measureBlockExact(blockHtml, sandbox);
      const tag = el.tagName.toLowerCase();
      const lines = Math.floor(measurement.totalHeight / lineHeightPx);

      blocks.push({
        index: idx,
        tag,
        height: measurement.totalHeight,
        lines,
        offsetHeight: measurement.offsetHeight,
        margins: measurement.margins
      });

      totalHeight += measurement.totalHeight;
    });

    return { blocks, totalHeight, blockCount: blocks.length };
  },

  validatePageFit(pageHtml, sandbox, contentHeight, lineHeightPx) {
    const measurement = this.measureBlockExact(pageHtml, sandbox);
    const isOverflow = measurement.totalHeight > contentHeight;
    const overflowPx = isOverflow ? measurement.totalHeight - contentHeight : 0;

    return {
      contentHeight,
      actualHeight: measurement.totalHeight,
      isOverflow,
      overflowPx,
      percentFull: ((measurement.totalHeight / contentHeight) * 100).toFixed(1),
      safe: !isOverflow
    };
  },

  generateReport(chapters, layoutCtx) {
    const sandbox = this.createSandbox(layoutCtx.contentWidth, {
      fontSize: `${layoutCtx.baseFontSize}pt`,
      lineHeight: layoutCtx.baseLineHeight
    });

    const report = {
      timestamp: new Date().toISOString(),
      layout: layoutCtx,
      chapters: []
    };

    chapters.forEach((chapter, chIdx) => {
      const chapterMeasure = this.measureChapterBlocks(
        chapter.html,
        sandbox,
        layoutCtx.lineHeightPx
      );

      report.chapters.push({
        index: chIdx,
        title: chapter.title,
        totalHeight: chapterMeasure.totalHeight,
        blockCount: chapterMeasure.blockCount,
        blocks: chapterMeasure.blocks
      });
    });

    document.body.removeChild(sandbox);
    return report;
  },

  logReport(report) {
    console.group('[SANDBOX-REPORT] Exact Measurements');
    console.log('Generated:', report.timestamp);
    console.log('Layout:', report.layout);

    report.chapters.forEach((chap) => {
      console.log(`Chapter: ${chap.title}, Height: ${chap.totalHeight}px, Blocks: ${chap.blockCount}`);
    });

    console.groupEnd();
  }
};

export default paginationSandbox;
