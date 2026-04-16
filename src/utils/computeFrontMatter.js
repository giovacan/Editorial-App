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

  return { tocResolved: tocResolvedOffset, tocConfig, fmOffset };
}
