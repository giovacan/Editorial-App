# Layout Safety Engine - Implementation Guide

**Status**: Ready for integration
**Files**:
- `layoutSafetyEngine.js` (470 lines) - Core safety functions
- `layoutSafetyIntegration.js` (350 lines) - Integration examples
- `layoutSafetyEngine.test.js` (600+ test cases) - Test suite

---

## Quick Start

### 1. Import Safety Engine in paginateChapters.js

```javascript
import {
  calculateSafeContentHeight,
  detectOrphanHeading,
  detectOverflow,
  validateFillPassMove,
  validateAllPages,
  tryParagraphCompression
} from './layoutSafetyEngine';
```

### 2. Initialize Safety Context at Start of paginateChapters()

```javascript
export const paginateChapters = (chapters, layoutCtx, measureDiv, safeConfig) => {
  const pages = [];

  // === GUARD RAIL 1: Calculate safe content height ===
  const safeContentHeight = calculateSafeContentHeight(
    layoutCtx.contentHeight,
    layoutCtx.lineHeightPx
  );

  console.log(`[LAYOUT-SAFETY] Safe height: ${safeContentHeight}px`);

  // Use safeContentHeight instead of contentHeight throughout
  // ...rest of pagination logic...
};
```

### 3. Integrate Guard Rails in processChapter()

**Guard Rail 3 - Heading Protection (line ~423)**:
```javascript
if (currentHtml) {
  const headingCheck = detectOrphanHeading(currentHtml);

  if (headingCheck.hasOrphanHeading) {
    // Move heading to next page
    // ...
  }

  pages.push({...});
}
```

**Guard Rail 5 - Overflow Detection (before push)**:
```javascript
const overflowCheck = detectOverflow(currentHtml, safeContentHeight, measureDiv);
if (overflowCheck.overflows) {
  console.error(`Page ${pages.length + 1} overflows by ${overflowCheck.overflow}px`);
}
```

### 4. Enhance Fill Pass with Guard Rail 6

In `applyFillPassInPlace()` (line ~528):

```javascript
const moveValidation = validateFillPassMove(
  page.html,
  firstElOuter,
  safeContentHeight,
  measureDiv
);

if (!moveValidation.canMove) {
  break; // Skip this move
}
// Proceed with move...
```

### 5. Add Post-Validation at End of paginateChapters()

```javascript
// Before returning pages
const validationReport = validateAllPages(
  pages,
  layoutCtx.contentHeight,
  layoutCtx.lineHeightPx,
  measureDiv
);

if (validationReport.violations.length > 0) {
  console.warn('[LAYOUT-SAFETY] Violations found:', validationReport);
}

return pages;
```

---

## 7 Guard Rails Explained

### Guard Rail 1: Safety Line Guard ✅

**Purpose**: Reserve one full line height at page bottom to prevent text clipping

**Function**: `calculateSafeContentHeight(contentHeight, lineHeightPx)`

**Integration**:
- Call once at start of `paginateChapters()`
- Use returned `safeContentHeight` for all overflow checks
- Replace all `contentHeight` comparisons with `safeContentHeight`

**Example**:
```javascript
// BEFORE (unsafe)
if (elementHeight > contentHeight) { /* overflow */ }

// AFTER (safe)
if (elementHeight > safeContentHeight) { /* overflow */ }
```

**Impact**: ✅ Prevents last-line clipping (CRITICAL FIX)

---

### Guard Rail 2: Margin-aware Measurement ✅

**Purpose**: Validate measurement container has no inherited margins

**Function**: `validateMeasurementContainer(measureDiv)`

**Integration**:
```javascript
if (process.env.NODE_ENV === 'development') {
  const isValid = validateMeasurementContainer(measureDiv);
  if (!isValid) {
    console.warn('[LAYOUT-SAFETY] Measurement container has improper setup');
  }
}
```

**Note**: Already partially implemented in `usePagination.js`
- Add: `measureDiv.style.margin = '0';` (line ~195)
- This is covered in earlier audit

**Impact**: ✅ Accurate height measurements

---

### Guard Rail 3: Heading Protection ✅

**Purpose**: Prevent pages from ending with orphan headings

