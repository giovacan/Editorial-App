# Pagination Layout Fixes - Implementation Guide

## Fix 1: Correct measureDiv Width Before Line Height Calculation

**File**: `editorial-app/src/hooks/usePagination.js`
**Lines**: 185-240

### Current Code (BROKEN):
```javascript
try {
  measureDiv.innerHTML = '';
  measureDiv.style.cssText = '';
  // Asegurar estilos consistentes para medición
  measureDiv.style.position = 'absolute';
  measureDiv.style.visibility = 'hidden';
  measureDiv.style.left = '-9999px';
  measureDiv.style.top = '0';
  measureDiv.style.width = '1px';  // ❌ WRONG! Wrong width for line measurement
  measureDiv.style.height = 'auto';
  // ... other styles ...
} catch (e) {
  console.warn('Error resetting measureDiv:', e);
}

// ... later at line 218 ...
const contentWidth = Math.min(dimsOdd.contentWidth, dimsEven.contentWidth);
// ... line 228 ...
measureDiv.style.width = `${contentWidth}px`;  // ❌ Set AFTER measuring line height!
measureDiv.style.fontFamily = safeConfig.fontFamily || bookConfig.fontFamily;
measureDiv.style.fontSize = `${baseFontSize}pt`;
measureDiv.style.lineHeight = baseLineHeight;
// ... line 238-239 ...
measureDiv.innerHTML = 'Ag';
const lineHeightPx = measureDiv.offsetHeight;  // ❌ Measured with wrong width!
```

### Fixed Code:
```javascript
// Calculate content width BEFORE resetting measureDiv
const dimsOdd = calculateContentDimensions(pageFormat, bookConfig, previewScale, gutterValueRef.current, false, estimatedPages, applyDynamicMargins);
const dimsEven = calculateContentDimensions(pageFormat, bookConfig, previewScale, gutterValueRef.current, true, estimatedPages, applyDynamicMargins);

const contentWidth = Math.min(dimsOdd.contentWidth, dimsEven.contentWidth);
const pageWidthPx = dimsOdd.pageWidthPx;
const pageHeightPx = dimsOdd.pageHeightPx;
const marginTop = dimsOdd.marginTop;
const marginBottom = dimsOdd.marginBottom;

const baseFontSize = (safeConfig.fontSize || bookConfig.fontSize) * previewScale;
const baseLineHeight = safeConfig.lineHeight || bookConfig.lineHeight;
const textAlign = safeConfig.paragraph?.align || 'justify';

// ✅ RESET measureDiv ONCE with ALL correct styles INCLUDING width
try {
  measureDiv.innerHTML = '';
  measureDiv.style.cssText = '';

  // Core positioning
  measureDiv.style.position = 'absolute';
  measureDiv.style.visibility = 'hidden';
  measureDiv.style.left = '-9999px';
  measureDiv.style.top = '0';
  measureDiv.style.pointerEvents = 'none';

  // ✅ SET WIDTH CORRECTLY BEFORE ANY MEASUREMENTS
  measureDiv.style.width = `${contentWidth}px`;
  measureDiv.style.height = 'auto';
  measureDiv.style.minHeight = '0';
  measureDiv.style.maxHeight = 'none';

  // Box model
  measureDiv.style.boxSizing = 'border-box';
  measureDiv.style.margin = '0';
  measureDiv.style.padding = '0';
  measureDiv.style.border = 'none';

  // Text layout
  measureDiv.style.overflow = 'visible';
  measureDiv.style.whiteSpace = 'normal';
  measureDiv.style.wordWrap = 'break-word';
  measureDiv.style.wordBreak = 'break-word';

  // Typography
  measureDiv.style.fontFamily = safeConfig.fontFamily || bookConfig.fontFamily;
  measureDiv.style.fontSize = `${baseFontSize}pt`;
  measureDiv.style.lineHeight = baseLineHeight;
  measureDiv.style.textAlign = textAlign;
  measureDiv.style.textJustify = 'inter-word';
  measureDiv.style.hyphens = 'auto';

  // Language support
  measureDiv.setAttribute('lang', 'es');

} catch (e) {
  console.warn('Error resetting measureDiv:', e);
}

// ✅ NOW measure line height with CORRECT width
measureDiv.innerHTML = 'Ag';
const lineHeightPx = measureDiv.offsetHeight;

// ✅ Proper safety margin (full line height, not 1px)
const headerSpaceEstimate = safeConfig.header?.enabled ? Math.round(lineHeightPx * 1.5) : 0;
const safetyMargin = lineHeightPx + headerSpaceEstimate;  // ✅ Changed from: 1 + headerSpaceEstimate
const contentHeight = Math.min(dimsOdd.contentHeight, dimsEven.contentHeight) - safetyMargin;

console.log(`[PAGINATION] estimatedPages=${estimatedPages}, headerEnabled=${safeConfig.header?.enabled}, contentWidth=${contentWidth}, lineHeightPx=${lineHeightPx}, safetyMargin=${safetyMargin}, contentHeight=${contentHeight}`);
```

