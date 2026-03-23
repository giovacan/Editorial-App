import { ENABLE_TOC } from './extractTOC';
import type { TOCEntry } from './extractTOC';

export type TOCResolvedEntry = TOCEntry & {
  page: number;
};

export type Page = {
  html: string;
  pageNumber: number;
  chapterTitle?: string;
  isBlank?: boolean;
  currentSubheader?: string;
  firstElementIndex?: number;
};

export const mapTOCToPages = (
  tocEntries: TOCEntry[],
  pages: Page[]
): TOCResolvedEntry[] => {
  if (!ENABLE_TOC || tocEntries.length === 0 || pages.length === 0) {
    return [];
  }

  const resolvedEntries: TOCResolvedEntry[] = [];

  for (const entry of tocEntries) {
    const page = findPageForEntry(entry, pages);
    if (page > 0) {
      resolvedEntries.push({
        ...entry,
        page
      });
    }
  }

  return resolvedEntries;
};

const findPageForEntry = (entry: TOCEntry, pages: Page[]): number => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = entry.title;
  const normalizedTitle = tempDiv.textContent?.trim().toLowerCase() || '';

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const page = pages[pageIdx];
    if (page.isBlank) continue;

    if (page.chapterTitle && entry.level === 1) {
      const chapterTitleLower = page.chapterTitle.toLowerCase();
      if (chapterTitleLower === normalizedTitle || 
          normalizedTitle.includes(chapterTitleLower) ||
          chapterTitleLower.includes(normalizedTitle)) {
        return page.pageNumber || (pageIdx + 1);
      }
    }

    if (page.html && normalizedTitle) {
      const pageTitleLower = page.html.toLowerCase();
      if (pageTitleLower.includes(normalizedTitle)) {
        return page.pageNumber || (pageIdx + 1);
      }
    }

    if (entry.level > 1 && page.currentSubheader) {
      const subheaderLower = page.currentSubheader.toLowerCase();
      if (subheaderLower === normalizedTitle ||
          normalizedTitle.includes(subheaderLower) ||
          subheaderLower.includes(normalizedTitle)) {
        return page.pageNumber || (pageIdx + 1);
      }
    }
  }

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const page = pages[pageIdx];
    if (page.chapterTitle) {
      const chapterIdx = extractChapterIndex(page.chapterTitle, pages);
      if (chapterIdx === entry.chapterIndex) {
        return page.pageNumber || (pageIdx + 1);
      }
    }
  }

  return 1;
};

const extractChapterIndex = (chapterTitle: string, pages: Page[]): number => {
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].chapterTitle === chapterTitle) {
      return i;
    }
  }
  return 0;
};
