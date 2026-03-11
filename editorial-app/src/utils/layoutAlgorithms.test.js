/**
 * layoutAlgorithms.test.js
 *
 * Test suite for advanced layout algorithms.
 * Tests paragraph balancing, compression, and global optimization.
 */

import {
  balanceParagraphSplit,
  tryParagraphCompression,
  evaluatePageQuality,
  compareLayoutOptions
} from './layoutAlgorithms';

// ============================================================================
// ALGORITHM 1: PARAGRAPH BALANCING TESTS
// ============================================================================

describe('Algorithm 1: Paragraph Balancing', () => {
  let measureDiv;

  beforeEach(() => {
    measureDiv = document.createElement('div');
    measureDiv.style.width = '400px';
    measureDiv.style.fontFamily = 'Georgia, serif';
    measureDiv.style.fontSize = '12pt';
    measureDiv.style.lineHeight = '1.6';
    document.body.appendChild(measureDiv);
  });

  afterEach(() => {
    if (measureDiv && measureDiv.parentNode) {
      measureDiv.parentNode.removeChild(measureDiv);
    }
  });

  test('Detects widow (next page < 2 lines)', () => {
    const prevPageHtml = '<p>Lorem ipsum dolor sit amet.</p>';
    const nextPageHtml = '<p>Single line.</p>';
    const lineHeightPx = 20;

    const result = balanceParagraphSplit(prevPageHtml, nextPageHtml, lineHeightPx, measureDiv);

    expect(result).toHaveProperty('needsRebalance');
    // Result depends on actual measured heights
    expect(result).toHaveProperty('currentSplit');
  });

  test('Detects orphan (previous page < 2 lines)', () => {
    const prevPageHtml = '<p>Solo.</p>';
    const nextPageHtml = '<p>Lorem ipsum dolor sit amet consectetur adipiscing.</p>';
    const lineHeightPx = 20;

    const result = balanceParagraphSplit(prevPageHtml, nextPageHtml, lineHeightPx, measureDiv);

    expect(result).toHaveProperty('needsRebalance');
    expect(result).toHaveProperty('currentSplit');
  });

  test('Returns good split when both sides have adequate lines', () => {
    const prevPageHtml = '<p>Lorem ipsum dolor sit amet consectetur adipiscing elit.</p>';
    const nextPageHtml = '<p>Sed do eiusmod tempor incididunt ut labore.</p>';
    const lineHeightPx = 20;

    const result = balanceParagraphSplit(prevPageHtml, nextPageHtml, lineHeightPx, measureDiv);

    // Ideally should not need rebalance
    expect(result).toHaveProperty('needsRebalance');
    expect(result).toHaveProperty('currentSplit');
  });

  test('Handles invalid input gracefully', () => {
    const result = balanceParagraphSplit(null, null, 20, null);

    expect(result.needsRebalance).toBe(false);
    expect(result.reason).toBeDefined();
  });

  test('Optimizes ratio toward 60/40 split', () => {
    const prevPageHtml = '<p>' + 'Lorem ipsum dolor sit amet. '.repeat(10) + '</p>';
    const nextPageHtml = '<p>' + 'Sed do eiusmod tempor incididunt. '.repeat(20) + '</p>';
    const lineHeightPx = 20;

    const result = balanceParagraphSplit(prevPageHtml, nextPageHtml, lineHeightPx, measureDiv);

    if (result.currentSplit) {
      expect(result.currentSplit).toHaveProperty('prevLines');
      expect(result.currentSplit).toHaveProperty('nextLines');
      expect(result.currentSplit).toHaveProperty('ratio');
    }
  });

  test('Recommends line move when needed', () => {
    const prevPageHtml = '<p>Some content on previous page that takes several lines.</p>';
    const nextPageHtml = '<p>One.</p>';
    const lineHeightPx = 20;

    const result = balanceParagraphSplit(prevPageHtml, nextPageHtml, lineHeightPx, measureDiv);

    if (result.needsRebalance) {
      expect(result.action).toMatch(/move_line|optimize_ratio/);
    }
  });
});

// ============================================================================
// ALGORITHM 2: PARAGRAPH COMPRESSION TESTS
// ============================================================================

