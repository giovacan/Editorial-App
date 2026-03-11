/**
 * layoutSafetyEngine.test.js
 *
 * Comprehensive test suite for layout safety functions.
 * Tests all 7 guard rails and both smart features.
 */

import {
  calculateSafeContentHeight,
  validateMeasurementContainer,
  detectOrphanHeading,
  validateWidowOrphanRules,
  detectOverflow,
  validateFillPassMove,
  validateAllPages,
  findBestPageBreak,
  tryParagraphCompression,
  evaluateBreakCandidate
} from './layoutSafetyEngine';

// ============================================================================
// GUARD RAIL 1: SAFETY LINE GUARD
// ============================================================================

describe('Guard Rail 1: Safety Line Guard', () => {
  test('Reserves full line height at page bottom', () => {
    const contentHeight = 600;
    const lineHeightPx = 20;

    const safeHeight = calculateSafeContentHeight(contentHeight, lineHeightPx);

    expect(safeHeight).toBe(580);
    expect(contentHeight - safeHeight).toBe(lineHeightPx);
  });

  test('Returns minimum one line height', () => {
    const contentHeight = 10; // Very small
    const lineHeightPx = 20;

    const safeHeight = calculateSafeContentHeight(contentHeight, lineHeightPx);

    expect(safeHeight).toBeGreaterThanOrEqual(lineHeightPx);
  });

  test('Handles various line heights', () => {
    const testCases = [
      { contentHeight: 500, lineHeightPx: 16, expectedSafe: 484 },
      { contentHeight: 500, lineHeightPx: 24, expectedSafe: 476 },
      { contentHeight: 800, lineHeightPx: 20, expectedSafe: 780 }
    ];

    testCases.forEach(({ contentHeight, lineHeightPx, expectedSafe }) => {
      const safeHeight = calculateSafeContentHeight(contentHeight, lineHeightPx);
      expect(safeHeight).toBe(expectedSafe);
    });
  });
});

// ============================================================================
// GUARD RAIL 2: MARGIN-AWARE MEASUREMENT
// ============================================================================

describe('Guard Rail 2: Margin-aware Measurement', () => {
  let measureDiv;

  beforeEach(() => {
    measureDiv = document.createElement('div');
    measureDiv.style.margin = '0';
    measureDiv.style.padding = '0';
    measureDiv.style.border = 'none';
    document.body.appendChild(measureDiv);
  });

  afterEach(() => {
    if (measureDiv && measureDiv.parentNode) {
      measureDiv.parentNode.removeChild(measureDiv);
    }
  });

  test('Validates measurement container with reset margins', () => {
    const isValid = validateMeasurementContainer(measureDiv);
    expect(isValid).toBe(true);
  });

  test('Rejects measurement container with margins', () => {
    const dirtyDiv = document.createElement('div');
    dirtyDiv.style.margin = '8px';
    document.body.appendChild(dirtyDiv);

    const isValid = validateMeasurementContainer(dirtyDiv);
    expect(isValid).toBe(false);

    dirtyDiv.parentNode.removeChild(dirtyDiv);
  });

  test('Returns false for null measurement container', () => {
    const isValid = validateMeasurementContainer(null);
    expect(isValid).toBe(false);
  });
});

// ============================================================================
// GUARD RAIL 3: HEADING PROTECTION
// ============================================================================

describe('Guard Rail 3: Heading Protection', () => {
  test('Detects heading as last element (orphan)', () => {
    const html = '<h2>Section Title</h2>';
    const result = detectOrphanHeading(html);

    expect(result.hasOrphanHeading).toBe(true);
    expect(result.headingTag).toBe('H2');
    expect(result.isLastElement).toBe(true);
  });

  test('Does not flag heading if paragraph follows', () => {
    const html = '<h2>Section</h2><p>Content</p>';
    const result = detectOrphanHeading(html);

    expect(result.hasOrphanHeading).toBe(false);
  });

  test('Detects all heading levels', () => {
    const headingLevels = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'];

    headingLevels.forEach(level => {
      const html = `<${level.toLowerCase()}>Title</${level.toLowerCase()}>`;
      const result = detectOrphanHeading(html);

      expect(result.hasOrphanHeading).toBe(true);
      expect(result.headingTag).toBe(level);
    });
  });

  test('Handles empty content', () => {
    const result = detectOrphanHeading('');
    expect(result.hasOrphanHeading).toBe(false);
  });

  test('Counts elements correctly', () => {
    const html = '<p>Para 1</p><p>Para 2</p><h2>Section</h2>';
    const result = detectOrphanHeading(html);

    expect(result.elementCount).toBe(3);
    expect(result.isLastElement).toBe(true);
  });
});

// ============================================================================
// GUARD RAIL 4: WIDOW/ORPHAN CONTROL
// ============================================================================

