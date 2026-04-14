import { extractTOC, generateRecommendedTOCConfig } from '../utils/extractTOC';
import { mapTOCToPages } from '../utils/mapTOCToPages';
import { generateFrontMatter } from '../utils/generateFrontMatter';
import useEditorStore from '../store/useEditorStore';

function toRoman(n) {
  const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const syms = ['m', 'cm', 'd', 'cd', 'c', 'xc', 'l', 'xl', 'x', 'ix', 'v', 'iv', 'i'];
  let result = '';
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) { result += syms[i]; n -= vals[i]; }
  }
  return result;
}

export function computeFrontMatter({
  chapters,
  pages,
  title,
  author,
  contentHeight,
  lineHeightPx,
  contentWidth,
  baseFontSizePx,
  fontFamily,
}) {
  const tocEntries = extractTOC(chapters);
  const tocResolved = mapTOCToPages(tocEntries, pages);
  useEditorStore.getState().setTOCData(tocResolved);

  const { tocAuto, frontMatterConfig } = useEditorStore.getState();
  let { tocConfig } = useEditorStore.getState();
  
  if (tocAuto && !tocConfig) {
    tocConfig = generateRecommendedTOCConfig(tocEntries);
    useEditorStore.getState().setTOCConfig(tocConfig);
    if (process.env.NODE_ENV === 'development') {
      console.log('[TOC] Auto-generated config:', tocConfig);
    }
  }

  if (!tocConfig) {
    return { tocResolved, tocConfig: null, fmOffset: 0 };
  }

  const { pages: fmDry } = generateFrontMatter(
    title || 'Título del Libro',
    author || '',
    tocResolved,
    tocConfig,
    frontMatterConfig,
    contentHeight,
    lineHeightPx,
    contentWidth,
    baseFontSizePx,
    fontFamily
  );

  const fmOffset = fmDry.length;
  const tocResolvedOffset = tocResolved.map(e => ({ ...e, page: (e.page || 1) + fmOffset }));
  const { pages: fmPages, h3AutoFontSize, tocLog, tocSummaryText } = generateFrontMatter(
    title || 'Título del Libro',
    author || '',
    tocResolvedOffset,
    tocConfig,
    frontMatterConfig,
    contentHeight,
    lineHeightPx,
    contentWidth,
    baseFontSizePx,
    fontFamily
  );

  const fmNumbering = useEditorStore.getState().config?.frontMatterNumbering ?? 'roman';
  const fmFolioCase = useEditorStore.getState().tocConfig?.folioCase ?? 'lower';
  let romanCounter = 0;
  const fmPagesNumbered = fmPages.map(p => {
    if (p.isTitlePage || p.isBlank) return { ...p, displayPageNumber: '' };
    romanCounter++;
    const roman = fmFolioCase === 'upper' ? toRoman(romanCounter).toUpperCase() : toRoman(romanCounter);
    const display = fmNumbering === 'roman' ? roman
      : fmNumbering === 'arabic' ? String(romanCounter)
      : '';
    return { ...p, displayPageNumber: display };
  });

  useEditorStore.getState().setFrontMatterPages(fmPagesNumbered);
  useEditorStore.getState().setTocBuildLog(tocLog);

  if (process.env.NODE_ENV === 'development' && tocSummaryText) {
    let domVerification = '';
    try {
      const tocPages = fmPages.filter(p => p.isTOCPage);
      if (tocPages.length > 0 && typeof document !== 'undefined') {
        const verifyDiv = document.createElement('div');
        verifyDiv.style.cssText = [
          'position:fixed', 'left:-99999px', 'top:0',
          'visibility:hidden', 'pointer-events:none',
          `width:${contentWidth}px`,
          `font-size:${baseFontSizePx}px`,
          `font-family:${fontFamily}`,
          `line-height:${lineHeightPx}px`,
          'text-align:left', 'hyphens:none',
          'word-break:break-word', 'overflow-wrap:break-word',
        ].join(';');
        document.body.appendChild(verifyDiv);

        const verifyLines = [`\nDOM VERIFICATION (actual scrollHeight vs contentHeight=${contentHeight}px):`];
        for (let pi = 0; pi < tocPages.length; pi++) {
          const cleanHtml = (tocPages[pi].html || '').replace(
            /<div style="position:absolute;[^"]*?">[^]*?<\/div>/g, ''
          );
          verifyDiv.innerHTML = cleanHtml;
          const scrollH = verifyDiv.scrollHeight;
          const delta = scrollH - contentHeight;
          const status = delta > 2 ? `!! OVERFLOW by ${delta.toFixed(1)}px (${(delta / lineHeightPx).toFixed(1)} lines)` :
                                 delta > 0 ? `~ marginal +${delta.toFixed(1)}px` : 'OK';
          verifyLines.push(`  TOC page ${pi + 1}: scrollH=${scrollH}px contentH=${contentHeight}px delta=${delta.toFixed(1)}px ${status}`);

          if (pi < 2) {
            const wrapper = verifyDiv.firstElementChild;
            if (wrapper) {
              const kids = wrapper.children;
              verifyLines.push(`    wrapper children: ${kids.length}`);
              for (let ci = 0; ci < kids.length; ci++) {
                const el = kids[ci];
                const cs = getComputedStyle(el);
                const oh = el.offsetHeight;
                const mt = cs.marginTop;
                const mb = cs.marginBottom;
                const lh = cs.lineHeight;
                const fs = cs.fontSize;
                const disp = cs.display;
                const text = (el.textContent || '').substring(0, 30).replace(/\s+/g, ' ');
                verifyLines.push(`    [${ci}] oh=${oh} mt=${mt} mb=${mb} lh=${lh} fs=${fs} d=${disp} "${text}"`);
              }
            }
          }
        }
        document.body.removeChild(verifyDiv);
        domVerification = verifyLines.join('\n');
      }
    } catch { /* no-op */ }

    const fmDebug = '\n\nFM PAGES displayPageNumber:\n' + fmPagesNumbered.map((p, i) =>
      `  [${i}] isTitlePage=${!!p.isTitlePage} isTOCPage=${!!p.isTOCPage} displayPageNumber="${p.displayPageNumber}"`
    ).join('\n');
    fetch('/api/toc-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summaryText: tocSummaryText + domVerification + fmDebug,
        timestamp: new Date().toISOString()
      })
    }).catch(() => {});
  }

  useEditorStore.getState().setTOCData(tocResolvedOffset);

  if (fmOffset > 0) {
    const rawLog = useEditorStore.getState().paginationLog;
    if (rawLog) {
      useEditorStore.getState().setPaginationLog({
        ...rawLog,
        config: { ...(rawLog.config || {}), fmOffset },
        entries: rawLog.entries.map(e => ({ ...e, page: e.page + fmOffset })),
        summary: rawLog.summary.map(s => ({ ...s, page: s.page + fmOffset }))
      });
    }
  }

  const autoH3Value = h3AutoFontSize || undefined;
  if (tocConfig.autoH3FontSize !== autoH3Value) {
    useEditorStore.getState().setTOCConfig({ ...tocConfig, autoH3FontSize: autoH3Value });
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('[FrontMatter] Generated:', fmPages.length, 'pages');
    console.log('[TOC] Extracted:', tocResolved.length, 'entries');
  }

  return { tocResolved: tocResolvedOffset, tocConfig, fmOffset };
}
