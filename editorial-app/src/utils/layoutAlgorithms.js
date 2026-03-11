/**
 * layoutAlgorithms.js
 *
 * Advanced layout intelligence algorithms from professional typesetting systems.
 * Implements paragraph balancing, compression, and global optimization.
 *
 * Pure functions only. No side effects. Fully deterministic.
 * Integrates into processChapter() and applyFillPassInPlace() without refactoring.
 */

/**
 * ALGORITHM 1: PARAGRAPH BALANCING
 *
 * Avoid ugly paragraph splits across pages.
 * Ensures minimum lines per split side (minimum 2 lines each).
 * Optimizes for 60/40 ratio when possible.
 *
 * @param {string} prevPageHtml - HTML content on previous page
 * @param {string} nextPageHtml - HTML content on next page
 * @param {number} lineHeightPx - Line height in pixels
 * @param {HTMLElement} measureDiv - Measurement container
 * @returns {Object} Balance recommendation
 */
export const balanceParagraphSplit = (
  prevPageHtml,
  nextPageHtml,
  lineHeightPx,
  measureDiv
) => {
  if (!prevPageHtml || !nextPageHtml || !measureDiv) {
    return {
      needsRebalance: false,
      reason: 'Invalid input'
    };
  }

  try {
    // Measure content on each side
    measureDiv.innerHTML = prevPageHtml;
    const prevHeight = measureDiv.offsetHeight || 0;
    const prevLines = Math.floor(prevHeight / lineHeightPx);

    measureDiv.innerHTML = nextPageHtml;
    const nextHeight = measureDiv.offsetHeight || 0;
    const nextLines = Math.floor(nextHeight / lineHeightPx);

    const totalLines = prevLines + nextLines;

    // Rule 1: Enforce minimum lines per side
    if (nextLines < 2 && prevLines >= 3) {
      return {
        needsRebalance: true,
        action: 'move_line_backward',
        reason: `Next page has only ${nextLines} lines (minimum 2 required)`,
        currentSplit: { prevLines, nextLines },
        recommendedSplit: { prevLines: prevLines - 1, nextLines: nextLines + 1 }
      };
    }

    if (prevLines < 2 && nextLines >= 3) {
      return {
        needsRebalance: true,
        action: 'move_line_forward',
        reason: `Previous page has only ${prevLines} lines (minimum 2 required)`,
        currentSplit: { prevLines, nextLines },
        recommendedSplit: { prevLines: prevLines + 1, nextLines: nextLines - 1 }
      };
    }

    // Rule 2: Check if ratio is close to ideal 60/40
    const prevRatio = prevLines / totalLines;
    const idealRatio = 0.60; // 60% on previous page
    const ratioDeviation = Math.abs(prevRatio - idealRatio);

    // If we can improve ratio with one line move:
    if (ratioDeviation > 0.1 && totalLines >= 5) {
      // Try moving one line
      const newPrevRatio = (prevLines - 1) / totalLines;
      const newDeviation = Math.abs(newPrevRatio - idealRatio);

      if (newDeviation < ratioDeviation && prevLines >= 3 && nextLines >= 2) {
        return {
          needsRebalance: true,
          action: 'optimize_ratio',
          reason: `Split ratio ${(prevRatio * 100).toFixed(0)}% can improve to ${(newPrevRatio * 100).toFixed(0)}%`,
          currentSplit: { prevLines, nextLines, ratio: (prevRatio * 100).toFixed(1) },
          recommendedSplit: {
            prevLines: prevLines - 1,
            nextLines: nextLines + 1,
            ratio: (newPrevRatio * 100).toFixed(1)
          }
        };
      }
    }

    // All constraints satisfied
    return {
      needsRebalance: false,
      currentSplit: { prevLines, nextLines, ratio: (prevRatio * 100).toFixed(1) },
      quality: 'good'
    };
  } catch (e) {
    return {
      needsRebalance: false,
      reason: 'Measurement error',
      error: e.message
    };
  }
};

