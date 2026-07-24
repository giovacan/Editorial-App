/**
 * chapterCover.js — chapter-cover HTML builder (title + cover image integrated).
 *
 * Pure string builder (no DOM), shared by the /demos/portadas gallery now and by
 * the pagination engine later (buildChapterTitleHtml). Emitting title + image as
 * ONE block means the engine measures them together, so a cover photo never
 * creates a "crater" (an image that doesn't fit and pushes the previous page,
 * leaving it near-empty).
 *
 * @typedef {'title-top'|'photo-top'|'full-bleed'|'medallion'} CoverLayout
 * @typedef {Object} CoverEffects
 * @property {number}  [radius]   corner radius px (0 = square)
 * @property {boolean} [shadow]   drop shadow
 * @property {{width:number,color:string}} [border]
 * @property {'none'|'grayscale'|'sepia'|'opacity'} [filter]
 * @property {number}  [size]     image size as a fraction of the content box (0..1)
 * @property {boolean} [circle]   force a circular crop (medallion)
 */

export const DEFAULT_COVER_EFFECTS = {
  radius: 8,
  shadow: true,
  border: { width: 0, color: '#333333' },
  filter: 'none',
  size: 0.5,
  circle: false,
};

export const COVER_LAYOUTS = [
  { id: 'title-top', name: 'Título arriba + foto', desc: 'Título centrado, foto moderada debajo.' },
  { id: 'title-band', name: 'Título arriba + banda ancha', desc: 'Título arriba, imagen a todo el ancho de la página, abajo.' },
  { id: 'band-top', name: 'Banda ancha arriba + título', desc: 'Banda a todo el ancho en la parte superior, título debajo.' },
  { id: 'title-over-band', name: 'Título sobre la banda', desc: 'Título superpuesto sobre una banda ancha de imagen.' },
  { id: 'photo-top', name: 'Foto arriba + título', desc: 'Foto protagonista, título debajo.' },
  { id: 'full-bleed', name: 'Foto a página completa', desc: 'Foto a sangre con título superpuesto.' },
  { id: 'medallion', name: 'Medallón sobre el título', desc: 'Foto pequeña circular sobre el título.' },
  { id: 'diptych', name: 'Díptico (dos imágenes)', desc: 'Dos fotos lado a lado bajo el título.' },
  { id: 'framed', name: 'Marco / passe-partout', desc: 'Foto enmarcada estilo galería, título arriba.' },
  { id: 'side-strip', name: 'Franja lateral', desc: 'Imagen vertical a la izquierda, título a la derecha.' },
  { id: 'polaroid', name: 'Polaroid', desc: 'Foto instantánea con borde grueso y ligera inclinación.' },
  { id: 'numeral', name: 'Número grande', desc: 'Número de capítulo gigante junto al título, foto debajo.' },
];

/** CSS filter string for the effect. */
const filterCss = (filter) => {
  switch (filter) {
    case 'grayscale': return 'filter:grayscale(1);';
    case 'sepia': return 'filter:sepia(0.7);';
    case 'opacity': return 'opacity:0.85;';
    default: return '';
  }
};

/** Shared <img> style from the effects (radius, shadow, border, filter, circle). */
const imgStyle = (effects, extra = '') => {
  const e = { ...DEFAULT_COVER_EFFECTS, ...(effects || {}) };
  const bw = e.border?.width || 0;
  const parts = [
    'display:block',
    'object-fit:cover',
    `border-radius:${e.circle ? '50%' : `${e.radius || 0}px`}`,
    bw > 0 ? `border:${bw}px solid ${e.border.color || '#333'}` : '',
    e.shadow ? 'box-shadow:0 6px 20px rgba(0,0,0,0.25)' : '',
    filterCss(e.filter),
    extra,
  ].filter(Boolean);
  return parts.join(';') + ';';
};

/**
 * Build the chapter-cover HTML.
 * @param {Object} opts
 * @param {CoverLayout} opts.layout
 * @param {string} [opts.title]      chapter name / title text
 * @param {string} [opts.label]      structural label ("CAPÍTULO 2"); optional
 * @param {string} opts.imageSrc     image URL / data-URI
 * @param {CoverEffects} [opts.effects]
 * @param {{contentWidth:number, contentHeight:number}} opts.dims  px box the cover fills
 * @returns {string} HTML string (a single data-chapter-start block)
 */
