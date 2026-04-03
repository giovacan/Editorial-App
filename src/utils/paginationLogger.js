/**
 * paginationLogger.js
 * Structured logging system for pagination diagnostics.
 *
 * Factory pattern — supports parallel pagination runs and testing.
 * In production: record() is a no-op (zero overhead).
 *
 * Usage:
 *   const logger = createPaginationLogger();
 *   logger.reset();
 *   logger.setConfig({ pageFormat: '6x9', ... });
 *   logger.record('greedy', 'no-fit', 12, { tag: 'P', candidateH: 280, contentH: 260 });
 *   ...
 *   logger.generateSummary(pages, evaluateFn, contentHeight, lineHeightPx, canvasCtx);
 *   const log = logger.getLog();
 */

import { parseTopLevelBlocks, htmlToText } from './layoutIr.js';

const IS_DEV = process.env.NODE_ENV === 'development';

// ─── HTML element inspector (string-based, no DOM, worker-safe) ───────────────

/**
 * Parse top-level <p> elements from a page HTML string.
 * Returns an array of { index, isContinuation, indentValue, indentPx, text }.
 * indentValue: the raw CSS value string, e.g. "1.5em" or "0" or null (missing).
 */
function inspectParagraphs(pageHtml) {
  if (!pageHtml) return [];
  return parseTopLevelBlocks(pageHtml)
    .filter((block) => block.tag === 'P')
    .map((block, index) => {
      const indentMatch = (block.style || '').match(/text-indent\s*:\s*([^;]+)/i);
      const indentValue = indentMatch ? indentMatch[1].trim() : null;
      const fullText = htmlToText(block.outerHtml).replace(/\s+/g, ' ').trim();
      return {
        index,
        isContinuation: block.dataset?.continuation === 'true',
        isSplitHead: block.dataset?.splitHead === 'true',
        indentValue,
        indentNum: indentValue ? parseFloat(indentValue) : null,
        text: fullText.substring(0, 80),
        fullText
      };
    });
}

/**
 * Detect indent anomalies on a page.
 * Returns array of { index, kind, indentValue, text, startsLower }
 *
 * Kinds:
 *   'missing-indent'    — <p> with text-indent:0 that is NOT data-continuation
 *                         and starts with UPPERCASE — likely a new paragraph missing indent.
 *   'missing-indent-ambiguous' — same but starts with lowercase — probably a legitimate
 *                         split-rest that lost its data-continuation attribute.
 *   'indent-on-cont'    — <p data-continuation="true"> with text-indent > 0
 *
 * @param {string} pageHtml
 * @param {object} [opts]
 * @param {boolean} [opts.isFirstChapterPage] — title page; first <p> legitimately has no indent
 */
function detectIndentAnomalies(pageHtml, opts = {}) {
  const { isFirstChapterPage = false } = opts;
  const paras = inspectParagraphs(pageHtml);
  if (paras.length === 0) return [];
  const anomalies = [];

  for (const p of paras) {
    const zeroIndent = p.indentValue === null || p.indentNum === 0 || p.indentValue === '0';

    if (p.isContinuation) {
      // Continuation should have indent=0
      if (!zeroIndent) {
        anomalies.push({ index: p.index, kind: 'indent-on-cont', indentValue: p.indentValue, text: p.text });
      }
    } else {
      // The very first <p> on any page is usually a split-rest of the previous page's
      // last paragraph — it legitimately has no indent (it's a continuation, not a new para).
      // The only exception: if it starts with an UPPERCASE letter AND has no data-continuation,
      // it may be a new paragraph that lost its indent — but we can't distinguish this from
      // the first paragraph of a chapter (which also starts uppercase with no indent).
      // Exempt: index=0 on chapter-start pages (title page) — always correct.
      // Exempt: index=0 on ALL other pages — could be continuation OR chapter start.
      // Only flag index>0 with uppercase start and zero indent.
      const isExemptFirstOnPage = p.index === 0;
      if (!isExemptFirstOnPage && zeroIndent) {
        // Determine if this looks like a mid-sentence rest (lowercase start) or a
        // new paragraph that lost its indent (uppercase start after punctuation).
        const firstLetter = p.text.match(/\p{L}/u)?.[0] || '';
        const startsLower = firstLetter !== '' && firstLetter === firstLetter.toLowerCase() && firstLetter !== firstLetter.toUpperCase();
        const kind = startsLower ? 'missing-indent-ambiguous' : 'missing-indent';
        anomalies.push({ index: p.index, kind, indentValue: p.indentValue ?? 'none', text: p.text, startsLower });
      }
    }
  }
  return anomalies;
}

