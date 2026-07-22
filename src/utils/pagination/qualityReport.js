/**
 * qualityReport.js — Puntaje editorial automático (0-10) post-paginación.
 *
 * Evalúa las páginas YA paginadas con las mismas herramientas deterministas
 * del motor (canvas + walker del renderer) y produce una calificación con la
 * lista de defectos y su página exacta. Worker-safe, cero DOM layout.
 *
 * El mismo módulo alimenta:
 *  - el badge de calidad en la app (calculado en el worker al final)
 *  - el gate del corpus de regresión multi-libro (bookCorpus.test.js)
 *
 * Clases de defecto (peso):
 *  - overflow        (2.0)  contenido medido > presupuesto de la página
 *  - crater          (1.0)  página no-final <60% de llenado
 *  - stretched_cut   (1.5)  última línea dibujada corta (<4 palabras) Y estirada
 *  - heading_bottom  (0.25) subtítulo/encabezado huérfano al pie
 *  - underfill       (0.15) página no-final 60-85% de llenado
 *  - cut_left        (0.10) split-head degradado a izquierda (continúa sin justificar)
 *  - runt            (0.02) última línea de párrafo de 1 sola palabra
 *
 * score = 10 − (penalización total × 100 / páginas) × 0.15   (redondeado a 1 decimal)
 */

import { measureHtmlHeight } from '../textLayoutEngine';
import { renderPageAsEngineLines, computeBlockLineMetrics } from '../lineRenderer.js';
import { parseTopLevelBlocks, htmlToText } from '../layoutIr.js';
import { buildFontString } from '../textMeasurement.js';

const WEIGHTS = {
  overflow: 2.0,
  crater: 1.0,
  stretched_cut: 1.5,
  heading_bottom: 0.25,
  underfill: 0.15,
  cut_left: 0.10,
  runt: 0.02,
};

const isAllCapsShort = (text) => {
  const t = (text || '').trim();
  if (!t || t.length > 70) return false;
  const letters = t.replace(/[^a-záéíóúüñA-ZÁÉÍÓÚÜÑ]/g, '');
  if (letters.length < 6) return false;
  const upper = letters.replace(/[a-záéíóúüñ]/g, '');
  return upper.length / letters.length >= 0.9;
};

/**
 * @param {Array} pages - páginas paginadas ({ html, isBlank, chapterTitle, isFirstChapterPage, ... })
 * @param {object} canvasCtx - contexto canvas del motor (con engineLinesRender)
 * @param {object} layoutCtx - { contentHeight, lineHeightPx, headerSpaceEstimate, ... }
 * @returns {{ score:number, pages:number, defects:Array<{type,page,detail}>, counts:object }}
 */
