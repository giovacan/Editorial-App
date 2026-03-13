# Pagination Refactoring Strategy

## Overview

The pagination system in `usePagination.js` is currently **1051 lines of inline logic**. Instead of attempting a mass refactor, we're extracting functionality **gradually and safely** in 4 phases.

## Status

- **Phase 1**: ✅ COMPLETE - Extract simple pure utilities
- **Phase 2**: ⏳ PLANNED - Extract fill pass as independent module
- **Phase 3**: ⏳ PLANNED - Isolate measurement in wrapper
- **Phase 4**: ⏳ PLANNED - Evaluate pure pagination engine

## Phase 1: Simple Pure Utilities ✅

**Completed**: `simplePageUtils.js` + `simplePageUtils.test.js`

### What Was Extracted

20+ utility functions with ZERO dependencies:

#### Page Creation
- `createBlankPage(pageNumber, chapterTitle)` → blank page object
- `createContentPage(html, pageNumber, chapterTitle, ...)` → content page object

#### Space Calculations
- `calculateFittingLines(spacePixels, lineHeightPixels)` → complete lines that fit (uses Math.floor)
- `getRemainingSpace(totalSpace, usedSpace)` → remaining space (never negative)
- `contentFits(contentHeight, availableSpace)` → boolean check

#### Page Analysis
- `isPageEmpty(page)` → true if blank or no content
- `getPageCount(pages)` → array length (with null safety)
- `isEvenPage(pageNumber)` → boolean
- `isOddPage(pageNumber)` → boolean

#### Element Type Detection
- `isHeading(el)` → matches H1-H6
- `isParagraph(el)` → P tag
- `isList(el)` → UL or OL
- `isBlockquote(el)` → BLOCKQUOTE tag
- `getHeadingLevel(el)` → 1-6 or null

#### Block Operations
- `calculateTotalHeight(blocks)` → sum of measuredHeight
- `countLines(blocks)` → sum of lineCount
- `shouldChapterStartOnRight(index, rule)` → chapter positioning rule

#### Text Operations
- `formatPageNumber(pageNumber, prefix)` → formatted page number
- `estimateContentLength(html)` → rough char count
- `truncateText(text, maxLength, ellipsis)` → truncated with ellipsis

### Testing

Full test suite with 40+ test cases included in `simplePageUtils.test.js`:

```javascript
describe('simplePageUtils', () => {
  // Tests for each function
  // Can be run with: vitest run src/utils/simplePageUtils.test.js
});
```

### Safety Guarantees

1. **Zero dependencies** - Can be used anywhere without circular imports
2. **Pure functions** - No side effects, no React, no DOM access
3. **No config objects** - All parameters are primitives or arrays of objects
4. **Testable** - Comprehensive test suite ready to run
5. **Build safe** - No memory issues, adds only ~12KB to bundle

## Phase 2: Fill Pass Module (PLANNED)

**Goal**: Extract `applyFillPass()` function as independent module

**Strategy**:
1. Create `fillPassEngine.js`
2. Accept pre-generated pages array (from current processChapter)
3. Apply fill-pass logic (moving blocks between pages)
4. Return modified pages array
5. Keep as pure function - no React, no state

**Key consideration**: Will still use `simplePageUtils` from Phase 1

## Phase 3: Measurement Wrapper (PLANNED)

**Goal**: Isolate DOM measurement operations

**Strategy**:
1. Create `measurementWrapper.js`
2. Encapsulate measureDiv creation/cleanup
3. Provide simple `measure(html)` → number API
4. Keep lifecycle management but expose clean interface
5. Can eventually be replaced with MeasurementAdapter v2

**Key consideration**: Will be used by both old processChapter and future pure engine

## Phase 4: Pure Pagination Engine (PLANNED)

**Goal**: Create pure `paginate()` function

**Prerequisite**: Phases 1-3 must be complete

**Strategy**:
1. Only after 70% of logic is extracted
2. Use simpler architecture (no frozen contexts, no complex types)
3. Combine: fillPassEngine + measurementWrapper + page utilities
4. Replace inline processChapter + applyFillPass with single call
5. Validate: same page output as current system

**Safety net**: Old system still available for rollback

## Why This Approach Works

### Problems with Previous Attempt

- ❌ Tried to do everything at once (8 phases, complex types)
- ❌ Created frozen LayoutContext with many derived fields
- ❌ TypeScript complexity caused esbuild memory exhaustion
- ❌ Circular dependencies between modules

### This Approach Solves These

- ✅ Small, focused extracton (1 file, 20 functions)
- ✅ Zero configuration objects
- ✅ Pure JavaScript (simple types)
- ✅ No complex dependencies
- ✅ Each phase is independently testable
- ✅ Can stop at any phase if issues arise

## Integration Checkpoints

After each phase, verify:

1. **Builds successfully** - `npm run build` completes without errors
2. **No bundle bloat** - Size doesn't jump unexpectedly
3. **Tests pass** - New functionality is testable
4. **No circular deps** - Module can be imported cleanly
5. **Documentation** - Updates to this file and comments

## Timeline Estimate

- Phase 1 ✅: **1 session** - DONE
- Phase 2 ⏳: **1 session** - Extract fill pass
- Phase 3 ⏳: **1 session** - Isolate measurement
- Phase 4 ⏳: **2 sessions** - Create and integrate pure engine

**Total**: ~5 sessions for full refactoring (if no blockers)

## Rollback Plan

If any phase causes issues:

1. Revert commit: `git revert <hash>`
2. Keep previous phases (non-breaking)
3. Revisit approach for that phase
4. Try different extraction strategy

The key: **each phase builds on previous, but is independent**.

## Current Files

- `src/utils/simplePageUtils.js` (194 lines, 20 functions)
- `src/utils/simplePageUtils.test.js` (320 lines, 40+ tests)
- `src/hooks/usePagination.js` (1051 lines, unchanged for now)

## Next Actions

1. Use `simplePageUtils` in new code (where applicable)
2. Plan Phase 2: Fill pass extraction
3. Monitor for performance/bundle size impact
