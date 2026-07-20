/**
 * repairs.js
 *
 * Post-pagination repair passes extracted from paginateChapters.js.
 */

import {
  htmlToText,
  parseTopLevelBlocks as parseHtmlElements,
  serializeBlocks,
  getPageBlocks,
  setPageBlocks,
  setPageHtml,
  getBoldTextRatio,
  getFirstBlock as getFirstElement,
} from '../layoutIr.js';

import {
  measureHtmlHeight,
} from '../textLayoutEngine';

import {
  DEFAULT_REPAIR_PRIORITY,
  FILL_PASS_RUNT_MIN_CURRENT_FILL,
  FILL_PASS_RUNT_MIN_RESULT_FILL,
  getDomSlack,
  normalizeRepairPriority,
  computeRepairPriorityGain,
  compareRepairPriorityGain,
} from './constants.js';

import {
  isMostlyBoldParagraph,
  mergeIntoOne,
  splitInTwo,
} from './metrics.js';

import {
  evaluatePageQualityCanvas,
  canAcceptHtml,
} from './evaluation.js';

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vertical justification (InDesign-style) — distributes the residual bottom
 * hole of underfull pages across the gaps between blocks so every mid-chapter
 * page ends at (nearly) the same baseline.
 *
 * Rules:
 *   - Never touches blank, title-only, or chapter-last pages (a chapter's last
 *     page ends short by design, like in any printed book).
 *   - Uses padding-bottom (additive, no margin-collapse interaction, never
 *     shrinks an existing margin).
 *   - Per-gap increment capped at 60% of a line so gaps stay subtle.
 *   - Budget-verified with Canvas measurement; reverts if the page would
 *     exceed budget (the old distributeVerticalSpace overflowed — this one
 *     cannot).
 *
 * Disable with safeConfig.pagination.verticalJustify = false.
 */
export const applyVerticalJustification = (pages, layoutCtx, canvasCtx, safeConfig, log = null) => {
  if (safeConfig?.pagination?.verticalJustify === false) return;
  const { contentHeight, lineHeightPx } = layoutCtx;
  const chStartExtra = Math.max(0, (layoutCtx.headerSpaceEstimate || 0) - (layoutCtx.chapterStartBottomClearance || 0))
    + (layoutCtx.chapterStartExtraLines || 0) * lineHeightPx;
  const MAX_PER_GAP = Math.max(2, lineHeightPx * 0.6);
  const RESERVE_PX = 2; // keep a hair of slack against DOM rounding

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (!page || page.isBlank || page.isTitleOnlyPage || !page.html) continue;
    if (page.isChapterLastPage) continue;

    const blocks = getPageBlocks(page);
    if (blocks.length < 2) continue;

    const budget = contentHeight - getDomSlack() + (page.isFirstChapterPage ? chStartExtra : 0);
    const pageH = measureHtmlHeight(page.html, canvasCtx);
    const hole = budget - pageH - RESERVE_PX;
    if (hole < lineHeightPx * 0.3) continue;

    // Per-gap caps. On chapter-start pages the gap AFTER the title block may
    // absorb up to 3 lines — a chapter opener with breathing room under its
    // title is standard book design, and it lets few-block opener pages reach
    // the same bottom baseline as the rest.
    const gaps = blocks.length - 1;
    const isTitleBlock = (b) =>
      /data-chapter-start/.test(b.outerHtml) || b.dataset?.chapterStart === 'true';
    const caps = [];
    for (let g = 0; g < gaps; g++) {
      caps.push(page.isFirstChapterPage && isTitleBlock(blocks[g])
        ? lineHeightPx * 3
        : MAX_PER_GAP);
    }

    // Distribute: title gap absorbs first, the rest is spread evenly (capped).
    const adds = new Array(gaps).fill(0);
    let remaining = hole;
    for (let g = 0; g < gaps && remaining > 0; g++) {
      if (caps[g] > MAX_PER_GAP) {
        adds[g] = Math.min(remaining, caps[g]);
        remaining -= adds[g];
      }
    }
    if (remaining > 0 && gaps > 0) {
      const normalGaps = caps.filter(c => c <= MAX_PER_GAP).length || gaps;
      const perGap = Math.min(remaining / normalGaps, MAX_PER_GAP);
      for (let g = 0; g < gaps; g++) {
        if (caps[g] <= MAX_PER_GAP) adds[g] += perGap;
      }
    }
    for (let g = 0; g < gaps; g++) adds[g] = Math.round(adds[g] * 10) / 10;
    if (adds.every(a => a < 0.5)) continue;

    const newHtml = blocks.map((b, bi) => {
      const add = bi < gaps ? adds[bi] : 0; // never pad the last block
      if (add < 0.5) return b.outerHtml;
      if (/style="/.test(b.outerHtml)) {
        return b.outerHtml.replace(/style="([^"]*)"/, (m, s) =>
          `style="${s.replace(/;?\s*$/, ';')}padding-bottom:${add}px;"`);
      }
      return b.outerHtml.replace(/^<(\w+)/, `<$1 style="padding-bottom:${add}px;"`);
    }).join('');

    const newH = measureHtmlHeight(newHtml, canvasCtx);
    if (newH > budget) continue; // safety: never overflow

    Object.assign(pages[i], setPageHtml(page, newHtml));
    if (log && process.env.NODE_ENV === 'development') {
      log.record('vjust', 'apply', page.pageNumber || i + 1, {
        hole: +hole.toFixed(1), gaps, adds,
        before: +pageH.toFixed(0), after: +newH.toFixed(0), budget: +budget.toFixed(0),
      });
    }
  }
};

/**
 * Indent repair pass — fixes <p> elements with text-indent:0 that should have
 * first-line indent.
 *
 * Two cases:
 *   A. Any non-continuation <p> anywhere on a non-chapter-start page that has
 *      text-indent:0 and starts with an uppercase letter.
 *   B. Any non-continuation <p> at position index>0 on any page with indent:0
 *      and uppercase start (safety net for restoreIndentIfNeeded misses).
 *
 * @private
 */
