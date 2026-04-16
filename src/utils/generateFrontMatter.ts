import { ENABLE_TOC, TOC_STRIP_NUMBER_RE } from './extractTOC';
import type { TOCResolvedEntry } from './mapTOCToPages';
import type { TOCConfig, TOCTemplate, LevelOverride } from './extractTOC';
import { measureHtmlHeight } from './textLayoutEngine';

export type FrontMatterPage = {
  html: string;
  pageNumber: number;
  isBlank?: boolean;
  isCoverPage?: boolean;
  isTitlePage?: boolean;
  isTOCPage?: boolean;
  chapterTitle?: string;
  currentSubheader?: string;
  type: 'cover' | 'title' | 'toc' | 'content';
};

export type FrontMatterConfig = {
  includeTitlePage: boolean;
  includeTOC: boolean;
  titlePageText?: string;
  tocConfig?: TOCConfig;
};

export type TocLogEntry = {
  idx: number; page: number; level: number; title: string;
  rawLines: number; entryPx: number; usedBefore: number;
  usedAfter: number; pageUsable: number; pageBreak: boolean;
  followPx: number; orphanReleased: boolean; breakReason: 'hard' | 'soft' | 'none';
};

const DEFAULT_FRONT_MATTER_CONFIG: FrontMatterConfig = {
  includeTitlePage: true,
  includeTOC: true
};

// ─── Template definitions ────────────────────────────────────────────────────
//
// Hierarchy rules applied to ALL templates:
//   1. TOC title font-size is always the reference maximum (defined separately below)
//   2. H1 ≤ 85% of title — never competes with the section heading
//   3. Each Hn ≤ 94% of H(n-1) in font-size  AND/OR  changes weight bold→normal
//   4. Indentation increases with depth (reinforces hierarchy visually)
//   5. H1 gets extra marginTop to visually group its sub-entries below it

export type LevelStyle = {
  fontSize: string;
  fontWeight: string;
  marginTop: string;    // extra space above H1 to group chapter block
  marginBottom: string;
  textTransform: string;
  letterSpacing: string;
  indent: number; // px
  fontFamily?: string;  // per-level font override (undefined = inherit from page)
};

// TOC section title size — constant across templates, always the largest text
const TOC_TITLE_SIZE = '1.1em';

const TEMPLATE_STYLES: Record<TOCTemplate, Record<number, LevelStyle>> = {
  //
  // CLÁSICO — jerarquía tipográfica tradicional, estilo libro académico / literatura
  // H1 en bold grande, H2+ con escala descendente clara y sangría generosa.
  // Evoca tablas de contenido de editoriales clásicas (Alfaguara, FCE, Anagrama).
  //
  classic: {
    1: { fontSize: '0.92em', fontWeight: 'bold',   marginTop: '0.65em', marginBottom: '0.2em',  textTransform: 'none', letterSpacing: 'normal', indent: 0  },
    2: { fontSize: '0.84em', fontWeight: 'normal', marginTop: '0.1em',  marginBottom: '0.18em', textTransform: 'none', letterSpacing: 'normal', indent: 10 },
    3: { fontSize: '0.77em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.14em', textTransform: 'none', letterSpacing: 'normal', indent: 20 },
    4: { fontSize: '0.72em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.11em', textTransform: 'none', letterSpacing: 'normal', indent: 28 },
    5: { fontSize: '0.68em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.09em', textTransform: 'none', letterSpacing: 'normal', indent: 34 },
    6: { fontSize: '0.65em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.08em', textTransform: 'none', letterSpacing: 'normal', indent: 38 },
  },
  //
  // MODERNO — sans-serif, H1 en versalitas con tracking amplio, H2 en color
  // Estilo diseño editorial contemporáneo (manuales, libros técnicos, ensayos).
  // H1 uppercase + letter-spacing amplios crean ritmo visual fuerte.
  // H2 ligeramente más oscuro (italic) — contraste sin sangría.
  //
  modern: {
    1: { fontSize: '0.80em', fontWeight: 'bold',   marginTop: '0.8em',  marginBottom: '0.22em', textTransform: 'uppercase', letterSpacing: '0.12em', indent: 0,  fontFamily: 'inherit' },
    2: { fontSize: '0.86em', fontWeight: 'normal', marginTop: '0.05em', marginBottom: '0.16em', textTransform: 'none',      letterSpacing: 'normal', indent: 0,  fontFamily: 'inherit' },
    3: { fontSize: '0.80em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.13em', textTransform: 'none',      letterSpacing: 'normal', indent: 12, fontFamily: 'inherit' },
    4: { fontSize: '0.75em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.10em', textTransform: 'none',      letterSpacing: 'normal', indent: 20, fontFamily: 'inherit' },
    5: { fontSize: '0.71em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.08em', textTransform: 'none',      letterSpacing: 'normal', indent: 26, fontFamily: 'inherit' },
    6: { fontSize: '0.67em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.07em', textTransform: 'none',      letterSpacing: 'normal', indent: 30, fontFamily: 'inherit' },
  },
  //
  // MINIMALISTA — todo el mismo tamaño, solo sangría como jerarquía.
  // Diseño limpio, blanco, silencioso. H1 leve bold, H2+ normal weight.
  // Ideal para libros de poesía, ensayo, narrativa contemporánea.
  // La jerarquía visual viene solo del indentado y el espaciado.
  //
  minimal: {
    1: { fontSize: '0.84em', fontWeight: '500',    marginTop: '0.55em', marginBottom: '0.12em', textTransform: 'none', letterSpacing: 'normal', indent: 0  },
    2: { fontSize: '0.84em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.10em', textTransform: 'none', letterSpacing: 'normal', indent: 14 },
    3: { fontSize: '0.84em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.08em', textTransform: 'none', letterSpacing: 'normal', indent: 26 },
    4: { fontSize: '0.82em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.07em', textTransform: 'none', letterSpacing: 'normal', indent: 36 },
    5: { fontSize: '0.80em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.06em', textTransform: 'none', letterSpacing: 'normal', indent: 44 },
    6: { fontSize: '0.78em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.05em', textTransform: 'none', letterSpacing: 'normal', indent: 50 },
  },
  //
  // EDITORIAL — estilo revista / libro de arte. H1 centrado en versalitas espaciadas,
  // H2 en itálica sin sangría, H3+ indentado fino.
  // Para libros de fotografía, catálogos, libros de arte, ensayos visuales.
  //
  editorial: {
    1: { fontSize: '0.82em', fontWeight: 'bold',   marginTop: '0.5em',  marginBottom: '0.15em', textTransform: 'uppercase', letterSpacing: '0.15em', indent: 0  },
    2: { fontSize: '0.84em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.20em', textTransform: 'none',      letterSpacing: 'normal', indent: 0  },
    3: { fontSize: '0.78em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.20em', textTransform: 'none',      letterSpacing: 'normal', indent: 10 },
    4: { fontSize: '0.73em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.15em', textTransform: 'none',      letterSpacing: 'normal', indent: 18 },
    5: { fontSize: '0.69em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.12em', textTransform: 'none',      letterSpacing: 'normal', indent: 24 },
    6: { fontSize: '0.65em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.10em', textTransform: 'none',      letterSpacing: 'normal', indent: 28 },
  }
};

