/**
 * sampleImage.js — code-generated placeholder images (SVG data-URIs) for the
 * cover-layout demos. No binaries in the repo, no licensing concerns.
 */

const svgDataUri = (svg) =>
  'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

/** Landscape 3:2 gradient with a subtle "mountains" motif + label. */
export const sampleLandscape = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="0.55" stop-color="#8b5cf6"/>
      <stop offset="1" stop-color="#ec4899"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#g)"/>
  <circle cx="960" cy="180" r="90" fill="#fde68a" opacity="0.9"/>
  <path d="M0 800 L280 470 L470 620 L700 380 L920 600 L1200 430 L1200 800 Z" fill="#1f2937" opacity="0.45"/>
  <path d="M0 800 L200 560 L430 700 L640 520 L900 690 L1200 560 L1200 800 Z" fill="#111827" opacity="0.55"/>
  <text x="600" y="430" font-family="Georgia, serif" font-size="54" fill="#ffffff" opacity="0.92"
        text-anchor="middle" dominant-baseline="middle">Foto de portada</text>
</svg>`);

/** Square portrait-style placeholder (silhouette) for the medallion layout. */
export const samplePortrait = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs>
    <linearGradient id="p" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0ea5e9"/>
      <stop offset="1" stop-color="#6366f1"/>
    </linearGradient>
  </defs>
  <rect width="600" height="600" fill="url(#p)"/>
  <circle cx="300" cy="235" r="105" fill="#ffffff" opacity="0.92"/>
  <path d="M140 560 C140 420 250 360 300 360 C350 360 460 420 460 560 Z" fill="#ffffff" opacity="0.92"/>
</svg>`);
