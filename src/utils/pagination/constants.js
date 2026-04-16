/**
 * constants.js
 *
 * Shared constants, module-level state (via getter/setter), and pure policy helpers
 * extracted from paginateChapters.js.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Module-level mutable state — exported via getter/setter so all modules
// share a single instance of the value even after tree-shaking.
// ─────────────────────────────────────────────────────────────────────────────

// Canvas↔DOM height delta (set once per pagination run from lineHeightPx).
let _DOM_SLACK = 0;
export const getDomSlack = () => _DOM_SLACK;
export const setDomSlack = (val) => { _DOM_SLACK = val; };

// Per-run quality-scoring cache — cleared at the start of each paginateChapters() call.
let _evalCache = new Map();
let _evalCacheHits = 0;
let _evalCacheMisses = 0;

export const getEvalCache    = () => _evalCache;
export const getEvalCacheHits   = () => _evalCacheHits;
export const getEvalCacheMisses = () => _evalCacheMisses;

export const setEvalCache    = (v) => { _evalCache = v; };
export const setEvalCacheHits   = (v) => { _evalCacheHits = v; };
export const setEvalCacheMisses = (v) => { _evalCacheMisses = v; };
export const incEvalCacheHits   = () => { _evalCacheHits++; };
export const incEvalCacheMisses = () => { _evalCacheMisses++; };

// ─────────────────────────────────────────────────────────────────────────────
// Shared constants
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_REPAIR_PRIORITY = ['widow', 'orphan', 'runt_line'];

export const FILL_PASS_RUNT_MIN_CURRENT_FILL = 0.70;
export const FILL_PASS_RUNT_MIN_RESULT_FILL  = 0.88;
export const SHORT_LAST_LINE_POSTPASS_MIN_SOURCE_FILL = 0.80;

// Minimum computeRuntLinePenalty score to trigger a hard guard (layout mutation rejection).
export const RUNT_HARD_PENALTY_THRESHOLD = 400;

// ─────────────────────────────────────────────────────────────────────────────
// Worker-safe Canvas 2D context singleton
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Worker-safe canvas measurement: get a 2D context from an OffscreenCanvas if available,
 * otherwise from a regular canvas (main thread). Returns the ctx.
 */
export const getCanvasCtx2d = (() => {
  let _ctx = null;
  return () => {
    if (_ctx) return _ctx;
    if (typeof OffscreenCanvas !== 'undefined') {
      _ctx = new OffscreenCanvas(1, 1).getContext('2d');
    } else if (typeof document !== 'undefined') {
      _ctx = document.createElement('canvas').getContext('2d');
    }
    return _ctx;
  };
})();

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fast non-cryptographic string hash (djb2 variant).
 * Stable across runs for the same input — suitable as a chapter cache key.
 * @param {string} str
 * @returns {string} hex string
 */
export const simpleHash = (str) => {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
};

export const normalizePolicyTag = (tag) => String(tag || '').toUpperCase();

export const normalizePolicyTagSet = (tags) => new Set(
  (Array.isArray(tags) ? tags : [])
    .map(normalizePolicyTag)
    .filter(Boolean)
);

export const mergePolicyTagSets = (...sets) => {
  const merged = new Set();
  for (const set of sets) {
    for (const value of normalizePolicyTagSet(set)) {
      merged.add(value);
    }
  }
  return merged;
};

export const normalizeRepairPriority = (priority) => {
  const allowed = new Set(DEFAULT_REPAIR_PRIORITY);
  const normalized = [];

  for (const item of Array.isArray(priority) ? priority : []) {
    const value = String(item || '').trim().toLowerCase();
    if (allowed.has(value) && !normalized.includes(value)) {
      normalized.push(value);
    }
  }

  for (const fallback of DEFAULT_REPAIR_PRIORITY) {
    if (!normalized.includes(fallback)) {
      normalized.push(fallback);
    }
  }

  return normalized;
};

export const countDefectViolations = (qualities, defect) => (
  (Array.isArray(qualities) ? qualities : []).reduce(
    (sum, quality) => sum + ((quality?.violations || []).includes(defect) ? 1 : 0),
    0
  )
);

export const computeRepairPriorityGain = (beforeQualities, afterQualities, repairPriority) => {
  const order = normalizeRepairPriority(repairPriority);
  return order.map((defect) => (
    countDefectViolations(beforeQualities, defect) - countDefectViolations(afterQualities, defect)
  ));
};

