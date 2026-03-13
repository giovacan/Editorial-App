# Pagination Layout Audit & Fixes

## Critical Issues Found

### 1️⃣ **HEIGHT CALCULATION MISMATCH** (Root Cause - PRIMARY BUG)

**Problem**: `measureDiv` at `usePagination.js:196` is reset to `width: 1px` which distorts text wrapping measurements.

**File**: `editorial-app/src/hooks/usePagination.js:196`
```javascript
measureDiv.style.width = '1px';  // ❌ WRONG! Distorts line counting
// Then later at line 228:
measureDiv.style.width = `${contentWidth}px`;  // Set AFTER line height measured
```

**Impact**:
- Line height measured with `width:1px` → single tall column → wrong lineHeightPx
- Subsequent `maxLines = Math.floor(contentHeight / lineHeightPx)` calculates wrong max lines
- Elements fit in measurement but overflow in preview rendering (different layout)

**Fix**: Reset measureDiv ONCE with correct width before ANY measurements:
```javascript
// Line 189-197: Reset and configure measureDiv ONCE
measureDiv.innerHTML = '';
measureDiv.style.cssText = '';
measureDiv.style.position = 'absolute';
measureDiv.style.visibility = 'hidden';
measureDiv.style.left = '-9999px';
measureDiv.style.top = '0';
measureDiv.style.width = contentWidth;  // ✅ MUST be correct width BEFORE line measurements
measureDiv.style.height = 'auto';
measureDiv.style.minHeight = '0';
measureDiv.style.maxHeight = 'none';
measureDiv.style.overflow = 'visible';
measureDiv.style.whiteSpace = 'normal';
measureDiv.style.wordWrap = 'break-word';
measureDiv.style.boxSizing = 'border-box';
measureDiv.style.padding = '0';
measureDiv.style.margin = '0';
measureDiv.style.border = 'none';
measureDiv.style.fontFamily = safeConfig.fontFamily || bookConfig.fontFamily;
measureDiv.style.fontSize = `${baseFontSize}pt`;
measureDiv.style.lineHeight = baseLineHeight;
measureDiv.style.textAlign = textAlign;
measureDiv.style.textJustify = 'inter-word';
measureDiv.style.hyphens = 'auto';
measureDiv.style.wordBreak = 'break-word';

// Now measure line height with CORRECT width
measureDiv.innerHTML = 'Ag';
const lineHeightPx = measureDiv.offsetHeight;  // ✅ Accurate now
```

---

### 2️⃣ **ELEMENT HEIGHT INCLUDES MARGINS** (Causes Overflow)

**Problem**: `paginateChapters.js` measures `elHeight = measureDiv.offsetHeight` but doesn't account for HTML element margins that get rendered in Preview.

**Files Affected**:
- `paginateChapters.js:87` - titleHeight
- `paginateChapters.js:209` - elHeight (paragraph/heading)
- `measurementAdapter.js:76` - measure() method

**CSS Issue** (`Preview.css:168-227`):
```css
.preview-content h1, h2, h3, h4, h5, h6 {
  margin: 1em 0 0.5em 0;  /* ← ADDS HEIGHT! */
}
.preview-content ul, ol {
  margin: 0.5em 0;  /* ← ADDS HEIGHT! */
}
.preview-content li {
  margin-bottom: 0.25em;  /* ← ADDS HEIGHT! */
}
```

**Example**:
- Heading with margins: 16pt font + 1em top + 0.5em bottom = 16 + 16 + 8 = 40px
- But measureDiv only measures the text (16px)
- Element appears to fit but overflows by 24px when rendered

**Fix**: Add margin reset to `measureDiv` setup:
```javascript
// In usePagination.js setupDiv (line ~189)
measureDiv.style.margin = '0 !important';  // Reset margins
measureDiv.style.padding = '0 !important';  // Reset padding

// In measurementAdapter.js:createMeasurementAdapter (line ~45)
measureDiv.style.margin = '0';
measureDiv.style.padding = '0';
```