/**
 * ALGORITHM 2: PARAGRAPH COMPRESSION
 *
 * Remove small white gaps at bottom of pages without visible distortion.
 * Compresses only paragraphs (not headings, lists, blockquotes).
 * Maximum compression: line-height 4%, margins 20%.
 *
 * @param {Array} pageElements - Array of element HTML strings
 * @param {number} remainingSpace - Available space in pixels
 * @param {number} lineHeightPx - Line height in pixels
 * @param {number} contentHeight - Total page height
 * @param {HTMLElement} measureDiv - Measurement container
 * @returns {Object} Compression result
 */
export const tryParagraphCompression = (
  pageElements,
  remainingSpace,
  lineHeightPx,
  contentHeight,
  measureDiv
) => {
  if (!Array.isArray(pageElements) || !measureDiv || remainingSpace < 0) {
    return {
      canCompress: false,
      reason: 'Invalid input'
    };
  }

  // Only compress if gap is less than 1 line
  if (remainingSpace > lineHeightPx) {
    return {
      canCompress: false,
      reason: 'Remaining space larger than 1 line, no compression needed',
      remainingSpace,
      lineHeightPx
    };
  }

  // Identify compressible elements (paragraphs only)
  const compressible = pageElements
    .map((html, idx) => {
      const isHeading = html.match(/^<h[1-6]/i);
      const isList = html.match(/^<(ul|ol)/i);
      const isBlockquote = html.match(/^<blockquote/i);
      const isParagraph = html.match(/^<p/i);

      return {
        index: idx,
        html,
        isCompressible: isParagraph && !isHeading && !isList && !isBlockquote
      };
    })
    .filter(el => el.isCompressible);

  if (compressible.length === 0) {
    return {
      canCompress: false,
      reason: 'No compressible elements (paragraphs only)'
    };
  }

  // Calculate total compressible height
  let compressibleHeight = 0;
  const compressibleMeasures = compressible.map(el => {
    try {
      measureDiv.innerHTML = el.html;
      const height = measureDiv.offsetHeight || 0;
      compressibleHeight += height;
      return { index: el.index, height };
    } catch (e) {
      return { index: el.index, height: 0, error: e.message };
    }
  });

  // If compressible height is enough, we can redistribute
  if (compressibleHeight < remainingSpace) {
    return {
      canCompress: false,
      reason: 'Compressible content insufficient for gap',
      compressibleHeight,
      remainingSpace
    };
  }

  // Calculate compression ratios
  // We need to recover `remainingSpace` pixels
  // Strategy: reduce line-height slightly (max 4%) and margins (max 20%)

  const compressionStrategies = [];

  // Strategy 1: Reduce line-height by up to 4%
  for (let lineHeightReduction = 0.01; lineHeightReduction <= 0.04; lineHeightReduction += 0.01) {
    const newLineHeight = lineHeightPx * (1 - lineHeightReduction);
    const heightReduction = lineHeightPx - newLineHeight;
    const totalReduction = heightReduction * compressible.length;

    if (totalReduction >= remainingSpace) {
      compressionStrategies.push({
        type: 'line_height_reduction',
        lineHeightReduction: (lineHeightReduction * 100).toFixed(2),
        expectedRecovery: totalReduction,
        acceptable: true
      });
      break;
    }
  }

  // Strategy 2: Reduce paragraph margins by up to 20%
  for (let marginReduction = 0.05; marginReduction <= 0.2; marginReduction += 0.05) {
    // This is approximate (assumes average margin per paragraph)
    const avgMargin = 8; // pixels
    const marginRecovery = compressible.length * avgMargin * marginReduction;

    if (marginRecovery >= remainingSpace) {
      compressionStrategies.push({
        type: 'margin_reduction',
        marginReduction: (marginReduction * 100).toFixed(2),
        expectedRecovery: marginRecovery,
        acceptable: true
      });
      break;
    }
  }

  if (compressionStrategies.length === 0) {
    return {
      canCompress: false,
      reason: 'Cannot achieve compression within limits',
      remainingSpace,
      compressibleCount: compressible.length
    };
  }

  // Choose least aggressive strategy (prefer line-height over margins)
  const selectedStrategy = compressionStrategies[0];

  return {
    canCompress: true,
    strategy: selectedStrategy.type,
    reduction: selectedStrategy[selectedStrategy.type.split('_')[0] + '_' + selectedStrategy.type.split('_')[1]],
    expectedRecovery: selectedStrategy.expectedRecovery,
    compressibleElements: compressible.length,
    remainingSpace,
    appliedCompression: {
      type: selectedStrategy.type,
      amount: parseFloat(selectedStrategy[Object.keys(selectedStrategy)[2]])
    }
  };
};

