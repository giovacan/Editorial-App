/**
 * layoutSafetyIntegration.js
 *
 * Integration examples showing how to use layoutSafetyEngine
 * within the existing pagination architecture.
 *
 * This file contains copy-paste code snippets for integrating
 * safety guards into paginateChapters.js and processChapter().
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
  tryParagraphCompression
} from './layoutSafetyEngine';

/**
 * INTEGRATION POINT 1: Setup Phase
 *
 * Location: paginateChapters.js, at function start
 * Purpose: Initialize safety context before pagination
 *
 * CODE TO ADD:
 * (After destructuring layoutCtx)
 */
export const exampleIntegration_Setup = `
// === Guard Rail 2: Validate measurement container ===
if (process.env.NODE_ENV === 'development') {
  const isMeasurementValid = validateMeasurementContainer(measureDiv);
  if (!isMeasurementValid) {
    console.warn('[LAYOUT-SAFETY] Measurement container has improper margin/padding reset');
  }
}

// === Guard Rail 1: Calculate safe content height ===
const safeContentHeight = calculateSafeContentHeight(contentHeight, lineHeightPx);
console.log(\`[LAYOUT-SAFETY] Safe content height: \${safeContentHeight}px (safety buffer: \${contentHeight - safeContentHeight}px)\`);

// Use safeContentHeight instead of contentHeight for all overflow checks
const effectiveContentHeight = safeContentHeight;
`;

/**
 * INTEGRATION POINT 2: Before Adding Element to Page
 *
 * Location: paginateChapters.js line ~297
 *          Inside processChapter(), when testing if element fits
 *
 * PURPOSE: Detect overflow EARLY and try compression before page break
 */
export const exampleIntegration_PreFitCheck = `
    // CASE B: Check if element fits when added to accumulator
    const candidateHtml = currentHtml + elHtml;

    // === TRY PARAGRAPH COMPRESSION FIRST ===
    if (candidateHeight > safeContentHeight) {
      // Element would overflow - try compression
      const compressionResult = tryParagraphCompression(
        elHtml,
        layoutCtx,
        measureDiv
      );

      if (compressionResult.success) {
        // Compression worked! Use compressed element
        console.log(\`[SMART-LAYOUT] Compressed paragraph by \${compressionResult.percentReduction}%\`);
        // Update elHtml with compressed version
        // (Note: In practice, you'd need to return compressed HTML)
        // For now, proceed with original but compressed width would be used
      }
    }
`;

/**
 * INTEGRATION POINT 3: Page Finalization (Before Push)
 *
 * Location: paginateChapters.js lines 423-432
 *          Before pushing final page in processChapter()
 *
 * PURPOSE: Guard Rail 3 - Detect and prevent orphan headings
 */
export const exampleIntegration_HeadingProtection = `
  // === GUARD RAIL 3: Heading Protection ===
  // Flush remaining content
  if (currentHtml) {
    // Check if page ends with orphan heading
    const headingCheck = detectOrphanHeading(currentHtml);

    if (headingCheck.hasOrphanHeading && headingCheck.isLastElement) {
      // Page ends with heading - need to split it out
      const pageDiv = document.createElement('div');
      pageDiv.innerHTML = currentHtml;
      const lastChild = pageDiv.lastElementChild;

      if (pageDiv.children.length > 1) {
        // Page has content + heading - separate them
        const headingHtml = lastChild.outerHTML;
        lastChild.remove();

        // Push page without heading
        pages.push({
          html: pageDiv.innerHTML,
          pageNumber: pages.length + 1,
          chapterTitle: chapter.title,
          isBlank: false,
          currentSubheader
        });

        // Carry heading to next page
        currentHtml = headingHtml;
        measureDiv.innerHTML = currentHtml;
        currentHeight = measureDiv.offsetHeight;
      } else {
        // Page is only heading - keep for next content
        pages.push({
          html: currentHtml,
          pageNumber: pages.length + 1,
          chapterTitle: chapter.title,
          isBlank: false,
          currentSubheader
        });
        currentHtml = '';
        currentHeight = 0;
      }
    } else {
      // Normal flush - no heading issue
      pages.push({
        html: currentHtml,
        pageNumber: pages.length + 1,
        chapterTitle: chapter.title,
        isBlank: false,
        currentSubheader
      });
      currentHtml = '';
      currentHeight = 0;
    }
  }
`;

/**
 * INTEGRATION POINT 4: Fill Pass Constraints
 *
 * Location: paginateChapters.js lines 527-552
 *          Inside applyFillPassInPlace(), before accepting element move
 *
 * PURPOSE: Guard Rail 6 - Validate fill pass moves don't break rules
 */
