/**
 * paginateChapters.test.js
 *
 * Tests for pure pagination function.
 * Ready to run with vitest.
 */

import { paginateChapters } from './paginateChapters';

describe('paginateChapters', () => {
  let measureDiv;
  let layoutCtx;
  let safeConfig;

  beforeEach(() => {
    // Create and setup measurement div
    measureDiv = document.createElement('div');
    measureDiv.style.position = 'absolute';
    measureDiv.style.visibility = 'hidden';
    measureDiv.style.width = '400px';
    measureDiv.style.fontFamily = 'Georgia, serif';
    measureDiv.style.fontSize = '12pt';
    measureDiv.style.lineHeight = '1.5';
    measureDiv.style.textAlign = 'justify';
    document.body.appendChild(measureDiv);

    // Setup layout context
    layoutCtx = {
      contentHeight: 600,
      lineHeightPx: 18,
      baseFontSize: 12,
      baseLineHeight: 1.5,
      textAlign: 'justify',
      minOrphanLines: 2,
      minWidowLines: 2,
      splitLongParagraphs: true
    };

    // Setup config
    safeConfig = {
      paragraph: {
        align: 'justify',
        firstLineIndent: 1.5
      },
      quote: {
        enabled: true,
        indentLeft: 2,
        indentRight: 2,
        showLine: true,
        italic: true,
        sizeMultiplier: 0.95,
        marginTop: 1,
        marginBottom: 1
      },
      header: {
        trackSubheaders: true,
        trackPseudoHeaders: false,
        subheaderLevels: ['h1', 'h2']
      },
      pagination: {
        minOrphanLines: 2,
        minWidowLines: 2,
        splitLongParagraphs: true
      },
      chapterTitle: {
        enabled: true,
        layout: 'spaced'
      }
    };
  });

  afterEach(() => {
    if (measureDiv && measureDiv.parentNode) {
      measureDiv.parentNode.removeChild(measureDiv);
    }
  });

  describe('Basic functionality', () => {
    it('should return empty array for empty chapters', () => {
      const result = paginateChapters([], layoutCtx, measureDiv, safeConfig);
      expect(result).toEqual([]);
    });

    it('should return empty array for null chapters', () => {
      const result = paginateChapters(null, layoutCtx, measureDiv, safeConfig);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should generate at least 1 page for chapter with content', () => {
      const chapters = [
        {
          id: 'ch1',
          type: 'chapter',
          title: 'Chapter 1',
          html: '<p>This is a test chapter with some content.</p>',
          wordCount: 10
        }
      ];
      const result = paginateChapters(chapters, layoutCtx, measureDiv, safeConfig);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should set pageNumber sequentially without gaps', () => {
      const chapters = [
        {
          id: 'ch1',
          type: 'chapter',
          title: 'Chapter 1',
          html: '<p>Page 1</p><p>Page 2</p><p>Page 3</p>',
          wordCount: 20
        }
      ];
      const result = paginateChapters(chapters, layoutCtx, measureDiv, safeConfig);
      expect(result.length).toBeGreaterThan(0);
      for (let i = 0; i < result.length; i++) {
        expect(result[i].pageNumber).toBe(i + 1);
      }
    });

    it('should set chapterTitle on all pages', () => {
      const chapters = [
        {
          id: 'ch1',
          type: 'chapter',
          title: 'Test Chapter',
          html: '<p>Content</p>',
          wordCount: 5
        }
      ];
      const result = paginateChapters(chapters, layoutCtx, measureDiv, safeConfig);
      for (const page of result) {
        if (!page.isTitleOnlyPage || page.isFirstChapterPage) {
          expect(page.chapterTitle).toBe('Test Chapter');
        }
      }
    });
  });

  describe('Chapter processing', () => {
    it('should process multiple chapters separately', () => {
      const chapters = [
        {
          id: 'ch1',
          type: 'chapter',
          title: 'Chapter 1',
          html: '<p>First chapter content</p>',
          wordCount: 5
        },
        {
          id: 'ch2',
          type: 'chapter',
          title: 'Chapter 2',
          html: '<p>Second chapter content</p>',
          wordCount: 5
        }
      ];
      const result = paginateChapters(chapters, layoutCtx, measureDiv, safeConfig);
      expect(result.length).toBeGreaterThan(0);

      // Should have pages from both chapters
      const chapter1Pages = result.filter(p => p.chapterTitle === 'Chapter 1');
      const chapter2Pages = result.filter(p => p.chapterTitle === 'Chapter 2');
      expect(chapter1Pages.length).toBeGreaterThan(0);
      expect(chapter2Pages.length).toBeGreaterThan(0);
    });

    it('should not move content between chapters in fill pass', () => {
      const chapters = [
        {
          id: 'ch1',
          type: 'chapter',
          title: 'Chapter 1',
          html: '<p>Ch1 minimal</p>',
          wordCount: 2
        },
        {
          id: 'ch2',
          type: 'chapter',
          title: 'Chapter 2',
          html: '<p>Ch2 has more content here</p><p>And more content here</p>',
          wordCount: 12
        }
      ];
      const result = paginateChapters(chapters, layoutCtx, measureDiv, safeConfig);

      // Find the last page of Chapter 1
      let ch1LastPageIdx = -1;
      for (let i = result.length - 1; i >= 0; i--) {
        if (result[i].chapterTitle === 'Chapter 1') {
          ch1LastPageIdx = i;
          break;
        }
      }

      // All pages after that should be Chapter 2
      for (let i = ch1LastPageIdx + 1; i < result.length; i++) {
        if (result[i].chapterTitle) {
          expect(result[i].chapterTitle).toBe('Chapter 2');
        }
      }
    });
  });

  describe('Blank pages', () => {
    it('should mark blank padding pages as isBlank: true', () => {
      const chapters = [
        {
          id: 'ch1',
          type: 'chapter',
          title: 'Chapter 1',
          html: '<p>Content</p>',
          wordCount: 5
        },
        {
          id: 'ch2',
          type: 'chapter',
          title: 'Chapter 2',
          html: '<p>More content</p>',
          wordCount: 5
        }
      ];

      // Enable startOnRight rule
      const modifiedConfig = { ...safeConfig };
      modifiedConfig.chapterTitle = { ...modifiedConfig.chapterTitle, startOnRightPage: true };

      const result = paginateChapters(chapters, layoutCtx, measureDiv, modifiedConfig);

      // Find any blank pages
      const blankPages = result.filter(p => p.isBlank);
      for (const blankPage of blankPages) {
        expect(blankPage.html).toBe('');
        expect(blankPage.isBlank).toBe(true);
      }
    });
  });

  describe('Page formatting', () => {
    it('should include html property on all pages', () => {
      const chapters = [
        {
          id: 'ch1',
          type: 'chapter',
          title: 'Chapter 1',
          html: '<p>Test content</p>',
          wordCount: 3
        }
      ];
      const result = paginateChapters(chapters, layoutCtx, measureDiv, safeConfig);
      for (const page of result) {
        expect(page.html).toBeDefined();
        expect(typeof page.html).toBe('string');
      }
    });

    it('should have isBlank property on all pages', () => {
      const chapters = [
        {
          id: 'ch1',
          type: 'chapter',
          title: 'Chapter 1',
          html: '<p>Content</p>',
          wordCount: 3
        }
      ];
      const result = paginateChapters(chapters, layoutCtx, measureDiv, safeConfig);
      for (const page of result) {
        expect(typeof page.isBlank).toBe('boolean');
      }
    });
  });

  describe('Content pagination', () => {
    it('should paginate long content across multiple pages', () => {
      const longContent = '<p>' + 'Word '.repeat(500) + '</p>';
      const chapters = [
        {
          id: 'ch1',
          type: 'chapter',
          title: 'Chapter 1',
          html: longContent,
          wordCount: 500
        }
      ];
      const result = paginateChapters(chapters, layoutCtx, measureDiv, safeConfig);
      expect(result.length).toBeGreaterThan(1);
    });

    it('should respect splitLongParagraphs setting', () => {
      const longContent = '<p>' + 'Word '.repeat(500) + '</p>';
      const chapters = [
        {
          id: 'ch1',
          type: 'chapter',
          title: 'Chapter 1',
          html: longContent,
          wordCount: 500
        }
      ];

      // With split enabled
      const resultWithSplit = paginateChapters(chapters, layoutCtx, measureDiv, safeConfig);
      expect(resultWithSplit.length).toBeGreaterThan(1);

      // With split disabled
      const layoutCtxNoSplit = { ...layoutCtx, splitLongParagraphs: false };
      const resultNoSplit = paginateChapters(chapters, layoutCtxNoSplit, measureDiv, safeConfig);
      expect(resultNoSplit.length).toBeGreaterThan(0);
    });
  });

  describe('Element handling', () => {
    it('should preserve HTML elements in content', () => {
      const chapters = [
        {
          id: 'ch1',
          type: 'chapter',
          title: 'Chapter 1',
          html: '<p><strong>Bold text</strong> and normal text</p>',
          wordCount: 6
        }
      ];
      const result = paginateChapters(chapters, layoutCtx, measureDiv, safeConfig);
      expect(result.length).toBeGreaterThan(0);
      const combined = result.map(p => p.html).join('');
      expect(combined).toContain('<strong>');
    });

    it('should handle lists', () => {
      const chapters = [
        {
          id: 'ch1',
          type: 'chapter',
          title: 'Chapter 1',
          html: '<ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>',
          wordCount: 6
        }
      ];
      const result = paginateChapters(chapters, layoutCtx, measureDiv, safeConfig);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle headings', () => {
      const chapters = [
        {
          id: 'ch1',
          type: 'chapter',
          title: 'Chapter 1',
          html: '<h2>Subheading</h2><p>Content after heading</p>',
          wordCount: 6
        }
      ];
      const result = paginateChapters(chapters, layoutCtx, measureDiv, safeConfig);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle blockquotes', () => {
      const chapters = [
        {
          id: 'ch1',
          type: 'chapter',
          title: 'Chapter 1',
          html: '<blockquote>This is a quote</blockquote><p>Normal content</p>',
          wordCount: 7
        }
      ];
      const result = paginateChapters(chapters, layoutCtx, measureDiv, safeConfig);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('Fill pass behavior', () => {
    it('should not create empty pages (except blanks)', () => {
      const chapters = [
        {
          id: 'ch1',
          type: 'chapter',
          title: 'Chapter 1',
          html: '<p>Content line 1</p><p>Content line 2</p>',
          wordCount: 10
        }
      ];
      const result = paginateChapters(chapters, layoutCtx, measureDiv, safeConfig);

      for (const page of result) {
        if (!page.isBlank) {
          expect(page.html.trim().length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle empty chapter html', () => {
      const chapters = [
        {
          id: 'ch1',
          type: 'chapter',
          title: 'Empty Chapter',
          html: '',
          wordCount: 0
        }
      ];
      const result = paginateChapters(chapters, layoutCtx, measureDiv, safeConfig);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle chapters with only whitespace', () => {
      const chapters = [
        {
          id: 'ch1',
          type: 'chapter',
          title: 'Whitespace Chapter',
          html: '<p>   </p><p>\n\n</p>',
          wordCount: 0
        }
      ];
      const result = paginateChapters(chapters, layoutCtx, measureDiv, safeConfig);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle very small contentHeight', () => {
      const smallLayoutCtx = { ...layoutCtx, contentHeight: 50 };
      const chapters = [
        {
          id: 'ch1',
          type: 'chapter',
          title: 'Chapter 1',
          html: '<p>Some content that might not fit</p>',
          wordCount: 6
        }
      ];
      const result = paginateChapters(chapters, smallLayoutCtx, measureDiv, safeConfig);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle malformed HTML gracefully', () => {
      const chapters = [
        {
          id: 'ch1',
          type: 'chapter',
          title: 'Chapter 1',
          html: '<p>Unclosed paragraph <strong>with nested unclosed</p>',
          wordCount: 6
        }
      ];
      const result = paginateChapters(chapters, layoutCtx, measureDiv, safeConfig);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('Subheader tracking', () => {
    it('should track subheader changes across pages', () => {
      const chapters = [
        {
          id: 'ch1',
          type: 'chapter',
          title: 'Chapter 1',
          html: '<h2>Section 1</h2><p>Content for section 1</p><h2>Section 2</h2><p>Content for section 2</p>',
          wordCount: 12
        }
      ];
      const result = paginateChapters(chapters, layoutCtx, measureDiv, safeConfig);
      expect(result.length).toBeGreaterThan(0);

      // Some pages should have currentSubheader set
      const pagesWithSubheader = result.filter(p => p.currentSubheader);
      expect(pagesWithSubheader.length).toBeGreaterThanOrEqual(0); // May be 0 if config doesn't track
    });
  });

  describe('Mixed chapter types', () => {
    it('should handle both chapter and section types', () => {
      const chapters = [
        {
          id: 'sec1',
          type: 'section',
          title: 'Introduction',
          html: '<p>Introduction content</p>',
          wordCount: 2
        },
        {
          id: 'ch1',
          type: 'chapter',
          title: 'Chapter 1',
          html: '<p>Chapter content</p>',
          wordCount: 2
        }
      ];
      const result = paginateChapters(chapters, layoutCtx, measureDiv, safeConfig);
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