/**
 * Create a new pagination logger instance.
 * @returns {PaginationLogger}
 */
export function createPaginationLogger() {
  let entries = [];
  let config = null;
  let summary = null;
  let counter = 0;
  let reproBundle = null;

  return {
    /** Clear all entries — call at the start of paginateChapters() */
    reset() {
      entries = [];
      config = null;
      summary = null;
      counter = 0;
      reproBundle = null;
    },

    /** Store a snapshot of the pagination config for the log */
    setConfig(configSnapshot) {
      config = configSnapshot;
    },

    /**
     * Store the reproduction bundle — everything needed to replay this exact
     * pagination run deterministically.
     * @param {object} bundle
     */
    setReproBundle(bundle) {
      if (!IS_DEV) return;
      reproBundle = bundle;
    },

    /**
     * Record a pagination event.
     * No-op in production (guarded by IS_DEV constant — minifier strips it).
     *
     * @param {'greedy'|'fill'|'heading-fix'|'smooth'} phase
     * @param {'fit'|'no-fit'|'split'|'move'|'reject'|'heading-detect'|'keep-with-next'|'diag'|'heading-group'|'empty'} type
     * @param {number} page - 1-based page number
     * @param {object} data - Event-specific payload (tag, text, before/after, reason, etc.)
     */
    record(phase, type, page, data) {
      if (!IS_DEV) return;
      // Per-page event cap — prevents memory blowup on long books with many fill moves
      const PAGE_EVENT_CAP = 200;
      if (entries.filter(e => e.page === page).length >= PAGE_EVENT_CAP) return;
      counter++;
      const entry = { phase, type, page, traceId: `${phase}-p${page}-${counter}`, data: { ...data } };
      if (data.beforeHtml !== undefined) {
        entry.beforeSnapshot = makeHtmlSnapshot(data.beforeHtml);
        delete entry.data.beforeHtml;
      }
      if (data.afterHtml !== undefined) {
        entry.afterSnapshot = makeHtmlSnapshot(data.afterHtml);
        delete entry.data.afterHtml;
      }
      entries.push(entry);
    },

    /**
     * Generate per-page summary with quality metrics.
     * Call once at the end of pagination, before getLog().
     *
     * @param {Array} pages - The final paginated pages array
     * @param {Function} evaluateFn - evaluatePageQualityCanvas function
     * @param {number} contentHeight
     * @param {number} lineHeightPx
     * @param {object} canvasCtx
     */
    generateSummary(pages, evaluateFn, contentHeight, lineHeightPx, canvasCtx) {
      if (!IS_DEV) return;
      summary = pages.map((p, i) => {
        if (!p.html || p.isBlank) {
          return {
            page: i + 1, chapter: p.chapterTitle || '', fillPct: 0,
            score: 0, violations: [], elements: 0, events: 0,
            splits: 0, moves: 0, unstable: false, blank: true
          };
        }
        const q = evaluateFn(p.html, contentHeight, lineHeightPx, canvasCtx, false, { isChapterLastPage: p.isChapterLastPage === true });
        const pageEntries = entries.filter(e => e.page === i + 1);
        const splits = pageEntries.filter(e => e.type === 'split').length;
        const moves = pageEntries.filter(e => e.type === 'move' || e.type === 'heading-group').length;
        const rejects = pageEntries.filter(e => e.type === 'reject' && e.phase === 'fill').length;
        // Count elements in the page HTML (worker-safe, no DOM)
        const elCount = parseAllElements(p.html || '').length;

        // qualityGrade: A/B/C/D/F based on score thresholds.
        // Calibrated for bestseller quality with reduced cosmetic penalties:
        //   A ≤ 50: near-perfect pages (≤1 unused line, no violations)
        //   B ≤ 180: minor cosmetic issues (short_last_para, fragment, small whitespace)
        //   C ≤ 350: real defects (split_shallow, moderate underfill)
        //   D ≤ 600: severe issues
        //   F > 600: critical failures
        const sc = Math.round(q.score);
        const fp = Math.round(q.fillPct != null ? q.fillPct * 100 : 0);
        const violations = q.violations || [];

        // Chapter-last pages are graded on violations only (fill is structurally inevitable)
        let qualityGrade = p.isChapterLastPage
          ? (sc <= 50 ? 'A' : sc <= 180 ? 'B' : sc <= 350 ? 'C' : sc <= 600 ? 'D' : 'F')
          : (sc <= 50  && fp >= 90 ? 'A' :
             sc <= 180 && fp >= 86 ? 'B' :
             sc <= 350 && fp >= 80 ? 'C' :
             sc <= 600 && fp >= 60 ? 'D' : 'F');

        // chapterEnd: true when page is underfilled and ALL fill-pass rejects are chapter-boundary.
        // These are last pages of chapters where the fill-pass correctly refuses to cross chapter lines.
        const pageRejects = pageEntries.filter(e => e.type === 'reject');
        const chapterBoundaryRejects = pageRejects.filter(e => e.data?.reason === 'chapter-boundary');
        const isChapterEnd = fp < 80 && pageRejects.length > 0 && chapterBoundaryRejects.length === pageRejects.length;

        // unsplittable: fill-pass tried (rejects>0) but made no moves — blocked by widow/orphan constraints.
        // The page is editorially correct but the algorithm cannot improve it further.
        const unsplittable = rejects > 0 && moves === 0 && fp < 96;

        // Grade override: unsplittable page with decent fill and no grave violations → B minimum.
        // Rationale: if the fill-pass tried and was blocked, the page is as good as it can be.
        const hasGraveViolation = violations.some(v => ['orphan', 'widow', 'runt_line', 'heading_at_bottom'].includes(v));
        if (unsplittable && fp >= 86 && !hasGraveViolation && qualityGrade > 'B') {
          qualityGrade = 'B';
        }

        // Indent anomaly detection — string-based, no DOM
        const indentAnomalies = detectIndentAnomalies(p.html, { isFirstChapterPage: p.isFirstChapterPage === true });

        return {
          page: i + 1,
          chapter: p.chapterTitle || '',
          fillPct: fp,
          score: sc,
          qualityGrade,
          violations,
          elements: elCount,
          events: pageEntries.length,
          splits,
          moves,
          rejects,
          chapterEnd: isChapterEnd,
          unsplittable,
          isFirstChapterPage: p.isFirstChapterPage === true,
          unstable: splits > 0 || moves > 1,
          indentAnomalies,
          lineAnalysis: analyzePageLines(p.html, canvasCtx),
          html: p.html || ''   // kept for formatPageView — stripped from JSON output if large
        };
      });
    },

    /**
     * Return the complete log object.
     * @returns {{ timestamp: string, totalPages: number, totalEvents: number, config: object, entries: Array, summary: Array }}
     */
    getLog() {
      return {
        timestamp: new Date().toISOString(),
        totalPages: summary ? summary.length : 0,
        totalEvents: entries.length,
        config,
        reproBundle: reproBundle || null,
        entries,
        summary: summary || []
      };
    },

    /**
     * Format the summary as a compact text table for Claude to read.
     * @returns {string}
     */
    formatSummaryText() {
      if (!summary || !config) return '(no pagination log available)';
      const lines = [];
      lines.push(`PAGINATION SUMMARY (${new Date().toISOString().slice(0, 10)})`);
      lines.push(`Config: ${config.pageFormat || '?'}, ${config.fontSize || '?'}pt, ${config.lineHeight || '?'}lh, contentH=${config.contentHeight || '?'}px`);
      lines.push(`${summary.length} pages, ${entries.length} events`);

      // Indent diagnostic — shows the text-indent value of the first 4 paragraphs
      // of chapter 0 as generated by buildParagraphHtml, to confirm whether the
      // motor produces the correct style before any post-processing.
      const indentDiags = entries.filter(e => e.type === 'diag' && e.data?.note === 'indent-check');
      if (indentDiags.length > 0) {
        lines.push('');
        lines.push('INDENT DIAGNOSTIC (ch[0] first 4 paragraphs from buildParagraphHtml):');
        for (const d of indentDiags) {
          lines.push(`  para#${d.data.para} indent="${d.data.indent}" text="${d.data.text}"`);
        }
      }

      // Parity check — chapter starts that ended up on left (even) pages
      const parityErrors = entries.filter(e => e.phase === 'parity' && e.type === 'error');
      if (parityErrors.length > 0) {
        lines.push('');
        lines.push('⚠ PARITY ERRORS (chapters on LEFT page):');
        for (const e of parityErrors) {
          lines.push(`  p${e.page} idx=${e.data.index} pos=${e.data.position} — "${e.data.chapter}"`);
        }
      } else {
        lines.push('');
        lines.push('PARITY: All chapters on right (odd) pages ✓');
      }

      // Post-repair indent diagnostic — shows final indent state of first 3 <p>
      // on each chapter-start page after repairMissingIndents runs.
      const postRepairDiags = entries.filter(e => e.type === 'diag' && e.data?.note === 'post-repair-indent');
      if (postRepairDiags.length > 0) {
        lines.push('');
        lines.push('POST-REPAIR INDENT (first <p> per chapter-start page):');
        // Group by page number
        const byPage = {};
        for (const d of postRepairDiags) {
          if (!byPage[d.page]) byPage[d.page] = [];
          byPage[d.page].push(d);
        }
        for (const [pg, diags] of Object.entries(byPage).sort((a, b) => +a[0] - +b[0])) {
          lines.push(`  p${pg}:`);
          for (const d of diags) {
            const flags = [
              d.data.isFirstP ? '1stP' : null,
              d.data.isCont ? 'cont' : null,
              d.data.isSplitHead ? 'splitHead' : null,
            ].filter(Boolean).join('+') || 'normal';
            const pageFlag = d.data.isFirstChapterPage ? '' : ' (fullPage)';
            lines.push(`    [${d.data.pIdx}] indent="${d.data.indent}" (${flags})${pageFlag} — "${d.data.text}"`);
          }
        }
      }

      // Indent repair log — paragraphs where repairMissingIndents added indent
      const repairAdded = entries.filter(e => e.phase === 'repair' && e.type === 'added-indent');
      if (repairAdded.length > 0) {
        lines.push('');
        lines.push(`INDENT REPAIR (${repairAdded.length} additions by repairMissingIndents):`);
        for (const e of repairAdded) {
          lines.push(`  p${e.page} idx=${e.data.idx} isFirstChapterPage=${e.data.isFirstChapterPage} — "${e.data.text}"`);
        }
      }

      // Fill-pass reject details for F/D-grade non-chapter-end pages with rejects — FIRST for visibility
      // Also include C-grade pages with score≥280 that have rejects (high-penalty but not F/D)
      const realPagesEarly = summary.filter(s => !s.blank);
      const fPagesEarly = realPagesEarly.filter(s =>
        (s.qualityGrade === 'F' || (s.qualityGrade === 'D' && s.fillPct < 80) ||
         (s.qualityGrade === 'C' && s.score >= 280)) && !s.chapterEnd
      );
      if (fPagesEarly.length > 0) {
        lines.push('');
        lines.push('F-PAGE REJECT DETAILS:');
        for (const fp of fPagesEarly) {
          const rejects = entries.filter(e => e.page === fp.page && e.type === 'reject');
          const allEvts = entries.filter(e => e.page === fp.page);
          lines.push(`  p${fp.page} fill=${fp.fillPct}% score=${fp.score} grade=${fp.grade||fp.qualityGrade} viol=${fp.violations?.join(',')||'—'} | ${allEvts.length} events, ${rejects.length} rejects`);
          for (const r of rejects.slice(0, 8)) {
            const d = r.data || {};
            const f = d.features || {};
            const rem   = d.remainingLines ?? f.remainingLines ?? '?';
            const allow = f.splitAllowance != null ? ` allow=${f.splitAllowance}` : '';
            const ratio = f.emptyRatio    != null ? ` empty=${Math.round(f.emptyRatio*100)}%` : '';
            const srcV  = f.srcViolations?.length  ? ` srcV=${f.srcViolations.join(',')}` : '';
            const dstV  = f.destViolations?.length ? ` dstV=${f.destViolations.join(',')}` : '';
            const srcSc = d.after?.srcScore != null ? ` srcScore=${d.after.srcScore}` : '';
            lines.push(`    [${r.phase}] reason=${d.reason || '?'} tag=${d.tag || '?'} rem=${rem}${ratio}${allow} before=${d.before?.score ?? '?'} after=${d.after?.score ?? '?'}${srcSc}${srcV}${dstV} text="${(d.text || '').substring(0, 50)}"`);
          }
        }
      }

      // Indent anomaly report — surface missing/wrong indents before the page table
      const pagesWithIndentIssues = summary.filter(s => !s.blank && s.indentAnomalies && s.indentAnomalies.length > 0);
      if (pagesWithIndentIssues.length > 0) {
        lines.push('');
        lines.push(`INDENT ANOMALIES (${pagesWithIndentIssues.length} pages):`);
        for (const s of pagesWithIndentIssues) {
          lines.push(`  p${s.page} [${s.chapter || '?'}]`);
          for (const a of s.indentAnomalies) {
            const kindLabel = a.kind === 'missing-indent'
              ? '🔴 MISSING indent (uppercase start — likely bug)'
              : a.kind === 'missing-indent-ambiguous'
              ? '🟡 missing indent (lowercase start — likely split-rest, check data-continuation)'
              : a.kind === 'indent-on-cont'
              ? '🔴 INDENT on continuation'
              : a.kind;
            lines.push(`    elem[${a.index}] ${kindLabel} indent="${a.indentValue}" — "${a.text}"`);
          }
        }
      }

      // Chapter boundary map — show every page (blank, title, content) around chapter transitions
      const chapterBoundaries = [];
      for (let si = 0; si < summary.length; si++) {
        const s = summary[si];
        const prev = summary[si - 1];
        const isBoundary = s.blank || (prev && (prev.chapterEnd || prev.blank)) || (prev && prev.chapter !== s.chapter);
        if (!isBoundary) continue;
        // Show a window of 2 pages before and 2 after
        const window = [];
        for (let wi = Math.max(0, si - 2); wi <= Math.min(summary.length - 1, si + 2); wi++) {
          const ws = summary[wi];
          const tag = ws.blank ? 'BLANK' : ws.chapter?.substring(0, 20) || '?';
          const startFlag = ws.isFirstChapterPage ? ',1stCh' : '';
          window.push(`p${ws.page}(${ws.blank ? 'blank' : ws.fillPct + '%,' + (ws.chapterEnd ? 'end' : 'cont') + startFlag})[${tag}]`);
        }
        chapterBoundaries.push(window.join(' → '));
      }
      if (chapterBoundaries.length > 0) {
        lines.push('');
        lines.push('CHAPTER BOUNDARIES (all pages including blank):');
        for (const b of chapterBoundaries) lines.push('  ' + b);
      }

      lines.push('');
      lines.push('Page | Fill% | Score | Grd | Splits | Moves | Violations');
      lines.push('-----+-------+-------+-----+--------+-------+-----------');

      for (const s of summary) {
        if (s.blank) continue;
        // Only show pages with issues (score > 50) or events, to keep it compact
        if (s.score <= 50 && s.events === 0 && s.splits === 0 && s.moves === 0) continue;
        const viol = [
          ...(s.violations || []),
          ...(s.chapterEnd ? ['chapter_end'] : [])
        ].join(', ');
        lines.push(
          `${String(s.page).padStart(4)} | ${String(s.fillPct + '%').padStart(5)} | ${String(s.score).padStart(5)} | ${String(s.qualityGrade || '?').padStart(3)} | ${String(s.splits).padStart(6)} | ${String(s.moves).padStart(5)} | ${viol}`
        );
      }

      // Interior short-line report
      const pagesWithShortLines = summary.filter(
        s => !s.blank && s.violations?.includes('interior_short_line')
      );
      if (pagesWithShortLines.length > 0) {
        lines.push('');
        lines.push(`INTERIOR SHORT LINES (${pagesWithShortLines.length} pages):`);
        for (const s of pagesWithShortLines) {
          const affected = (s.lineAnalysis || [])
            .filter(la => la.interiorShortLines > 0)
            .map(la => `p${la.index}(${la.interiorShortLines}sh,${la.lineCount}ln,${la.lastLineWords}w)`)
            .join(', ');
          lines.push(`  p${s.page} [${s.chapter || '?'}] ${affected || '?'}`);
        }
      }

      // Grade distribution summary
      const realPages = summary.filter(s => !s.blank);
      const gradeCounts = { A: 0, B: 0, C: 0, D: 0, F: 0 };
      for (const s of realPages) gradeCounts[s.qualityGrade || 'F']++;
      const chapterEndCount = realPages.filter(s => s.chapterEnd).length;
      lines.push('');
      lines.push(`Quality: A=${gradeCounts.A} B=${gradeCounts.B} C=${gradeCounts.C} D=${gradeCounts.D} F=${gradeCounts.F} | ChapterEnd=${chapterEndCount}`);
      const worstPages = realPages.filter(s => s.qualityGrade === 'F' || s.qualityGrade === 'D').map(s => `p${s.page}(${s.fillPct}%)`);
      if (worstPages.length > 0) lines.push(`Worst: ${worstPages.join(', ')}`);

      // Visual page layout for anomaly pages and C/D/F pages
      const pageView = this.formatPageView();
      if (pageView && pageView !== '(no pages to show)') {
        lines.push('');
        lines.push('PAGE LAYOUT VIEW (anomaly + C/D/F pages):');
        lines.push(pageView);
      }

      return lines.join('\n');
    },

    /**
     * Format detailed events for a specific page.
     * @param {number} pageNum - 1-based page number
     * @returns {string}
     */
    formatPageDetail(pageNum) {
      const pageEntries = entries.filter(e => e.page === pageNum);
      if (pageEntries.length === 0) return `(no events for page ${pageNum})`;
      const lines = [`EVENTS FOR PAGE ${pageNum} (${pageEntries.length} events):`];
      for (const e of pageEntries) {
        const d = e.data || {};
        let detail = `[${e.traceId}] ${e.phase}/${e.type}`;
        if (d.tag) detail += ` <${d.tag}>`;
        if (d.text) detail += ` "${d.text.substring(0, 50)}"`;
        if (d.reason) detail += ` reason=${d.reason}`;
        if (d.before && d.after) {
          detail += ` before={fill:${d.before.fillPct || '?'}%,score:${d.before.score || '?'}} after={fill:${d.after.fillPct || '?'}%,score:${d.after.score || '?'}}`;
        }
        if (d.candidateH) detail += ` candidateH=${d.candidateH}`;
        if (d.contentH) detail += ` contentH=${d.contentH}`;
        lines.push(detail);
      }
      return lines.join('\n');
    },

    /**
     * Render pages in groups of 3 side-by-side columns.
     * The 3rd page of each group is the 1st of the next group (sliding window +2).
     * This mirrors how you see a book: left page / right page / next left page.
     *
     * Element markers:
     *   ══ H1 title        ── H2 subhead      ·· H3+
     *   ¶  indent (new §)  ·  continuation    (space) first-on-page / no-indent ok
     *   !! MISSING INDENT  ~~ ambiguous        •  list   ❝  blockquote
     *
     * @param {number[]} [pageNums] - specific pages to show. Omit = all non-blank pages.
     * @returns {string}
     */
    formatPageView(pageNums) {
      if (!summary) return '(no summary — call generateSummary first)';

      const allReal = summary.filter(s => !s.blank);
      let pool;
      if (pageNums == null) {
        pool = allReal;
      } else {
        const nums = Array.isArray(pageNums) ? pageNums : [pageNums];
        pool = allReal.filter(s => nums.includes(s.page));
      }
      if (pool.length === 0) return '(no pages to show)';

      // Build a lookup by page number for easy neighbour access
      const byPage = {};
      for (const s of allReal) byPage[s.page] = s;

      // Collect groups of 3: for each page in pool, take [page-1, page, page+1]
      // then deduplicate groups by their start page, sliding by 2.
      const COL_W = 28;   // content chars per column
      const SEP = ' │ ';  // column separator
      const lines = [];

      // Build the sliding groups: start at pool[0], advance by 2 each time
      const pageNums_ = pool.map(s => s.page);
      const visited = new Set();
      let i = 0;
      while (i < pageNums_.length) {
        const anchor = pageNums_[i];
        if (visited.has(anchor)) { i += 2; continue; }

        // group = [anchor-1, anchor, anchor+1] clamped to available pages
        const groupPages = [anchor - 1, anchor, anchor + 1]
          .map(n => byPage[n] || null);

        // Mark the anchor and anchor+1 as visited so next iteration starts at anchor+2
        visited.add(anchor);
        if (byPage[anchor + 1]) visited.add(anchor + 1);
        i += 2;

        // Render header row
        const headers = groupPages.map(s => {
          if (!s) return ' '.repeat(COL_W);
          const grade = s.qualityGrade || '?';
          const flag = (s.indentAnomalies && s.indentAnomalies.length > 0) ? '!!' :
                       grade === 'C' ? ' ⚠' : grade === 'D' || grade === 'F' ? ' ✖' : '';
          const label = `p${s.page} ${s.fillPct}% ${grade}${flag}`;
          return label.padEnd(COL_W).substring(0, COL_W);
        });
        lines.push('');
        lines.push(headers.join(SEP));
        lines.push('─'.repeat(COL_W) + '─┼─' + '─'.repeat(COL_W) + '─┼─' + '─'.repeat(COL_W));

        // Render element rows — pad each column to same height
        const cols = groupPages.map(s => {
          if (!s || !s.html) return ['(blank)'];
          return renderPageLines(s, COL_W);
        });
        const height = Math.max(...cols.map(c => c.length));
        for (let r = 0; r < height; r++) {
          const row = cols.map(c => (c[r] || '').padEnd(COL_W).substring(0, COL_W));
          lines.push(row.join(SEP));
        }

        // Fill bar row
        const bars = groupPages.map(s => {
          if (!s) return ' '.repeat(COL_W);
          const filled = Math.min(COL_W, Math.max(0, Math.round((s.fillPct / 100) * COL_W)));
          return '█'.repeat(filled) + '░'.repeat(COL_W - filled);
        });
        lines.push('─'.repeat(COL_W) + '─┼─' + '─'.repeat(COL_W) + '─┼─' + '─'.repeat(COL_W));
        lines.push(bars.join(SEP));
      }

      return lines.join('\n');
    }
  };
}