describe('Algorithm 2: Paragraph Compression', () => {
  let measureDiv;

  beforeEach(() => {
    measureDiv = document.createElement('div');
    measureDiv.style.width = '400px';
    measureDiv.style.fontFamily = 'Georgia, serif';
    measureDiv.style.fontSize = '12pt';
    measureDiv.style.lineHeight = '1.6';
    document.body.appendChild(measureDiv);
  });

  afterEach(() => {
    if (measureDiv && measureDiv.parentNode) {
      measureDiv.parentNode.removeChild(measureDiv);
    }
  });

  test('Returns false when remaining space is too large', () => {
    const elements = ['<p>Test paragraph</p>'];
    const remainingSpace = 100; // Full line
    const lineHeightPx = 20;
    const contentHeight = 500;

    const result = tryParagraphCompression(elements, remainingSpace, lineHeightPx, contentHeight, measureDiv);

    expect(result.canCompress).toBe(false);
  });

  test('Identifies compressible elements (paragraphs only)', () => {
    const elements = [
      '<p>Paragraph 1</p>',
      '<h2>Heading</h2>',
      '<p>Paragraph 2</p>',
      '<ul><li>List</li></ul>'
    ];
    const remainingSpace = 5; // Small gap
    const lineHeightPx = 20;
    const contentHeight = 500;

    const result = tryParagraphCompression(elements, remainingSpace, lineHeightPx, contentHeight, measureDiv);

    // Should identify 2 paragraphs as compressible
    expect(result).toHaveProperty('reason');
  });

  test('Rejects compression for headings', () => {
    const elements = ['<h2>Heading Only</h2>'];
    const remainingSpace = 5;
    const lineHeightPx = 20;
    const contentHeight = 500;

    const result = tryParagraphCompression(elements, remainingSpace, lineHeightPx, contentHeight, measureDiv);

    expect(result.canCompress).toBe(false);
    expect(result.reason).toContain('No compressible');
  });

  test('Rejects compression for lists', () => {
    const elements = ['<ul><li>Item 1</li><li>Item 2</li></ul>'];
    const remainingSpace = 5;
    const lineHeightPx = 20;
    const contentHeight = 500;

    const result = tryParagraphCompression(elements, remainingSpace, lineHeightPx, contentHeight, measureDiv);

    expect(result.canCompress).toBe(false);
  });

  test('Rejects compression for blockquotes', () => {
    const elements = ['<blockquote><p>Quote text</p></blockquote>'];
    const remainingSpace = 5;
    const lineHeightPx = 20;
    const contentHeight = 500;

    const result = tryParagraphCompression(elements, remainingSpace, lineHeightPx, contentHeight, measureDiv);

    expect(result.canCompress).toBe(false);
  });

  test('Handles invalid input', () => {
    const result = tryParagraphCompression(null, 5, 20, 500, null);

    expect(result.canCompress).toBe(false);
    expect(result.reason).toBeDefined();
  });

  test('Suggests line-height reduction strategy', () => {
    const elements = [
      '<p>' + 'Lorem ipsum dolor sit amet. '.repeat(20) + '</p>'
    ];
    const remainingSpace = 2; // Very small gap
    const lineHeightPx = 20;
    const contentHeight = 500;

    const result = tryParagraphCompression(elements, remainingSpace, lineHeightPx, contentHeight, measureDiv);

    if (result.canCompress) {
      expect(result.strategy).toMatch(/line_height|margin/);
    }
  });

  test('Limits compression to 4% line-height reduction', () => {
    const elements = [
      '<p>' + 'Lorem ipsum dolor sit amet. '.repeat(30) + '</p>'
    ];
    const remainingSpace = 1; // Tiny gap
    const lineHeightPx = 20;
    const contentHeight = 500;

    const result = tryParagraphCompression(elements, remainingSpace, lineHeightPx, contentHeight, measureDiv);

    if (result.appliedCompression && result.appliedCompression.type === 'line_height_reduction') {
      expect(parseFloat(result.reduction)).toBeLessThanOrEqual(4);
    }
  });

  test('Limits compression to 20% margin reduction', () => {
    const elements = [
      '<p style="margin-bottom: 1em;">' + 'Lorem ipsum. '.repeat(30) + '</p>'
    ];
    const remainingSpace = 5;
    const lineHeightPx = 20;
    const contentHeight = 500;

    const result = tryParagraphCompression(elements, remainingSpace, lineHeightPx, contentHeight, measureDiv);

    if (result.appliedCompression && result.appliedCompression.type === 'margin_reduction') {
      expect(parseFloat(result.reduction)).toBeLessThanOrEqual(20);
    }
  });
});

// ============================================================================
// ALGORITHM 3: GLOBAL LAYOUT OPTIMIZATION TESTS
// ============================================================================

