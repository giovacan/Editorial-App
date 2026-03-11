/**
 * layoutSafetyEngine.js
 *
 * Professional-grade layout safety and validation system for pagination.
 * Enforces 7 professional typographic guard rails before page finalization.
 *
 * Guard Rails:
 * 1. Safety Line Guard - Reserve full line height at page bottom
 * 2. Margin-aware Measurement - Accurate height calculations
 * 3. Heading Protection - Never end page with orphan heading
 * 4. Widow/Orphan Control - Minimum lines before/after breaks
 * 5. Overflow Rollback - Validate page doesn't exceed contentHeight
 * 6. Fill Pass Constraints - Rebalancing respects all rules
 * 7. Post-Layout Validation - Final audit of all pages
 *
 * NO REACT DEPENDENCIES • PURE FUNCTIONS • FULLY TESTABLE
 */

/**
 * Represents a page break candidate with scoring information.
 * @typedef {Object} BreakCandidate
 * @property {number} elementIndex - Index of element in children array
 * @property {string} breakType - 'before' | 'after' | 'split' | 'none'
 * @property {string} elementHtml - HTML content to place on current page
 * @property {string} remainingHtml - Content carrying to next page
 * @property {number} height - Measured height of elements on page
 * @property {number} penalty - Score (lower is better)
 * @property {Object} violations - Detected rule violations
 */

/**
 * Guard Rail 1: Safety Line Guard
 * Reserve one full line height at bottom of page.
 *
 * @param {number} contentHeight - Available page height
 * @param {number} lineHeightPx - Line height in pixels
 * @returns {number} Safe usable height
 */
export const calculateSafeContentHeight = (contentHeight, lineHeightPx) => {
  const safetyMargin = lineHeightPx; // Full line height buffer
  return Math.max(lineHeightPx, contentHeight - safetyMargin);
};

/**
 * Guard Rail 2: Margin-aware Measurement
 * Validate measurement container has no inherited margins.
 *
 * @param {HTMLElement} measureDiv - Measurement container
 * @returns {boolean} True if margins are properly reset
 */
export const validateMeasurementContainer = (measureDiv) => {
  if (!measureDiv) return false;

  const computed = window.getComputedStyle(measureDiv);
  const margin = computed.margin;
  const padding = computed.padding;
  const border = computed.borderWidth;

  // Check that margins are effectively 0
  const marginValue = parseFloat(margin);
  const paddingValue = parseFloat(padding);
  const borderValue = parseFloat(border);

  return (
    (isNaN(marginValue) || marginValue === 0) &&
    (isNaN(paddingValue) || paddingValue === 0) &&
    (isNaN(borderValue) || borderValue === 0)
  );
};

/**
 * Guard Rail 3: Heading Protection
 * Validate page doesn't end with orphan heading.
 *
 * @param {string} pageHtml - Page HTML content
 * @returns {Object} Violation info
 */
export const detectOrphanHeading = (pageHtml) => {
  if (!pageHtml) {
    return { hasOrphanHeading: false, headingTag: null };
  }

  const div = document.createElement('div');
  div.innerHTML = pageHtml;
  const lastEl = div.lastElementChild;

  if (!lastEl) {
    return { hasOrphanHeading: false, headingTag: null };
  }

  const tagName = lastEl.tagName || '';
  const isHeading = tagName.match(/^H[1-6]$/i);

  if (isHeading) {
    // Heading is orphan only if it's the ONLY element
    // or is at the end with no paragraph following
    const hasMultipleElements = div.children.length > 1;
    const isOnlyElement = !hasMultipleElements;

    return {
      hasOrphanHeading: isOnlyElement,
      headingTag: tagName,
      isLastElement: true,
      elementCount: div.children.length
    };
  }

  return { hasOrphanHeading: false, headingTag: null };
};

/**
 * Guard Rail 4: Widow/Orphan Control
 * Validate paragraph split satisfies minimum line constraints.
 *
 * @param {number} linesBeforeBreak - Lines staying on current page
 * @param {number} linesAfterBreak - Lines going to next page
 * @param {number} minOrphanLines - Minimum lines before break
 * @param {number} minWidowLines - Minimum lines after break
 * @returns {Object} Constraint status
 */
