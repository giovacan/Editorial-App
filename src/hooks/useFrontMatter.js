import { useEffect, useRef } from 'react';
import { extractTOC, ENABLE_TOC, generateRecommendedTOCConfig } from '../utils/extractTOC';
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

export const useFrontMatter = ({
  pages,
  tocConfig,
  frontMatterConfig,
  contentHeight,
  lineHeightPx,
  contentWidth,
  baseFontSizePx,
  targetFontFamily,
  bookTitle,
  bookAuthor,
}) => {
  const tocData = useEditorStore(s => s.tocData);
  const tocBuildLog = useEditorStore(s => s.tocBuildLog);
  const prevTocConfigRef = useRef(null);
  const prevPagesRef = useRef(null);

  useEffect(() => {
    if (!ENABLE_TOC || !pages?.length) return;

    const pagesKey = pages.map(p => p.pageNumber).join(',');
    const tocConfigKey = JSON.stringify(tocConfig);
    
    if (prevPagesRef.current === pagesKey && prevTocConfigRef.current === tocConfigKey) {
      return;
    }
    prevPagesRef.current = pagesKey;
    prevTocConfigRef.current = tocConfigKey;

    const tocResolved = extractTOC(pages, tocConfig);
    
    if (tocResolved.length > 0) {
      const tocResolvedOffset = tocResolved.map(e => ({ ...e, page: (e.page || 1) }));
      const { pages: fmPages, h3AutoFontSize, tocLog, tocSummaryText } = generateFrontMatter(
        bookTitle || 'Título del Libro',
        bookAuthor || '',
        tocResolvedOffset,
        tocConfig,
        frontMatterConfig,
        contentHeight,
        lineHeightPx,
        contentWidth,
        baseFontSizePx,
        targetFontFamily
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

      const autoH3Value = h3AutoFontSize || undefined;
      if (tocConfig?.autoH3FontSize !== autoH3Value) {
        useEditorStore.getState().setTOCConfig({ ...tocConfig, autoH3FontSize: autoH3Value });
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('[FrontMatter] Generated:', fmPages.length, 'pages');
        console.log('[TOC] Extracted:', tocResolved.length, 'entries');
      }
    }
  }, [pages, tocConfig, frontMatterConfig, contentHeight, lineHeightPx, contentWidth, baseFontSizePx, targetFontFamily, bookTitle, bookAuthor]);

  return { tocData, tocBuildLog };
};

export { generateRecommendedTOCConfig };
