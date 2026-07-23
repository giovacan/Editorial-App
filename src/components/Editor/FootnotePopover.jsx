import { useEffect, useRef, useState } from 'react';
import useEditorStore from '../../store/useEditorStore';
import './FootnotePopover.css';

/**
 * FootnotePopover — in-situ editor for a single footnote's content. Opens next
 * to a marker (anchor coords) when a note is created or its marker clicked.
 *
 * @param {{refId, x, y}} anchor
 * @param {string} chapterId
 * @param {Function} onClose
 * @param {Function} onDelete - (refId) => void: remove marker from the editor
 */
export default function FootnotePopover({ anchor, chapterId, onClose, onDelete }) {
  const chapters = useEditorStore((s) => s.bookData?.chapters);
  const updateFootnote = useEditorStore((s) => s.updateFootnote);
  const removeFootnote = useEditorStore((s) => s.removeFootnote);
  const ref = useRef(null);
  const taRef = useRef(null);

  const chapter = chapters?.find((c) => c.id === chapterId);
  const note = chapter?.footnotes?.find((n) => n.refId === anchor.refId);
  const [text, setText] = useState(note?.html || '');

  useEffect(() => { setText(note?.html || ''); }, [anchor.refId]); // reset on target change
  useEffect(() => { taRef.current?.focus(); }, []);

  // Save (debounced) as the user types so nothing is lost on close.
  useEffect(() => {
    const t = setTimeout(() => {
      if (chapterId && anchor.refId) updateFootnote(chapterId, anchor.refId, text);
    }, 300);
    return () => clearTimeout(t);
  }, [text, chapterId, anchor.refId, updateFootnote]);

  // Close on outside click / Esc (persist first).
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) finish(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); finish(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  });

  const finish = () => {
    if (chapterId && anchor.refId) updateFootnote(chapterId, anchor.refId, text);
    onClose?.();
  };

  const handleDelete = () => {
    removeFootnote(chapterId, anchor.refId); // remove the note entry
    onDelete?.(anchor.refId);                // remove the marker from the body
    onClose?.();
  };

  const centered = anchor.x == null;
  const style = centered
    ? { left: '50%', top: '20%', transform: 'translateX(-50%)' }
    : { left: Math.max(8, Math.min(anchor.x, window.innerWidth - 320)), top: anchor.y + 6 };

  const num = note?.index ?? '';

  return (
    <div className="fn-popover" ref={ref} style={style} role="dialog" aria-label={`Editar nota ${num}`}>
      <div className="fn-popover-header">
        <span className="fn-popover-title">Nota {num}</span>
        <button className="fn-popover-close" onClick={finish} title="Cerrar (Esc)" aria-label="Cerrar">✕</button>
      </div>
      <textarea
        ref={taRef}
        className="fn-popover-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Escribe el contenido de la nota…"
        rows={4}
      />
      <div className="fn-popover-actions">
        <button className="fn-popover-delete" onClick={handleDelete}>Eliminar nota</button>
        <button className="fn-popover-save" onClick={finish}>Listo</button>
      </div>
    </div>
  );
}
