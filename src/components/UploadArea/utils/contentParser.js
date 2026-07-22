import { isChapterHeading, detectChaptersInRawHtml, filterIndexListings } from './chapterDetection';
import { isTableMarkupSane } from '../../../utils/tableLayoutEngine';
import { detectFootnotes } from '../../../utils/footnotes';

const SPECIAL_CHAPTERS = [
  'prólogo', 'prologo', 'epílogo', 'epilogo', 'introducción', 'introduccion',
  'conclusión', 'conclusion', 'dedicatoria', 'agradecimientos', 'agradecimiento',
  'bibliografía', 'bibliografia', 'prefacio', 'colofón', 'colofon',
  'presentación', 'presentacion', 'apéndice', 'apendice', 'anexo', 'anexos',
  'glosario', 'nota del autor', 'sobre el autor', 'acerca del autor',
  'referencias', 'referencias bibliográficas', 'referencias bibliograficas',
  'reconocimientos'
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
  // Normalize DOCX/paste artifacts that survive into stored HTML and break the
  // engine↔browser agreement:
  //   1) Runs of multiple spaces. The height engine COLLAPSES them when
  //      measuring (counts correct lines), but they survive in the stored
  //      HTML; once a paragraph is SPLIT into fragments the browser renders
  //      those extra spaces inside a justified line → big visible gaps and
  //      the line renderer bails (data-engine-lines skipped), so the page
  //      measures 96% yet looks half-empty (reported by the user).
  //   2) Stray/unbalanced inline tags (lone </em>) that inflate DOM height.
  // Round-tripping each block through a fresh node rebalances tags; a regex
  // collapses whitespace in the text nodes.
  const normalizeBlocks = (root) => {
    const els = root.querySelectorAll('p, h1, h2, h3, h4, h5, h6, blockquote, li, div');
    for (const el of els) {
      let html = el.innerHTML;
      const before = html;
      // Collapse runs of whitespace (incl. NBSP sequences) to a single space.
      html = html.replace(/[\t  ]{2,}/g, ' ').replace(/\s{2,}/g, ' ');
      // Rebalance inline markup if present.
      if (/<\/?(em|strong|b|i|u|span)[\s>]/i.test(html)) {
        const tmp = window.document.createElement(el.tagName || 'div');
        tmp.innerHTML = html;
        html = tmp.innerHTML;
      }
      if (html !== before) el.innerHTML = html;
    }
  };
  normalizeBlocks(tempDiv);

  // Tables: keep STRUCTURALLY SANE tables intact — the pagination engine now
  // lays them out natively (tableLayoutEngine: fixed col widths, row splits
  // with repeated header, drawn borders). Only tables its grid parser rejects
  // (nested tables, captions, images, >6 cols, header-only...) are linearized
  // in reading order as before. Width-dependent sanity (min-content vs page)
  // is re-checked at pagination time, where the engine falls back the same way.
  const linearizeTables = (root) => {
    for (const tbl of Array.from(root.querySelectorAll('table'))) {
      if (isTableMarkupSane(tbl.outerHTML)) continue;
      const frag = window.document.createDocumentFragment();
      for (const cell of Array.from(tbl.querySelectorAll('td, th'))) {
        const blocks = Array.from(cell.querySelectorAll('p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote'));
        if (blocks.length > 0) {
          for (const b of blocks) frag.appendChild(b.cloneNode(true));
        } else if (cell.textContent.trim()) {
          const p = window.document.createElement('p');
          p.innerHTML = cell.innerHTML;
          frag.appendChild(p);
        }
      }
      tbl.replaceWith(frag);
    }
  };
  linearizeTables(tempDiv);

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

  // ── Book title extraction ────────────────────────────────────────────
  // The document's own title is usually the first substantial line, sitting
  // BEFORE the TOC marker / first chapter: a short, non-heading, non-body
  // line (often the largest/bold). Extract it so the app can prefill the
  // book title instead of leaving it blank.
  const detectBookTitle = () => {
    const first = Array.from(tempDiv.children).slice(0, 8);
    const TOC_RE = /^(contenido|índice|indice|tabla de contenidos?|table of contents)$/i;
    for (const el of first) {
      const t = el.textContent?.trim() || '';
      if (!t || t.length < 3) continue;
      if (TOC_RE.test(t)) break;               // reached the TOC — title (if any) was before it
      if (isChapterHeading(el)) break;          // reached a real chapter — no standalone title
      if (t.length > 90) break;                 // long paragraph = body already started
      if (/[.!?]$/.test(t)) continue;           // sentence = not a title
      if (/^["«“”‘“]/.test(t)) continue;
      return t;                                 // first clean short line = book title
    }
    return '';
  };
  const bookTitle = detectBookTitle();
  const bookTitleNorm = bookTitle
    ? bookTitle.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]+/gi, ' ').trim()
    : '';

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
  const headingLabels = new Map(); // elementIndex → structural label ("LECCIÓN 1")
  // A bare structural label ("CAPÍTULO 1", possibly duplicated by Word) is a
  // real chapter start, NOT a TOC entry — even when adjacent to another label.
  const isBareLabel = (idx) => {
    const t = topChildren[idx]?.textContent?.trim() || '';
    if (t.length > 40) return false;
    return /^\s*(lección|leccion|lesson|sección|seccion|section|unidad|unit|módulo|modulo|module|tema|sesión|sesion|session|día|dia|day|capítulo|capitulo|chapter|parte|part)\s*#?\d+\s*$/i.test(t);
  };
  // Bare labels ("CAPÍTULO 1") never belong to a TOC listing — exclude them
  // from the adjacency filter (they'd otherwise be seen as a "run" with their
  // Word-duplicated twin). The first bare-label of each duplicate pair is the
  // real chapter start; approve it and skip its duplicates in the main loop.
  const bareLabelIdx = headingCandidates.filter(isBareLabel);
  const nonBare = headingCandidates.filter(i => !isBareLabel(i));
  const approvedHeadings = filterIndexListings(nonBare, (idx) => {
    // Run tail is a REAL heading when followed by body text (long, non-heading).
    const next = topChildren[idx + 1];
    const t = next?.textContent?.trim() || '';
    return t.length >= 120 && !candidateSet.has(idx + 1);
  });
  // Approve the FIRST label of each consecutive bare-label run (Word dup).
  for (let k = 0; k < bareLabelIdx.length; k++) {
    const prevAdjacentSameText = k > 0
      && bareLabelIdx[k] - bareLabelIdx[k - 1] <= 1
      && (topChildren[bareLabelIdx[k]].textContent || '').trim().toUpperCase()
         === (topChildren[bareLabelIdx[k - 1]].textContent || '').trim().toUpperCase();
    if (!prevAdjacentSameText) approvedHeadings.add(bareLabelIdx[k]);
  }

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
    const NUM_PREFIX_RE = /^(lección|leccion|lesson|sección|seccion|section|unidad|unit|módulo|modulo|module|tema|sesión|sesion|session|día|dia|day|capítulo|capitulo|chapter|parte|part)\s*#?\d+/i;
    const tocKeys = new Set();
    const tocEntryData = []; // { name, label } per TOC entry (label = "LECCIÓN 1" o '')
    for (const i of skipIndices) {
      if (i === tocStart) continue;
      const raw = topChildren[i]?.textContent?.trim() || '';
      if (raw.length < 4) continue;
      tocKeys.add(norm(raw));
      const prefixM = raw.match(NUM_PREFIX_RE);
      const label = prefixM ? prefixM[0].replace(/\s+/g, ' ').trim().toUpperCase() : '';
      const namePart = raw.replace(NUM_PREFIX_RE, '').trim();
      if (namePart.length >= 4) { tocKeys.add(norm(namePart)); tocEntryData.push({ name: namePart, label }); }
      else tocEntryData.push({ name: raw, label });
    }
    // Stopwords include possessives (mi/su/tu…): the index may say "Mi
    // Propósito" while the body titles it "Su Propósito".
    const STOP = new Set(['el','la','los','las','un','una','de','del','y','o','a','en','para','por','con','al','su','mi','tu','sus','mis','tus','nuestro','nuestra','the','of','and','to','for','my','your','his','her']);
    const contentTokens = (s) => norm(s).split(' ').filter(w => w.length > 1 && !STOP.has(w));
    // One token set per TOC ENTRY so each chapter matches at most once.
    const tocEntries = tocEntryData
      .map(e => ({ toks: new Set(contentTokens(e.name)), norm: norm(e.name), label: e.label, used: false }))
      .filter(e => e.toks.size >= 2);

    const jaccard = (a, b) => {
      let inter = 0;
      for (const w of a) if (b.has(w)) inter++;
      return inter / (a.size + b.size - inter);
    };

    const tocEnd = Math.max(...skipIndices);
    for (let i = tocEnd + 1; i < topChildren.length; i++) {
      if (approvedHeadings.has(i)) continue;
      const t = topChildren[i].textContent?.trim() || '';
      if (!t || t.length > 90) continue;
      const nt = norm(t);
      const lineToks = new Set(contentTokens(t));
      if (lineToks.size < 2) continue;

      // Exact normalized match first.
      let matched = tocEntries.find(e => !e.used && e.norm === nt);

      // Fuzzy: SYMMETRIC similarity (Jaccard ≥ 0.6). Both directions must
      // agree, which rejects a subtitle that is only a FRAGMENT of the index
      // entry ("Excusas frente al llamado" vs the full "Las Actitudes Y
      // Excusas Frente Al Llamado De Dios" — the fragment drops too many index
      // words to reach 0.6). Each entry is consumed once (the first line that
      // matches it wins), so later subtitles can't re-trigger it.
      // DISABLED when the document carries its own bare structural labels
      // ("CAPÍTULO N" lines): chapters are already found by label, and fuzzy
      // matching can only mint ghosts — in El Traslado an inner subtitle
      // "LA SEMANA SETENTA DE DANIEL" hit 0.75 against the index entry
      // "EVENTOS SEMANA SETENTA DE DANIEL" and split chapter 6 in half.
      if (!matched && bareLabelIdx.length < 3) {
        let best = null, bestSim = 0;
        for (const e of tocEntries) {
          if (e.used) continue;
          const sim = jaccard(lineToks, e.toks);
          if (sim > bestSim) { bestSim = sim; best = e; }
        }
        if (best && bestSim >= 0.6) matched = best;
      }

      if (matched) {
        matched.used = true;
        approvedHeadings.add(i);
        if (matched.label) headingLabels.set(i, matched.label);
      }
    }
  }

  // Structural label helpers. A chapter's stored fields:
  //   label  — "LECCIÓN 1" / "CAPÍTULO 3" ('' for front-matter like INTRODUCCIÓN)
  //   name   — the chapter's own name ("La Intención Original De Dios")
  //   title  — display composite: `${label}  ${name}` (or just name/label)
  // Rule (user): respect the document's label if present; else auto-generate.
  const LABEL_IN_TEXT_RE = /^\s*(lección|leccion|lesson|sección|seccion|section|unidad|unit|módulo|modulo|module|tema|sesión|sesion|session|día|dia|day|capítulo|capitulo|chapter|parte|part)\s*#?\d+\s*[-–—:.\t ]*/i;
  const FRONT_MATTER_RE = /^(introducción|introduccion|introduction|prólogo|prologo|prologue|prefacio|preface|epílogo|epilogo|epilogue|dedicatoria|agradecimientos?|acknowledgements|conclusión|conclusion|colofón|colofon|bibliografía|bibliografia|foreword|presentación|presentacion|apéndice|apendice|anexos?|glosario|nota del autor|sobre el autor|acerca del autor|referencias|reconocimientos)\b/i;
  const isFrontMatter = (name) => FRONT_MATTER_RE.test((name || '').trim());
  const AUTO_LABEL_WORD = 'LECCIÓN'; // matches this document's family; generic enough

  // Compose the display title from label + name, never duplicating when the
  // name is empty or equals the label ("CAPÍTULO 1" alone → no "CAPÍTULO 1
  // CAPÍTULO 1"). The name may come from a following line (see nameHint).
  const composeTitle = (label, name) => {
    const l = (label || '').trim();
    const n = (name || '').trim();
    if (l && n && n.toUpperCase() !== l.toUpperCase()) return `${l}  ${n}`;
    return l || n;
  };

  let autoCounter = 0;
  const makeChapterFields = (rawText, tocLabel, nameHint) => {
    const raw = (rawText || '').trim();
    // 1) Label already inside the body title text? Split & respect it.
    const inTextM = raw.match(LABEL_IN_TEXT_RE);
    if (inTextM) {
      const label = inTextM[0].replace(/[-–—:.\t ]+$/, '').replace(/\s+/g, ' ').trim().toUpperCase();
      // Name from the remainder; if the label consumed the whole line, take
      // the hint (the next line, e.g. "UNA ANTORCHA EN LA OSCURIDAD").
      let name = raw.slice(inTextM[0].length).trim();
      if (!name) name = (nameHint || '').trim();
      autoCounter++;
      return { label, name, title: composeTitle(label, name) };
    }
    // 2) Front matter — never numbered.
    if (isFrontMatter(raw)) {
      return { label: '', name: raw, title: raw };
    }
    // 3) Label known from the TOC entry — respect it.
    if (tocLabel) {
      autoCounter++;
      return { label: tocLabel, name: raw, title: composeTitle(tocLabel, raw) };
    }
    // 4) Auto-generate a sequential label.
    autoCounter++;
    const label = `${AUTO_LABEL_WORD} ${autoCounter}`;
    return { label, name: raw, title: composeTitle(label, raw) };
  };

  // Is this top-level child a standalone structural label ("CAPÍTULO 1")
  // whose real name sits on the NEXT line? Returns true for a short line that
  // is ONLY the label pattern.
  const isLabelOnlyLine = (txt) => {
    const t = (txt || '').trim();
    if (t.length > 40) return false;
    const m = t.match(LABEL_IN_TEXT_RE);
    return !!m && t.slice(m[0].length).trim().length === 0;
  };

  // ── Multiline-title fusion ────────────────────────────────────────────────
  // Authors often stack a chapter title over several lines:
  //     CAPÍTULO 7
  //     EVENTOS DE LA SEMANA SETENTA O
  //     LA TRIBULACIÓN
  //     PARTE 1
  // The "PARTE 1" line matches the part-heading pattern and used to open a
  // ghost chapter that swallowed the real chapter's content (folios report:
  // cap 7/8 left with 2 words, "PARTE 1"/"PARTE 2" with 5,800/18,300).
  // Detection: a bare "PARTE N" arriving while the current NUMBERED chapter
  // has almost no content (< 40 words) is a title continuation, not a part.
  const PART_ONLY_RE = /^\s*(parte|part)\s*#?\s*(\d+|[ivxlcdm]+|primera|segunda|tercera|cuarta|quinta|first|second|third)\s*$/i;
  const MERGE_MAX_WORDS = 40;

  // Short ALL-CAPS unpunctuated <p>s at the START of the chapter body are the
  // middle lines of the stacked title ("LA TRIBULACIÓN") — lift them into the
  // name; anything else stays as content.
  const liftTitleLinesFromHtml = (html) => {
    const lifted = [];
    let rest = html || '';
    const pRe = /^\s*<p\b[^>]*>([\s\S]*?)<\/p>/i;
    let m;
    while ((m = pRe.exec(rest)) !== null) {
      const t = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const isTitleLine = t && t.length <= 60
        && t === t.toUpperCase() && /[A-ZÁÉÍÓÚÜÑ]/.test(t)
        && t.split(/\s+/).length <= 6 && !/[.!?…;:]$/.test(t);
      if (!isTitleLine) break;
      lifted.push(t);
      rest = rest.slice(m.index + m[0].length);
    }
    return { lifted, rest: rest.trim() };
  };

  const absorbPartIntoCurrentTitle = (partText) => {
    const { lifted, rest } = liftTitleLinesFromHtml(currentChapter.html);
    currentChapter.html = rest;
    const extra = [...lifted, partText.trim().toUpperCase()].join(' ');
    currentChapter.chapterName = `${(currentChapter.chapterName || '').trim()} ${extra}`.trim();
    currentChapter.title = composeTitle(currentChapter.chapterLabel, currentChapter.chapterName);
  };

  // ── Free-standing section headings (inside unnumbered chapters only) ──────
  // Front/back-matter blocks often contain inner sections written as short
  // ALL-CAPS lines ("RESUMEN DE LOS EVENTOS PROFÉTICOS", "LA INMINENCIA DEL
  // TRASLADO", or stacked "PANORAMA / DE / EVENTOS / PROFÉTICOS"). Promote
  // them to chapters ONLY when substantial body follows (≥150 chars) —
  // comparison labels ("TRASLADO" / "SEGUNDA VENIDA" followed by one-liners)
  // and a trailing author signature stay as plain text.
  const isAllCapsShort = (t) =>
    !!t && t.length <= 60 && t === t.toUpperCase()
    && /[A-ZÁÉÍÓÚÜÑ]/.test(t) && !/[.!?…;:]$/.test(t);

  const tryFreeSection = (index) => {
    const first = topChildren[index].textContent?.trim() || '';
    if (!isAllCapsShort(first)) return null;
    const lines = [first];
    let j = index + 1;
    for (; j < topChildren.length; j++) {
      if (skipIndices.has(j) || approvedHeadings.has(j)) break;
      const t = topChildren[j].textContent?.trim() || '';
      if (!t) continue;
      if (!isAllCapsShort(t)) break;
      lines.push(t); // stacked title line
    }
    if (j >= topChildren.length || approvedHeadings.has(j)) return null;
    const after = topChildren[j]?.textContent?.trim() || '';
    if (after.length < 150) return null;
    const title = lines.join(' ');
    if (title.split(/\s+/).length < 2) return null;
    return { title, lastIdx: j - 1 };
  };

  let bookTitleConsumed = false;
  topChildren.forEach((el, index) => {
    if (skipIndices.has(index)) return; // documento's own TOC — omitted
    const text = el.textContent?.trim() || '';
    if (!text || text.length < 2) return;

    // Drop the standalone book-title line from the body (it moves to the
    // book metadata). Only the first occurrence, only before any chapter.
    if (!bookTitleConsumed && !currentChapter && bookTitleNorm) {
      const tn = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]+/gi, ' ').trim();
      if (tn === bookTitleNorm) { bookTitleConsumed = true; return; }
    }

    if (approvedHeadings.has(index)) {
      flushAll();
      // Bare "PARTE N" while the current numbered chapter is still (nearly)
      // empty → it's the tail of a stacked multiline title. Absorb and stay
      // in the same chapter instead of opening a ghost one.
      if (
        currentChapter && !currentSection
        && PART_ONLY_RE.test(text)
        && currentChapter.chapterLabel
        && calcWordCount(currentChapter.html) < MERGE_MAX_WORDS
      ) {
        absorbPartIntoCurrentTitle(text);
        return;
      }
      if (currentChapter) {
        if (currentSection) {
          currentChapter.html += `<h3>${currentSection.title}</h3>${currentSection.html}`;
          currentSection = null;
        }
        chapters.push(currentChapter);
      }
      // If the heading is a bare label ("CAPÍTULO 1"), pull its real name from
      // the next line(s): the immediate next child, skipping a repeated label
      // line (Word sometimes emits the label twice).
      let nameHint = '';
      if (isLabelOnlyLine(text)) {
        for (let j = index + 1; j < topChildren.length && j <= index + 2; j++) {
          const nx = topChildren[j].textContent?.trim() || '';
          if (!nx) continue;
          // Skip ONLY exact duplicates of THIS label (Word emits them twice).
          // A DIFFERENT structural label ("PARTE 1" followed by "CAPÍTULO 1")
          // is the next chapter's own heading — never steal or drop it. But a
          // plain NAME line stays consumable even when the TOC matcher already
          // approved it (it IS this chapter's name — consuming it here avoids
          // a duplicate empty chapter).
          if (nx.toUpperCase() === text.toUpperCase()) {
            skipIndices.add(j); // duplicate label line — drop from body
            continue;
          }
          if (isLabelOnlyLine(nx)) break;
          if (nx.length <= 70 && !/[.!?]$/.test(nx)) { nameHint = nx; skipIndices.add(j); }
          break;
        }
      }
      const fields = makeChapterFields(text, headingLabels.get(index), nameHint);
      currentChapter = {
        id: makeChapterId(chapters.length), type: 'chapter',
        title: fields.title, chapterLabel: fields.label, chapterName: fields.name,
        html: '', wordCount: 0
      };
      // A REAL part heading (previous chapter had substance, so it wasn't
      // absorbed) is a book division → dedicated divider page: the title gets
      // a full page of its own (fullPage layout, honored per-chapter by the
      // pagination engine).
      if (/^\s*(parte|part)\s*#?\s*(\d+|[ivxlcdm]+|primera|segunda|tercera|cuarta|quinta|first|second|third)\b/i.test(text)) {
        currentChapter.type = 'part';
        currentChapter.titleLayout = 'fullPage';
      }
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
      // Free ALL-CAPS section start inside an unnumbered block → own chapter.
      if (!currentChapter.chapterLabel) {
        const sec = tryFreeSection(index);
        if (sec) {
          flushAll();
          if (currentSection) {
            currentChapter.html += `<h3>${currentSection.title}</h3>${currentSection.html}`;
            currentSection = null;
          }
          if (currentChapter.html.trim() || currentChapter.title) chapters.push(currentChapter);
          currentChapter = {
            id: makeChapterId(chapters.length), type: 'chapter',
            title: sec.title, chapterLabel: '', chapterName: sec.title,
            html: '', wordCount: 0
          };
          for (let k = index + 1; k <= sec.lastIdx; k++) skipIndices.add(k);
          return;
        }
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

  // ── Empty unnumbered pieces ───────────────────────────────────────────────
  // a) A canonical piece heading left EMPTY because the free-section detector
  //    captured its body right after it ("APÉNDICE" followed by the stacked
  //    section "MATEO 24 UN CAPÍTULO MAL ENTENDIDO") prefixes its name onto
  //    that section and is dropped — the piece keeps its canonical identity
  //    (and its front/back-matter slot) with the content it owns.
  // b) A canonical piece with no content anywhere (Panorama: the index lists
  //    an INTRODUCCIÓN the author never wrote) is KEPT as an empty chapter —
  //    the reorder puts it in its canonical slot and the author fills it in
  //    the app (user decision: placeholder beats silent removal).
  // c) Empty unnumbered chapters with a non-canonical name are artifacts —
  //    dropped. Part dividers (type 'part') are empty BY DESIGN and stay.
  for (let i = chapters.length - 1; i >= 0; i--) {
    const ch = chapters[i];
    if (ch.chapterLabel || ch.type === 'part') continue;
    if (ch.wordCount > 0) continue;
    const next = chapters[i + 1];
    const chName = (ch.chapterName || ch.title || '').trim();
    if (
      next && chName && !next.chapterLabel && next.type !== 'part'
      && !FRONT_MATTER_RE.test((next.chapterName || next.title || '').trim())
    ) {
      next.chapterName = `${chName} — ${(next.chapterName || next.title || '').trim()}`;
      next.title = next.chapterName;
      chapters.splice(i, 1);
    } else if (!FRONT_MATTER_RE.test(chName)) {
      chapters.splice(i, 1);
    }
    // canonical piece, nothing to merge with → keep as empty placeholder
  }

  // ── Canonical front/back-matter ordering ──────────────────────────────────
  // Authors frequently write chapters first and the opening pieces last, so
  // the document's physical order is NOT the book's order. Recognized
  // front-matter chapters (unnumbered: no chapterLabel) are moved before the
  // body in canonical editorial order; back matter moves after it. Body
  // chapters keep their relative order. A well-ordered document is a no-op.
  const normName = (s) => (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const FRONT_ORDER = ['dedicatoria', 'agradecimiento', 'prologo', 'prefacio', 'presentacion', 'introduccion'];
  const BACK_ORDER = ['epilogo', 'conclusion', 'apendice', 'anexo', 'glosario', 'referencias', 'bibliografia', 'nota del autor', 'sobre el autor', 'acerca del autor', 'colofon'];
  const matterRank = (ch, order) => {
    if (ch.chapterLabel) return -1;               // numbered = body, always
    const n = normName(ch.chapterName || ch.title);
    return n ? order.findIndex(k => n.startsWith(k)) : -1;
  };
  const front = [];
  const body = [];
  const back = [];
  for (const ch of chapters) {
    const fr = matterRank(ch, FRONT_ORDER);
    const br = matterRank(ch, BACK_ORDER);
    if (fr !== -1) front.push({ ch, rank: fr });
    else if (br !== -1) back.push({ ch, rank: br });
    else body.push(ch);
  }
  const byRank = (a, b) => a.rank - b.rank;      // stable sort keeps doc order on ties
  const ordered = [
    ...front.sort(byRank).map(x => x.ch),
    ...body,
    ...back.sort(byRank).map(x => x.ch),
  ];

  // Footnotes (B1): detect Word/mammoth footnotes per chapter, normalize the
  // body markers to <sup data-fn="…"> and stash the notes on the chapter. The
  // engine only reserves space when config.footnotes.enabled, but detection is
  // always safe (no marks → chapter unchanged).
  for (const ch of ordered) {
    if (ch.html && /<sup/i.test(ch.html)) {
      const { cleanHtml, notes } = detectFootnotes(ch.html);
      if (notes.length) { ch.html = cleanHtml; ch.footnotes = notes; }
    }
  }

  return { chapters: ordered, detectedHeadings, bookTitle };
};
