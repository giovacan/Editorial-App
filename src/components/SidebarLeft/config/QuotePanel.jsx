import { useCallback } from 'react';
import useEditorStore from '../../../store/useEditorStore';

function QuotePanel({ safeConfig, config, chapters, setConfig }) {
  const updateQuote = useCallback((key, value) => {
    const currentQuote = config?.quote || { enabled: true, indentLeft: 2, indentRight: 2, showLine: true, italic: true, sizeMultiplier: 0.95, marginTop: 1, marginBottom: 1, template: 'classic', autoDetect: true, detectedQuotes: [] };
    setConfig({ quote: { ...currentQuote, [key]: value } });
  }, [setConfig, config?.quote]);

  return (
    <>
      <fieldset className="config-group">
        <legend>Habilitar estilo</legend>
        <label className="checkbox-label">
          <input type="checkbox" checked={safeConfig.quote.enabled} onChange={(e) => updateQuote('enabled', e.target.checked)} />
          Aplicar estilo especial a citas
        </label>
      </fieldset>

      <fieldset className="config-group">
        <legend>Detección automática</legend>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={safeConfig.quote.autoDetect !== false}
            onChange={(e) => updateQuote('autoDetect', e.target.checked)}
          />
          Detectar citas automáticamente
        </label>
        <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '8px' }}>
          Detecta: — guiones largos, «» comillas italianas, "" inglesas, y citas largas en cursiva (&gt;15 palabras)
        </p>
      </fieldset>

      <fieldset className="config-group">
        <legend>Plantilla de cita</legend>
        <select
          value={safeConfig.quote.template || 'classic'}
          onChange={(e) => updateQuote('template', e.target.value)}
          style={{ width: '100%', padding: '6px', marginTop: '4px' }}
        >
          <option value="classic">Clásico — Líneas decorativas</option>
          <option value="bar">Moderno — Barra vertical</option>
          <option value="italic">Italiano — Cursiva + comillas</option>
          <option value="indent">Sangría — Ambas márgenes</option>
          <option value="minimal">Minimalista — Texto suave</option>
        </select>
      </fieldset>

      <fieldset className="config-group">
        <legend>Aplicar plantillas</legend>
        <button
          className="btn btn-small"
          style={{ width: '100%', marginBottom: '8px' }}
          disabled={chapters?.some(ch => ch.html?.includes('blockquote class="quote'))}
          onClick={() => {
            if (chapters?.some(ch => ch.html?.includes('blockquote class="quote'))) {
              alert('Las citas ya han sido aplicadas. Recarga la página o modifica el contenido manualmente.');
              return;
            }
            if (confirm('¿Aplicar estilo de cita a todo el documento?')) {
              try {
                const applyToAll = useEditorStore.getState().applyQuoteTemplate;
                const template = safeConfig?.quote?.template || 'classic';
                if (applyToAll) applyToAll(template);
              } catch (error) {
                console.error('Error applying quote template:', error);
                alert('Error al aplicar estilos de cita: ' + error.message);
              }
            }
          }}
        >
          Aplicar a todas las citas detectadas
        </button>
      </fieldset>

      <fieldset className="config-group">
        <legend>Sangría</legend>
        <div className="number-row">
          <label>Izquierda:</label>
          <input type="number" min="0" max="4" step="0.5" value={safeConfig.quote.indentLeft} onChange={(e) => updateQuote('indentLeft', parseFloat(e.target.value))} />
          <span>em</span>
        </div>
        <div className="number-row">
          <label>Derecha:</label>
          <input type="number" min="0" max="4" step="0.5" value={safeConfig.quote.indentRight} onChange={(e) => updateQuote('indentRight', parseFloat(e.target.value))} />
          <span>em</span>
        </div>
      </fieldset>

      <fieldset className="config-group">
        <legend>Estilo</legend>
        <label className="checkbox-label">
          <input type="checkbox" checked={safeConfig.quote.italic} onChange={(e) => updateQuote('italic', e.target.checked)} />
          Cursiva
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={safeConfig.quote.showLine} onChange={(e) => updateQuote('showLine', e.target.checked)} />
          Línea decorativa izquierda
        </label>
      </fieldset>

      <fieldset className="config-group">
        <legend>Tamaño</legend>
        <div className="number-row">
          <input type="number" min="0.7" max="1.2" step="0.05" value={safeConfig.quote.sizeMultiplier} onChange={(e) => updateQuote('sizeMultiplier', parseFloat(e.target.value))} />
          <span>({Math.round(safeConfig.fontSize * safeConfig.quote.sizeMultiplier)}pt)</span>
        </div>
      </fieldset>

      <fieldset className="config-group">
        <legend>Márgenes</legend>
        <div className="number-row">
          <label>Superior:</label>
          <input type="number" min="0" max="2" step="0.25" value={safeConfig.quote.marginTop} onChange={(e) => updateQuote('marginTop', parseFloat(e.target.value))} />
          <span>em</span>
        </div>
        <div className="number-row">
          <label>Inferior:</label>
          <input type="number" min="0" max="2" step="0.25" value={safeConfig.quote.marginBottom} onChange={(e) => updateQuote('marginBottom', parseFloat(e.target.value))} />
          <span>em</span>
        </div>
      </fieldset>
    </>
  );
}

export default QuotePanel;
