# Quick Test Guide - Pagination Fixes

## 🚀 Start Here

```bash
# Terminal 1: Start dev server
npm run dev
# → Opens on http://localhost:5174

# Browser: Open DevTools
F12 → Console tab
```

## ✅ What to Test

### 1. **No Content Cutoff** (Fix #1 - Most Critical)
- Load a book → Preview a page with chapter title + body text
- **Check**: Last line of text visible (not cut off at bottom)
- **Expected**: Content fits within page bounds
- **Console**: Look for `[PAGINATION-SETUP]` showing `safetyMargin=16px`

### 2. **No Unnecessary Splits** (Fix #1)
- Find a paragraph that fits on one page in the original text
- **Check**: Paragraph stays on one page (not split unnecessarily)
- **Expected**: Paragraph stays together if it fits
- **Console**: No `[PAGINATION-SPLIT]` for paragraphs that fit

### 3. **No Blank Pages** (Fix #4)
- Scroll through preview, looking for white/blank pages mid-chapter
- **Check**: No white pages between content pages
- **Expected**: Only content pages shown
- **Console**: Pages without content should show `isBlank: true` logs

### 4. **Proper Subheader Spacing** (Fix #3)
- Look for subheaders (H2, H3, etc.) mid-chapter
- **Check**: Space below subheader is proportional (not huge gaps)
- **Expected**: Natural spacing, not 2-3 line gaps
- **Console**: Look for `[PAGINATION-SETUP]` showing correct margin calculations

### 5. **Correct Paragraph Indent** (Fix #5a, #5b)
- Look at first paragraph of new pages
- **Check**: First line is indented (starts with space)
- **Expected**: First paragraphs show text-indent
- **Continuation**: Split paragraphs on continuation pages should NOT have double indent

## 🔍 Console Debugging

### Look for these logs (in order):

```
[PAGINATION-SETUP]
- previewScale, baseFontSize, lineHeightPx, contentHeight
- safetyMargin should be ~16px (not 1px!)

[CHAPTER-LAYOUT]
- Title placement decisions
- "title+content on same page" or "title-only page"

[PAGINATION-BREAK]
- Why pages are being closed (header/list/orphan)
- Should show reasonable currentHeight values

[PAGINATION-SPLIT]
- Orphan/widow line counts
- orphan=2, widow=2 (or higher) = good
```

### Bad Signs (Should NOT See):

```
❌ [ALGORITHM] Balance issue detected - reverting move
   (repeated 100+ times = infinite loop bug - FIXED in this session)

❌ No [PAGINATION-SETUP] log
   (pagination not running or hooks not working)

❌ safetyMargin=1 (instead of 16)
   (Fix #1 didn't apply)

❌ Content overflow warnings in console
   (Safety margin still too small)
```

## 📊 Use Diagnostic Tool

Once pagination completes, run in console:

```javascript
// Import the debugger (if not already)
import { paginationDebugger } from './paginationDebugger.js';

// Analyze all pages
const result = paginationDebugger.analyzePages(
  window.paginatedPages,  // Assuming stored in store
  265,  // contentHeight
  8     // lineHeightPx
);

// Result will show:
// - Total pages, blank pages
// - Overflow issues count
// - Orphan header issues count
// - Average page height
```

## 🎯 Success Criteria

All of these should be TRUE:

- [ ] Content NOT cut off at page bottom
- [ ] Paragraphs that fit DON'T split unnecessarily
- [ ] NO white/blank pages mid-chapter
- [ ] Subheader spacing is proportional
- [ ] First paragraphs show indent
- [ ] Console shows NO repeated "Balance issue" messages
- [ ] `[PAGINATION-SETUP]` log appears with `safetyMargin=16px` (or similar)
- [ ] Pagination completes quickly (< 1 second)

## 🐛 If Issues Persist

### Content Still Cut Off?
- Check `[PAGINATION-SETUP]` log for `safetyMargin` value
- Should be `~16px` (lineHeightPx + headerSpace)
- If showing `1px`, Fix #1 didn't apply

### Still Getting "Balance Issue" Loop?
- Check console for repeated `[ALGORITHM] Balance issue detected`
- Fix #7 should have disabled this
- If repeating, check that paginateChapters.js lines 597-621 have balance check disabled

### Paragraphs Still Splitting Unnecessarily?
- Verify `contentHeight` is calculated with safety margin
- Check that `shouldBreakPage()` guard logic is working
- Look at `[PAGINATION-BREAK]` logs to understand break decisions

### Still Seeing Blank Pages?
- Check if they have `isBlank: true` property
- If not, Fix #4 didn't apply to that page
- Look for pages with `html: ''` but `isBlank: false`

---

## 📋 File References

Key files for debugging:
- `src/hooks/usePagination.js:247` — Safety margin (Fix #1)
- `src/utils/paginateChapters.js:325-374` — Algorithm 3 removal (Fix #2)
- `src/utils/paginateChapters.js:597-621` — Balance check disable (Fix #7)
- `src/utils/paginationEngine.js:293` — LineHeight calc (Fix #3)
- `src/utils/paginationDebugger.js` — Diagnostic tool (new)

---

## ✨ Expected Behavior

A properly paginated book should:
1. Fill pages efficiently (80-95% full on average)
2. Never cut off text at the bottom
3. Break pages only when necessary (headers, orphan rules)
4. Show proper indent on first paragraphs
5. Have minimal blank pages (only when necessary)
6. Complete pagination in < 1 second

**Ready to test? Load a book and check the preview!** 📚