Also update the measurement to include margins from nested elements:
```javascript
// In paginateChapters.js:209 (element measurement)
measureDiv.innerHTML = elHtml;
const elHeight = measureDiv.offsetHeight;

// ❌ Current: doesn't account for child margins
// ✅ Should wrap in margin-less container:
const wrapper = document.createElement('div');
wrapper.style.margin = '0';
wrapper.style.padding = '0';
wrapper.innerHTML = elHtml;
measureDiv.appendChild(wrapper);
const elHeight = wrapper.offsetHeight;  // Gets actual height with margins
measureDiv.removeChild(wrapper);
```

---

### 3️⃣ **HALF-CUT LAST LINE** (Insufficient Safety Margin)

**Problem**: Last line gets clipped because no safety buffer prevents content from reaching `contentHeight` exactly.

**File**: `usePagination.js:247`
```javascript
const contentHeight = Math.min(dimsOdd.contentHeight, dimsEven.contentHeight) - safetyMargin;
```

Current `safetyMargin` calculation (line ~245-246):
```javascript
const headerSpaceEstimate = safeConfig.header?.enabled ? Math.round(lineHeightPx * 1.5) : 0;
const safetyMargin = 1 + headerSpaceEstimate;  // ❌ Only 1px! Insufficient
```

**Fix**: Use proper line height buffer:
```javascript
// Safety margin = full line height (ensure last line never touches bottom)
const safetyMargin = lineHeightPx + (headerSpaceEstimate);  // ✅ Full line buffer
```

This ensures `contentHeight` leaves room for at least one full line + partial line rendering.

---

### 4️⃣ **ORPHAN/WIDOW RULES NOT ENFORCED** (Paragraph breaks alone)

**Problem**: Code checks `minOrphanLines` but doesn't prevent headings from appearing as last element.

**File**: `paginateChapters.js:307-314` (shouldBreakPage function):
```javascript
const shouldBreakPage = (el) => {
  const tag = el.tagName;
  const isList = tag === 'UL' || tag === 'OL';
  const isHeader = tag.match(/^H[1-6]$/i);
  if (isHeader || isList) return true;
  if (remainingLinesOnPage < minOrphanLines) return true;
  return false;
};
// ❌ This breaks but doesn't enforce "heading must have paragraph after"
```

**Fix**: Add heading validation rules:
```javascript
const shouldBreakPage = (el) => {
  const tag = el.tagName;
  const isList = tag === 'UL' || tag === 'OL';
  const isHeader = tag.match(/^H[1-6]$/i);

  if (isHeader || isList) return true;

  // Check orphan lines in paragraph
  if (remainingLinesOnPage < minOrphanLines) return true;

  // ✅ NEW: If only header on page and no content after it, break
  if (isHeader && !el.nextElementSibling) return true;

  return false;
};

// ✅ After pushing page, validate it doesn't end with header:
if (currentHtml) {
  const pageDiv = document.createElement('div');
  pageDiv.innerHTML = currentHtml;
  const lastEl = pageDiv.lastElementChild;

  if (lastEl && lastEl.tagName.match(/^H[1-6]$/i)) {
    // Header at end of page - move to next page
    if (childIdx < children.length - 1) {
      // More content exists, don't push this page yet
      // Let loop continue to accumulate content
      continue;
    }
  }
  pages.push({ ... });
}
```

---

### 5️⃣ **FILL PASS DOESN'T VALIDATE OVERFLOW** (Moves wrong content)

**Problem**: `applyFillPassInPlace` tests if element fits but doesn't check if page ends with orphan header.

**File**: `paginateChapters.js:528-531`
```javascript
measureDiv.innerHTML = page.html + firstElOuter;
const pageWithElHeight = measureDiv.offsetHeight;

if (pageWithElHeight <= contentHeight) {
  // ❌ Moves element but doesn't validate page constraints
```

