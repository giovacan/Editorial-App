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
  },

  /**
   * Log page refill attempt
   */
  logRefillAttempt: (pageIdx, missingLines) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[PAGINATION-REFILL] Page ${pageIdx + 1}: attempting refill (${missingLines} missing lines)`);
    }
  },

  /**
   * Log successful line pull from next paragraph
   */
  logRefillPull: (pageIdx, pullLines) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[PAGINATION-PULL] Page ${pageIdx + 1}: pulled ${pullLines} lines from paragraph`);
    }
  },

  /**
   * Log refill skip with reason
   */
  logRefillSkip: (pageIdx, reason) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[PAGINATION-SKIP] Page ${pageIdx + 1}: refill skipped (${reason})`);
    }
  }
};
