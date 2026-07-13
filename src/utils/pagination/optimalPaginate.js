/**
 * optimalPaginate.js
 *
 * Globally-optimal chapter pagination via dynamic programming (TeX-style).
 *
 * Why this exists:
 *   greedyPaginate() decides each page break locally (with a 0.4-weighted
 *   one-page lookahead) and then relies on applyFillPass + repair passes to
 *   fix the damage. Those passes fight each other (moves → rejects → reverts),
 *   which produces the two classic symptoms: paragraphs jumping to the wrong
 *   page and unevenly filled pages.
 *
 *   This module instead treats pagination as a shortest-path problem over the
 *   chapter's content stream: every legal page break is an edge with a cost
 *   (underfill, widow/orphan, runt, heading-at-bottom, mid-sentence cut...)
 *   and the DP picks the break sequence with minimal TOTAL cost. No fill-pass
 *   or rebalancing is needed afterwards — the layout is already optimal.
 *
 * Reuses the existing deterministic Canvas engine:
 *   - measureHtmlHeight()      for all heights
 *   - splitParagraphByLines()  for intra-paragraph split chunks
 *   - splitListByItems()       for list splits
 *   - computeRuntLinePenalty / getLastLineMetrics for quality scoring
 *
 * Output: Page[] with the exact same shape greedyPaginate produces, so all
 * downstream consumers (preview, export, layout editor) work unchanged.
 */

import {
  splitParagraphByLines,
  splitListByItems,
} from '../paginationEngine';

import {
  htmlToText,
  parseTopLevelBlocks as parseHtmlElements,
  serializeBlocks,
} from '../layoutIr.js';

import {
  measureHtmlHeight,
} from '../textLayoutEngine';

import {
  getDomSlack,
  DEFAULT_REPAIR_PRIORITY,
  simpleHash,
  policyIncludesTag,
  computeRuntLinePenalty,
} from './constants.js';

import {
  getLastLineMetrics,
  mergeIntoOne,
} from './metrics.js';

// ─── Tunables ────────────────────────────────────────────────────────────────

// How many trailing block-end candidates to expand per page (deeper prefixes
// are almost never globally optimal; pre-heading breaks are kept regardless).
const MAX_BLOCK_END_CANDIDATES = 5;

// Hard cap on memoized DP states per chapter — beyond this we bail out and the
// caller falls back to greedyPaginate. Generous: a 500-page chapter stays well
// under it.
const MAX_DP_STATES = 60000;

// Above this element count the DP's cost (states × per-candidate splits, each
// splitParagraphByLines ~50ms) dominates pagination time — a single 100-page
// chapter took over a minute. The windows below keep each DP run bounded; on
// running text the global optimum barely beats greedy, so windowing loses
// almost nothing in quality while turning cost back to ~linear.
const DP_WINDOW_ELEMENTS = 60;

// Module-level split cache — split results depend only on (html, maxLines),
// not on which window/chapter asks. Sharing across windows of a huge chapter
// (and across the incremental re-paginations of an editing session) turns the
// dominant cost (splitParagraphByLines) into a one-time price per unique cut.
// Cleared when it grows too large to avoid unbounded memory.
const _moduleSplitCache = new Map();
const _MAX_SPLIT_CACHE = 8000;

// Mild preference for page breaks at sentence boundaries (works together with
// the snap-to-sentence post-pass; keeping it mild avoids fighting page fill).
const MID_SENTENCE_CUT_PENALTY = 30;