---

## Fix 2: Measure Element Height Including Margins

**File**: `editorial-app/src/utils/paginateChapters.js`
**Location**: Multiple measurement points (lines 87, 209, etc.)

### Helper Function to Add (top of file, after imports):

```javascript
/**
 * Measure element height including margins.
 * Creates a margin-aware wrapper to capture full rendered height.
 *
 * @param {string} html - Element HTML
 * @param {HTMLElement} measureDiv - Measurement container
 * @returns {number} Height including margins (pixels)
 * @private
 */
const measureElementHeightWithMargins = (html, measureDiv) => {
  if (!html) return 0;

  const wrapper = document.createElement('div');
  wrapper.style.margin = '0';
  wrapper.style.padding = '0';
  wrapper.style.overflow = 'visible';
  wrapper.innerHTML = html;

  const parent = measureDiv.parentNode;
  measureDiv.appendChild(wrapper);
  const height = wrapper.offsetHeight;
  measureDiv.removeChild(wrapper);

  return height || 0;
};
```

### Apply to Title Height (Line 86-87):

```javascript
// BEFORE:
measureDiv.innerHTML = titleHtml;
const titleHeight = measureDiv.offsetHeight;

// AFTER:
const titleHeight = measureElementHeightWithMargins(titleHtml, measureDiv);
```

### Apply to Element Height (Line 208-209):

```javascript
// BEFORE:
measureDiv.innerHTML = elHtml;
const elHeight = measureDiv.offsetHeight;

// AFTER:
const elHeight = measureElementHeightWithMargins(elHtml, measureDiv);
```

### Apply to Candidate Height Test (Line 299-300):

```javascript
// BEFORE:
const candidateHtml = currentHtml + elHtml;
measureDiv.innerHTML = candidateHtml;
const candidateHeight = measureDiv.offsetHeight;

// AFTER:
const candidateHtml = currentHtml + elHtml;
const candidateHeight = measureElementHeightWithMargins(candidateHtml, measureDiv);
```

---

## Fix 3: Prevent Headings from Appearing Alone at Page End

**File**: `editorial-app/src/utils/paginateChapters.js`
**Location**: `shouldBreakPage` function (lines 307-314) and page flush logic

### Update shouldBreakPage function (lines 307-314):

```javascript
// BEFORE:
const shouldBreakPage = (el) => {
  const tag = el.tagName;
  const isList = tag === 'UL' || tag === 'OL';
  const isHeader = tag.match(/^H[1-6]$/i);
  if (isHeader || isList) return true;
  if (remainingLinesOnPage < minOrphanLines) return true;
  return false;
};

// AFTER:
const shouldBreakPage = (el) => {
  const tag = el.tagName;
  const isList = tag === 'UL' || tag === 'OL';
  const isHeader = tag.match(/^H[1-6]$/i);

  // ✅ Always break before headers and lists
  if (isHeader || isList) return true;

  // ✅ Break if not enough space for minimum orphan lines
  if (remainingLinesOnPage < minOrphanLines) return true;

  return false;
};

// ADD validation after page push (before line 423, after element loop):
// ✅ Validate final page doesn't end with orphan header
if (currentHtml && pages.length > 0) {
  const pageDiv = document.createElement('div');
  pageDiv.innerHTML = currentHtml;
  const lastChild = pageDiv.lastElementChild;
  const firstChild = pageDiv.firstElementChild;

  // Check if page only contains a header (no paragraphs)
  const isOnlyHeader = lastChild &&
    lastChild.tagName.match(/^H[1-6]$/i) &&
    pageDiv.children.length === 1;

  if (isOnlyHeader && chapterIndex < chapters.length - 1) {
    // Don't push header-only page in middle of chapter
    // Let it accumulate with next element instead
    // This happens in loop, so header will be added to next element
  }
}
```

