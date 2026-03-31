import { memo, useCallback, useMemo, useEffect, useState } from 'react';
import useEditorStore from '../../store/useEditorStore';
import { getLevelStyle, normalizeTitle, computeTOCNumbers } from '../../utils/generateFrontMatter';
import { generateRecommendedTOCConfig, detectTitleNormalization } from '../../utils/extractTOC';
import { KDP_STANDARDS } from '../../utils/kdpStandards';
import './TOCPanel.css';

const PX_PER_MM = 3.7795;

const LEVEL_COLORS = ['#1e40af', '#2563eb', '#3b82f6', '#60a5fa', '#7c3aed', '#6b7280'];

// Each template uses a custom render function for the preview card
const TEMPLATES = [
  {
    id: 'classic',
    name: 'Clásico',
    desc: 'Jerarquía tradicional — H1 bold con dots y número a la derecha',
    renderPreview: (active) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.78em' }}>
        {[
          { label: 'Capítulo I', pg: '1', bold: true, indent: 0 },
          { label: 'Sección 1.1', pg: '3', bold: false, indent: 8 },
          { label: 'Apartado', pg: '5', bold: false, indent: 16 },
        ].map((row, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', paddingLeft: row.indent, color: active ? '#1e40af' : '#374151', opacity: active ? 1 : (i === 0 ? 0.9 : 0.55) }}>
            <span style={{ fontWeight: row.bold ? 'bold' : 'normal', flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{row.label}</span>
            <span style={{ color: '#ccc', margin: '0 2px', fontSize: '0.8em' }}>. . .</span>
            <span style={{ fontWeight: 'normal', color: active ? '#3b82f6' : '#888', fontSize: '0.85em' }}>{row.pg}</span>
          </div>
        ))}
      </div>
    )
  },
  {
    id: 'modern',
    name: 'Moderno',
    desc: 'H1 con barra lateral izquierda en versalitas, sin dots — estilo contemporáneo',
    renderPreview: (active) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.78em' }}>
        {[
          { label: 'CAPÍTULO I', pg: '1', isH1: true },
          { label: 'Sección 1.1', pg: '3', isH1: false },
          { label: 'Apartado', pg: '5', isH1: false, indent: 12 },
        ].map((row, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', paddingLeft: row.indent || 0, borderLeft: row.isH1 ? `2px solid ${active ? '#1e40af' : '#555'}` : 'none', paddingLeft: row.isH1 ? 6 : (row.indent || 0), color: active ? '#1e40af' : '#374151', opacity: active ? 1 : (i === 0 ? 0.9 : 0.55) }}>
            <span style={{ fontWeight: row.isH1 ? 'bold' : 'normal', letterSpacing: row.isH1 ? '0.08em' : 'normal', fontSize: row.isH1 ? '0.88em' : '0.92em', flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', textTransform: row.isH1 ? 'uppercase' : 'none' }}>{row.label}</span>
            <span style={{ fontWeight: row.isH1 ? 'bold' : 'normal', color: row.isH1 ? (active ? '#1e40af' : '#333') : (active ? '#3b82f6' : '#888'), fontSize: '0.85em' }}>{row.pg}</span>
          </div>
        ))}
      </div>
    )
  },
  {
    id: 'minimal',
    name: 'Minimalista',
    desc: 'Mismo tamaño, jerarquía solo por sangría — guión em, sin dots',
    renderPreview: (active) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.78em' }}>
        {[
          { label: 'Capítulo I', pg: '1', indent: 0, weight: '500' },
          { label: 'Sección 1.1', pg: '3', indent: 14, weight: 'normal' },
          { label: 'Apartado 1.1.1', pg: '5', indent: 26, weight: 'normal' },
        ].map((row, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', paddingLeft: row.indent, color: active ? '#1e40af' : '#374151', opacity: active ? 1 : (i === 0 ? 0.9 : 0.55) }}>
            <span style={{ fontWeight: row.weight, flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{row.label}</span>
            <span style={{ color: '#ccc', margin: '0 3px' }}> —</span>
            <span style={{ color: active ? '#3b82f6' : '#888', fontSize: '0.85em' }}>{row.pg}</span>
          </div>
        ))}
      </div>
    )
  },
  {
    id: 'editorial',
    name: 'Editorial',
    desc: 'H1 uppercase con número superíndice + línea divisoria — H2/H3 con dots',
    renderPreview: (active) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.78em' }}>
        {[
          { label: 'CAPÍTULO I', pg: '1' },
          { label: 'CAPÍTULO II', pg: '5' },
        ].map((row, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', borderBottom: `0.5px solid ${active ? '#93c5fd' : '#e5e7eb'}`, paddingBottom: '1px', marginBottom: '1px', color: active ? '#1e40af' : '#374151', opacity: active ? 1 : 0.9 }}>
            <span style={{ flex: 1, fontWeight: 'bold', letterSpacing: '0.10em', textTransform: 'uppercase', fontSize: '0.84em', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{row.label}</span>
            <span style={{ fontSize: '0.72em', color: active ? '#60a5fa' : '#aaa', whiteSpace: 'nowrap', paddingTop: '1px' }}>{row.pg}</span>
          </div>
        ))}
        {[
          { label: 'Sección 1.1', pg: '3', indent: 0 },
          { label: 'Apartado', pg: '5', indent: 10 },
        ].map((row, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', paddingLeft: row.indent, color: active ? '#1e40af' : '#374151', opacity: active ? 1 : 0.55 }}>
            <span style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{row.label}</span>
            <span style={{ color: '#ccc', margin: '0 2px', fontSize: '0.8em' }}>. . .</span>
            <span style={{ color: active ? '#3b82f6' : '#888', fontSize: '0.85em' }}>{row.pg}</span>
          </div>
        ))}
      </div>
    )
  }
];

const SEPARATORS = [
  { id: 'dots',       label: '. . . .', title: 'Puntos espaciados' },
  { id: 'dash',       label: '– – – –', title: 'Guiones espaciados' },
  { id: 'line',       label: '———————', title: 'Línea continua' },
  { id: 'dots-tight', label: '. . . .', title: 'Puntos densos' },
  { id: 'asterisk',   label: '* * * *', title: 'Asteriscos' },
  { id: 'none',       label: 'Sin sep.', title: 'Sin separador' },
];

const TABS = [
  { id: 'structure',  label: 'Estructura' },
  { id: 'appearance', label: 'Apariencia' },
  { id: 'text',       label: 'Texto' },
];

const ZOOM_STEP = 0.25;
const ZOOM_MIN  = 0.5;
const ZOOM_MAX  = 4.0;

const FONT_OPTIONS = [
  { value: '',                  label: 'Heredar del libro' },
  // — Serif —
  { value: 'Georgia',           label: 'Georgia' },
  { value: 'Times New Roman',   label: 'Times New Roman' },
  { value: 'Garamond',          label: 'Garamond' },
  { value: 'Merriweather',      label: 'Merriweather' },
  { value: 'Palatino',          label: 'Palatino' },
  { value: 'Book Antiqua',      label: 'Book Antiqua' },
  { value: 'Cambria',           label: 'Cambria' },
  { value: 'Baskerville',       label: 'Baskerville' },
  // — Sans-serif —
  { value: 'Arial',             label: 'Arial' },
  { value: 'Helvetica',         label: 'Helvetica' },
  { value: 'Trebuchet MS',      label: 'Trebuchet MS' },
  { value: 'Verdana',           label: 'Verdana' },
  { value: 'Calibri',           label: 'Calibri' },
  { value: 'Segoe UI',          label: 'Segoe UI' },
  { value: 'Tahoma',            label: 'Tahoma' },
  // — Mono —
  { value: 'Courier New',       label: 'Courier New' },
  { value: 'Consolas',          label: 'Consolas' },
];

const TOCPanel = memo(function TOCPanel() {
  const tocData         = useEditorStore(s => s.tocData);
  const tocConfig       = useEditorStore(s => s.tocConfig);
  const setTOCConfig    = useEditorStore(s => s.setTOCConfig);
  const setShowTOCPanel = useEditorStore(s => s.setShowTOCPanel);
  const frontMatterPages = useEditorStore(s => s.frontMatterPages) || [];
  const layoutDims      = useEditorStore(s => s.layoutDims);
  const config          = useEditorStore(s => s.config);

  const [activeTab, setActiveTab] = useState('structure');
  const [tocPageIdx, setTocPageIdx] = useState(0);
  const [zoom, setZoom] = useState(1.5);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setShowTOCPanel(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setShowTOCPanel]);

  const handleOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget) setShowTOCPanel(false);
  }, [setShowTOCPanel]);

  // ── Config helpers ─────────────────────────────────────────────────────────
  const patchTOC = useCallback((patch) => {
    setTOCConfig({
      includeLevels: [1, 2], separator: 'dots', template: 'classic',
      digitalLinks: false, levelOverrides: {},
      ...(tocConfig || {}), ...patch, autoGenerated: false
    });
  }, [tocConfig, setTOCConfig]);

  const handleLevelToggle = useCallback((level) => {
    const current = tocConfig?.includeLevels || [];
    const next = current.includes(level)
      ? current.filter(l => l !== level)
      : [...current, level].sort((a, b) => a - b);
    patchTOC({ includeLevels: next });
  }, [tocConfig, patchTOC]);

  const handleSuggest = useCallback(() => {
    if (!tocData || tocData.length === 0) return;
    const rec = generateRecommendedTOCConfig(tocData);
    patchTOC({ includeLevels: rec.includeLevels, template: rec.template, autoGenerated: true });
  }, [tocData, patchTOC]);

  const handleAutoText = useCallback(() => {
    if (!tocData || tocData.length === 0) return;
    const detected = detectTitleNormalization(tocData);
    patchTOC(detected);
  }, [tocData, patchTOC]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const includeLevels   = tocConfig?.includeLevels || [];
  const currentTemplate = tocConfig?.template || 'classic';
  const currentSep      = tocConfig?.separator || 'dots';
  const digitalLinks    = tocConfig?.digitalLinks || false;
  const levelOverrides  = tocConfig?.levelOverrides || {};
  const totalEntries    = tocData?.length || 0;
  const addNumbering    = tocConfig?.addNumbering;

  // Base print font size in pt — used to show/edit entry sizes in pt
  const basePrintPt = useMemo(() => {
    if (!layoutDims?.baseFontSizePx || !layoutDims?.previewScale) return null;
    return layoutDims.baseFontSizePx * 72 / (layoutDims.previewScale * 96);
  }, [layoutDims]);

  const patchLevelOverride = useCallback((level, patch) => {
    const current = tocConfig?.levelOverrides || {};
    patchTOC({ levelOverrides: { ...current, [level]: { ...(current[level] || {}), ...patch } } });
  }, [tocConfig, patchTOC]);

  const resetLevelOverride = useCallback((level) => {
    const current = { ...(tocConfig?.levelOverrides || {}) };
    delete current[level];
    patchTOC({ levelOverrides: current });
  }, [tocConfig, patchTOC]);

  const existingLevels = useMemo(() => {
    if (!tocData) return [];
    return [...new Set(tocData.map(e => e.level))].sort();
  }, [tocData]);

  const filteredEntries = useMemo(() => {
    if (!tocData || !includeLevels.length) return [];
    return tocData.filter(e => includeLevels.includes(e.level));
  }, [tocData, includeLevels]);

  // ── TOC pages from engine (real render) ────────────────────────────────────
  const tocPages = useMemo(() =>
    frontMatterPages.filter(p => p.isTOCPage),
    [frontMatterPages]
  );

  // Reset page index if it goes out of range when tocPages changes
  useEffect(() => {
    if (tocPageIdx >= tocPages.length && tocPages.length > 0) {
      setTocPageIdx(tocPages.length - 1);
    }
  }, [tocPages.length, tocPageIdx]);

  // Compute page dimensions for the preview frame from layoutDims + config
  const pageStyle = useMemo(() => {
    if (!layoutDims) return null;
    try {
      const pf = KDP_STANDARDS.getPageFormat(config?.pageFormat || 'a5');
      const ps = layoutDims.previewScale;
      const pageWidthPx  = pf.width  * PX_PER_MM * ps;
      const pageHeightPx = pf.height * PX_PER_MM * ps;
      const hMargin = Math.max(6, (pageWidthPx - layoutDims.contentWidth) / 2);
      const vMargin = Math.max(6, (pageHeightPx - layoutDims.contentHeight) / 2);
      return {
        pageWidthPx,
        pageHeightPx,
        paddingH: hMargin,
        paddingV: vMargin,
        fontSize: layoutDims.baseFontSizePx,
        fontFamily: config?.fontFamily || 'Georgia, serif',
        lineHeight: `${layoutDims.lineHeightPx}px`,
        contentHeight: layoutDims.contentHeight,
      };
    } catch {
      return null;
    }
  }, [layoutDims, config]);

  return (
    <div className="toc-overlay" onMouseDown={handleOverlayClick}>
      <div className="toc-dialog">

        {/* Header */}
        <div className="toc-header">
          <div className="toc-header-info">
            <h2 className="toc-title">Tabla de contenidos</h2>
            {totalEntries > 0
              ? <span className="toc-header-count">{totalEntries} encabezados · {filteredEntries.length} visibles</span>
              : <span className="toc-header-count">Sin encabezados en el documento</span>
            }
          </div>
          <button className="toc-close" onClick={() => setShowTOCPanel(false)} title="Cerrar">✕</button>
        </div>

        {/* Two-column main area */}
        <div className="toc-main">

          {/* ── Left column: tabs + options ── */}
          <div className="toc-left-col">

            <div className="toc-tabs">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  className={`toc-tab${activeTab === tab.id ? ' active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="toc-body">

              {/* ── Tab: Estructura ── */}
              {activeTab === 'structure' && (
                <div className="toc-tab-pane">

                  <div className="toc-section">
                    <span className="toc-section-label">Niveles de encabezado</span>
                    <div className="toc-levels-buttons">
                      {(existingLevels.length > 0 ? existingLevels : [1, 2, 3]).map(level => {
                        const active = includeLevels.includes(level);
                        return (
                          <button
                            key={level}
                            className={`toc-level-btn${active ? ' active' : ''}`}
                            style={active ? { backgroundColor: LEVEL_COLORS[level - 1] || '#3b82f6' } : {}}
                            onClick={() => handleLevelToggle(level)}
                          >
                            H{level}
                          </button>
                        );
                      })}
                      <button
                        className="toc-suggest-btn"
                        onClick={handleSuggest}
                        disabled={totalEntries === 0}
                        title="Seleccionar niveles óptimos"
                      >
                        Auto
                      </button>
                    </div>
                    <p className="toc-hint-text">Activa los niveles de título que aparecerán en la tabla.</p>
                  </div>

                  <div className="toc-section">
                    <span className="toc-section-label">Separador</span>
                    <div className="toc-sep-buttons">
                      {SEPARATORS.map(sep => (
                        <button
                          key={sep.id}
                          className={`toc-sep-btn${currentSep === sep.id ? ' active' : ''}`}
                          onClick={() => patchTOC({ separator: sep.id })}
                          title={sep.title}
                        >
                          {sep.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="toc-section">
                    <span className="toc-section-label">Título de la página</span>
                    <input
                      className="toc-input"
                      type="text"
                      value={tocConfig?.title || 'Índice'}
                      onChange={(e) => patchTOC({ title: e.target.value })}
                      placeholder="Índice"
                    />
                    <div className="toc-level-row-controls" style={{ marginTop: '6px' }}>
                      <input
                        className="toc-size-input"
                        type="number"
                        min="60"
                        max="200"
                        value={Math.round((parseFloat(tocConfig?.titleFontSize || '1.1')) * 100)}
                        onChange={(e) => patchTOC({ titleFontSize: `${(Number(e.target.value) / 100).toFixed(2)}em` })}
                        title="Tamaño del título en porcentaje"
                      />
                      <span className="toc-size-unit">%</span>
                      {basePrintPt && (
                        <>
                          <span className="toc-size-sep">·</span>
                          <input
                            className="toc-size-input toc-pt-input"
                            type="number"
                            min="5"
                            max="36"
                            step="0.1"
                            value={((parseFloat(tocConfig?.titleFontSize || '1.1')) * basePrintPt).toFixed(1)}
                            onChange={(e) => {
                              const pt = parseFloat(e.target.value);
                              if (!isNaN(pt) && pt > 0) patchTOC({ titleFontSize: `${(pt / basePrintPt).toFixed(3)}em` });
                            }}
                            title="Tamaño del título en puntos tipográficos"
                          />
                          <span className="toc-size-unit">pt</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="toc-section">
                    <span className="toc-section-label">Numeración de página</span>
                    <label className="toc-checkbox-row" style={{ paddingLeft: 0 }}>
                      <input
                        type="checkbox"
                        checked={tocConfig?.showFolio !== false}
                        onChange={() => patchTOC({ showFolio: tocConfig?.showFolio === false ? true : false })}
                      />
                      <span className="toc-checkbox-label">
                        Mostrar folio en preliminares
                      </span>
                    </label>
                    {tocConfig?.showFolio !== false && (
                      <div className="toc-row" style={{ marginTop: 6 }}>
                        <span className="toc-row-label">Caso</span>
                        <select
                          value={tocConfig?.folioCase ?? 'lower'}
                          onChange={e => patchTOC({ folioCase: e.target.value })}
                          className="toc-select"
                        >
                          <option value="lower">minúsculas (i, ii, iii…)</option>
                          <option value="upper">MAYÚSCULAS (I, II, III…)</option>
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="toc-section">
                    <label className="toc-checkbox-row" style={{ paddingLeft: 0 }}>
                      <input
                        type="checkbox"
                        checked={digitalLinks}
                        onChange={() => patchTOC({ digitalLinks: !digitalLinks })}
                      />
                      <span className="toc-checkbox-label">
                        Vínculos directos
                        <span className="toc-badge">HTML / EPUB</span>
                      </span>
                    </label>
                    {digitalLinks && (
                      <p className="toc-hint-text">
                        Cada entrada será un enlace al encabezado. Ideal para EPUB o HTML.
                      </p>
                    )}
                  </div>

                </div>
              )}

              {/* ── Tab: Apariencia ── */}
              {activeTab === 'appearance' && (
                <div className="toc-tab-pane">

                  <div className="toc-section">
                    <span className="toc-section-label">Plantilla</span>
                    <div className="toc-templates">
                      {TEMPLATES.map(tpl => (
                        <button
                          key={tpl.id}
                          className={`toc-template-card${currentTemplate === tpl.id ? ' active' : ''}`}
                          onClick={() => patchTOC({ template: tpl.id })}
                          title={tpl.desc}
                        >
                          <span className="toc-template-name">{tpl.name}</span>
                          <div className="toc-template-preview">
                            {tpl.renderPreview(currentTemplate === tpl.id)}
                          </div>
                        </button>
                      ))}
                    </div>
                    <span className="toc-levels-hint" style={{ marginTop: '4px' }}>
                      {TEMPLATES.find(t => t.id === currentTemplate)?.desc}
                    </span>
                  </div>

                  {includeLevels.length > 0 && (
                    <div className="toc-section">
                      <span className="toc-section-label">Tipografía por nivel</span>
                      <div className="toc-level-rows">
                        {includeLevels.map(level => {
                          const ov = levelOverrides[level] || {};
                          const currentFont = ov.fontFamily || '';
                          return (
                            <div key={level} className="toc-level-row">
                              <span
                                className="toc-level-row-badge"
                                style={{ backgroundColor: LEVEL_COLORS[level - 1] || '#6b7280' }}
                              >
                                H{level}
                              </span>
                              <div className="toc-level-row-controls" style={{ flex: 1 }}>
                                <select
                                  className="toc-font-select"
                                  value={currentFont}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '') {
                                      // remove fontFamily from override, keep rest
                                      const cur = { ...(tocConfig?.levelOverrides?.[level] || {}) };
                                      delete cur.fontFamily;
                                      const allOv = { ...(tocConfig?.levelOverrides || {}), [level]: cur };
                                      if (Object.keys(cur).length === 0) delete allOv[level];
                                      patchTOC({ levelOverrides: allOv });
                                    } else {
                                      patchLevelOverride(level, { fontFamily: val });
                                    }
                                  }}
                                  style={{ fontFamily: currentFont || 'inherit', flex: 1, fontSize: '0.78em' }}
                                >
                                  {FONT_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value} style={{ fontFamily: opt.value || 'inherit' }}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {includeLevels.length > 0 && (
                    <div className="toc-section">
                      <span className="toc-section-label">Jerarquía de tamaño</span>
                      <div className="toc-level-rows">
                        {includeLevels.map(level => {
                          const base = getLevelStyle(currentTemplate, level);
                          const ov   = levelOverrides[level] || {};
                          const autoH3 = level === 3 ? tocConfig?.autoH3FontSize : undefined;
                          const effectiveFontSize   = ov.fontSize   || autoH3 || base.fontSize;
                          const effectiveFontWeight = ov.fontWeight || base.fontWeight;
                          const pct = Math.round(parseFloat(effectiveFontSize) * 100);
                          const hasUserOverride = ov.fontSize !== undefined || ov.fontWeight !== undefined;
                          const isAutoH3 = level === 3 && !ov.fontSize && !!autoH3;
                          return (
                            <div key={level} className="toc-level-row">
                              <span
                                className="toc-level-row-badge"
                                style={{ backgroundColor: LEVEL_COLORS[level - 1] || '#6b7280' }}
                              >
                                H{level}
                              </span>
                              <div className="toc-level-row-controls">
                                <input
                                  className="toc-size-input"
                                  type="number"
                                  min="50"
                                  max="150"
                                  value={pct}
                                  onChange={(e) => patchLevelOverride(level, { fontSize: `${(Number(e.target.value) / 100).toFixed(2)}em` })}
                                  title="Tamaño en porcentaje"
                                />
                                <span className="toc-size-unit">%</span>
                                {basePrintPt && (
                                  <>
                                    <span className="toc-size-sep">·</span>
                                    <input
                                      className="toc-size-input toc-pt-input"
                                      type="number"
                                      min="4"
                                      max="28"
                                      step="0.1"
                                      value={(parseFloat(effectiveFontSize) * basePrintPt).toFixed(1)}
                                      onChange={(e) => {
                                        const pt = parseFloat(e.target.value);
                                        if (!isNaN(pt) && pt > 0) {
                                          patchLevelOverride(level, { fontSize: `${(pt / basePrintPt).toFixed(3)}em` });
                                        }
                                      }}
                                      title="Tamaño en puntos tipográficos"
                                    />
                                    <span className="toc-size-unit">pt</span>
                                  </>
                                )}
                                {isAutoH3 && (
                                  <span className="toc-auto-badge" title="Ajustado automáticamente">auto</span>
                                )}
                                <button
                                  className={`toc-bold-btn${effectiveFontWeight === 'bold' ? ' active' : ''}`}
                                  onClick={() => patchLevelOverride(level, { fontWeight: effectiveFontWeight === 'bold' ? 'normal' : 'bold' })}
                                  title="Negrita"
                                >
                                  B
                                </button>
                              </div>
                              {hasUserOverride && (
                                <button
                                  className="toc-reset-btn"
                                  onClick={() => resetLevelOverride(level)}
                                  title="Restaurar plantilla"
                                >
                                  ↺
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                </div>
              )}

              {/* ── Tab: Texto ── */}
              {activeTab === 'text' && (
                <div className="toc-tab-pane">

                  <div className="toc-section">
                    <span className="toc-section-label">Numeración automática</span>
                    <div className="toc-sep-buttons">
                      {[
                        { id: 'none',    label: 'Sin número' },
                        { id: 'decimal', label: '1. / 1.1.' },
                        { id: 'roman',   label: 'I. / I.1.' },
                      ].map(opt => (
                        <button
                          key={opt.id}
                          className={`toc-sep-btn${(addNumbering || 'none') === opt.id ? ' active' : ''}`}
                          onClick={() => patchTOC({ addNumbering: opt.id === 'none' ? undefined : opt.id })}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <p className="toc-hint-text">
                      {addNumbering && addNumbering !== 'none'
                        ? 'Los prefijos numéricos originales se reemplazan por la numeración automática.'
                        : 'Añade numeración jerárquica generada automáticamente (1., 1.1., 1.1.1…).'}
                    </p>
                  </div>

                  {(!addNumbering || addNumbering === 'none') && (
                    <div className="toc-section">
                      <span className="toc-section-label">Prefijos numéricos</span>
                      <label className="toc-checkbox-row" style={{ paddingLeft: 0 }}>
                        <input
                          type="checkbox"
                          checked={!!tocConfig?.stripLeadingNumber}
                          onChange={() => patchTOC({ stripLeadingNumber: !tocConfig?.stripLeadingNumber })}
                        />
                        <span className="toc-checkbox-label">Eliminar numeración inicial</span>
                      </label>
                      <p className="toc-hint-text">
                        Quita prefijos como "Capítulo 1 –", "I.", "1." del inicio del título.
                      </p>
                    </div>
                  )}

                  <div className="toc-section">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                      <span className="toc-section-label" style={{ borderBottom: 'none', paddingBottom: 0 }}>Capitalización</span>
                      <button
                        className="toc-suggest-btn"
                        onClick={handleAutoText}
                        disabled={totalEntries === 0}
                        title="Detectar y aplicar la normalización más adecuada"
                      >
                        Auto detectar
                      </button>
                    </div>
                    <div className="toc-sep-buttons">
                      {[
                        { id: 'none',     label: 'Sin cambio' },
                        { id: 'sentence', label: 'Oración' },
                        { id: 'title',    label: 'Título' },
                        { id: 'upper',    label: 'MAYÚS' },
                      ].map(opt => (
                        <button
                          key={opt.id}
                          className={`toc-sep-btn${(tocConfig?.titleTransform || 'none') === opt.id ? ' active' : ''}`}
                          onClick={() => patchTOC({ titleTransform: opt.id === 'none' ? undefined : opt.id })}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                </div>
              )}

            </div>
          </div>

          {/* ── Right column: engine-rendered TOC page ── */}
          <div className="toc-right-col">

            {/* Toolbar: label + zoom controls + page navigation */}
            <div className="toc-right-toolbar">
              <span className="toc-right-toolbar-label">
                {tocPages.length > 0 ? 'Motor de paginación' : 'Vista previa'}
                {tocPages.length > 1 && ` · ${tocPageIdx + 1}/${tocPages.length}`}
              </span>
              <div className="toc-zoom-controls">
                <button
                  className="toc-zoom-btn"
                  onClick={() => setZoom(z => Math.max(ZOOM_MIN, +((z - ZOOM_STEP).toFixed(2))))}
                  disabled={zoom <= ZOOM_MIN}
                  title="Reducir"
                >−</button>
                <span className="toc-zoom-value">{Math.round(zoom * 100)}%</span>
                <button
                  className="toc-zoom-btn"
                  onClick={() => setZoom(z => Math.min(ZOOM_MAX, +((z + ZOOM_STEP).toFixed(2))))}
                  disabled={zoom >= ZOOM_MAX}
                  title="Ampliar"
                >+</button>
                <button
                  className="toc-zoom-btn toc-zoom-reset"
                  onClick={() => setZoom(1.5)}
                  title="Restablecer zoom"
                >↺</button>
              </div>
            </div>

            {/* Scrollable area with the page */}
            <div className="toc-right-scroll">
              {tocPages.length > 0 && pageStyle ? (
                <div
                  className="toc-page-zoom-wrapper"
                  style={{
                    width:  `${pageStyle.pageWidthPx  * zoom}px`,
                    height: `${pageStyle.pageHeightPx * zoom}px`,
                  }}
                >
                  <div
                    className="toc-engine-page"
                    style={{
                      position:    'absolute',
                      top: 0, left: 0,
                      width:      `${pageStyle.pageWidthPx}px`,
                      height:     `${pageStyle.pageHeightPx}px`,
                      transform:  `scale(${zoom})`,
                      transformOrigin: 'top left',
                      padding:    `${pageStyle.paddingV}px ${pageStyle.paddingH}px`,
                      fontSize:   `${pageStyle.fontSize}px`,
                      fontFamily:  pageStyle.fontFamily,
                      lineHeight:  pageStyle.lineHeight,
                      textAlign:  'left',
                      hyphens:     'none',
                      wordBreak:   'break-word',
                      overflowWrap: 'break-word',
                    }}
                  >
                    <div
                      style={{ height: `${pageStyle.contentHeight}px`, overflow: 'hidden' }}
                      dangerouslySetInnerHTML={{ __html: tocPages[tocPageIdx]?.html || '' }}
                    />
                    {/* Folio (page number) for TOC pages */}
                    {(() => {
                      const pg = tocPages[tocPageIdx];
                      const showFolio = tocConfig?.showFolio !== false;
                      const showNums = config?.showPageNumbers;
                      if (!showNums || !showFolio || !pg?.displayPageNumber) return null;
                      const pos = config?.pageNumberPos || 'bottom';
                      const align = config?.pageNumberAlign || 'center';
                      const margin = config?.pageNumberMargin ?? 12;
                      const fs = pageStyle.fontSize * 0.8;
                      let hStyle = {};
                      if (align === 'paragraph-edge') hStyle = { left: `${pageStyle.paddingH}px` };
                      else if (align === 'paragraph')  hStyle = { left: `${pageStyle.paddingH + 12}px` };
                      else if (align === 'outer')      hStyle = { left: '12px' };
                      else hStyle = { left: '50%', transform: 'translateX(-50%)' };
                      return (
                        <span style={{
                          position: 'absolute',
                          ...(pos === 'top' ? { top: `${margin}px` } : { bottom: `${margin}px` }),
                          ...hStyle,
                          fontSize: `${fs}px`,
                        }}>
                          {pg.displayPageNumber}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <div className="toc-engine-placeholder">
                  {layoutDims
                    ? <>La previsualización se actualizará<br />al confirmar los cambios.</>
                    : <>Abre la previsualización del libro<br />para ver el índice aquí.</>
                  }
                </div>
              )}
            </div>

            {/* Multi-page navigation */}
            {tocPages.length > 1 && (
              <div className="toc-right-nav">
                <button
                  className="toc-nav-btn"
                  onClick={() => setTocPageIdx(i => Math.max(0, i - 1))}
                  disabled={tocPageIdx === 0}
                >
                  ‹ Anterior
                </button>
                <button
                  className="toc-nav-btn"
                  onClick={() => setTocPageIdx(i => Math.min(tocPages.length - 1, i + 1))}
                  disabled={tocPageIdx === tocPages.length - 1}
                >
                  Siguiente ›
                </button>
              </div>
            )}

          </div>

        </div>

        <div className="toc-footer">
          <button className="toc-btn toc-btn-primary" onClick={() => setShowTOCPanel(false)}>
            Listo
          </button>
        </div>

      </div>
    </div>
  );
});

export default TOCPanel;
