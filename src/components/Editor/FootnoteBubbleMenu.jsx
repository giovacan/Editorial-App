import { BubbleMenu } from '@tiptap/react/menus';

/**
 * FootnoteBubbleMenu — floating menu shown over a non-empty text selection in
 * the editor. For now it offers a single action: "Añadir nota al pie".
 * (More actions can be added later without changing the mechanism.)
 */
export default function FootnoteBubbleMenu({ editor, onInsertFootnote }) {
  if (!editor) return null;
  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: ed, from, to }) => !ed.isActive('footnoteMark') && to > from}
    >
      <div className="fn-bubble">
        <button type="button" className="fn-bubble-btn" onClick={onInsertFootnote}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" />
            <text x="17" y="10" fontSize="8" fill="currentColor" stroke="none">n</text>
          </svg>
          Añadir nota al pie
        </button>
      </div>
    </BubbleMenu>
  );
}