**Fix**: Add constraint validation:
```javascript
if (pageWithElHeight <= contentHeight) {
  // Element fits - but validate page constraints first
  const testPage = document.createElement('div');
  testPage.innerHTML = page.html + firstElOuter;
  const testLastEl = testPage.lastElementChild;

  // ❌ Don't move if it creates orphan header
  const wouldEndWithHeader = testLastEl &&
    testLastEl.tagName.match(/^H[1-6]$/i) &&
    firstElOuter.match(/^<h[1-6]/i);

  if (!wouldEndWithHeader) {
    // Safe to move
    firstEl.remove();
    const restHtml = tmp.innerHTML;
    // ... move content
  }
}
```

---

### 6️⃣ **PREVIEW CSS HAS DUPLICATE RULES** (Confusing styling)

**File**: `Preview.css:167-227` - Duplicate definitions for paragraphs, headings, lists

Lines 167-206 define:
- `.preview-content p { margin: 0; padding: 0; }`
- `.preview-content h1-h6 { text-align: center; margin: 1em 0 0.5em 0; }`

Lines 208-228 define THE SAME RULES AGAIN

**Fix**: Remove lines 208-228 (duplicate CSS block)

---

### 7️⃣ **PREVIEW RENDERS PT UNITS, PAGINATION USES PT**

**Status**: ✅ ALREADY CORRECT
- `Preview.jsx:300` uses `pt` units: `fontSize * (PX_PER_INCH / 72) * previewScale`
- `usePagination.js:230` sets measureDiv to `pt`: `fontSize: \`${baseFontSize}pt\``
- Both match - NO CHANGE NEEDED

---

## Debug Mode Implementation

Add optional debug logging to `paginateChapters.js`:

```javascript
export const paginateChapters = (chapters, layoutCtx, measureDiv, safeConfig) => {
  const pages = [];
  const debug = safeConfig.debugPagination === true;

  if (debug) {
    console.log('[PAGINATION-DEBUG] Starting pagination');
    console.log('  contentHeight:', layoutCtx.contentHeight);
    console.log('  lineHeightPx:', layoutCtx.lineHeightPx);
    console.log('  minOrphanLines:', layoutCtx.minOrphanLines);
    console.log('  minWidowLines:', layoutCtx.minWidowLines);
  }

  for (let i = 0; i < chapters.length; i++) {
    processChapter(chapters[i], i, pages, layoutCtx, measureDiv, safeConfig, debug);
  }

  applyFillPassInPlace(pages, layoutCtx, measureDiv, safeConfig, debug);
  return pages;
};

// In processChapter, add logging:
if (debug) {
  console.log(`[PAGE ${pages.length + 1}]`, {
    element: el.tagName,
    elementHeight: elHeight,
    remainingSpace: contentHeight - currentHeight,
    action: 'fit' | 'overflow' | 'move-to-next'
  });
}
```

---

## Summary of Required Fixes

| Issue | File | Lines | Severity | Fix Type |
|-------|------|-------|----------|----------|
| Width reset to 1px | usePagination.js | 196 | **CRITICAL** | Set correct width BEFORE line measurement |
| Margins not included | paginateChapters.js | 209, 87 | **HIGH** | Wrap elements to capture margin height |
| Insufficient safety margin | usePagination.js | 246 | **HIGH** | Use `lineHeightPx` instead of `1px` |
| Headers at page end allowed | paginateChapters.js | 307-314 | **MEDIUM** | Validate page doesn't end with header |
| Fill pass doesn't validate | paginateChapters.js | 528 | **MEDIUM** | Check page constraints before moving |
| Duplicate CSS rules | Preview.css | 208-228 | **LOW** | Remove duplicate block |

---

## Testing Strategy

After fixes applied:
1. Paginate a book with mixed heading sizes and paragraph spacing
2. Verify no text is clipped at line bottom
3. Verify last line of page is fully visible
4. Verify no orphan headings appear
5. Check fill pass doesn't create constraint violations
6. Enable `debugPagination: true` in config to verify measurements
