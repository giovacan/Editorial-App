/**
 * tocPdfParser.js — pure parser for the TOC page HTML that generateFrontMatter
 * emits, so the vector PDF can redraw it with real flex-like layout instead of
 * flattening it (title + 150 leader dots + page number overlapped — the
 * "tabla de contenido solapada" bug).
 *
 * Page shape (generateFrontMatter Phase 4):
 *   <div style="padding: 0 12px; text-align:left; position:relative;">
 *     [<div style="text-align:center; font-size:1.1em; font-weight:bold;
 *        margin-bottom:Npx; line-height:Npx; letter-spacing:X;">Índice</div>]
 *     <div style="display:flex; ... margin-top:Mpx; margin-bottom:Npx;
 *        font-size:0.88em; font-weight:700; padding-left:Ipx; line-height:Lpx;">
 *       <span style="flex:1 1 0; height:Hpx; ...">Título[ <span>. . .</span>]</span>
 *       <span style="flex:0 0 Wpx; text-align:right; font-size:0.9em; ...">12</span>
 *     </div>
 *     ...
 *   </div>
 *
 * All parsing is string/regex based (no DOM) and returns raw px/em values as
 * authored — the caller resolves em against the page's base font px.
 */

const ENTITIES = { '&amp;': '&', '&nbsp;': ' ', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const unescapeHtml = (s = '') => s.replace(/&(amp|nbsp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] || m);
const stripTags = (s = '') => unescapeHtml(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

const styleOf = (openTag = '') => (openTag.match(/style="([^"]*)"/) || ['', ''])[1];
const num = (style, prop, def = 0) => {
  const m = style.match(new RegExp(`${prop}:\\s*(-?[\\d.]+)px`, 'i'));
  return m ? parseFloat(m[1]) : def;
};
const em = (style, prop, def = null) => {
  const m = style.match(new RegExp(`${prop}:\\s*([\\d.]+)em`, 'i'));
  return m ? parseFloat(m[1]) : def;
};

/** Split top-level <div>…</div> children of an html string (depth-aware). */
const topLevelDivs = (html = '') => {
  const out = [];
  const re = /<div\b[^>]*>|<\/div>/gi;
  let depth = 0, start = -1, m;
  while ((m = re.exec(html)) !== null) {
    if (m[0][1] !== '/') {
      if (depth === 0) start = m.index;
      depth++;
    } else {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push(html.slice(start, m.index + m[0].length));
        start = -1;
      }
    }
  }
  return out;
};

/** Split top-level <span>…</span> children (depth-aware). */
const topLevelSpans = (html = '') => {
  const out = [];
  const re = /<span\b[^>]*>|<\/span>/gi;
  let depth = 0, start = -1, m;
  while ((m = re.exec(html)) !== null) {
    if (m[0][1] !== '/') {
      if (depth === 0) start = m.index;
      depth++;
    } else {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push(html.slice(start, m.index + m[0].length));
        start = -1;
      }
    }
  }
  return out;
};

const inner = (el = '') => el.replace(/^<[^>]+>/, '').replace(/<\/[a-z]+>\s*$/i, '');

/** Detect the leader separator type from the nested separator span's text. */
const sepTypeOf = (text = '') => {
  const t = text.trim();
  if (!t) return 'none';
  if (t[0] === '.') return 'dots';
  if (t[0] === '–' || t[0] === '—' || t[0] === '-') return 'dash';
  if (t[0] === '_') return 'line';
  if (t[0] === '*') return 'asterisk';
  return 'dots';
};

/**
 * Parse ONE TOC entry div. Returns null when the div is not a flex entry.
 */
export const parseTocEntry = (divHtml = '') => {
  const open = (divHtml.match(/^<div[^>]*>/i) || [''])[0];
  const style = styleOf(open);
  if (!/display:\s*flex/i.test(style)) return null;
  const spans = topLevelSpans(inner(divHtml));
  if (spans.length < 2) return null;

  const titleSpan = spans[0];
  const numSpan = spans[spans.length - 1];
  const tStyle = styleOf((titleSpan.match(/^<span[^>]*>/i) || [''])[0]);
  const nStyle = styleOf((numSpan.match(/^<span[^>]*>/i) || [''])[0]);
  if (!/text-align:\s*right/i.test(nStyle)) return null;

  // Title inner: strip the nested separator span (dots/dash leaders).
  const tInner = inner(titleSpan);
  const sepM = tInner.match(/<span\b[^>]*>[\s\S]*?<\/span>\s*$/i);
  const sepText = sepM ? stripTags(sepM[0]) : '';
  const titleText = stripTags(sepM ? tInner.slice(0, sepM.index) : tInner);

  const numColM = nStyle.match(/flex:\s*0\s+0\s+([\d.]+)px/i);

  return {
    marginTopPx: num(style, 'margin-top'),
    marginBottomPx: num(style, 'margin-bottom'),
    fontEm: em(style, 'font-size', null),          // entry font in em of page base
    fontPxRaw: num(style, 'font-size', 0) || null, // rare: absolute px
    bold: /font-weight:\s*(bold|[6-9]00)/i.test(style),
    uppercase: /text-transform:\s*uppercase/i.test(style),
    indentPx: num(style, 'padding-left'),
    lineHPx: num(style, 'line-height', 0),
    alignTop: /align-items:\s*flex-start/i.test(style),
    hasBottomRule: /border-bottom/i.test(style),
    hasLeftBar: /border-left/i.test(style),
    titleText,
    titleHeightPx: num(tStyle, 'height', 0),
    sepType: sepTypeOf(sepText),
    numText: stripTags(inner(numSpan)),
    numColPx: numColM ? parseFloat(numColM[1]) : 0,
    numFontEm: em(nStyle, 'font-size', 0.9),
  };
};

/**
 * Parse a full TOC page (the single outer wrapper div).
 * Returns { xPadPx, title|null, entries[] } or null when the html doesn't
 * look like a TOC page.
 */
export const parseTocPage = (pageHtml = '') => {
  const wrappers = topLevelDivs(pageHtml.trim());
  if (wrappers.length !== 1) return null;
  const wrapper = wrappers[0];
  const wStyle = styleOf((wrapper.match(/^<div[^>]*>/i) || [''])[0]);
  const padM = wStyle.match(/padding:\s*0(?:px)?\s+([\d.]+)px/i);
  const xPadPx = padM ? parseFloat(padM[1]) : 0;

  const children = topLevelDivs(inner(wrapper));
  if (children.length === 0) return null;

  let title = null;
  const entries = [];
  for (const child of children) {
    const entry = parseTocEntry(child);
    if (entry) { entries.push(entry); continue; }
    const cStyle = styleOf((child.match(/^<div[^>]*>/i) || [''])[0]);
    // The TOC heading: centered bold div with margin-bottom, before entries.
    if (!title && entries.length === 0 && /text-align:\s*center/i.test(cStyle)) {
      title = {
        text: stripTags(inner(child)),
        fontEm: em(cStyle, 'font-size', 1.1),
        fontPxRaw: num(cStyle, 'font-size', 0) || null,
        marginBottomPx: num(cStyle, 'margin-bottom'),
        lineHeightPx: num(cStyle, 'line-height', 0),
        bold: /font-weight:\s*bold/i.test(cStyle),
      };
    }
    // Debug overlays / anything else: ignored (absolute-positioned, no flow).
  }
  if (entries.length === 0) return null;
  return { xPadPx, title, entries };
};
