import {
  clamp,
  getScaledSize,
  fitPageScaleToViewport,
  getCenteredInsets,
  createPreviewPageFrame,
  getMagnifierTransform,
} from './transformes';

describe('transformes', () => {
  test('clamp limits values and falls back on invalid input', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-2, 0, 10)).toBe(0);
    expect(clamp(12, 0, 10)).toBe(10);
    expect(clamp(Number.NaN, 2, 8)).toBe(2);
  });

  test('getScaledSize scales both axes', () => {
    expect(getScaledSize(120, 240, 1.5)).toEqual({
      width: 180,
      height: 360,
    });
  });

  test('fitPageScaleToViewport matches single-page viewport fitting', () => {
    const scale = fitPageScaleToViewport({
      pageWidth: 200,
      pageHeight: 400,
      viewportWidth: 500,
      viewportHeight: 600,
      mode: 'single',
      minScale: 0.2,
      maxScale: 3,
    });

    expect(scale).toBe(1.5);
  });

  test('fitPageScaleToViewport matches spread fitting and honors the gap', () => {
    const scale = fitPageScaleToViewport({
      pageWidth: 200,
      pageHeight: 300,
      viewportWidth: 900,
      viewportHeight: 500,
      mode: 'spread',
      gap: 20,
      minScale: 0.2,
      maxScale: 3,
    });

    expect(scale).toBeCloseTo(1.6666666667);
  });

  test('fitPageScaleToViewport clamps oversized results', () => {
    const scale = fitPageScaleToViewport({
      pageWidth: 100,
      pageHeight: 100,
      viewportWidth: 2000,
      viewportHeight: 2000,
      maxScale: 1.75,
    });

    expect(scale).toBe(1.75);
  });

  test('getCenteredInsets derives symmetric padding with a minimum inset', () => {
    expect(getCenteredInsets({
      outerWidth: 300,
      outerHeight: 500,
      innerWidth: 240,
      innerHeight: 420,
      minInset: 6,
    })).toEqual({
      horizontal: 30,
      vertical: 40,
    });

    expect(getCenteredInsets({
      outerWidth: 300,
      outerHeight: 500,
      innerWidth: 296,
      innerHeight: 494,
      minInset: 6,
    })).toEqual({
      horizontal: 6,
      vertical: 6,
    });
  });

  test('createPreviewPageFrame builds render-ready page metrics', () => {
    expect(createPreviewPageFrame({
      pageWidthPx: 300,
      pageHeightPx: 500,
      contentWidth: 240,
      contentHeight: 420,
      fontSize: 14,
      fontFamily: 'Georgia, serif',
      lineHeightPx: 21,
      minInset: 6,
    })).toEqual({
      pageWidthPx: 300,
      pageHeightPx: 500,
      paddingH: 30,
      paddingV: 40,
      fontSize: 14,
      fontFamily: 'Georgia, serif',
      lineHeight: '21px',
      contentHeight: 420,
    });
  });

  test('getMagnifierTransform returns stable pan math for the preview lens', () => {
    const result = getMagnifierTransform({
      zoomPercent: 150,
      focusXPercent: 50,
      focusYPercent: 25,
      pageWidth: 200,
      pageHeight: 400,
    });

    expect(result.scale).toBe(1.5);
    expect(result.translateX).toBe(-50);
    expect(result.translateY).toBe(-50);
    expect(result.transform).toContain('scale(1.5)');
    expect(result.transform).toContain('translate(-33.333333333333336px, -33.333333333333336px)');
  });
});
