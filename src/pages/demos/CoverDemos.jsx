import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { buildChapterCoverHtml, COVER_LAYOUTS, DEFAULT_COVER_EFFECTS } from '../../utils/chapterCover';
import { sampleLandscape, sampleLandscape2, samplePortrait } from './sampleImage';
import './CoverDemos.css';

// Page formats → aspect ratio (width/height) for the thumbnail frame.
const FORMATS = {
  a5:  { label: 'A5 (148×210)', ratio: 148 / 210 },
  '6x9': { label: '6×9 pulg.', ratio: 6 / 9 },
};

// Base thumbnail height in px; width derived from the format ratio.
const THUMB_H = 460;

export default function CoverDemos() {
  const [effects, setEffects] = useState(DEFAULT_COVER_EFFECTS);
  const [format, setFormat] = useState('a5');
  const [chosen, setChosen] = useState(null);

  const ratio = FORMATS[format].ratio;
  const thumbW = Math.round(THUMB_H * ratio);
  const dims = { contentWidth: thumbW, contentHeight: THUMB_H };

  const set = (patch) => setEffects((e) => ({ ...e, ...patch }));
  const setBorder = (patch) => setEffects((e) => ({ ...e, border: { ...e.border, ...patch } }));

  const covers = useMemo(() => COVER_LAYOUTS.map((l) => ({
    ...l,
    html: buildChapterCoverHtml({
      layout: l.id,
      label: 'CAPÍTULO 3',
      title: 'El Espíritu Santo',
      // Portrait art reads better for round/vertical layouts.
      imageSrc: (l.id === 'medallion' || l.id === 'side-strip') ? samplePortrait : sampleLandscape,
      imageSrc2: sampleLandscape2, // diptych's second image
      effects,
      dims,
    }),
  })), [effects, dims.contentWidth, dims.contentHeight]);

  return (
    <div className="cd-page">
      <header className="cd-header">
        <div>
          <h1 className="cd-title">Portadas de capítulo</h1>
          <p className="cd-sub">Vista previa de los layouts de portada con imagen. Ajusta los efectos y velos en vivo.</p>
        </div>
        <Link to="/app" className="cd-back">← Volver al editor</Link>
      </header>

      <div className="cd-body">
        {/* Controls */}
        <aside className="cd-controls" aria-label="Ajustes de portada">
          <div className="cd-group">
            <span className="cd-group-title">Formato</span>
            <div className="cd-seg">
              {Object.entries(FORMATS).map(([id, f]) => (
                <button key={id} type="button"
                  className={`cd-seg-btn ${format === id ? 'active' : ''}`}
                  onClick={() => setFormat(id)}>{f.label}</button>
              ))}
            </div>
          </div>

          <div className="cd-group">
            <span className="cd-group-title">Tamaño de la foto</span>
            <input type="range" min="0.2" max="0.9" step="0.05"
              value={effects.size}
              onChange={(e) => set({ size: parseFloat(e.target.value) })}
              aria-label="Tamaño de la foto" />
            <span className="cd-val">{Math.round(effects.size * 100)}%</span>
          </div>

          <div className="cd-group">
            <span className="cd-group-title">Esquinas redondeadas</span>
            <input type="range" min="0" max="40" step="2"
              value={effects.radius}
              onChange={(e) => set({ radius: parseInt(e.target.value, 10) })}
              aria-label="Esquinas redondeadas" />
            <span className="cd-val">{effects.radius}px</span>
          </div>

          <label className="cd-check">
            <input type="checkbox" checked={effects.shadow}
              onChange={(e) => set({ shadow: e.target.checked })} />
            <span>Sombra</span>
          </label>

          <label className="cd-check">
            <input type="checkbox" checked={effects.circle}
              onChange={(e) => set({ circle: e.target.checked })} />
            <span>Recorte circular (medallón)</span>
          </label>

          <div className="cd-group">
            <span className="cd-group-title">Borde</span>
            <div className="cd-row">
              <input type="range" min="0" max="12" step="1"
                value={effects.border.width}
                onChange={(e) => setBorder({ width: parseInt(e.target.value, 10) })}
                aria-label="Grosor del borde" />
              <input type="color" value={effects.border.color}
                onChange={(e) => setBorder({ color: e.target.value })}
                aria-label="Color del borde" />
            </div>
            <span className="cd-val">{effects.border.width}px</span>
          </div>

          <div className="cd-group">
            <span className="cd-group-title">Filtro</span>
            <div className="cd-seg cd-seg-wrap">
              {[
                ['none', 'Ninguno'], ['grayscale', 'B/N'],
                ['sepia', 'Sepia'], ['opacity', 'Suave'],
              ].map(([id, label]) => (
                <button key={id} type="button"
                  className={`cd-seg-btn ${effects.filter === id ? 'active' : ''}`}
                  onClick={() => set({ filter: id })}>{label}</button>
              ))}
            </div>
          </div>

          <button type="button" className="cd-reset"
            onClick={() => setEffects(DEFAULT_COVER_EFFECTS)}>Restablecer</button>

          {chosen && <p className="cd-chosen">Elegido: <strong>{chosen}</strong> (la conexión al capítulo llega en la siguiente fase).</p>}
        </aside>

        {/* Gallery */}
        <div className="cd-gallery">
          {covers.map((c) => (
            <figure key={c.id} className="cd-card">
              <div className="cd-frame" style={{ width: `${thumbW}px`, height: `${THUMB_H}px` }}>
                <div className="cd-cover" dangerouslySetInnerHTML={{ __html: c.html }} />
              </div>
              <figcaption className="cd-cap">
                <div>
                  <div className="cd-cap-name">{c.name}</div>
                  <div className="cd-cap-desc">{c.desc}</div>
                </div>
                <button type="button" className={`cd-use ${chosen === c.id ? 'active' : ''}`}
                  onClick={() => setChosen(c.id)}>
                  {chosen === c.id ? '✓ Elegido' : 'Usar este'}
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}
