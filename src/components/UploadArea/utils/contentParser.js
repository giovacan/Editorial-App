import { isChapterHeading, detectChaptersInRawHtml, filterIndexListings } from './chapterDetection';

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
  if (/^nota\s*:/i.test(trimmed)) return true;
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
      if (/^nota\s*:/i.test(text)) return true;
      if (/^reseña/i.test(text)) return true;
      if (/^\d+\.\d+/.test(text)) return true;
      if (text.length > 80) return false;
      // Headings don't end with sentence-ending punctuation — period/!/? means narrative text.
      if (/[.!?]$/.test(text)) return false;
      // Quoted text (curly or straight quotes, guillemets) is narrative, not a heading.
      if (/^["«""\u2018\u201C]/.test(text)) return false;
      // Bold used inline (at start, middle, or end of a paragraph):
      // if the element has bold children AND also plain text nodes as siblings,
      // the bold is emphasis within a paragraph — not a standalone subtitle.
      const hasBoldChild = el.querySelector('strong, b') !== null;
      if (hasBoldChild) {
        const hasNonBoldText = Array.from(el.childNodes).some(
          node => node.nodeType === 3 /* TEXT_NODE */ && node.textContent.trim().length > 0
        );
        if (hasNonBoldText) return false;
      }

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

  // Detect a short, fully-bold <p> that Word/Mammoth split out of a larger paragraph.
  // Handles both <p><strong>TEXT</strong></p> and <p style="font-weight:bold">TEXT</p>.
  const isBoldInlineOpener = (el, text) => {
    const tag = el.tagName?.toLowerCase();
    if (tag !== 'p' && tag !== 'div') return false;
    if (text.length > 80) return false;
    if (!/[.!?…,;:]$/.test(text)) return false;

    // Case A: <strong>/<b> children covering all content
    const hasBoldChild = el.querySelector('strong, b') !== null;
    if (hasBoldChild) {
      const hasPlainText = Array.from(el.childNodes).some(
        n => n.nodeType === 3 && n.textContent.trim().length > 0
      );
      if (hasPlainText) return false;
      return Array.from(el.children)
        .filter(c => c.textContent.trim().length > 0)
        .every(c => c.tagName?.toLowerCase() === 'strong' || c.tagName?.toLowerCase() === 'b');
    }

    // Case B: bold via style attribute on the <p> itself (Mammoth pattern)
    const style = el.getAttribute('style') || '';
    if (/font-weight\s*:\s*(bold|700|800|900)/i.test(style)) return true;
    try {
      const fw = el.ownerDocument.defaultView?.getComputedStyle(el)?.fontWeight;
      if (fw && (parseInt(fw) >= 700 || fw === 'bold')) return true;
    } catch { /* ignore */ }

    return false;
  };

  // Extract inner content of a bold opener, ensuring <strong> wrapping is present.
  const getBoldContent = (el) => {
    if (el.querySelector('strong, b')) return el.innerHTML;
    // Style-based bold — wrap in <strong> to preserve formatting after merge
    return `<strong>${el.innerHTML}</strong>`;
  };

  const chapters = [];
  let currentChapter = null;
  let currentSection = null;
  // Delayed-flush buffers: we hold the last regular paragraph so that if a bold
  // opener appears next, we can merge [preceding] + [bold] + [following] into one <p>.
  let pendingParagraph = null;  // { tag, innerHTML, outerHtml }
  let pendingBoldOpener = null; // { boldContent }

  const addToChapter = (html) => {
    if (currentSection) currentSection.html += html;
    else if (currentChapter) currentChapter.html += html;
  };

  const flushAll = () => {
    if (pendingParagraph) { addToChapter(pendingParagraph.outerHtml); pendingParagraph = null; }
    if (pendingBoldOpener) { addToChapter(`<p>${pendingBoldOpener.boldContent}</p>`); pendingBoldOpener = null; }
  };

  // Pre-pass: real chapter headings only. Consecutive heading-like lines are
  // an index/lesson listing inside front matter — a listing entry must never
  // open a chapter (the whole prologue was being shredded into "chapters").
  const topChildren = Array.from(tempDiv.children);
  const headingCandidates = [];
  topChildren.forEach((el, i) => {
    const t = el.textContent?.trim() || '';
    if (t && t.length >= 2 && isChapterHeading(el)) headingCandidates.push(i);
  });
  const candidateSet = new Set(headingCandidates);
  const approvedHeadings = filterIndexListings(headingCandidates, (idx) => {
    // Run tail is a REAL heading when followed by body text (long, non-heading).
    const next = topChildren[idx + 1];
    const t = next?.textContent?.trim() || '';
    return t.length >= 120 && !candidateSet.has(idx + 1);
  });

  // Document's own table of contents: OMIT it entirely — the app generates
  // its own TOC. Region = the CONTENIDO/ÍNDICE marker + the short/listing
  // lines that follow, until the first real heading or body paragraph.
  const TOC_MARKER_RE = /^(contenido|índice|indice|tabla de contenidos?|table of contents)$/i;
  const skipIndices = new Set();
  const tocStart = topChildren.findIndex(el => TOC_MARKER_RE.test((el.textContent || '').trim()));
  if (tocStart !== -1) {
    skipIndices.add(tocStart);
    for (let i = tocStart + 1; i < Math.min(topChildren.length, tocStart + 60); i++) {
      if (approvedHeadings.has(i)) break;
      const t = topChildren[i].textContent?.trim() || '';
      if (candidateSet.has(i) || t.length <= 100) { skipIndices.add(i); continue; }
      break; // long non-heading text = body — the TOC region ended
    }
  }

  // TOC-driven title matching: the document's own index TELLS US the chapter
  // names. Body lines that match a TOC entry (with or without the "LECCIÓN N"
  // prefix — e.g. the entry says "LECCIÓN 1  La Intención Original De Dios"
  // and the body heading is just "LA INTENCIÓN ORIGINAL DE DIOS") are real
  // chapter starts even when no pattern would catch them.
  if (tocStart !== -1) {
    // Normalize for matching: lowercase, strip accents AND all punctuation
    // (¿?¡!.,: etc.) so "¿Cómo … Propósito?" (index) == "Cómo … Propósito"
    // (body). Keeping the signs made tokens like "¿como" ≠ "como".
    const norm = (s) => s.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9ñ]+/gi, ' ')
      .trim();
    const NUM_PREFIX_RE = /^(lección|leccion|lesson|sección|seccion|section|unidad|unit|módulo|modulo|module|tema|sesión|sesion|session|día|dia|day|capítulo|capitulo|chapter|parte|part)\s*#?\d+\s*/i;
    const tocKeys = new Set();
    for (const i of skipIndices) {
      if (i === tocStart) continue;
      const raw = topChildren[i]?.textContent?.trim() || '';
      if (raw.length < 4) continue;
      tocKeys.add(norm(raw));
      const namePart = raw.replace(NUM_PREFIX_RE, '').trim();
      if (namePart.length >= 4) tocKeys.add(norm(namePart));
    }
    // Token sets per TOC entry — body titles often differ from the index by
    // an article/word ("Las Actitudes Y Excusas" vs "LAS ACTITUDES Y LAS
    // EXCUSAS"), so match by high token overlap, not exact equality.
    // Stopwords include possessives (mi/su/tu…): the index may say "Mi
    // Propósito" while the body titles it "Su Propósito".
    const STOP = new Set(['el','la','los','las','un','una','de','del','y','o','a','en','para','por','con','al','su','mi','tu','sus','mis','tus','nuestro','nuestra','the','of','and','to','for','my','your','his','her']);
    const contentTokens = (s) => norm(s).split(' ').filter(w => w.length > 1 && !STOP.has(w));
    const tocTokenSets = [...tocKeys].map(k => new Set(contentTokens(k))).filter(s => s.size >= 2);

    const tocEnd = Math.max(...skipIndices);
    for (let i = tocEnd + 1; i < topChildren.length; i++) {
      if (approvedHeadings.has(i)) continue;
      const t = topChildren[i].textContent?.trim() || '';
      if (!t || t.length > 90) continue;
      const nt = norm(t);
      if (tocKeys.has(nt)) { approvedHeadings.add(i); continue; }
      // Fuzzy: a body line whose content words are (almost) a superset of a
      // TOC entry's content words is that chapter's title.
      const lineToks = new Set(contentTokens(t));
      if (lineToks.size < 2) continue;
      for (const toc of tocTokenSets) {
        let hit = 0;
        for (const w of toc) if (lineToks.has(w)) hit++;
        if (hit / toc.size >= 0.75) { approvedHeadings.add(i); break; }
      }
    }
  }

  topChildren.forEach((el, index) => {
    if (skipIndices.has(index)) return; // documento's own TOC — omitted
    const text = el.textContent?.trim() || '';
    if (!text || text.length < 2) return;

    if (approvedHeadings.has(index)) {
      flushAll();
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
      flushAll();
      if (currentChapter) {
        if (currentSection) currentChapter.html += `<h3>${currentSection.title}</h3>${currentSection.html}`;
        currentSection = { id: `section-${Date.now()}-${index}`, type: 'section', title: text, html: '' };
      }
    } else {
      // Body content. If it appears BEFORE any chapter heading (e.g. after the
      // omitted TOC but before the first real title), open an implicit
      // front-matter chapter so nothing is dropped.
      if (!currentChapter) {
        currentChapter = { id: makeChapterId(chapters.length), type: 'chapter', title: '', html: '', wordCount: 0 };
      }
      if (isBoldInlineOpener(el, text)) {
        // Buffer bold opener; keep pendingParagraph (will merge all three later)
        if (pendingBoldOpener) {
          // Two consecutive bold openers — treat the first as a regular paragraph
          flushAll();
        }
        pendingBoldOpener = { boldContent: getBoldContent(el) };
      } else {
        // Regular paragraph
        if (pendingBoldOpener) {
          // Merge: [pendingParagraph?] + boldOpener + current → one <p>
          const tag = pendingParagraph?.tag || el.tagName.toLowerCase();
          let merged = '';
          if (pendingParagraph) merged += pendingParagraph.innerHTML + ' ';
          merged += pendingBoldOpener.boldContent + ' ' + el.innerHTML;
          addToChapter(`<${tag}>${merged}</${tag}>`);
          pendingParagraph = null;
          pendingBoldOpener = null;
        } else {
          // No bold opener pending — flush previous, buffer this one
          if (pendingParagraph) addToChapter(pendingParagraph.outerHtml);
          pendingParagraph = { tag: el.tagName.toLowerCase(), innerHTML: el.innerHTML, outerHtml: el.outerHTML };
        }
      }
    }
  });

  flushAll();

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
