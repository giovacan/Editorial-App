const SPECIAL_CHAPTERS = [
  'prólogo', 'prologo', 'epílogo', 'epilogo', 'introducción', 'introduccion',
  'conclusión', 'conclusion', 'dedicatoria', 'agradecimientos',
  'bibliografía', 'bibliografia', 'prefacio', 'colofón', 'colofon'
];

/**
 * Returns true if an HTML element looks like a chapter heading.
 */
export const isChapterHeading = (el) => {
  const tag = el.tagName?.toLowerCase();
  const text = el.textContent?.trim() || '';

  if (tag === 'h1' || tag === 'h2') return true;

  if (tag === 'p' || tag === 'div') {
    if (/^(capítulo|chapter|cap\.?)\s*#?\d+/i.test(text)) return true;
    if (/^(capítulo|chapter|cap\.?)\s*#?\d+\s*[-–—:]\s*/i.test(text)) return true;
    if (/^(capítulo|chapter|cap\.?)\s+[ivxlcdm]+/i.test(text)) return true;
    if (/^(capítulo|chapter|cap\.?)\s+(primero|segundo|tercero|cuarto|quinto|sexto|séptimo|octavo|noveno|décimo|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)/i.test(text)) return true;

    if (/^(parte|part|book)\s+\d+/i.test(text)) return true;
    if (/^(parte|part|book)\s+[ivxlcdm]+/i.test(text)) return true;
    if (/^(parte|part|book)\s+(primera|segunda|tercera|cuarta|quinta|sexta|séptima|octava|novena|décima|first|second|third|fourth|fifth)/i.test(text)) return true;

    if (/^libro\s+\d+/i.test(text)) return true;
    if (/^CAPÍTULO\s+/i.test(text)) return true;
    if (/^CAPITULO\s+/i.test(text)) return true;
    if (/^CHAPTER\s+/i.test(text)) return true;

    // Numbered lesson/section families (workbooks, devotionals, courses):
    // "LECCIÓN 1 La Intención Original De Dios", "MÓDULO 2", "DÍA 7"...
    // Length guard: a heading is short; a narrative paragraph that merely
    // STARTS with "Día 1 fue..." must not become a chapter.
    if (text.length <= 80
        && /^(lección|leccion|lesson|sección|seccion|section|unidad|unit|módulo|modulo|module|tema|sesión|sesion|session|día|dia|day)\s*#?\d+/i.test(text)) {
      return true;
    }

    if (SPECIAL_CHAPTERS.includes(text.toLowerCase())) return true;
  }
  return false;
};

/**
 * Index-listing filter: CONSECUTIVE heading-like lines are a table of
 * contents / lesson listing inside the front matter (e.g. a prologue that
 * lists "LECCIÓN 1 …, LECCIÓN 2 …"), NOT real chapter starts — a real
 * chapter always has body content before the next one.
 *
 * @param {number[]} indices - ascending element indices of heading candidates
 * @returns {Set<number>} indices approved as real chapter headings
 */
export const filterIndexListings = (indices) => {
  const approved = new Set();
  for (let k = 0; k < indices.length; k++) {
    const prevAdjacent = k > 0 && indices[k] - indices[k - 1] <= 1;
    const nextAdjacent = k < indices.length - 1 && indices[k + 1] - indices[k] <= 1;
    if (!prevAdjacent && !nextAdjacent) approved.add(indices[k]);
  }
  return approved;
};

/**
 * Detects chapter headings in raw HTML before processing.
 */
export const detectChaptersInRawHtml = (htmlContent) => {
  const temp = document.createElement('div');
  temp.innerHTML = htmlContent;

  const allElements = Array.from(temp.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div'));
  const candidates = [];
  allElements.forEach((el, index) => {
    if (isChapterHeading(el)) {
      candidates.push({ detectedTitle: el.textContent?.trim() || '', elementIndex: index });
    }
  });

  const approved = filterIndexListings(candidates.map(c => c.elementIndex));
  return candidates.filter(c => approved.has(c.elementIndex));
};

/**
 * Detects chapter headings in already-processed chapters array.
 */
export const detectChaptersLocal = (chapters) => {
  const detected = [];

  chapters.forEach((chapter, chapterIndex) => {
    if (!chapter.html) return;
    const temp = document.createElement('div');
    temp.innerHTML = chapter.html;
    const allElements = Array.from(temp.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div'));

    for (const el of allElements) {
      if (isChapterHeading(el)) {
        const titleText = el.textContent?.trim() || '';
        detected.push({
          chapterId: chapter.id,
          chapterIndex,
          chapterTitle: chapter.title || titleText,
          detectedTitle: titleText,
          confirmed: true
        });
        break;
      }
    }
  });

  return detected;
};
