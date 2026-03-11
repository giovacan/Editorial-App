# Quick Test Guide: Pagination Logging

## Start Dev Server
```bash
cd editorial-app
npm run dev
```

## Open Test Book
1. Open app in browser (usually http://localhost:5173)
2. Navigate to your test book
3. Open browser DevTools: **F12**
4. Go to **Console** tab

## Trigger Pagination
Choose any of these to trigger pagination:
- Change **Font Size** slider
- Change **Line Height** slider  
- Change **Margins** sliders
- Change **Page Format** (Letter, A4, etc.)
- Change **Orientation** (Portrait/Landscape)
- Toggle **Columns** option
- Load a different chapter

## Watch Logs Appear
As pagination runs, you'll see logs like:
```
[FILL-ATTEMPT] Page 5: 4 orphan lines available (58px / 600px)
[FILL-MOVE] 5 ← 6: Moved <p> (1245B), 35% content remains
[SPLIT] <p> (3450B) → parts: [1820, 1630]B
```

## Interpretation Checklist

### ✓ Healthy Signs
- [ ] Multiple `[FILL-ATTEMPT]` logs (pages being evaluated)
- [ ] Several `[FILL-MOVE]` logs (content flowing smoothly)
- [ ] `[FILL-EMPTY]` when page drained (last element moved)
- [ ] Few or no `[SPLIT]` logs (minimal unnecessary splits)
- [ ] Remaining percentages 20-80% (pages not too empty or full)

### ⚠️ Warning Signs
- [ ] No `[FILL-MOVE]` logs (fill-pass not working)
- [ ] Many `[SPLIT]` logs (elements too large)
- [ ] `[FILL-MOVE]` with 1-5% remaining (almost empty next page)
- [ ] No `[FILL-ATTEMPT]` beyond page 3 (early termination)
- [ ] Visual gaps don't match log activity

## Performance Check
- Logs should appear instantly (< 100ms for whole book)
- No console errors
- Preview updates smoothly

## Visual vs Console Verification

| Issue | Console Log | Visual Check |
|-------|------------|--------------|
| Content overflow | No splits, high remainingSpace → high fill %, but visual gap | Content cut at bottom |
| Unnecessary splits | Many `[SPLIT]` logs | Large gaps between paragraphs |
| Blank pages | `[FILL-EMPTY]` mid-chapter | White pages in middle of chapter |
| Poor fill | High remaining % on all pages | Large gaps on pages |

## Next Steps
If you see discrepancies:
1. Note which page shows the issue
2. Check what logs appear for that page
3. Compare visual vs console numbers
4. This reveals if calculations match reality

## Quick Disable/Enable
To temporarily disable logging, add this to console:
```javascript
// Disable
window.disablePaginationLogging = true;

// Re-enable  
window.disablePaginationLogging = false;
```

---
**Commit**: b9900f8  
**Files Modified**: `paginateChapters.js` + `paginationLogger.js` (new)