export function getLevelStyle(
  template: TOCTemplate,
  level: number,
  overrides?: Record<number, LevelOverride>
): LevelStyle {
  const t = TEMPLATE_STYLES[template] || TEMPLATE_STYLES.classic;
  const base: LevelStyle = t[level] || t[Math.min(level, 6)] || t[1];
  const ov = overrides?.[level];
  if (!ov) return base;
  return {
    ...base,
    ...(ov.fontSize   !== undefined && { fontSize:   ov.fontSize }),
    ...(ov.fontWeight !== undefined && { fontWeight: ov.fontWeight }),
    ...(ov.indent     !== undefined && { indent:     ov.indent }),
    ...(ov.fontFamily !== undefined && { fontFamily: ov.fontFamily }),
  };
}

// getSeparatorHtml removed — dots now use float+inline layout (see entryHtml in Phase 4)

// ─── Hierarchical numbering ───────────────────────────────────────────────────

function toRoman(n: number): string {
  const vals: [number, string][] = [
    [1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],
    [90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']
  ];
  let r = '';
  for (const [v, s] of vals) { while (n >= v) { r += s; n -= v; } }
  return r;
}

// Generates a hierarchical label for each entry based on its position in the list.
//   decimal: "1."  "1.1."  "1.1.2."  "2."
//   roman:   "I."  "I.1."  "I.1.2."  "II."
// includedLevels must be the same set used to filter the entries.
export function computeTOCNumbers(
  entries: { level: number }[],
  includedLevels: number[],
  mode: 'decimal' | 'roman'
): string[] {
  const sorted = [...includedLevels].sort((a, b) => a - b);
  const rank: Record<number, number> = {};
  sorted.forEach((l, i) => { rank[l] = i + 1; });

  const counters = new Array(sorted.length + 1).fill(0) as number[];

  return entries.map(e => {
    const r = rank[e.level];
    if (r === undefined) return '';
    counters[r]++;
    for (let d = r + 1; d <= sorted.length; d++) counters[d] = 0;

    const segs = counters.slice(1, r + 1);
    if (mode === 'decimal') return segs.join('.') + '.';
    const parts = segs.map((n, i) => (i === 0 ? toRoman(n) : String(n)));
    return parts.join('.') + '.';
  });
}

// ─── Title normalization ─────────────────────────────────────────────────────
//
// Applied at render time inside generateTOCPages so the preview and export
// always reflect the selected transform without touching the source data.

export function normalizeTitle(
  title: string,
  transform?: TOCConfig['titleTransform'],
  strip?: boolean
): string {
  let text = strip
    ? (title.replace(TOC_STRIP_NUMBER_RE, '').trim() || title)
    : title;

  switch (transform) {
    case 'sentence':
      // First letter uppercase, rest lowercase — fixes ALL CAPS entries
      return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    case 'title': {
      // Title case: each word capitalised, Spanish/English stop words lowercase
      const STOP = new Set([
        'de','del','la','las','los','el','en','y','o','a','al','con','por',
        'para','que','se','su','un','una','lo','ni','si',
        'the','an','of','in','and','or','to','at','by','for'
      ]);
      let wordIdx = 0;
      return text.split(/(\s+)/).map(chunk => {
        if (/^\s+$/.test(chunk)) return chunk;
        const r = wordIdx === 0 || !STOP.has(chunk.toLowerCase())
          ? chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase()
          : chunk.toLowerCase();
        wordIdx++;
        return r;
      }).join('');
    }
    case 'upper':
      return text.toUpperCase();
    default:
      return text;
  }
}

// ─── Title page ──────────────────────────────────────────────────────────────

export const generateTitlePage = (
  bookTitle: string,
  bookAuthor: string,
  config: FrontMatterConfig
): FrontMatterPage | null => {
  if (!config.includeTitlePage) return null;

  const title  = config.titlePageText || bookTitle || 'Título del Libro';
  const author = bookAuthor || '';

  const html = `
    <div style="
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      min-height: 80%;
      text-align: center;
    ">
      <div style="font-size: 1.4em; font-weight: bold; line-height: 1.4; text-align: center;">${title}</div>
      ${author ? `<div style="font-size: 1em; font-weight: normal; margin-top: 0.9em; color: #555; text-align: center; letter-spacing: 0.04em;">${author}</div>` : ''}
    </div>
  `;

  return {
    html,
    pageNumber: 1,
    isTitlePage: true,
    type: 'title',
    chapterTitle: title,
    currentSubheader: ''
  };
};

// ─── TOC pages ───────────────────────────────────────────────────────────────

// Estimate how many lines a TOC entry title will wrap to at the given content width.
// overrideFontEm: use this font size instead of the template default (for scaled entries).
// baseFontSizePx: if provided, used directly instead of the lineHeightPx/1.5 approximation.
function estimateEntryLines(
  title: string,
  level: number,
  contentWidth: number,
  lineHeightPx: number,
  template: TOCTemplate,
  levelOverrides?: Record<number, LevelOverride>,
  overrideFontEm?: number,
  baseFontSizePx?: number
): number {
  const style = getLevelStyle(template, level, levelOverrides);
  const baseFontPx = baseFontSizePx ?? (lineHeightPx / 1.5);
  const fontEm = overrideFontEm ?? (parseFloat(style.fontSize) || 0.85);
  const fontPx = fontEm * baseFontPx;
  const avgCharWidth = fontPx * 0.62;
  const usable = contentWidth - 24 - style.indent; // subtract TOC padding (12px×2) and indent
  const titleColWidth = Math.max(30, usable * 0.60);
  const charsPerLine = Math.max(8, Math.floor(titleColWidth / avgCharWidth));

  // Word-aware line counting — simulates word-break:normal + overflow-wrap:break-word.
  // Simple char-division (ceil(len/cpl)) underestimates when a long word can't share
  // a line with preceding words, e.g. "CAPÍTULO #7 – ENDURECIMIENTO DEL CORAZÓN"
  // estimates 2 lines but renders as 3 because whole words move to the next line.
  // overflow-wrap:break-word only splits a word if it alone is longer than the full line.
  const words = title.split(/\s+/);
  let lines = 1;
  let col = 0;
  for (const word of words) {
    const wlen = word.length;
    if (col === 0) {
      if (wlen <= charsPerLine) {
        col = wlen;
      } else {
        // Single word too long for one line — overflow-wrap:break-word splits it
        lines += Math.floor(wlen / charsPerLine);
        col = wlen % charsPerLine || charsPerLine;
      }
    } else if (col + 1 + wlen <= charsPerLine) {
      col += 1 + wlen; // fits on current line
    } else {
      lines++;
      if (wlen <= charsPerLine) {
        col = wlen;
      } else {
        // Long word at the start of a new line — split via overflow-wrap
        lines += Math.floor(wlen / charsPerLine);
        col = wlen % charsPerLine || charsPerLine;
      }
    }
  }
  return Math.max(1, lines);
}

// ─── H3 auto-size computation ─────────────────────────────────────────────────
//
// Computes a uniform font size for all H3 TOC entries so that most (≥ P65) fit
// in a single line. Truly long outliers are allowed to wrap to 2 lines.
//
// IMPORTANT: always derives the base em from the template definition, never from
// stored levelOverrides[3].fontSize, to avoid feedback loops when the result is
// written back to the store.
//
export function computeH3UniformFontSize(
  filteredEntries: TOCResolvedEntry[],
  template: TOCTemplate,
  contentWidth: number,
  lineHeightPx: number,
  levelOverrides?: Record<number, LevelOverride>,
  baseFontSizePx?: number
): string | null {
  if (!contentWidth) return null;

  const templateStyles = TEMPLATE_STYLES[template] || TEMPLATE_STYLES.classic;
  const h3BaseEm = parseFloat(templateStyles[3]?.fontSize) || 0.77;

  // Strip H3 fontSize from overrides so line estimates are stable across runs
  let overridesForEstimate: Record<number, LevelOverride> | undefined;
  if (levelOverrides) {
    overridesForEstimate = {};
    for (const [k, v] of Object.entries(levelOverrides)) {
      const lvl = parseInt(k);
      if (lvl === 3) {
        const { fontSize: _skip, ...rest } = v;
        if (Object.keys(rest).length > 0) overridesForEstimate[lvl] = rest;
      } else {
        overridesForEstimate[lvl] = v;
      }
    }
  }

  const h3Entries = filteredEntries.filter(e => e.level === 3);
  if (h3Entries.length === 0) return null;

  const lineCounts = h3Entries.map(e =>
    estimateEntryLines(e.title, 3, contentWidth, lineHeightPx, template, overridesForEstimate, undefined, baseFontSizePx)
  );
  const sorted = [...lineCounts].sort((a, b) => a - b);
  const p65    = sorted[Math.floor(sorted.length * 0.65)];
  const maxLines = sorted[sorted.length - 1];

  if (p65 > 1) {
    // Gentle scaling: allow p65 to sit at ~1.2 visual lines so the font doesn't
    // drop too aggressively. Entries above p65 may still wrap to 2 lines — that's fine.
    return `${Math.max(0.68, h3BaseEm * (1.2 / p65)).toFixed(2)}em`;
  } else if (maxLines > 2) {
    // Most entries already fit in 1 line but one extreme outlier exceeds 2 — cap at 2.
    return `${Math.max(0.68, h3BaseEm * (2 / maxLines)).toFixed(2)}em`;
  }
  return null;
}

export const generateTOCPages = (
  tocEntries: TOCResolvedEntry[],
  tocConfig: TOCConfig | null,
  startPageNumber: number,
  contentHeight: number,
  lineHeightPx: number,
  contentWidth?: number,
  precomputedH3FontSize?: string | null,
  baseFontSizePx?: number,
  fontFamily?: string
): { pages: FrontMatterPage[], tocLog: TocLogEntry[], tocSummaryText: string } => {
  if (!ENABLE_TOC || !tocEntries || tocEntries.length === 0 || !tocConfig?.includeLevels?.length) {
    return { pages: [], tocLog: [], tocSummaryText: '' };
  }

  const filteredEntries = tocEntries.filter(e => tocConfig.includeLevels.includes(e.level));
  if (filteredEntries.length === 0) return { pages: [], tocLog: [], tocSummaryText: '' };

  const template: TOCTemplate = tocConfig.template || 'classic';
  const separator: string = tocConfig.separator || 'none';
  const digitalLinks = tocConfig.digitalLinks || false;

  // Pre-compute display titles: normalize first, then prepend auto-number if set.
  // When auto-numbering is active we always strip existing leading numbers so they
  // don't double up (e.g. "Capítulo 3" becomes "1.3." not "1.3. Capítulo 3").
  const addNum = tocConfig.addNumbering && tocConfig.addNumbering !== 'none';
  const effectiveStrip = tocConfig.stripLeadingNumber || !!addNum;
  const needsNormalize = (tocConfig.titleTransform && tocConfig.titleTransform !== 'none') || effectiveStrip;
  const normalizedTitles = needsNormalize
    ? filteredEntries.map(e => normalizeTitle(e.title, tocConfig.titleTransform, effectiveStrip))
    : filteredEntries.map(e => e.title);

  const entryNumbers = addNum
    ? computeTOCNumbers(filteredEntries, tocConfig.includeLevels, tocConfig.addNumbering as 'decimal' | 'roman')
    : null;

  const displayTitles = normalizedTitles.map((t, i) =>
    entryNumbers?.[i] ? `${entryNumbers[i]}\u00a0${t}` : t
  );

  const pages: FrontMatterPage[] = [];

  // Use accurate baseFontSizePx when available; fall back to ratio-1.5 approximation.
  // This prevents margin underestimation when the book's lineHeight ratio differs from 1.5.
  const bfPx = baseFontSizePx ?? (lineHeightPx / 1.5);

  // Single-line height for H1/H2: 1 text line (lineHeightPx) + top/bottom margins.
  // Margins are in 'em' relative to the entry's font size, which is (fontSize_em * bfPx).
  const h1Style  = getLevelStyle(template, 1, tocConfig.levelOverrides);
  const h2Style  = getLevelStyle(template, 2, tocConfig.levelOverrides);
  const h1FontPx = (parseFloat(h1Style.fontSize)  || 0.88) * bfPx;
  const h2FontPx = (parseFloat(h2Style.fontSize)  || 0.82) * bfPx;
  const h1SinglePx = lineHeightPx
    + ((parseFloat(h1Style.marginTop) || 0) + (parseFloat(h1Style.marginBottom) || 0)) * h1FontPx;
  const h2SinglePx = lineHeightPx
    + ((parseFloat(h2Style.marginTop) || 0) + (parseFloat(h2Style.marginBottom) || 0)) * h2FontPx;

  // TOC title: line text + margin-bottom: 1.5em (1em = effective title font * bfPx)
  const titleFontEm  = parseFloat(tocConfig.titleFontSize || TOC_TITLE_SIZE) || 1.1;
  const titleHeightPx = Math.ceil(lineHeightPx + 1.5 * titleFontEm * bfPx);
  // First page has the TOC title taking space; subsequent pages use full content height.
  // Bottom buffer: absorbs accumulated sub-pixel rounding from margins and line-heights.
  const firstPageUsable = contentHeight - titleHeightPx;
  const bodyPageUsable  = contentHeight;

  // CRITICAL: margin-bottom uses explicit px (not em) to prevent browser minimum-font-size
  // from inflating the margin. titleHeightPx already includes this margin in the formula.
  const titleMarginBotPx = Math.ceil(1.5 * titleFontEm * bfPx);
  const titleFontSize = tocConfig.titleFontSize || TOC_TITLE_SIZE;
  const titleLetterSpacing = (template === 'editorial' || template === 'modern') ? '0.08em' : 'normal';
  const titleHtml = `<div style="text-align:center; font-size:${titleFontSize}; font-weight:bold; margin-bottom:${titleMarginBotPx}px; line-height:${lineHeightPx}px; letter-spacing:${titleLetterSpacing};">${tocConfig.title || 'Índice'}</div>`;

  // ── Uniform H3 font size ─────────────────────────────────────────────────────
  // Use pre-computed value from caller if provided; otherwise compute on the spot.
  // When normalization is active, pass normalized entries so line estimates are accurate.
  const entriesForH3 = needsNormalize
    ? filteredEntries.map((e, i) => ({ ...e, title: displayTitles[i] }))
    : filteredEntries;
  const h3UniformFontSize: string | null =
    precomputedH3FontSize !== undefined
      ? precomputedH3FontSize
      : (contentWidth
          ? computeH3UniformFontSize(entriesForH3, template, contentWidth, lineHeightPx, tocConfig.levelOverrides, baseFontSizePx)
          : null);

  // ── DEV logging setup ─────────────────────────────────────────────────────
  const IS_DEV = process.env.NODE_ENV === 'development';
  const tocLog: TocLogEntry[] = [];

  if (IS_DEV) {
    // Compute representative charsPerLine for diagnostic header
    const _bfH1 = (parseFloat(h1Style.fontSize) || 0.88) * bfPx;
    const _cplH1 = contentWidth
      ? Math.max(8, Math.floor(Math.max(30, (contentWidth - 24) * 0.58) / (_bfH1 * 0.68)))
      : '?';
    const _bfH2 = (parseFloat(h2Style.fontSize) || 0.82) * bfPx;
    const _cplH2 = contentWidth
      ? Math.max(8, Math.floor(Math.max(30, (contentWidth - 24 - 8) * 0.58) / (_bfH2 * 0.68)))
      : '?';
  }

  // ── DEV visual overlays ───────────────────────────────────────────────────
  // Reflects the 3 real limits used in Phase 2 + Phase 3:
  //   🩵 teal  (page 1 only) = titleHeightPx      → where entries start after the TOC heading
  //   🔵 blue                = softTarget abs     → Phase 3 soft break (may break here if pagesLeft>1)
  //   🔴 red                 = effFirst/effBody   → Phase 2+3 hard limit (no entry placed beyond this)
  //   🟢 green               = contentHeight      → CSS overflow:hidden clips here
  const TOC_DEBUG_LINES = false; // ← set true to visualize limits
  const buildDebugOverlay = (isFirstPg: boolean, softTarget: number): string => {
    if (!IS_DEV || !TOC_DEBUG_LINES) return '';
    const titleOff  = isFirstPg ? titleHeightPx : 0;
    const eff       = isFirstPg ? effFirst : effBody;
    const line = (top: number, color: string, label: string): string =>
      `<div style="position:absolute;left:0;right:0;top:${top.toFixed(1)}px;height:0;` +
      `border-top:1.5px dashed ${color};z-index:9999;pointer-events:none;">` +
      `<span style="position:absolute;right:2px;top:-12px;font-size:7px;` +
      `background:${color};color:#fff;padding:1px 3px;border-radius:2px;` +
      `font-family:monospace;white-space:nowrap;">${label}</span></div>`;
    return (
      (isFirstPg ? line(titleHeightPx,        '#2dd4bf', `↓entries title=${titleHeightPx.toFixed(0)}px`) : '') +
      line(titleOff + softTarget,             '#3182ce', `soft=${softTarget.toFixed(0)}px`) +
      line(titleOff + eff,                    '#e53e3e', `hard=${eff.toFixed(0)}px`) +
      line(contentHeight - 1,                 '#38a169', `clip=${contentHeight}px`)
    );
  };

  const outerDivOpen = (withTitle: boolean): string =>
    `<div style="padding: 0 12px; text-align:left; position:relative;">` +
    (withTitle ? titleHtml : '');

  let currentHtml = outerDivOpen(true);
  let usedHeight = 0;   // pixels used so far on current page (after title)
  let currentPage = 1;

  // separator mode is checked inline per-entry (dots use float+inline, dash/none use flex)

  // ── Canvas 2D context for per-entry page-number width measurement ────────
  // The title span in the flex layout gets exactly:
  //   titleColW = tocInnerWidth - indent - pageNumNaturalWidth
  // Using Canvas measureText() per entry (at 0.9 × entryFontPx for the actual
  // page number string) gives pixel-accurate titleColW for Canvas line-breaking.
  // This is fully deterministic — same result on Chrome/Firefox/Safari for the
  // same loaded font — and requires no DOM layout (no scrollHeight).
  const tocInnerWidth = contentWidth ? contentWidth - 24 : 0;
  let measCanvas2D: CanvasRenderingContext2D | null = null;
  if (typeof document !== 'undefined' && tocInnerWidth > 0 && fontFamily) {
    try {
      const c = document.createElement('canvas');
      measCanvas2D = c.getContext('2d');
    } catch { measCanvas2D = null; }
  }
  // Fallback width used when Canvas 2D is unavailable (SSR / Node).
  // 2.5 × bfPx approximates 3-digit page numbers at ~0.8× bfPx font size.
  const pageNumWidthFallback = contentWidth ? Math.ceil(2.5 * bfPx) : 0;

  // DOM measurement div for title line-counting — more accurate than Canvas at
  // small preview scales: handles text-transform (uppercase), bold metric drift, etc.
  let domMeasDiv: HTMLElement | null = null;
  if (typeof document !== 'undefined' && tocInnerWidth > 0 && fontFamily) {
    try {
      domMeasDiv = document.createElement('div');
      domMeasDiv.style.cssText = [
        'position:fixed', 'left:-9999px', 'top:0',
        'visibility:hidden', 'pointer-events:none',
        'padding:0', 'margin:0', 'border:0', 'box-sizing:content-box',
        'white-space:normal', 'overflow-wrap:break-word',
        'word-break:normal', 'hyphens:none', '-webkit-hyphens:none',
      ].join(';');
      document.body.appendChild(domMeasDiv);
    } catch { domMeasDiv = null; }
  }

  // ── Phase 1: Pre-compute measurements for every entry ────────────────────
  // Separating measurement from layout lets us run a balanced distribution pass
  // that equalizes fill% across all TOC pages before committing to HTML.
  type ComputedEntry = {
    entry: TOCResolvedEntry; displayTitle: string; style: LevelStyle;
    rawLines: number; entryPx: number; displayFontSize: string; isH3: boolean;
    titleColW: number;         // column width used for Canvas measurement — MUST match CSS flex-basis
    exactPageNumWidth: number; // page number column width in px (for right-aligned CSS flex-basis)
    entryLhPxCeil: number; // Math.ceil(entryLhPx) — explicit px line-height for CSS
    marginTopPx: number;   // top margin in px (used in CSS)
    marginBotPx: number;   // bottom margin in px (used in CSS)
  };

  const computed: ComputedEntry[] = filteredEntries.map((entry, i) => {
    const displayTitle = displayTitles[i];
    const style = getLevelStyle(template, entry.level, tocConfig.levelOverrides);
    const isH3 = entry.level === 3;
    const isCompact = entry.level >= 3; // H3 and H4 use compact line-height

    // displayFontSize must be known BEFORE canvas measurement so H3 uses its
    // scaled font size (h3UniformFontSize) rather than the template default.
    let displayFontSize = style.fontSize;
    if (isH3 && h3UniformFontSize !== null) {
      displayFontSize = h3UniformFontSize;
    }

    const entryFontPx = (parseFloat(displayFontSize) || 0.85) * bfPx;
    const entryLhPx   = isCompact ? (1.3 * entryFontPx) : lineHeightPx;

    // ── Exact page-number width via Canvas measureText ────────────────────
    // Page number is rendered at font-size 0.9em relative to the entry font.
    // Canvas measureText() at the same font/size gives the exact natural width.
    // titleColW = this width is stored in ComputedEntry and MUST be used as
    // max-width on the CSS title span so CSS and Canvas use identical column widths.
    const measurePageNumWidth = (fontPx: number): number => {
      if (measCanvas2D && fontFamily) {
        measCanvas2D.font = `normal ${(0.9 * fontPx).toFixed(2)}px ${fontFamily}`;
        return Math.ceil(measCanvas2D.measureText(String(entry.page)).width) + 4;
      }
      return pageNumWidthFallback;
    };
    let exactPageNumWidth = measurePageNumWidth(entryFontPx);
    // titleColW = full available width minus indent and page number column.
    // The separator uses flex:1 0 0 and grows into whatever remains — no deduction needed.
    let titleColW = Math.max(40, tocInnerWidth - style.indent - exactPageNumWidth);

    // ── rawLines: DOM line-break simulation ────────────────────────────────
    // DOM offsetHeight is the most accurate method: it uses the actual CSS renderer,
    // handling text-transform (uppercase titles in elegant template), bold font metric
    // differences at tiny preview scales, and any other CSS effects that Canvas misses.
    // Canvas measureHtmlHeight is used as fallback (SSR / no DOM).
    let rawLines = 1;
    if (domMeasDiv && contentWidth && fontFamily) {
      domMeasDiv.style.width         = `${titleColW}px`;
      domMeasDiv.style.fontSize      = `${entryFontPx.toFixed(3)}px`;
      domMeasDiv.style.fontFamily    = fontFamily;
      domMeasDiv.style.fontWeight    = style.fontWeight;
      domMeasDiv.style.lineHeight    = `${entryLhPx.toFixed(3)}px`;
      domMeasDiv.style.letterSpacing = style.letterSpacing;
      domMeasDiv.style.textTransform = style.textTransform;
      domMeasDiv.textContent         = displayTitle;
      rawLines = Math.max(1, Math.round(domMeasDiv.offsetHeight / entryLhPx));
    } else if (contentWidth && fontFamily) {
      const h = measureHtmlHeight(
        `<div style="margin:0;padding:0;font-weight:${style.fontWeight}${style.letterSpacing && style.letterSpacing !== 'normal' ? `;letter-spacing:${style.letterSpacing}` : ''};">${displayTitle}</div>`,
        { baseFontSizePx: entryFontPx, baseLineHeight: entryLhPx / entryFontPx, lineHeightPx: entryLhPx, contentWidth: titleColW, fontFamily, widthSlack: style.fontWeight === 'bold' ? 8 : 3, noHyphenation: true }
      );
      rawLines = Math.max(1, Math.round(h / entryLhPx));
    } else if (contentWidth) {
      rawLines = estimateEntryLines(displayTitle, entry.level, contentWidth, lineHeightPx, template, tocConfig.levelOverrides, undefined, baseFontSizePx);
    }

    // Non-H3 scale-down: if rawLines > 2 shrink font to cap at 2 visual lines.
    // After scaling, recompute exactPageNumWidth + titleColW at the new font size
    // so the re-measurement and CSS max-width stay consistent.
    if (entry.level === 2 && rawLines > 2) {
      const em = parseFloat(style.fontSize) || 0.85;
      displayFontSize = `${Math.max(0.65, em * (2 / rawLines)).toFixed(2)}em`;
      const scaledFontPx = (parseFloat(displayFontSize) || 0.65) * bfPx;
      // Recompute page-num width at scaled font size — preserves consistency
      exactPageNumWidth = measurePageNumWidth(scaledFontPx);
      titleColW = Math.max(40, tocInnerWidth - style.indent - exactPageNumWidth);
      if (domMeasDiv && contentWidth && fontFamily) {
        domMeasDiv.style.width      = `${titleColW}px`;
        domMeasDiv.style.fontSize   = `${scaledFontPx.toFixed(3)}px`;
        domMeasDiv.style.lineHeight = `${lineHeightPx.toFixed(3)}px`;
        // fontFamily / fontWeight / letterSpacing / textTransform already set above
        rawLines = Math.max(1, Math.round(domMeasDiv.offsetHeight / lineHeightPx));
      } else if (contentWidth && fontFamily) {
        const scaledH = measureHtmlHeight(
          `<div style="margin:0;padding:0;font-weight:${style.fontWeight};">${displayTitle}</div>`,
          { baseFontSizePx: scaledFontPx, baseLineHeight: lineHeightPx / scaledFontPx, lineHeightPx, contentWidth: titleColW, fontFamily, widthSlack: style.fontWeight === 'bold' ? 8 : 3, noHyphenation: true }
        );
        rawLines = Math.max(1, Math.round(scaledH / lineHeightPx));
      } else {
        rawLines = 2;
      }
    }

    // ── entryPx: deterministic formula, no DOM ────────────────────────────
    // entryPx = marginTop + (lines × lineHeight) + marginBottom
    // Margins in 'em' are relative to the entry's own font size.
    const marginTopPx = Math.ceil((parseFloat(style.marginTop)    || 0) * entryFontPx);
    const marginBotPx = Math.ceil((parseFloat(style.marginBottom) || 0) * entryFontPx);
    const entryPx     = rawLines * Math.ceil(entryLhPx) + marginTopPx + marginBotPx;

    const entryLhPxCeil = Math.ceil(entryLhPx);
    return { entry, displayTitle, style, rawLines, entryPx, displayFontSize, isH3, titleColW, entryLhPxCeil, marginTopPx, marginBotPx, exactPageNumWidth };
  });

  // Clean up DOM measurement div now that all entries are measured
  if (domMeasDiv) {
    try { document.body.removeChild(domMeasDiv); } catch { /* no-op */ }
    domMeasDiv = null;
  }

  // Uniform page-number column width: use the widest entry so all numbers right-align.
  const maxPageNumW = Math.max(...computed.map(c => c.exactPageNumWidth));

  // ── Phase 2: Greedy pass — find minimum page count P ─────────────────────
  // No orphan guard here: guard inflates P when every entry is H1 (chapter-only
  // TOC), doubling the effective height per slot and halving soft targets.
  // The guard is applied later as a hard constraint only in Phase 3.
  // Hard-limit clearance: 0.40 lines below clip (CSS overflow:hidden = contentHeight).
  // Soft target is another 0.40 lines below hard — three evenly-spaced thresholds.
  const effFirst = firstPageUsable - lineHeightPx * 0.40;
  const effBody  = bodyPageUsable  - lineHeightPx * 0.40;
  let P = 1;
  {
    let usedG = 0;
    for (const c of computed) {
      const usable = P === 1 ? effFirst : effBody;
      if (usedG + c.entryPx > usable && usedG > 0) { P++; usedG = 0; }
      usedG += c.entryPx;
    }
  }

  // ── Phase 3: Balanced layout — equalize fill% across P pages ─────────────
  // Each page receives a soft target proportional to its capacity so no page
  // is significantly emptier than others.  The hard page limit is still respected.
  // Soft target = just below the hard limit so it fires as a last-resort safety net
  // rather than redistributing content across pages. Pages fill to the hard limit
  // and only soft-break if used reaches 0.40 lines before the hard limit.
  const softTarget1  = effFirst - lineHeightPx * 0.40;
  const softTargetN  = effBody  - lineHeightPx * 0.40;

  // Phase 3 decision metadata — kept parallel to computed[] so Phase 4 log uses
  // the SAME followPx and breakReason that Phase 3 actually used (not recomputed).
  type P3Decision = { followPx: number; orphanReleased: boolean; breakReason: 'hard' | 'soft' | 'none' };
  const p3: P3Decision[] = new Array(computed.length);

  const pageBreakBefore: boolean[] = new Array(computed.length).fill(false);
  {
    let curPage = 1, pageUsed = 0;
    for (let i = 0; i < computed.length; i++) {
      const c = computed[i];
      const pagesLeft  = P - curPage + 1;
      // effFirst/effBody already include clearance — use them directly.
      const hardLimit  = curPage === 1 ? effFirst : effBody;
      const softTarget = curPage === 1 ? softTarget1 : softTargetN;
      // Orphan guard: only keep H1 with its immediate sub-entry (H2+).
      // H1-after-H1 means a new chapter starts — no orphan concern there.
      // Use the actual pre-computed entryPx of the next entry (not a single-line
      // estimate) so multi-line H2 entries are correctly reserved in the check.
      // IMPORTANT: if H1+H2 together exceed hardLimit, they'd overflow even on a
      // fresh page — release the orphan guard so H1 goes alone and H2 starts next.
      const nextIsSubEntry = i < computed.length - 1 && computed[i + 1].entry.level > 1;
      const rawFollowPx = c.entry.level === 1 && nextIsSubEntry ? computed[i + 1].entryPx : 0;
      const pairFitsOnFreshPage = (c.entryPx + rawFollowPx) <= hardLimit;
      const followPx  = pairFitsOnFreshPage ? rawFollowPx : 0;
      const hardBreak = pageUsed + c.entryPx + followPx > hardLimit && pageUsed > 0;
      const softBreak = pagesLeft > 1 && pageUsed >= softTarget && pageUsed > 0;
      const orphanReleased = rawFollowPx > 0 && !pairFitsOnFreshPage;
      if (hardBreak || softBreak) { pageBreakBefore[i] = true; curPage++; pageUsed = 0; }
      p3[i] = { followPx, orphanReleased, breakReason: hardBreak ? 'hard' : softBreak ? 'soft' : 'none' };
      pageUsed += c.entryPx;
    }
  }

  // ── Phase 3.5: Distribute free vertical space on underfilled pages ────────
  // When a page is < 88% full, spread extra space as additional top margin on
  // H1 entries so the TOC "breathes". Only affects CSS — entryPx/usedHeight
  // stay unchanged so Phase 3 page assignments remain valid (no overflow risk).
  const extraMarginTop: number[] = new Array(computed.length).fill(0);
  {
    // Replay Phase 3 page assignments using pageBreakBefore[]
    const pageGroups: number[][] = [[]];
    let pg = 0;
    for (let i = 0; i < computed.length; i++) {
      if (pageBreakBefore[i]) { pg++; pageGroups.push([]); }
      pageGroups[pg].push(i);
    }
    for (let p = 0; p < pageGroups.length; p++) {
      const group = pageGroups[p];
      const usable = p === 0 ? effFirst : effBody;
      const usedH = group.reduce((s, i) => s + computed[i].entryPx, 0);
      const freeH = usable - usedH;
      if (freeH < 8 || usedH / usable >= 0.88) continue;
      const h1Idxs = group.filter(i => computed[i].entry.level === 1);
      if (h1Idxs.length === 0) continue;
      // Cap at 20px per entry to avoid overly large gaps
      const addPerH1 = Math.min(20, Math.floor(freeH / h1Idxs.length));
      for (const idx of h1Idxs) extraMarginTop[idx] = addPerH1;
    }
  }

  // ── Phase 4: HTML generation + tocLog ────────────────────────────────────
  for (let i = 0; i < computed.length; i++) {
    const { entry, displayTitle, style, rawLines, entryPx, displayFontSize, entryLhPxCeil, marginTopPx, marginBotPx } = computed[i];
    const pageBreak = pageBreakBefore[i];

    let titleText = digitalLinks && entry.elementId
      ? `<a href="#${entry.elementId}" style="color:inherit; text-decoration:none;">${displayTitle}</a>`
      : displayTitle;
    const entryFontFamily = style.fontFamily ? `font-family:${style.fontFamily};` : '';
    const titleHeight = rawLines * entryLhPxCeil;
    const mt = marginTopPx + extraMarginTop[i];
    const mb = marginBotPx;

    // ── Separator inline text (used by classic + minimal) ─────────────────────
    const separatorInline =
      separator === 'dots'
        ? ` <span style="color:#bbb;letter-spacing:0.08em;font-weight:normal;">. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .</span>`
        : separator === 'dash'
        ? ` <span style="color:#bbb;letter-spacing:0.05em;font-weight:normal;">– – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –</span>`
        : separator === 'line'
        ? ` <span style="color:#ccc;letter-spacing:-0.12em;font-weight:normal;">___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___</span>`
        : separator === 'dots-tight'
        ? ` <span style="color:#999;letter-spacing:0.03em;font-weight:normal;">. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .</span>`
        : separator === 'asterisk'
        ? ` <span style="color:#bbb;letter-spacing:0.12em;font-weight:normal;">* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *</span>`
        : '';

    // ── Per-template HTML layout ───────────────────────────────────────────────
    // All share the same entryPx measurement — only visual presentation differs.
    // CRITICAL: line-height and margins use EXPLICIT PX to prevent browser
    // minimum-font-size from inflating line-height via unitless factor resolution.
    let entryHtml: string;

    if (template === 'modern') {
      // MODERNO: barra vertical izquierda en H1, sin dots, número en bold oscuro
      // H1 → accent bar left + uppercase + tracking wide
      // H2+ → normal, sin barra, indent
      const isH1 = entry.level === 1;
      const barStyle = isH1
        ? `border-left:2px solid #333;padding-left:6px;`
        : '';
      const pageNumStyle = isH1
        ? `font-weight:bold;color:#222;font-size:0.9em;`
        : `font-weight:normal;color:#888;font-size:0.85em;`;
      entryHtml = `<div style="display:flex;align-items:flex-end;margin-top:${mt}px;margin-bottom:${mb}px;font-size:${displayFontSize};font-weight:${style.fontWeight};${entryFontFamily}text-transform:${style.textTransform};letter-spacing:${style.letterSpacing};padding-left:${style.indent}px;line-height:${entryLhPxCeil}px;${barStyle}"><span style="flex:1 1 0;min-width:0;height:${titleHeight}px;overflow:hidden;overflow-wrap:break-word;word-break:normal;">${titleText}</span><span style="flex:0 0 ${maxPageNumW}px;text-align:right;white-space:nowrap;${pageNumStyle}padding-left:1px;line-height:${entryLhPxCeil}px;">${entry.page}</span></div>`;

    } else if (template === 'minimal') {
      // MINIMALISTA: guión em entre título y número, mismo tamaño todo, solo indent
      // Sin dots, sin bold, solo el texto alineado con espacio limpio
      const dashSep = ` <span style="color:#ccc;font-weight:normal;"> —</span>`;
      entryHtml = `<div style="display:flex;align-items:flex-end;margin-top:${mt}px;margin-bottom:${mb}px;font-size:${displayFontSize};font-weight:${style.fontWeight};${entryFontFamily}letter-spacing:${style.letterSpacing};padding-left:${style.indent}px;line-height:${entryLhPxCeil}px;"><span style="flex:1 1 0;min-width:0;height:${titleHeight}px;overflow:hidden;overflow-wrap:break-word;word-break:normal;">${titleText}${dashSep}</span><span style="flex:0 0 ${maxPageNumW}px;text-align:right;white-space:nowrap;font-weight:normal;color:#666;font-size:0.9em;padding-left:1px;line-height:${entryLhPxCeil}px;">${entry.page}</span></div>`;

    } else if (template === 'editorial') {
      // EDITORIAL: H1 en versalitas espaciadas + número pequeño en superíndice derecha.
      // Línea decorativa border-bottom separa visualmente cada H1.
      // H2+ usa dots con indent, sin uppercase.
      const isH1 = entry.level === 1;
      if (isH1) {
        // H1: flex row, uppercase tracking amplio, número como superíndice arriba-derecha
        const pageSpan = `<span style="flex:0 0 ${maxPageNumW}px;text-align:right;white-space:nowrap;font-size:0.75em;font-weight:normal;color:#999;letter-spacing:normal;align-self:flex-start;padding-top:1px;">${entry.page}</span>`;
        entryHtml = `<div style="display:flex;align-items:flex-start;margin-top:${mt}px;margin-bottom:${mb}px;font-size:${displayFontSize};font-weight:${style.fontWeight};${entryFontFamily}text-transform:${style.textTransform};letter-spacing:${style.letterSpacing};line-height:${entryLhPxCeil}px;border-bottom:0.5px solid #ddd;"><span style="flex:1 1 0;min-width:0;height:${titleHeight}px;overflow:hidden;overflow-wrap:break-word;word-break:normal;">${titleText}</span>${pageSpan}</div>`;
      } else {
        entryHtml = `<div style="display:flex;align-items:flex-end;margin-top:${mt}px;margin-bottom:${mb}px;font-size:${displayFontSize};font-weight:${style.fontWeight};${entryFontFamily}letter-spacing:${style.letterSpacing};padding-left:${style.indent}px;line-height:${entryLhPxCeil}px;"><span style="flex:1 1 0;min-width:0;height:${titleHeight}px;overflow:hidden;overflow-wrap:break-word;word-break:normal;">${titleText}${separatorInline}</span><span style="flex:0 0 ${maxPageNumW}px;text-align:right;white-space:nowrap;font-weight:normal;color:#555;font-size:0.9em;padding-left:1px;line-height:${entryLhPxCeil}px;transform:translateY(-1px);">${entry.page}</span></div>`;
      }

    } else {
      // CLÁSICO (default): flex row, título + dots inline, número derecha
      entryHtml = `<div style="display:flex;align-items:flex-end;margin-top:${mt}px;margin-bottom:${mb}px;font-size:${displayFontSize};font-weight:${style.fontWeight};${entryFontFamily}text-transform:${style.textTransform};letter-spacing:${style.letterSpacing};padding-left:${style.indent}px;line-height:${entryLhPxCeil}px;"><span style="flex:1 1 0;min-width:0;height:${titleHeight}px;overflow:hidden;overflow-wrap:break-word;word-break:normal;">${titleText}${separatorInline}</span><span style="flex:0 0 ${maxPageNumW}px;text-align:right;white-space:nowrap;font-weight:normal;color:#555;font-size:0.9em;padding-left:1px;line-height:${entryLhPxCeil}px;transform:translateY(-1px);">${entry.page}</span></div>`;
    }

    // Use Phase 3's actual decisions — not a re-computation that could diverge.
    const { followPx, orphanReleased, breakReason } = p3[i];

    // Runtime overflow guard: fires if Phase 3 underestimated entryPx and placing
    // this entry would exceed the actual hard limit. usedHeight > 0 prevents
    // infinite loop when a single entry is taller than the entire page.
    const actualHardLimit = currentPage === 1 ? effFirst : effBody;
    const runtimeOverflow = !pageBreak && usedHeight > 0 && usedHeight + entryPx > actualHardLimit;

    if (pageBreak || runtimeOverflow) {
      currentHtml += buildDebugOverlay(currentPage === 1, currentPage === 1 ? softTarget1 : softTargetN) + '</div>';
      pages.push({
        html: currentHtml,
        pageNumber: startPageNumber + currentPage - 1,
        isTOCPage: true,
        type: 'toc',
        chapterTitle: '',
        currentSubheader: ''
      });
      currentPage++;
      currentHtml = outerDivOpen(false);
      usedHeight = 0;
    }

    // Log AFTER potential page break so page/usedBefore/usedAfter reflect
    // where the entry actually lands (new page if break fired).
    const pageUsable = currentPage === 1 ? effFirst : effBody;
    tocLog.push({
      idx: i, page: currentPage, level: entry.level,
      title: displayTitle.substring(0, 35),
      rawLines, entryPx,
      usedBefore: usedHeight,
      usedAfter: usedHeight + entryPx,
      pageUsable,
      pageBreak, followPx, orphanReleased, breakReason
    });

    currentHtml += entryHtml;
    usedHeight += entryPx;
  }

  // ── Print DEV log ─────────────────────────────────────────────────────────

  currentHtml += buildDebugOverlay(currentPage === 1, currentPage === 1 ? softTarget1 : softTargetN) + '</div>';

  // Push last page only if it has content beyond the opening div
  if (!currentHtml.match(/^<div[^>]*><\/div>$/)) {
    pages.push({
      html: currentHtml,
      pageNumber: startPageNumber + currentPage - 1,
      isTOCPage: true,
      type: 'toc',
      chapterTitle: '',
      currentSubheader: ''
    });
  }

  // ── Build summary text for file-based logging ────────────────────────────
  const tocSummaryText = (() => {
    if (tocLog.length === 0) return '';
    const lines: string[] = [];
    lines.push(`TOC BUILD LOG (${new Date().toISOString()})`);
    lines.push(`Config: template=${template} separator=${separator} bfPx=${bfPx.toFixed(2)} lhPx=${lineHeightPx.toFixed(2)} contentW=${contentWidth ?? '?'} contentH=${contentHeight}`);
    lines.push(`Limits: titleH=${titleHeightPx.toFixed(1)} firstUsable=${firstPageUsable.toFixed(1)} bodyUsable=${bodyPageUsable.toFixed(1)} effFirst=${effFirst.toFixed(1)} effBody=${effBody.toFixed(1)}`);
    lines.push(`Buffer: bottom=${(lineHeightPx * 1.0).toFixed(1)}px clearance=${(lineHeightPx * 1.5).toFixed(1)}px total=${(lineHeightPx * 2.5).toFixed(1)}px`);
    lines.push('');

    const pageNums = [...new Set(tocLog.map(e => e.page))];
    for (const pg of pageNums) {
      const rows = tocLog.filter(e => e.page === pg);
      const usable = rows[0]?.pageUsable ?? 0;
      const finalUsed = rows[rows.length - 1]?.usedAfter ?? 0;
      const fillPct = Math.round(finalUsed / usable * 100);
      const overflow = finalUsed > usable ? ` !! OVERFLOW by ${(finalUsed - usable).toFixed(1)}px` : '';
      lines.push(`── PAGE ${pg} ── usable=${usable.toFixed(1)}px used=${finalUsed.toFixed(1)}px (${fillPct}%)${overflow}`);
      lines.push(`  #   Lv Lines Px    UsedBef  UsedAft  Remain  Title`);
      for (const r of rows) {
        const remain = (r.pageUsable - r.usedAfter).toFixed(1);
        const follow = r.followPx > 0 ? ` +follow=${r.followPx}` : '';
        const released = r.orphanReleased ? ' !orphan' : '';
        const brk = r.pageBreak ? ` <- ${r.breakReason.toUpperCase()}` : '';
        lines.push(
          `  ${String(r.idx).padEnd(3)} H${r.level} ` +
          `${String(r.rawLines).padEnd(5)} ` +
          `${String(r.entryPx).padEnd(5)} ` +
          `${r.usedBefore.toFixed(1).padEnd(8)} ` +
          `${r.usedAfter.toFixed(1).padEnd(8)} ` +
          `${remain.padEnd(7)} ` +
          `"${r.title}"${follow}${released}${brk}`
        );
      }
      lines.push('');
    }

    lines.push(`SUMMARY: ${pageNums.length} page(s), ${tocLog.length} entries, ${pages.length} FM pages total`);
    const risky = tocLog.filter(r => r.usedAfter > r.pageUsable);
    if (risky.length > 0) {
      lines.push(`PLAN OVERFLOW: ${risky.length} entries exceed limit:`);
      for (const r of risky) {
        lines.push(`  p${r.page} #${r.idx} H${r.level} +${(r.usedAfter - r.pageUsable).toFixed(2)}px "${r.title}"`);
      }
    }
    return lines.join('\n');
  })();

  return { pages, tocLog, tocSummaryText };
};

// ─── Main entry point ────────────────────────────────────────────────────────

export const generateFrontMatter = (
  bookTitle: string,
  bookAuthor: string,
  tocEntries: TOCResolvedEntry[],
  tocConfig: TOCConfig | null,
  config: FrontMatterConfig | null,
  contentHeight: number,
  lineHeightPx: number,
  contentWidth?: number,
  baseFontSizePx?: number,
  fontFamily?: string
): { pages: FrontMatterPage[], totalPages: number, h3AutoFontSize: string | null, tocLog: TocLogEntry[], tocSummaryText: string } => {
  const mergedConfig = { ...DEFAULT_FRONT_MATTER_CONFIG, ...(config || {}) };
  const pages: FrontMatterPage[] = [];
  let tocLog: TocLogEntry[] = [];
  let tocSummaryText = '';

  let currentPageNum = 1;

  // Pre-compute uniform H3 font size once so we can return it to the caller
  // (for syncing back to the editor) and pass it into generateTOCPages.
  let h3AutoFontSize: string | null = null;
  if (mergedConfig.includeTOC && tocEntries?.length && tocConfig?.includeLevels?.length && contentWidth) {
    const filtered = tocEntries.filter(e => tocConfig!.includeLevels.includes(e.level));
    // Build the same display titles as generateTOCPages will use (normalize + number prefix)
    // so the H3 auto-size stored in the editor reflects the real rendered text.
    const addNumFM = tocConfig!.addNumbering && tocConfig!.addNumbering !== 'none';
    const effectiveStripFM = tocConfig!.stripLeadingNumber || !!addNumFM;
    const needsNorm = (tocConfig!.titleTransform && tocConfig!.titleTransform !== 'none') || effectiveStripFM;
    const normTitles = needsNorm
      ? filtered.map(e => normalizeTitle(e.title, tocConfig!.titleTransform, effectiveStripFM))
      : filtered.map(e => e.title);
    const nums = addNumFM
      ? computeTOCNumbers(filtered, tocConfig!.includeLevels, tocConfig!.addNumbering as 'decimal' | 'roman')
      : null;
    const filteredForH3 = filtered.map((e, i) => ({
      ...e,
      title: nums?.[i] ? `${nums[i]}\u00a0${normTitles[i]}` : normTitles[i]
    }));
    h3AutoFontSize = computeH3UniformFontSize(
      filteredForH3,
      tocConfig!.template || 'classic',
      contentWidth,
      lineHeightPx,
      tocConfig!.levelOverrides,
      baseFontSizePx
    );
  }

  const titlePage = generateTitlePage(bookTitle, bookAuthor, mergedConfig);
  if (titlePage) {
    titlePage.pageNumber = currentPageNum;
    pages.push(titlePage);
    currentPageNum++;
  }

  if (mergedConfig.includeTOC) {
    // TOC must start on an odd (right-hand) page. If currentPageNum is even,
    // insert a blank verso page first.
    if (currentPageNum % 2 === 0) {
      pages.push({
        html: '',
        pageNumber: currentPageNum,
        isBlank: true,
        type: 'content',
        chapterTitle: '',
        currentSubheader: ''
      });
      currentPageNum++;
    }
    const { pages: tocPages, tocLog: tocBuildLog, tocSummaryText: tocSummary } = generateTOCPages(tocEntries, tocConfig, currentPageNum, contentHeight, lineHeightPx, contentWidth, h3AutoFontSize, baseFontSizePx, fontFamily);
    pages.push(...tocPages);
    tocLog = tocBuildLog;
    tocSummaryText = tocSummary;
  }

  // Ensure FM page count is EVEN so the first content chapter always lands
  // on an odd (right-hand) page in the spread view.
  if (pages.length % 2 !== 0) {
    pages.push({
      html: '',
      pageNumber: pages.length + 1,
      isBlank: true,
      type: 'content',
      chapterTitle: '',
      currentSubheader: ''
    });
  }

  return { pages, totalPages: pages.length, h3AutoFontSize, tocLog, tocSummaryText };
};

export const combineFrontMatterWithContent = (
  frontMatterPages: FrontMatterPage[],
  contentPages: any[]
): any[] => {
  if (!frontMatterPages || frontMatterPages.length === 0) return contentPages;

  const offset = frontMatterPages.length;
  const adjustedContent = contentPages.map(page => ({
    ...page,
    pageNumber: (page.pageNumber || 0) + offset,
    isFrontMatter: false
  }));
  const adjustedFrontMatter = frontMatterPages.map(page => ({
    ...page,
    isFrontMatter: true
  }));

  return [...adjustedFrontMatter, ...adjustedContent];
};
