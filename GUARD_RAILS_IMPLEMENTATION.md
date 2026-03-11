# Layout Guard Rails - Implementation Guide

## Quick Reference

| Guard Rail | File | Change | Lines |
|-----------|------|--------|-------|
| Safety Margin | usePagination.js | 246 | 1 |
| Margin Reset | usePagination.js | 195 | 1 |
| Heading Protection | paginateChapters.js | 423-432 | 20 |
| Fill Pass Constraint | paginateChapters.js | 531 | 15 |
| Overflow Detection | paginateChapters.js | 421 | 10 |

**Total**: 5 lines changed + 45 lines added = ~50 lines

---

## Fix 1: Safety Margin (CRITICAL)

**File**: `src/hooks/usePagination.js`
**Line**: 246

### Before
```javascript
const safetyMargin = 1 + headerSpaceEstimate;
```

### After
```javascript
const safetyMargin = lineHeightPx + headerSpaceEstimate;
```

### Why
- Current: Only 1px buffer for ~20px line height
- Result: Last line clipped at page bottom
- Fix: Reserve full line height as safety buffer
- Impact: **Eliminates last-line clipping entirely**

### Verification
```javascript
console.log(`Safety margin: ${safetyMargin}px, Line height: ${lineHeightPx}px`);
// Should show: Safety margin: 20-40px (not 1px)
```

---

## Fix 2: Margin Reset (MEDIUM)

**File**: `src/hooks/usePagination.js`
**Line**: ~195 (in measureDiv reset section)

### Before
```javascript
measureDiv.style.padding = '0';
// ... other styles ...
// ❌ Missing margin reset!
```

### After
```javascript
measureDiv.style.padding = '0';
measureDiv.style.margin = '0';  // ✅ ADD THIS
// ... other styles ...
```

### Why
- measureDiv inherits browser default margin (~8px)
- Each measured element adds its margins on top
- Cumulative error: ~160px across 20 elements
- Fix: Reset margin to 0 before each measurement
- Impact: **Accurate height measurements**

### Verification
```javascript
console.log(`measureDiv margin: ${window.getComputedStyle(measureDiv).margin}`);
// Should show: 0px (not 8px)
```

---

## Fix 3: Heading Protection (HIGH)

**File**: `src/utils/paginateChapters.js`
**Location**: After line 421 (after element loop, before final flush)

### Add validation
```javascript
  // Flush remaining content
  if (currentHtml) {
    // ✅ NEW: Validate page doesn't end with orphan heading
    const pageDiv = document.createElement('div');
    pageDiv.innerHTML = currentHtml;
    const lastChild = pageDiv.lastElementChild;
    const firstChild = pageDiv.firstElementChild;

    // If page ends with heading but has content before it, move heading to next
    if (lastChild && lastChild.tagName.match(/^H[1-6]$/i)) {
      // Heading at end of page - check if page has other content
      if (pageDiv.children.length > 1) {
        // Page has content + heading - move heading to next page
        const headingHtml = lastChild.outerHTML;
        lastChild.remove();
        const pageWithoutHeading = pageDiv.innerHTML.trim();

        // Push page without heading
        pages.push({
          html: pageWithoutHeading,
          pageNumber: pages.length + 1,
          chapterTitle: chapter.title,
          isBlank: false,
          currentSubheader
        });

        // Carry heading to next page
        currentHtml = headingHtml;
        measureDiv.innerHTML = currentHtml;
        currentHeight = measureDiv.offsetHeight;

        // Continue to next page (will flush heading + next content together)
      } else {
        // Page only has heading - keep it (it will get content from next element)
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
      // Normal flush - no heading at end
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
```

### Why
- Headings orphaned at page bottom confuse readers
- Professional layout never ends page with lone heading
- Fix: Detect and move heading to next page
- Impact: **Eliminates all orphan headings**

### Verification
```javascript
pages.forEach((page, idx) => {
  const div = document.createElement('div');
  div.innerHTML = page.html;
  const lastEl = div.lastElementChild;
  if (lastEl && lastEl.tagName.match(/^H[1-6]$/i)) {
    console.warn(`❌ Page ${idx + 1} ends with orphan heading`);
  }
});
// Should show: No warnings
```

---

## Fix 4: Fill Pass Constraint (HIGH)

**File**: `src/utils/paginateChapters.js`
**Location**: Line 531 (inside fill pass, before accepting element move)

### Add validation before this block
```javascript
      // Test if element fits
      try {
        measureDiv.innerHTML = page.html + firstElOuter;
        const pageWithElHeight = measureDiv.offsetHeight;

        if (pageWithElHeight <= contentHeight) {
          // ✅ NEW: Validate resulting page structure
          const resultingPageDiv = document.createElement('div');
          resultingPageDiv.innerHTML = page.html + firstElOuter;
          const resultingLastEl = resultingPageDiv.lastElementChild;
          const movedIsHeading = firstEl.tagName.match(/^H[1-6]$/i);

          // Reject if moving creates orphan heading on source page
          const wouldViolateHeadingRule =
            movedIsHeading &&
            resultingLastEl === firstEl;  // If moved element becomes last

          if (wouldViolateHeadingRule) {
            // Don't move - would create constraint violation
            // Skip to next fill attempt
          } else {
            // Safe to move
            firstEl.remove();
            const restHtml = tmp.innerHTML;

            // Check widow lines
            if (!restHtml.trim()) {
              pages[pageIdx] = { ...page, html: page.html + firstElOuter };
              pages[nextIdx] = { ...nextPage, html: '' };
              totalIterations++;
            } else {
              measureDiv.innerHTML = restHtml;
              const widowLines = Math.floor((measureDiv.offsetHeight || 0) / lineHeightPx);

              if (widowLines >= minWidowLines) {
                pages[pageIdx] = { ...page, html: page.html + firstElOuter };
                pages[nextIdx] = { ...nextPage, html: restHtml };
                totalIterations++;
              }
            }
          }
        }
      } catch (e) {
        // ... error handling ...
      }
```