export const repairMissingIndents = (pages, safeConfig, log = null) => {
  const indentEm = safeConfig.paragraph?.firstLineIndent || 1.5;
  const targetIndent = `${indentEm}em`;

  for (let pi = 0; pi < pages.length; pi++) {
    const page = pages[pi];
    if (!page || page.isBlank || !page.html) continue;

    let prevNonBlank = null;
    for (let pj = pi - 1; pj >= 0; pj--) {
      if (!pages[pj]?.isBlank) { prevNonBlank = pages[pj]; break; }
    }
    const isFirstContentPage = page.isFirstChapterPage || prevNonBlank?.isTitleOnlyPage === true;

    const children = getPageBlocks(page);
    let changed = false;

    const repairedChildren = children.map((el, idx) => {
      if ((el.tag || '').toUpperCase() !== 'P') return el;

      // Skip continuation chunks — they deliberately have no indent
      const isCont = el.dataset?.continuation === 'true';
      if (isCont) return el;

      // Exempt: paragraph marked as first-paragraph at build time by buildParagraphHtml.
      if (el.dataset?.firstParagraph === 'true') return el;

      // Check current indent value
      const styleStr = el.style || '';
      const indentM = styleStr.match(/text-indent\s*:\s*([^;]+)/i);
      const indentVal = indentM ? parseFloat(indentM[1]) : null;
      const hasZeroIndent = indentVal === null || indentVal === 0;
      if (!hasZeroIndent) return el;

      // Exempt: first <p> (non-continuation, non-splitHead) on a chapter-start page.
      if (isFirstContentPage) {
        const firstContentPIdx = children.findIndex(
          c => (c.tag || '').toUpperCase() === 'P'
            && c.dataset?.continuation !== 'true'
            && c.dataset?.splitHead !== 'true'
        );
        if (idx === firstContentPIdx) return el;
      }

      // Check if first alphabetic character is uppercase (new paragraph, not split-rest)
      const firstLetter = el.textContent.trim().match(/\p{L}/u)?.[0] || '';
      const startsUpper = firstLetter !== '' &&
        firstLetter === firstLetter.toUpperCase() &&
        firstLetter !== firstLetter.toLowerCase();

      if (!startsUpper) {
        // Lowercase start at index > 0 with no data-continuation = split-rest that lost
        // its attribute. Re-add data-continuation so mergeSplitFragments can detect it.
        const alreadyHasCont = /data-continuation\s*=\s*["']true["']/i.test(el.outerHtml);
        if (!alreadyHasCont) {
          const tagM = el.outerHtml.match(/^<p(\s|>)/i);
          if (tagM) {
            const newOuter = el.outerHtml.replace(/^<p(\s|>)/i, `<p data-continuation="true"$1`);
            if (newOuter !== el.outerHtml) {
              changed = true;
              if (log) {
                log.record('repair', 'added-continuation', page.pageNumber ?? 0, {
                  idx,
                  text: (el.textContent || '').substring(0, 60)
                });
              }
              return { ...el, outerHtml: newOuter, dataset: { ...el.dataset, continuation: 'true' } };
            }
          }
        }
        return el;
      }

      // Restore indent
      let newOuter;
      if (indentM) {
        newOuter = el.outerHtml.replace(
          /\bstyle\s*=\s*"([^"]*)"/,
          (_, s) => `style="${s.replace(/text-indent\s*:[^;]+;?/i, `text-indent:${targetIndent};`)}"`
        );
      } else if (/\bstyle\s*=\s*"/.test(el.outerHtml)) {
        newOuter = el.outerHtml.replace(
          /\bstyle\s*=\s*"([^"]*)"/,
          (_, s) => `style="${s}text-indent:${targetIndent};"`
        );
      } else {
        // No style attribute — insert one
        newOuter = el.outerHtml.replace(/^(<p)(\s|>)/, `$1 style="text-indent:${targetIndent};"$2`);
      }

      if (newOuter !== el.outerHtml) {
        changed = true;
        if (log) {
          log.record('repair', 'added-indent', page.pageNumber ?? 0, {
            idx,
            isFirstChapterPage: !!page.isFirstChapterPage,
            isFirstContentPage,
            text: (el.textContent || '').substring(0, 60)
          });
        }
        return { ...el, outerHtml: newOuter };
      }
      return el;
    });

    if (changed) {
      Object.assign(page, setPageBlocks(page, repairedChildren));
    }
  }
};

/**
 * E8: Merge split paragraph fragments on the same page.
 *
 * After greedy pagination + fill-pass, a page may contain two (or more) <p>
 * elements that are fragments of the same original paragraph.
 *
 * @private
 */