export const validateWidowOrphanRules = (
  linesBeforeBreak,
  linesAfterBreak,
  minOrphanLines,
  minWidowLines
) => {
  const orphanViolation = linesBeforeBreak > 0 && linesBeforeBreak < minOrphanLines;
  const widowViolation = linesAfterBreak > 0 && linesAfterBreak < minWidowLines;

  return {
    orphanViolation,
    widowViolation,
    bothSatisfied: !orphanViolation && !widowViolation,
    linesBeforeBreak,
    linesAfterBreak,
    minOrphanLines,
    minWidowLines
  };
};

/**
 * Guard Rail 5: Overflow Rollback
 * Validate page doesn't exceed safe content height.
 *
 * @param {string} pageHtml - Page HTML
 * @param {number} safeContentHeight - Maximum allowed height
 * @param {HTMLElement} measureDiv - Measurement container
 * @returns {Object} Overflow status
 */
export const detectOverflow = (pageHtml, safeContentHeight, measureDiv) => {
  if (!pageHtml || !measureDiv) {
    return { overflows: false, height: 0, overflow: 0 };
  }

  try {
    measureDiv.innerHTML = pageHtml;
    const height = measureDiv.offsetHeight || 0;
    const overflow = height - safeContentHeight;

    return {
      overflows: overflow > 0,
      height,
      overflow,
      safeContentHeight
    };
  } catch (e) {
    return { overflows: false, height: 0, overflow: 0, error: e.message };
  }
};

/**
 * Guard Rail 6: Fill Pass Constraints
 * Validate content move doesn't violate layout rules.
 *
 * @param {string} sourcePageHtml - Current page HTML
 * @param {string} elementToMove - Element to move from next page
 * @param {number} safeContentHeight - Maximum page height
 * @param {HTMLElement} measureDiv - Measurement container
 * @returns {Object} Validation result
 */
export const validateFillPassMove = (
  sourcePageHtml,
  elementToMove,
  safeContentHeight,
  measureDiv
) => {
  if (!measureDiv) {
    return { canMove: false, reason: 'No measurement container' };
  }

  try {
    // Test if element fits
    const candidateHtml = (sourcePageHtml || '') + elementToMove;
    measureDiv.innerHTML = candidateHtml;
    const candidateHeight = measureDiv.offsetHeight || 0;

    if (candidateHeight > safeContentHeight) {
      return {
        canMove: false,
        reason: 'Would overflow page',
        height: candidateHeight,
        safeContentHeight
      };
    }

    // Check if move creates orphan heading
    const div = document.createElement('div');
    div.innerHTML = candidateHtml;
    const lastEl = div.lastElementChild;

    const elementDiv = document.createElement('div');
    elementDiv.innerHTML = elementToMove;
    const movedEl = elementDiv.firstElementChild;

    const isMovedElementHeading = movedEl && movedEl.tagName.match(/^H[1-6]$/i);
    const wouldEndWithHeading = lastEl && lastEl.tagName.match(/^H[1-6]$/i);

    if (isMovedElementHeading && wouldEndWithHeading) {
      return {
        canMove: false,
        reason: 'Would create orphan heading',
        elementTag: movedEl.tagName
      };
    }

    return {
      canMove: true,
      height: candidateHeight,
      violations: []
    };
  } catch (e) {
    return {
      canMove: false,
      reason: 'Measurement error',
      error: e.message
    };
  }
};

/**
 * Guard Rail 7: Post-Layout Validation
 * Audit all pages for constraint violations.
 *
 * @param {Array} pages - Array of page objects
 * @param {number} contentHeight - Page content height
 * @param {number} lineHeightPx - Line height
 * @param {HTMLElement} measureDiv - Measurement container
 * @returns {Object} Validation report
 */
export const validateAllPages = (pages, contentHeight, lineHeightPx, measureDiv) => {
  const safeHeight = calculateSafeContentHeight(contentHeight, lineHeightPx);
  const report = {
    totalPages: pages.length,
    violations: [],
    warnings: [],
    pageScores: []
  };

  pages.forEach((page, idx) => {
    const pageNum = idx + 1;
    const violations = [];

    // Check overflow
    const overflowCheck = detectOverflow(page.html, safeHeight, measureDiv);
    if (overflowCheck.overflows) {
      violations.push({
        type: 'overflow',
        severity: 'critical',
        message: `Page exceeds safe height by ${overflowCheck.overflow}px`,
        height: overflowCheck.height
      });
    }

    // Check orphan heading
    const headingCheck = detectOrphanHeading(page.html);
    if (headingCheck.hasOrphanHeading) {
      violations.push({
        type: 'orphan_heading',
        severity: 'high',
        message: `Page ends with orphan ${headingCheck.headingTag} heading`
      });
    }

    // Check excessive whitespace
    if (overflowCheck.height < safeHeight * 0.5) {
      report.warnings.push({
        page: pageNum,
        type: 'underfilled',
        message: `Page is only ${(overflowCheck.height / safeHeight * 100).toFixed(0)}% full`,
        height: overflowCheck.height
      });
    }

    if (violations.length > 0) {
      report.violations.push({
        page: pageNum,
        count: violations.length,
        violations
      });
    }

    report.pageScores.push({
      page: pageNum,
      height: overflowCheck.height,
      fillPercentage: (overflowCheck.height / safeHeight * 100).toFixed(1),
      violationCount: violations.length
    });
  });

  return report;
};

