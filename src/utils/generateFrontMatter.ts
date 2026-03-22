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
  usedAfter: number; pageUsable: number; pageBreak: boolean; followPx: number;
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
};

// TOC section title size — constant across templates, always the largest text
const TOC_TITLE_SIZE = '1.1em';

const TEMPLATE_STYLES: Record<TOCTemplate, Record<number, LevelStyle>> = {
  //
  // CLÁSICO — escala descendente tradicional
  // title 1.1 → H1 0.88 → H2 0.82 → H3 0.77 → H4 0.73 → H5 0.70 → H6 0.67
  //
  classic: {
    1: { fontSize: '0.88em', fontWeight: 'bold',   marginTop: '0.5em',  marginBottom: '0.4em',  textTransform: 'none', letterSpacing: 'normal', indent: 0  },
    2: { fontSize: '0.82em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.28em', textTransform: 'none', letterSpacing: 'normal', indent: 8  },
    3: { fontSize: '0.77em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.2em',  textTransform: 'none', letterSpacing: 'normal', indent: 14 },
    4: { fontSize: '0.73em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.15em', textTransform: 'none', letterSpacing: 'normal', indent: 18 },
    5: { fontSize: '0.70em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.12em', textTransform: 'none', letterSpacing: 'normal', indent: 22 },
    6: { fontSize: '0.67em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.1em',  textTransform: 'none', letterSpacing: 'normal', indent: 26 },
  },
  //
  // EQUILIBRADO — H1 y H2 comparten peso visual similar, H3+ pasos hacia abajo
  // El TDC no tiene una jerarquía pronunciada de tamaño, pero sí de sangría y peso.
  // title 1.1 → H1 0.88 bold → H2 0.86 bold → H3 0.81 normal → H4 0.77 normal
  //
  balanced: {
    1: { fontSize: '0.88em', fontWeight: 'bold',   marginTop: '0.45em', marginBottom: '0.32em', textTransform: 'none', letterSpacing: 'normal', indent: 0  },
    2: { fontSize: '0.86em', fontWeight: 'bold',   marginTop: '0',      marginBottom: '0.28em', textTransform: 'none', letterSpacing: 'normal', indent: 6  },
    3: { fontSize: '0.81em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.22em', textTransform: 'none', letterSpacing: 'normal', indent: 12 },
    4: { fontSize: '0.77em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.18em', textTransform: 'none', letterSpacing: 'normal', indent: 16 },
    5: { fontSize: '0.73em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.14em', textTransform: 'none', letterSpacing: 'normal', indent: 20 },
    6: { fontSize: '0.70em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.12em', textTransform: 'none', letterSpacing: 'normal', indent: 24 },
  },
  //
  // ELEGANTE — H1 en versalitas (uppercase + letter-spacing), H2+ en texto normal
  // Uppercase a 0.78em ≈ visualmente equivalente a lowercase 0.88em
  // H2 intencionalmente sin sangría — el contraste bold/uppercase vs. normal es suficiente
  // title 1.1 → H1 0.78 bold uppercase → H2 0.82 normal → H3 0.77 normal
  //
  elegant: {
    1: { fontSize: '0.78em', fontWeight: 'bold',   marginTop: '0.65em', marginBottom: '0.4em',  textTransform: 'uppercase', letterSpacing: '0.09em', indent: 0  },
    2: { fontSize: '0.82em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.3em',  textTransform: 'none',      letterSpacing: 'normal', indent: 0  },
    3: { fontSize: '0.77em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.22em', textTransform: 'none',      letterSpacing: 'normal', indent: 8  },
    4: { fontSize: '0.73em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.16em', textTransform: 'none',      letterSpacing: 'normal', indent: 12 },
    5: { fontSize: '0.70em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.13em', textTransform: 'none',      letterSpacing: 'normal', indent: 16 },
    6: { fontSize: '0.67em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.11em', textTransform: 'none',      letterSpacing: 'normal', indent: 18 },
  },
  //
  // COMPACTO — mismo descenso de jerarquía, espaciado mínimo para TDC largo
  // title 1.1 → H1 0.84 → H2 0.79 → H3 0.75 → H4 0.71 → …
  //
  compact: {
    1: { fontSize: '0.84em', fontWeight: 'bold',   marginTop: '0.3em',  marginBottom: '0.18em', textTransform: 'none', letterSpacing: 'normal', indent: 0  },
    2: { fontSize: '0.79em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.13em', textTransform: 'none', letterSpacing: 'normal', indent: 6  },
    3: { fontSize: '0.75em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.1em',  textTransform: 'none', letterSpacing: 'normal', indent: 12 },
    4: { fontSize: '0.71em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.08em', textTransform: 'none', letterSpacing: 'normal', indent: 16 },
    5: { fontSize: '0.68em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.07em', textTransform: 'none', letterSpacing: 'normal', indent: 18 },
    6: { fontSize: '0.65em', fontWeight: 'normal', marginTop: '0',      marginBottom: '0.06em', textTransform: 'none', letterSpacing: 'normal', indent: 20 },
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
  };
}

