/**
 * FootnotesPanel — enable/disable footnotes and tune their look.
 *
 * The engine only reserves space (and the render only draws the note block)
 * when `config.footnotes.enabled` is true. Notes come from imported Word
 * documents (mammoth) for now; creating/editing notes in-app is a later PR.
 */
import FootnotesList from './FootnotesList';

function FootnotesPanel({ safeConfig, setConfig }) {
  const fn = safeConfig.footnotes || {};
  const update = (patch) => setConfig({ footnotes: { ...fn, ...patch } });

  return (
    <>
      <fieldset className="config-group">
        <legend>Notas al pie</legend>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={fn.enabled === true}
            onChange={(e) => update({ enabled: e.target.checked })}
          />
          Mostrar notas al pie de página
        </label>
        <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '6px' }}>
          Las notas se detectan al importar un documento de Word (.docx) con
          notas al pie. La página que contiene una nota reserva espacio para
          ella entre el texto y el número de página.
        </p>
      </fieldset>

      {fn.enabled && (
        <>
          <fieldset className="config-group">
            <legend>Tamaño de la nota</legend>
            <div className="number-row">
              <input
                type="number"
                min="0.6" max="0.9" step="0.02"
                value={fn.fontScale ?? 0.72}
                onChange={(e) => update({ fontScale: parseFloat(e.target.value) })}
              />
              <span>× cuerpo (~{Math.round((safeConfig.fontSize || 11) * (fn.fontScale ?? 0.72))}pt)</span>
            </div>
          </fieldset>

          <fieldset className="config-group">
            <legend>Interlineado de la nota</legend>
            <div className="number-row">
              <input
                type="number"
                min="1.1" max="1.8" step="0.05"
                value={fn.lineHeight ?? 1.4}
                onChange={(e) => update({ lineHeight: parseFloat(e.target.value) })}
              />
            </div>
          </fieldset>

          <fieldset className="config-group">
            <legend>Numeración</legend>
            <select
              value={fn.numbering ?? 'per-chapter'}
              onChange={(e) => update({ numbering: e.target.value })}
            >
              <option value="per-chapter">Reiniciar por capítulo</option>
              <option value="per-book">Continua en todo el libro</option>
            </select>
          </fieldset>

          <fieldset className="config-group">
            <legend>Notas del libro</legend>
            <FootnotesList />
          </fieldset>
        </>
      )}
    </>
  );
}

export default FootnotesPanel;
