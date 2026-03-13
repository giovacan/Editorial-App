import { useCallback } from 'react';

function PaginationPanel({ safeConfig, config, setConfig }) {
  const updatePagination = useCallback((key, value) => {
    const currentPagination = config?.pagination || { minOrphanLines: 2, minWidowLines: 2, splitLongParagraphs: true };
    setConfig({ pagination: { ...currentPagination, [key]: value } });
  }, [setConfig, config?.pagination]);

  return (
    <>
      <fieldset className="config-group">
        <legend>Páginas huérfanas (orphan)</legend>
        <div className="number-row">
          <label>Mín. líneas al final:</label>
          <input type="number" min="1" max="4" value={safeConfig.pagination.minOrphanLines} onChange={(e) => updatePagination('minOrphanLines', parseInt(e.target.value))} />
        </div>
      </fieldset>

      <fieldset className="config-group">
        <legend>Páginas viudas (widow)</legend>
        <div className="number-row">
          <label>Mín. líneas al inicio:</label>
          <input type="number" min="1" max="4" value={safeConfig.pagination.minWidowLines} onChange={(e) => updatePagination('minWidowLines', parseInt(e.target.value))} />
        </div>
      </fieldset>

      <fieldset className="config-group">
        <legend>Párrafos largos</legend>
        <label className="checkbox-label">
          <input type="checkbox" checked={safeConfig.pagination.splitLongParagraphs} onChange={(e) => updatePagination('splitLongParagraphs', e.target.checked)} />
          Dividir párrafos entre páginas
        </label>
      </fieldset>
    </>
  );
}

export default PaginationPanel;