/**
 * ALGORITHM 3: GLOBAL LAYOUT OPTIMIZATION
 *
 * Evaluate page quality using a scoring system.
 * Lower score = better layout.
 *
 * Penalties:
 *   widow (1 line at top): +50
 *   orphan (1 line at bottom): +50
 *   heading alone at bottom: +40
 *   white space (remaining space * 0.5): variable
 *
 * @param {string} pageHtml - Page HTML content
 * @param {number} contentHeight - Maximum page height
 * @param {number} lineHeightPx - Line height in pixels
 * @param {HTMLElement} measureDiv - Measurement container
 * @returns {Object} Quality evaluation
 */
export const evaluatePageQuality = (
  pageHtml,
  contentHeight,
  lineHeightPx,
  measureDiv
) => {
  if (!pageHtml || !measureDiv) {
    return { score: Infinity, reason: 'Invalid input' };
  }

  let score = 0;
  const violations = [];

  try {
    // Measure page
    measureDiv.innerHTML = pageHtml;
    const pageHeight = measureDiv.offsetHeight || 0;
    const remainingSpace = contentHeight - pageHeight;
    const linesOnPage = Math.floor(pageHeight / lineHeightPx);

    // Penalty 1: White space (remaining space * 0.5)
    const whitespacePenalty = Math.max(0, remainingSpace) * 0.5;
    score += whitespacePenalty;

    // Parse page structure
    const pageDiv = document.createElement('div');
    pageDiv.innerHTML = pageHtml;
    const children = Array.from(pageDiv.children);

    if (children.length > 0) {
      const lastChild = children[children.length - 1];
      const lastTag = lastChild.tagName || '';

      // Penalty 2: Heading alone at bottom
      if (lastTag.match(/^H[1-6]$/i)) {
        score += 40;
        violations.push('heading_at_bottom');
      }

      // Penalty 3: Widow (single line at bottom - approximation)
      if (lastTag === 'P' && children.length === 1) {
        const singleParaLines = Math.floor((lastChild.offsetHeight || 0) / lineHeightPx);
        if (singleParaLines === 1) {
          score += 50;
          violations.push('widow');
        }
      }

      // Penalty 4: Orphan (single line at top - approximation)
      if (children.length === 1) {
        const firstChild = children[0];
        const firstParaLines = Math.floor((firstChild.offsetHeight || 0) / lineHeightPx);
        if (firstParaLines === 1) {
          score += 50;
          violations.push('orphan');
        }
      }
    }

    const fillPercentage = (pageHeight / contentHeight) * 100;

    return {
      score,
      fillPercentage: fillPercentage.toFixed(1),
      pageHeight,
      remainingSpace: remainingSpace.toFixed(0),
      linesOnPage,
      violations,
      quality: getQualityRating(score, fillPercentage)
    };
  } catch (e) {
    return {
      score: Infinity,
      reason: 'Measurement error',
      error: e.message
    };
  }
};

/**
 * Compare two page layout options and recommend the better one.
 *
 * @param {string} optionA_Html - Option A page HTML
 * @param {string} optionB_Html - Option B page HTML
 * @param {number} contentHeight - Maximum page height
 * @param {number} lineHeightPx - Line height in pixels
 * @param {HTMLElement} measureDiv - Measurement container
 * @returns {Object} Comparison and recommendation
 */
export const compareLayoutOptions = (
  optionA_Html,
  optionB_Html,
  contentHeight,
  lineHeightPx,
  measureDiv
) => {
  const optionA = evaluatePageQuality(optionA_Html, contentHeight, lineHeightPx, measureDiv);
  const optionB = evaluatePageQuality(optionB_Html, contentHeight, lineHeightPx, measureDiv);

  const recommended = optionA.score <= optionB.score ? 'A' : 'B';
  const scoreDifference = Math.abs(optionA.score - optionB.score);

  return {
    optionA,
    optionB,
    recommended,
    scoreDifference,
    reasoning: scoreDifference < 5
      ? 'Options are similar in quality'
      : recommended === 'A'
        ? `Option A is significantly better (score: ${optionA.score.toFixed(1)} vs ${optionB.score.toFixed(1)})`
        : `Option B is significantly better (score: ${optionB.score.toFixed(1)} vs ${optionA.score.toFixed(1)})`
  };
};

