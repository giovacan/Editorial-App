import { useMemo } from 'react';
import { KDP_STANDARDS } from '../../../utils/kdpStandards';

function FormatPanel({ safeConfig, safeBookData, stats, setConfig, onBookTypeChange, recommendedGutter, recommendedGutterInUnit, onCustomPageUnitChange, onGutterStrategyChange, onGutterUnitChange }) {
  return (
    <>
      <fieldset className="config-group">
        <legend>Tipo de libro</legend>
        <select
          value={safeBookData?.bookType || 'novela'}
          onChange={onBookTypeChange}
        >
          <option value="novela">Novela / Ficción</option>
          <option value="ensayo">Ensayo / No ficción</option>
          <option value="poesia">Poesía</option>
          <option value="manual">Manual / Técnico</option>
          <option value="infantil">Libro Infantil</option>
        </select>
      </fieldset>

      <fieldset className="config-group">
        <legend>Formato de página</legend>
        <select
          value={safeConfig.pageFormat}
          onChange={(e) => setConfig({ pageFormat: e.target.value })}
        >
          <option value="a5">A5 (148 × 210 mm)</option>
          <option value="6x9">6 × 9 inches (152 × 229 mm)</option>
          <option value="5x8">5 × 8 inches (127 × 203 mm)</option>
          <option value="a4">A4 (210 × 297 mm)</option>
          <option value="8x10">8 × 10 inches (203 × 254 mm)</option>
          <option value="letter">Letter (8.5 × 11 inches)</option>
          <option value="half-letter">Half Letter (5.5 × 8.5 inches)</option>
          <option value="custom">Personalizado</option>
        </select>
      </fieldset>

      {safeConfig.pageFormat === 'custom' && (
        <fieldset className="config-group">
          <legend>Dimensiones personalizadas</legend>
          <div className="custom-format-inputs">
            <div className="custom-format-row">
              <label>Ancho:</label>
              <input
                type="number"
                min="1"
                step="0.1"
                value={safeConfig.customPageFormat?.width || 6}
                onChange={(e) => setConfig({
                  customPageFormat: { ...safeConfig.customPageFormat, width: parseFloat(e.target.value) || 6 }
                })}
              />
            </div>
            <div className="custom-format-row">
              <label>Alto:</label>
              <input
                type="number"
                min="1"
                step="0.1"
                value={safeConfig.customPageFormat?.height || 9}
                onChange={(e) => setConfig({
                  customPageFormat: { ...safeConfig.customPageFormat, height: parseFloat(e.target.value) || 9 }
                })}
              />
            </div>
            <div className="custom-format-unit">
              <label>
                <input
                  type="radio"
                  name="customUnit"
                  value="mm"
                  checked={(safeConfig.customPageFormat?.unit || 'in') === 'mm'}
                  onChange={() => onCustomPageUnitChange('mm')}
                /> mm
              </label>
              <label>
                <input
                  type="radio"
                  name="customUnit"
                  value="cm"
                  checked={(safeConfig.customPageFormat?.unit || 'in') === 'cm'}
                  onChange={() => onCustomPageUnitChange('cm')}
                /> cm
              </label>
              <label>
                <input
                  type="radio"
                  name="customUnit"
                  value="in"
                  checked={(safeConfig.customPageFormat?.unit || 'in') === 'in'}
                  onChange={() => onCustomPageUnitChange('in')}
                /> in
              </label>
            </div>
          </div>
        </fieldset>
      )}

      <fieldset className="config-group">
        <legend>Gutter (lomo)</legend>
        <div className="gutter-toggle">
          <label className="radio-label">
            <input
              type="radio"
              name="gutterStrategy"
              value="auto"
              checked={(safeConfig.gutterStrategy || 'auto') === 'auto'}
              onChange={() => onGutterStrategyChange('auto')}
            /> Automático
          </label>
          <label className="radio-label">
            <input
              type="radio"
              name="gutterStrategy"
              value="custom"
              checked={(safeConfig.gutterStrategy || 'auto') === 'custom'}
              onChange={() => onGutterStrategyChange('custom')}
            /> Personalizado
          </label>
        </div>
        {(safeConfig.gutterStrategy || 'auto') === 'custom' && (
          <div className="gutter-custom">
            <div className="gutter-recommended" style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
              Recomendado para {stats?.pages || 0} páginas: <strong>{recommendedGutterInUnit.toFixed(3)} {safeConfig.gutterUnit || 'in'}</strong>
            </div>
            <div className="number-row">
              <input
                type="number"
                min="0"
                step={safeConfig.gutterUnit === 'mm' ? 1 : safeConfig.gutterUnit === 'cm' ? 0.1 : 0.125}
                value={safeConfig.gutterManual || recommendedGutterInUnit}
                onChange={(e) => setConfig({ gutterManual: parseFloat(e.target.value) || 0 })}
              />
              <select
                value={safeConfig.gutterUnit || 'in'}
                onChange={(e) => onGutterUnitChange(e.target.value)}
                style={{ marginLeft: '8px', padding: '2px 4px' }}
              >
                <option value="in">in</option>
                <option value="mm">mm</option>
                <option value="cm">cm</option>
              </select>
            </div>
          </div>
        )}
      </fieldset>

      <fieldset className="config-group">
        <legend>Márgenes</legend>
        <div className="margins-toggle">
          <label className="radio-label">
            <input
              type="radio"
              name="marginStrategy"
              value="auto"
              checked={(safeConfig.marginStrategy || 'auto') === 'auto'}
              onChange={() => setConfig({ marginStrategy: 'auto' })}
            /> Automático
          </label>
          <label className="radio-label">
            <input
              type="radio"
              name="marginStrategy"
              value="custom"
              checked={(safeConfig.marginStrategy || 'auto') === 'custom'}
              onChange={() => setConfig({ marginStrategy: 'custom' })}
            /> Personalizado
          </label>
        </div>
        {(safeConfig.marginStrategy || 'auto') === 'custom' && (
          <div className="margins-custom">
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '12px', fontStyle: 'italic' }}>
              En una hoja de libro: arriba = superior, abajo = inferior, izquierda = interior, derecha = exterior
            </div>
            <div className="margins-inputs">
              <div className="margin-input-group">
                <label>Superior</label>
                <input
                  type="number"
                  min="0"
                  step="0.125"
                  value={safeConfig.marginTop || 0.5}
                  onChange={(e) => setConfig({ marginTop: parseFloat(e.target.value) || 0 })}
                />
                <span>in</span>
              </div>
              <div className="margin-input-group">
                <label>Inferior</label>
                <input
                  type="number"
                  min="0"
                  step="0.125"
                  value={safeConfig.marginBottom || 0.5}
                  onChange={(e) => setConfig({ marginBottom: parseFloat(e.target.value) || 0 })}
                />
                <span>in</span>
              </div>
              <div className="margin-input-group">
                <label>Interior (lomo)</label>
                <input
                  type="number"
                  min="0"
                  step="0.125"
                  value={safeConfig.marginLeft || 0.75}
                  onChange={(e) => setConfig({ marginLeft: parseFloat(e.target.value) || 0 })}
                />
                <span>in</span>
              </div>
              <div className="margin-input-group">
                <label>Exterior</label>
                <input
                  type="number"
                  min="0"
                  step="0.125"
                  value={safeConfig.marginRight || 0.75}
                  onChange={(e) => setConfig({ marginRight: parseFloat(e.target.value) || 0 })}
                />
                <span>in</span>
              </div>
            </div>
          </div>
        )}
      </fieldset>

      <fieldset className="config-group">
        <legend>Páginas extras al final</legend>
        <div className="number-row">
          <input
            type="number"
            min="0"
            value={safeConfig.extraEndPages || 0}
            onChange={(e) => setConfig({ extraEndPages: parseInt(e.target.value) || 0 })}
          />
          <span>páginas</span>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={safeConfig.extraEndPagesNumbered || false}
            onChange={(e) => setConfig({ extraEndPagesNumbered: e.target.checked })}
          />
          Incluir número de página
        </label>
      </fieldset>
    </>
  );
}

export default FormatPanel;