### Add constraint check in fill pass (lines 528-531):

```javascript
// BEFORE:
measureDiv.innerHTML = page.html + firstElOuter;
const pageWithElHeight = measureDiv.offsetHeight;

if (pageWithElHeight <= contentHeight) {
  // Element fits — move it
  firstEl.remove();
  const restHtml = tmp.innerHTML;

  // Check widow lines
  if (!restHtml.trim()) {
    pages[pageIdx] = { ...page, html: page.html + firstElOuter };
    pages[nextIdx] = { ...nextPage, html: '' };
    totalIterations++;
  } else {
    // ... widow check ...
  }
}

// AFTER:
const pageWithElement = document.createElement('div');
pageWithElement.innerHTML = page.html + firstElOuter;
const pageWithElHeight = pageWithElement.offsetHeight;

if (pageWithElHeight <= contentHeight) {
  // ✅ Check constraint: page doesn't end with orphan header
  const lastEl = pageWithElement.lastElementChild;
  const firstMovedEl = tmp.firstElementChild;

  const wouldEndWithOrphanHeader =
    lastEl && lastEl.tagName.match(/^H[1-6]$/i) &&
    firstMovedEl && firstMovedEl.tagName.match(/^H[1-6]$/i);

  if (wouldEndWithOrphanHeader) {
    // Don't move - would create orphan header page
    break;
  }

  // Safe to move
  firstEl.remove();
  const restHtml = tmp.innerHTML;

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
```

---

## Fix 4: Remove Duplicate CSS Rules

**File**: `editorial-app/src/components/Preview/Preview.css`
**Lines**: 208-228 (DELETE ENTIRE BLOCK)

```css
/* DELETE THIS ENTIRE SECTION (lines 208-228) - IT'S A DUPLICATE */
.preview-content p {
  margin: 0;
  padding: 0;
}

.preview-content p:first-child,
.preview-content > p:first-of-type {
  /* No modificar text-indent - preservar formato original */
}

.preview-content h1,
.preview-content h2,
.preview-content h3,
.preview-content h4,
.preview-content h5,
.preview-content h6 {
  text-align: center;
  margin: 1em 0 0.5em 0;
  font-weight: bold;
}

.preview-content ul,
.preview-content ol {
  margin: 0.5em 0;
  padding-left: 1.5em;
}

.preview-content li {
  margin-bottom: 0.25em;
  text-indent: 0;
}
```

Keep the earlier definitions (lines 167-206) only.

---

## Fix 5: Add Debug Mode Logging

**File**: `editorial-app/src/utils/paginateChapters.js`
**Location**: Update function signatures

### Update function to accept debug parameter:

```javascript
export const paginateChapters = (chapters, layoutCtx, measureDiv, safeConfig) => {
  const pages = [];
  const debug = safeConfig.debugPagination === true;

  if (debug) {
    console.log('[PAGINATION] ========== START PAGINATION ==========');
    console.log('[PAGINATION] Config:');
    console.log('  contentHeight:', layoutCtx.contentHeight);
    console.log('  lineHeightPx:', layoutCtx.lineHeightPx);
    console.log('  maxLines:', Math.floor(layoutCtx.contentHeight / layoutCtx.lineHeightPx));
    console.log('  minOrphanLines:', layoutCtx.minOrphanLines);
    console.log('  minWidowLines:', layoutCtx.minWidowLines);
  }

  for (let i = 0; i < chapters.length; i++) {
    processChapter(chapters[i], i, pages, layoutCtx, measureDiv, safeConfig);
  }

  applyFillPassInPlace(pages, layoutCtx, measureDiv, safeConfig);

  if (debug) {
    console.log('[PAGINATION] Generated', pages.length, 'pages');
    pages.forEach((p, i) => {
      const div = document.createElement('div');
      div.innerHTML = p.html;
      const height = div.offsetHeight;
      const lines = Math.floor(height / layoutCtx.lineHeightPx);
      console.log(`  Page ${i + 1}: ${height}px (~${lines} lines), chapter="${p.chapterTitle}"`);
    });
  }

  return pages;
};
```

