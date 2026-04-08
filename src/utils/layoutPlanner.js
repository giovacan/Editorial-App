/**
 * layoutPlanner.js
 *
 * Phase 1: local, deterministic layout-planning layer.
 * Produces editorial hints that can later be replaced by a remote LLM planner
 * without changing the pagination pipeline contract.
 */

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const stripHtml = (html = '') => html
  .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
  .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const countMatches = (html = '', regex) => (html.match(regex) || []).length;

const extractChapterSignals = (chapter) => {
  const html = chapter?.html || '';
  const plainText = stripHtml(html);
  const paragraphs = (html.match(/<(p|div)\b/gi) || []).length;
  const headings = (html.match(/<h[1-6]\b/gi) || []).length;
  const blockquotes = countMatches(html, /<blockquote\b/gi);
  const unorderedLists = countMatches(html, /<ul\b/gi);
  const orderedLists = countMatches(html, /<ol\b/gi);
  const words = plainText ? plainText.split(/\s+/).filter(Boolean) : [];
  const lines = plainText.split(/[.!?]\s+|\n+/).filter(Boolean);
  const shortLineCount = lines.filter(line => line.trim().split(/\s+/).length <= 8).length;
  const shortLineRatio = lines.length > 0 ? shortLineCount / lines.length : 0;
  // Average word length — short avg (Spanish connectors: "y", "a", "en", "de") means
  // a 6-word last line may be visually as narrow as a 3-word English line.
  const avgWordLength = words.length > 0
    ? words.reduce((sum, w) => sum + w.length, 0) / words.length
    : 5;

  return {
    chapterId: chapter?.id || null,
    chapterTitle: chapter?.title || '',
    wordCount: words.length,
    paragraphs,
    headings,
    blockquotes,
    lists: unorderedLists + orderedLists,
    shortLineRatio,
    avgWordLength,
  };
};

const deriveTargetFillPct = (baseTargetFillPct, signals) => {
  let target = baseTargetFillPct;

  // Dialogue / poetry / devotional-like chapters: accept more breathing room.
  if (signals.shortLineRatio >= 0.45) {
    target = Math.min(target, 0.86);
  } else if (signals.blockquotes >= 2 || signals.lists >= 2) {
    target = Math.min(target, 0.88);
  } else if (signals.wordCount <= 450) {
    target = Math.min(target, 0.89);
  }

  return clamp(Number(target.toFixed(2)), 0.82, 0.95);
};

const deriveMinLastLineWords = (signals) => {
  // Base: 6 words minimum for last lines.
  // Short-word manuscripts (Spanish: avg word length < 4.5 chars → "y", "a", "de", "en")
  // need a higher threshold because 6 short words may render narrower than 4 long words.
  const avgLen = signals.avgWordLength ?? 5;
  if (avgLen < 4.0) return 8;   // very short words: "y en la fe de Dios" — 7 words can be narrow
  if (avgLen < 4.5) return 7;   // short words: Spanish connectors dominate
  return 6;                     // normal word length: 6 words is sufficient
};

export const planLayoutHints = (chapters, safeConfig = {}) => {
  const list = Array.isArray(chapters) ? chapters : [];
  const baseTargetFillPct = safeConfig?.pagination?.targetFillPct ?? 0.92;
  const chapterSignals = list.map(extractChapterSignals);

  const totalBlockquotes = chapterSignals.reduce((sum, chapter) => sum + chapter.blockquotes, 0);
  const totalLists = chapterSignals.reduce((sum, chapter) => sum + chapter.lists, 0);
  const avgShortLineRatio = chapterSignals.length > 0
    ? chapterSignals.reduce((sum, chapter) => sum + chapter.shortLineRatio, 0) / chapterSignals.length
    : 0;

  const globalTargetFillPct = deriveTargetFillPct(baseTargetFillPct, {
    shortLineRatio: avgShortLineRatio,
    blockquotes: totalBlockquotes,
    lists: totalLists,
    wordCount: chapterSignals.reduce((sum, chapter) => sum + chapter.wordCount, 0),
  });
  const globalMinLastLineWords = deriveMinLastLineWords({
    shortLineRatio: avgShortLineRatio,
    blockquotes: totalBlockquotes,
    lists: totalLists,
    wordCount: chapterSignals.reduce((sum, chapter) => sum + chapter.wordCount, 0),
  });

  const avoidSplitTags = new Set();
  const keepWithNextTags = new Set(['H1', 'H2', 'H3']);
  const notes = [];

  if (totalBlockquotes > 0) {
    avoidSplitTags.add('BLOCKQUOTE');
    keepWithNextTags.add('BLOCKQUOTE');
    notes.push('preserve_blockquotes_when_possible');
  }

  if (totalLists > 0) {
    avoidSplitTags.add('UL');
    avoidSplitTags.add('OL');
    notes.push('avoid_list_fragmentation_when_possible');
  }

  if (avgShortLineRatio >= 0.45) {
    notes.push('manuscript_prefers_breathing_room');
  }

  return {
    version: 'local-heuristic-v1',
    global: {
      targetFillPct: globalTargetFillPct,
      minLastLineWords: globalMinLastLineWords,
      repairPriority: ['widow', 'orphan', 'runt_line'],
      avoidSplitTags: [...avoidSplitTags],
      keepWithNextTags: [...keepWithNextTags],
      notes,
    },
    chapters: chapterSignals.map(signals => ({
      chapterId: signals.chapterId,
      chapterTitle: signals.chapterTitle,
      targetFillPct: deriveTargetFillPct(globalTargetFillPct, signals),
      minLastLineWords: deriveMinLastLineWords(signals),
      avoidSplitTags: signals.blockquotes > 0 ? ['BLOCKQUOTE'] : [],
      keepWithNextTags: signals.headings > 0 ? ['H1', 'H2', 'H3'] : [],
      notes: [
        ...(signals.shortLineRatio >= 0.45 ? ['airy_chapter'] : []),
        ...(signals.blockquotes > 0 ? ['contains_blockquotes'] : []),
        ...(signals.lists > 0 ? ['contains_lists'] : []),
      ],
    })),
  };
};