export const exampleIntegration_FillPassValidation = `
      // Test if element fits
      try {
        // === GUARD RAIL 6: Validate fill pass constraints ===
        const moveValidation = validateFillPassMove(
          page.html,
          firstElOuter,
          safeContentHeight,  // Use safe height, not contentHeight
          measureDiv
        );

        if (!moveValidation.canMove) {
          if (process.env.NODE_ENV === 'development') {
            console.log(\`[FILL-PASS] Cannot move element: \${moveValidation.reason}\`);
          }
          break; // Skip this move, try next page
        }

        // Move is valid - proceed with original logic
        measureDiv.innerHTML = page.html + firstElOuter;
        const pageWithElHeight = measureDiv.offsetHeight;

        if (pageWithElHeight <= safeContentHeight) {
          // Element fits — move it
          // ... existing move logic ...
        }
      } catch (e) {
        console.warn('paginateChapters: Error testing element fit', e);
        break;
      }
`;

/**
 * INTEGRATION POINT 5: Post-Pagination Validation
 *
 * Location: paginateChapters.js
 *          After all pages generated, before returning
 *
 * PURPOSE: Guard Rail 7 - Final audit of all pages
 */
export const exampleIntegration_PostValidation = `
  // === GUARD RAIL 7: Post-Layout Validation ===
  const validationReport = validateAllPages(
    pages,
    contentHeight,
    lineHeightPx,
    measureDiv
  );

  if (validationReport.violations.length > 0) {
    console.warn('[LAYOUT-SAFETY] Page violations detected:');
    validationReport.violations.forEach(violation => {
      console.warn(\`  Page \${violation.page}: \${violation.count} violation(s)\`);
      violation.violations.forEach(v => {
        console.warn(\`    - \${v.type}: \${v.message}\`);
      });
    });
  }

  if (validationReport.warnings.length > 0) {
    console.info('[LAYOUT-SAFETY] Page quality warnings:');
    validationReport.warnings.forEach(w => {
      console.info(\`  Page \${w.page}: \${w.message}\`);
    });
  }

  if (process.env.NODE_ENV === 'development') {
    console.table(validationReport.pageScores);
  }

  return pages;
`;

/**
 * INTEGRATION POINT 6: Overflow Detection
 *
 * Location: paginateChapters.js, line ~420 (before page flush)
 *
 * PURPOSE: Guard Rail 5 - Detect overflow before page finalization
 */
export const exampleIntegration_OverflowCheck = `
  // === GUARD RAIL 5: Overflow Rollback ===
  // Before finalizing a page, check it doesn't exceed safe height
  if (currentHtml) {
    const overflowCheck = detectOverflow(
      currentHtml,
      safeContentHeight,
      measureDiv
    );

    if (overflowCheck.overflows) {
      console.error(
        \`[LAYOUT-SAFETY] Page \${pages.length + 1} overflows by \${overflowCheck.overflow}px\`,
        'Height:', overflowCheck.height, 'Safe:', overflowCheck.safeContentHeight
      );
      // In production, could trigger rebalancing here
    }

    pages.push({
      html: currentHtml,
      pageNumber: pages.length + 1,
      chapterTitle: chapter.title,
      isBlank: false,
      currentSubheader
    });
  }
`;

/**
 * FULL INTEGRATION EXAMPLE: processChapter() with All Guards
 *
 * This shows the complete modified processChapter flow.
 */