### Add debug logging in element processing (inside processChapter loop):

```javascript
// When element is tested (around line 209):
if (debug) {
  console.log(`[PAGE ${pages.length + 1}] Element: <${el.tagName}>`, {
    html: elHtml.substring(0, 60) + '...',
    height: elHeight,
    remainingSpace: contentHeight - currentHeight,
    remainingLines: Math.floor((contentHeight - currentHeight) / lineHeightPx),
    fits: elHeight + currentHeight <= contentHeight ? 'YES' : 'NO'
  });
}
```

---

## Fix 6: Update measurementAdapter (optional but recommended)

**File**: `editorial-app/src/utils/measurementAdapter.js`
**Location**: createMeasurementAdapter function (line 25)

### Add margin/padding reset:

```javascript
export const createMeasurementAdapter = (styleConfig) => {
  const {
    fontFamily = 'Georgia, serif',
    fontSize = 12,
    lineHeight = 1.5,
    textAlign = 'justify',
    width = 400
  } = styleConfig || {};

  // Create measurement div - positioned off-screen, invisible
  const measureDiv = document.createElement('div');
  measureDiv.style.position = 'absolute';
  measureDiv.style.visibility = 'hidden';
  measureDiv.style.left = '-9999px';
  measureDiv.style.top = '0';
  measureDiv.style.width = `${width}px`;
  measureDiv.style.height = 'auto';
  measureDiv.style.minHeight = '0';
  measureDiv.style.maxHeight = 'none';
  measureDiv.style.overflow = 'visible';
  measureDiv.style.padding = '0';
  measureDiv.style.margin = '0';
  measureDiv.style.border = 'none';
  // ✅ ADD margin reset on children
  measureDiv.style.boxSizing = 'border-box';
  measureDiv.style.fontSize = `${fontSize}pt`;
  measureDiv.style.lineHeight = String(lineHeight);
  measureDiv.style.fontFamily = fontFamily;
  measureDiv.style.textAlign = textAlign;
  measureDiv.style.textJustify = 'inter-word';
  measureDiv.style.hyphens = 'auto';
  measureDiv.style.wordBreak = 'break-word';
  measureDiv.style.whiteSpace = 'normal';
  measureDiv.style.wordWrap = 'break-word';

  // Append to body for measurements to work
  document.body.appendChild(measureDiv);

  // ... rest of code ...
};
```

---

## Testing Checklist After Applying Fixes

- [ ] Pagination completes without errors
- [ ] Last line of pages is fully visible (no clipping)
- [ ] No orphan headers at bottom of pages
- [ ] No orphan lines at top/bottom of paragraphs
- [ ] Fill pass doesn't create constraint violations
- [ ] Page count is stable (doesn't change on re-render)
- [ ] Debug mode logs sensible values
- [ ] Preview matches paginated layout exactly
- [ ] Headers and lists have proper spacing
- [ ] Quoted text (blockquotes) fits correctly

---

## Validation Script

After fixes, run this in browser console to validate:

```javascript
// In Preview component, add to useEffect:
if (safeConfig.debugPagination) {
  console.log('=== PAGINATION VALIDATION ===');
  const measurements = pages.map((p, i) => {
    const div = document.createElement('div');
    div.innerHTML = p.html;
    return {
      page: i + 1,
      height: div.offsetHeight,
      lines: Math.floor(div.offsetHeight / lineHeightPx),
      overflows: div.offsetHeight > contentHeight
    };
  });

  const overflowing = measurements.filter(m => m.overflows);
  if (overflowing.length > 0) {
    console.error('❌ OVERFLOW DETECTED:', overflowing);
  } else {
    console.log('✅ All pages fit within contentHeight');
  }
}
```