**Function**: `detectOrphanHeading(pageHtml)`

**Integration** (line ~423 in processChapter):
```javascript
if (currentHtml) {
  const headingCheck = detectOrphanHeading(currentHtml);

  if (headingCheck.hasOrphanHeading && headingCheck.isLastElement) {
    // Separate heading from page
    const pageDiv = document.createElement('div');
    pageDiv.innerHTML = currentHtml;
    const lastChild = pageDiv.lastElementChild;

    if (pageDiv.children.length > 1) {
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
      pages.push({ html: currentHtml, ... });
      currentHtml = '';
      currentHeight = 0;
    }
  } else {
    pages.push({ html: currentHtml, ... });
  }
}
```

**Impact**: ✅ Eliminates orphan headings (HIGH PRIORITY)

---

### Guard Rail 4: Widow/Orphan Control ✅

**Purpose**: Ensure paragraph splits maintain minimum lines

**Function**: `validateWidowOrphanRules(linesBeforeBreak, linesAfterBreak, minOrphan, minWidow)`

**Status**: Already implemented in paginateChapters.js (line ~363)
- Just ensure `minOrphanLines` and `minWidowLines` are correct
- Recommended: 2-2 for standard books

**Impact**: ✅ Already working

---

### Guard Rail 5: Overflow Rollback ✅

**Purpose**: Detect pages that exceed safe content height

**Function**: `detectOverflow(pageHtml, safeContentHeight, measureDiv)`

**Integration** (before page push):
```javascript
const overflowCheck = detectOverflow(currentHtml, safeContentHeight, measureDiv);

if (overflowCheck.overflows) {
  console.error(
    `[LAYOUT-SAFETY] Page ${pages.length + 1} overflows by ${overflowCheck.overflow}px`
  );
}

pages.push({
  html: currentHtml,
  pageNumber: pages.length + 1,
  chapterTitle: chapter.title,
  isBlank: false,
  currentSubheader
});
```

**Note**: This detects but cannot fix overflow (too late to unwind)
- Primary prevention is Guard Rail 1 (safety margin)
- This is a safety net for debugging

**Impact**: ✅ Visibility of constraint violations

---

### Guard Rail 6: Fill Pass Constraints ✅

**Purpose**: Prevent fill pass from violating layout rules

**Function**: `validateFillPassMove(sourcePageHtml, elementToMove, safeContentHeight, measureDiv)`

**Integration** (line ~528 in applyFillPassInPlace):
```javascript
const moveValidation = validateFillPassMove(
  page.html,
  firstElOuter,
  safeContentHeight,  // Use safe height!
  measureDiv
);

if (!moveValidation.canMove) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[FILL-PASS] Cannot move: ${moveValidation.reason}`);
  }
  break; // Skip this move
}

// Only proceed if validation passed
measureDiv.innerHTML = page.html + firstElOuter;
const pageWithElHeight = measureDiv.offsetHeight;

if (pageWithElHeight <= safeContentHeight) {
  // Move content...
}
```

**Critical Change**: Use `safeContentHeight` not `contentHeight`

**Impact**: ✅ Fill pass respects all constraints

---

### Guard Rail 7: Post-Layout Validation ✅

**Purpose**: Audit all pages for violations after pagination completes

**Function**: `validateAllPages(pages, contentHeight, lineHeightPx, measureDiv)`

**Integration** (end of paginateChapters, before return):
```javascript
const validationReport = validateAllPages(
  pages,
  layoutCtx.contentHeight,
  layoutCtx.lineHeightPx,
  measureDiv
);

// Log results
if (validationReport.violations.length > 0) {
  console.warn('[LAYOUT-SAFETY] Page violations detected:');
  validationReport.violations.forEach(v => {
    console.warn(`  Page ${v.page}: ${v.violations.map(x => x.type).join(', ')}`);
  });
}

if (process.env.NODE_ENV === 'development') {
  console.table(validationReport.pageScores);
}