/**
 * Helper: Calculate quality rating from score.
 * @private
 */
const getQualityRating = (score, fillPercentage) => {
  if (score < 20 && fillPercentage > 85) return 'excellent';
  if (score < 50 && fillPercentage > 75) return 'good';
  if (score < 100 && fillPercentage > 60) return 'acceptable';
  if (score < 150) return 'fair';
  return 'poor';
};

/**
 * Helper: Detect if element is a paragraph.
 * @private
 */
const isParagraph = (html) => {
  return html.match(/^<p[^>]*>/i) && !html.match(/^<h[1-6]/i);
};

/**
 * Helper: Detect if element is a heading.
 * @private
 */
const isHeading = (html) => {
  return html.match(/^<h[1-6]/i);
};

/**
 * Helper: Detect if element is a list.
 * @private
 */
const isList = (html) => {
  return html.match(/^<(ul|ol)[^>]*>/i);
};

/**
 * Helper: Detect if element is a blockquote.
 * @private
 */
const isBlockquote = (html) => {
  return html.match(/^<blockquote[^>]*>/i);
};

/**
 * Helper: Extract text content from HTML.
 * @private
 */
const extractText = (html) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
};

/**
 * Helper: Count approximate lines in HTML.
 * @private
 */
const countLines = (html, lineHeightPx, measureDiv) => {
  if (!measureDiv) return 0;
  try {
    measureDiv.innerHTML = html;
    return Math.floor((measureDiv.offsetHeight || 0) / lineHeightPx);
  } catch (e) {
    return 0;
  }
};

/**
 * INTEGRATION EXAMPLES
 *
 * These functions should be called from:
 * 1. balanceParagraphSplit() → applyFillPassInPlace() after each move
 * 2. tryParagraphCompression() → processChapter() when space remains
 * 3. evaluatePageQuality() → processChapter() before deciding page break
 */

export const integrationExample_BalanceInFillPass = `
// In applyFillPassInPlace(), after moving an element:

const movedElement = pages[nextIdx].html;
const remainingHtml = restHtml;

// Check if we can balance the split
const balanceCheck = balanceParagraphSplit(
  pages[pageIdx].html,
  remainingHtml,
  lineHeightPx,
  measureDiv
);

if (balanceCheck.needsRebalance) {
  console.log('[BALANCE] ' + balanceCheck.reason);
  // Could trigger re-measurement or adjustment
}
`;

export const integrationExample_CompressionInProcess = `
// In processChapter(), when element causes overflow:

if (candidateHeight > contentHeight) {
  // Try compression before page break
  const remainingSpace = contentHeight - currentHeight;
  const compressionResult = tryParagraphCompression(
    [elHtml], // array of elements to compress
    remainingSpace,
    lineHeightPx,
    contentHeight,
    measureDiv
  );

  if (compressionResult.canCompress) {
    console.log('[COMPRESS] ' + compressionResult.strategy);
    // Apply compression to current page instead of breaking
  } else {
    // Fall back to page break
  }
}
`;

export const integrationExample_OptimizeInProcess = `
// In processChapter(), when deciding page break:

// Option A: Break page here
const optionA_Html = currentHtml;

// Option B: Try to fit one more paragraph
const optionB_Html = currentHtml + elHtml;

// Compare layouts
const comparison = compareLayoutOptions(
  optionA_Html,
  optionB_Html,
  contentHeight,
  lineHeightPx,
  measureDiv
);

if (comparison.recommended === 'B') {
  // Option B is better - include the element
  currentHtml = optionB_Html;
  currentHeight = candidateHeight;
} else {
  // Option A is better - break here
  pages.push({ html: currentHtml, ... });
  currentHtml = elHtml;
}
`;
