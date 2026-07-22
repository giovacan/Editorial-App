import { htmlToText } from './layoutIr';
import { collapseWhitespace } from './textPreprocess';

/**
 * bookSearch — plain-text search across the book's CHAPTERS (the editable
 * source), so results can jump into the editor and select the term.
 *
 * Pure and deterministic. Case- and accent-insensitive ("cancion" finds
 * "canción"). A "match" is one occurrence:
 *   { chapterId, chapterIndex, chapterTitle, snippet, matchInSnippet:[s,e],
 *     wordIndex }
 * `matchInSnippet` is the [s,e) offset of the hit WITHIN `snippet` (to bold it
 * in the results list). `wordIndex` is the 0-based index of the occurrence among
 * ALL folded-text occurrences in that chapter — the editor uses it to locate the
 * Nth hit in the tiptap doc (robust to tag/whitespace differences).
 */

// Fold accents + lowercase so search is diacritic-insensitive. 1:1 per char,
// so offsets stay aligned with the un-folded text.
export const foldText = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

// Plain, collapsed text of an HTML string (tags stripped, whitespace normalized).
export const htmlPlainText = (html) =>
  collapseWhitespace(htmlToText(html || '')).trim();

const SNIPPET_RADIUS = 40; // chars of context on each side of the hit

/**
 * Search all chapters for `query`. Returns { matches, total, capped? }.
 * @param {Array}  chapters - bookData.chapters ([{ id, title, html }])
 * @param {string} query    - raw user query
 * @param {object} [opts]   - { maxMatches } (default 500)
 */
export const searchChapters = (chapters, query, opts = {}) => {
  const q = collapseWhitespace(query || '').trim();
  if (!q || !Array.isArray(chapters) || chapters.length === 0) return { matches: [], total: 0 };

  const maxMatches = opts.maxMatches ?? 500;
  const needle = foldText(q);
  const nLen = needle.length;
  if (!nLen) return { matches: [], total: 0 };
  const matches = [];

  for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex++) {
    const ch = chapters[chapterIndex];
    const text = htmlPlainText(ch?.html || '');
    if (!text) continue;
    const hay = foldText(text);

    let from = 0;
    let wordIndex = 0; // occurrence index within this chapter
    let idx = hay.indexOf(needle, from);
    while (idx !== -1) {
      const start = Math.max(0, idx - SNIPPET_RADIUS);
      const end = Math.min(text.length, idx + nLen + SNIPPET_RADIUS);
      const prefix = start > 0 ? '…' : '';
      const suffix = end < text.length ? '…' : '';
      const snippet = prefix + text.slice(start, end) + suffix;
      const inSnippetStart = prefix.length + (idx - start);
      matches.push({
        chapterId: ch.id,
        chapterIndex,
        chapterTitle: ch.title || '',
        snippet,
        matchInSnippet: [inSnippetStart, inSnippetStart + nLen],
        wordIndex,
      });
      if (matches.length >= maxMatches) return { matches, total: matches.length, capped: true };
      wordIndex++;
      from = idx + nLen;
      idx = hay.indexOf(needle, from);
    }
  }

  return { matches, total: matches.length };
};