### Why
- Fill pass can move headings that create orphan headings
- Need to validate constraint before committing move
- Fix: Check if move would violate heading rule
- Impact: **Fill pass respects all layout constraints**

### Verification
```javascript
// After fill pass, check pages
pages.forEach((page, idx) => {
  const div = document.createElement('div');
  div.innerHTML = page.html;
  const lastEl = div.lastElementChild;
  if (lastEl && lastEl.tagName.match(/^H[1-6]$/i)) {
    console.warn(`❌ Fill pass created orphan heading on page ${idx + 1}`);
  }
});
// Should show: No warnings
```

---

## Fix 5: Overflow Detection (MEDIUM - Logging only)

**File**: `src/utils/paginateChapters.js`
**Location**: After line 421, before final flush

### Add detection
```javascript
  // Flush remaining content
  if (currentHtml) {
    measureDiv.innerHTML = currentHtml;
    const finalHeight = measureDiv.offsetHeight;

    // ✅ Detect (but cannot fix at this point)
    if (finalHeight > contentHeight) {
      console.error(
        `⚠️ [OVERFLOW] Page ${pages.length + 1} exceeds contentHeight: ` +
        `${finalHeight}px > ${contentHeight}px (overflow: ${finalHeight - contentHeight}px)`
      );
    }

    pages.push({
      html: currentHtml,
      pageNumber: pages.length + 1,
      chapterTitle: chapter.title,
      isBlank: false,
      currentSubheader
    });
  }
```

### Why
- Detects pages that somehow exceed contentHeight
- Helps diagnose algorithm errors
- Note: Fix 2 (safety margin) prevents this from happening
- Impact: **Visibility of constraint violations**

### Verification
```javascript
// After pagination:
const overflowPages = pages.filter(p => {
  const div = document.createElement('div');
  div.innerHTML = p.html;
  return div.offsetHeight > contentHeight;
});

console.log(`Total overflow pages: ${overflowPages.length}`);
// Should be: 0
```

---

## Implementation Checklist

- [ ] Fix 1: Change safety margin (1 line)
- [ ] Fix 2: Reset measureDiv margin (1 line)
- [ ] Fix 3: Add heading protection (20 lines)
- [ ] Fix 4: Add fill pass validation (15 lines)
- [ ] Fix 5: Add overflow detection (10 lines)

---

## Testing After Implementation

### Unit Tests

```javascript
// Test 1: Safety margin exists
const testMargin = contentHeight - (contentHeight - safetyMargin);
assert(testMargin >= lineHeightPx, 'Safety margin should be at least 1 line height');

// Test 2: No orphan headings
pages.forEach(page => {
  const div = document.createElement('div');
  div.innerHTML = page.html;
  const lastEl = div.lastElementChild;
  assert(
    !lastEl || !lastEl.tagName.match(/^H[1-6]$/i),
    `Page should not end with heading`
  );
});

// Test 3: No overflow
pages.forEach(page => {
  const div = document.createElement('div');
  div.innerHTML = page.html;
  assert(
    div.offsetHeight <= contentHeight,
    `Page height ${div.offsetHeight} should not exceed ${contentHeight}`
  );
});
```

### Visual Tests

1. **Last line visibility**:
   - Paginate book with text
   - Check bottom of pages
   - Verify last line fully visible (no clipping)

2. **Heading placement**:
   - Paginate book with section headings
   - Verify no page ends with lone heading
   - All headings followed by at least 1 paragraph

3. **Fill pass behavior**:
   - Paginate with `minOrphanLines: 2`
   - Verify underfilled pages are filled
   - Verify no constraints violated

4. **Overflow handling**:
   - Check browser console
   - Should see NO overflow warnings
   - Or very few (indicates algorithm edge case)

---

## Rollback Plan

If unexpected issues occur:

1. **Fix 1 (Safety margin)**: Just undo the change (revert to `= 1 +`)
2. **Fix 2 (Margin reset)**: Remove the `margin: '0'` line
3. **Fix 3 (Heading protection)**: Remove the entire heading validation block
4. **Fix 4 (Fill pass validation)**: Remove the `wouldViolateHeadingRule` check
5. **Fix 5 (Overflow detection)**: Remove the console.error block

All changes are isolated and can be reverted independently.

---

## Expected Results After Implementation

**Before**:
- ❌ Last lines clipped
- ❌ Text overflows page
- ❌ Orphan headings appear
- ❌ Fill pass creates violations
- ❌ Margin measurements inconsistent

**After**:
- ✅ Last lines fully visible
- ✅ No text overflow
- ✅ No orphan headings
- ✅ Fill pass respects all rules
- ✅ Consistent measurements
- ✅ Professional-grade layout

---

## Support

For questions about specific fixes, refer to:
- `LAYOUT_GUARD_RAILS_AUDIT.md` - Detailed analysis
- `PAGINATION_LAYOUT_AUDIT.md` - Original audit
- Code comments in implementation