// ─── Page line renderer (for formatPageView columns) ─────────────────────────

/**
 * Render a summary entry's HTML as an array of fixed-width strings (one per element).
 * Each string is exactly colW chars (padded / truncated).
 *
 * Markers:
 *   ══ H1   ── H2   ·· H3+
 *   ¶  <p> with indent (new paragraph)
 *   ·  <p data-continuation> (mid-sentence rest)
 *      (two spaces) first-on-page <p> with no indent — ok
 *   !! MISSING — <p> uppercase start with zero indent (bug)
 *   ~~ <p> lowercase start with zero indent (ambiguous)
 *   •  UL/OL list item   ❝  BLOCKQUOTE
 */
function renderPageLines(s, colW) {
  if (!s || !s.html) return ['(empty)'.padEnd(colW).substring(0, colW)];
  const elements = parseAllElements(s.html);
  if (elements.length === 0) return ['(no elements)'.padEnd(colW).substring(0, colW)];

  // Build anomaly index keyed by element index for O(1) lookup
  const anomalyByIdx = {};
  if (s.indentAnomalies) {
    for (const a of s.indentAnomalies) anomalyByIdx[a.index] = a;
  }

  // Track paragraph counter to identify first-on-page <p>
  let pIdx = 0;

  return elements.map((el) => {
    const text = el.text || '';
    // lineAnalysis entry for this element (by paragraph index)
    const la = s.lineAnalysis ? s.lineAnalysis.find(l => l.index === el.index) : null;
    // Prefix lineCount when available: "[3L]"
    const lineInfo = (la && la.lineCount > 0) ? `[${la.lineCount}L]` : '';
    // Truncate text to fit within colW minus marker prefix (3 chars: "XX ") minus lineInfo
    const maxText = colW - 3 - lineInfo.length;
    const snippet = text.length > maxText ? text.substring(0, maxText - 1) + '…' : text;

    let marker;
    switch (el.tag) {
      case 'H1': marker = '══'; break;
      case 'H2': marker = '──'; break;
      case 'H3': case 'H4': case 'H5': case 'H6': marker = '··'; break;
      case 'UL': case 'OL': marker = '• '; break;
      case 'BLOCKQUOTE': marker = '❝ '; break;
      case 'P': {
        const isFirstP = pIdx === 0;
        pIdx++;
        const anomaly = anomalyByIdx[el.index];
        if (anomaly) {
          marker = anomaly.kind === 'missing-indent' ? '!!' :
                   anomaly.kind === 'indent-on-cont' ? '!c' : '~~';
        } else if (el.isContinuation) {
          marker = '· ';
        } else if (isFirstP) {
          marker = '  '; // first on page — no indent expected
        } else {
          marker = '¶ ';
          // Annotate runts, widows, orphans, and interior short lines from lineAnalysis
          if (la) {
            if (la.isRunt)                                          marker = '¶R';
            if (la.isWidow)                                         marker = '·W';
            if (la.isOrphan && !la.isWidow)                         marker = '·O';
            if (la.interiorShortLines > 0 && !la.isRunt
                && !la.isWidow && !la.isOrphan)                     marker = '¶S';
          }
        }
        break;
      }
      default: marker = '  ';
    }

    // Pad marker to exactly 2 chars
    const m = (marker + '  ').substring(0, 2);
    const line = `${m} ${lineInfo}${snippet}`;
    return line.padEnd(colW).substring(0, colW);
  });
}

