/**
 * addBookToCorpus.mjs — convierte el libro del pagination-log.json actual en
 * un fixture del corpus de regresión multi-libro.
 *
 * Uso:  node scripts/addBookToCorpus.mjs <slug> [minScore]
 *   ej. node scripts/addBookToCorpus.mjs el-traslado-de-la-iglesia 9.0
 *
 * Prefiere el manuscrito EXACTO (reproBundle.chapters, guardado por el motor
 * en dev desde v72); si el log es anterior, reconstruye los capítulos desde
 * las páginas paginadas (fusionando fragmentos de párrafos partidos).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const slug = process.argv[2];
const minScore = parseFloat(process.argv[3] || '9.0');
if (!slug) {
  console.error('Uso: node scripts/addBookToCorpus.mjs <slug> [minScore]');
  process.exit(1);
}

const logPath = path.join(root, 'pagination-log.json');
const data = JSON.parse(fs.readFileSync(logPath, 'utf8'));
const log = data.log;
const rb = log.reproBundle || {};

let chapters;
let source;

if (Array.isArray(rb.chapters) && rb.chapters.length > 0) {
  // Manuscrito exacto capturado por el motor.
  chapters = rb.chapters;
  source = 'reproBundle (manuscrito exacto)';
} else {
  // Reconstrucción desde las páginas paginadas.
  source = 'reconstrucción desde summary';
  const sum = (log.summary || []).filter(p => p.html && p.html.trim());
  const byChapter = new Map();
  for (const p of sum) {
    if (!byChapter.has(p.chapter)) byChapter.set(p.chapter, []);
    byChapter.get(p.chapter).push(p);
  }

  const BLOCK_RE = /<(p|blockquote|h[1-6]|ul|ol|div|table)([^>]*)>([\s\S]*?)<\/\1>/gi;

  // Saneo del inner reconstruido:
  //  - restos de tabla del documento original (tbody/tr/td/table anidados en
  //    un <p> rompen el conteo de profundidad del parser IR → se traga
  //    cientos de bloques como uno solo)
  //  - etiquetas inline desbalanceadas (un </em> huérfano hace lo mismo)
  const cleanInner = (inner) => {
    let s = inner
      .replace(/<\/?(table|tbody|thead|tr|td|th|p|div)[^>]*>/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    for (const tag of ['em', 'strong', 'b', 'i', 'u']) {
      const open = (s.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
      const close = (s.match(new RegExp(`</${tag}>`, 'gi')) || []).length;
      if (open > close) s += `</${tag}>`.repeat(open - close);
      else if (close > open) {
        // cierres huérfanos: eliminarlos de derecha a izquierda
        let extra = close - open;
        s = s.replace(new RegExp(`</${tag}>`, 'gi'), (m) => (extra-- > 0 ? '' : m));
      }
    }
    return s.trim();
  };

  chapters = [];
  for (const [title, pages] of byChapter) {
    const out = []; // [{ tag, inner, cutHyphen }]
    for (const page of pages) {
      let m;
      BLOCK_RE.lastIndex = 0;
      while ((m = BLOCK_RE.exec(page.html)) !== null) {
        const [outer, tag, attrs, inner] = m;
        if (/data-chapter-start/.test(attrs)) continue; // el motor lo regenera
        const isCont = /data-continuation/.test(attrs);
        const cutHyphen = /data-cut-hyphen/.test(attrs);
        if (isCont && out.length > 0) {
          const prev = out[out.length - 1];
          const joiner = prev.cutHyphen ? '' : (/<br/i.test(prev.inner) || /<br/i.test(inner)) ? '<br>' : ' ';
          prev.inner = prev.inner.replace(/\s+$/, '') + joiner + cleanInner(inner);
          prev.cutHyphen = cutHyphen;
        } else {
          out.push({ tag: tag.toLowerCase(), inner: cleanInner(inner), cutHyphen });
        }
        void outer;
      }
    }
    const html = out.map(b => `<${b.tag}>${b.inner}</${b.tag}>`).join('\n');
    chapters.push({ title, html });
  }
}

const fixture = {
  name: slug,
  addedAt: new Date().toISOString(),
  source,
  layoutCtx: rb.layoutCtx || log.config || null,
  gate: { minScore },
  chapters,
};

const outDir = path.join(root, 'src', '__fixtures__', 'books');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `${slug}.json`);
fs.writeFileSync(outPath, JSON.stringify(fixture, null, 1), 'utf8');

const totalLen = chapters.reduce((a, c) => a + c.html.length, 0);
console.log(`✓ ${outPath}`);
console.log(`  fuente: ${source}`);
console.log(`  capítulos: ${chapters.length} | contenido: ${(totalLen / 1024).toFixed(0)} KB | gate.minScore: ${minScore}`);
chapters.forEach(c => console.log(`   - ${(c.title || '(sin título)').slice(0, 60)} (${(c.html.length / 1024).toFixed(0)} KB)`));
