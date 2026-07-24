/**
 * chapterTitle.js — compose/split a chapter's display title from its structural
 * label ("CAPÍTULO 2") and its name ("Dios El Padre").
 *
 * Shared by the import parser (contentParser.js) and the structure editor
 * (ChapterItem) so both build the title identically (two spaces between label
 * and name; no duplication when name === label or one side is empty).
 */

/** label + name → display title (matches contentParser's composeTitle). */
export const composeTitle = (label, name) => {
  const l = (label || '').trim();
  const n = (name || '').trim();
  if (l && n && n.toUpperCase() !== l.toUpperCase()) return `${l}  ${n}`;
  return l || n;
};

// Structural label at the START of a title: "CAPÍTULO 3", "LECCIÓN 12",
// "PARTE 1", "CAP. 4"… (Spanish/English), optionally followed by the name.
const LABEL_RE = /^\s*((?:cap[íi]tulo|cap\.?|lecci[óo]n|secci[óo]n|unidad|m[óo]dulo|tema|sesi[óo]n|d[íi]a|parte|chapter|lesson|section|unit|module|part|book|libro)\s*#?\s*(?:\d+|[ivxlcdm]+))\s*[-–—:.\t ]*/i;

/**
 * Split a composed title into { label, name }. Used to prefill the editor's two
 * fields. If there's no recognizable label, everything is the name.
 * @param {string} title
 * @returns {{ label: string, name: string }}
 */
export const parseLabelAndName = (title) => {
  const t = (title || '').trim();
  const m = t.match(LABEL_RE);
  if (m) {
    return { label: m[1].replace(/\s+/g, ' ').trim().toUpperCase(), name: t.slice(m[0].length).trim() };
  }
  return { label: '', name: t };
};
