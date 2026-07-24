/**
 * chapterDraft.js — pure edits on a DRAFT array of chapters, for the import
 * "Revisa tus capítulos" step. All functions return a NEW array (immutable) and
 * never touch the store; the store is updated only when the user hits Continuar.
 *
 * Mirrors the store's mergeChapterIntoPrevious/splitChapter logic but over a
 * local array, so the review step can preview edits before committing.
 */
import { composeTitle } from './chapterTitle.js';

const wordCount = (html) =>
  (html || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

/**
 * Merge the chapter `id` into the PREVIOUS one. The absorbed chapter's title is
 * kept as an inner <h3> so no line is lost; html/wordCount/footnotes append.
 * No-op if it's the first chapter or not found.
 */
export const mergeIntoPrevious = (chapters, id) => {
  const idx = chapters.findIndex((c) => c.id === id);
  if (idx <= 0) return chapters;
  const cur = chapters[idx];
  const prev = chapters[idx - 1];
  const subtitle = (cur.chapterName || cur.title || '').trim();
  const subHtml = subtitle ? `<h3>${subtitle}</h3>` : '';
  const mergedHtml = `${prev.html || ''}${subHtml}${cur.html || ''}`;
  const merged = {
    ...prev,
    html: mergedHtml,
    wordCount: wordCount(mergedHtml),
    footnotes: [ ...(prev.footnotes || []), ...(cur.footnotes || []) ],
  };
  const out = chapters.slice();
  out[idx - 1] = merged;
  out.splice(idx, 1);
  return out;
};

/** Move a chapter from one index to another (bounds-checked). */
export const moveChapter = (chapters, from, to) => {
  if (from < 0 || from >= chapters.length || to < 0 || to >= chapters.length || from === to) {
    return chapters;
  }
  const out = chapters.slice();
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved);
  return out;
};

/** Remove a chapter by id (never removes the last remaining chapter). */
export const removeChapter = (chapters, id) => {
  if (chapters.length <= 1) return chapters;
  return chapters.filter((c) => c.id !== id);
};

/**
 * Update a chapter's label/name and recompose its title. Pass only the fields
 * you're changing; the other is read from the current chapter.
 */
export const updateFields = (chapters, id, { label, name }) => {
  return chapters.map((c) => {
    if (c.id !== id) return c;
    const nextLabel = label !== undefined ? label : (c.chapterLabel || '');
    const nextName = name !== undefined ? name : (c.chapterName || '');
    return {
      ...c,
      chapterLabel: (nextLabel || '').trim(),
      chapterName: (nextName || '').trim(),
      title: composeTitle(nextLabel, nextName) || 'Sin título',
    };
  });
};
