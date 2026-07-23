import { measureHtmlHeight } from './textLayoutEngine.js';

/**
 * footnotes.js — footnote detection (Word/mammoth import) + footnote-block
 * height measurement for the pagination engine.
 *
 * String/regex based (no DOM) so it is worker-safe: the pagination engine runs
 * in a worker and needs `footnoteBlockHeight` there; `detectFootnotes` also
 * works on the main thread at import time.
 *
 * Normalized model:
 *   - body marker:  <sup data-fn="refId">N</sup>   (single canonical form)
 *   - notes:        [{ refId, index, html }]        (index = order of appearance)
 */

// ── Detection (mammoth / HTML import → normalized model) ─────────────────────

// mammoth footnote reference in the body: <sup><a href="#ftn1" ...>1</a></sup>
// Also accept the common variants #_ftn1 / #footnote-1 / #fn1.
const REF_RE =
  /<sup[^>]*>\s*<a[^>]*href="#(_?(?:ftn|fn|footnote-?))(\d+)"[^>]*>[\s\S]*?<\/a>\s*<\/sup>/gi;

// A note definition block at the end of the doc: <div id="ftn1">…</div> or
// <li id="ftn1">…</li>. We capture its inner HTML as the note content.
const noteDefRe = (num) =>
  new RegExp(
    `<(div|li|p)[^>]*id="_?(?:ftn|fn|footnote-?)${num}"[^>]*>([\\s\\S]*?)<\\/\\1>`,
    'i'
  );

// Strip the back-reference arrow mammoth appends to each note ("↑" linking back
// to the body), and any leading number, so the note content is clean prose.
const cleanNoteHtml = (html) =>
  (html || '')
    .replace(/<a[^>]*href="#(_?(?:ftnref|fnref|footnote-ref-?))\d+"[^>]*>[\s\S]*?<\/a>/gi, '')
    .replace(/^\s*<p[^>]*>\s*/i, '<p>')
    .trim();

/**
 * Detect footnotes in a chapter's HTML.
 * @returns {{ cleanHtml: string, notes: Array<{refId,index,html}> }}
 *   cleanHtml: body with markers normalized to <sup data-fn="refId">N</sup> and
 *              the note-definition blocks removed.
 *   notes:     one entry per marker, in order of appearance.
 */
export const detectFootnotes = (html) => {
  if (!html || typeof html !== 'string' || !/<sup/i.test(html)) {
    return { cleanHtml: html || '', notes: [] };
  }

  const notes = [];
  let index = 0;
  // Replace each body reference with a normalized marker, collecting its note.
  const cleanBody = html.replace(REF_RE, (_m, prefix, num) => {
    const refId = `fn${num}`;
    index += 1;
    const m = html.match(noteDefRe(num));
    const noteHtml = m ? cleanNoteHtml(m[2]) : '';
    notes.push({ refId, index, html: noteHtml });
    return `<sup data-fn="${refId}">${index}</sup>`;
  });

  if (notes.length === 0) return { cleanHtml: html, notes: [] };

  // Remove the note-definition blocks from the body (they lived at the end).
  let cleanHtml = cleanBody;
  for (const n of notes) {
    const num = n.refId.replace('fn', '');
    cleanHtml = cleanHtml.replace(noteDefRe(num), '');
  }
  // Also drop a now-empty footnotes wrapper/hr mammoth sometimes leaves behind.
  cleanHtml = cleanHtml.replace(/<hr[^>]*>\s*(?=$)/i, '').trim();

  return { cleanHtml, notes };
};

// The refIds referenced (via <sup data-fn="…">) inside a page/candidate HTML,
// in order of first appearance. Worker-safe (regex over the string).
const FN_MARK_RE = /data-fn="([^"]+)"/g;
export const footnoteRefsIn = (html) => {
  if (!html || html.indexOf('data-fn=') === -1) return [];
  const out = [];
  const seen = new Set();
  let m;
  FN_MARK_RE.lastIndex = 0;
  while ((m = FN_MARK_RE.exec(html)) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); out.push(m[1]); }
  }
  return out;
};

// ── Footnote block height (for the pagination budget) ────────────────────────

// Cache by ordered refId set + ctx signature — a burst of DP candidates asks
// for the same footnote set repeatedly.
const _fnHeightCache = new Map();
const MAX_FN_CACHE = 2000;

/**
 * Build the footnote block HTML for a set of notes (thin rule + each note at
 * reduced size). Kept here so preview/PDF can render the SAME markup.
 */
export const buildFootnoteBlockHtml = (notes, fnCtx) => {
  if (!notes || notes.length === 0) return '';
  const ruleTopPx = Math.round((fnCtx?.marginAbovePx ?? 6));
  const rule = `<div style="border-top:0.5px solid #333;margin:${ruleTopPx}px 0 3px 0;height:0;"></div>`;
  const items = notes
    .map((n) => `<p style="margin:0 0 2px 0;"><sup>${n.index}</sup> ${n.html || ''}</p>`)
    .join('');
  return rule + items;
};

/**
 * Height (px) of the footnote block for the given refIds, measured with the
 * reduced-size footnote ctx via the SAME measureHtmlHeight the engine uses.
 * @param {string[]} refIds
 * @param {Map<string,{index,html}>} notesMap
 * @param {object} fnCtx - { baseFontSizePx, baseLineHeight, contentWidth, fontFamily, marginAbovePx }
 */
export const footnoteBlockHeight = (refIds, notesMap, fnCtx) => {
  if (!refIds || refIds.length === 0 || !notesMap) return 0;
  const notes = refIds.map((id) => notesMap.get(id)).filter(Boolean);
  if (notes.length === 0) return 0;

  const key = `${fnCtx.baseFontSizePx}|${fnCtx.contentWidth}|${notes.map((n) => n.index).join(',')}`;
  const hit = _fnHeightCache.get(key);
  if (hit !== undefined) return hit;

  const html = buildFootnoteBlockHtml(notes, fnCtx);
  const h = measureHtmlHeight(html, fnCtx);
  if (_fnHeightCache.size > MAX_FN_CACHE) _fnHeightCache.clear();
  _fnHeightCache.set(key, h);
  return h;
};

/** Build the reduced-size measurement/render ctx for footnotes from the body ctx. */
export const makeFootnoteCtx = (bodyCtx, footnotesConfig = {}) => {
  const fontScale = footnotesConfig.fontScale ?? 0.72;
  const lineHeight = footnotesConfig.lineHeight ?? 1.4;
  return {
    ...bodyCtx,
    baseFontSizePx: bodyCtx.baseFontSizePx * fontScale,
    baseLineHeight: lineHeight,
    // ~ one body line of air above the rule (in px of the body grid).
    marginAbovePx: Math.round((bodyCtx.lineHeightPx || (bodyCtx.baseFontSizePx * bodyCtx.baseLineHeight)) * 0.6),
  };
};
