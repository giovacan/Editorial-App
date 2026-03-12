/**
 * simplePageUtils.test.js
 *
 * Simple tests for page utility functions.
 * These can be run with vitest or any standard test runner.
 */

import {
  createBlankPage,
  createContentPage,
  calculateFittingLines,
  getRemainingSpace,
  contentFits,
  isPageEmpty,
  getPageCount,
  shouldChapterStartOnRight,
  isEvenPage,
  isOddPage,
  calculateTotalHeight,
  countLines,
  isHeading,
  isParagraph,
  isList,
  isBlockquote,
  getHeadingLevel,
  formatPageNumber,
  estimateContentLength,
  truncateText
} from './simplePageUtils';

describe('simplePageUtils', () => {
  describe('createBlankPage', () => {
    it('should create blank page with defaults', () => {
      const page = createBlankPage(1);
      expect(page.pageNumber).toBe(1);
      expect(page.isBlank).toBe(true);
      expect(page.html).toBe('');
      expect(page.chapterTitle).toBe('');
    });

    it('should create blank page with chapter title', () => {
      const page = createBlankPage(2, 'Chapter 1');
      expect(page.chapterTitle).toBe('Chapter 1');
    });
  });

  describe('createContentPage', () => {
    it('should create content page', () => {
      const page = createContentPage('<p>Test</p>', 1, 'Ch1', 'Section');
      expect(page.isBlank).toBe(false);
      expect(page.html).toBe('<p>Test</p>');
      expect(page.chapterTitle).toBe('Ch1');
      expect(page.currentSubheader).toBe('Section');
    });
  });

  describe('calculateFittingLines', () => {
    it('should calculate lines correctly', () => {
      expect(calculateFittingLines(300, 15)).toBe(20);
      expect(calculateFittingLines(100, 20)).toBe(5);
    });

    it('should never round up', () => {
      expect(calculateFittingLines(307, 15)).toBe(20); // not 21
    });

    it('should handle edge cases', () => {
      expect(calculateFittingLines(0, 15)).toBe(0);
      expect(calculateFittingLines(300, 0)).toBe(0);
    });
  });

  describe('getRemainingSpace', () => {
    it('should calculate remaining space', () => {
      expect(getRemainingSpace(300, 100)).toBe(200);
    });

    it('should never be negative', () => {
      expect(getRemainingSpace(100, 300)).toBe(0);
    });
  });

  describe('contentFits', () => {
    it('should check if content fits', () => {
      expect(contentFits(50, 100)).toBe(true);
      expect(contentFits(100, 50)).toBe(false);
    });
  });

  describe('isPageEmpty', () => {
    it('should detect empty pages', () => {
      expect(isPageEmpty({ isBlank: true })).toBe(true);
      expect(isPageEmpty({ isBlank: false, html: '' })).toBe(true);
      expect(isPageEmpty({ isBlank: false, html: '  ' })).toBe(true);
    });

    it('should detect non-empty pages', () => {
      expect(isPageEmpty({ isBlank: false, html: '<p>Text</p>' })).toBe(false);
    });
  });

  describe('getPageCount', () => {
    it('should count pages', () => {
      expect(getPageCount([{}, {}, {}])).toBe(3);
      expect(getPageCount([])).toBe(0);
      expect(getPageCount(null)).toBe(0);
    });
  });

  describe('shouldChapterStartOnRight', () => {
    it('should apply rule correctly', () => {
      expect(shouldChapterStartOnRight(0, true)).toBe(false);
      expect(shouldChapterStartOnRight(1, true)).toBe(true);
      expect(shouldChapterStartOnRight(1, false)).toBe(false);
    });
  });

  describe('page parity checks', () => {
    it('should identify even/odd pages', () => {
      expect(isEvenPage(2)).toBe(true);
      expect(isEvenPage(1)).toBe(false);
      expect(isOddPage(1)).toBe(true);
      expect(isOddPage(2)).toBe(false);
    });
  });

  describe('calculateTotalHeight', () => {
    it('should sum block heights', () => {
      const blocks = [
        { measuredHeight: 50 },
        { measuredHeight: 60 },
        { measuredHeight: 40 }
      ];
      expect(calculateTotalHeight(blocks)).toBe(150);
    });

    it('should handle missing heights', () => {
      const blocks = [{ measuredHeight: 50 }, {}, { measuredHeight: 40 }];
      expect(calculateTotalHeight(blocks)).toBe(90);
    });
  });

  describe('countLines', () => {
    it('should sum line counts', () => {
      const blocks = [
        { lineCount: 5 },
        { lineCount: 7 },
        { lineCount: 3 }
      ];
      expect(countLines(blocks)).toBe(15);
    });
  });

  describe('element type checks', () => {
    const createEl = (tag) => ({ tagName: tag });

    it('should detect headings', () => {
      expect(isHeading(createEl('H1'))).toBe(true);
      expect(isHeading(createEl('H6'))).toBe(true);
      expect(isHeading(createEl('P'))).toBe(false);
    });

    it('should detect paragraphs', () => {
      expect(isParagraph(createEl('P'))).toBe(true);
      expect(isParagraph(createEl('DIV'))).toBe(false);
    });

    it('should detect lists', () => {
      expect(isList(createEl('UL'))).toBe(true);
      expect(isList(createEl('OL'))).toBe(true);
      expect(isList(createEl('P'))).toBe(false);
    });

    it('should detect blockquotes', () => {
      expect(isBlockquote(createEl('BLOCKQUOTE'))).toBe(true);
      expect(isBlockquote(createEl('P'))).toBe(false);
    });
  });

  describe('getHeadingLevel', () => {
    const createEl = (tag) => ({ tagName: tag });

    it('should extract heading level', () => {
      expect(getHeadingLevel(createEl('H1'))).toBe(1);
      expect(getHeadingLevel(createEl('H3'))).toBe(3);
      expect(getHeadingLevel(createEl('H6'))).toBe(6);
    });

    it('should return null for non-headings', () => {
      expect(getHeadingLevel(createEl('P'))).toBeNull();
      expect(getHeadingLevel(null)).toBeNull();
    });
  });

  describe('formatPageNumber', () => {
    it('should format page numbers', () => {
      expect(formatPageNumber(1)).toBe('1');
      expect(formatPageNumber(42, 'p.')).toBe('p.42');
    });
  });

  describe('estimateContentLength', () => {
    it('should estimate text length', () => {
      expect(estimateContentLength('<p>Hello</p>')).toBe(5);
      expect(estimateContentLength(null)).toBe(0);
    });
  });

  describe('truncateText', () => {
    it('should truncate long text', () => {
      const text = 'This is a very long text that needs truncation';
      const result = truncateText(text, 10);
      expect(result).toBe('This is a ...');
      expect(result.length).toBeLessThanOrEqual(13);
    });

    it('should not truncate short text', () => {
      expect(truncateText('Hi', 10)).toBe('Hi');
    });
  });
});
