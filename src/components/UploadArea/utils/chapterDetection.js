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

    if (SPECIAL_CHAPTERS.includes(text.toLowerCase())) return true;
  }
  return false;
};

/**
 * Detects chapter headings in raw HTML before processing.
 */
export const detectChaptersInRawHtml = (htmlContent) => {
  const temp = document.createElement('div');
  temp.innerHTML = htmlContent;
  const detected = [];

  const allElements = Array.from(temp.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div'));
  allElements.forEach((el, index) => {
    if (isChapterHeading(el)) {
      detected.push({ detectedTitle: el.textContent?.trim() || '', elementIndex: index });
    }
  });

  return detected;
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