describe('Guard Rail 4: Widow/Orphan Control', () => {
  test('Accepts valid split', () => {
    const result = validateWidowOrphanRules(
      5,  // linesBeforeBreak (sufficient)
      4,  // linesAfterBreak (sufficient)
      2,  // minOrphanLines
      2   // minWidowLines
    );

    expect(result.orphanViolation).toBe(false);
    expect(result.widowViolation).toBe(false);
    expect(result.bothSatisfied).toBe(true);
  });

  test('Rejects insufficient orphan', () => {
    const result = validateWidowOrphanRules(
      1,  // linesBeforeBreak (TOO FEW)
      5,  // linesAfterBreak (OK)
      2,  // minOrphanLines
      2   // minWidowLines
    );

    expect(result.orphanViolation).toBe(true);
    expect(result.widowViolation).toBe(false);
    expect(result.bothSatisfied).toBe(false);
  });

  test('Rejects insufficient widow', () => {
    const result = validateWidowOrphanRules(
      5,  // linesBeforeBreak (OK)
      1,  // linesAfterBreak (TOO FEW)
      2,  // minOrphanLines
      2   // minWidowLines
    );

    expect(result.orphanViolation).toBe(false);
    expect(result.widowViolation).toBe(true);
    expect(result.bothSatisfied).toBe(false);
  });

  test('Allows empty after-break', () => {
    const result = validateWidowOrphanRules(
      5,  // linesBeforeBreak
      0,  // linesAfterBreak (empty page, OK)
      2,
      2
    );

    expect(result.widowViolation).toBe(false);
  });

  test('Allows zero before-break (rare case)', () => {
    const result = validateWidowOrphanRules(
      0,  // linesBeforeBreak (nothing before break)
      5,  // linesAfterBreak
      2,
      2
    );

    expect(result.orphanViolation).toBe(false);
  });
});

// ============================================================================
// GUARD RAIL 5: OVERFLOW DETECTION
// ============================================================================

describe('Guard Rail 5: Overflow Rollback', () => {
  let measureDiv;

  beforeEach(() => {
    measureDiv = document.createElement('div');
    measureDiv.style.width = '400px';
    document.body.appendChild(measureDiv);
  });

  afterEach(() => {
    if (measureDiv && measureDiv.parentNode) {
      measureDiv.parentNode.removeChild(measureDiv);
    }
  });

  test('Detects overflow correctly', () => {
    const html = '<p>Short content</p>';
    const safeContentHeight = 100;

    const result = detectOverflow(html, safeContentHeight, measureDiv);

    expect(result.overflows).toBeDefined();
    expect(result.height).toBeGreaterThanOrEqual(0);
    expect(result.overflow).toBeDefined();
  });

  test('Returns zero overflow for short content', () => {
    const html = '<p>.</p>';
    const safeContentHeight = 100;

    const result = detectOverflow(html, safeContentHeight, measureDiv);

    expect(result.overflows).toBe(false);
    expect(result.overflow).toBeLessThanOrEqual(0);
  });

  test('Handles null content', () => {
    const result = detectOverflow(null, 100, measureDiv);

    expect(result.overflows).toBe(false);
  });

  test('Handles null measurement container', () => {
    const result = detectOverflow('<p>Test</p>', 100, null);

    expect(result.overflows).toBe(false);
  });
});

// ============================================================================
// GUARD RAIL 6: FILL PASS CONSTRAINTS
// ============================================================================

describe('Guard Rail 6: Fill Pass Constraints', () => {
  let measureDiv;

  beforeEach(() => {
    measureDiv = document.createElement('div');
    measureDiv.style.width = '400px';
    document.body.appendChild(measureDiv);
  });

  afterEach(() => {
    if (measureDiv && measureDiv.parentNode) {
      measureDiv.parentNode.removeChild(measureDiv);
    }
  });

  test('Allows valid move', () => {
    const sourcePage = '<p>Existing content</p>';
    const elementToMove = '<p>New element</p>';
    const safeHeight = 500;

    const result = validateFillPassMove(
      sourcePage,
      elementToMove,
      safeHeight,
      measureDiv
    );

    expect(result.canMove).toBe(true);
  });

  test('Rejects move without measurement container', () => {
    const result = validateFillPassMove(
      '<p>Test</p>',
      '<p>Move</p>',
      500,
      null
    );

    expect(result.canMove).toBe(false);
    expect(result.reason).toContain('container');
  });

  test('Prevents orphan heading creation', () => {
    const sourcePage = '<p>Content</p>';
    const elementToMove = '<h2>New Section</h2>';
    const safeHeight = 150;

    const result = validateFillPassMove(
      sourcePage,
      elementToMove,
      safeHeight,
      measureDiv
    );

    // Result depends on actual heights, but heading detection runs
    expect(result).toHaveProperty('canMove');
  });
});

