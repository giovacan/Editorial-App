import { useState, useMemo, useCallback } from 'react';
import { analyzeAndConvertHierarchies } from '../../../utils/headerHierarchyDetector';

function SubheadersPanel({ safeConfig, config, chapters, setConfig, updateChapter }) {
  const [selectedSubheaderLevel, setSelectedSubheaderLevel] = useState('h1');

  const currentSubheaderConfig = useMemo(() =>
    safeConfig.subheaders?.[selectedSubheaderLevel] || {
      align: 'center',
      bold: true,
      sizeMultiplier: 1.5,
      marginTop: 1.5,
      marginBottom: 0.5,
      minLinesAfter: 2
    },
    [safeConfig.subheaders, selectedSubheaderLevel]
  );

  const updateSubheader = useCallback((key, value) => {
    const currentSubheaders = config?.subheaders || { h1: {}, h2: {}, h3: {}, h4: {}, h5: {}, h6: {} };
    const currentSubheader = currentSubheaders[selectedSubheaderLevel] || {};
    setConfig({
      subheaders: {
        ...currentSubheaders,
        [selectedSubheaderLevel]: { ...currentSubheader, [key]: value }
      }
    });
  }, [setConfig, config?.subheaders, selectedSubheaderLevel]);

  return (
    <>
      <fieldset className="config-group">
        <legend>Detección automática de jerarquías</legend>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={safeConfig.autoDetectHeaders?.enabled || false}
            onChange={(e) => {
              if (e.target.checked && chapters && chapters.length > 0) {
                const confirmConvert = confirm('¿Convertir negritas a encabezados automáticamente?\n\nEsto analizará el tamaño del texto y convertirá las negritas a encabezados H1-H6 manteniendo las proporciones.');
                if (confirmConvert) {
                  chapters.forEach(chapter => {
                    const result = analyzeAndConvertHierarchies(chapter.html || '', {
                      convertBold: true,
                      preserveFormatting: safeConfig.autoDetectHeaders?.preserveFormatting !== false
                    });
                    if (result.hasChanges) {
                      updateChapter(chapter.id, { html: result.convertedHtml });
                    }
                  });
                }
              }
              setConfig({
                autoDetectHeaders: {
                  ...safeConfig.autoDetectHeaders,
                  enabled: e.target.checked,
                  targetLevel: safeConfig.autoDetectHeaders?.targetLevel || 'h2',
                  preserveFormatting: safeConfig.autoDetectHeaders?.preserveFormatting !== false
                }
              });
            }}
          />
          Detectar subtítulos por tamaño de letra
        </label>
        {safeConfig.autoDetectHeaders?.enabled && (
          <>
            <div style={{ marginTop: '8px' }}>
              <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                Convertir negritas a:
              </label>
              <select
                value={safeConfig.autoDetectHeaders?.targetLevel || 'h2'}
                onChange={(e) => setConfig({
                  autoDetectHeaders: {
                    ...safeConfig.autoDetectHeaders,
                    targetLevel: e.target.value
                  }
                })}
                style={{ width: '100%', padding: '4px' }}
              >
                <option value="h1">H1 - Título principal (1.8x)</option>
                <option value="h2">H2 - Subtítulo grande (1.5x)</option>
                <option value="h3">H3 - Subtítulo mediano (1.3x)</option>
                <option value="h4">H4 - Subtítulo pequeño (1.15x)</option>
                <option value="h5">H5 - Subtítulo menor (1.05x)</option>
              </select>
            </div>
            <label className="checkbox-label" style={{ marginTop: '8px' }}>
              <input
                type="checkbox"
                checked={safeConfig.autoDetectHeaders?.preserveFormatting !== false}
                onChange={(e) => setConfig({
                  autoDetectHeaders: {
                    ...safeConfig.autoDetectHeaders,
                    preserveFormatting: e.target.checked
                  }
                })}
              />
              Preservar negritas/cursivas
            </label>
          </>
        )}
      </fieldset>

      <div className="level-selector">
        {['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map(level => (
          <button
            key={level}
            className={`level-btn ${selectedSubheaderLevel === level ? 'active' : ''}`}
            onClick={() => setSelectedSubheaderLevel(level)}
          >
            {level.toUpperCase()}
          </button>
        ))}
      </div>

      <fieldset className="config-group">
        <legend>Alineación</legend>
        <div className="radio-group">
          <label><input type="radio" name="subAlign" value="left" checked={currentSubheaderConfig.align === 'left'} onChange={(e) => updateSubheader('align', e.target.value)} /> Izquierda</label>
          <label><input type="radio" name="subAlign" value="center" checked={currentSubheaderConfig.align === 'center'} onChange={(e) => updateSubheader('align', e.target.value)} /> Centro</label>
          <label><input type="radio" name="subAlign" value="right" checked={currentSubheaderConfig.align === 'right'} onChange={(e) => updateSubheader('align', e.target.value)} /> Derecha</label>
        </div>
      </fieldset>

      <fieldset className="config-group">
        <legend>Estilo</legend>
        <label className="checkbox-label">
          <input type="checkbox" checked={currentSubheaderConfig.bold} onChange={(e) => updateSubheader('bold', e.target.checked)} />
          Negrita
        </label>
      </fieldset>

      <fieldset className="config-group">
        <legend>Tamaño relativo</legend>
        <div className="number-row">
          <input type="number" min="0.8" max="2.0" step="0.05" value={currentSubheaderConfig.sizeMultiplier} onChange={(e) => updateSubheader('sizeMultiplier', parseFloat(e.target.value))} />
          <span>({Math.round(safeConfig.fontSize * currentSubheaderConfig.sizeMultiplier)}pt)</span>
        </div>
      </fieldset>

      <fieldset className="config-group">
        <legend>Espaciado</legend>
        <div className="number-row">
          <label>Antes:</label>
          <input type="number" min="0" max="3" step="0.25" value={currentSubheaderConfig.marginTop} onChange={(e) => updateSubheader('marginTop', parseFloat(e.target.value))} />
          <span>líneas</span>
        </div>
        <div className="number-row">
          <label>Después:</label>
          <input type="number" min="0" max="2" step="0.25" value={currentSubheaderConfig.marginBottom} onChange={(e) => updateSubheader('marginBottom', parseFloat(e.target.value))} />
          <span>líneas</span>
        </div>
      </fieldset>

      <fieldset className="config-group">
        <legend>Paginación</legend>
        <div className="number-row">
          <label>Mín. líneas después:</label>
          <input type="number" min="1" max="4" value={currentSubheaderConfig.minLinesAfter} onChange={(e) => updateSubheader('minLinesAfter', parseInt(e.target.value))} />
        </div>
      </fieldset>
    </>
  );
}

export default SubheadersPanel;
