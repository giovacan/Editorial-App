import { memo } from 'react';
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
      </div>
    </div>
  );
});

export default PreviewDebugPanel;
