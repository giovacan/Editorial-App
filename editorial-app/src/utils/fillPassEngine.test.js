/**
 * fillPassEngine.test.js
 *
 * Tests for fill pass algorithm.
 * Ready to run with vitest.
 */

import {
  applyFillPass,
  calculatePageRemainingSpace,
  canElementFitOnPage,
  widowRulesSatisfied,
  getFirstElement,
  removeFirstElement
} from './fillPassEngine';

describe('fillPassEngine', () => {
  let mockDiv;

  beforeEach(() => {
    mockDiv = {
      innerHTML: '',
      offsetHeight: 0
    };
  });

  describe('calculatePageRemainingSpace', () => {
    it('should calculate remaining space', () => {
      mockDiv.offsetHeight = 100;
      const result = calculatePageRemainingSpace('<p>Test</p>', 200, mockDiv);
      expect(result).toBe(100);
    });

    it('should never be negative', () => {
      mockDiv.offsetHeight = 300;
      const result = calculatePageRemainingSpace('<p>Test</p>', 200, mockDiv);
      expect(result).toBe(0);
    });

    it('should handle missing measureDiv', () => {
      const result = calculatePageRemainingSpace('<p>Test</p>', 200, null);
      expect(result).toBe(0);
    });
  });

  describe('canElementFitOnPage', () => {
    it('should check if element fits', () => {
      mockDiv.offsetHeight = 150;
      const result = canElementFitOnPage('<p>Page</p>', '<p>New</p>', 200, mockDiv);
      expect(result).toBe(true);
    });

    it('should return false if overfull', () => {
      mockDiv.offsetHeight = 250;
      const result = canElementFitOnPage('<p>Page</p>', '<p>New</p>', 200, mockDiv);
      expect(result).toBe(false);
    });

    it('should handle missing measureDiv', () => {
      const result = canElementFitOnPage('<p>Page</p>', '<p>New</p>', 200, null);
      expect(result).toBe(false);
    });
  });

  describe('widowRulesSatisfied', () => {
    it('should pass for empty content', () => {
      const result = widowRulesSatisfied('', 2, 20, mockDiv);
      expect(result).toBe(true);
    });

    it('should check widow lines', () => {
      mockDiv.offsetHeight = 100;
      const result = widowRulesSatisfied('<p>Rest</p>', 2, 20, mockDiv);
      // 100 / 20 = 5 lines, which is >= 2
      expect(result).toBe(true);
    });

    it('should fail if not enough lines', () => {
      mockDiv.offsetHeight = 20;
      const result = widowRulesSatisfied('<p>Rest</p>', 5, 20, mockDiv);
      // 20 / 20 = 1 line, which is < 5
      expect(result).toBe(false);
    });
  });

  describe('getFirstElement', () => {
    it('should extract first element', () => {
      const result = getFirstElement('<p>First</p><p>Second</p>');
      expect(result?.tagName).toBe('P');
      expect(result?.textContent).toBe('First');
    });

    it('should handle empty HTML', () => {
      const result = getFirstElement('');
      expect(result).toBeNull();
    });

    it('should handle text-only content', () => {
      const result = getFirstElement('Just text');
      expect(result).toBeNull();
    });
  });

  describe('removeFirstElement', () => {
    it('should remove first element', () => {
      const result = removeFirstElement('<p>Remove</p><p>Keep</p>');
      expect(result).toBe('<p>Keep</p>');
    });

    it('should handle single element', () => {
      const result = removeFirstElement('<p>Only</p>');
      expect(result).toBe('');
    });

    it('should handle empty input', () => {
      const result = removeFirstElement('');
      expect(result).toBe('');
    });
  });

  describe('applyFillPass', () => {
    it('should return empty array unchanged', () => {
      const result = applyFillPass([], {});
      expect(result).toEqual([]);
    });

    it('should return null unchanged', () => {
      const result = applyFillPass(null, {});
      expect(result).toBeNull();
    });

    it('should handle missing measureDiv', () => {
      const pages = [
        { html: '<p>Page 1</p>', isBlank: false, chapterTitle: 'Ch1' },
        { html: '<p>Page 2</p>', isBlank: false, chapterTitle: 'Ch1' }
      ];
      const result = applyFillPass(pages, { contentHeight: 200, lineHeightPx: 20 });
      // Should return pages unchanged if no measureDiv
      expect(result.length).toBe(2);
    });

    it('should skip blank pages', () => {
      const pages = [
        { html: '', isBlank: true, chapterTitle: 'Ch1' },
        { html: '<p>Page 2</p>', isBlank: false, chapterTitle: 'Ch1' }
      ];
      const result = applyFillPass(pages, {
        contentHeight: 200,
        lineHeightPx: 20,
        minOrphanLines: 2,
        minWidowLines: 2,
        measureDiv: mockDiv
      });
      expect(result[0].isBlank).toBe(true);
    });

    it('should not move content between chapters', () => {
      const pages = [
        { html: '<p>Page 1</p>', isBlank: false, chapterTitle: 'Ch1' },
        { html: '<p>Page 2</p>', isBlank: false, chapterTitle: 'Ch2' }
      ];
      mockDiv.offsetHeight = 50;
      const result = applyFillPass(pages, {
        contentHeight: 200,
        lineHeightPx: 20,
        minOrphanLines: 2,
        minWidowLines: 2,
        measureDiv: mockDiv
      });
      // Pages should remain separate
      expect(result[0].chapterTitle).toBe('Ch1');
      expect(result[1].chapterTitle).toBe('Ch2');
    });
  });
});