export const buildChapterCoverHtml = ({ layout, title = '', label = '', imageSrc = '', imageSrc2 = '', effects, dims }) => {
  const W = dims?.contentWidth || 300;
  const H = dims?.contentHeight || 480;
  const e = { ...DEFAULT_COVER_EFFECTS, ...(effects || {}) };
  const size = Math.min(1, Math.max(0.1, e.size ?? 0.5));
  const img2 = imageSrc2 || imageSrc; // diptych falls back to the same image

  const labelHtml = label
    ? `<div class="cc-label" style="font-size:0.8em;letter-spacing:0.06em;color:#6b7280;text-transform:uppercase;margin-bottom:0.3em;">${label}</div>`
    : '';
  const titleHtml = title
    ? `<div class="cc-title" style="font-weight:700;line-height:1.25;">${title}</div>`
    : '';

  const wrap = (inner, style = '') =>
    `<div data-chapter-start="true" class="cc cc-${layout}" style="width:${W}px;min-height:${H}px;box-sizing:border-box;text-align:center;${style}">${inner}</div>`;

  switch (layout) {
    case 'photo-top': {
      const imgH = Math.round(H * Math.max(0.35, size));
      const img = `<img src="${imageSrc}" alt="" width="${W}" height="${imgH}" style="${imgStyle(e, `width:100%;height:${imgH}px;margin:0 0 0.8em`)}" />`;
      return wrap(
        `${img}<div style="font-size:1.6em;padding:0 8%;">${labelHtml}${titleHtml}</div>`,
        'display:flex;flex-direction:column;justify-content:flex-start;padding-top:0;'
      );
    }
    case 'full-bleed': {
      // Photo fills the page; title overlaid on a legibility gradient at the bottom.
      const img = `<img src="${imageSrc}" alt="" width="${W}" height="${H}" style="${imgStyle(e, `position:absolute;inset:0;width:100%;height:100%;border-radius:0`)}" />`;
      const scrim = `<div style="position:absolute;inset:auto 0 0 0;height:45%;background:linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0));"></div>`;
      const text = `<div style="position:absolute;inset:auto 0 8% 0;color:#fff;font-size:1.7em;padding:0 8%;text-shadow:0 2px 8px rgba(0,0,0,0.6);">${labelHtml.replace('#6b7280', '#e5e7eb')}${titleHtml}</div>`;
      return wrap(`${img}${scrim}${text}`, 'position:relative;overflow:hidden;');
    }
    case 'medallion': {
      const d = Math.round(Math.min(W, H) * Math.min(0.5, Math.max(0.18, size)));
      // The medallion is circular by nature. The global `circle` toggle applies
      // to the OTHER layouts; here it's always round.
      const img = `<img src="${imageSrc}" alt="" width="${d}" height="${d}" style="${imgStyle({ ...e, circle: true }, `width:${d}px;height:${d}px;margin:0 auto 0.8em`)}" />`;
      return wrap(
        `<div style="font-size:1.6em;padding:0 8%;">${img}${labelHtml}${titleHtml}</div>`,
        'display:flex;flex-direction:column;justify-content:center;'
      );
    }
    case 'title-band': {
      // Title on top; the image is a full-WIDTH band (edge to edge, no side
      // margins), height driven by `size`. The band ignores rounding/border by
      // default to read as full-bleed, but honors shadow/filter.
      const bandH = Math.round(H * Math.min(0.6, Math.max(0.22, size)));
      const bandStyle = imgStyle(
        { ...e, radius: 0, border: { width: 0 } },
        `width:${W}px;height:${bandH}px;margin:1em 0 0`
      );
      const img = `<img src="${imageSrc}" alt="" width="${W}" height="${bandH}" style="${bandStyle}" />`;
      return wrap(
        `<div style="font-size:1.6em;padding:1.2em 8% 0;">${labelHtml}${titleHtml}</div>${img}`,
        'display:flex;flex-direction:column;justify-content:flex-start;'
      );
    }
    case 'band-top': {
      // Full-width band at the TOP, title below it.
      const bandH = Math.round(H * Math.min(0.55, Math.max(0.22, size)));
      const band = imgStyle({ ...e, radius: 0, border: { width: 0 } }, `width:${W}px;height:${bandH}px;margin:0 0 1em`);
      const img = `<img src="${imageSrc}" alt="" width="${W}" height="${bandH}" style="${band}" />`;
      return wrap(
        `${img}<div style="font-size:1.6em;padding:0.6em 8% 0;">${labelHtml}${titleHtml}</div>`,
        'display:flex;flex-direction:column;justify-content:flex-start;padding-top:0;'
      );
    }
    case 'title-over-band': {
      // Wide band with the title overlaid on it (scrim for legibility).
      const bandH = Math.round(H * Math.min(0.6, Math.max(0.3, size)));
      const top = Math.round((H - bandH) / 2);
      const band = imgStyle({ ...e, radius: e.radius, border: { width: 0 } }, `position:absolute;inset:0;width:100%;height:100%`);
      const inner = `<div style="position:relative;width:${W}px;height:${bandH}px;overflow:hidden;border-radius:${e.radius || 0}px;${e.shadow ? 'box-shadow:0 6px 20px rgba(0,0,0,0.25);' : ''}">`
        + `<img src="${imageSrc}" alt="" width="${W}" height="${bandH}" style="${band}" />`
        + `<div style="position:absolute;inset:0;background:rgba(0,0,0,0.38);"></div>`
        + `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-size:1.7em;padding:0 8%;text-shadow:0 2px 8px rgba(0,0,0,0.6);">${labelHtml.replace('#6b7280', '#e5e7eb')}${titleHtml}</div>`
        + `</div>`;
      return wrap(inner, `display:flex;flex-direction:column;justify-content:flex-start;padding-top:${top}px;`);
    }
    case 'diptych': {
      // Title on top; two images side by side below.
      const gap = 10;
      const cellW = Math.round((W - gap) / 2);
      const cellH = Math.round(H * Math.min(0.5, Math.max(0.22, size)));
      const s = (src) => `<img src="${src}" alt="" width="${cellW}" height="${cellH}" style="${imgStyle(e, `width:${cellW}px;height:${cellH}px`)}" />`;
      return wrap(
        `<div style="font-size:1.6em;padding:1.2em 8% 0;">${labelHtml}${titleHtml}</div>`
        + `<div style="display:flex;gap:${gap}px;justify-content:center;margin-top:1em;">${s(imageSrc)}${s(img2)}</div>`,
        'display:flex;flex-direction:column;justify-content:flex-start;'
      );
    }
    case 'framed': {
      // Museum passe-partout: image inside a matted double frame, title above.
      const innerW = Math.round(W * 0.62);
      const innerH = Math.round(H * Math.min(0.5, Math.max(0.24, size)));
      const mat = 14;
      const frame = `<div style="display:inline-block;background:#fff;padding:${mat}px;border:1px solid #d1d5db;box-shadow:0 8px 24px rgba(0,0,0,0.18);margin:1.2em auto 0;">`
        + `<div style="border:2px solid #9ca3af;padding:6px;">`
        + `<img src="${imageSrc}" alt="" width="${innerW}" height="${innerH}" style="${imgStyle({ ...e, radius: 0, shadow: false, border: { width: 0 } }, `width:${innerW}px;height:${innerH}px`)}" />`
        + `</div></div>`;
      return wrap(
        `<div style="font-size:1.6em;padding:1.2em 8% 0;">${labelHtml}${titleHtml}</div>${frame}`,
        'display:flex;flex-direction:column;justify-content:flex-start;'
      );
    }
    case 'side-strip': {
      // Vertical image strip down the left; title block on the right.
      const stripW = Math.round(W * Math.min(0.5, Math.max(0.3, size)));
      const strip = `<img src="${imageSrc}" alt="" width="${stripW}" height="${H}" style="${imgStyle({ ...e, radius: 0, border: { width: 0 } }, `width:${stripW}px;height:${H}px`)}" />`;
      const text = `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:0 8%;font-size:1.6em;text-align:left;">${labelHtml}${titleHtml}</div>`;
      return wrap(`${strip}${text}`, 'display:flex;align-items:stretch;padding:0;overflow:hidden;');
    }
    case 'polaroid': {
      // Instant-photo look: thick white border, extra at the bottom, slight tilt.
      const pW = Math.round(W * Math.min(0.7, Math.max(0.4, size + 0.1)));
      const pH = Math.round(pW * 0.8);
      const card = `<div style="display:inline-block;background:#fff;padding:12px 12px 40px;box-shadow:0 10px 26px rgba(0,0,0,0.22);transform:rotate(-2.5deg);margin:1.4em auto 0;">`
        + `<img src="${imageSrc}" alt="" width="${pW}" height="${pH}" style="${imgStyle({ ...e, radius: 0, shadow: false, border: { width: 0 } }, `width:${pW}px;height:${pH}px`)}" />`
        + `</div>`;
      return wrap(
        `<div style="font-size:1.6em;padding:1.2em 8% 0;">${labelHtml}${titleHtml}</div>${card}`,
        'display:flex;flex-direction:column;justify-content:flex-start;'
      );
    }
    case 'numeral': {
      // Oversized chapter number as a graphic element beside the title, image below.
      const num = (label.match(/\d+/) || [''])[0];
      const imgW = Math.round(W * 0.82);
      const imgH = Math.round(H * Math.min(0.42, Math.max(0.2, size)));
      const head = `<div style="display:flex;align-items:center;justify-content:center;gap:0.35em;padding:1em 6% 0;">`
        + (num ? `<div style="font-size:4.2em;font-weight:800;line-height:0.8;color:#e5e7eb;">${num}</div>` : '')
        + `<div style="text-align:left;font-size:1.5em;">${titleHtml}</div></div>`;
      const img = `<img src="${imageSrc}" alt="" width="${imgW}" height="${imgH}" style="${imgStyle(e, `width:${imgW}px;height:${imgH}px;margin:0.8em auto 0`)}" />`;
      return wrap(`${head}${img}`, 'display:flex;flex-direction:column;justify-content:flex-start;');
    }
    case 'title-top':
    default: {
      const imgW = Math.round(W * Math.min(0.9, Math.max(0.3, size + 0.35)));
      const imgH = Math.round(H * Math.min(0.55, Math.max(0.2, size)));
      const img = `<img src="${imageSrc}" alt="" width="${imgW}" height="${imgH}" style="${imgStyle(e, `width:${imgW}px;height:${imgH}px;margin:1em auto 0`)}" />`;
      return wrap(
        `<div style="font-size:1.6em;padding:1.2em 8% 0;">${labelHtml}${titleHtml}</div>${img}`,
        'display:flex;flex-direction:column;justify-content:flex-start;'
      );
    }
  }
};
