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
  { id: 'photo-top', name: 'Foto arriba + título', desc: 'Foto protagonista, título debajo.' },
  { id: 'full-bleed', name: 'Foto a página completa', desc: 'Foto a sangre con título superpuesto.' },
  { id: 'medallion', name: 'Medallón sobre el título', desc: 'Foto pequeña (circular opcional) sobre el título.' },
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
export const buildChapterCoverHtml = ({ layout, title = '', label = '', imageSrc = '', effects, dims }) => {
  const W = dims?.contentWidth || 300;
  const H = dims?.contentHeight || 480;
  const e = { ...DEFAULT_COVER_EFFECTS, ...(effects || {}) };
  const size = Math.min(1, Math.max(0.1, e.size ?? 0.5));

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
