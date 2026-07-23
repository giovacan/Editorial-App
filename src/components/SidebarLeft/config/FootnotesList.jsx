import { useMemo, useState } from 'react';
import useEditorStore from '../../../store/useEditorStore';
import { footnoteRefsIn, footnoteContextSnippet } from '../../../utils/footnotes';
import './FootnotesList.css';

/**
 * FootnotesList — all the book's footnotes grouped by chapter. Each item shows
 * its number, a snippet of the surrounding text, an inline editor for the note
 * content, and a "go" button that jumps to the marker in the editor.
 */
export default function FootnotesList() {
  const chapters = useEditorStore((s) => s.bookData?.chapters);
  const updateFootnote = useEditorStore((s) => s.updateFootnote);
  const setActiveChapter = useEditorStore((s) => s.setActiveChapter);
  const [editing, setEditing] = useState({}); // refId -> draft text

  // Build the grouped list from each chapter's body order + stored note content.
  const groups = useMemo(() => {
    return (chapters || []).map((ch) => {
      const order = footnoteRefsIn(ch.html || '');
      const byId = new Map((ch.footnotes || []).map((n) => [n.refId, n]));
      const items = order.map((refId, i) => ({
        refId,
        index: i + 1,
        html: byId.get(refId)?.html ?? '',
        context: footnoteContextSnippet(ch.html || '', refId),
      }));
      return { chapterId: ch.id, title: ch.title, items };
    }).filter((g) => g.items.length > 0);
  }, [chapters]);

  const goTo = (chapterId, refId) => {
    // Ensure the editor is showing (leave upload) then jump to the marker.
    useEditorStore.setState((s) => ({ ui: { ...s.ui, showUpload: false } }));
    setActiveChapter(chapterId);
    const run = (tries) => {
      if (typeof window.editorGoToFootnote === 'function') window.editorGoToFootnote(chapterId, refId);
      else if (tries > 0) setTimeout(() => run(tries - 1), 60);
    };
    run(8);
  };

  if (groups.length === 0) {
    return <p className="fn-list-empty">No hay notas al pie todavía. Selecciona texto en el editor y usa «Añadir nota al pie».</p>;
  }

  return (
    <div className="fn-list">
      {groups.map((g) => (
        <div key={g.chapterId} className="fn-list-group">
          <div className="fn-list-chapter">{g.title || 'Sin título'}</div>
          {g.items.map((it) => {
            const draft = editing[it.refId] ?? it.html;
            return (
              <div key={it.refId} className="fn-list-item">
                <div className="fn-list-item-head">
                  <span className="fn-list-num">{it.index}</span>
                  {it.context && <span className="fn-list-context">…{it.context}<b>›</b></span>}
                  <button className="fn-list-go" title="Ir a la marca" onClick={() => goTo(g.chapterId, it.refId)}>→</button>
                </div>
                <textarea
                  className="fn-list-text"
                  value={draft}
                  placeholder="Contenido de la nota…"
                  rows={2}
                  onChange={(e) => setEditing((s) => ({ ...s, [it.refId]: e.target.value }))}
                  onBlur={(e) => updateFootnote(g.chapterId, it.refId, e.target.value)}
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
