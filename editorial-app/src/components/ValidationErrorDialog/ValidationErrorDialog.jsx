import { memo, useState } from 'react';
import './ValidationErrorDialog.css';

const ValidationErrorDialog = memo(function ValidationErrorDialog({
  error,
  onAction,
  onClose
}) {
  const [showFullText, setShowFullText] = useState(false);

  if (!error) return null;

  const getErrorTitle = (type) => {
    switch (type) {
      case 'INCONSISTENT':
        return 'Párrafo inconsistente';
      case 'MISSING_PREVIEW':
        return 'Párrafo faltante en preview';
      case 'MISSING_ORIGINAL':
        return 'Párrafo extra en preview';
      case 'HEADER_COUNT_MISMATCH':
        return 'Cantidad de encabezados no coincide';
      case 'QUOTES_MISSING':
        return 'Citas faltantes';
      case 'INDENT_MISMATCH':
        return 'Sangría incorrecta';
      case 'SENTENCE_NOT_COMPLETE':
        return 'Oración incompleta';
      default:
        return 'Error de consistencia';
    }
  };

  const getErrorDescription = (type) => {
    switch (type) {
      case 'INCONSISTENT':
        return `El párrafo tiene diferente cantidad de palabras entre el documento original y el preview.`;
      case 'MISSING_PREVIEW':
        return `Este párraf del documento original no aparece en el preview.`;
      case 'MISSING_ORIGINAL':
        return `Hay un párrafo extra en el preview que no estaba en el original.`;
      case 'HEADER_COUNT_MISMATCH':
        return `La cantidad de encabezados (H1-H6) no coincide entre original y preview.`;
      case 'QUOTES_MISSING':
        return `Las citas del documento original no aparecen en el preview.`;
      case 'INDENT_MISMATCH':
        return `La sangría aplicada no coincide con la configuración.`;
      case 'SENTENCE_NOT_COMPLETE':
        return `El párrafo no termina en un punto, lo cual puede afectar la lectura.`;
      default:
        return 'Se detectó un problema de consistencia.';
    }
  };

  return (
    <div className="validation-dialog-overlay">
      <div className="validation-dialog">
        <div className="validation-dialog-header">
          <span className="validation-dialog-icon">⚠️</span>
          <span className="validation-dialog-title">
            {getErrorTitle(error.type)}
          </span>
          <button className="validation-dialog-close" onClick={onClose}>✕</button>
        </div>

        <div className="validation-dialog-content">
          <p className="validation-dialog-description">
            {getErrorDescription(error.type)}
          </p>

          {error.chapter && (
            <div className="validation-dialog-info">
              <strong>Capítulo:</strong> {error.chapter}
            </div>
          )}

          {(error.originalText || error.previewText) && (
            <>
              <button
                className="validation-btn validation-btn-text"
                onClick={() => setShowFullText(!showFullText)}
              >
                {showFullText ? '← Ocultar texto completo' : '→ Ver texto completo'}
              </button>

              <div className="validation-dialog-comparison">
                <div className="validation-dialog-column">
                  <strong>Original:</strong>
                  <p className={showFullText ? 'full-text' : ''}>
                    {showFullText ? (error.originalTextFull || error.originalText || 'N/A') : (error.originalText || 'N/A')}
                  </p>
                </div>
                <div className="validation-dialog-column">
                  <strong>Preview:</strong>
                  <p className={showFullText ? 'full-text' : ''}>
                    {showFullText ? (error.previewTextFull || error.previewText || 'N/A') : (error.previewText || 'N/A')}
                  </p>
                </div>
              </div>
            </>
          )}

          {error.originalWords && error.previewWords && (
            <div className="validation-dialog-stats">
              <span>Original: <strong>{error.originalWords} palabras</strong></span>
              <span>Preview: <strong>{error.previewWords} palabras</strong></span>
              <span>Diferencia: <strong>{error.wordDiff} palabras</strong></span>
            </div>
          )}

          {error.expected !== undefined && error.actual !== undefined && (
            <div className="validation-dialog-stats">
              <span>Esperado: <strong>{error.expected}em</strong></span>
              <span>Actual: <strong>{error.actual}em</strong></span>
            </div>
          )}
        </div>

        <div className="validation-dialog-actions">
          <button 
            className="validation-btn validation-btn-secondary"
            onClick={() => onAction('keep_original')}
          >
            Mantener original
          </button>
          <button 
            className="validation-btn validation-btn-secondary"
            onClick={() => onAction('accept_preview')}
          >
            Aceptar preview
          </button>
          <button 
            className="validation-btn validation-btn-primary"
            onClick={() => onAction('edit_manual')}
          >
            Editar manual
          </button>
        </div>
      </div>
    </div>
  );
});

export default ValidationErrorDialog;