const SENTENCE_END_RE = /[.!?…»"”)\]]\s*$/;

// Perf instrumentation (dev/test only — read by tests, negligible overhead).
export const _dpStats = { states: 0, measures: 0, measuredChars: 0, splits: 0 };

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Same call signature as greedyPaginate — drop-in replacement.
 *
 * @param {Array} elements    flattened chapter elements (title first)
 * @param {object} layoutCtx
 * @param {object} canvasCtx
 * @param {HTMLElement|null} measureDiv
 * @param {object} safeConfig
 * @param {object} chapter
 * @param {object} log
 * @param {object|null} chapterLayoutPolicy
 * @returns {Page[]}
 */
export const optimalPaginate = (elements, layoutCtx, canvasCtx, measureDiv, safeConfig, chapter, log, chapterLayoutPolicy = null) => {
  // Window huge chapters: run the DP on bounded element segments so cost stays
  // ~linear. The title lives in the first window; later windows are title-less
  // continuation chapters that append their pages (renumbered by the caller).
  if (elements.length > DP_WINDOW_ELEMENTS * 1.5) {
    const hasTitle = elements.length > 0 && elements[0].isTitle;
    const title = hasTitle ? [elements[0]] : [];
    const body = hasTitle ? elements.slice(1) : elements;
    const out = [];
    let first = true;
    for (let s = 0; s < body.length; s += DP_WINDOW_ELEMENTS) {
      const seg = body.slice(s, s + DP_WINDOW_ELEMENTS);
      const segElements = first ? [...title, ...seg] : seg;
      const segChapter = first ? chapter : { ...chapter, __windowCont: true };
      const segPages = optimalPaginate(
        segElements, layoutCtx, canvasCtx, measureDiv, safeConfig, segChapter, log, chapterLayoutPolicy
      );
      out.push(...segPages);
      first = false;
    }
    return out;
  }

  const {
    contentHeight, lineHeightPx, minOrphanLines, textAlign,
    splitLongParagraphs, headerSpaceEstimate: headerSpaceEst,
  } = layoutCtx;

  const skipHeaderOnChStart = safeConfig?.header?.skipFirstChapterPage !== false;
  const chapterStartExtraBudget = (skipHeaderOnChStart && headerSpaceEst > 0) ? headerSpaceEst : 0;

  const measure = (html) => {
    _dpStats.measures++;
    _dpStats.measuredChars += html ? html.length : 0;
    return measureHtmlHeight(html, canvasCtx);
  };
  const baseBudget = contentHeight - getDomSlack();
  const minOrphan = minOrphanLines || 2;
  const targetFill = canvasCtx?.targetFillPct ?? 0.92;
  const minLastLineWords = chapterLayoutPolicy?.minLastLineWords ?? canvasCtx?.minLastLineWords ?? 0;
  const indentValue = safeConfig.paragraph?.firstLineIndent || 1.5;

  // ── Separate title from content ────────────────────────────────────────────
  let titleEl = null;
  let contentStart = 0;
  if (elements.length > 0 && elements[0].isTitle) {
    titleEl = elements[0];
    contentStart = 1;
  }
  const content = elements.slice(contentStart);
  const lastContentIdx = content.length - 1;

  const titleLayout = titleEl?.titleLayout || 'continuous';
  const titleIsFullPage = titleEl && titleLayout === 'fullPage';
  const titleInline = titleEl && !titleIsFullPage;

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const isHeadingTag = (tag) => /^H[1-6]$/i.test(tag || '');
  const isHeadingOrBold = (el) =>
    !!el && (isHeadingTag(el.tag) || (el.tag === 'P' && el.isBold));
  const isKeepWithNext = (el) =>
    !!el && (isHeadingOrBold(el) || policyIncludesTag(chapterLayoutPolicy?.keepWithNextTags, el.tag));
  const isSplittableTag = (tag) => tag === 'P' || tag === 'DIV' || tag === 'BLOCKQUOTE';
  const isListTag = (tag) => tag === 'UL' || tag === 'OL';

  const minFollowLinesFor = (el) => {
    const level = isHeadingTag(el?.tag) ? el.tag.toLowerCase() : 'h3';
    const subConfig = safeConfig.subheaders?.[level];
    return subConfig?.minLinesAfter != null
      ? subConfig.minLinesAfter
      : Math.max(minOrphan, 2);
  };

  // Split a paragraph-ish HTML string so the head fits maxH.
  // Returns { head, rest } or null. Cached per (html, maxLines) — different DP
  // states frequently ask for the exact same split; splitParagraphByLines only
  // depends on maxH through floor(maxH / lineHeightPx).
  const splitKeyPrefix = `${lineHeightPx}|${canvasCtx.contentWidth}|${canvasCtx.widthSlack || 0}|${indentValue}|${textAlign}|`;
  const splitPara = (html, maxH) => {
    const maxLines = Math.max(1, Math.floor(maxH / lineHeightPx));
    const key = `${splitKeyPrefix}${simpleHash(html)}|${html.length}|${maxLines}`;
    if (_moduleSplitCache.has(key)) return _moduleSplitCache.get(key);
    _dpStats.splits++;
    const hasIndent = /^<p[\s>]/i.test(html.trim());
    const preserveIndent = /text-indent:\s*0[^.]/.test(html);
    const chunks = splitParagraphByLines(
      html, measureDiv, maxLines * lineHeightPx, textAlign,
      hasIndent, indentValue, preserveIndent, canvasCtx
    );
    let result = null;
    if (chunks && chunks.length >= 2) {
      const head = chunks[0];
      const rest = chunks.slice(1).reduce((a, b) => mergeIntoOne(a, b));
      result = { head, rest };
    }
    if (_moduleSplitCache.size > _MAX_SPLIT_CACHE) _moduleSplitCache.clear();
    _moduleSplitCache.set(key, result);
    return result;
  };

  // ── Candidate generation ────────────────────────────────────────────────────
  //
  // A "state" is a position in the content stream:
  //   { idx, restHtml } — restHtml is the pending continuation chunk (or null),
  //   idx is the next whole element to place.
  //
  // From a state we enumerate every reasonable way the CURRENT page can end.

  const buildCandidates = (idx, restHtml, isFirstPage) => {
    const budget = baseBudget + (isFirstPage && titleInline ? chapterStartExtraBudget : 0);
    const base = (isFirstPage && titleInline) ? titleEl.html : '';
    const candidates = [];

    let acc = base + (restHtml || '');
    let accH = acc ? measure(acc) : 0;

    // Case: the continuation chunk alone (plus title) overflows the page —
    // must split the continuation itself (multi-page paragraph).
    if (restHtml && accH > budget) {
      const spaceForRest = budget - (base ? measure(base) : 0);
      const restBlocks = parseHtmlElements(restHtml);
      const restTag = restBlocks[0]?.tag || 'P';
      if (isListTag(restTag)) {
        const listSplit = splitListByItems(restHtml, spaceForRest, canvasCtx, { minOrphanItems: 1, minWidowItems: 1 });
        if (listSplit) {
          const [head, rest] = listSplit;
          const h = measure(base + head);
          if (h <= budget) {
            candidates.push(makeSplitCandidate(base + head, h, head, rest, idx - 1, idx, budget, false));
          }
        }
      } else if (splitLongParagraphs) {
        for (let delta = 0; delta <= 1; delta++) {
          const maxH = spaceForRest - delta * lineHeightPx;
          if (maxH < minOrphan * lineHeightPx) break;
          const split = splitPara(restHtml, maxH, false);
          if (!split) continue;
          const h = measure(base + split.head);
          if (h > budget) continue;
          const cand = makeSplitCandidate(base + split.head, h, split.head, split.rest, idx - 1, idx, budget, false);
          if (!candidates.some(c => c.type === 'split' && c.orphanLines === cand.orphanLines)) {
            candidates.push(cand);
          }
        }
      }
      // Nothing splittable — force the oversized chunk onto its own page;
      // the downstream safety clamp will deal with it.
      if (candidates.length === 0) {
        candidates.push({
          type: 'forced', html: acc, height: accH, nextIdx: idx, nextRest: null,
          endIdx: idx - 1, chunkHtml: null, orphanLines: 0, widowLines: 0,
          budget, headingBeforeSplit: false,
        });
      }
      return { candidates, budget };
    }

    // Normal accumulation: add whole elements until one no longer fits.
    const blockEnds = [];
    let overflowIdx = -1;
    let lastAddedEl = null; // element directly before a potential split

    // A page may also end right after the continuation chunk (natural break
    // spot, e.g. before a heading that follows a split paragraph).
    const restEndCandidate = restHtml ? {
      type: 'block-end', html: acc, height: accH, nextIdx: idx, nextRest: null,
      endIdx: idx - 1, chunkHtml: null, orphanLines: 0, widowLines: 0,
      budget, headingBeforeSplit: false, isRestEnd: true,
    } : null;

    for (let e = idx; e < content.length; e++) {
      const el = content[e];
      // Incremental height: measuring the growing `acc+el.html` string each
      // step is O(n²) in a full window. Add per-element heights instead
      // (elements were pre-measured in flatten); only the exact fit check at
      // the boundary needs a precise combined measure.
      const elH = el.height != null ? el.height : measure(el.html);
      if (accH + elH <= budget) {
        acc = acc + el.html;
        accH = accH + elH;
        blockEnds.push({ endIdx: e, html: acc, height: accH });
        lastAddedEl = el;
        continue;
      }
      // Near the budget — confirm with a precise measure (margin collapsing).
      const withEl = acc + el.html;
      const withElH = measure(withEl);
      if (withElH <= budget) {
        blockEnds.push({ endIdx: e, html: withEl, height: withElH });
        acc = withEl;
        accH = withElH;
        lastAddedEl = el;
        continue;
      }
      overflowIdx = e;
      break;
    }

    // Everything remaining fits on this page → final candidate.
    if (overflowIdx === -1) {
      if (acc) {
        candidates.push({
          type: 'final', html: acc, height: accH, nextIdx: content.length, nextRest: null,
          endIdx: lastContentIdx, chunkHtml: null, orphanLines: 0, widowLines: 0,
          budget, headingBeforeSplit: false,
        });
      }
      // Also allow ending earlier (rarely optimal, but legal) — trailing block-ends.
      appendBlockEndCandidates(candidates, blockEnds.slice(0, -1), budget);
      if (restEndCandidate && idx < content.length) candidates.push(restEndCandidate);
      return { candidates, budget };
    }

    // Block-end candidates (prefix pages).
    appendBlockEndCandidates(candidates, blockEnds, budget);
    if (restEndCandidate) candidates.push(restEndCandidate);

    // Split candidates inside the overflowing element.
    const f = content[overflowIdx];
    const remainingSpace = budget - accH;
    const headingBefore = isKeepWithNext(lastAddedEl) ? lastAddedEl : null;

    if (isListTag(f.tag) && splitLongParagraphs && remainingSpace >= lineHeightPx * 2) {
      const listSplit = splitListByItems(f.html, remainingSpace, canvasCtx, { minOrphanItems: 1, minWidowItems: 1 });
      if (listSplit) {
        const [head, rest] = listSplit;
        const h = measure(acc + head);
        if (h <= budget) {
          candidates.push(makeSplitCandidate(acc + head, h, head, rest, overflowIdx, overflowIdx + 1, budget, !!headingBefore, headingBefore));
        }
      }
    } else if (splitLongParagraphs && isSplittableTag(f.tag) && !f.isBold && remainingSpace >= lineHeightPx) {
      for (let delta = 0; delta <= 1; delta++) {
        const maxH = remainingSpace - delta * lineHeightPx;
        if (maxH < minOrphan * lineHeightPx) break;
        const split = splitPara(f.html, maxH, false);
        if (!split) continue;
        const h = measure(acc + split.head);
        if (h > budget) continue;
        const cand = makeSplitCandidate(acc + split.head, h, split.head, split.rest, overflowIdx, overflowIdx + 1, budget, !!headingBefore, headingBefore);
        if (!candidates.some(c => c.type === 'split' && c.orphanLines === cand.orphanLines)) {
          candidates.push(cand);
        }
      }
    }

    // Nothing legal at all (e.g. single oversized unsplittable element):
    if (candidates.length === 0) {
      if (acc) {
        // Flush what we have (deeply underfull page) and retry the element fresh.
        candidates.push({
          type: 'forced', html: acc, height: accH, nextIdx: overflowIdx, nextRest: null,
          endIdx: overflowIdx - 1, chunkHtml: null, orphanLines: 0, widowLines: 0,
          budget, headingBeforeSplit: false,
        });
      } else {
        // Oversized element on an empty page — take it alone; clamp pass fixes it.
        candidates.push({
          type: 'forced', html: f.html, height: measure(f.html), nextIdx: overflowIdx + 1, nextRest: null,
          endIdx: overflowIdx, chunkHtml: null, orphanLines: 0, widowLines: 0,
          budget, headingBeforeSplit: false, allowOverflow: true,
        });
      }
    }

    return { candidates, budget };
  };

  const makeSplitCandidate = (pageHtml, pageHeight, chunkHtml, restHtml, endIdx, nextIdx, budget, headingBeforeSplit, headingEl = null) => {
    const chunkH = measure(chunkHtml);
    // widowLines only gates the widow floor (≥2 lines). A long remainder is
    // always well above it, so skip the costly full measure for big rests —
    // measuring a huge rest string per split candidate was a major cost.
    const restText = restHtml ? htmlToText(restHtml) : '';
    const restH = restText.length <= 220
      ? measure(restHtml)
      : lineHeightPx * 6; // long remainder → far above any widow floor
    return {
      type: 'split',
      html: pageHtml,
      height: pageHeight,
      nextIdx,
      nextRest: restHtml,
      endIdx,
      chunkHtml,
      orphanLines: Math.max(1, Math.floor(chunkH / lineHeightPx)),
      widowLines: Math.max(1, Math.floor(restH / lineHeightPx)),
      budget,
      headingBeforeSplit,
      headingEl,
    };
  };

  const appendBlockEndCandidates = (candidates, blockEnds, budget) => {
    if (blockEnds.length === 0) return;
    const keep = new Set();
    const from = Math.max(0, blockEnds.length - MAX_BLOCK_END_CANDIDATES);
    for (let k = from; k < blockEnds.length; k++) keep.add(k);
    // Always keep breaks right before a keep-with-next element (natural spots).
    for (let k = 0; k < blockEnds.length; k++) {
      const nextEl = content[blockEnds[k].endIdx + 1];
      if (nextEl && isKeepWithNext(nextEl)) keep.add(k);
    }
    for (const k of [...keep].sort((a, b) => b - a)) {
      const be = blockEnds[k];
      candidates.push({
        type: 'block-end',
        html: be.html,
        height: be.height,
        nextIdx: be.endIdx + 1,
        nextRest: null,
        endIdx: be.endIdx,
        chunkHtml: null,
        orphanLines: 0,
        widowLines: 0,
        budget,
        headingBeforeSplit: false,
      });
    }
  };

  // ── Edge (page) cost ────────────────────────────────────────────────────────

  const pageCost = (cand) => {
    const isLast = cand.nextIdx >= content.length && !cand.nextRest;
    if (!cand.allowOverflow && cand.height > cand.budget + 0.01) return Infinity;

    let cost = 0;
    const unusedLines = Math.floor(Math.max(0, cand.budget - cand.height) / lineHeightPx);

    if (!isLast) {
      // Underfill penalty — user priority: pages must fill ≥95%. One unused
      // line is cheap slack (lets the DP dodge an orphan word by cutting one
      // line earlier); from the second line on it grows steeply so any visible
      // hole loses against a split, and craters only survive when truly forced.
      if (unusedLines === 1) cost += 40;
      else if (unusedLines === 2) cost += 220;
      else if (unusedLines === 3) cost += 460;
      else if (unusedLines > 3) cost += 460 + (unusedLines - 3) * 220;

      const fillPct = cand.height / cand.budget;
      cost += Math.min(Math.max(0, targetFill - fillPct) * 200, 100);
    }

    // Heading / keep-with-next stranded at page bottom — must stay strictly
    // worse than the largest possible underfill crater (~3700), otherwise the
    // scaled underfill penalty could push a heading to the page bottom.
    if (!isLast && (cand.type === 'block-end' || cand.type === 'final' || cand.type === 'forced')) {
      const endEl = content[cand.endIdx];
      if (isHeadingOrBold(endEl)) cost += 5000;
      else if (isKeepWithNext(endEl)) cost += 4000;

      // Widow-like: complete 1-line paragraph isolated at the very bottom of a full page
      if (endEl && endEl.tag === 'P' && !endEl.isBold && unusedLines <= 0) {
        const elLines = Math.floor((endEl.height || measure(endEl.html)) / lineHeightPx);
        if (elLines <= 1) cost += 500;
      }

      // Runt: complete paragraph at bottom whose own last line is severely
      // short. Capped: the raw table reaches 2000+ with user configs and would
      // otherwise beat fill — the author's paragraph shape is not worth a hole.
      if (endEl && (endEl.tag === 'P' || endEl.tag === 'BLOCKQUOTE') && !endEl.isBold && unusedLines <= 1) {
        const m = getLastLineMetrics((endEl.textContent || '').trim(), canvasCtx);
        cost += Math.min(computeRuntLinePenalty(m.lastLineWords, m.widthRatio ?? 1, minLastLineWords) * 0.5, 150);
      }
    }

    if (cand.type === 'split') {
      const isLastChapterElement = cand.endIdx >= lastContentIdx;
      const effMinOrphan = isLastChapterElement ? 1 : minOrphan;
      const effMinWidow = isLastChapterElement ? 1 : minOrphan + 1;

      cost += 15; // fragment base cost

      if (cand.orphanLines < effMinOrphan) cost += 1000;
      if (cand.widowLines < 2) cost += 1000;
      else if (cand.widowLines < effMinWidow) cost += 200;

      // Runt on the cut line — capped at 250 so it stays subordinate to fill:
      // with the raw table (up to ~5000 with minLastLineWords configs) the DP
      // preferred leaving 15-line holes over any imperfect cut. User priority
      // is the inverse: fill ≥95% first; an orphan word on a FULL page is
      // tolerable, an orphan word next to empty space is not (and with 1 free
      // line costing only 40, the DP will cut a line earlier when that avoids
      // the runt cheaply).
      const chunkText = htmlToText(cand.chunkHtml).trim();
      const m = getLastLineMetrics(chunkText, canvasCtx);
      cost += Math.min(computeRuntLinePenalty(m.lastLineWords, m.widthRatio ?? 1, minLastLineWords), 250);

      if (chunkText.endsWith('-')) cost += 300;
      if (!SENTENCE_END_RE.test(chunkText)) cost += MID_SENTENCE_CUT_PENALTY;

      // Split right after a heading with too few following lines — same
      // hierarchy as heading_at_bottom: must beat any underfill crater.
      if (cand.headingBeforeSplit) {
        const needed = minFollowLinesFor(cand.headingEl);
        if (cand.orphanLines < needed) cost += 4000;
      }
    }

    if (cand.type === 'forced') cost += 400; // discourage, but keep legal

    return cost;
  };

  // ── DP (memoized shortest path) ─────────────────────────────────────────────

  const memo = new Map();

  const solve = (idx, restHtml, isFirstPage) => {
    if (idx >= content.length && !restHtml) return { cost: 0, cand: null, next: null };

    const key = `${idx}|${restHtml ? simpleHash(restHtml) : ''}|${isFirstPage ? 1 : 0}`;
    const hit = memo.get(key);
    if (hit) return hit;

    if (memo.size > MAX_DP_STATES) {
      throw new Error(`optimalPaginate: state explosion (${memo.size} states)`);
    }

    // Reserve the slot to guard against cycles (shouldn't happen — all
    // transitions strictly consume content — but cheap insurance).
    const placeholder = { cost: Infinity, cand: null, next: null };
    memo.set(key, placeholder);

    const { candidates } = buildCandidates(idx, restHtml, isFirstPage);

    // Branch & bound: expand candidates cheapest-edge first and prune any
    // whose edge cost alone already exceeds the best total (sub-costs are
    // non-negative, so those subtrees cannot win). Exact and deterministic —
    // stable sort keeps generation order for equal costs.
    const scored = [];
    for (const cand of candidates) {
      const edge = pageCost(cand);
      if (edge !== Infinity) scored.push({ cand, edge });
    }
    scored.sort((a, b) => a.edge - b.edge);

    let best = null;
    let bestTotal = Infinity;

    for (const { cand, edge } of scored) {
      if (edge >= bestTotal) break;
      const sub = solve(cand.nextIdx, cand.nextRest, false);
      const total = edge + sub.cost;
      if (total < bestTotal) {
        bestTotal = total;
        best = { cost: total, cand, next: { idx: cand.nextIdx, restHtml: cand.nextRest } };
      }
    }

    // DEV: when the chosen page leaves a visible hole, dump every candidate so
    // underfill decisions can be diagnosed from pagination-log.json.
    if (process.env.NODE_ENV === 'development' && best) {
      const chosenUnused = Math.floor(Math.max(0, best.cand.budget - best.cand.height) / lineHeightPx);
      const chosenIsLast = best.cand.nextIdx >= content.length && !best.cand.nextRest;
      if (chosenUnused > 4 && !chosenIsLast) {
        log.record('dp', 'underfill-choice', 0, {
          idx, hasRest: !!restHtml,
          chosen: { type: best.cand.type, endIdx: best.cand.endIdx, unused: chosenUnused, total: +best.cost.toFixed(0) },
          nextElTag: content[best.cand.nextIdx]?.tag,
          nextElText: (content[best.cand.nextIdx]?.textContent || '').slice(0, 50),
          cands: scored.slice(0, 10).map(({ cand, edge }) => ({
            t: cand.type,
            end: cand.endIdx,
            fill: +((cand.height / cand.budget) * 100).toFixed(0),
            edge: +edge.toFixed(0),
            o: cand.orphanLines, w: cand.widowLines,
          })),
        });
      }
    }

    if (!best) {
      // All candidates infeasible (should be impossible — forced candidates
      // always exist). Bail out to greedy.
      throw new Error('optimalPaginate: no feasible candidate');
    }

    memo.set(key, best);
    return best;
  };

  // ── Run DP and emit pages ───────────────────────────────────────────────────

  const pages = [];
  let currentSubheader = '';

  const pushPage = (html, opts = {}) => {
    const blocks = parseHtmlElements(html);
    pages.push({
      html: serializeBlocks(blocks),
      blocks,
      pageNumber: pages.length + 1,
      chapterTitle: chapter.title,
      isBlank: blocks.length === 0,
      isTitleOnlyPage: opts.isTitleOnlyPage || false,
      isFirstChapterPage: opts.isFirstChapterPage || false,
      currentSubheader,
      firstElementIndex: opts.firstElementIndex ?? 0,
      targetFillPct: chapterLayoutPolicy?.targetFillPct ?? null,
      minLastLineWords,
      repairPriority: chapterLayoutPolicy?.repairPriority ?? DEFAULT_REPAIR_PRIORITY,
    });
  };

  if (titleIsFullPage) {
    pushPage(titleEl.html, { isTitleOnlyPage: true, isFirstChapterPage: true, firstElementIndex: 0 });
  }

  if (content.length === 0) {
    if (titleInline) {
      pushPage(titleEl.html, { isFirstChapterPage: true, firstElementIndex: 0 });
    }
    return pages;
  }

  _dpStats.states = 0; _dpStats.measures = 0; _dpStats.measuredChars = 0; _dpStats.splits = 0;
  const root = solve(0, null, true);
  _dpStats.states = memo.size;

  if (process.env.NODE_ENV === 'development') {
    log.record('dp', 'chapter-solved', 0, {
      chapter: (chapter.title || '').substring(0, 40),
      totalCost: +root.cost.toFixed(0),
      states: memo.size,
    });
  }

  let node = root;
  let stateIdx = 0;
  let isFirst = true;

  while (node && node.cand) {
    const cand = node.cand;

    // Track subheaders across the elements included on this page.
    for (let s = stateIdx; s <= cand.endIdx && s < content.length; s++) {
      const el = content[s];
      if (isHeadingTag(el.tag) && !el.isTitle && el.textContent) {
        currentSubheader = el.textContent;
      }
    }

    const isFirstChapterPage = isFirst && (titleInline || titleIsFullPage);
    pushPage(cand.html, {
      isFirstChapterPage,
      firstElementIndex: stateIdx + contentStart,
    });
    isFirst = false;

    if (!node.next || (node.next.idx >= content.length && !node.next.restHtml)) break;
    stateIdx = node.next.idx;
    node = memo.get(`${node.next.idx}|${node.next.restHtml ? simpleHash(node.next.restHtml) : ''}|0`);
  }

  return pages;
};
