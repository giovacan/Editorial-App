import { ENABLE_TOC } from './extractTOC';
import type { TOCResolvedEntry } from './mapTOCToPages';

export type TOCPage = {
  html: string;
  pageNumber: number;
  isBlank?: boolean;
  isTOCPage?: boolean;
  chapterTitle?: string;
  currentSubheader?: string;
};

export type TOCPageConfig = {
  title?: string;
  includeDots?: boolean;
  fontSize?: number;
  marginTop?: number;
};

export const generateTOCPages = (
  tocEntries: TOCResolvedEntry[],
  _config?: TOCPageConfig
): TOCPage[] => {
  if (!ENABLE_TOC || tocEntries.length === 0) {
    return [];
  }

  const pages: TOCPage[] = [];
  const defaultConfig: TOCPageConfig = {
    title: 'Índice',
    includeDots: true,
    fontSize: 12,
    marginTop: 2
  };
  const config = { ...defaultConfig, ..._config };

  let currentHtml = '';
  const lineHeightPx = 20;

  currentHtml += `<h1 style="text-align:center; margin-bottom: 1em;">${config.title || 'Índice'}</h1>`;

  for (const entry of tocEntries) {
    const indent = (entry.level - 1) * 20;
    const fontSize = entry.level === 1 ? '1.2em' : entry.level === 2 ? '1em' : '0.9em';
    const fontWeight = entry.level <= 2 ? 'bold' : 'normal';
    const marginBottom = entry.level === 1 ? '0.5em' : '0.3em';

    const pageNumStr = `${entry.page}`;
    const dots = config.includeDots ? ' .'.repeat(Math.max(3, 40 - indent - entry.title.length - pageNumStr.length)) + ' ' : ' ';

    const entryHtml = `
      <div style="
        display: flex;
        justify-content: flex-start;
        align-items: baseline;
        padding-left: ${indent}px;
        margin-bottom: ${marginBottom};
        font-size: ${fontSize};
        font-weight: ${fontWeight};
        line-height: ${lineHeightPx}px;
      ">
        <span style="flex-shrink: 0; margin-right: 4px;">${entry.title}</span>
        <span style="flex-grow: 1; overflow: hidden;">${dots}</span>
        <span style="flex-shrink: 0; margin-left: 4px;">${pageNumStr}</span>
      </div>
    `;

    if (currentHtml.length + entryHtml.length > 2000) {
      pages.push({
        html: currentHtml,
        pageNumber: pages.length + 1,
        isTOCPage: true,
        chapterTitle: '',
        currentSubheader: ''
      });
      currentHtml = '';
    }

    currentHtml += entryHtml;
  }

  if (currentHtml.trim()) {
    pages.push({
      html: currentHtml,
      pageNumber: pages.length + 1,
      isTOCPage: true,
      chapterTitle: '',
      currentSubheader: ''
    });
  }

  return pages;
};

export const prependTOCPages = (
  mainPages: any[],
  tocPages: TOCPage[]
): any[] => {
  if (!ENABLE_TOC || tocPages.length === 0) {
    return mainPages;
  }

  let pageNum = 1;
  const adjustedTocPages = tocPages.map((page, idx) => ({
    ...page,
    pageNumber: idx + 1,
    isTOCPage: true
  }));

  const adjustedMainPages = mainPages.map((page) => {
    const newPage = { ...page, pageNumber: page.pageNumber + tocPages.length };
    pageNum++;
    return newPage;
  });

  return [...adjustedTocPages, ...adjustedMainPages];
};