export const compareRepairPriorityGain = (left, right, repairPriority) => {
  const leftGain = Array.isArray(left?.priorityGain)
    ? left.priorityGain
    : computeRepairPriorityGain([], [], repairPriority);
  const rightGain = Array.isArray(right?.priorityGain)
    ? right.priorityGain
    : computeRepairPriorityGain([], [], repairPriority);

  const length = Math.max(leftGain.length, rightGain.length);
  for (let i = 0; i < length; i++) {
    const delta = (leftGain[i] || 0) - (rightGain[i] || 0);
    if (delta !== 0) return delta;
  }

  const improvementDelta = (left?.improvement || 0) - (right?.improvement || 0);
  if (improvementDelta !== 0) return improvementDelta;

  return (right?.scoreAfter || 0) - (left?.scoreAfter || 0);
};

export const resolveMinLastLineWords = (explicitValue, fallbackValue = 0) => {
  const numeric = Number(explicitValue);
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.round(numeric));
  }
  const fallbackNumeric = Number(fallbackValue);
  return Number.isFinite(fallbackNumeric) ? Math.max(0, Math.round(fallbackNumeric)) : 0;
};

export const clonePageSlice = (pages) => {
  if (typeof structuredClone === 'function') {
    return structuredClone(Array.isArray(pages) ? pages : []);
  }

  return (Array.isArray(pages) ? pages : []).map((page) => ({
    ...page,
    blocks: Array.isArray(page?.blocks)
      ? page.blocks.map((block) => ({
        ...block,
        dataset: block?.dataset ? { ...block.dataset } : undefined,
      }))
      : [],
  }));
};

export const resolveChapterLayoutPolicy = (chapter, layoutHints) => {
  const globalHints = layoutHints?.global || {};
  const chapterHints = (layoutHints?.chapters || []).find((hint) => (
    (hint?.chapterId && chapter?.id && hint.chapterId === chapter.id)
    || (hint?.chapterTitle && chapter?.title && hint.chapterTitle === chapter.title)
  )) || null;

  return {
    targetFillPct: chapterHints?.targetFillPct ?? globalHints?.targetFillPct ?? null,
    minLastLineWords: resolveMinLastLineWords(
      chapterHints?.minLastLineWords,
      globalHints?.minLastLineWords
    ),
    repairPriority: normalizeRepairPriority(chapterHints?.repairPriority ?? globalHints?.repairPriority),
    avoidSplitTags: mergePolicyTagSets(globalHints?.avoidSplitTags, chapterHints?.avoidSplitTags),
    keepWithNextTags: mergePolicyTagSets(globalHints?.keepWithNextTags, chapterHints?.keepWithNextTags),
    notes: [
      ...(Array.isArray(globalHints?.notes) ? globalHints.notes : []),
      ...(Array.isArray(chapterHints?.notes) ? chapterHints.notes : []),
    ],
  };
};

export const policyIncludesTag = (policySet, tag) => policySet?.has(normalizePolicyTag(tag)) === true;

// ─────────────────────────────────────────────────────────────────────────────
// Runt-line penalty table (shared by metrics.js and evaluation.js)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shared runt-line penalty table.
 * Single source of truth for both the soft scoring path (scoreCandidate,
 * evaluatePageQualityCanvas) and the hard guard path (isSevereShortLastLine).
 *
 * Returns a raw penalty weight (0 = no penalty). Callers multiply by their own
 * scale factor (fs, delta bias, etc.) before adding to their total score.
 * The hard gate uses RUNT_HARD_PENALTY_THRESHOLD to derive a binary decision
 * from the same table — see isSevereShortLastLine in metrics.js.
 *
 * @param {number} lastLineWords  — number of words on the last line
 * @param {number} widthRatio     — last line width / effective content width (0–1)
 * @returns {number} raw penalty (0 if no runt)
 * @private
 */
export const computeRuntLinePenalty = (lastLineWords, widthRatio, minLastLineWords = 0) => {
  if (lastLineWords <= 0) return 0;
  let penalty = 0;
  if      (lastLineWords === 1) penalty += 1400;
  else if (lastLineWords === 2) penalty +=  900;
  else if (lastLineWords === 3) penalty +=  400;
  else if (lastLineWords === 4) penalty +=  250;
  else if (lastLineWords === 5) penalty +=  100;
  if      (widthRatio < 0.35) penalty += 800;
  else if (widthRatio < 0.45) penalty += 500;
  else if (widthRatio < 0.55) penalty += 300;
  const targetMinWords = resolveMinLastLineWords(minLastLineWords, 0);
  if (targetMinWords > 0 && lastLineWords < targetMinWords) {
    penalty += (targetMinWords - lastLineWords) * 800;
  }
  return penalty;
};
