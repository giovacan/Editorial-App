import { isChapterHeading, detectChaptersInRawHtml } from './chapterDetection';

const SPECIAL_CHAPTERS = [
  'prólogo', 'prologo', 'epílogo', 'epilogo', 'introducción', 'introduccion',
  'conclusión', 'conclusion', 'dedicatoria', 'agradecimientos',
  'bibliografía', 'bibliografia', 'prefacio'
];

const makeChapterId = (index) => `chapter-${Date.now()}-${index}`;
const calcWordCount = (html) =>
  html.replace(/<[^>]*>/g, '').split(/\s+/).filter(w => w.length > 0).length;

const isChapterHeaderText = (text) => {
  const trimmed = text.trim();
  if (trimmed.startsWith('# ')) return true;
  if (/^(capítulo|chapter|cap\.?)\s*#?\d+/i.test(trimmed)) return true;
  if (/^(capítulo|chapter|cap\.?)\s*#?\d+\s*[-–—:]\s*/i.test(trimmed)) return true;
  if (/^(capítulo|chapter|cap\.?)\s+[ivxlcdm]+/i.test(trimmed)) return true;
  if (/^(capítulo|chapter|cap\.?)\s+(primero|segundo|tercero|cuarto|quinto|sexto|séptimo|octavo|noveno|décimo)/i.test(trimmed)) return true;
  if (/^(parte|part|book)\s+\d+/i.test(trimmed)) return true;
  if (/^(parte|part|book)\s+[ivxlcdm]+/i.test(trimmed)) return true;
  if (/^(parte|part|book)\s+(primera|segunda|tercera|cuarta|quinta)/i.test(trimmed)) return true;
  if (/^libro\s+\d+/i.test(trimmed)) return true;
  if (/^CAPÍTULO\s+/i.test(trimmed)) return true;
  if (/^CAPITULO\s+/i.test(trimmed)) return true;
  if (/^CHAPTER\s+/i.test(trimmed)) return true;
  if (SPECIAL_CHAPTERS.includes(trimmed.toLowerCase())) return true;
  return false;
};

const isSectionHeaderText = (text) => {
  const trimmed = text.trim();
  if (trimmed.startsWith('## ') || trimmed.startsWith('### ') || /^#{3,}\s+/.test(trimmed)) return true;
  if (/^subtítulo|^subtitle/i.test(trimmed)) return true;
  if (/^nota\s+/i.test(trimmed)) return true;
  if (/^\d+\.\d+/.test(trimmed)) return true;
  return false;
};

/**
 * Parses plain text / markdown content into chapters array.
 */
export const parseTextContent = (content) => {
  const lines = content.split('\n').filter(line => line.trim());
  const chapters = [];
  let currentChapter = null;
  let currentSection = null;

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (isChapterHeaderText(trimmed)) {
      if (currentSection && currentChapter) {
        currentChapter.html += `<h3>${currentSection.title}</h3>${currentSection.html}`;
        currentSection = null;
      }
      if (currentChapter) chapters.push(currentChapter);
      currentChapter = {
        id: makeChapterId(chapters.length),
        type: 'chapter',
        title: trimmed.replace(/^#+\s*/, ''),
        html: '', wordCount: 0
      };
      currentSection = null;
    } else if (isSectionHeaderText(trimmed)) {
      if (currentChapter) {
        if (currentSection) {
          currentChapter.html += `<h3>${currentSection.title}</h3>${currentSection.html}`;
        }
        currentSection = {
          id: `section-${Date.now()}-${chapters.length}-${Math.random()}`,
          type: 'section',
          title: trimmed.replace(/^#+\s*/, ''),
          html: ''
        };
      }
    } else if (currentChapter) {
      if (currentSection) currentSection.html += `<p>${trimmed}</p>`;
      else currentChapter.html += `<p>${trimmed}</p>`;
    }
  });

  if (currentSection && currentChapter) {
    currentChapter.html += `<h3>${currentSection.title}</h3>${currentSection.html}`;
  }
  if (currentChapter) chapters.push(currentChapter);

  if (chapters.length === 0) {
    chapters.push({
      id: makeChapterId(0),
      type: 'chapter',
      title: 'Capítulo 1',
      html: content.split('\n').map(p => `<p>${p}</p>`).join(''),
      wordCount: content.split(/\s+/).length
    });
  }

  chapters.forEach(ch => { ch.wordCount = calcWordCount(ch.html); });
  return chapters;
};

/**
 * Parses HTML content (from DOCX or paste) into chapters array.
 */
export const parseHtmlContent = (htmlContent) => {
  const detectedHeadings = detectChaptersInRawHtml(htmlContent);

  const tempDiv = window.document.createElement('div');
  tempDiv.innerHTML = htmlContent;

  const isSubtitle = (el) => {
    const tag = el.tagName?.toLowerCase();
    const text = el.textContent?.trim() || '';

    if (tag === 'h3' || tag === 'h4') return true;
    if (tag === 'p' || tag === 'div') {
      if (/^subtítulo|subtitle/i.test(text)) return true;
      if (/^nota\s+/i.test(text)) return true;
      if (/^reseña/i.test(text)) return true;
      if (/^\d+\.\d+/.test(text)) return true;
      if (text.length > 80) return false;

      try {
        const fw = el.ownerDocument.defaultView?.getComputedStyle(el)?.fontWeight;
        if (fw && (fw >= 700 || fw === 'bold')) return true;
      } catch { /* ignore */ }

      const style = el.getAttribute('style') || '';
      if (style.includes('font-weight: bold') || style.includes('font-weight:700') || style.includes('font-weight:bold')) return true;
    }
    return false;
  };

  const allElements = tempDiv.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div, section, article');

  if (allElements.length < 5 && htmlContent.length > 5000) {
    const paragraphs = htmlContent
      .split(/(?:<br\s*\/?>|\n|\r\n|\r|(?:<\/p>)|(?:<div>)|(?:<\/div>)|(?:<hr\s*\/?>))/i)
      .map(p => p.trim()).filter(p => p.length > 0);
    tempDiv.innerHTML = paragraphs
      .map(p => /<[a-z]/i.test(p) ? p : `<p>${p}</p>`)
      .join('');
  }

  const chapters = [];
  let currentChapter = null;
  let currentSection = null;

  Array.from(tempDiv.children).forEach((el, index) => {
    const text = el.textContent?.trim() || '';
    if (!text || text.length < 2) return;

    if (isChapterHeading(el)) {
      if (currentChapter) {
        if (currentSection) {
          currentChapter.html += `<h3>${currentSection.title}</h3>${currentSection.html}`;
          currentSection = null;
        }
        chapters.push(currentChapter);
      }
      currentChapter = { id: makeChapterId(chapters.length), type: 'chapter', title: text, html: '', wordCount: 0 };
      currentSection = null;
    } else if (isSubtitle(el)) {
      if (currentChapter) {
        if (currentSection) currentChapter.html += `<h3>${currentSection.title}</h3>${currentSection.html}`;
        currentSection = { id: `section-${Date.now()}-${index}`, type: 'section', title: text, html: '' };
      }
    } else if (currentChapter) {
      if (currentSection) currentSection.html += el.outerHTML;
      else currentChapter.html += el.outerHTML;
    }
  });

  if (currentSection && currentChapter) {
    currentChapter.html += `<h3>${currentSection.title}</h3>${currentSection.html}`;
  }
  if (currentChapter) chapters.push(currentChapter);

  if (chapters.length === 0) {
    chapters.push({
      id: makeChapterId(0),
      type: 'chapter',
      title: 'Capítulo 1',
      html: htmlContent,
      wordCount: calcWordCount(htmlContent)
    });
  }

  chapters.forEach(ch => { ch.wordCount = calcWordCount(ch.html); });
  return { chapters, detectedHeadings };
};