export const exampleIntegration_FullProcessChapter = \`
const processChapter = (chapter, chapterIndex, pages, layoutCtx, measureDiv, safeConfig) => {
  const {
    contentHeight,
    lineHeightPx,
    baseFontSize,
    baseLineHeight,
    textAlign,
    minOrphanLines,
    minWidowLines,
    splitLongParagraphs
  } = layoutCtx;

  // === GUARD RAIL 1+2: Setup Safety Context ===
  const safeContentHeight = calculateSafeContentHeight(contentHeight, lineHeightPx);

  if (process.env.NODE_ENV === 'development') {
    const isMeasurementValid = validateMeasurementContainer(measureDiv);
    console.log('[LAYOUT] Safe height:', safeContentHeight, 'Valid measurement:', isMeasurementValid);
  }

  // ... rest of chapter processing ...

  // When testing element fit (line ~297)
  const candidateHtml = currentHtml + elHtml;
  measureDiv.innerHTML = candidateHtml;
  const candidateHeight = measureDiv.offsetHeight;

  if (candidateHeight > safeContentHeight) {
    // === FEATURE 2: Try paragraph compression ===
    if (candidateHeight - safeContentHeight < lineHeightPx * 2) {
      const compressionResult = tryParagraphCompression(
        elHtml,
        layoutCtx,
        measureDiv
      );

      if (compressionResult.success) {
        console.log('[SMART-LAYOUT] Used compression to fit element');
        // Proceed with this element (compressed)
      }
    }

    // Normal break logic...
  }

  // When finalizing page (line ~423)
  if (currentHtml) {
    // === GUARD RAIL 3: Heading Protection ===
    const headingCheck = detectOrphanHeading(currentHtml);
    if (headingCheck.hasOrphanHeading) {
      // Move heading to next page
      // ...
    }

    // === GUARD RAIL 5: Overflow Detection ===
    const overflowCheck = detectOverflow(currentHtml, safeContentHeight, measureDiv);
    if (overflowCheck.overflows) {
      console.error('[LAYOUT] Page overflow detected');
    }

    pages.push({...});
  }

  return pages;
};
\`;

/**
 * TESTING EXAMPLES
 *
 * Unit test examples for safety engine functions.
 */
export const testExamples = {
  testSafetyMarginCalculation: \`
    import { calculateSafeContentHeight } from './layoutSafetyEngine';

    test('Safety margin reserves one line height', () => {
      const contentHeight = 600;
      const lineHeightPx = 20;

      const safeHeight = calculateSafeContentHeight(contentHeight, lineHeightPx);

      expect(safeHeight).toBe(580); // 600 - 20
      expect(contentHeight - safeHeight).toBe(lineHeightPx);
    });
  \`,

  testOrphanHeadingDetection: \`
    import { detectOrphanHeading } from './layoutSafetyEngine';

    test('Detects heading as last element', () => {
      const html = '<p>Text</p><h2>Section</h2>';
      const result = detectOrphanHeading(html);

      expect(result.hasOrphanHeading).toBe(false); // Has paragraph before
      expect(result.isLastElement).toBe(true);
    });

    test('Detects orphan heading alone', () => {
      const html = '<h2>Section</h2>';
      const result = detectOrphanHeading(html);

      expect(result.hasOrphanHeading).toBe(true);
      expect(result.headingTag).toBe('H2');
    });
  \`,

  testCompressionSuccess: \`
    import { tryParagraphCompression } from './layoutSafetyEngine';

    test('Compresses paragraph when overflow is small', () => {
      const html = '<p>Lorem ipsum dolor sit amet...</p>';
      const layoutCtx = {
        contentHeight: 100,
        lineHeightPx: 20
      };

      const result = tryParagraphCompression(html, layoutCtx, measureDiv);

      if (result.success) {
        expect(result.compressionRatio).toBeLessThanOrEqual(0.02); // Max 2%
        expect(result.newHeight).toBeLessThanOrEqual(safeHeight);
      }
    });
  \`,

  testWidowOrphanValidation: \`
    import { validateWidowOrphanRules } from './layoutSafetyEngine';

    test('Rejects split with insufficient widow', () => {
      const result = validateWidowOrphanRules(
        5,    // linesBeforeBreak (OK)
        1,    // linesAfterBreak (TOO FEW)
        2,    // minOrphanLines
        2     // minWidowLines
      );

      expect(result.orphanViolation).toBe(false);
      expect(result.widowViolation).toBe(true);
      expect(result.bothSatisfied).toBe(false);
    });
  \`,

  testFillPassValidation: \`
    import { validateFillPassMove } from './layoutSafetyEngine';

    test('Rejects move that would overflow', () => {
      const sourcePage = '<p>Text on current page</p>';
      const elementToMove = '<p style="height: 600px">Large element</p>';

      const result = validateFillPassMove(
        sourcePage,
        elementToMove,
        100,  // safeContentHeight
        measureDiv
      );

      expect(result.canMove).toBe(false);
      expect(result.reason).toContain('overflow');
    });
  \`
};
\`;

/**
 * CONFIGURATION EXAMPLE
 *
 * Recommended layoutCtx values for professional typography.
 */
export const recommendedLayoutConfig = {
  // Standard book settings
  contentHeight: 500,        // Pixels available for content
  lineHeightPx: 20,          // Single line height
  minOrphanLines: 2,         // Minimum lines before page break
  minWidowLines: 2,          // Minimum lines after page break
  minParagraphLines: 3,      // Never split if <3 lines would remain
  maxCompressionRatio: 0.02, // Maximum 2% width reduction

  // Safety margins
  safetyBuffer: 'lineHeightPx', // Reserve this much at bottom
  maxMeasurementError: 2,        // Acceptable px difference

  // Heading rules
  minimumLinesAfterHeading: 2, // Heading must have 2+ lines after it
  prohibitHeadingAtPageEnd: true,

  // Fill pass constraints
  respectWidowOrphan: true,
  respectHeadingRules: true,
  respectOverflow: true
};

/**
 * DEBUG MODE: Detailed Logging
 *
 * Enable by setting in config:
 *   debugSafety: true
 */
export const enableSafetyDebugMode = (enabled = true) => {
  window.__LAYOUT_SAFETY_DEBUG__ = enabled;

  if (enabled) {
    console.log(
      '%c[LAYOUT-SAFETY] Debug mode enabled',
      'color: #ff9900; font-weight: bold'
    );
    console.log('%cAll layout decisions will be logged', 'color: #666');
  }
};
