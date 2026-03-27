import { memo, useState, useCallback } from 'react';
import useEditorStore from '../../store/useEditorStore';
import './PreviewDebugPanel.css';

const PreviewDebugPanel = memo(function PreviewDebugPanel({ 
  config, 
  onChange,
  onClose 
}) {
  const debugConfig = config?.previewDebug || {
    enabled: false,
    elements: { headers: true, paragraphs: true, quotes: true },
    spacing: { indent: true, paragraphGap: true },
    pageBreaks: { showEndOfPage: true, showContinued: true },
    dimensions: { margins: false, gutter: false, pageSize: false }
  };

  const updateDebug = (path, value) => {
    const keys = path.split('.');
    const newConfig = { ...debugConfig };
    let current = newConfig;
    
    for (let i = 0; i < keys.length - 1; i++) {
      current[keys[i]] = { ...current[keys[i]] };
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
    
    onChange({ previewDebug: newConfig });
  };

  const toggleEnabled = () => {
    const newEnabled = !debugConfig.enabled;
    if (newEnabled) {
      onChange({ 
        previewDebug: { 
          ...debugConfig, 
          enabled: true,
          elements: { headers: true, paragraphs: true, quotes: true },
          spacing: { indent: true, paragraphGap: true },
          pageBreaks: { showEndOfPage: true, showContinued: true }
        } 
      });
    } else {
      onChange({ previewDebug: { ...debugConfig, enabled: false } });
    }
  };

  const colorLegend = [
    { label: 'H1', color: '#e74c3c' },
    { label: 'H2', color: '#e67e22' },
    { label: 'H3', color: '#f1c40f' },
    { label: 'H4-6', color: '#27ae60' },
    { label: 'P', color: '#3498db' },
    { label: 'Q', color: '#9b59b6' },
    { label: 'SANG', color: '#00bcd4' },
    { label: 'ESP', color: '#8bc34a' },
    { label: 'PAGE', color: '#34495e' }
  ];

  return (
    <div className="preview-debug-panel">
      <div className="debug-panel-header">
        <span className="debug-panel-title">Modo Developer</span>
        <button className="debug-panel-close" onClick={onClose}>✕</button>
      </div>

      <div className="debug-panel-content">
        <label className="debug-main-toggle">
          <input
            type="checkbox"
            checked={debugConfig.enabled}
            onChange={toggleEnabled}
          />
          <span>Activar modo developer</span>
        </label>

        {debugConfig.enabled && (
          <>
            <div className="debug-section">
              <div className="debug-section-title">
                <input
                  type="checkbox"
                  checked={debugConfig.elements.headers && debugConfig.elements.paragraphs && debugConfig.elements.quotes}
                  onChange={(e) => {
                    updateDebug('elements.headers', e.target.checked);
                    updateDebug('elements.paragraphs', e.target.checked);
                    updateDebug('elements.quotes', e.target.checked);
                  }}
                />
                <span>Identificar elementos</span>
              </div>
              
              <div className="debug-options">
                <label>
                  <input
                    type="checkbox"
                    checked={debugConfig.elements.headers}
                    onChange={(e) => updateDebug('elements.headers', e.target.checked)}
                  />
                  Encabezados (H1, H2, H3, H4-H6)
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={debugConfig.elements.paragraphs}
                    onChange={(e) => updateDebug('elements.paragraphs', e.target.checked)}
                  />
                  Párrafos (P)
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={debugConfig.elements.quotes}
                    onChange={(e) => updateDebug('elements.quotes', e.target.checked)}
                  />
                  Citas (Q)
                </label>
              </div>
            </div>

            <div className="debug-section">
              <div className="debug-section-title">
                <input
                  type="checkbox"
                  checked={debugConfig.spacing.indent && debugConfig.spacing.paragraphGap}
                  onChange={(e) => {
                    updateDebug('spacing.indent', e.target.checked);
                    updateDebug('spacing.paragraphGap', e.target.checked);
                  }}
                />
                <span>Sangrías y espaciado</span>
              </div>
              
              <div className="debug-options">
                <label>
                  <input
                    type="checkbox"
                    checked={debugConfig.spacing.indent}
                    onChange={(e) => updateDebug('spacing.indent', e.target.checked)}
                  />
                  Primera línea (sangría)
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={debugConfig.spacing.paragraphGap}
                    onChange={(e) => updateDebug('spacing.paragraphGap', e.target.checked)}
                  />
                  Espaciado entre párrafos
                </label>
              </div>
            </div>

            <div className="debug-section">
              <div className="debug-section-title">
                <input
                  type="checkbox"
                  checked={debugConfig.pageBreaks.showEndOfPage && debugConfig.pageBreaks.showContinued}
                  onChange={(e) => {
                    updateDebug('pageBreaks.showEndOfPage', e.target.checked);
                    updateDebug('pageBreaks.showContinued', e.target.checked);
                  }}
                />
                <span>Saltos de página</span>
              </div>
              
              <div className="debug-options">
                <label>
                  <input
                    type="checkbox"
                    checked={debugConfig.pageBreaks.showEndOfPage}
                    onChange={(e) => updateDebug('pageBreaks.showEndOfPage', e.target.checked)}
                  />
                  Mostrar final de página
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={debugConfig.pageBreaks.showContinued}
                    onChange={(e) => updateDebug('pageBreaks.showContinued', e.target.checked)}
                  />
                  Párrafos continuos
                </label>
              </div>
            </div>

            <div className="debug-section">
              <div className="debug-section-title">
                <input
                  type="checkbox"
                  checked={debugConfig.dimensions.margins || debugConfig.dimensions.gutter || debugConfig.dimensions.pageSize}
                  onChange={(e) => {
                    updateDebug('dimensions.margins', e.target.checked);
                    updateDebug('dimensions.gutter', e.target.checked);
                    updateDebug('dimensions.pageSize', e.target.checked);
                  }}
                />
                <span>Dimensiones</span>
              </div>
              
              <div className="debug-options">
                <label>
                  <input
                    type="checkbox"
                    checked={debugConfig.dimensions.margins}
                    onChange={(e) => updateDebug('dimensions.margins', e.target.checked)}
                  />
                  Mostrar márgenes
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={debugConfig.dimensions.gutter}
                    onChange={(e) => updateDebug('dimensions.gutter', e.target.checked)}
                  />
                  Mostrar gutter (lomo)
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={debugConfig.dimensions.pageSize}
                    onChange={(e) => updateDebug('dimensions.pageSize', e.target.checked)}
                  />
                  Dimensiones de página
                </label>
              </div>
            </div>

            <div className="debug-legend">
              <span className="legend-title">Colores:</span>
              <div className="legend-items">
                {colorLegend.map(item => (
                  <span 
                    key={item.label} 
                    className="legend-item"
                    style={{ backgroundColor: item.color }}
                  >
                    {item.label}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Pagination Log Section */}
        {debugConfig.enabled && <PaginationLogSection />}

        {/* TOC Build Log Section */}
        {debugConfig.enabled && <TOCBuildLogSection />}

        {/* TOC Viewer Section */}
        {debugConfig.enabled && <TOCViewerSection />}
      </div>
    </div>
  );
});

/** TOC Build Log — shows per-entry layout data from generateTOCPages */
const TOCBuildLogSection = memo(function TOCBuildLogSection() {
  const tocBuildLog = useEditorStore(s => s.tocBuildLog);
  const [copied, setCopied] = useState(false);

  if (!tocBuildLog || tocBuildLog.length === 0) {
    return (
      <div className="debug-section">
        <div className="debug-section-title">TOC Build Log</div>
        <div style={{ fontSize: '11px', color: '#888', padding: '4px 0' }}>
          Sin datos. Recarga el libro para generar el log de TOC.
        </div>
      </div>
    );
  }

  // Group by page for summary
  const pages = [...new Set(tocBuildLog.map(e => e.page))];
  const summaries = pages.map(pg => {
    const rows = tocBuildLog.filter(e => e.page === pg);
    const usable = rows[0]?.pageUsable ?? 0;
    const used = rows[rows.length - 1]?.usedAfter ?? 0;
    const fillPct = usable > 0 ? Math.round(used / usable * 100) : 0;
    const overflow = used > usable;
    const risky = rows.filter(r => !r.pageBreak && usable - r.usedAfter < (rows[0]?.entryPx ?? 20) * 0.5).length;
    return { pg, usable, used, fillPct, overflow, risky, count: rows.length };
  });

  const handleCopy = useCallback(() => {
    const lines = ['TOC BUILD LOG'];
    for (const s of summaries) {
      lines.push(`\nPAGE ${s.pg}  usable=${s.usable.toFixed(1)}px  used=${s.used.toFixed(1)}px  fill=${s.fillPct}%${s.overflow ? ' OVERFLOW' : ''}`);
      lines.push('  # | Lv | Lines | Px    | UsedBefore | UsedAfter  | Remain   | Break | Title');
      const rows = tocBuildLog.filter(e => e.page === s.pg);
      for (const r of rows) {
        const remain = (r.pageUsable - r.usedAfter).toFixed(1);
        lines.push(
          `${String(r.idx).padStart(3)} | H${r.level} | ${String(r.rawLines).padStart(5)} | ${String(r.entryPx).padStart(5)} | ` +
          `${r.usedBefore.toFixed(1).padStart(10)} | ${r.usedAfter.toFixed(1).padStart(10)} | ${remain.padStart(8)} | ` +
          `${r.pageBreak ? 'YES' : '   '} | "${r.title}"`
        );
      }
    }
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [tocBuildLog, summaries]);

  const getColor = (pct) => pct > 100 ? '#f44336' : pct > 90 ? '#ff9800' : '#4caf50';

  return (
    <div className="debug-section">
      <div className="debug-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>TOC Build Log — {pages.length} pág(s), {tocBuildLog.length} entries</span>
        <button className="debug-copy-btn" onClick={handleCopy} style={{ marginLeft: '8px' }}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Per-page summary */}
      <div style={{ fontSize: '11px', fontFamily: 'monospace', marginBottom: '6px' }}>
        {summaries.map(s => (
          <div key={s.pg} style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '2px 0', borderBottom: '1px solid #2a2a2a' }}>
            <span style={{ color: '#888', minWidth: '30px' }}>p{s.pg}</span>
            <span style={{ color: getColor(s.fillPct), minWidth: '36px' }}>{s.fillPct}%</span>
            <span style={{ color: '#aaa' }}>{s.used.toFixed(0)}/{s.usable.toFixed(0)}px</span>
            {s.overflow && <span style={{ color: '#f44336', fontWeight: 'bold' }}>OVERFLOW</span>}
            {s.risky > 0 && <span style={{ color: '#ff9800' }}>⚠{s.risky}</span>}
          </div>
        ))}
      </div>

      {/* Per-entry detail */}
      <div style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '10px', fontFamily: 'monospace' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #555', color: '#aaa' }}>
              <th style={{ textAlign: 'left', padding: '1px 3px' }}>#</th>
              <th style={{ textAlign: 'left', padding: '1px 3px' }}>Lv</th>
              <th style={{ textAlign: 'right', padding: '1px 3px' }}>Ln</th>
              <th style={{ textAlign: 'right', padding: '1px 3px' }}>Px</th>
              <th style={{ textAlign: 'right', padding: '1px 3px' }}>Rem</th>
              <th style={{ textAlign: 'left', padding: '1px 3px' }}>Title</th>
            </tr>
          </thead>
          <tbody>
            {tocBuildLog.map((r, i) => {
              const remain = r.pageUsable - r.usedAfter;
              const isBreak = r.pageBreak;
              const isOverflow = !isBreak && remain < 0;
              return (
                <tr key={i} style={{ borderBottom: '1px solid #222', backgroundColor: isBreak ? '#1a2a1a' : isOverflow ? '#2a1a1a' : undefined }}>
                  <td style={{ padding: '1px 3px', color: '#666' }}>{r.idx}</td>
                  <td style={{ padding: '1px 3px' }}>
                    <span style={{ color: r.level === 1 ? '#e74c3c' : r.level === 2 ? '#e67e22' : '#27ae60' }}>H{r.level}</span>
                  </td>
                  <td style={{ padding: '1px 3px', textAlign: 'right', color: '#aaa' }}>{r.rawLines}</td>
                  <td style={{ padding: '1px 3px', textAlign: 'right', color: '#aaa' }}>{r.entryPx}</td>
                  <td style={{ padding: '1px 3px', textAlign: 'right', color: remain < 0 ? '#f44336' : remain < r.entryPx ? '#ff9800' : '#4caf50' }}>
                    {remain.toFixed(0)}
                  </td>
                  <td style={{ padding: '1px 3px', color: isBreak ? '#3498db' : '#ccc' }}>
                    {isBreak ? '↵ ' : ''}{r.title}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});

/** TOC Viewer — reads TOC data from Zustand store */
const TOCViewerSection = memo(function TOCViewerSection() {
  const tocData = useEditorStore(s => s.tocData);
  const tocConfig = useEditorStore(s => s.tocConfig);
  const tocAuto = useEditorStore(s => s.tocAuto);
  const setTOCConfig = useEditorStore(s => s.setTOCConfig);
  const setTOCAuto = useEditorStore(s => s.setTOCAuto);

  const handleLevelToggle = useCallback((level) => {
    if (!tocConfig) return;
    const currentLevels = tocConfig.includeLevels || [];
    let newLevels;
    if (currentLevels.includes(level)) {
      newLevels = currentLevels.filter(l => l !== level);
    } else {
      newLevels = [...currentLevels, level].sort((a, b) => a - b);
    }
    setTOCConfig({ ...tocConfig, includeLevels: newLevels, autoGenerated: false });
  }, [tocConfig, setTOCConfig]);

  const handleRegenerate = useCallback(() => {
    if (!tocData || tocData.length === 0) return;
    const levels = {};
    for (const entry of tocData) {
      levels[entry.level] = (levels[entry.level] || 0) + 1;
    }
    let includeLevels = [1];
    if (levels[1] >= 5) includeLevels = [1];
    else if (levels[1] >= 3 && levels[2] >= 10) includeLevels = [1, 2];
    else if (levels[2] >= 5) includeLevels = [1, 2];
    else if (levels[3] >= 10) includeLevels = [1, 2, 3];
    else {
      const active = Object.keys(levels).map(Number).filter(l => levels[l] > 0);
      includeLevels = active.length > 0 ? active : [1];
    }
    setTOCConfig({
      ...(tocConfig || {}),
      includeLevels,
      autoGenerated: true
    });
  }, [tocData, tocConfig, setTOCConfig]);

  if (!tocData || tocData.length === 0) {
    return (
      <div className="debug-section">
        <div className="debug-section-title">Table of Contents (TOC)</div>
        <div style={{ fontSize: '11px', color: '#888', padding: '4px 0' }}>
          No hay TOC disponible. Carga un libro con encabezados para generar.
        </div>
      </div>
    );
  }

  return (
    <div className="debug-section">
      <div className="debug-section-title">
        Table of Contents (TOC) — {tocData.length} entries
      </div>
      
      <div style={{ marginBottom: '8px', padding: '6px', backgroundColor: '#1a1a2e', borderRadius: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <label style={{ fontSize: '10px', color: '#888' }}>Auto-TOC:</label>
          <input
            type="checkbox"
            checked={tocAuto}
            onChange={(e) => setTOCAuto(e.target.checked)}
          />
          <span style={{ fontSize: '9px', color: '#666' }}>
            {tocConfig?.autoGenerated ? '(auto-generado)' : '(manual)'}
          </span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
          <span style={{ fontSize: '10px', color: '#888' }}>Niveles:</span>
          {[1, 2, 3, 4, 5, 6].map(level => (
            <button
              key={level}
              onClick={() => handleLevelToggle(level)}
              style={{
                padding: '2px 6px',
                fontSize: '9px',
                backgroundColor: (tocConfig?.includeLevels || []).includes(level) ? '#3498db' : '#333',
                color: (tocConfig?.includeLevels || []).includes(level) ? '#fff' : '#666',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer'
              }}
            >
              H{level}
            </button>
          ))}
        </div>
        
        <button
          onClick={handleRegenerate}
          style={{
            padding: '3px 8px',
            fontSize: '9px',
            backgroundColor: '#27ae60',
            color: '#fff',
            border: 'none',
            borderRadius: '3px',
            cursor: 'pointer'
          }}
        >
          Regenerar recomendación
        </button>
      </div>

      <div style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '11px', fontFamily: 'monospace' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #555', color: '#aaa' }}>
              <th style={{ textAlign: 'left', padding: '2px 4px' }}>Level</th>
              <th style={{ textAlign: 'left', padding: '2px 4px' }}>Title</th>
              <th style={{ textAlign: 'right', padding: '2px 4px' }}>Page</th>
            </tr>
          </thead>
          <tbody>
            {tocData.map((entry, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '1px 4px' }}>
                  <span style={{
                    backgroundColor: entry.level === 1 ? '#e74c3c' : entry.level === 2 ? '#e67e22' : '#27ae60',
                    padding: '1px 4px',
                    borderRadius: '2px',
                    color: '#fff'
                  }}>
                    H{entry.level}
                  </span>
                </td>
                <td style={{ padding: '1px 4px', paddingLeft: `${(entry.level - 1) * 12 + 4}px` }}>
                  {entry.title.length > 40 ? entry.title.substring(0, 40) + '...' : entry.title}
                </td>
                <td style={{ padding: '1px 4px', textAlign: 'right', color: '#3498db' }}>
                  {entry.page}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

/** Pagination Log viewer — reads from Zustand store */
const PaginationLogSection = memo(function PaginationLogSection() {
  const paginationLog = useEditorStore(s => s.paginationLog);
  const [pageFilter, setPageFilter] = useState('');
  const [copied, setCopied] = useState('');

  const summary = paginationLog?.summary || [];
  const config = paginationLog?.config || {};

  const copyToClipboard = useCallback((text, label) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(''), 2000);
    });
  }, []);

  const handleCopySummary = useCallback(() => {
    if (!paginationLog) return;
    const lines = [];
    lines.push(`PAGINATION SUMMARY (${(paginationLog.timestamp || '').slice(0, 10)})`);
    lines.push(`Config: ${config.pageFormat || '?'}, ${config.fontSize || '?'}pt, ${config.lineHeight || '?'}lh, contentH=${config.contentHeight || '?'}px`);
    lines.push(`${paginationLog.totalPages} pages, ${paginationLog.totalEvents} events`);
    lines.push('');
    lines.push('Page | Fill% | Score | Splits | Moves | Violations');
    lines.push('-----+-------+-------+--------+-------+-----------');
    for (const s of summary) {
      if (s.blank) continue;
      if (s.score <= 50 && s.events === 0 && s.splits === 0 && s.moves === 0) continue;
      const viol = (s.violations || []).join(', ');
      lines.push(
        `${String(s.page).padStart(4)} | ${String(s.fillPct + '%').padStart(5)} | ${String(s.score).padStart(5)} | ${String(s.splits).padStart(6)} | ${String(s.moves).padStart(5)} | ${viol}`
      );
    }
    copyToClipboard(lines.join('\n'), 'summary');
  }, [paginationLog, summary, config, copyToClipboard]);

  const handleCopyFull = useCallback(() => {
    if (!paginationLog) return;
    copyToClipboard(JSON.stringify(paginationLog, null, 2), 'full');
  }, [paginationLog, copyToClipboard]);

  const handleCopyPage = useCallback(() => {
    if (!paginationLog || !pageFilter) return;
    const pageNum = parseInt(pageFilter);
    if (isNaN(pageNum)) return;
    const pageEntries = (paginationLog.entries || []).filter(e => e.page === pageNum);
    const pageSummary = summary.find(s => s.page === pageNum);
    const output = {
      page: pageNum,
      summary: pageSummary || null,
      events: pageEntries
    };
    copyToClipboard(JSON.stringify(output, null, 2), 'page');
  }, [paginationLog, pageFilter, summary, copyToClipboard]);

  if (!paginationLog) {
    return (
      <div className="debug-section">
        <div className="debug-section-title">Pagination Log</div>
        <div style={{ fontSize: '11px', color: '#888', padding: '4px 0' }}>
          No hay log disponible. Carga un libro para generar.
        </div>
      </div>
    );
  }

  // Filter summary for display
  const filteredSummary = pageFilter
    ? summary.filter(s => s.page === parseInt(pageFilter))
    : summary.filter(s => !s.blank && (s.score > 50 || s.events > 0 || s.splits > 0 || s.moves > 0));

  const getScoreColor = (score) => {
    if (score <= 50) return '#4caf50';
    if (score <= 300) return '#ff9800';
    return '#f44336';
  };

  return (
    <div className="debug-section">
      <div className="debug-section-title">
        Pagination Log ({paginationLog.totalPages} pages, {paginationLog.totalEvents} events)
      </div>

      {config.fmOffset > 0 && (
        <div style={{ fontSize: '10px', color: '#f0a500', padding: '3px 0 4px', fontFamily: 'monospace' }}>
          ⚠ FM: {config.fmOffset} págs. Contenido empieza en pág {config.fmOffset + 1}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '6px', flexWrap: 'wrap' }}>
        <button className="debug-copy-btn" onClick={handleCopySummary}>
          {copied === 'summary' ? 'Copied!' : 'Copy Summary'}
        </button>
        <button className="debug-copy-btn" onClick={handleCopyFull}>
          {copied === 'full' ? 'Copied!' : 'Copy Full Log'}
        </button>
        <input
          type="number"
          placeholder="Page #"
          value={pageFilter}
          onChange={e => setPageFilter(e.target.value)}
          style={{ width: '55px', fontSize: '11px', padding: '2px 4px', border: '1px solid #555', borderRadius: '3px', background: '#2a2a2a', color: '#eee' }}
        />
        {pageFilter && (
          <button className="debug-copy-btn" onClick={handleCopyPage}>
            {copied === 'page' ? 'Copied!' : `Copy p${pageFilter}`}
          </button>
        )}
      </div>

      {/* Summary table */}
      <div style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '11px', fontFamily: 'monospace' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #555', color: '#aaa' }}>
              <th style={{ textAlign: 'left', padding: '2px 4px' }}>Pg</th>
              <th style={{ textAlign: 'right', padding: '2px 4px' }}>Fill%</th>
              <th style={{ textAlign: 'right', padding: '2px 4px' }}>Score</th>
              <th style={{ textAlign: 'center', padding: '2px 4px' }}>S</th>
              <th style={{ textAlign: 'center', padding: '2px 4px' }}>M</th>
              <th style={{ textAlign: 'left', padding: '2px 4px' }}>Violations</th>
            </tr>
          </thead>
          <tbody>
            {filteredSummary.map(s => (
              <tr key={s.page} style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '1px 4px' }}>{s.page}</td>
                <td style={{ padding: '1px 4px', textAlign: 'right' }}>{s.fillPct}%</td>
                <td style={{ padding: '1px 4px', textAlign: 'right', color: getScoreColor(s.score) }}>{s.score}</td>
                <td style={{ padding: '1px 4px', textAlign: 'center' }}>{s.splits || ''}</td>
                <td style={{ padding: '1px 4px', textAlign: 'center' }}>{s.moves || ''}</td>
                <td style={{ padding: '1px 4px', color: '#ff9800', fontSize: '10px' }}>
                  {(s.violations || []).join(', ')}
                </td>
              </tr>
            ))}
            {filteredSummary.length === 0 && (
              <tr><td colSpan="6" style={{ padding: '4px', color: '#888', textAlign: 'center' }}>
                {pageFilter ? 'Página no encontrada' : 'Todas las páginas OK (score ≤ 50)'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Timeline + line analysis for selected page */}
      {pageFilter && <PageTimelineSection paginationLog={paginationLog} selectedPage={parseInt(pageFilter)} />}
    </div>
  );
});

// ─── Page Timeline Section ────────────────────────────────────────────────────

const PHASE_COLORS = {
  greedy: '#3498db',
  fill: '#e67e22',
  'heading-fix': '#e74c3c',
  smooth: '#27ae60',
  merge: '#9b59b6',
  'short-line-fix': '#f1c40f'
};

const PageTimelineSection = memo(function PageTimelineSection({ paginationLog, selectedPage }) {
  const [openTraceId, setOpenTraceId] = useState(null);
  const [phaseFilter, setPhaseFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showRepro, setShowRepro] = useState(false);
  if (!paginationLog || !selectedPage) return null;

  const allPageEntries = (paginationLog.entries || []).filter(e => e.page === selectedPage);
  const pageEntries = allPageEntries.filter(e => {
    if (phaseFilter !== 'all' && e.phase !== phaseFilter) return false;
    if (typeFilter !== 'all' && e.type !== typeFilter) return false;
    return true;
  });
  const pageSummary = (paginationLog.summary || []).find(s => s.page === selectedPage);
  const lineAnalysis = pageSummary?.lineAnalysis || [];
  const reproBundle = paginationLog.reproBundle;

  // Available phases/types for filter dropdowns
  const phases = ['all', ...new Set(allPageEntries.map(e => e.phase))];
  const types  = ['all', ...new Set(allPageEntries.map(e => e.type))];

  const selectStyle = {
    background: '#1a1a2e', color: '#aaa', border: '1px solid #555',
    borderRadius: '3px', fontSize: '9px', padding: '1px 3px', marginLeft: '4px'
  };

  return (
    <div style={{ marginTop: '6px', fontFamily: 'monospace', fontSize: '10px' }}>

      {/* Line-level paragraph view */}
      {lineAnalysis.length > 0 && (
        <div style={{ marginBottom: '6px', borderTop: '1px solid #444', paddingTop: '4px' }}>
          <div style={{ color: '#888', marginBottom: '3px' }}>
            Párrafos p{selectedPage} ({lineAnalysis.length})
            {lineAnalysis.some(l => l.isRunt || l.isWidow || l.isOrphan) &&
              <span style={{ color: '#f44336', marginLeft: '6px' }}>⚠ violations</span>}
          </div>
          {lineAnalysis.map(la => (
            <div key={la.index} style={{
              padding: '2px 4px', marginBottom: '2px',
              borderLeft: `2px solid ${(la.isWidow || la.isOrphan) ? '#f44336' : la.isRunt ? '#ff9800' : '#444'}`,
              color: (la.isWidow || la.isOrphan) ? '#f44336' : la.isRunt ? '#ff9800' : '#aaa'
            }}>
              <span style={{ color: '#666', marginRight: '4px' }}>#{la.index}</span>
              <span style={{ color: '#777' }}>{la.lineCount}L</span>
              <span style={{ marginLeft: '4px', color: la.lastLineWidthRatio < 0.35 ? '#ff9800' : '#666' }}>
                last={Math.round(la.lastLineWidthRatio * 100)}%
              </span>
              {la.isRunt   && <span style={{ color: '#ff9800', marginLeft: '4px' }}>[RUNT]</span>}
              {la.isWidow  && <span style={{ color: '#f44336', marginLeft: '4px' }}>[WIDOW]</span>}
              {la.isOrphan && <span style={{ color: '#f44336', marginLeft: '4px' }}>[ORPHAN]</span>}
              <span style={{ color: '#555', marginLeft: '6px' }}>"{la.text}"</span>
            </div>
          ))}
        </div>
      )}

      {/* Event timeline with filters */}
      <div style={{ borderTop: '1px solid #444', paddingTop: '4px' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap', gap: '2px' }}>
          <span style={{ color: '#888' }}>
            Eventos ({pageEntries.length}/{allPageEntries.length}):
          </span>
          <select value={phaseFilter} onChange={e => setPhaseFilter(e.target.value)} style={selectStyle}>
            {phases.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selectStyle}>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {reproBundle && (
            <button
              onClick={() => setShowRepro(v => !v)}
              style={{ ...selectStyle, marginLeft: '8px', cursor: 'pointer', color: showRepro ? '#3498db' : '#aaa' }}
            >
              {showRepro ? '▼ repro' : '▶ repro'}
            </button>
          )}
        </div>

        {/* Reproduction bundle panel */}
        {showRepro && reproBundle && (
          <div style={{ background: '#0d1117', border: '1px solid #444', borderRadius: '3px', padding: '6px', marginBottom: '6px', fontSize: '9px' }}>
            <div style={{ color: '#3498db', marginBottom: '4px', fontSize: '10px' }}>Reproduction Bundle</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
              <div>
                <div style={{ color: '#666' }}>engine</div>
                <div style={{ color: '#ccc' }}>{reproBundle.engineVersion}</div>
              </div>
              <div>
                <div style={{ color: '#666' }}>thread</div>
                <div style={{ color: '#ccc' }}>{reproBundle.flags?.workerPath}</div>
              </div>
              <div>
                <div style={{ color: '#666' }}>ms hash</div>
                <div style={{ color: '#ccc' }}>{reproBundle.manuscriptHash}</div>
              </div>
              <div>
                <div style={{ color: '#666' }}>cfg hash</div>
                <div style={{ color: '#ccc' }}>{reproBundle.configHash}</div>
              </div>
              <div>
                <div style={{ color: '#666' }}>font</div>
                <div style={{ color: '#ccc' }}>{reproBundle.layoutCtx?.fontFamily}</div>
              </div>
              <div>
                <div style={{ color: '#666' }}>fontSize</div>
                <div style={{ color: '#ccc' }}>{reproBundle.layoutCtx?.baseFontSizePx?.toFixed(2)}px / {reproBundle.layoutCtx?.baseLineHeight}lh</div>
              </div>
              <div>
                <div style={{ color: '#666' }}>content</div>
                <div style={{ color: '#ccc' }}>{reproBundle.layoutCtx?.contentWidth?.toFixed(0)}×{reproBundle.layoutCtx?.contentHeight?.toFixed(0)}px</div>
              </div>
              <div>
                <div style={{ color: '#666' }}>fill target</div>
                <div style={{ color: '#ccc' }}>{((reproBundle.flags?.targetFillPct || 0) * 100).toFixed(0)}%</div>
              </div>
              <div>
                <div style={{ color: '#666' }}>indent</div>
                <div style={{ color: '#ccc' }}>{reproBundle.flags?.firstLineIndent}em</div>
              </div>
              <div>
                <div style={{ color: '#666' }}>chapters</div>
                <div style={{ color: '#ccc' }}>{reproBundle.chapterCount}</div>
              </div>
            </div>
          </div>
        )}

        {/* Event list */}
        <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
          {pageEntries.length === 0 && (
            <div style={{ color: '#666' }}>Sin eventos{phaseFilter !== 'all' || typeFilter !== 'all' ? ' (prueba quitar filtros)' : ' para esta página.'}
            </div>
          )}
          {pageEntries.map(entry => {
            const hasSnapshot = entry.beforeSnapshot || entry.afterSnapshot;
            const hasFeatures = entry.data?.features;
            const isExpandable = hasSnapshot || hasFeatures;
            const isOpen = openTraceId === entry.traceId;
            const d = entry.data || {};
            const isReject = entry.type === 'reject';
            return (
              <div
                key={entry.traceId}
                onClick={() => isExpandable && setOpenTraceId(isOpen ? null : entry.traceId)}
                style={{
                  borderLeft: `3px solid ${isReject ? '#c0392b' : PHASE_COLORS[entry.phase] || '#555'}`,
                  padding: '2px 4px', marginBottom: '2px',
                  cursor: isExpandable ? 'pointer' : 'default',
                  background: isOpen ? '#1a2030' : undefined,
                  opacity: entry.type === 'diag' || entry.type === 'cont-check' || entry.type === 'rest-cont-check' ? 0.5 : 1
                }}
              >
                <span style={{ color: isReject ? '#e74c3c' : PHASE_COLORS[entry.phase] || '#aaa' }}>
                  [{entry.phase}/{entry.type}]
                </span>
                {d.tag && <span style={{ color: '#888' }}> {d.tag}</span>}
                {d.reason && <span style={{ color: '#ff9800' }}> {d.reason}</span>}
                {d.before?.score != null && (
                  <span style={{ color: '#666' }}>
                    {' '}Δ{d.delta != null ? (d.delta > 0 ? '+' : '') + d.delta : '?'}
                    {' '}({d.before.score}→{d.after?.score})
                  </span>
                )}
                {d.text && <span style={{ color: '#666' }}> "{d.text}"</span>}
                {isExpandable && <span style={{ color: '#3498db' }}> ▶</span>}

                {isOpen && (
                  <div style={{ marginTop: '4px' }}>
                    {/* Decision features */}
                    {hasFeatures && (
                      <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '3px', padding: '4px', marginBottom: '4px' }}>
                        <div style={{ color: '#6366f1', marginBottom: '3px', fontSize: '9px' }}>Decision features</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px', fontSize: '9px' }}>
                          {Object.entries(d.features).map(([k, v]) => (
                            Array.isArray(v) ? (
                              <div key={k} style={{ gridColumn: '1/-1' }}>
                                <span style={{ color: '#6b7280' }}>{k}: </span>
                                <span style={{ color: v.length ? '#f59e0b' : '#666' }}>
                                  {v.length ? v.join(', ') : '—'}
                                </span>
                              </div>
                            ) : (
                              <div key={k}>
                                <span style={{ color: '#6b7280' }}>{k}: </span>
                                <span style={{ color: '#d1d5db' }}>{String(v)}</span>
                              </div>
                            )
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Before/after snapshots */}
                    {hasSnapshot && (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: entry.beforeSnapshot && entry.afterSnapshot ? '1fr 1fr' : '1fr',
                        gap: '4px'
                      }}>
                        {entry.beforeSnapshot && (
                          <div>
                            <div style={{ color: '#888', marginBottom: '2px', fontSize: '9px' }}>
                              Before ({entry.beforeSnapshot.structure?.elementCount} el, {entry.beforeSnapshot.structure?.paragraphs}p)
                            </div>
                            <pre style={{
                              background: '#0d1117', padding: '4px', maxHeight: '100px',
                              overflow: 'auto', fontSize: '9px', margin: 0, color: '#ccc',
                              whiteSpace: 'pre-wrap', wordBreak: 'break-all'
                            }}>{entry.beforeSnapshot.html}</pre>
                          </div>
                        )}
                        {entry.afterSnapshot && (
                          <div>
                            <div style={{ color: '#888', marginBottom: '2px', fontSize: '9px' }}>
                              After ({entry.afterSnapshot.structure?.elementCount} el, {entry.afterSnapshot.structure?.paragraphs}p)
                            </div>
                            <pre style={{
                              background: '#0d1117', padding: '4px', maxHeight: '100px',
                              overflow: 'auto', fontSize: '9px', margin: 0, color: '#ccc',
                              whiteSpace: 'pre-wrap', wordBreak: 'break-all'
                            }}>{entry.afterSnapshot.html}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default PreviewDebugPanel;
