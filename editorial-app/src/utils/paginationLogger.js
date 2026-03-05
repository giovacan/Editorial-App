/**
 * paginationLogger.js
 * Lightweight logging utility for pagination diagnostics
 */

export const paginationLogger = {
  /**
   * Log page creation/push
   */
  logPagePush: (pageNumber, htmlLength, currentHeight, contentHeight) => {
    if (process.env.NODE_ENV === 'development') {
      const fillPct = ((currentHeight / contentHeight) * 100).toFixed(1);
      console.log(
        `[PAGE-CREATE] Page ${pageNumber}: ${htmlLength}B content, ${fillPct}% full (${currentHeight.toFixed(0)}/${contentHeight}px)`
      );
    }
  },

  /**
   * Log fill-pass attempt on a page
   */
  logFillAttempt: (pageIdx, remainingLines, remainingSpace, contentHeight) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[FILL-ATTEMPT] Page ${pageIdx + 1}: ${remainingLines} orphan lines available (${remainingSpace.toFixed(0)}px / ${contentHeight}px)`
      );
    }
  },

  /**
   * Log element move between pages
   */
  logElementMove: (fromPageIdx, toPageIdx, tagName, htmlLength, remainingPct) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[FILL-MOVE] ${fromPageIdx + 1} ← ${toPageIdx + 1}: Moved <${tagName}> (${htmlLength}B), ${remainingPct}% content remains`
      );
    }
  },

  /**
   * Log page emptied by fill-pass
   */
  logPageEmptied: (pageIdx, sourcePageIdx, tagName) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[FILL-EMPTY] Page ${pageIdx + 1} emptied (moved <${tagName}> from page ${sourcePageIdx + 1})`);
    }
  },

  /**
   * Log paragraph/element split
   */
  logElementSplit: (tagName, originalSize, parts) => {
    if (process.env.NODE_ENV === 'development') {
      const sizes = parts.map((p) => p.length).join(', ');
      console.log(`[SPLIT] <${tagName}> (${originalSize}B) → parts: [${sizes}]B`);
    }
  }
};