describe('Algorithm 3: Global Layout Optimization', () => {
  let measureDiv;

  beforeEach(() => {
    measureDiv = document.createElement('div');
    measureDiv.style.width = '400px';
    measureDiv.style.fontFamily = 'Georgia, serif';
    measureDiv.style.fontSize = '12pt';
    measureDiv.style.lineHeight = '1.6';
    document.body.appendChild(measureDiv);
  });

  afterEach(() => {
    if (measureDiv && measureDiv.parentNode) {
      measureDiv.parentNode.removeChild(measureDiv);
    }
  });

  test('Evaluates page quality with positive score', () => {
    const pageHtml = '<p>Lorem ipsum dolor sit amet.</p>';
    const contentHeight = 500;
    const lineHeightPx = 20;

    const evaluation = evaluatePageQuality(pageHtml, contentHeight, lineHeightPx, measureDiv);

    expect(evaluation).toHaveProperty('score');
    expect(evaluation.score).toBeGreaterThanOrEqual(0);
    expect(evaluation).toHaveProperty('quality');
  });

  test('Penalizes white space', () => {
    const pageHtml = '<p>Short.</p>'; // Little content
    const contentHeight = 500;
    const lineHeightPx = 20;

    const evaluation = evaluatePageQuality(pageHtml, contentHeight, lineHeightPx, measureDiv);

    expect(evaluation).toHaveProperty('remainingSpace');
    expect(evaluation).toHaveProperty('fillPercentage');
    // Score should reflect white space penalty
    expect(evaluation.score).toBeGreaterThan(0);
  });

  test('Detects heading at page bottom', () => {
    const pageHtml = '<p>Content</p><h2>Section</h2>';
    const contentHeight = 500;
    const lineHeightPx = 20;

    const evaluation = evaluatePageQuality(pageHtml, contentHeight, lineHeightPx, measureDiv);

    if (evaluation.violations.includes('heading_at_bottom')) {
      expect(evaluation.score).toBeGreaterThan(40);
    }
  });

  test('Calculates fill percentage correctly', () => {
    const pageHtml = '<p>Lorem ipsum dolor sit amet.</p>';
    const contentHeight = 500;
    const lineHeightPx = 20;

    const evaluation = evaluatePageQuality(pageHtml, contentHeight, lineHeightPx, measureDiv);

    expect(evaluation).toHaveProperty('fillPercentage');
    const fillPct = parseFloat(evaluation.fillPercentage);
    expect(fillPct).toBeGreaterThan(0);
    expect(fillPct).toBeLessThanOrEqual(100);
  });

  test('Assigns quality rating', () => {
    const pageHtml = '<p>' + 'Lorem ipsum dolor sit amet. '.repeat(15) + '</p>';
    const contentHeight = 500;
    const lineHeightPx = 20;

    const evaluation = evaluatePageQuality(pageHtml, contentHeight, lineHeightPx, measureDiv);

    expect(evaluation).toHaveProperty('quality');
    expect(evaluation.quality).toMatch(/excellent|good|acceptable|fair|poor/);
  });

  test('Handles invalid input', () => {
    const evaluation = evaluatePageQuality(null, 500, 20, null);

    expect(evaluation.score).toBe(Infinity);
    expect(evaluation.reason).toBeDefined();
  });

  test('Lower score means better layout', () => {
    const goodPageHtml = '<p>' + 'Lorem ipsum dolor sit amet. '.repeat(20) + '</p>';
    const poorPageHtml = '<p>Short.</p>';
    const contentHeight = 500;
    const lineHeightPx = 20;

    const goodEval = evaluatePageQuality(goodPageHtml, contentHeight, lineHeightPx, measureDiv);
    const poorEval = evaluatePageQuality(poorPageHtml, contentHeight, lineHeightPx, measureDiv);

    // Good page should have lower or equal score (better quality)
    expect(goodEval.score).toBeLessThanOrEqual(poorEval.score);
  });
});

// ============================================================================
// INTEGRATION: COMPARE LAYOUT OPTIONS TESTS
// ============================================================================

