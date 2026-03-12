# Testing the Underfill Fix

## Quick Test (5 minutes)

### Step 1: Reload in Browser
```bash
# If npm run dev is already running, just refresh the page (F5)
# OR start fresh:
cd editorial-app
npm run dev
```

### Step 2: Open DevTools Console
- Press **F12**
- Go to **Console** tab
- Clear previous logs (optional)

### Step 3: Load a Test Book
- Open your manuscript
- Select a chapter

### Step 4: Watch for Logs
As pagination runs, you should see:

```
[FILL-ATTEMPT] Page 1: 8 orphan lines available...
[SOFT-SPLIT-AGGRESSIVE] Accepting minor orphan/widow to avoid 58px underfill
[FILL-ATTEMPT] Page 2: 12 orphan lines available...
[FILL-MOVE] 2 ← 3: Moved <p> (447B), 74% content remains
```

The `[SOFT-SPLIT-AGGRESSIVE]` logs indicate the fix is working!

### Step 5: Visual Verification
Compare before/after:

| Aspect | Before | After |
|--------|--------|-------|
| **Page 1 fill** | ~40% (title + empty space) | ~80% (title + 1-2 paragraphs) |
| **Page density** | Many gaps throughout | Consistent 75-90% fill |
| **Console logs** | No aggressive split logs | Multiple [SOFT-SPLIT-AGGRESSIVE] lines |
| **Paragraph distribution** | Whole paragraphs on pages | Paragraphs split intelligently |

## Detailed Test

### Check Page 1 Specifically
1. Load manuscript → first chapter
2. Look at **Page 1 in preview**:
   - **Before fix**: Title + empty space below
   - **After fix**: Title + first paragraph (possibly wrapped to Page 2 start)

### Count Page Fill Percentage
```
Filled content height / Total page height * 100

Example:
- contentHeight = 600px
- Filled = 510px
- Fill % = 510/600 = 85% ✓ (good)

vs Before:
- Filled = 240px  
- Fill % = 240/600 = 40% ✗ (bad)
```

### Monitor Console Logs
1. Open Console
2. Filter by "SOFT-SPLIT" to see aggressive splits:
   ```
   [SOFT-SPLIT-AGGRESSIVE] Accepting minor orphan/widow to avoid 58px underfill
   [SOFT-SPLIT-AGGRESSIVE] Accepting minor orphan/widow to avoid 62px underfill
   [SOFT-SPLIT-AGGRESSIVE] Accepting minor orphan/widow to avoid 47px underfill
   ```

3. If you see many of these → fix is active ✓

## Troubleshooting

### I don't see [SOFT-SPLIT-AGGRESSIVE] logs
- ✓ This is OK - might mean pages were already filling well
- ✓ Or the manuscript doesn't have the specific pattern (title + long paragraph)
- ✓ Try a different chapter with more content

### Pages still look underfilled
- Check the fill-pass logs: `[FILL-ATTEMPT]` and `[FILL-MOVE]`
- If many moves happening → fill-pass is working
- If page has lots of orphan lines available → might be due to orphan/widow constraints in fill-pass
- Try adjusting `minOrphanLines` or `minWidowLines` in the preview settings

### Console shows errors
- Reload the page (F5)
- Check that build succeeded: `npm run build` should show ✓

## What to Look For

### ✅ Good Signs
- Page 1 has title + some paragraph content
- `[SOFT-SPLIT-AGGRESSIVE]` logs appear
- Page fill percentages 75-90%
- Smooth content flow across pages
- No content cutoff at page bottom

### ❌ Bad Signs  
- Page 1 still mostly empty
- No `[SOFT-SPLIT-AGGRESSIVE]` logs at all
- Pages still 40-60% filled
- Large gaps between paragraphs
- Content appearing cut off

## Results to Expect

After this fix, typical page fills should look like:

```
Page 1: [Chapter Title]
        [Paragraph 1 start - 80% fill]

Page 2: [Paragraph 1 cont.]
        [Paragraph 2 start - 75% fill]

Page 3: [Paragraph 2 cont.]
        [Paragraph 3 start - 85% fill]

Page 4: [Paragraph 3 cont.]
        [Paragraph 4 start - 70% fill]
```

Instead of the old pattern:

```
Page 1: [Chapter Title]
        [50% empty]

Page 2: [Paragraph 1 - 100% fill]

Page 3: [Paragraph 2 - 100% fill]

Page 4: [Paragraph 3 - 40% fill, mostly empty]
```

## Commands to Run

```bash
# Full rebuild (if changes don't show)
cd editorial-app
rm -rf dist node_modules/.vite
npm run build

# Run dev server
npm run dev

# Check git changes
git diff editorial-app/src/utils/paginateChapters.js
```

## Reporting Results

If you test and find issues, note:
1. Which page shows the problem
2. What the console logs show (copy-paste relevant logs)
3. Visual description (e.g., "Page 1 is 60% empty with title")
4. Book/chapter used for testing

This helps identify if the fix works in all cases or needs adjustment.

---
**Commit**: b3d5474
**File**: `editorial-app/src/utils/paginateChapters.js`
