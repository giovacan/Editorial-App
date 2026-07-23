/**
 * images.js — image sizing for the book layout (B2).
 *
 * The pagination engine runs in a worker (no DOM), so images must carry their
 * intrinsic dimensions as data-w / data-h attributes (precomputed on the main
 * thread at import time). Every surface — engine height, preview, PDF — scales
 * from those same numbers via `scaleImage`, so the image occupies the exact
 * same box everywhere (deterministic).
 */

const DEFAULT_ASPECT = 4 / 3; // fallback when dimensions are unknown

/**
 * Read the intrinsic pixel dimensions of an <img> from its markup:
 * prefers data-w/data-h (precomputed), falls back to width/height attrs or the
 * inline style, then to a default aspect at column width.
 * @param {string} imgHtml - the <img …> tag (or a block containing one)
 * @returns {{ w: number, h: number } | null}
 */
export const readImageDims = (imgHtml) => {
  if (!imgHtml) return null;
  const num = (re) => { const m = imgHtml.match(re); return m ? parseFloat(m[1]) : null; };
  const w = num(/data-w="([\d.]+)"/i) ?? num(/\bwidth="([\d.]+)"/i) ?? num(/width:\s*([\d.]+)px/i);
  const h = num(/data-h="([\d.]+)"/i) ?? num(/\bheight="([\d.]+)"/i) ?? num(/height:\s*([\d.]+)px/i);
  if (w && h) return { w, h };
  if (w && !h) return { w, h: w / DEFAULT_ASPECT };
  if (!w && h) return { w: h * DEFAULT_ASPECT, h };
  return null; // unknown → caller uses column-width default
};

/**
 * Scale an image to fit the content column, preserving aspect ratio and
 * capping the height. Pure — same inputs → same box.
 *
 * @param {{w,h}|null} dims      - intrinsic dims (readImageDims); null = unknown
 * @param {number} contentWidth  - column width in px
 * @param {object} [cfg]         - { maxWidthFrac=0.9, maxHeightFrac=0.85 }
 * @param {number} [pageHeight]  - content-box height in px (for the height cap)
 * @returns {{ width: number, height: number }} render box in px
 */
export const scaleImage = (dims, contentWidth, cfg = {}, pageHeight = 0) => {
  const maxWidthFrac = cfg.maxWidthFrac ?? 0.9;
  const maxHeightFrac = cfg.maxHeightFrac ?? 0.85;
  const maxW = contentWidth * maxWidthFrac;

  // Unknown dims → a sensible default box at the max width.
  const intrinsic = dims && dims.w > 0 && dims.h > 0 ? dims : { w: maxW, h: maxW / DEFAULT_ASPECT };
  const ratio = intrinsic.h / intrinsic.w;

  // Never upscale past the intrinsic width, and never past the column.
  let width = Math.min(intrinsic.w, maxW);
  let height = width * ratio;

  // Cap the height (so a tall image doesn't swallow the whole page); when the
  // height is the binding constraint, recompute width from it.
  if (pageHeight > 0) {
    const maxH = pageHeight * maxHeightFrac;
    if (height > maxH) { height = maxH; width = height / ratio; }
  }
  return { width: Math.round(width), height: Math.round(height) };
};

/**
 * Precompute intrinsic dimensions of every <img> in an HTML string and inject
 * data-w / data-h attributes. Runs on the MAIN THREAD (uses Image()), at import
 * time, so the worker engine can size images without DOM. Images that fail to
 * load are left as-is (the engine falls back to a default aspect).
 * @param {string} html
 * @returns {Promise<string>}
 */
export const precomputeImageDims = async (html) => {
  if (!html || typeof window === 'undefined' || html.indexOf('<img') === -1) return html || '';
  const srcs = [...html.matchAll(/<img\b[^>]*?\bsrc="([^"]+)"[^>]*>/gi)];
  if (srcs.length === 0) return html;

  const load = (src) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });

  let out = html;
  for (const m of srcs) {
    const tag = m[0];
    const src = m[1];
    if (/\bdata-w=/.test(tag)) continue; // already computed
    const dims = await load(src);
    if (dims && dims.w > 0 && dims.h > 0) {
      const withDims = tag.replace(/<img\b/i, `<img data-w="${dims.w}" data-h="${dims.h}"`);
      out = out.replace(tag, withDims);
    }
  }
  return out;
};

/**
 * Build the styled <img> markup the preview/PDF share, sized by scaleImage.
 * Keeps data-w/data-h so re-parsing (and the engine) still see the intrinsics.
 */
export const buildImageHtml = (src, dims, box, align = 'center') => {
  const margin = align === 'center' ? '0 auto' : '0';
  const wAttr = dims ? ` data-w="${dims.w}" data-h="${dims.h}"` : '';
  return `<img src="${src}"${wAttr} style="display:block;width:${box.width}px;height:${box.height}px;margin:${margin};" />`;
};