export const mergeSplitFragments = (pages, log = null) => {
  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const page = pages[pageIdx];
    if (!page || page.isBlank || !page.html) continue;

    let children = getPageBlocks(page);
    const mergeBeforeHtml = page.html;
    let changed = false;

    // Helper: rebuild element outerHtml with merged innerHTML and updated text-align-last
    const buildMerged = (base, addedEl) => {
      const addedInner = typeof addedEl === 'string' ? addedEl : addedEl.innerHTML;
      // Cut-hyphen heads end mid-word: re-joining with their continuation must
      // NOT insert a space ("conti" + "nuar" → "continuar").
      const baseCutHyphen = /data-cut-hyphen/.test(base.outerHtml || '');
      const mergedInner = baseCutHyphen
        ? base.innerHTML + addedInner
        : base.innerHTML + ' ' + addedInner;
      // If the absorbed tail is itself a split-head (its paragraph continues on
      // the next page), the merged block's last line is a CUT line — keep it
      // justified so it reads as an interior line. Otherwise it is a true
      // paragraph ending — left-aligned.
      const tailIsSplitHead = typeof addedEl !== 'string'
        && (/data-split-head/.test(addedEl.outerHtml || '') || addedEl.dataset?.splitHead === 'true');
      const isJustified = /text-align:\s*justify/i.test(base.style || '');
      const alignLast = (tailIsSplitHead && isJustified) ? 'justify' : 'left';
      const newStyle = (base.style || '')
        .replace(/text-align-last:[^;]+;?/gi, '')
        .replace(/data-continuation:[^;]+;?/gi, '')
        + `text-align-last:${alignLast};`;
      // Remove data-continuation attribute and update style
      const tag = base.tag.toLowerCase();
      let newOuter = base.outerHtml
        .replace(/\s*data-continuation="[^"]*"/gi, '')
        .replace(/\bstyle="[^"]*"/, `style="${newStyle}"`);
      if (tailIsSplitHead && !/data-split-head/.test(newOuter)) {
        newOuter = newOuter.replace(/^<(\w+)/, '<$1 data-split-head="true"');
      }
      // Rebuild with merged inner
      const openTagEnd = newOuter.indexOf('>');
      if (openTagEnd === -1) return `<${tag}>${mergedInner}</${tag}>`;
      return newOuter.slice(0, openTagEnd + 1) + mergedInner + `</${tag}>`;
    };

    // Pass 1: merge elements with data-continuation='true' with their predecessor.
    for (let i = 1; i < children.length; i++) {
      const el = children[i];
      if (el.dataset?.continuation !== 'true') continue;
      const tag = el.tag;

      for (let j = i - 1; j >= 0; j--) {
        const prev = children[j];
        if (prev.tag !== tag) break;

        const merged = { ...prev, outerHtml: buildMerged(prev, el), innerHTML: prev.innerHTML + ' ' + el.innerHTML };
        children = [...children.slice(0, j), merged, ...children.slice(j + 1, i), ...children.slice(i + 1)];
        i = j; // re-check from merged position
        changed = true;
        if (log) log.record('merge', 'pass1-merge', pageIdx + 1, { tag, text: htmlToText(merged.innerHTML).substring(0, 60), beforeHtml: mergeBeforeHtml, afterHtml: serializeBlocks(children) });
        break;
      }
    }

    // Pass 2: merge adjacent <p> elements where the first ends mid-sentence.
    for (let i = 0; i < children.length - 1; i++) {
      const el = children[i];
      const next = children[i + 1];
      if (el.tag !== 'P' || next.tag !== 'P') continue;

      if (/font-weight:\s*bold/i.test(el.style || '')) continue;
      if (/font-weight:\s*bold/i.test(next.style || '')) continue;

      const elText = el.textContent.trim();
      if (!elText || /[.!?»"]\s*$/.test(elText)) continue;

      const nextStyle = next.style || '';
      const nextHasZeroIndent = /text-indent:\s*0/.test(nextStyle);
      const nextHasNoIndent = !/text-indent/.test(nextStyle);
      const nextText = next.textContent.trim();
      const nextStartsLowercase = /^[a-záéíóúüñ]/.test(nextText);
      if (!nextHasZeroIndent && !nextHasNoIndent && !nextStartsLowercase) {
        if (log) log.record('merge', 'pass2-skip', pageIdx + 1, { reason: 'indent-check', text: elText.substring(0, 60) });
        continue;
      }

      const merged = { ...el, outerHtml: buildMerged(el, next), innerHTML: el.innerHTML + ' ' + next.innerHTML };
      children = [...children.slice(0, i), merged, ...children.slice(i + 2)];
      i--;
      changed = true;
      if (log) log.record('merge', 'pass2-merge', pageIdx + 1, { text: htmlToText(merged.innerHTML).substring(0, 60) });
    }

    if (changed) {
      Object.assign(page, setPageBlocks(page, children));
    }
  }
};

/**
 * E6: Distribute remaining vertical whitespace proportionally among block elements.
 * Like InDesign's "justify all lines" — prevents noticeable underfill by adding
 * small margin-bottom increments to inter-element gaps.
 *
 * @private
 */
export const distributeVerticalSpace = (pages, layoutCtx, canvasCtx) => {
  const { contentHeight, lineHeightPx } = layoutCtx;
  const skipHeaderOnChStart = layoutCtx.headerSpaceEstimate > 0;
  const chStartExtra = skipHeaderOnChStart
    ? Math.max(0, (layoutCtx.headerSpaceEstimate || 0) - (layoutCtx.chapterStartBottomClearance || 0))
      + (layoutCtx.chapterStartExtraLines || 0) * lineHeightPx
    : 0;
  const measure = (html) => measureHtmlHeight(html, canvasCtx);

  for (const page of pages) {
    if (!page || page.isBlank || page.isTitleOnlyPage || page.isChapterLastPage || !page.html) continue;

    // Chapter start pages that skip the header have extra vertical budget minus bottom clearance.
    const isChStart = !!page.isFirstChapterPage;
    const pageBudget = contentHeight + (isChStart ? chStartExtra : 0);

    const actualHeight = measure(page.html);
    const freeSpace = pageBudget - actualHeight;
    // Need at least half a line of free space to bother distributing.
    if (freeSpace < lineHeightPx * 0.5) continue;
    // Below 60% fill the gap is structural — leave it at the bottom.
    if (actualHeight / pageBudget < 0.60) continue;

    const children = getPageBlocks(page);
    if (children.length < 2) continue;
    const last = children[children.length - 1];
    if (/^H[1-6]$/i.test(last.tag)) continue;

    const distribChildren = children;
    const numGaps = distribChildren.length - 1;
    if (numGaps < 1) continue;

    // Cap per-gap growth. Normal pages cap at 0.35 lines.
    // Chapter-start pages distribute the full free space evenly.
    const perGapCap = isChStart ? (freeSpace / numGaps) : lineHeightPx * 0.35;
    const maxPerGap = Math.min(freeSpace / numGaps, perGapCap);

    // Capture original margins for distributable children.
    const origMargins = distribChildren.map(el => {
      const m = (el.style || '').match(/margin-bottom:\s*([\d.]+)px/);
      return m ? parseFloat(m[1]) : 0;
    });

    // Apply uniform gap delta to every distributable element except the last.
    const applyGap = (g) => {
      return children.map((el) => {
        const dIdx = distribChildren.indexOf(el);
        if (dIdx < 0 || dIdx >= numGaps) return el.outerHtml;  // non-distributable or last
        const newMargin = (origMargins[dIdx] + g).toFixed(2);
        const newStyle = (el.style || '')
          .replace(/margin-bottom:\s*[\d.]+px;?/g, '')
          .trimEnd()
          + `;margin-bottom:${newMargin}px`;
        if (/\bstyle="/.test(el.outerHtml)) {
          return el.outerHtml.replace(/\bstyle="[^"]*"/, `style="${newStyle}"`);
        }
        return el.outerHtml.replace(/^(<[a-zA-Z][^\s/>]*)/, `$1 style="${newStyle}"`);
      }).join('');
    };

    // Binary search for the largest per-gap delta that fits.
    let lo = 0;
    let hi = maxPerGap;
    let bestGap = 0;
    for (let iter = 0; iter < 10; iter++) {
      const mid = (lo + hi) / 2;
      // Use 2× DOM_SLACK for safety
      const distributeSlack = getDomSlack() * 2;
      if (measure(applyGap(mid)) <= pageBudget - distributeSlack) {
        bestGap = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }

    if (bestGap >= 0.5) {
      Object.assign(page, setPageHtml(page, applyGap(bestGap)));
    }
  }
};

/**
 * E5: Fix orphaned headings/bold-paragraphs left at the bottom of a page
 * after the fill-pass moves content forward, exposing a heading as the
 * last element. Moves the heading to the top of the next same-chapter page.
 *
 * @private
 */
export const fixHeadingsAtBottom = (pages, canvasCtx, layoutCtx, log) => {
  for (let i = 0; i < pages.length - 1; i++) {
    const page = pages[i];
    if (!page || page.isBlank || !page.html) continue;

    const children = getPageBlocks(page);
    if (children.length === 0) continue;

    const last = children[children.length - 1];
    const isHeading = /^H[1-6]$/i.test(last.tag);
    // Bold paragraph = subtitle-like: only if ≥80% of text is bold.
    let isBoldPara = false;
    if ((last.tag || '').toUpperCase() === 'P') {
      if (/font-weight:\s*(?:bold|[7-9]00)/.test(last.style || '')) {
        isBoldPara = true;
      } else if (/^<p[^>]*>\s*<(?:strong|b)\b/i.test(last.outerHtml)) {
        const totalText = htmlToText(last.innerHTML).trim();
        const { boldLen } = getBoldTextRatio(last.outerHtml);
        isBoldPara = totalText.length > 0 && (boldLen / totalText.length) >= 0.8;
      }
    }

    if (!isHeading && !isBoldPara) continue;

    // Find next non-blank page in same chapter
    let ni = i + 1;
    while (ni < pages.length && pages[ni]?.isBlank) ni++;
    if (ni >= pages.length) continue;
    const next = pages[ni];
    if (page.chapterTitle !== next.chapterTitle) continue;

    // Move heading to top of next page — only if it fits without overflow
    const headingHtml = last.outerHtml;
    const mergedHtml = headingHtml + (next.html || '');

    if (!canAcceptHtml(mergedHtml, layoutCtx.contentHeight, canvasCtx)) {
      // Next page is full. Try cascading: push elements forward through a chain
      // of pages to make room for the heading. Supports up to 2-level cascade.
      let cascaded = false;
      const nextChildren = getPageBlocks(next);
      if (nextChildren.length >= 2) {
        let ni2 = ni + 1;
        while (ni2 < pages.length && pages[ni2]?.isBlank) ni2++;
        if (ni2 < pages.length) {
          const nextNext = pages[ni2];
          if (nextNext && !nextNext.isTitleOnlyPage && !nextNext.isFirstChapterPage
              && next.chapterTitle === nextNext.chapterTitle) {
            const donorEl = nextChildren[nextChildren.length - 1];
            const newNextHtml = serializeBlocks(nextChildren.slice(0, nextChildren.length - 1)).trim();
            const donorPlusNextNext = donorEl.outerHtml + (nextNext.html || '');

            // Level 1 cascade: donor fits on page+2 directly
            if (newNextHtml && canAcceptHtml(donorPlusNextNext, layoutCtx.contentHeight, canvasCtx)) {
              const mergedAfterCascade = headingHtml + newNextHtml;
              if (canAcceptHtml(mergedAfterCascade, layoutCtx.contentHeight, canvasCtx)) {
                const qBefore = evaluatePageQualityCanvas(page.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
                  + evaluatePageQualityCanvas(next.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
                  + evaluatePageQualityCanvas(nextNext.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score;
                const remainingHtmlCascade = serializeBlocks(children.slice(0, children.length - 1)).trim();
                const qAfter = evaluatePageQualityCanvas(remainingHtmlCascade || '', layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
                  + evaluatePageQualityCanvas(mergedAfterCascade, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
                  + evaluatePageQualityCanvas(donorPlusNextNext, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score;
                if (qAfter <= qBefore + 100) {
                  pages[i]   = setPageHtml(page, remainingHtmlCascade, { isBlank: !remainingHtmlCascade });
                  pages[ni]  = setPageHtml(next, mergedAfterCascade);
                  pages[ni2] = setPageHtml(nextNext, donorPlusNextNext);
                  log.record('heading-fix', 'cascade', i + 1, { tag: last.tag, text: htmlToText(last.innerHTML).substring(0, 60), toPage: ni + 1, cascadeTo: ni2 + 1 });
                  cascaded = true;
                }
              }
            }

            // Level 2 cascade: page+2 is also full — try pushing its last element to page+3
            if (!cascaded && newNextHtml) {
              const nnChildren = getPageBlocks(nextNext);
              if (nnChildren.length >= 2) {
                let ni3 = ni2 + 1;
                while (ni3 < pages.length && pages[ni3]?.isBlank) ni3++;
                if (ni3 < pages.length) {
                  const p3 = pages[ni3];
                  if (p3 && !p3.isTitleOnlyPage && !p3.isFirstChapterPage
                      && nextNext.chapterTitle === p3.chapterTitle) {
                    const donor2 = nnChildren[nnChildren.length - 1];
                    const newNNHtml = serializeBlocks(nnChildren.slice(0, nnChildren.length - 1)).trim();
                    const donor2PlusP3 = donor2.outerHtml + (p3.html || '');
                    if (newNNHtml && canAcceptHtml(donor2PlusP3, layoutCtx.contentHeight, canvasCtx)) {
                      const donorPlusNewNN = donorEl.outerHtml + newNNHtml;
                      if (canAcceptHtml(donorPlusNewNN, layoutCtx.contentHeight, canvasCtx)) {
                        const mergedAfterCascade2 = headingHtml + newNextHtml;
                        if (canAcceptHtml(mergedAfterCascade2, layoutCtx.contentHeight, canvasCtx)) {
                          const remainingHtmlC2 = serializeBlocks(children.slice(0, children.length - 1)).trim();
                          const qBefore2 = evaluatePageQualityCanvas(page.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
                            + evaluatePageQualityCanvas(next.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
                            + evaluatePageQualityCanvas(nextNext.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
                            + evaluatePageQualityCanvas(p3.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score;
                          const qAfter2 = evaluatePageQualityCanvas(remainingHtmlC2 || '', layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
                            + evaluatePageQualityCanvas(mergedAfterCascade2, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
                            + evaluatePageQualityCanvas(donorPlusNewNN, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
                            + evaluatePageQualityCanvas(donor2PlusP3, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score;
                          if (qAfter2 <= qBefore2 + 150) {
                            pages[i]   = setPageHtml(page, remainingHtmlC2, { isBlank: !remainingHtmlC2 });
                            pages[ni]  = setPageHtml(next, mergedAfterCascade2);
                            pages[ni2] = setPageHtml(nextNext, donorPlusNewNN);
                            pages[ni3] = setPageHtml(p3, donor2PlusP3);
                            log.record('heading-fix', 'cascade-2', i + 1, { tag: last.tag, text: htmlToText(last.innerHTML).substring(0, 60), toPage: ni + 1, cascadeTo: ni3 + 1 });
                            cascaded = true;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Fallback: split the first splittable paragraph on page+1 to make room
      if (!cascaded && nextChildren.length >= 2) {
        const headingHeight = measureHtmlHeight(headingHtml, canvasCtx);
        const budget = layoutCtx.contentHeight - getDomSlack();
        let usedHeight = headingHeight;
        let fitCount = 0;
        for (let si = 0; si < nextChildren.length; si++) {
          const elH = measureHtmlHeight(nextChildren[si].outerHtml, canvasCtx);
          if (usedHeight + elH <= budget) {
            usedHeight += elH;
            fitCount = si + 1;
          } else {
            // Try splitting this element if it's a splittable paragraph
            if (!(/^H[1-6]$/i.test(nextChildren[si].tag)) && elH > layoutCtx.lineHeightPx * 4) {
              const splitBudget = budget - usedHeight;
              if (splitBudget >= layoutCtx.lineHeightPx * 3) {
                const chunks = splitInTwo(
                  nextChildren[si].outerHtml, null, canvasCtx, splitBudget,
                  layoutCtx.contentHeight, layoutCtx.textAlign,
                  false, 1.5, false, canvasCtx
                );
                if (chunks && chunks.length === 2 && chunks[0] && chunks[1]) {
                  const ch = measureHtmlHeight(chunks[0], canvasCtx);
                  if (ch > 0 && ch <= splitBudget) {
                    const keepHtml = headingHtml
                      + nextChildren.slice(0, fitCount).map(e => e.outerHtml).join('')
                      + chunks[0];
                    const overflowHtml = chunks[1]
                      + nextChildren.slice(si + 1).map(e => e.outerHtml).join('');
                    const remainingHtmlSplit = serializeBlocks(children.slice(0, children.length - 1)).trim();
                    const qBefore = evaluatePageQualityCanvas(page.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
                      + evaluatePageQualityCanvas(next.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score;
                    const qAfter = evaluatePageQualityCanvas(remainingHtmlSplit || '', layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
                      + evaluatePageQualityCanvas(keepHtml, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
                      + evaluatePageQualityCanvas(overflowHtml, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score;
                    if (qAfter <= qBefore + 200) {
                      pages[i]  = setPageHtml(page, remainingHtmlSplit, { isBlank: !remainingHtmlSplit });
                      pages[ni] = setPageHtml(next, keepHtml);
                      const overflowPage = {
                        html: overflowHtml,
                        blocks: parseHtmlElements(overflowHtml),
                        chapterTitle: next.chapterTitle,
                        currentSubheader: next.currentSubheader || '',
                        isTitleOnlyPage: false,
                        isFirstChapterPage: false,
                        shouldShowPageNumber: next.shouldShowPageNumber !== false,
                      };
                      pages.splice(ni + 1, 0, overflowPage);
                      log.record('heading-fix', 'split-to-fit', i + 1, { tag: last.tag, text: htmlToText(last.innerHTML).substring(0, 60), toPage: ni + 1, insertedPage: ni + 2, fitCount, splitAt: si });
                      cascaded = true;
                      i++;
                    }
                  }
                }
              }
            }
            break;
          }
        }
        // All whole elements fit but page was "full" due to margin/slack — repartition
        if (!cascaded && fitCount >= 1 && fitCount < nextChildren.length) {
          const keepHtml = headingHtml + nextChildren.slice(0, fitCount).map(e => e.outerHtml).join('');
          const overflowHtml = nextChildren.slice(fitCount).map(e => e.outerHtml).join('');
          if (canAcceptHtml(keepHtml, layoutCtx.contentHeight, canvasCtx) && overflowHtml) {
            const remainingHtmlSplit = serializeBlocks(children.slice(0, children.length - 1)).trim();
            const qBefore = evaluatePageQualityCanvas(page.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
              + evaluatePageQualityCanvas(next.html, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score;
            const qAfter = evaluatePageQualityCanvas(remainingHtmlSplit || '', layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
              + evaluatePageQualityCanvas(keepHtml, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score
              + evaluatePageQualityCanvas(overflowHtml, layoutCtx.contentHeight, layoutCtx.lineHeightPx, canvasCtx).score;
            if (qAfter <= qBefore + 200) {
              pages[i]  = setPageHtml(page, remainingHtmlSplit, { isBlank: !remainingHtmlSplit });
              pages[ni] = setPageHtml(next, keepHtml);
              const overflowPage = {
                html: overflowHtml,
                blocks: parseHtmlElements(overflowHtml),
                chapterTitle: next.chapterTitle,
                currentSubheader: next.currentSubheader || '',
                isTitleOnlyPage: false,
                isFirstChapterPage: false,
                shouldShowPageNumber: next.shouldShowPageNumber !== false,
              };
              pages.splice(ni + 1, 0, overflowPage);
              log.record('heading-fix', 'repartition', i + 1, { tag: last.tag, text: htmlToText(last.innerHTML).substring(0, 60), toPage: ni + 1, insertedPage: ni + 2, fitCount });
              cascaded = true;
              i++;
            }
          }
        }
      }

      if (!cascaded) {
        log.record('heading-fix', 'reject', i + 1, { tag: last.tag, text: htmlToText(last.innerHTML).substring(0, 60), reason: 'next-page-full' });
      }
      continue;
    }

    const remainingHtml = serializeBlocks(children.slice(0, children.length - 1)).trim();

    pages[i] = setPageHtml(page, remainingHtml, { isBlank: !remainingHtml });
    pages[ni] = setPageHtml(next, mergedHtml);

    log.record('heading-fix', 'move', i + 1, { tag: last.tag, text: htmlToText(last.innerHTML).substring(0, 60), toPage: ni + 1, beforeHtml: page.html, afterHtml: remainingHtml });
  }
};

/**
 * E4: Cleanup nearly-empty pages after fill pass.
 * Scans backward — merges pages with very little content into previous page.
 * Uses Canvas measurement (deterministic).
 *
 * @private
 */
export const cleanupNearlyEmptyPages = (pages, layoutCtx, canvasCtx) => {
  const { contentHeight, lineHeightPx, minOrphanLines } = layoutCtx;
  const measure = (html) => measureHtmlHeight(html, canvasCtx);
  const minContentThreshold = minOrphanLines * lineHeightPx * 0.5;

  for (let i = pages.length - 1; i > 0; i--) {
    const page = pages[i];
    if (!page || page.isBlank || !page.html) continue;

    const prevPage = pages[i - 1];
    if (!prevPage || prevPage.isBlank) continue;
    if (prevPage.chapterTitle !== page.chapterTitle) continue;

    const pageHeight = measure(page.html);
    if (pageHeight >= minContentThreshold || pageHeight <= 0) continue;

    // Try merging into previous page
    const mergedHtml = prevPage.html + page.html;
    if (canAcceptHtml(mergedHtml, contentHeight, canvasCtx)) {
      const prevFill = measure(prevPage.html) / contentHeight;
      const mergedFill = measure(mergedHtml) / contentHeight;
      if (prevFill >= FILL_PASS_RUNT_MIN_CURRENT_FILL
          && mergedFill >= FILL_PASS_RUNT_MIN_RESULT_FILL) {
        const qMerged = evaluatePageQualityCanvas(mergedHtml, contentHeight, lineHeightPx, canvasCtx);
        if (qMerged.violations.includes('runt_line')) continue;
      }

      pages[i - 1] = setPageHtml(prevPage, mergedHtml);
      // Remove the now-empty page entirely instead of leaving it as a blank —
      // a merged-away page stranded mid-chapter renders as a spurious white
      // page (folio 121 report: empty page, next page has text). Parity is
      // re-enforced afterwards, so dropping a page here is safe.
      pages.splice(i, 1);
    }
  }
};

/**
 * Invariant: ensure every chapter-starting page is on an odd (right-hand) page.
 * Runs LAST — after all structural mutations (fill-pass, heading fixes, cleanup).
 *
 * @private
 */
export const enforceChapterStartParity = (pages, safeConfig) => {
  if (safeConfig?.chapterTitle?.startOnRightPage === false) return;

  // Pass 1: Remove stale parity blanks (blank pages immediately before a
  // chapter-start page). This makes the function idempotent.
  for (let i = pages.length - 1; i >= 1; i--) {
    if (pages[i]?.isFirstChapterPage && pages[i - 1]?.isBlank) {
      pages.splice(i - 1, 1);
    }
  }

  // Pass 2: Insert blanks where needed so chapter starts on a right (odd) page.
  for (let i = 1; i < pages.length; i++) {
    if (!pages[i]?.isFirstChapterPage) continue;

    // Physical page position is i+1 (1-indexed). Must be odd for right-hand page.
    if ((i + 1) % 2 === 0) {
      const blankPage = {
        html: '',
        blocks: [],
        pageNumber: 0,
        isBlank: true,
        chapterTitle: pages[i - 1]?.chapterTitle || '',
        currentSubheader: '',
        isTitleOnlyPage: false,
        isFirstChapterPage: false,
        shouldShowPageNumber: false,
      };
      pages.splice(i, 0, blankPage);
      i++; // skip the blank just inserted
    }
  }
};

// fillPct difference threshold that triggers smoothing (25%)
const SMOOTH_THRESHOLD = 0.25;
// Minimum badness improvement required to accept a smoothing move
const SMOOTH_BADNESS_MIN_DELTA = 50;

/**
 * E7: Smooth page fill imbalance across adjacent same-chapter pages.
 * For pairs where fillPct differs > SMOOTH_THRESHOLD, attempts to move one
 * element from the fuller page to the emptier page. Accepts only if total
 * badness improves by at least SMOOTH_BADNESS_MIN_DELTA.
 *
 * @private
 */
export const smoothPageBalance = (pages, layoutCtx, canvasCtx, log) => {
  const { contentHeight, lineHeightPx, minOrphanLines } = layoutCtx;
  const MIN_DONOR_SLACK_LINES = (minOrphanLines ?? 2) + 1;

  for (let i = 0; i < pages.length - 1; i++) {
    const page = pages[i];
    if (!page || page.isBlank || page.isTitleOnlyPage || page.isFirstChapterPage || !page.html) continue;

    // Find next non-blank page
    let nextIdx = i + 1;
    while (nextIdx < pages.length && pages[nextIdx]?.isBlank) nextIdx++;
    if (nextIdx >= pages.length) continue;
    const next = pages[nextIdx];
    if (!next || !next.html || next.isTitleOnlyPage || next.isFirstChapterPage) continue;
    if (page.chapterTitle !== next.chapterTitle) continue;

    const MAX_SMOOTH_ATTEMPTS = 8;
    for (let attempt = 0; attempt < MAX_SMOOTH_ATTEMPTS; attempt++) {

    const q1 = evaluatePageQualityCanvas(pages[i].html, contentHeight, lineHeightPx, canvasCtx);
    const q2 = evaluatePageQualityCanvas(pages[nextIdx].html, contentHeight, lineHeightPx, canvasCtx);

    // Guard: the DONOR (fuller page) must have enough slack to give.
    const donorPct = q1.fillPct > q2.fillPct ? q1.fillPct : q2.fillPct;
    const receiverPct = q1.fillPct > q2.fillPct ? q2.fillPct : q1.fillPct;
    const isSeverelyUnderfilled = receiverPct < 0.55;
    const donorSlackLines = Math.floor((1 - donorPct) * contentHeight / lineHeightPx);
    if (!isSeverelyUnderfilled && donorSlackLines < MIN_DONOR_SLACK_LINES) break;

    // Only smooth if imbalance exceeds threshold
    if (Math.abs(q1.fillPct - q2.fillPct) <= SMOOTH_THRESHOLD) break;

    const badnessBefore = q1.score + q2.score;

    // Determine direction: move from fuller page to emptier page
    const fromIdx = q1.fillPct > q2.fillPct ? i      : nextIdx;
    const toIdx   = q1.fillPct > q2.fillPct ? nextIdx : i;

    const fromEls = getPageBlocks(pages[fromIdx]);
    if (fromEls.length === 0) break;

    // Forward move (toIdx > fromIdx): take LAST element of fromPage, PREPEND to toPage.
    // Backward move (toIdx < fromIdx): take FIRST element of fromPage, APPEND to toPage.
    const elToMove = toIdx > fromIdx ? fromEls[fromEls.length - 1] : fromEls[0];
    if (!elToMove) break;

    const elHtml = elToMove.outerHtml;
    const fromRestEls = toIdx > fromIdx ? fromEls.slice(0, fromEls.length - 1) : fromEls.slice(1);
    const fromRest = serializeBlocks(fromRestEls).trim();
    if (!fromRest) break; // Would empty fromPage — skip

    const toNewHtml = toIdx > fromIdx
      ? elHtml + (pages[toIdx].html || '')   // forward: element goes to TOP of next page
      : (pages[toIdx].html || '') + elHtml;  // backward: element goes to BOTTOM of prev page

    if (!canAcceptHtml(toNewHtml, contentHeight, canvasCtx)) break;

    const qFrom = evaluatePageQualityCanvas(fromRest, contentHeight, lineHeightPx, canvasCtx);
    const qTo   = evaluatePageQualityCanvas(toNewHtml, contentHeight, lineHeightPx, canvasCtx);

    // Hard constraints
    if (qFrom.violations.includes('heading_at_bottom')) break;
    if (qTo.violations.includes('heading_at_bottom')) break;
    const changedEndBeforeFill = toIdx > fromIdx
      ? (fromIdx === i ? q1.fillPct : q2.fillPct)
      : (toIdx === i ? q1.fillPct : q2.fillPct);
    const changedEndAfterFill = toIdx > fromIdx ? qFrom.fillPct : qTo.fillPct;
    const changedEndQ = toIdx > fromIdx ? qFrom : qTo;
    if (changedEndBeforeFill >= FILL_PASS_RUNT_MIN_CURRENT_FILL
        && changedEndAfterFill >= FILL_PASS_RUNT_MIN_RESULT_FILL
        && changedEndQ.violations.includes('runt_line')) {
      const shortLinePage = toIdx > fromIdx ? fromIdx + 1 : toIdx + 1;
      log.record('smooth', 'reject', shortLinePage, {
        fromPage: fromIdx + 1,
        toPage: toIdx + 1,
        reason: 'short-last-line',
        text: '',
        shortLineScore: changedEndQ.score
      });
      break;
    }

    const badnessAfter = qFrom.score + qTo.score;

    if (badnessAfter < badnessBefore - SMOOTH_BADNESS_MIN_DELTA) {
      const smoothBeforeHtml = pages[fromIdx].html;
      pages[fromIdx] = setPageHtml(pages[fromIdx], fromRest);

      // Reunify split fragments if the moved element is a continuation chunk.
      let finalToHtml = toNewHtml;
      if (toIdx < fromIdx) {
        const movedEl = getFirstElement(elHtml);
        const isCont = movedEl?.dataset?.continuation === 'true'
          && (movedEl.tag === 'P' || movedEl.tag === 'BLOCKQUOTE');
        if (isCont) {
          const toEls = parseHtmlElements(toNewHtml);
          const lastChild = toEls[toEls.length - 1];
          const secondLast = toEls[toEls.length - 2];
          if (secondLast && secondLast.tag === lastChild?.tag) {
            const reunified = mergeIntoOne(secondLast.outerHtml, lastChild.outerHtml);
            finalToHtml = serializeBlocks(toEls.slice(0, toEls.length - 2)) + reunified;
          }
        }
      }

      pages[toIdx] = setPageHtml(pages[toIdx], finalToHtml);
      log.record('smooth', 'move', fromIdx + 1, { toPage: toIdx + 1, attempt, before: { score: +badnessBefore.toFixed(0), fillPct: +(q1.fillPct * 100).toFixed(0) }, after: { score: +badnessAfter.toFixed(0), fillPct: +(qTo.fillPct * 100).toFixed(0) }, beforeHtml: smoothBeforeHtml, afterHtml: fromRest });
      // If receiver is now above 70%, balance is good enough — stop moving
      if (qTo.fillPct >= 0.70) break;
    } else {
      break; // no improvement — stop attempts for this pair
    }
    } // end attempt loop
  }
};

/**
 * Consolidated repair pass: handles runt_line, widow, and orphan violations
 * in a single multi-pass sweep.
 *
 * @private
 */
export const repairPageDefects = (pages, layoutCtx, canvasCtx, log) => {
  const { contentHeight, lineHeightPx } = layoutCtx;
  const measure = (html) => measureHtmlHeight(html, canvasCtx);
  const minOrphanLines = layoutCtx.minOrphanLines ?? 2;

  for (let pass = 0; pass < 3; pass++) {
    let changedAny = false;

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (!page || page.isBlank || page.isTitleOnlyPage || !page.html) continue;

      const qPage = evaluatePageQualityCanvas(page.html, contentHeight, lineHeightPx, canvasCtx);
      const viols = qPage.violations;
      const repairPriority = normalizeRepairPriority(page.repairPriority);

      const hasRunt   = viols.includes('runt_line');
      const hasWidow  = viols.includes('widow');
      const hasOrphan = viols.includes('orphan');
      if (!hasRunt && !hasWidow && !hasOrphan) continue;

      const pageEls = getPageBlocks(page);
      if (pageEls.length < 2) continue;

      // Find adjacent pages
      let nextIdx = i + 1;
      while (nextIdx < pages.length && pages[nextIdx]?.isBlank) nextIdx++;
      let prevIdx = i - 1;
      while (prevIdx >= 0 && pages[prevIdx]?.isBlank) prevIdx--;

      const nextPage = nextIdx < pages.length ? pages[nextIdx] : null;
      const prevPage = prevIdx >= 0 ? pages[prevIdx] : null;
      const qNextPage = nextPage?.html
        ? evaluatePageQualityCanvas(nextPage.html, contentHeight, lineHeightPx, canvasCtx)
        : null;
      const qPrevPage = prevPage?.html
        ? evaluatePageQualityCanvas(prevPage.html, contentHeight, lineHeightPx, canvasCtx)
        : null;
      const sameChapterNext = nextPage && !nextPage.isTitleOnlyPage && !nextPage.isFirstChapterPage
        && nextPage.html && page.chapterTitle === nextPage.chapterTitle;
      const sameChapterPrev = prevPage && !prevPage.isTitleOnlyPage && prevPage.html
        && prevPage.chapterTitle === page.chapterTitle;

      let bestMove = null; // { type, improvement, priorityGain, scoreAfter, apply() }

      // === PUSH LAST ELEMENT FORWARD (fixes runt_line, widow) ===
      if ((hasRunt || hasWidow) && sameChapterNext && !page.isFirstChapterPage) {
        const lastEl = pageEls[pageEls.length - 1];
        const lastTag = (lastEl?.tag || '').toUpperCase();
        const isHeading = /^H[1-6]$/.test(lastTag);
        const isBold = lastTag === 'P' && isMostlyBoldParagraph(lastEl);

        if (!isHeading && !isBold) {
          // For widow: confirm it's a single-line P
          const skipWidow = hasWidow && !hasRunt
            && (lastTag !== 'P' || Math.floor(measure(lastEl.outerHtml) / lineHeightPx) > 1);

          if (!skipWidow) {
            const newSrcHtml = serializeBlocks(pageEls.slice(0, pageEls.length - 1)).trim();
            if (newSrcHtml) {
              const newSrcFill = measure(newSrcHtml) / contentHeight;
              const minFill = hasWidow ? 0.75 : 0.50;
              if (newSrcFill >= minFill) {
                const qNewSrc = evaluatePageQualityCanvas(newSrcHtml, contentHeight, lineHeightPx, canvasCtx);
                if (!qNewSrc.violations.includes('heading_at_bottom')) {
                  const newNextHtml = lastEl.outerHtml + (nextPage.html || '');
                  if (canAcceptHtml(newNextHtml, contentHeight, canvasCtx)) {
                    const qNewNext = evaluatePageQualityCanvas(newNextHtml, contentHeight, lineHeightPx, canvasCtx);
                    const nextScore = qNextPage?.score ?? 0;
                    const scoreBefore = qPage.score + nextScore;
                    const scoreAfter = qNewSrc.score + qNewNext.score;
                    const improvement = scoreBefore - scoreAfter;
                    const candidateMove = {
                        type: hasRunt ? 'runt-push' : 'widow-push',
                        improvement,
                        priorityGain: computeRepairPriorityGain([qPage, qNextPage], [qNewSrc, qNewNext], repairPriority),
                        scoreAfter,
                        apply: () => {
                          pages[i] = setPageHtml(page, newSrcHtml);
                          pages[nextIdx] = setPageHtml(nextPage, newNextHtml);
                          mergeSplitFragments([pages[i], pages[nextIdx]], log);
                          log.record('defect-fix', hasRunt ? 'runt-push' : 'widow-push', i + 1, {
                            toPage: nextIdx + 1,
                            text: (lastEl.textContent || '').substring(0, 50),
                            scoreBefore, scoreAfter
                          });
                        }
                      };
                    if (improvement >= -50 && (!bestMove || compareRepairPriorityGain(candidateMove, bestMove, repairPriority) > 0)) {
                      bestMove = candidateMove;
                    }
                  }
                }
              }
            }
          }
        }
      }

      // === PULL FIRST ELEMENT OF NEXT PAGE BACKWARD (fixes runt_line via reflow) ===
      if (hasRunt && sameChapterNext && !page.isFirstChapterPage) {
        const nextEls = nextPage ? getPageBlocks(nextPage) : [];
        if (nextEls.length >= 2) {
          const firstNextEl = nextEls[0];
          const firstNextTag = (firstNextEl?.tag || '').toUpperCase();
          if (!/^H[1-6]$/.test(firstNextTag)) {
            const pulledHtml = page.html + firstNextEl.outerHtml;
            if (canAcceptHtml(pulledHtml, contentHeight, canvasCtx)) {
              const newNextHtml = serializeBlocks(nextEls.slice(1)).trim();
              if (newNextHtml) {
                const qPulled = evaluatePageQualityCanvas(pulledHtml, contentHeight, lineHeightPx, canvasCtx);
                if (!qPulled.violations.includes('heading_at_bottom')
                    && !(qPulled.violations.includes('runt_line') && qPulled.score >= qPage.score)) {
                  const nextScore = qNextPage?.score ?? 0;
                  const qNewNext = evaluatePageQualityCanvas(newNextHtml, contentHeight, lineHeightPx, canvasCtx);
                  const scoreBefore = qPage.score + nextScore;
                  const scoreAfter = qPulled.score + qNewNext.score;
                  const improvement = scoreBefore - scoreAfter;
                  const candidateMove = {
                      type: 'runt-pull',
                      improvement,
                      priorityGain: computeRepairPriorityGain([qPage, qNextPage], [qPulled, qNewNext], repairPriority),
                      scoreAfter,
                      apply: () => {
                        pages[i] = setPageHtml(page, pulledHtml);
                        pages[nextIdx] = setPageHtml(nextPage, newNextHtml);
                        mergeSplitFragments([pages[i], pages[nextIdx]], log);
                        log.record('defect-fix', 'runt-pull', i + 1, {
                          fromPage: nextIdx + 1,
                          text: (firstNextEl.textContent || '').substring(0, 50),
                          scoreBefore, scoreAfter
                        });
                      }
                    };
                  if (improvement >= -50 && (!bestMove || compareRepairPriorityGain(candidateMove, bestMove, repairPriority) > 0)) {
                    bestMove = candidateMove;
                  }
                }
              }
            }
          }
        }
      }

      // === PULL ORPHAN BACKWARD TO PREVIOUS PAGE ===
      if (hasOrphan && sameChapterPrev) {
        const orphanEl = pageEls[0];
        const orphanTag = (orphanEl?.tag || '').toUpperCase();
        if (orphanTag === 'P' && !isMostlyBoldParagraph(orphanEl)) {
          const orphanLines = Math.floor(measure(orphanEl.outerHtml) / lineHeightPx);
          if (orphanLines < minOrphanLines) {
            const newPrevHtml = (prevPage.html || '') + orphanEl.outerHtml;
            if (canAcceptHtml(newPrevHtml, contentHeight, canvasCtx)) {
              const qNewPrev = evaluatePageQualityCanvas(newPrevHtml, contentHeight, lineHeightPx, canvasCtx);
              if (!qNewPrev.violations.includes('heading_at_bottom')
                  && !qNewPrev.violations.includes('orphan')
                  && !(qNewPrev.violations.includes('widow') && !viols.includes('widow'))) {
                const newPageHtml = serializeBlocks(pageEls.slice(1)).trim();
                if (newPageHtml) {
                  const qNewPage = evaluatePageQualityCanvas(newPageHtml, contentHeight, lineHeightPx, canvasCtx);
                  const prevScore = qPrevPage?.score ?? 0;
                  const scoreBefore = qPage.score + prevScore;
                  const scoreAfter = qNewPage.score + qNewPrev.score;
                  const improvement = scoreBefore - scoreAfter;
                  const candidateMove = {
                      type: 'orphan-pull',
                      improvement,
                      priorityGain: computeRepairPriorityGain([qPrevPage, qPage], [qNewPrev, qNewPage], repairPriority),
                      scoreAfter,
                      apply: () => {
                        pages[prevIdx] = setPageHtml(prevPage, newPrevHtml);
                        pages[i] = setPageHtml(page, newPageHtml);
                        mergeSplitFragments([pages[prevIdx]], log);
                        log.record('defect-fix', 'orphan-pull', i + 1, {
                          toPrevPage: prevIdx + 1,
                          text: (orphanEl.textContent || '').substring(0, 50),
                          scoreBefore, scoreAfter
                        });
                      }
                    };
                  if (improvement >= -50 && (!bestMove || compareRepairPriorityGain(candidateMove, bestMove, repairPriority) > 0)) {
                    bestMove = candidateMove;
                  }
                }
              }
            }
          }
        }
      }

      // Apply the best move found for this page
      if (bestMove) {
        bestMove.apply();
        changedAny = true;
      }
    }

    if (!changedAny) break;
  }
};