// ─── Full element inspector (all tags, not just <p>) ─────────────────────────

/**
 * Like inspectParagraphs but handles all top-level tags.
 * Returns { tag, isContinuation, indentValue, indentNum, text, index }
 */
function parseAllElements(pageHtml) {
  if (!pageHtml) return [];
  return parseTopLevelBlocks(pageHtml)
    .map((block, index) => {
      const indentMatch = (block.style || '').match(/text-indent\s*:\s*([^;]+)/i);
      const indentValue = indentMatch ? indentMatch[1].trim() : null;
      return {
        tag: block.tag,
        isContinuation: block.dataset?.continuation === 'true',
        indentValue,
        indentNum: indentValue ? parseFloat(indentValue) : null,
        text: htmlToText(block.outerHtml).replace(/\s+/g, ' ').trim().substring(0, 100),
        index
      };
    });
}

// ─── HTML snapshot helpers ────────────────────────────────────────────────────

function structureSummary(html) {
  if (!html) return { elementCount: 0, paragraphs: 0, headings: 0, lists: 0, blockquotes: 0 };
  const els = parseAllElements(html);
  return {
    elementCount: els.length,
    paragraphs:   els.filter(e => e.tag === 'P').length,
    headings:     els.filter(e => /^H[1-6]$/.test(e.tag)).length,
    lists:        els.filter(e => e.tag === 'UL' || e.tag === 'OL').length,
    blockquotes:  els.filter(e => e.tag === 'BLOCKQUOTE').length
  };
}

