import { foldText } from './bookSearch';

/**
 * findNthMatchInDoc — locate the Nth (0-based) occurrence of `query` in a tiptap
 * (ProseMirror) doc and return its ProseMirror positions { from, to } so the
 * caller can select/scroll to it. Accent- and case-insensitive (folded).
 *
 * Walks text nodes accumulating a global folded string with each char mapped
 * back to its ProseMirror position, so a match that spans a mark boundary
 * (e.g. bold in the middle of a word) is still found and mapped exactly.
 *
 * @param {object} doc   - editor.state.doc (ProseMirror node)
 * @param {string} query - raw query
 * @param {number} occurrenceIndex - which occurrence to return (0-based)
 * @returns {{from:number,to:number}|null}
 */
export const findNthMatchInDoc = (doc, query, occurrenceIndex = 0) => {
  const needle = foldText((query || '').trim());
  if (!doc || !needle) return null;

  // Build folded text + a parallel array of PM positions (one per folded char).
  let folded = '';
  const posMap = []; // posMap[i] = PM position of folded char i
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      const t = node.text;
      for (let i = 0; i < t.length; i++) {
        // foldText is 1:1 per char, so index i in the node maps to pos + i.
        folded += foldText(t[i]);
        posMap.push(pos + i);
      }
    }
    return true;
  });

  const nLen = needle.length;
  let count = 0;
  let idx = folded.indexOf(needle, 0);
  while (idx !== -1) {
    if (count === occurrenceIndex) {
      const from = posMap[idx];
      const lastCharPos = posMap[idx + nLen - 1];
      if (from == null || lastCharPos == null) return null;
      return { from, to: lastCharPos + 1 };
    }
    count++;
    idx = folded.indexOf(needle, idx + nLen);
  }
  return null;
};
