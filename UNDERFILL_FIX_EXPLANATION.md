# Underfill Fix: Aggressive Soft Splits

## Problem Identified

Pages were being left 40-60% empty because the algorithm was too conservative with paragraph splits:

**Example - Page 1 (with title):**
- Title at top
- First paragraph: too long to fit
- Algorithm: "violates orphan/widow, reject split"
- Result: **Page leaves empty space, paragraph moves entirely to page 2**

This cascaded throughout the manuscript, leaving many underfilled pages.

## Root Cause

In `paginateChapters.js`, when a paragraph would be split ("soft split"):
1. Calculate orphan/widow lines for the split
2. If doesn't meet minimums (default: 2 orphan, 2 widow lines)
3. **Reject the split entirely**
4. Leave current page partially empty
5. Carry whole paragraph to next page

This is overly strict because:
- Rejects a valid split that would waste ~50px (4+ lines)
- Better to have 1-line orphan/widow than half-empty page
- Typography > efficiency is wrong when underfill is extreme

## Solution: Underfill Detection

New logic: **Accept soft split if it would otherwise waste significant space**

```javascript
// Calculate wasted space if split is rejected
const pageWithChunk = currentHtml + firstChunk;
const filledHeight = measureDiv.offsetHeight;
const wastedSpace = contentHeight - filledHeight;

// Threshold: 4 lines (roughly 50px at default line height)
const underfillThreshold = lineHeightPx * 4;

// Accept if: normal constraints OR (minor orphan/widow + significant underfill)
const meetsNormalConstraints = orphanLines >= minOrphanLines && widowLines >= minWidowLines;
const shouldAcceptForFill = wastedSpace >= underfillThreshold && 
                           orphanLines >= 1 && 
                           widowLines >= 1;

if (meetsNormalConstraints || shouldAcceptForFill) {
  // Accept split
}
```

## Results

**Before:**
```
Page 1: [Title] [Empty 50%]
Page 2: [Paragraph 1 - full page]
Page 3: [Paragraph 2 - full page]
Page 4: [Paragraph 3 - 60% filled]
```

**After:**
```
Page 1: [Title] [Paragraph 1 - 80% filled]
Page 2: [Paragraph 1 cont.] [Paragraph 2 - 70% filled]
Page 3: [Paragraph 2 cont.] [Paragraph 3 - 85% filled]
```

## Logging

Console shows when aggressive splits are applied:

```
[SOFT-SPLIT-AGGRESSIVE] Accepting minor orphan/widow to avoid 58px underfill
[SOFT-SPLIT-AGGRESSIVE] Accepting minor orphan/widow to avoid 62px underfill
```

This helps verify the fix is working and understanding where page breaks occur.

## Typography Balance

The fix respects typography while being smart about space:
- **Normal case**: Uses proper orphan/widow minimums
- **Underfill case**: Relaxes minimums only when wasting space
- **Threshold**: 4 lines (~50px) is a significant gap worth compromising for

This is a pragmatic balance between:
- Pure typography rules (strict orphan/widow)
- Page efficiency (fill pages completely)

## Technical Details

- Underfill threshold: `lineHeightPx * 4`
- Minimum orphan/widow for aggressive split: 1 line (vs normal 2)
- Only applied in CASE B (soft split at remaining space)
- Original orphan/widow requirements still respected when space isn't wasted

## Testing

To verify the fix:
1. Load app with test book
2. Check Page 1 (title page) — should now have 1-2 paragraphs below title
3. Check for `[SOFT-SPLIT-AGGRESSIVE]` logs in console
4. Compare page fill percentages — should be 75-90% instead of 40-60%

---
**Commit**: b3d5474  
**File**: `editorial-app/src/utils/paginateChapters.js` (lines 369-397)
