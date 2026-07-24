import { useState, useEffect, useRef, useMemo } from 'react';
import useEditorStore from '../../store/useEditorStore';
import { parseLabelAndName } from '../../utils/chapterTitle';
import { mergeIntoPrevious, moveChapter, removeChapter, updateFields } from '../../utils/chapterDraft';
import { hydrateImageSrcsAsync } from '../../utils/imageStore';
import './ChapterReview.css';

/**
 * ChapterReview — full-screen "Revisa tus capítulos" step shown right after
 * importing a .docx, BEFORE the book is laid out. The user corrects the detected
 * structure (merge, edit number/name, reorder, remove) with a live reading
 * preview of each chapter. Operates on a local draft; the store is only touched
 * when the user confirms.
 *
 * Props:
 *   chapters   — the REAL parsed chapters (with html)
 *   bookTitle  — detected book title (passed straight through)
 *   onConfirm(editedChapters, bookTitle) — commit the edited draft
 *   onCancel(originalChapters, bookTitle) — skip review, load as detected
 */
function ChapterReview({ chapters, bookTitle, onConfirm, onCancel }) {
  const [draft, setDraft] = useState(() => chapters.map((c) => ({ ...c })));
  const [selectedId, setSelectedId] = useState(chapters[0]?.id || null);
  const [previewHtml, setPreviewHtml] = useState('');
  const dragIndex = useRef(null);
  const { isActive: paginationActive, percent: paginationPercent } =
    useEditorStore((s) => s.paginationProgress);

  const selected = useMemo(
    () => draft.find((c) => c.id === selectedId) || draft[0] || null,
    [draft, selectedId]
  );

  // Resolve images (data-img-id → objectURL) in the preview html.
  useEffect(() => {
    let cancelled = false;
    const html = selected?.html || '';
    hydrateImageSrcsAsync(html).then((h) => { if (!cancelled) setPreviewHtml(h); });
    return () => { cancelled = true; };
  }, [selected?.id, selected?.html]);

  const fieldsOf = (c) => {
    const s = parseLabelAndName(c.title);
    return { label: c.chapterLabel ?? s.label, name: c.chapterName ?? s.name };
  };

  const doMerge = (id) => {
    setDraft((d) => {
      const next = mergeIntoPrevious(d, id);
      if (selectedId === id) {
        const idx = d.findIndex((c) => c.id === id);
        setSelectedId(d[idx - 1]?.id ?? next[0]?.id ?? null);
      }
      return next;
    });
  };
  const doRemove = (id) => {
    setDraft((d) => {
      const next = removeChapter(d, id);
      if (selectedId === id) setSelectedId(next[0]?.id ?? null);
      return next;
    });
  };
  const doMove = (from, to) => setDraft((d) => moveChapter(d, from, to));
  const doUpdate = (id, patch) => setDraft((d) => updateFields(d, id, patch));

  const handleDrop = (toIndex) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from != null && from !== toIndex) doMove(from, toIndex);
  };

  return (
    <div className="chreview-overlay" role="dialog" aria-modal="true" aria-label="Revisar capítulos">
      <header className="chreview-header">
        <div>
          <h1 className="chreview-title">Revisa tus capítulos</h1>
          <p className="chreview-subtitle">
            Corrige la estructura antes de maquetar: fusiona, renumera, reordena o elimina.
            <strong> {draft.length} capítulos</strong> detectados.
          </p>
        </div>
        <button
          className="chreview-skip"
          onClick={() => onCancel(chapters, bookTitle)}
          disabled={paginationActive}
          title="Cargar el libro tal como se detectó, sin cambios"
        >
          Omitir revisión
        </button>
      </header>

      <div className="chreview-body">
        {/* Left: chapter list */}
        <div className="chreview-list" role="list">
          {draft.map((c, index) => {
            const { label, name } = fieldsOf(c);
            const isActive = c.id === selected?.id;
            return (
              <div
                key={c.id}
                role="listitem"
                className={`chreview-item ${isActive ? 'active' : ''}`}
                onClick={() => setSelectedId(c.id)}
                draggable
                onDragStart={() => { dragIndex.current = index; }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(index)}
              >
                <div className="chreview-item-row">
                  <span className="chreview-drag" title="Arrastrar para reordenar">⋮⋮</span>
                  <span className="chreview-num">{index + 1}</span>
                  <div className="chreview-fields" onClick={(e) => e.stopPropagation()}>
                    <input
                      className="chreview-label-input"
                      value={label}
                      placeholder="Nº / etiqueta"
                      onChange={(e) => doUpdate(c.id, { label: e.target.value })}
                      title="Número o etiqueta (ej. CAPÍTULO 2)"
                    />
                    <input
                      className="chreview-name-input"
                      value={name}
                      placeholder="Nombre del capítulo"
                      onChange={(e) => doUpdate(c.id, { name: e.target.value })}
                    />
                  </div>
                  <div className="chreview-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="chreview-btn" title="Fusionar con el capítulo anterior"
                      disabled={index === 0}
                      onClick={() => doMerge(c.id)}>⭱</button>
                    <button className="chreview-btn" title="Subir"
                      disabled={index === 0}
                      onClick={() => doMove(index, index - 1)}>↑</button>
                    <button className="chreview-btn" title="Bajar"
                      disabled={index === draft.length - 1}
                      onClick={() => doMove(index, index + 1)}>↓</button>
                    <button className="chreview-btn chreview-btn-danger" title="Eliminar capítulo"
                      disabled={draft.length <= 1}
                      onClick={() => doRemove(c.id)}>✕</button>
                  </div>
                </div>
                <span className="chreview-meta">{c.wordCount || 0} palabras</span>
              </div>
            );
          })}
        </div>

        {/* Right: reading preview of the selected chapter */}
        <div className="chreview-preview">
          {selected ? (
            <>
              <div className="chreview-preview-title">{selected.title || 'Sin título'}</div>
              <div className="chreview-preview-body" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </>
          ) : (
            <p className="chreview-empty">No hay capítulos.</p>
          )}
        </div>
      </div>

      <footer className="chreview-footer">
        <button
          className="chreview-continue"
          onClick={() => onConfirm(draft, bookTitle)}
          disabled={paginationActive || draft.length === 0}
        >
          <span className="chreview-progress-fill" style={{ width: paginationActive ? `${paginationPercent}%` : '0%' }} />
          <span className="chreview-continue-label">
            {paginationActive
              ? (paginationPercent < 90 ? `Maquetando… ${paginationPercent}%` : 'Finalizando…')
              : `Continuar con ${draft.length} capítulos`}
          </span>
        </button>
      </footer>
    </div>
  );
}

export default ChapterReview;
