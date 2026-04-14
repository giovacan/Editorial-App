/**
 * transformes.js
 *
 * Shared visual transform helpers for page layout surfaces.
 * Keeps zoom, viewport-fit, and derived page frame math in one place.
 */

export const clamp = (value, min, max) => {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
};

export const getScaledSize = (width, height, scale = 1) => ({
  width: width * scale,
  height: height * scale,
});

export const fitPageScaleToViewport = ({
  pageWidth,
  pageHeight,
  viewportWidth,
  viewportHeight,
  mode = 'single',
  gap = 0,
  minScale = 0.2,
  maxScale = 3,
}) => {
  const hasValidInput = [pageWidth, pageHeight, viewportWidth, viewportHeight]
    .every(value => Number.isFinite(value) && value > 0);

  if (!hasValidInput) return minScale;

  const widthBudget = mode === 'spread'
    ? Math.max(viewportWidth - gap, 1) / (pageWidth * 2)
    : viewportWidth / pageWidth;
  const heightBudget = viewportHeight / pageHeight;

  return clamp(Math.min(widthBudget, heightBudget), minScale, maxScale);
};

export const getCenteredInsets = ({
  outerWidth,
  outerHeight,
  innerWidth,
  innerHeight,
  minInset = 0,
}) => ({
  horizontal: Math.max(minInset, (outerWidth - innerWidth) / 2),
  vertical: Math.max(minInset, (outerHeight - innerHeight) / 2),
});

export const createPreviewPageFrame = ({
  pageWidthPx,
  pageHeightPx,
  contentWidth,
  contentHeight,
  fontSize,
  fontFamily,
  lineHeightPx,
  minInset = 6,
}) => {
  const { horizontal, vertical } = getCenteredInsets({
    outerWidth: pageWidthPx,
    outerHeight: pageHeightPx,
    innerWidth: contentWidth,
    innerHeight: contentHeight,
    minInset,
  });

  return {
    pageWidthPx,
    pageHeightPx,
    paddingH: horizontal,
    paddingV: vertical,
    fontSize,
    fontFamily,
    lineHeight: lineHeightPx != null ? `${lineHeightPx}px` : undefined,
    contentHeight,
  };
};

export const getMagnifierTransform = ({
  zoomPercent = 100,
  focusXPercent = 50,
  focusYPercent = 50,
  pageWidth,
  pageHeight,
}) => {
  const scale = zoomPercent / 100;
  const safeScale = scale || 1;
  const translateX = -((focusXPercent / 100) * pageWidth * (scale - 1));
  const translateY = -((focusYPercent / 100) * pageHeight * (scale - 1));

  return {
    scale,
    translateX,
    translateY,
    transform: `scale(${scale}) translate(${translateX / safeScale}px, ${translateY / safeScale}px)`,
  };
};