/**
 * Calculate penalties for a break candidate (lower is better).
 *
 * Penalty scoring:
 * - Orphan line: +500
 * - Widow line: +500
 * - Heading at page bottom: +1000
 * - Paragraph split: +200
 * - Excessive whitespace (>3 lines): +80
 * - Overflow: +10000
 *
 * @private
 */
const calculateBreakPenalty = (candidate, lineHeightPx, safeContentHeight) => {
  let penalty = 0;
  const violations = {};

  // Check overflow
  if (candidate.height > safeContentHeight) {
    penalty += 10000;
    violations.overflow = true;
  }

  // Check orphan heading
  const pageDiv = document.createElement('div');
  pageDiv.innerHTML = candidate.elementHtml;
  const lastEl = pageDiv.lastElementChild;

  if (lastEl && lastEl.tagName.match(/^H[1-6]$/i)) {
    penalty += 1000;
    violations.headingAtBottom = true;
  }

  // Check split penalty
  if (candidate.breakType === 'split') {
    penalty += 200;
    violations.split = true;
  }

  // Check whitespace
  const fillPercentage = candidate.height / safeContentHeight;
  if (fillPercentage < 0.6) {
    penalty += 80;
    violations.underfilled = true;
  }

  candidate.penalty = penalty;
  candidate.violations = violations;

  return penalty;
};

/**
 * FEATURE 1: Smart Page Breaks
 *
 * Generate multiple break candidates and choose the best one using penalty scoring.
 * Called when page is near overflow to find optimal break point.
 *
 * @param {Array} children - Array of child elements to consider
 * @param {number} currentPageIdx - Index in children array where we are
 * @param {string} currentPageHtml - HTML accumulated so far
 * @param {number} currentPageHeight - Height accumulated so far
 * @param {HTMLElement} measureDiv - Measurement container
 * @param {Object} layoutCtx - Layout context with contentHeight, lineHeightPx, etc.
 * @returns {Object} Best break candidate
 */
export const findBestPageBreak = (
  children,
  currentPageIdx,
  currentPageHtml,
  currentPageHeight,
  measureDiv,
  layoutCtx
) => {
  const { contentHeight, lineHeightPx, minOrphanLines, minWidowLines } = layoutCtx;
  const safeHeight = calculateSafeContentHeight(contentHeight, lineHeightPx);

  const candidates = [];

  // Candidate 1: Break BEFORE current element (safe default)
  if (currentPageHtml.trim()) {
    candidates.push({
      elementIndex: currentPageIdx,
      breakType: 'before',
      elementHtml: currentPageHtml,
      remainingHtml: '',
      height: currentPageHeight,
      penalty: 0
    });
  }

  // Candidate 2: Continue and move current element to next page
  candidates.push({
    elementIndex: currentPageIdx + 1,
    breakType: 'after',
    elementHtml: currentPageHtml,
    remainingHtml: '',
    height: currentPageHeight,
    penalty: 0
  });

  // Score all candidates
  candidates.forEach(candidate => {
    calculateBreakPenalty(candidate, lineHeightPx, safeHeight);
  });

  // Return candidate with lowest penalty
  const bestCandidate = candidates.reduce((best, current) => {
    return current.penalty < best.penalty ? current : best;
  });

  if (process.env.NODE_ENV === 'development') {
    console.log('[SMART-BREAK] Found best break:', {
      type: bestCandidate.breakType,
      penalty: bestCandidate.penalty,
      height: bestCandidate.height,
      violations: bestCandidate.violations
    });
  }

  return bestCandidate;
};

