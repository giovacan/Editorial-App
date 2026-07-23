import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import FootnoteRefView from './FootnoteRefView.jsx';

/**
 * FootnoteMark — an inline, atomic node for a footnote reference marker
 * (<sup data-fn="refId">N</sup>).
 *
 * Why a node (not just inline HTML): tiptap only preserves content it has a
 * schema for. Without this, editing a chapter would DROP the <sup data-fn>
 * markers on getHTML() (the same class of corruption we fixed for the search
 * jump). As an atomic node it round-trips through the editor untouched.
 *
 * The visible number is NOT stored — it's recomputed from document order by the
 * NodeView, so inserting/deleting markers renumbers automatically.
 *
 * Commands:
 *   editor.commands.insertFootnote(refId)  — insert a marker at the cursor.
 */
export const FootnoteMark = Node.create({
  name: 'footnoteMark',
  group: 'inline',
  inline: true,
  atom: true,       // treated as a single unit (no editable inner content)
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      refId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-fn'),
        renderHTML: (attrs) => (attrs.refId ? { 'data-fn': attrs.refId } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'sup[data-fn]' }];
  },

  renderHTML({ HTMLAttributes }) {
    // The number is filled by the NodeView in the editor; for getHTML()/export
    // we emit the marker with a placeholder that the engine re-numbers from
    // document order (footnoteRefsIn + syncFootnotes). Keeping a stable "•"
    // would confuse detection, so we render empty text — data-fn is what counts.
    return ['sup', mergeAttributes(HTMLAttributes, { class: 'fn-ref' }), ''];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FootnoteRefView);
  },

  addCommands() {
    return {
      insertFootnote:
        (refId) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { refId } }),
    };
  },
});

export default FootnoteMark;