const MAX_SNAPSHOT_CHARS = 2000;
function makeHtmlSnapshot(html) {
  if (!IS_DEV || !html) return null;
  const trimmed = html.length > MAX_SNAPSHOT_CHARS
    ? html.substring(0, MAX_SNAPSHOT_CHARS) + '…[truncated]'
    : html;
  return { html: trimmed, structure: structureSummary(html) };
}

// ─── Stable block/fragment ID assignment ─────────────────────────────────────

let _blockCounter = 0;

/** Reset block counter — call at the start of each paginateChapters() run. */
export function resetBlockCounter() { _blockCounter = 0; }

/**
 * Assign a fresh sourceBlockId to a flat element descriptor.
 * Mutates `el` in-place. No-op in production.
 */
export function assignBlockId(el, chapterId, elementIndex) {
  if (!IS_DEV) return;
  el.sourceBlockId     = `b${_blockCounter++}`;
  el.sourceParagraphId = (el.tag === 'P' || el.tag === 'DIV') ? `p${_blockCounter - 1}` : null;
  el.chapterId         = chapterId;
  el.fragmentIndex     = 0;
  el.continuedFrom     = null;
}

/**
 * Derive fragment identity for a split "rest" chunk from the original element.
 */
export function deriveFragmentId(sourceEl) {
  if (!IS_DEV || !sourceEl?.sourceBlockId) return {};
  return {
    sourceBlockId:     sourceEl.sourceBlockId,
    sourceParagraphId: sourceEl.sourceParagraphId,
    chapterId:         sourceEl.chapterId,
    fragmentIndex:     (sourceEl.fragmentIndex || 0) + 1,
    continuedFrom:     sourceEl.sourceBlockId
  };
}