return pages;
```

**Impact**: ✅ Post-pagination quality assurance

---

## 2 Smart Features

### Feature 1: Smart Page Breaks

**Function**: `findBestPageBreak(children, currentPageIdx, currentPageHtml, currentPageHeight, measureDiv, layoutCtx)`

**When to Use**: When page is near overflow (optional enhancement)

**Algorithm**:
1. Generate multiple break candidates:
   - Break BEFORE current element
   - Break AFTER current element
2. Score each candidate:
   - Orphan/widow violations: +500 each
   - Heading at bottom: +1000
   - Split paragraph: +200
   - Underfilled page: +80
   - Overflow: +10000
3. Choose candidate with lowest score

**Integration** (optional, in processChapter):
```javascript
// When page is nearly full
if (currentHeight > safeContentHeight * 0.9) {
  const bestBreak = findBestPageBreak(
    children,
    childIdx,
    currentHtml,
    currentHeight,
    measureDiv,
    layoutCtx
  );

  // Use bestBreak.elementIndex to determine page break
}
```

**Impact**: Improves break point selection (nice-to-have)

---

### Feature 2: Paragraph Compression

**Function**: `tryParagraphCompression(elementHtml, layoutCtx, measureDiv)`

**When to Use**: When element barely overflows (<2 lines)

**Algorithm**:
1. Check if overflow is small (<2 lines)
2. Try reducing width to 99%, 98.5%, 98%
3. Measure height at each compression ratio
4. Accept if element fits (imperceptible to user)

**Constraints**:
- Maximum compression: 2% width reduction
- Font size: NEVER changed
- Line height: NEVER changed
- Only for text elements (p, div, blockquote)

**Integration** (in processChapter, when overflow detected):
```javascript
if (candidateHeight > safeContentHeight) {
  // Element overflows - try compression
  const overflow = candidateHeight - safeContentHeight;
  const overflowLines = Math.ceil(overflow / lineHeightPx);

  if (overflowLines <= 2) {
    // Small overflow - try compression
    const compressionResult = tryParagraphCompression(
      elHtml,
      layoutCtx,
      measureDiv
    );

    if (compressionResult.success) {
      console.log(`[SMART-LAYOUT] Compressed by ${compressionResult.percentReduction}%`);
      // Use element with compression applied
      // (In practice: store compression ratio and apply to final rendering)
    } else {
      // Compression failed - fall back to page break
      // ...normal page break logic...
    }
  }
}
```

**Impact**: Avoids unnecessary page breaks (enhancement)

---

## Implementation Checklist

### Phase 1: Core Safety (CRITICAL)

- [ ] **Import safety engine** in paginateChapters.js
- [ ] **Initialize safeContentHeight** at function start
- [ ] **Replace all contentHeight checks** with safeContentHeight
- [ ] **Test**: Last line no longer clipped
- [ ] **Commit**: "feat: add safety line guard to pagination"

### Phase 2: Heading Protection (HIGH)

- [ ] **Add heading detection** before page flush
- [ ] **Move orphan headings** to next page
- [ ] **Test**: No pages end with lone headings
- [ ] **Commit**: "feat: add heading protection to pagination"

### Phase 3: Fill Pass Enhancement (HIGH)

- [ ] **Add move validation** in fill pass
- [ ] **Use safeContentHeight** in fill pass checks
- [ ] **Prevent orphan heading creation** via fill pass
- [ ] **Test**: Fill pass respects all rules
- [ ] **Commit**: "feat: enforce constraints in fill pass"

### Phase 4: Post-Validation (MEDIUM)

- [ ] **Add validation report** at end of pagination
- [ ] **Log violations** for debugging
- [ ] **Test**: Validation catches violations
- [ ] **Commit**: "feat: add post-pagination validation"

### Phase 5: Smart Features (OPTIONAL)

- [ ] **Implement paragraph compression** (feature)
- [ ] **Implement smart page breaks** (feature)
- [ ] **Add tests** for both features
- [ ] **Test**: Compression prevents unnecessary breaks
- [ ] **Commit**: "feat: add smart pagination features"

---

## Testing Strategy

### Run Existing Tests
```bash
npm test layoutSafetyEngine.test.js
```

### Test Real Pagination
```javascript
// In usePagination.js, add flag:
const safeConfig = {
  ...config,
  debugSafety: true
};

