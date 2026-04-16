/**
 * textMeasurement.js
 *
 * Canvas singleton, caches, font loading, and word/text measurement utilities.
 * This module has no dependencies on other local modules.
 */

// ─── Canvas singleton ───────────────────────────────────────────────

let _canvas = null;
let _ctx = null;

export const getCtx = () => {
  if (!_ctx) {
    if (typeof OffscreenCanvas !== 'undefined') {
      _canvas = new OffscreenCanvas(1, 1);
    } else {
      _canvas = document.createElement('canvas');
    }
    _ctx = _canvas.getContext('2d');
  }
  return _ctx;
};

// ─── Font loading guard ─────────────────────────────────────────────

// Per-font readiness map — key is normalized font family name.
// Prevents stale Canvas measurements when the user switches fonts mid-session.
const _fontsReady = new Map();

/**
 * Wait until the requested font is loaded before Canvas measurement starts.
 * Tracks readiness per font family — switching fonts correctly invalidates caches.
 *
 * @param {string} [fontFamily] - Font to preload (e.g. 'Lato, sans-serif')
 * @param {number} [fontSize=12] - Font size in pt for the preload request
 */
export const ensureFontsReady = async (fontFamily = '', fontSize = 12) => {
  const key = fontFamily.toLowerCase().split(',')[0].trim();
  if (_fontsReady.get(key)) return;

  if (typeof document !== 'undefined' && document.fonts) {
    // Race font loading against a timeout — some system fonts (Georgia, serif)
    // have no @font-face and document.fonts.load() may hang indefinitely.
    const timeout = new Promise(resolve => setTimeout(resolve, 2000));
    try {
      await Promise.race([
        (async () => {
          if (fontFamily) {
            try { await document.fonts.load(`${fontSize}pt ${fontFamily}`); } catch (_) {}
          }
          await document.fonts.ready;
        })(),
        timeout
      ]);
    } catch (_) {
      // Font loading failed or timed out — proceed with whatever is available
    }
  }

  _fontsReady.set(key, true);

  // CRITICAL: always clear all caches when a new font is registered.
  // Mixed cache entries from previous fonts produce wrong line-break measurements.
  _wordWidthCache.clear();
  _spaceWidthCache.clear();
  _paragraphLayoutCache.clear();
};

// ─── Font string builder ────────────────────────────────────────────

export const buildFontString = (fontSize, fontFamily, bold = false, italic = false) => {
  const style = italic ? 'italic' : 'normal';
  const weight = bold ? 'bold' : 'normal';
  return `${style} ${weight} ${fontSize}px ${fontFamily}`;
};

// ─── Word width cache ───────────────────────────────────────────────

export const _wordWidthCache = new Map();

// ─── Paragraph layout cache ─────────────────────────────────────────
// Key: "fontString|width|indent|textHash" → { lines, height }
// Avoids re-measuring identical paragraphs during editing.

export const _paragraphLayoutCache = new Map();
export const MAX_PARAGRAPH_CACHE = 2000;
export const KP_WORD_THRESHOLD = 200; // Fall back to greedy for paragraphs with >200 words

export const getParagraphCacheKey = (text, fontString, contentWidth, indentPx, wordSpacingPx = 0) => {
  // Use text length + first/last 40 chars as hash (fast, collision-resistant for real text)
  const textKey = text.length <= 80
    ? text
    : text.slice(0, 40) + '|' + text.length + '|' + text.slice(-40);
  return `${fontString}|${contentWidth}|${indentPx}|${wordSpacingPx}|${textKey}`;
};

// ─── Sub-pixel normalization ────────────────────────────────────────

export const normalizeWidth = (w) => Math.round(w * 1000) / 1000;

// ─── Core: measure text width ───────────────────────────────────────

export const measureTextWidth = (text, fontString) => {
  const ctx = getCtx();
  ctx.font = fontString;
  return normalizeWidth(ctx.measureText(text).width);
};

// ─── Core: measure single word width (cached) ───────────────────────

// NOTE: measureWordWidth references NBSP_SENTINEL from textPreprocess.js.
// To avoid a circular dependency (textPreprocess imports textMeasurement),
// we inline the sentinel value here as a constant.
const _NBSP_SENTINEL = '\uE000';

export const measureWordWidth = (word, fontString) => {
  const key = fontString + '|' + word;
  if (_wordWidthCache.has(key)) return _wordWidthCache.get(key);
  // Restore NBSP sentinel to a regular space for Canvas measurement
  // (Canvas measures \uE000 as zero-width; we need the actual space width)
  const measured = word.includes(_NBSP_SENTINEL) ? word.replace(/\uE000/g, ' ') : word;
  const w = measureTextWidth(measured, fontString);
  _wordWidthCache.set(key, w);
  return w;
};

// ─── Space width cache ──────────────────────────────────────────────

export const _spaceWidthCache = new Map();

export const getSpaceWidth = (fontString) => {
  if (_spaceWidthCache.has(fontString)) return _spaceWidthCache.get(fontString);
  const w = measureTextWidth(' ', fontString);
  _spaceWidthCache.set(fontString, w);
  return w;
};