/**
 * Inject block identity attributes into an HTML element string.
 * String-only — no DOM. Worker-safe.
 */
export function injectBlockIdAttrs(html, ids) {
  if (!IS_DEV || !html || !ids?.sourceBlockId) return html;
  const attrs = ` data-block-id="${ids.sourceBlockId}" data-fragment-index="${ids.fragmentIndex ?? 0}"` +
    (ids.continuedFrom ? ` data-continued-from="${ids.continuedFrom}"` : '');
  return html.replace(/^(<[a-zA-Z][^>]*?)(\s*\/?>)/, (_, open, close) => `${open}${attrs}${close}`);
}

// ─── Line-level paragraph analysis ───────────────────────────────────────────

/**
 * Compute line-level analysis for all <p> elements on a page.
 * Uses injected _measureFn from canvasCtx — worker-safe.
 *
 * @param {string} pageHtml
 * @param {object} canvasCtx — must have _measureFn, contentWidth, widthSlack
 * @returns {Array<{ index, text, lineCount, lastLineWords, lastLineWidthRatio, isRunt, isWidow, isOrphan }>}
 */
export function analyzePageLines(pageHtml, canvasCtx) {
  if (!IS_DEV || !pageHtml || !canvasCtx?._computeLineMetricsFn) return [];
  const paragraphs = inspectParagraphs(pageHtml);
  if (paragraphs.length === 0) return [];

  return paragraphs.map((p, idx) => {
    const isLastOnPage = idx === paragraphs.length - 1;
    const isSplitFrag = p.isContinuation || p.isSplitHead;
    const m = canvasCtx._computeLineMetricsFn(p.fullText || p.text, isSplitFrag, isLastOnPage);
    return {
      index:              idx,
      text:               p.text,
      lineCount:          m.lineCount,
      lastLineWords:      m.lastLineWords,
      lastLineWidthRatio: m.lastLineWidthRatio,
      interiorShortLines: m.interiorShortLines,
      isRunt:             m.isRunt,
      isWidow:            m.isWidow,
      isOrphan:           m.isOrphan
    };
  });
}

/** Default logger instance for normal use */
export const defaultLogger = createPaginationLogger();
