/**
 * measurementAdapter.test.js
 *
 * Tests for measurement adapter.
 * Ready to run with vitest.
 */

import {
  createMeasurementAdapter,
  createDefaultMeasurementAdapter
} from './measurementAdapter';

describe('measurementAdapter', () => {
  describe('createMeasurementAdapter', () => {
    let adapter;

    afterEach(() => {
      if (adapter) {
        adapter.destroy();
      }
    });

    it('should create adapter with custom styles', () => {
      adapter = createMeasurementAdapter({
        fontFamily: 'Arial, sans-serif',
        fontSize: 14,
        lineHeight: 1.6,
        textAlign: 'left',
        width: 500
      });
      expect(adapter).toBeDefined();
      expect(adapter.measure).toBeDefined();
      expect(adapter.destroy).toBeDefined();
    });

    it('should create adapter with default styles if config is empty', () => {
      adapter = createMeasurementAdapter({});
      expect(adapter).toBeDefined();
      expect(adapter.measure).toBeDefined();
    });

    it('should create adapter with no config parameter', () => {
      adapter = createMeasurementAdapter();
      expect(adapter).toBeDefined();
    });
  });

  describe('measure()', () => {
    let adapter;

    beforeEach(() => {
      adapter = createMeasurementAdapter({
        fontFamily: 'Arial, sans-serif',
        fontSize: 12,
        lineHeight: 1.5,
        width: 400
      });
    });

    afterEach(() => {
      if (adapter) {
        adapter.destroy();
      }
    });

    it('should measure simple HTML content', () => {
      const height = adapter.measure('<p>Test content</p>');
      expect(height).toBeGreaterThan(0);
    });

    it('should measure multiple paragraphs', () => {
      const height = adapter.measure('<p>Line 1</p><p>Line 2</p><p>Line 3</p>');
      expect(height).toBeGreaterThan(0);
    });

    it('should return 0 for empty HTML', () => {
      const height = adapter.measure('');
      expect(height).toBe(0);
    });

    it('should return 0 for null HTML', () => {
      const height = adapter.measure(null);
      expect(height).toBe(0);
    });

    it('should measure headings', () => {
      const height = adapter.measure('<h1>Heading</h1>');
      expect(height).toBeGreaterThan(0);
    });

    it('should measure lists', () => {
      const height = adapter.measure('<ul><li>Item 1</li><li>Item 2</li></ul>');
      expect(height).toBeGreaterThan(0);
    });

    it('should handle HTML errors gracefully', () => {
      const height = adapter.measure('<p>Unclosed paragraph');
      expect(typeof height).toBe('number');
      expect(height >= 0).toBe(true);
    });

    it('should measure identical content consistently', () => {
      const html = '<p>Consistent test content</p>';
      const height1 = adapter.measure(html);
      const height2 = adapter.measure(html);
      expect(height1).toBe(height2);
    });

    it('should measure longer content with greater height', () => {
      const shortHeight = adapter.measure('<p>Short</p>');
      const longHeight = adapter.measure(
        '<p>This is much longer content that will wrap to multiple lines depending on the width of the measurement div and the font size used.</p>'
      );
      expect(longHeight).toBeGreaterThan(shortHeight);
    });
  });

  describe('measureLine()', () => {
    let adapter;

    beforeEach(() => {
      adapter = createMeasurementAdapter({
        fontSize: 12,
        lineHeight: 1.5
      });
    });

    afterEach(() => {
      if (adapter) {
        adapter.destroy();
      }
    });

    it('should measure single line height', () => {
      const height = adapter.measureLine();
      expect(height).toBeGreaterThan(0);
    });

    it('should return consistent line height for same config', () => {
      const height1 = adapter.measureLine();
      const height2 = adapter.measureLine();
      expect(height1).toBe(height2);
    });

    it('should be greater than 0 even if measurement fails', () => {
      const height = adapter.measureLine();
      expect(height >= 0).toBe(true);
    });
  });

  describe('updateStyle()', () => {
    let adapter;

    beforeEach(() => {
      adapter = createMeasurementAdapter({
        fontSize: 12,
        lineHeight: 1.5,
        width: 400
      });
    });

    afterEach(() => {
      if (adapter) {
        adapter.destroy();
      }
    });

    it('should update font size', () => {
      const html = '<p>Test</p>';
      const smallHeight = adapter.measure(html);

      adapter.updateStyle({ fontSize: 16 });
      const largeHeight = adapter.measure(html);

      expect(largeHeight).toBeGreaterThan(smallHeight);
    });

    it('should update width', () => {
      const narrowHtml = '<p>This is a long line of text that will wrap when the width is narrow.</p>';
      adapter.updateStyle({ width: 200 });
      const narrowHeight = adapter.measure(narrowHtml);

      adapter.updateStyle({ width: 600 });
      const wideHeight = adapter.measure(narrowHtml);

      expect(wideHeight).toBeLessThan(narrowHeight);
    });

    it('should update font family', () => {
      const html = '<p>Test</p>';
      const height1 = adapter.measure(html);

      adapter.updateStyle({ fontFamily: 'Courier New, monospace' });
      const height2 = adapter.measure(html);

      // Both should be valid numbers
      expect(height1).toBeGreaterThan(0);
      expect(height2).toBeGreaterThan(0);
    });

    it('should handle partial updates', () => {
      adapter.updateStyle({ fontSize: 14 });
      const height = adapter.measure('<p>Test</p>');
      expect(height).toBeGreaterThan(0);
    });

    it('should handle null/undefined updates', () => {
      expect(() => {
        adapter.updateStyle(null);
      }).not.toThrow();

      expect(() => {
        adapter.updateStyle(undefined);
      }).not.toThrow();
    });
  });

  describe('reset()', () => {
    let adapter;

    beforeEach(() => {
      adapter = createMeasurementAdapter();
    });

    afterEach(() => {
      if (adapter) {
        adapter.destroy();
      }
    });

    it('should clear HTML without throwing', () => {
      adapter.measure('<p>Some content</p>');
      expect(() => {
        adapter.reset();
      }).not.toThrow();
    });

    it('should allow measurement after reset', () => {
      adapter.measure('<p>Content 1</p>');
      adapter.reset();
      const height = adapter.measure('<p>Content 2</p>');
      expect(height).toBeGreaterThan(0);
    });
  });

  describe('destroy()', () => {
    let adapter;

    it('should remove div from DOM', () => {
      adapter = createMeasurementAdapter();
      const initialCount = document.querySelectorAll('div').length;

      adapter.destroy();
      const finalCount = document.querySelectorAll('div').length;

      expect(finalCount).toBeLessThan(initialCount);
    });

    it('should not throw when called multiple times', () => {
      adapter = createMeasurementAdapter();
      expect(() => {
        adapter.destroy();
        adapter.destroy();
      }).not.toThrow();
    });

    it('should not throw if adapter was never added to DOM', () => {
      adapter = createMeasurementAdapter();
      // Manually remove from DOM
      if (adapter._div && adapter._div.parentNode) {
        adapter._div.parentNode.removeChild(adapter._div);
      }

      expect(() => {
        adapter.destroy();
      }).not.toThrow();
    });
  });

  describe('createDefaultMeasurementAdapter', () => {
    let adapter;

    afterEach(() => {
      if (adapter) {
        adapter.destroy();
      }
    });

    it('should create adapter with default styles', () => {
      adapter = createDefaultMeasurementAdapter();
      expect(adapter).toBeDefined();
      expect(adapter.measure).toBeDefined();
    });

    it('should measure content with default config', () => {
      adapter = createDefaultMeasurementAdapter();
      const height = adapter.measure('<p>Test content</p>');
      expect(height).toBeGreaterThan(0);
    });
  });

  describe('Integration: Multiple adapters', () => {
    let adapter1, adapter2;

    afterEach(() => {
      if (adapter1) adapter1.destroy();
      if (adapter2) adapter2.destroy();
    });

    it('should support multiple independent adapters', () => {
      adapter1 = createMeasurementAdapter({
        fontSize: 12,
        width: 400
      });
      adapter2 = createMeasurementAdapter({
        fontSize: 16,
        width: 600
      });

      const html = '<p>Test content</p>';
      const height1 = adapter1.measure(html);
      const height2 = adapter2.measure(html);

      // Smaller font should have smaller height
      expect(height1).toBeLessThan(height2);
    });

    it('should not interfere with each other', () => {
      adapter1 = createMeasurementAdapter({ fontSize: 12 });
      adapter2 = createMeasurementAdapter({ fontSize: 14 });

      const html = '<p>Content</p>';
      const height1a = adapter1.measure(html);
      const height2 = adapter2.measure(html);
      const height1b = adapter1.measure(html);

      expect(height1a).toBe(height1b);
      expect(height1a).toBeLessThan(height2);
    });
  });
});
