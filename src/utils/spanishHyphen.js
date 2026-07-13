/**
 * spanishHyphen.js — Rule-based Spanish syllabification for hyphenation.
 *
 * Spanish syllable division is (unlike English) almost fully regular, so a
 * compact rule implementation covers real text reliably:
 *
 *   - V-CV        : la separación va antes de una consonante entre vocales
 *   - VC-CV       : dos consonantes se separan…
 *   - V-CCV       : …salvo grupos inseparables (pr, br, tr, pl, bl, ch, ll, rr…)
 *   - VCC-CV/VC-CCV: tres consonantes según el grupo final
 *   - Diptongos NO se separan; hiatos (dos fuertes, o débil acentuada) SÍ
 *
 * Hyphenation constraints (RAE): nunca dejar menos de 2 letras en la línea
 * superior ni menos de 2 en la inferior.
 */

const VOWELS = 'aeiouáéíóúü';
const STRONG = 'aeoáéó';
const ACCENTED_WEAK = 'íú';

// Consonant clusters that always start a syllable together (plus digraphs).
const ONSETS = new Set([
  'pr', 'br', 'tr', 'dr', 'cr', 'gr', 'fr', 'kr',
  'pl', 'bl', 'cl', 'gl', 'fl', 'tl',
  'ch', 'll', 'rr',
]);

const isVowel = (c) => VOWELS.includes(c);

// Hiato: two strong vowels together, or an accented weak vowel next to any
// vowel — they belong to different syllables.
const isHiatus = (a, b) =>
  (STRONG.includes(a) && STRONG.includes(b))
  || ACCENTED_WEAK.includes(a)
  || ACCENTED_WEAK.includes(b);

/**
 * Syllable boundary positions (char indices where a hyphen may be inserted)
 * for a plain Spanish word. Returns [] for words with non-letters (digits,
 * punctuation, existing hyphens) — safer to not hyphenate those.
 *
 * @param {string} word
 * @returns {number[]} ascending break indices, filtered to prefix ≥2 / suffix ≥3
 */
export const spanishBreakPoints = (word) => {
  if (!word || word.length < 5) return [];
  const w = word.toLowerCase();
  if (!/^[a-záéíóúüñ]+$/.test(w)) return [];

  const breaks = [];
  let i = 0;
  while (i < w.length) {
    // advance to a vowel (syllable nucleus)
    while (i < w.length && !isVowel(w[i])) i++;
    if (i >= w.length) break;

    // vowel group: split hiatus inside it
    let vEnd = i;
    while (vEnd + 1 < w.length && isVowel(w[vEnd + 1])) {
      if (isHiatus(w[vEnd], w[vEnd + 1])) {
        breaks.push(vEnd + 1);
      }
      vEnd++;
    }

    // consonant run after the nucleus
    let cStart = vEnd + 1;
    let cEnd = cStart;
    while (cEnd < w.length && !isVowel(w[cEnd])) cEnd++;
    if (cEnd >= w.length) break; // trailing consonants — no boundary

    const n = cEnd - cStart;
    if (n === 1) {
      breaks.push(cStart);                       // V-CV
    } else if (n === 2) {
      const pair = w.slice(cStart, cEnd);
      breaks.push(ONSETS.has(pair) ? cStart : cStart + 1); // V-CCV | VC-CV
    } else if (n >= 3) {
      const lastTwo = w.slice(cEnd - 2, cEnd);
      breaks.push(ONSETS.has(lastTwo) ? cEnd - 2 : cEnd - 1); // VC(C)-CCV | VCC-CV
    }

    i = cEnd;
  }

  return breaks.filter(b => b >= 2 && word.length - b >= 2);
};

/**
 * Longest hyphenatable prefix of `word` (WITHOUT the hyphen char) whose
 * rendered width, incl. the hyphen, fits in `available` px. Returns '' when
 * none fits.
 *
 * Strips common trailing punctuation before syllabifying and never splits
 * inside it.
 *
 * @param {string} word
 * @param {number} available - px available for prefix + hyphen
 * @param {CanvasRenderingContext2D} ctx2d - font must already be set
 * @returns {string} the prefix ('' if no valid fit)
 */
export const fittingHyphenPrefix = (word, available, ctx2d) => {
  if (!word || available <= 0 || !ctx2d) return '';
  const core = word.replace(/[.,;:!?»"”)\]…]+$/u, '');
  const points = spanishBreakPoints(core);
  if (points.length === 0) return '';
  const hyphenW = ctx2d.measureText('-').width;
  for (let i = points.length - 1; i >= 0; i--) {
    const prefix = core.slice(0, points[i]);
    if (ctx2d.measureText(prefix).width + hyphenW <= available) return prefix;
  }
  return '';
};
