# Pagination Logging Guide

## Overview
Strategic lightweight logging has been added to the pagination system to diagnose layout issues without the overhead of full DOM measurement. All logging is development-only and has zero impact on production builds.

## Logging Points

### 1. Fill-Pass Attempts
**Log Entry**: `[FILL-ATTEMPT] Page N: X orphan lines available (Ypx / Zpx)`

**What it shows**:
- Page number being evaluated
- Number of orphan lines (lines that can accommodate content before breaking orphan rule)
- Remaining space available (in pixels)
- Total available content height

**Why it matters**: Identifies which pages have fill capacity and how much space is available for pulling content from the next page.

**Example**:
```
[FILL-ATTEMPT] Page 5: 4 orphan lines available (58px / 600px)
```

### 2. Element Moves (Fill-Pass Success)
**Log Entry**: `[FILL-MOVE] N ← M: Moved <TAG> (XB), Y% content remains`

**What it shows**:
- Source page (N) receiving content
- Destination page (M) losing content
- HTML tag that was moved (p, h2, blockquote, etc.)
- Size of moved element in bytes
- Percentage of remaining content on destination page

**Why it matters**: Shows successful content rebalancing. If lots of moves happen, the pagination is rebalancing well. If few moves, space distribution is already optimal.

**Example**:
```
[FILL-MOVE] 5 ← 6: Moved <p> (1245B), 35% content remains
[FILL-MOVE] 5 ← 6: Moved <p> (892B), 8% content remains
[FILL-MOVE] 5 ← 7: Moved <h2> (156B), 100% content remains
```

### 3. Pages Emptied
**Log Entry**: `[FILL-EMPTY] Page N emptied (moved <TAG> from page M)`

**What it shows**:
- Page that was emptied
- The element that caused it to empty
- Source page it came from

**Why it matters**: Indicates when a page is completely drained during fill-pass. This is often the last page of a chapter being pulled up.

**Example**:
```
[FILL-EMPTY] Page 7 emptied (moved <p> from page 6)
```

### 4. Element Splits
**Log Entry**: `[SPLIT] <TAG> (XB) → parts: [A, B, C]B`

**What it shows**:
- HTML tag being split
- Original size in bytes
- Size of each split part in bytes

**Why it matters**: Shows when long paragraphs are being forcibly split across pages. High split counts suggest:
- Elements that don't fit on a page (need fontsize/margins adjustment)
- Orphan/widow rules rejecting moves that would avoid splits

**Example**:
```
[SPLIT] <p> (3450B) → parts: [1820, 1630]B
[SPLIT] <blockquote> (2100B) → parts: [950, 1150]B
```

## Interpreting Output

### Healthy Pagination Flow
```
[FILL-ATTEMPT] Page 5: 4 orphan lines available (58px / 600px)
[FILL-MOVE] 5 ← 6: Moved <p> (1245B), 35% content remains
[FILL-ATTEMPT] Page 6: 3 orphan lines available (45px / 600px)
[FILL-MOVE] 6 ← 7: Moved <p> (892B), 12% content remains
[FILL-EMPTY] Page 8 emptied (moved <p> from page 7)
```

This shows:
- Fill-pass finding space on multiple pages ✓
- Content flowing smoothly between pages ✓
- Pages draining completely as content moves up ✓
- No excessive splits ✓

### Warning Signs

**1. Low Remaining Content Percentages**
```
[FILL-MOVE] 5 ← 6: Moved <p> (1200B), 2% content remains
```
→ Almost no content left on source page; next move will empty it

**2. Many Splits on Same Element**
```
[SPLIT] <p> (3000B) → parts: [950, 950, 1100]B
```
→ Element is too large to fit on page; consider smaller fonts or larger contentHeight

**3. Fill-Pass Stops Early**
```
[FILL-ATTEMPT] Page 3: 0 orphan lines available (0px / 600px)
[FILL-ATTEMPT] Page 4: -2 orphan lines available (-12px / 600px)
```
→ Pages are underfilled; may need to adjust margins or font sizes

## Debugging Workflow

1. Load a test book with known layout issues
2. Open browser console (F12 → Console tab)
3. Trigger pagination (e.g., change font size or select different layout)
4. Watch console logs in real-time
5. Look for patterns:
   - Are pages being filled efficiently?
   - Are elements being split unnecessarily?
   - Are there large gaps or overflow?

## Enabling/Disabling Logging

Logging is automatically enabled in development mode (`npm run dev`).

To disable it temporarily, edit `src/utils/paginationLogger.js` and change:
```javascript
if (process.env.NODE_ENV === 'development') {
```
to:
```javascript
if (process.env.NODE_ENV === 'development' && false) {
```

## Performance Impact

- Development: Minimal (console.log is native browser operation)
- Production: Zero (all logging is stripped by minifier due to NODE_ENV check)

## Testing With Real Content

Next steps:
1. Run `npm run dev` in the editorial-app directory
2. Load a test book with known pagination issues
3. Open browser DevTools (F12)
4. Switch to Console tab
5. Make a change that triggers pagination (adjust font size, margins, etc.)
6. Watch the logs flow in real-time
7. Compare visual output with console diagnostics to identify discrepancies
