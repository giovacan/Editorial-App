import { useState, useCallback } from 'react';
import useEditorStore from '../../../store/useEditorStore';

const MODE_LABELS = {
  auto: 'Automático (consolidate)',
  consolidate: 'Consolidate (ventana 5pg)',
  fillPass: 'Fill Pass (rellenar)',
  widowFix: 'Fix Widows (viudas)',
  headingFix: 'Fix Headings (encabezados)',
  none: 'Ninguno'
};

const MANUAL_MODES = ['consolidate', 'fillPass', 'widowFix', 'headingFix'];

function OptimizationPanel() {
  const globalMode = useEditorStore(s => s.layoutOptimization?.globalMode ?? 'auto');
  const pageOverrides = useEditorStore(s => s.layoutOptimization?.pageOverrides ?? {});
  const setGlobalMode = useEditorStore(s => s.setGlobalOptimizationMode);
  const setPageOverride = useEditorStore(s => s.setPageOptimizationOverride);
  const clearOverrides = useEditorStore(s => s.clearPageOverrides);

  const [manualScope, setManualScope] = useState('all');
  const [rangeFrom, setRangeFrom] = useState(1);
  const [rangeTo, setRangeTo] = useState(10);
  const [manualMode, setManualMode] = useState('consolidate');

  const handleApplyManual = useCallback(() => {
    if (manualScope === 'all') {
      // Set global mode temporarily — pagination will re-run
      setGlobalMode(manualMode);
    } else {
      // Apply per-page overrides for the range
      const from = Math.max(1, rangeFrom);
      const to = Math.max(from, rangeTo);
      for (let p = from; p <= to; p++) {
        setPageOverride(p, manualMode);
      }
    }
  }, [manualScope, manualMode, rangeFrom, rangeTo, setGlobalMode, setPageOverride]);

  const overrideEntries = Object.entries(pageOverrides);

  return (
    <>
      <fieldset className="config-group">
        <legend>Sistema global</legend>
        <select
          value={globalMode}
          onChange={(e) => setGlobalMode(e.target.value)}
          style={{ width: '100%' }}
        >
          {Object.entries(MODE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <p style={{ fontSize: '10px', color: '#888', marginTop: 4 }}>
          Cambia el sistema de optimización usado al paginar.
        </p>
      </fieldset>

      <fieldset className="config-group">
        <legend>Aplicar manualmente</legend>

        <div style={{ marginBottom: 6 }}>
          <label className="checkbox-label" style={{ display: 'block', marginBottom: 2 }}>
            <input
              type="radio"
              name="opt-scope"
              checked={manualScope === 'all'}
              onChange={() => setManualScope('all')}
            />
            Todo el manuscrito
          </label>
          <label className="checkbox-label" style={{ display: 'block' }}>
            <input
              type="radio"
              name="opt-scope"
              checked={manualScope === 'range'}
              onChange={() => setManualScope('range')}
            />
            Rango de páginas
          </label>
        </div>

        {manualScope === 'range' && (
          <div className="number-row" style={{ marginBottom: 6 }}>
            <label>Desde:</label>
            <input
              type="number" min="1" style={{ width: 50 }}
              value={rangeFrom}
              onChange={(e) => setRangeFrom(parseInt(e.target.value) || 1)}
            />
            <label style={{ marginLeft: 6 }}>Hasta:</label>
            <input
              type="number" min="1" style={{ width: 50 }}
              value={rangeTo}
              onChange={(e) => setRangeTo(parseInt(e.target.value) || 1)}
            />
          </div>
        )}

        <select
          value={manualMode}
          onChange={(e) => setManualMode(e.target.value)}
          style={{ width: '100%', marginBottom: 6 }}
        >
          {MANUAL_MODES.map(m => (
            <option key={m} value={m}>{MODE_LABELS[m]}</option>
          ))}
        </select>

        <button
          onClick={handleApplyManual}
          style={{
            width: '100%',
            padding: '5px 8px',
            fontSize: '11px',
            cursor: 'pointer',
            background: '#4a90d9',
            color: '#fff',
            border: 'none',
            borderRadius: 3
          }}
        >
          Aplicar optimización
        </button>
      </fieldset>

      {overrideEntries.length > 0 && (
        <fieldset className="config-group">
          <legend>Overrides por página</legend>
          {overrideEntries.map(([page, mode]) => (
            <div key={page} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', marginBottom: 2 }}>
              <span>p{page}: {MODE_LABELS[mode] || mode}</span>
              <button
                onClick={() => setPageOverride(Number(page), null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c00', fontSize: '13px' }}
                title="Eliminar override"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={clearOverrides}
            style={{
              width: '100%',
              padding: '3px 6px',
              fontSize: '10px',
              cursor: 'pointer',
              marginTop: 4,
              background: '#eee',
              border: '1px solid #ccc',
              borderRadius: 3
            }}
          >
            Limpiar todos
          </button>
        </fieldset>
      )}
    </>
  );
}

export default OptimizationPanel;