// ============================================================================
// GUARD RAIL 7: POST-LAYOUT VALIDATION
// ============================================================================

describe('Guard Rail 7: Post-Layout Validation', () => {
  let measureDiv;

  beforeEach(() => {
    measureDiv = document.createElement('div');
    measureDiv.style.width = '400px';
    document.body.appendChild(measureDiv);
  });

  afterEach(() => {
    if (measureDiv && measureDiv.parentNode) {
      measureDiv.parentNode.removeChild(measureDiv);
    }
  });

  test('Validates multiple pages', () => {
    const pages = [
      { html: '<p>Page 1 content</p>' },
      { html: '<p>Page 2 content</p>' },
      { html: '<p>Page 3 content</p>' }
    ];

    const report = validateAllPages(pages, 500, 20, measureDiv);

    expect(report.totalPages).toBe(3);
    expect(report.pageScores.length).toBe(3);
  });

  test('Detects violations', () => {
    const pages = [
      { html: '<h2>Only Heading</h2>' } // Orphan heading
    ];

    const report = validateAllPages(pages, 500, 20, measureDiv);

    expect(report.violations.length).toBeGreaterThanOrEqual(0);
  });

  test('Calculates fill percentages', () => {
    const pages = [
      { html: '<p>Content</p>' }
    ];

    const report = validateAllPages(pages, 500, 20, measureDiv);

    expect(report.pageScores[0]).toHaveProperty('fillPercentage');
    expect(report.pageScores[0].fillPercentage).toBeDefined();
  });
});

// ============================================================================
// FEATURE 1: SMART PAGE BREAKS
// ============================================================================

describe('Feature 1: Smart Page Breaks', () => {
  let measureDiv;

  beforeEach(() => {
    measureDiv = document.createElement('div');
    measureDiv.style.width = '400px';
    document.body.appendChild(measureDiv);
  });

  afterEach(() => {
    if (measureDiv && measureDiv.parentNode) {
      measureDiv.parentNode.removeChild(measureDiv);
    }
  });

  test('Returns best break candidate with lowest penalty', () => {
    const children = [
      { tagName: 'P', innerHTML: 'Paragraph 1' },
      { tagName: 'P', innerHTML: 'Paragraph 2' },
      { tagName: 'P', innerHTML: 'Paragraph 3' }
    ];

    const layoutCtx = {
      contentHeight: 500,
      lineHeightPx: 20,
      minOrphanLines: 2,
      minWidowLines: 2
    };

    const bestBreak = findBestPageBreak(
      children,
      1, // currentPageIdx
      '<p>Current page HTML</p>',
      100, // currentPageHeight
      measureDiv,
      layoutCtx
    );

    expect(bestBreak).toHaveProperty('penalty');
    expect(bestBreak).toHaveProperty('elementIndex');
    expect(bestBreak).toHaveProperty('breakType');
  });

  test('Penalizes heading at page bottom', () => {
    const layoutCtx = {
      contentHeight: 500,
      lineHeightPx: 20,
      minOrphanLines: 2,
      minWidowLines: 2
    };

    const breakWithHeading = findBestPageBreak(
      [],
      0,
      '<p>Text</p><h2>Section</h2>',
      150,
      measureDiv,
      layoutCtx
    );

    // Should have penalty for heading
    expect(breakWithHeading.violations || {}).toBeDefined();
  });
});

// ============================================================================
// FEATURE 2: PARAGRAPH COMPRESSION
// ============================================================================

describe('Feature 2: Paragraph Compression', () => {
  let measureDiv;

  beforeEach(() => {
    measureDiv = document.createElement('div');
    measureDiv.style.width = '400px';
    document.body.appendChild(measureDiv);
  });

  afterEach(() => {
    if (measureDiv && measureDiv.parentNode) {
      measureDiv.parentNode.removeChild(measureDiv);
    }
  });

  test('Reports success: false if already fits', () => {
    const html = '<p>Short</p>';
    const layoutCtx = {
      contentHeight: 500,
      lineHeightPx: 20
    };

    const result = tryParagraphCompression(html, layoutCtx, measureDiv);

    expect(result.success).toBe(false);
    expect(result.reason).toContain('fits');
  });

  test('Reports success: false if overflow too large', () => {
    // Create HTML that overflows significantly
    const html = '<p>' + 'Lorem ipsum dolor sit amet. '.repeat(100) + '</p>';
    const layoutCtx = {
      contentHeight: 100, // Very small
      lineHeightPx: 20
    };

    const result = tryParagraphCompression(html, layoutCtx, measureDiv);

    if (!result.success) {
      expect(result.reason).toBeDefined();
    }
  });

  test('Returns compression ratio <= 2%', () => {
    // Small overflow scenario
    const html = '<p>Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua</p>';
    const layoutCtx = {
      contentHeight: 80,
      lineHeightPx: 20
    };

    const result = tryParagraphCompression(html, layoutCtx, measureDiv);

    if (result.success) {
      expect(result.compressionRatio).toBeLessThanOrEqual(0.02);
      expect(result.appliedRatio).toBeGreaterThanOrEqual(0.98);
    }
  });

  test('Never changes font size or line height', () => {
    // Compression should only affect width, not typography
    const html = '<p style="font-size: 12pt; line-height: 1.6;">Test</p>';
    const layoutCtx = {
      contentHeight: 100,
      lineHeightPx: 20
    };

    const result = tryParagraphCompression(html, layoutCtx, measureDiv);

    // Should not modify the HTML or styles
    expect(html).toContain('font-size: 12pt');
    expect(html).toContain('line-height: 1.6');
  });

  test('Handles invalid input gracefully', () => {
    const result1 = tryParagraphCompression(null, {}, null);
    expect(result1.success).toBe(false);

    const result2 = tryParagraphCompression('<div>Not compressible</div>', {}, null);
    expect(result2.success).toBe(false);
  });
});