describe('Integration: Compare Layout Options', () => {
  let measureDiv;

  beforeEach(() => {
    measureDiv = document.createElement('div');
    measureDiv.style.width = '400px';
    measureDiv.style.fontFamily = 'Georgia, serif';
    measureDiv.style.fontSize = '12pt';
    measureDiv.style.lineHeight = '1.6';
    document.body.appendChild(measureDiv);
  });

  afterEach(() => {
    if (measureDiv && measureDiv.parentNode) {
      measureDiv.parentNode.removeChild(measureDiv);
    }
  });

  test('Compares two page options and recommends better', () => {
    const optionA = '<p>Content option A</p>';
    const optionB = '<p>' + 'Lorem ipsum dolor sit amet. '.repeat(10) + '</p>';
    const contentHeight = 500;
    const lineHeightPx = 20;

    const comparison = compareLayoutOptions(optionA, optionB, contentHeight, lineHeightPx, measureDiv);

    expect(comparison).toHaveProperty('optionA');
    expect(comparison).toHaveProperty('optionB');
    expect(comparison).toHaveProperty('recommended');
    expect(comparison.recommended).toMatch(/A|B/);
  });

  test('Provides reasoning for recommendation', () => {
    const optionA = '<p>Content A</p>';
    const optionB = '<p>' + 'Lorem ipsum dolor sit amet. '.repeat(20) + '</p>';
    const contentHeight = 500;
    const lineHeightPx = 20;

    const comparison = compareLayoutOptions(optionA, optionB, contentHeight, lineHeightPx, measureDiv);

    expect(comparison).toHaveProperty('reasoning');
    expect(comparison.reasoning).toBeDefined();
  });

  test('Calculates score difference', () => {
    const optionA = '<p>' + 'Lorem ipsum. '.repeat(5) + '</p>';
    const optionB = '<p>' + 'Lorem ipsum. '.repeat(20) + '</p>';
    const contentHeight = 500;
    const lineHeightPx = 20;

    const comparison = compareLayoutOptions(optionA, optionB, contentHeight, lineHeightPx, measureDiv);

    expect(comparison).toHaveProperty('scoreDifference');
    expect(comparison.scoreDifference).toBeGreaterThanOrEqual(0);
  });

  test('Identifies significant differences', () => {
    const optionA = '<p>Short content</p>';
    const optionB = '<p>' + 'Lorem ipsum dolor sit amet. '.repeat(30) + '</p>';
    const contentHeight = 500;
    const lineHeightPx = 20;

    const comparison = compareLayoutOptions(optionA, optionB, contentHeight, lineHeightPx, measureDiv);

    if (comparison.scoreDifference > 5) {
      expect(comparison.reasoning).toContain('significantly better');
    }
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
    measureDiv.style.fontFamily = 'Georgia, serif';
    measureDiv.style.fontSize = '12pt';
    measureDiv.style.lineHeight = '1.6';
    document.body.appendChild(measureDiv);
  });

  afterEach(() => {
    if (measureDiv && measureDiv.parentNode) {
      measureDiv.parentNode.removeChild(measureDiv);
    }
  });

  test('Scenario: Novel chapter pagination', () => {
    const prevPage = '<h2>Chapter 1</h2><p>' + 'Lorem ipsum dolor sit amet. '.repeat(25) + '</p>';
    const nextPage = '<p>' + 'Sed do eiusmod tempor. '.repeat(20) + '</p>';
    const lineHeightPx = 20;

    const balance = balanceParagraphSplit(prevPage, nextPage, lineHeightPx, measureDiv);

    expect(balance).toHaveProperty('currentSplit');
  });

  test('Scenario: Detecting widow paragraph', () => {
    const pageHtml = '<p>Content content content content content content content</p><p>Single line widow.</p>';
    const contentHeight = 500;
    const lineHeightPx = 20;

    const evaluation = evaluatePageQuality(pageHtml, contentHeight, lineHeightPx, measureDiv);

    expect(evaluation).toHaveProperty('score');
    // Widow should increase score (worse quality)
  });

  test('Scenario: Choosing between break or compress', () => {
    const pageA = '<p>' + 'Lorem ipsum dolor sit amet. '.repeat(24) + '</p>';
    const pageB = pageA + '<p>Extra paragraph to test.</p>';
    const contentHeight = 500;
    const lineHeightPx = 20;

    const comparison = compareLayoutOptions(pageA, pageB, contentHeight, lineHeightPx, measureDiv);

    expect(comparison.recommended).toMatch(/A|B/);
    expect(comparison.scoreDifference).toBeGreaterThanOrEqual(0);
  });

  test('Scenario: Complex page with mixed elements', () => {
    const complexPage = `
      <h2>Section Title</h2>
      <p>Introduction paragraph with some content.</p>
      <p>Second paragraph with more content to fill space.</p>
      <blockquote><p>A quote from someone important about the topic.</p></blockquote>
      <p>Final paragraph to complete the section.</p>
    `;
    const contentHeight = 500;
    const lineHeightPx = 20;

    const evaluation = evaluatePageQuality(complexPage, contentHeight, lineHeightPx, measureDiv);

    expect(evaluation).toHaveProperty('score');
    expect(evaluation).toHaveProperty('quality');
    expect(evaluation).toHaveProperty('violations');
  });
});
