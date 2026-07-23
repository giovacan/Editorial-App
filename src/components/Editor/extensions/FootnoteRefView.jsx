import { NodeViewWrapper } from '@tiptap/react';

/**
 * FootnoteRefView — how a footnote marker looks INSIDE the editor: a small
 * clickable superscript number. The number is derived from document order
 * (count of footnoteMark nodes up to this one), so it renumbers automatically.
 * Clicking it emits a window event the Editor listens for to open the popover.
 */
export default function FootnoteRefView({ editor, node, getPos }) {
  const refId = node.attrs.refId;

  // Number = 1-based position of this marker among all footnoteMark nodes.
  let number = 1;
  try {
    const myPos = typeof getPos === 'function' ? getPos() : -1;
    let count = 0;
    editor.state.doc.descendants((n, pos) => {
      if (n.type.name === 'footnoteMark') {
        count += 1;
        if (pos === myPos) { number = count; return false; }
      }
      return true;
    });
  } catch { /* fall back to 1 */ }

  const onClick = (e) => {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('footnote:open', { detail: { refId } }));
  };

  return (
    <NodeViewWrapper as="sup" className="fn-ref" contentEditable={false}>
      <button type="button" className="fn-ref-btn" onClick={onClick} title={`Nota ${number} — clic para editar`}>
        {number}
      </button>
    </NodeViewWrapper>
  );
}