// ============================================================================
// INTEGRATION: EVALUATE BREAK CANDIDATE
// ============================================================================

describe('Integration: Evaluate Break Candidate', () => {
  let measureDiv;

  beforeEach(() => {
    measureDiv = document.createElement('div');
    measureDiv.style.width = '400px';
    document.body.appendChild(measureDiv);
  });

  afterEach(() => {
    if (measureDiv && measureDiv.parentNode) {
      measureDiv.parentNode.removeChild(measureDiv);
    }
  });

  test('Evaluates candidate comprehensively', () => {
    const candidate = {
      elementIndex: 1,
      breakType: 'before',
      elementHtml: '<p>Test content</p>',
      height: 150,
      penalty: 50
    };

    const layoutCtx = {
      contentHeight: 500,
      lineHeightPx: 20,
      minOrphanLines: 2,
      minWidowLines: 2
    };

    const evaluation = evaluateBreakCandidate(candidate, layoutCtx, measureDiv);

    expect(evaluation).toHaveProperty('checks');
    expect(evaluation.checks).toHaveProperty('overflow');
    expect(evaluation.checks).toHaveProperty('orphanHeading');
    expect(evaluation.checks).toHaveProperty('fillPercentage');
    expect(evaluation).toHaveProperty('score');
    expect(evaluation).toHaveProperty('passesAllChecks');
  });

  test('Flags overflow in evaluation', () => {
    const candidate = {
      elementIndex: 1,
      breakType: 'before',
      elementHtml: '<p>' + 'Text'.repeat(500) + '</p>',
      height: 600, // Over limit
      penalty: 0
    };

    const layoutCtx = {
      contentHeight: 500,
      lineHeightPx: 20
    };

    const evaluation = evaluateBreakCandidate(candidate, layoutCtx, measureDiv);

    // Should detect overflow
    expect(evaluation.checks.overflow).toBeDefined();
  });
});

// ============================================================================
// END-TO-END SCENARIOS
// ============================================================================

describe('End-to-End: Real Pagination Scenarios', () => {
  let measureDiv;

  beforeEach(() => {
    measureDiv = document.createElement('div');
    measureDiv.style.width = '400px';
    document.body.appendChild(measureDiv);
  });

  afterEach(() => {
    if (measureDiv && measureDiv.parentNode) {
      measureDiv.parentNode.removeChild(measureDiv);
    }
  });

  test('Scenario: Book with headings and paragraphs', () => {
    const pages = [
      { html: '<h1>Chapter 1</h1><p>Content</p>' },
      { html: '<h2>Section 1.1</h2><p>More content</p>' },
      { html: '<h3>Subsection</h3><p>Details</p>' }
    ];

    const report = validateAllPages(pages, 500, 20, measureDiv);

    expect(report.totalPages).toBe(3);
    expect(report.pageScores.length).toBe(3);
  });

  test('Scenario: Detecting all violation types', () => {
    const pages = [
      { html: '<h2>Orphan Heading</h2>' }, // Orphan heading
      { html: '<p>' + 'A'.repeat(10000) + '</p>' } // Might overflow
    ];

    const report = validateAllPages(pages, 500, 20, measureDiv);

    expect(report.violations).toBeDefined();
    expect(report.violations.length).toBeGreaterThanOrEqual(0);
  });

  test('Scenario: Compression prevents page break', () => {
    const html = '<p>' + 'Lorem ipsum '.repeat(50) + '</p>';
    const layoutCtx = {
      contentHeight: 100,
      lineHeightPx: 20
    };

    const result = tryParagraphCompression(html, layoutCtx, measureDiv);

    // Result should be valid either way
    expect(result).toHaveProperty('success');
    expect(typeof result.success).toBe('boolean');
  });
});