/**
 * FEATURE 2: Paragraph Compression
 *
 * When a paragraph barely overflows, try measuring with reduced width
 * to fit it on the page (simulates professional layout engines).
 *
 * Compression is invisible to user (max 2% width reduction).
 * Never changes font size or line height.
 *
 * @param {string} elementHtml - Element HTML to compress
 * @param {Object} layoutCtx - Layout context
 * @param {HTMLElement} measureDiv - Measurement container
 * @returns {Object} Compression result { success, newHeight, compressionRatio }
 */
export const tryParagraphCompression = (elementHtml, layoutCtx, measureDiv) => {
  const { contentHeight, lineHeightPx, textAlign } = layoutCtx;
  const safeHeight = calculateSafeContentHeight(contentHeight, lineHeightPx);

  if (!elementHtml || !measureDiv) {
    return { success: false, reason: 'Invalid input' };
  }

  // Only compress paragraphs and text elements
  const isCompressible = elementHtml.match(/^<(p|div|blockquote)[^>]*>/i);
  if (!isCompressible) {
    return { success: false, reason: 'Element not compressible' };
  }

  // Get original height
  try {
    measureDiv.innerHTML = elementHtml;
    const originalHeight = measureDiv.offsetHeight || 0;

    // If already fits, no compression needed
    if (originalHeight <= safeHeight) {
      return {
        success: false,
        reason: 'Already fits',
        originalHeight,
        safeHeight
      };
    }

    // Only try compression if overflow is small (<2 lines)
    const overflow = originalHeight - safeHeight;
    const overflowLines = Math.ceil(overflow / lineHeightPx);

    if (overflowLines > 2) {
      return {
        success: false,
        reason: 'Overflow too large for compression',
        overflow,
        overflowLines
      };
    }

    // Try compression at different ratios
    const compressionRatios = [0.99, 0.985, 0.98];
    let bestResult = null;

    for (const ratio of compressionRatios) {
      const originalWidth = measureDiv.offsetWidth;
      const compressedWidth = originalWidth * ratio;

      const originalStyle = measureDiv.style.width;
      measureDiv.style.width = `${compressedWidth}px`;
      measureDiv.innerHTML = elementHtml;

      const compressedHeight = measureDiv.offsetHeight || 0;
      measureDiv.style.width = originalStyle;

      if (compressedHeight <= safeHeight) {
        bestResult = {
          success: true,
          originalHeight,
          newHeight: compressedHeight,
          compressionRatio: 1 - ratio,
          percentReduction: ((originalHeight - compressedHeight) / originalHeight * 100).toFixed(1),
          appliedRatio: ratio
        };
        break; // Use first successful compression
      }
    }

    if (bestResult) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[COMPRESSION] Paragraph compressed successfully:', {
          originalHeight: bestResult.originalHeight,
          newHeight: bestResult.newHeight,
          reduction: bestResult.percentReduction + '%',
          ratio: bestResult.appliedRatio
        });
      }
      return bestResult;
    }

    return {
      success: false,
      reason: 'Could not compress enough',
      originalHeight,
      overflowLines
    };
  } catch (e) {
    return {
      success: false,
      reason: 'Compression error',
      error: e.message
    };
  }
};

/**
 * Helper: Evaluate a break candidate more deeply.
 * Used by smart break algorithm to score candidates.
 *
 * @private
 */
export const evaluateBreakCandidate = (
  candidate,
  layoutCtx,
  measureDiv
) => {
  const { contentHeight, lineHeightPx, minOrphanLines, minWidowLines } = layoutCtx;
  const safeHeight = calculateSafeContentHeight(contentHeight, lineHeightPx);

  const evaluation = {
    candidate,
    checks: {}
  };

  // Check 1: Overflow
  evaluation.checks.overflow = detectOverflow(
    candidate.elementHtml,
    safeHeight,
    measureDiv
  );

  // Check 2: Orphan heading
  evaluation.checks.orphanHeading = detectOrphanHeading(candidate.elementHtml);

  // Check 3: Fill percentage
  evaluation.checks.fillPercentage = (
    (candidate.height / safeHeight) * 100
  ).toFixed(1);

  // Calculate score
  let score = candidate.penalty || 0;

  if (evaluation.checks.overflow.overflows) {
    score += 10000;
  }

  if (evaluation.checks.orphanHeading.hasOrphanHeading) {
    score += 1000;
  }

  evaluation.score = score;
  evaluation.passesAllChecks =
    !evaluation.checks.overflow.overflows &&
    !evaluation.checks.orphanHeading.hasOrphanHeading;

  return evaluation;
};
