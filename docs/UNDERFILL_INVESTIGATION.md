# Underfill Investigation - Root Cause Analysis

## Problem
Even with aggressive soft splits, pages 1 and beyond still have underfill (though improved).

## Hypothesis
The `contentHeight` calculation in `usePagination.js` is theoretical and doesn't account for actual CSS rendering:

### Current Calculation (Line 248, usePagination.js):
```javascript
const contentHeight = Math.min(dimsOdd.contentHeight, dimsEven.contentHeight) - safetyMargin;
```

Where:
- `dimsOdd.contentHeight` = `pageHeightPx - marginTop - marginBottom` (theoretical)
- `safetyMargin` = `lineHeightPx + headerSpaceEstimate`
- `headerSpaceEstimate` = `lineHeightPx * 1.5` (if headers enabled)

### Issues:
1. **No padding measurement**: CSS padding on `.preview-page` not counted
2. **No actual header height**: Using estimate instead of actual rendered height
3. **No page number space**: `.page-number` element not measured
4. **No flex layout effects**: CSS layout may reduce available space
5. **Scale-dependent calculations**: Different at previewScale 0.42 vs actual

## Example Numbers (A5, previewScale 0.42)

### Theoretical (Current):
- Page height: 600px
- Margins top/bottom: ~30px each
- Theoretical contentHeight: 600 - 30 - 30 = 540px
- With headerSpaceEstimate (1.5 * 8px lineHeight = 12px): 528px

### Actual (In DOM):
- Page height: 600px
- Padding (from CSS): varies
- Rendered header: actual ~15-20px
- Page number: ~15px
- Available for text: ~480-500px

**Difference: ~40-50px LOST!** (~7-9% of page)

## Solution
Instead of estimating, **measure the actual available space**:

1. Render first page with minimal content
2. Measure actual occupied space in DOM
3. Calculate real `contentHeight` from actual measurements
4. Adjust future page calculations accordingly

## Files Involved
- `src/hooks/usePagination.js` - contentHeight calculation (line 248)
- `src/utils/textMeasurer.js` - calculateContentDimensions (line 63)
- `src/components/Preview/Preview.jsx` - rendering with padding/margins
- `src/components/Preview/Preview.css` - `.preview-page`, `.preview-content` styles

## Why Aggressive Soft Splits Helped But Didn't Fully Solve
- Fix #8 relaxed constraints for 40-50px underfill
- But the root cause (~40-50px lost to measurements) remained
- Result: Pages improved from 40-60% fill to 70-80%
- But not achieving theoretical 90%+

## Next Fix Needed
Implement **actual DOM measurement** of available space instead of theoretical calculation.