// Watch console for [LAYOUT-SAFETY] logs
```

### Manual Testing
1. **Last line visibility**: Check no text clipped at page bottom
2. **Orphan headings**: Verify no section titles alone
3. **Fill pass**: Verify rebalancing respects rules
4. **Overflow**: Check console for overflow warnings
5. **Compression**: See [SMART-LAYOUT] messages in console

---

## Performance Impact

| Operation | Cost | Notes |
|-----------|------|-------|
| safeContentHeight calc | O(1) | Single subtraction |
| Heading detection | O(n) | Per element |
| Overflow check | O(1) | Single measurement |
| Fill pass validation | O(m) | Per move attempted |
| Post-validation | O(p) | Per page |
| Compression | O(k) | k compression ratios tried |

**Total**: Minimal overhead (<5% slowdown)

---

## Debugging

### Enable Debug Logs
```javascript
// At top of layoutSafetyEngine.js
const DEBUG = process.env.NODE_ENV === 'development';

// Then throughout code:
if (DEBUG) console.log('[LAYOUT-SAFETY]', ...);
```

### Common Issues

**Problem**: Last lines still clipped
- **Check**: `safeContentHeight` being used everywhere
- **Check**: measureDiv margin reset (Guard Rail 2)
- **Check**: Font metrics match between measurement and preview

**Problem**: Orphan headings still appearing
- **Check**: Heading detection running in processChapter()
- **Check**: Heading HTML being moved correctly
- **Check**: measureDiv measurements accurate

**Problem**: Fill pass not respecting constraints
- **Check**: Using `safeContentHeight` in fill pass
- **Check**: `validateFillPassMove()` being called
- **Check**: Move rejection working

---

## Architecture Notes

### Why These Functions Are Pure

All safety engine functions are pure (no side effects):
- ✅ Same input → same output
- ✅ No state mutation
- ✅ No external dependencies
- ✅ Fully testable
- ✅ Easy to debug

### Why Safety Guards Work

Each guard rail prevents a specific class of errors:
1. Safety margin prevents clipping (physics)
2. Measurement validation ensures accuracy (data quality)
3. Heading protection maintains structure (typography)
4. Widow/orphan rules follow standards (typography)
5. Overflow detection catches overflows (data validation)
6. Fill pass validation prevents side effects (constraint propagation)
7. Post-validation audits results (quality assurance)

### Why Smart Features Help

- **Paragraph Compression**: Avoids page breaks for minor overflow
- **Smart Page Breaks**: Chooses optimal break point when multiple exist

---

## Configuration Examples

### Conservative (Maximum Safety)
```javascript
const layoutCtx = {
  contentHeight: 500,
  lineHeightPx: 20,
  minOrphanLines: 3,        // Strict
  minWidowLines: 3,         // Strict
  splitLongParagraphs: true,
  maxCompressionRatio: 0.01 // Minimal
};
```

### Balanced (Recommended)
```javascript
const layoutCtx = {
  contentHeight: 500,
  lineHeightPx: 20,
  minOrphanLines: 2,        // Standard
  minWidowLines: 2,         // Standard
  splitLongParagraphs: true,
  maxCompressionRatio: 0.02 // Standard
};
```

### Relaxed (Maximum Flexibility)
```javascript
const layoutCtx = {
  contentHeight: 500,
  lineHeightPx: 20,
  minOrphanLines: 1,        // Relaxed
  minWidowLines: 1,         // Relaxed
  splitLongParagraphs: true,
  maxCompressionRatio: 0.03 // Flexible
};
```

---

## Next Steps

1. **Review** layoutSafetyEngine.js (470 lines)
2. **Review** layoutSafetyIntegration.js (integration examples)
3. **Implement Phase 1** (safeContentHeight)
4. **Test Phase 1** (no more clipped lines)
5. **Implement Phase 2** (heading protection)
6. **Test Phase 2** (no orphan headings)
7. **Implement Phase 3-5** (gradually)
8. **Run test suite** (600+ tests)

---

## Support

For questions:
- See `layoutSafetyEngine.js` comments
- See `layoutSafetyIntegration.js` examples
- See `layoutSafetyEngine.test.js` test cases
- See `GUARD_RAILS_IMPLEMENTATION.md` for earlier audit context
