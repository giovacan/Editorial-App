function TypographyPanel({ safeConfig, setConfig }) {
  return (
    <>
      <fieldset className="config-group">
        <legend>Familia de fuente</legend>
        <select
          value={safeConfig.fontFamily}
          onChange={(e) => setConfig({ fontFamily: e.target.value })}
        >
          <optgroup label="Serif">
            <option value="Georgia, serif">Georgia</option>
            <option value="'Times New Roman', serif">Times New Roman</option>
            <option value="Garamond, serif">Garamond</option>
            <option value="Merriweather, serif">Merriweather</option>
            <option value="Palatino, serif">Palatino</option>
            <option value="'Book Antiqua', serif">Book Antiqua</option>
            <option value="Cambria, serif">Cambria</option>
            <option value="Baskerville, serif">Baskerville</option>
          </optgroup>
          <optgroup label="Sans Serif">
            <option value="Arial, sans-serif">Arial</option>
            <option value="Helvetica, sans-serif">Helvetica</option>
            <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
            <option value="Verdana, sans-serif">Verdana</option>
            <option value="Calibri, sans-serif">Calibri</option>
            <option value="'Segoe UI', sans-serif">Segoe UI</option>
            <option value="Tahoma, sans-serif">Tahoma</option>
          </optgroup>
          <optgroup label="Monoespaciada">
            <option value="'Courier New', monospace">Courier New</option>
            <option value="Consolas, monospace">Consolas</option>
          </optgroup>
        </select>
      </fieldset>

      <fieldset className="config-group">
        <legend>Tamaño de fuente (pt)</legend>
        <input
          type="number"
          min="10"
          max="16"
          value={safeConfig.fontSize}
          onChange={(e) => setConfig({ fontSize: parseInt(e.target.value) })}
        />
      </fieldset>

      <fieldset className="config-group">
        <legend>Interlineado</legend>
        <select
          value={safeConfig.lineHeight}
          onChange={(e) => setConfig({ lineHeight: parseFloat(e.target.value) })}
        >
          <option value="1.4">1.4 (Apretado)</option>
          <option value="1.5">1.5 (Recomendado)</option>
          <option value="1.6">1.6 (Espaciado)</option>
          <option value="1.8">1.8 (Amplio)</option>
          <option value="2.0">2.0 (Doble)</option>
        </select>
      </fieldset>
    </>
  );
}

export default TypographyPanel;
