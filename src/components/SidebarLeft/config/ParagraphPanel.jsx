import { useCallback } from 'react';

function ParagraphPanel({ safeConfig, config, setConfig }) {
  const updateParagraph = useCallback((key, value) => {
    const currentParagraph = config?.paragraph || { firstLineIndent: 1.5, align: 'justify', spacingBetween: 0 };
    setConfig({ paragraph: { ...currentParagraph, [key]: value } });
  }, [setConfig, config?.paragraph]);

  return (
    <>
      <fieldset className="config-group">
        <legend>Sangría primera línea</legend>
        <div className="number-row">
          <input type="number" min="0" max="3" step="0.25" value={safeConfig.paragraph?.firstLineIndent || 1.5} onChange={(e) => updateParagraph('firstLineIndent', parseFloat(e.target.value))} />
          <span>em</span>
        </div>
      </fieldset>

      <fieldset className="config-group">
        <legend>Alineación</legend>
        <div className="radio-group">
          <label><input type="radio" name="paraAlign" value="justify" checked={(safeConfig.paragraph?.align || 'justify') === 'justify'} onChange={(e) => updateParagraph('align', e.target.value)} /> Justificar</label>
          <label><input type="radio" name="paraAlign" value="left" checked={safeConfig.paragraph?.align === 'left'} onChange={(e) => updateParagraph('align', e.target.value)} /> Izquierda</label>
        </div>
      </fieldset>

      <fieldset className="config-group">
        <legend>Espaciado entre párrafos</legend>
        <div className="number-row">
          <input type="number" min="0" max="1" step="0.25" value={safeConfig.paragraph?.spacingBetween || 0} onChange={(e) => updateParagraph('spacingBetween', parseFloat(e.target.value))} />
          <span>líneas</span>
        </div>
      </fieldset>
    </>
  );
}

export default ParagraphPanel;