function getSeparatorHtml(separator: string): string {
  switch (separator) {
    case 'dots':
      return `<span style="flex-grow:1; min-width:0; overflow:hidden; white-space:nowrap; color:#aaa; font-size:0.8em; padding: 0 4px; letter-spacing: 0.15em;">
        ${'....................................................'}
      </span>`;
    case 'dash':
      return `<span style="flex-grow:1; min-width:0; border-bottom: 1px solid #ccc; margin: 0 8px; align-self: center;"></span>`;
    case 'none':
    default:
      return `<span style="flex-grow:1;"></span>`;
  }
}

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
): { pages: FrontMatterPage[], tocLog: TocLogEntry[] } => {
  if (!ENABLE_TOC || !tocEntries || tocEntries.length === 0 || !tocConfig?.includeLevels?.length) {
    return { pages: [], tocLog: [] };
  }

  const filteredEntries = tocEntries.filter(e => tocConfig.includeLevels.includes(e.level));
  if (filteredEntries.length === 0) return { pages: [], tocLog: [] };

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

  // TOC title: line text + margin-bottom: 1.5em (1em = TOC_TITLE_SIZE * bfPx)
  const titleFontEm  = parseFloat(TOC_TITLE_SIZE) || 1.1;
  const titleHeightPx = lineHeightPx + 1.5 * titleFontEm * bfPx;
  // First page has the TOC title taking space; subsequent pages use full content height.
  // 1-line bottom buffer: accounts for sub-pixel rounding (DOM measurement is now exact).
  const firstPageUsable = contentHeight - titleHeightPx - lineHeightPx * 0.25;
  const bodyPageUsable  = contentHeight - lineHeightPx * 0.25;

  const titleHtml = `<div style="text-align:center; font-size:${TOC_TITLE_SIZE}; font-weight:bold; margin-bottom:1.5em; letter-spacing:${template === 'elegant' ? '0.09em' : 'normal'};">${tocConfig.title || 'Índice'}</div>`;

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
    console.log(
      `[TOC] Layout: bfPx=${bfPx.toFixed(2)} lhPx=${lineHeightPx.toFixed(2)} ` +
      `contentW=${contentWidth ?? '?'} contentH=${contentHeight}`
    );
    console.log(
      `[TOC] Limits: titleH=${titleHeightPx.toFixed(2)} ` +
      `firstUsable=${firstPageUsable.toFixed(2)} bodyUsable=${bodyPageUsable.toFixed(2)}`
    );
    console.log(
      `[TOC] Char widths: avgW=fontPx×0.68 colRatio=58% ` +
      `charsPerLine: H1≈${_cplH1} H2≈${_cplH2} (template=${template})`
    );
    console.log(`[TOC] h1SinglePx=${h1SinglePx.toFixed(2)} h2SinglePx=${h2SinglePx.toFixed(2)}`);
  }

  // ── DEV visual overlays ───────────────────────────────────────────────────
  // Set TOC_DEBUG_LINES = true to show colored limit lines in the TOC preview.
  //   🟢 green  = contentHeight         → CSS overflow:hidden clips here
  //   🟡 yellow = firstPageUsable/body  → base usable (0.25-line buffer)
  //   🔴 red    = effFirst/effBody       → planning hard limit
  //   🔵 blue   = softTarget             → soft break threshold
  const TOC_DEBUG_LINES = false; // ← set true to visualize limits
  const buildDebugOverlay = (isFirstPg: boolean, softTarget: number): string => {
    if (!IS_DEV || !TOC_DEBUG_LINES) return '';
    const titleOff = isFirstPg ? titleHeightPx : 0;
    const eff      = isFirstPg ? effFirst : effBody;
    const usable   = isFirstPg ? firstPageUsable : bodyPageUsable;
    const line = (top: number, color: string, label: string): string =>
      `<div style="position:absolute;left:0;right:0;top:${top.toFixed(1)}px;height:0;` +
      `border-top:1.5px dashed ${color};z-index:9999;pointer-events:none;">` +
      `<span style="position:absolute;right:2px;top:-12px;font-size:7px;` +
      `background:${color};color:#fff;padding:1px 3px;border-radius:2px;` +
      `font-family:monospace;white-space:nowrap;">${label}</span></div>`;
    return (
      line(contentHeight - 1,      '#38a169', `contentH=${contentHeight}px`) +
      line(titleOff + usable,      '#d69e2e', `usable=${usable.toFixed(0)}px`) +
      line(titleOff + eff,         '#e53e3e', `eff=${eff.toFixed(0)}px`) +
      line(titleOff + softTarget,  '#3182ce', `soft=${softTarget.toFixed(0)}px`)
    );
  };

  const outerDivOpen = (withTitle: boolean): string =>
    `<div style="padding: 0 12px; text-align:left; position:relative;">` +
    (withTitle ? titleHtml : '');

  let currentHtml = outerDivOpen(true);
  let usedHeight = 0;   // pixels used so far on current page (after title)
  let currentPage = 1;

  const separatorHtml = getSeparatorHtml(separator); // same for all entries

  // ── DOM measurement container ─────────────────────────────────────────────
  // Render each entry in a hidden div with the same CSS context as the preview
  // page so scrollHeight gives the exact pixels CSS will render (flex baseline
  // alignment, sub-pixel rounding, actual font metrics) — no approximation needed.
  const tocInnerWidth = contentWidth ? contentWidth - 24 : 0; // 24 = 12px padding × 2
  let domMeasEl: HTMLElement | null = null;
  if (typeof document !== 'undefined' && tocInnerWidth > 0 && fontFamily) {
    domMeasEl = document.createElement('div');
    domMeasEl.style.cssText =
      `position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;` +
      `width:${tocInnerWidth}px;font-family:${fontFamily};font-size:${bfPx}px;` +
      `line-height:${lineHeightPx}px;word-break:normal;overflow-wrap:break-word;`;
    document.body.appendChild(domMeasEl);
  }

  // ── Phase 1: Pre-compute measurements for every entry ────────────────────
  // Separating measurement from layout lets us run a balanced distribution pass
  // that equalizes fill% across all TOC pages before committing to HTML.
  type ComputedEntry = {
    entry: TOCResolvedEntry; displayTitle: string; style: LevelStyle;
    rawLines: number; entryPx: number; displayFontSize: string; isH3: boolean;
  };
  // Approximate page-number column width: ~3 digits at 0.9em font size.
  // The title span (flex:0 1 auto) wraps at container_width - indent - page_num_width,
  // so this is the correct canvas measurement width for all levels.
  const pageNumWidth = contentWidth ? Math.ceil(2.5 * bfPx) : 0;

  const computed: ComputedEntry[] = filteredEntries.map((entry, i) => {
    const displayTitle = displayTitles[i];
    const style = getLevelStyle(template, entry.level, tocConfig.levelOverrides);
    const isH3 = entry.level === 3;

    // displayFontSize must be known BEFORE canvas measurement so H3 uses its
    // scaled font size (h3UniformFontSize) rather than the template default.
    let displayFontSize = style.fontSize;
    if (isH3 && h3UniformFontSize !== null) {
      displayFontSize = h3UniformFontSize;
    }

    // rawLines: canvas for all entries when fontFamily is available (accurate glyph widths).
    // H3 uses its own line-height ratio (1.3× its em), not the book's lineHeightPx.
    // Fall back to character-count estimation when fontFamily is not yet known.
    let rawLines = 1;
    if (contentWidth && fontFamily) {
      const entryFontPx = (parseFloat(displayFontSize) || 0.85) * bfPx;
      const entryLhPx   = isH3 ? (1.3 * entryFontPx) : lineHeightPx;
      const titleColW   = Math.max(40, contentWidth - 24 - style.indent - pageNumWidth);
      const h = measureHtmlHeight(
        `<div style="margin:0;padding:0;font-weight:${style.fontWeight};">${displayTitle}</div>`,
        { baseFontSizePx: entryFontPx, baseLineHeight: entryLhPx / entryFontPx, lineHeightPx: entryLhPx, contentWidth: titleColW, fontFamily }
      );
      rawLines = Math.max(1, Math.round(h / entryLhPx));
    } else if (contentWidth) {
      rawLines = estimateEntryLines(displayTitle, entry.level, contentWidth, lineHeightPx, template, tocConfig.levelOverrides, undefined, baseFontSizePx);
    }

    // Non-H3 scale-down: if rawLines > 2 shrink font to cap at 2 visual lines.
    if (!isH3 && entry.level >= 2 && rawLines > 2) {
      const em = parseFloat(style.fontSize) || 0.85;
      displayFontSize = `${Math.max(0.65, em * (2 / rawLines)).toFixed(2)}em`;
    }

    let entryPx: number;
    if (domMeasEl) {
      // DOM measurement: render the exact same HTML structure as Phase 4 (dummy page#)
      // scrollHeight accounts for flex baseline alignment, margins, sub-pixel rounding.
      const measHtml =
        `<div style="display:flex;align-items:last baseline;` +
        `margin-top:${style.marginTop};margin-bottom:${style.marginBottom};` +
        `font-size:${displayFontSize};font-weight:${style.fontWeight};` +
        `text-transform:${style.textTransform};letter-spacing:${style.letterSpacing};` +
        `padding-left:${style.indent}px;` +
        `line-height:${isH3 ? '1.3' : `${lineHeightPx}px`};` +
        `"><span style="flex:0 1 auto;white-space:normal;overflow-wrap:break-word;` +
        `word-break:normal;">${displayTitle}</span>` +
        `${separatorHtml}` +
        `<span style="flex-shrink:0;font-weight:normal;color:#555;font-size:0.9em;">999</span></div>`;
      domMeasEl.innerHTML = measHtml;
      entryPx = Math.ceil(domMeasEl.scrollHeight);
      // Update rawLines from actual DOM height (for accurate logging)
      const entryLhPx = isH3 ? (1.3 * (parseFloat(displayFontSize) || 0.70) * bfPx) : lineHeightPx;
      rawLines = Math.max(1, Math.round(entryPx / entryLhPx));
    } else if (isH3) {
      const h3Em = parseFloat(displayFontSize) || 0.70;
      const lhPx = 1.3 * h3Em * bfPx;
      const mbPx = parseFloat(style.marginBottom) * h3Em * bfPx;
      entryPx = Math.ceil(rawLines * lhPx + mbPx);
    } else {
      const lines = entry.level >= 2 && rawLines > 2 ? 2 : rawLines;
      const singleLinePx = entry.level === 1 ? h1SinglePx : h2SinglePx;
      entryPx = Math.ceil(singleLinePx + Math.max(0, lines - 1) * lineHeightPx);
    }
    return { entry, displayTitle, style, rawLines, entryPx, displayFontSize, isH3 };
  });

  // Clean up DOM measurement container (measurements complete)
  if (domMeasEl?.parentNode) {
    domMeasEl.parentNode.removeChild(domMeasEl);
  }
  if (IS_DEV && domMeasEl) {
    console.log(`[TOC] DOM measurement used for ${computed.length} entries (exact scrollHeight)`);
  }

  // ── Phase 2: Greedy pass — find minimum page count P ─────────────────────
  // No orphan guard here: guard inflates P when every entry is H1 (chapter-only
  // TOC), doubling the effective height per slot and halving soft targets.
  // The guard is applied later as a hard constraint only in Phase 3.
  // Use the same 1-line clearance as Phase 3 so P matches what Phase 3 will produce.
  const effFirst = firstPageUsable - lineHeightPx * 0.25;
  const effBody  = bodyPageUsable  - lineHeightPx * 0.25;
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
  const totalContent = computed.reduce((s, c) => s + c.entryPx, 0);
  const totalUsable  = effFirst + Math.max(0, P - 1) * effBody;
  // Soft target = just below the hard limit so it fires as a last-resort safety net
  // rather than redistributing content across pages. Pages fill to the hard limit
  // and only soft-break if used reaches 0.25 lines before the hard limit.
  const softTarget1  = effFirst - lineHeightPx * 0.25;
  const softTargetN  = effBody  - lineHeightPx * 0.25;

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
      const nextIsSubEntry = i < computed.length - 1 && computed[i + 1].entry.level > 1;
      const followPx   = c.entry.level === 1 && nextIsSubEntry
        ? computed[i + 1].entryPx
        : 0;
      const hardBreak = pageUsed + c.entryPx + followPx > hardLimit && pageUsed > 0;
      const softBreak = pagesLeft > 1 && pageUsed >= softTarget && pageUsed > 0;
      if (hardBreak || softBreak) { pageBreakBefore[i] = true; curPage++; pageUsed = 0; }
      pageUsed += c.entryPx;
    }
  }

  // ── Phase 4: HTML generation + tocLog ────────────────────────────────────
  for (let i = 0; i < computed.length; i++) {
    const { entry, displayTitle, style, rawLines, entryPx, displayFontSize, isH3 } = computed[i];
    const pageBreak = pageBreakBefore[i];

    let titleText = digitalLinks && entry.elementId
      ? `<a href="#${entry.elementId}" style="color:inherit; text-decoration:none;">${displayTitle}</a>`
      : displayTitle;
    const entryHtml = `<div style="display:flex;align-items:last baseline;margin-top:${style.marginTop};margin-bottom:${style.marginBottom};font-size:${displayFontSize};font-weight:${style.fontWeight};text-transform:${style.textTransform};letter-spacing:${style.letterSpacing};padding-left:${style.indent}px;line-height:${isH3 ? '1.3' : `${lineHeightPx}px`};"><span style="flex:0 1 auto;white-space:normal;overflow-wrap:break-word;word-break:normal;">${titleText}</span>${separatorHtml}<span style="flex-shrink:0;font-weight:normal;color:#555;font-size:0.9em;">${entry.page}</span></div>`;

    const pageUsable = currentPage === 1 ? effFirst : effBody;
    const followPx   = entry.level === 1 && i < computed.length - 1
      && computed[i + 1].entry.level > 1
      ? computed[i + 1].entryPx
      : 0;

    tocLog.push({
      idx: i, page: currentPage, level: entry.level,
      title: displayTitle.substring(0, 35),
      rawLines, entryPx,
      usedBefore: usedHeight,
      usedAfter: usedHeight + (pageBreak ? 0 : entryPx),
      pageUsable,
      pageBreak,
      followPx
    });

    if (pageBreak) {
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

    currentHtml += entryHtml;
    usedHeight += entryPx;
  }

  // ── Print DEV log ─────────────────────────────────────────────────────────
  if (IS_DEV && tocLog.length > 0) {
    // Group by page and print compact table
    const pageNums = [...new Set(tocLog.map(e => e.page))];
    for (const pg of pageNums) {
      const rows = tocLog.filter(e => e.page === pg);
      const usable = rows[0]?.pageUsable ?? 0;
      const finalUsed = rows[rows.length - 1]?.usedAfter ?? 0;
      const fillPct = Math.round(finalUsed / usable * 100);
      console.log(`\n[TOC] ── PAGE ${pg} ── usable=${usable.toFixed(1)}px  used=${finalUsed.toFixed(1)}px (${fillPct}%)`);
      console.log(`[TOC]  ${'#'.padEnd(3)} ${'Lv'.padEnd(2)} ${'Lines'.padEnd(5)} ${'Px'.padEnd(5)} ${'UsedBefore'.padEnd(10)} ${'UsedAfter'.padEnd(9)} ${'Remain'.padEnd(7)} Title`);
      for (const r of rows) {
        const remain = (r.pageUsable - r.usedAfter).toFixed(1);
        const follow = r.followPx > 0 ? ` +follow=${r.followPx}` : '';
        const brk    = r.pageBreak ? ' ← BREAK' : '';
        console.log(
          `[TOC]  ${String(r.idx).padEnd(3)} H${r.level} ` +
          `${String(r.rawLines).padEnd(5)} ` +
          `${String(r.entryPx).padEnd(5)} ` +
          `${r.usedBefore.toFixed(1).padEnd(10)} ` +
          `${r.usedAfter.toFixed(1).padEnd(9)} ` +
          `${remain.padEnd(7)} ` +
          `"${r.title}"${follow}${brk}`
        );
      }
    }
    // Summary — show effFirst/effBody clearance so it's easy to compare with [TOC-RENDER] scrollHeight
    const totalPages = [...new Set(tocLog.map(e => e.page))].length;
    console.log(`\n[TOC] SUMMARY: ${totalPages} page(s), ${tocLog.length} entries`);
    console.log(`[TOC] Planned limits: effFirst=${effFirst.toFixed(1)}px effBody=${effBody.toFixed(1)}px contentH=${contentHeight}px (${lineHeightPx}px/line)`);
    // Flag entries that overflow their effective page limit (should not happen, indicates measurement bug)
    const risky = tocLog.filter(r => !r.pageBreak && r.usedAfter > r.pageUsable);
    if (risky.length > 0) {
      console.warn(`[TOC] ⚠ PLAN OVERFLOW: ${risky.length} entries exceed effective limit (measurement error!):`);
      for (const r of risky) {
        const over = (r.usedAfter - r.pageUsable).toFixed(2);
        console.warn(`[TOC]   p${r.page} #${r.idx} H${r.level} +${over}px overflow "${r.title}"`);
      }
    }
  }

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

  return { pages, tocLog };
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
): { pages: FrontMatterPage[], totalPages: number, h3AutoFontSize: string | null, tocLog: TocLogEntry[] } => {
  const mergedConfig = { ...DEFAULT_FRONT_MATTER_CONFIG, ...(config || {}) };
  const pages: FrontMatterPage[] = [];
  let tocLog: TocLogEntry[] = [];

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
    const { pages: tocPages, tocLog: tocBuildLog } = generateTOCPages(tocEntries, tocConfig, currentPageNum, contentHeight, lineHeightPx, contentWidth, h3AutoFontSize, baseFontSizePx, fontFamily);
    pages.push(...tocPages);
    tocLog = tocBuildLog;
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

  return { pages, totalPages: pages.length, h3AutoFontSize, tocLog };
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
