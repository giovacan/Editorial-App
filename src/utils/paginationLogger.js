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

const IS_DEV = process.env.NODE_ENV === 'development';

/**
 * Create a new pagination logger instance.
 * @returns {PaginationLogger}
 */
export function createPaginationLogger() {
  let entries = [];
  let config = null;
  let summary = null;
  let counter = 0;

  return {
    /** Clear all entries — call at the start of paginateChapters() */
    reset() {
      entries = [];
      config = null;
      summary = null;
      counter = 0;
    },

    /** Store a snapshot of the pagination config for the log */
    setConfig(configSnapshot) {
      config = configSnapshot;
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
      counter++;
      entries.push({
        phase,
        type,
        page,
        traceId: `${phase}-p${page}-${counter}`,
        data
      });
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
        const q = evaluateFn(p.html, contentHeight, lineHeightPx, canvasCtx);
        const pageEntries = entries.filter(e => e.page === i + 1);
        const splits = pageEntries.filter(e => e.type === 'split').length;
        const moves = pageEntries.filter(e => e.type === 'move' || e.type === 'heading-group').length;
        // Count elements in the page HTML
        const tmp = typeof document !== 'undefined' ? document.createElement('div') : null;
        let elCount = 0;
        if (tmp) { tmp.innerHTML = p.html; elCount = tmp.children.length; }

        return {
          page: i + 1,
          chapter: p.chapterTitle || '',
          fillPct: Math.round(q.fillPct != null ? q.fillPct * 100 : 0),
          score: Math.round(q.score),
          violations: q.violations || [],
          elements: elCount,
          events: pageEntries.length,
          splits,
          moves,
          unstable: splits > 0 || moves > 1
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
      lines.push('');
      lines.push('Page | Fill% | Score | Splits | Moves | Violations');
      lines.push('-----+-------+-------+--------+-------+-----------');

      for (const s of summary) {
        if (s.blank) continue;
        // Only show pages with issues (score > 50) or events, to keep it compact
        if (s.score <= 50 && s.events === 0 && s.splits === 0 && s.moves === 0) continue;
        const viol = s.violations.length > 0 ? s.violations.join(', ') : '';
        lines.push(
          `${String(s.page).padStart(4)} | ${String(s.fillPct + '%').padStart(5)} | ${String(s.score).padStart(5)} | ${String(s.splits).padStart(6)} | ${String(s.moves).padStart(5)} | ${viol}`
        );
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
    }
  };
}

/** Default logger instance for normal use */
export const defaultLogger = createPaginationLogger();
