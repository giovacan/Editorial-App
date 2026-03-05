/**
 * measurementAdapter.js
 *
 * Encapsulates DOM-based text measurement operations.
 * Provides a clean, reusable interface for measuring text height
 * without exposing raw DOM manipulation.
 *
 * Pure in the sense that:
 * - Same HTML input → same pixel measurement output
 * - Style configuration is frozen on creation
 * - All state is local to instance
 */

/**
 * Create a measurement adapter for text height calculations.
 *
 * @param {object} styleConfig - Style configuration
 *   - fontFamily: CSS font-family value
 *   - fontSize: Font size in points (pt)
 *   - lineHeight: Line height (unitless multiplier or value)
 *   - textAlign: CSS text-align value
 *   - width: Content width in pixels
 * @returns {object} Adapter with measure() and destroy() methods
 */
export const createMeasurementAdapter = (styleConfig) => {
  const {
    fontFamily = 'Georgia, serif',
    fontSize = 12,
    lineHeight = 1.5,
    textAlign = 'justify',
    width = 400
  } = styleConfig || {};

  // Create measurement div - positioned off-screen, invisible
  const measureDiv = document.createElement('div');
  measureDiv.style.position = 'absolute';
  measureDiv.style.visibility = 'hidden';
  measureDiv.style.left = '-9999px';
  measureDiv.style.top = '0';
  measureDiv.style.width = `${width}px`;
  measureDiv.style.height = 'auto';
  measureDiv.style.minHeight = '0';
  measureDiv.style.maxHeight = 'none';
  measureDiv.style.overflow = 'visible';
  measureDiv.style.padding = '0';
  measureDiv.style.margin = '0';
  measureDiv.style.border = 'none';
  measureDiv.style.fontFamily = fontFamily;
  measureDiv.style.fontSize = `${fontSize}pt`;
  measureDiv.style.lineHeight = String(lineHeight);
  measureDiv.style.textAlign = textAlign;
  measureDiv.style.textJustify = 'inter-word';
  measureDiv.style.hyphens = 'auto';
  measureDiv.style.wordBreak = 'break-word';
  measureDiv.style.boxSizing = 'border-box';
  measureDiv.style.whiteSpace = 'normal';
  measureDiv.style.wordWrap = 'break-word';

  // Append to body for measurements to work
  document.body.appendChild(measureDiv);

  return {
    /**
     * Measure the height of HTML content.
     *
     * @param {string} html - HTML content to measure
     * @returns {number} Height in pixels
     */
    measure(html) {
      if (!html) {
        return 0;
      }

      try {
        measureDiv.innerHTML = html;
        return measureDiv.offsetHeight || 0;
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('measurementAdapter: Error measuring HTML', e);
        }
        return 0;
      }
    },

    /**
     * Measure a single line height (e.g., 'Ag').
     * Used for line counting calculations.
     *
     * @returns {number} Line height in pixels
     */
    measureLine() {
      try {
        measureDiv.innerHTML = 'Ag';
        return measureDiv.offsetHeight || 0;
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('measurementAdapter: Error measuring line', e);
        }
        return 16; // Safe fallback
      }
    },

    /**
     * Update style configuration.
     * Call this before measuring if style has changed.
     *
     * @param {object} newConfig - Partial style config to update
     */
    updateStyle(newConfig) {
      if (!newConfig) return;

      if (newConfig.fontFamily) {
        measureDiv.style.fontFamily = newConfig.fontFamily;
      }
      if (newConfig.fontSize) {
        measureDiv.style.fontSize = `${newConfig.fontSize}pt`;
      }
      if (newConfig.lineHeight) {
        measureDiv.style.lineHeight = String(newConfig.lineHeight);
      }
      if (newConfig.textAlign) {
        measureDiv.style.textAlign = newConfig.textAlign;
      }
      if (newConfig.width) {
        measureDiv.style.width = `${newConfig.width}px`;
      }
    },

    /**
     * Reset internal state (clear HTML, clear measurements).
     * Call between independent measurement sessions if needed.
     */
    reset() {
      try {
        measureDiv.innerHTML = '';
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('measurementAdapter: Error resetting', e);
        }
      }
    },

    /**
     * Clean up and remove the measurement div from DOM.
     * Must be called when done to prevent memory leaks.
     */
    destroy() {
      try {
        if (measureDiv && measureDiv.parentNode) {
          measureDiv.parentNode.removeChild(measureDiv);
        }
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('measurementAdapter: Error destroying', e);
        }
      }
    }
  };
};

/**
 * Create a measurement adapter with default style configuration.
 *
 * @returns {object} Adapter instance
 */
export const createDefaultMeasurementAdapter = () => {
  return createMeasurementAdapter({
    fontFamily: 'Georgia, serif',
    fontSize: 12,
    lineHeight: 1.5,
    textAlign: 'justify',
    width: 400
  });
};