export const computeQualityReport = (pages, canvasCtx, layoutCtx) => {
  const contentHeight = layoutCtx.contentHeight;
  const chStartExtra = Math.max(0, (layoutCtx.headerSpaceEstimate || 0) - (layoutCtx.chapterStartBottomClearance || 0))
    + (layoutCtx.chapterStartExtraLines || 0) * (layoutCtx.lineHeightPx || 10);

  const content = pages.filter(p => p && p.html && !p.isBlank);
  const n = content.length;
  if (n === 0) return { score: 10, pages: 0, defects: [], counts: {} };

  // Última página de contenido de cada capítulo (los finales pueden quedar cortos).
  const lastOfChapter = new Set();
  for (let i = 0; i < content.length; i++) {
    const cur = content[i];
    const next = content[i + 1];
    if (!next || next.chapterTitle !== cur.chapterTitle) lastOfChapter.add(cur);
  }

  const defects = [];
  const engineLines = canvasCtx.engineLinesRender === true;

  for (const p of content) {
    const folio = p.pageNumber || 0;
    const isChStart = !!(p.isFirstChapterPage || (p.html.includes('data-chapter-start="true"')));
    const budget = contentHeight + (isChStart ? chStartExtra : 0);
    const isLast = lastOfChapter.has(p);

    // 1) overflow / crater / underfill — medición canvas del motor
    let h = 0;
    try { h = measureHtmlHeight(p.html, canvasCtx); } catch { h = 0; }
    if (h > 0) {
      const fill = h / budget;
      if (h > budget + 6) {
        defects.push({ type: 'overflow', page: folio, detail: `${Math.round(h)}px en presupuesto de ${Math.round(budget)}px` });
      } else if (!isLast && !isChStart && fill < 0.60) {
        defects.push({ type: 'crater', page: folio, detail: `${Math.round(fill * 100)}% de llenado` });
      } else if (!isLast && !isChStart && fill < 0.85) {
        defects.push({ type: 'underfill', page: folio, detail: `${Math.round(fill * 100)}% de llenado` });
      }
    }

    // 2) última línea dibujada corta y estirada (ley de corte)
    if (engineLines) {
      try {
        const out = renderPageAsEngineLines(p.html, canvasCtx);
        const lines = out.match(/<span class="el-line"[^>]*>[\s\S]*?<\/span>/g) || [];
        const last = lines[lines.length - 1];
        if (last) {
          const text = last.replace(/<[^>]+>/g, '').trim();
          const words = text.split(/\s+/).filter(Boolean).length;
          const align = (last.match(/text-align-last:([a-z]+)/) || [])[1];
          // A justify tail is only a DEFECT when it actually stretches. The
          // line renderer draws the cut line at its natural width regardless of
          // the justify attribute, so a 2-3 word line that already fills most
          // of the column reads fine — it's the SHORT ones (large empty gap) the
          // browser would inflate into visible rivers. Measure the drawn width:
          // only flag when the tail fills < 62% of the column (a real stretch).
          // Without this, 36 tails that render fine were counted as defects.
          let fillRatio = 1;
          if (align === 'justify' && words < 4) {
            try {
              const ctx2d = canvasCtx.ctx2d;
              const W = canvasCtx.contentWidth - (canvasCtx.widthSlack || 0);
              if (ctx2d && W > 0) {
                ctx2d.font = buildFontString(canvasCtx.baseFontSizePx, canvasCtx.fontFamily);
                fillRatio = ctx2d.measureText(text).width / W;
              }
            } catch { fillRatio = 0; /* can't measure → treat as suspect */ }
          }
          if (align === 'justify' && words < 4 && fillRatio < 0.62) {
            defects.push({ type: 'stretched_cut', page: folio, detail: `"${text.slice(0, 40)}" (${Math.round(fillRatio * 100)}%)` });
          }
        }
      } catch { /* presentación — nunca tumbar el reporte */ }
    }

    // 3) split-head degradado a izquierda (párrafo continúa sin justificar)
    if (/data-split-head(?![^>]*text-align-last:\s*justify)/.test(p.html)) {
      const blocks = parseTopLevelBlocks(p.html);
      const lastB = blocks[blocks.length - 1];
      if (lastB && /data-split-head/.test(lastB.outerHtml) && !/text-align-last:\s*justify/i.test(lastB.outerHtml)) {
        defects.push({ type: 'cut_left', page: folio, detail: 'corte sin justificar' });
      }
    }

    // 4) subtítulo huérfano al pie + 5) runts
    let blocks = null;
    try { blocks = parseTopLevelBlocks(p.html); } catch { blocks = null; }
    if (blocks && blocks.length) {
      const lastB = blocks[blocks.length - 1];
      const lastTag = (lastB.tag || '').toUpperCase();
      const lastText = htmlToText(lastB.outerHtml).trim();
      const isHeadingLike = /^H[1-6]$/.test(lastTag)
        || /data-chapter-start/.test(lastB.outerHtml)
        || (lastTag === 'P' && isAllCapsShort(lastText))
        || (lastTag === 'P' && /^<p[^>]*>\s*<(strong|b)\b/i.test(lastB.outerHtml) && lastText.length < 90);
      if (isHeadingLike && !isLast) {
        defects.push({ type: 'heading_bottom', page: folio, detail: `"${lastText.slice(0, 40)}"` });
      }

      if (engineLines) {
        for (const b of blocks) {
          if (/data-split-head|data-continuation|data-chapter-start/.test(b.outerHtml)) continue;
          try {
            const wm = computeBlockLineMetrics(b, canvasCtx);
            if (wm && wm.lineCount > 1 && wm.lastLine.words === 1) {
              defects.push({ type: 'runt', page: folio, detail: `"…${wm.lastLine.text.slice(-25)}"` });
            }
          } catch { /* bloque no dibujable — omitir */ }
        }
      }
    }
  }

  const counts = {};
  let penalty = 0;
  for (const d of defects) {
    counts[d.type] = (counts[d.type] || 0) + 1;
    penalty += WEIGHTS[d.type] || 0;
  }
  const score = Math.max(0, Math.round((10 - (penalty * 100 / n) * 0.15) * 10) / 10);

  return { score, pages: n, defects, counts };
};
