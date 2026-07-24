import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { DOMSerializer } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import useEditorStore from '../../store/useEditorStore';
import { usePagination } from '../../hooks/usePagination';
import PageBreakMarkers from './PageBreakMarkers';
import { KDP_STANDARDS } from '../../utils/kdpStandards';
import { calculateContentDimensions } from '../../utils/textMeasurer';
import PageLayoutView from '../PageLayoutView/PageLayoutView';
import { findNthMatchInDoc } from '../../utils/editorSearch';
import { footnoteRefsIn } from '../../utils/footnotes';
import { toast } from '../../utils/toast';
import { nanoid } from 'nanoid';
import FootnoteMark from './extensions/FootnoteMark';
import FootnoteBubbleMenu from './FootnoteBubbleMenu';
import FootnotePopover from './FootnotePopover';
import './Editor.css';

function Editor({ pushChange, onContentChange }) {
  const activeChapterId = useEditorStore((s) => s.editing.activeChapterId);
  const chapters = useEditorStore((s) => s.bookData?.chapters);
  const setActiveChapter = useEditorStore((s) => s.setActiveChapter);
  const addFootnote = useEditorStore((s) => s.addFootnote);
  const syncFootnotesFromBody = useEditorStore((s) => s.syncFootnotesFromBody);

  // Popover: which footnote (refId) is being edited, and where to anchor it.
  const [fnPopover, setFnPopover] = useState(null); // { refId, x, y } | null

  // ── In-book search: apply a match coming from the central search bar ─────────
  // A pending match to select once the target chapter's content is loaded into
  // the editor (switching chapters resets content via setContent, which is why
  // the selection is applied in an effect keyed on activeChapterId, not inline).
  const pendingMatchRef = useRef(null);
  // True while we programmatically load a chapter's HTML into the editor, so the
  // onUpdate save-handler ignores that change. Loading content must NEVER write
  // back tiptap's re-serialized HTML (it drops importer classes/attrs and made
  // the book re-paginate to a different, longer layout just from navigating).
  const isLoadingContentRef = useRef(false);

  const updateChapter = useEditorStore((s) => s.updateChapter);
  const splitChapter = useEditorStore((s) => s.splitChapter);
  const config = useEditorStore((s) => s.config);
  const ui = useEditorStore((s) => s.ui);
  const setUi = useEditorStore((s) => s.setUi);
  
  const [quoteTemplate, setQuoteTemplate] = useState('classic');
  const [editorState, setEditorState] = useState({ canUndo: false, canRedo: false });
  const [showPageBreaks, setShowPageBreaks] = useState(false);
  const [pageLayoutMode, setPageLayoutMode] = useState(false);
  
  const bookType = useEditorStore((s) => s.bookData?.bookType || 'novela');

  const activeChapter = chapters?.find(ch => ch.id === activeChapterId);
  const saveTimeoutRef = useRef(null);
  const lastSaveTimeRef = useRef(null);
  const editorRef = useRef(null);
  const editorContentRef = useRef(null);

  // Dimensiones del libro para el Modo Diseño
  const pageLayoutDims = useMemo(() => {
    const bookCfg = KDP_STANDARDS.getBookTypeConfig(bookType);
    let pageFormatObj;
    if (config?.pageFormat === 'custom') {
      const cd = KDP_STANDARDS.getCustomPageDimensions(
        config?.customPageFormat?.width || 6,
        config?.customPageFormat?.height || 9,
        config?.customPageFormat?.unit || 'in'
      );
      pageFormatObj = { width: cd.widthMm, height: cd.heightMm };
    } else {
      pageFormatObj = KDP_STANDARDS.getPageFormat(config?.pageFormat || bookCfg.recommendedFormat);
    }
    const dims = calculateContentDimensions(pageFormatObj, bookCfg, 1.0);
    const PX_PER_INCH = 96;
    const fontSizePx = (config?.fontSize || bookCfg.fontSize) * (PX_PER_INCH / 72);
    const fontFamily = config?.fontFamily || bookCfg.fontFamily;
    const lineHeight = config?.lineHeight || bookCfg.lineHeight;
    return { ...dims, fontSizePx, fontFamily, lineHeight };
  }, [bookType, config?.pageFormat, config?.customPageFormat, config?.fontSize, config?.fontFamily, config?.lineHeight]);

  const measureRef = useRef(null);
  const bookDataForPagination = useMemo(() => ({
    chapters,
    title: '',
    author: '',
    bookType: 'novela',
    pageFormat: '6x9',
    margins: {}
  }), [chapters]);
  const { pages } = usePagination(bookDataForPagination, config, measureRef);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
      }),
      Placeholder.configure({
        placeholder: 'Escribe tu contenido aquí...',
      }),
      FootnoteMark,
    ],
    content: activeChapter?.html || '',
    onUpdate: ({ editor: ed }) => {
      // Ignore updates caused by programmatic content loading (chapter switch /
      // search jump) — those must not overwrite the stored chapter HTML.
      if (isLoadingContentRef.current) return;
      if (activeChapter) {
        const html = ed.getHTML();
        const text = ed.getText();
        const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
        
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        
        saveTimeoutRef.current = setTimeout(() => {
          const cleanHtml = html.replace(/<div class="page-break-marker">.*?<\/div>/gi, '');
          updateChapter(activeChapter.id, { html: cleanHtml, wordCount });
          // Reconcile footnotes with the markers now in the body: renumber by
          // order + prune orphans (a marker the user deleted removes its note).
          syncFootnotesFromBody(activeChapter.id, footnoteRefsIn(cleanHtml));

          const now = new Date();
          lastSaveTimeRef.current = now;
          
          if (onContentChange) {
            onContentChange(now);
          }
          
          if (pushChange) {
            pushChange('Editar contenido', config, true);
          }
        }, 1000);
      }
    },
  });

  // Keep editorRef updated
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const handleTogglePageBreaks = useCallback(() => {
    setShowPageBreaks(!showPageBreaks);
  }, [showPageBreaks]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Save on beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (editor && activeChapter) {
        const html = editor.getHTML();
        const text = editor.getText();
        const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
        const cleanHtml = html.replace(/<div class="page-break-marker">.*?<\/div>/gi, '');
        updateChapter(activeChapter.id, { html: cleanHtml, wordCount });
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [editor, activeChapter, updateChapter]);

  // Expose editor methods for header undo/redo
  useEffect(() => {
    window.editorUndo = () => {
      if (editor?.can().undo()) {
        editor.chain().focus().undo().run();
        return true;
      }
      return false;
    };
    window.editorRedo = () => {
      if (editor?.can().redo()) {
        editor.chain().focus().redo().run();
        return true;
      }
      return false;
    };
    window.editorCanUndo = () => editor?.can().undo() || false;
    window.editorCanRedo = () => editor?.can().redo() || false;
    
    return () => {
      delete window.editorUndo;
      delete window.editorRedo;
      delete window.editorCanUndo;
      delete window.editorCanRedo;
    };
  }, [editor]);

  // Update canUndo/canRedo state on editor updates
  useEffect(() => {
    if (!editor) return;
    
    const updateState = () => {
      setEditorState({
        canUndo: editor.can().undo(),
        canRedo: editor.can().redo()
      });
      // Dispatch custom event to notify Layout
      window.dispatchEvent(new Event('editorStateChange'));
    };
    
    editor.on('update', updateState);
    editor.on('selectionUpdate', updateState);
    
    updateState();
    
    return () => {
      editor.off('update', updateState);
      editor.off('selectionUpdate', updateState);
    };
  }, [editor]);

  useEffect(() => {
    if (editor && activeChapter) {
      // Guard the save-handler AND tell tiptap not to emit an update: loading a
      // chapter must not trigger a write-back of re-serialized HTML.
      isLoadingContentRef.current = true;
      editor.commands.setContent(activeChapter.html || '', { emitUpdate: false });
      // Release the guard after this tick (setContent is synchronous; any
      // trailing update from it has already been swallowed).
      Promise.resolve().then(() => { isLoadingContentRef.current = false; });
    }
    // Only reload content when the active chapter ID changes, not when html changes.
    // Including activeChapter.html would cause the editor to overwrite user edits
    // during the 1-second debounce window before the store is updated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChapterId, editor]);

  // Apply a pending search match after the chapter's content is loaded: find the
  // Nth occurrence in the tiptap doc, select it, scroll it into view and focus.
  useEffect(() => {
    const pending = pendingMatchRef.current;
    if (!editor || !pending || pending.chapterId !== activeChapterId) return;
    pendingMatchRef.current = null;
    // Defer to the next frame so setContent has committed the new doc.
    requestAnimationFrame(() => {
      // Footnote jump (from the side panel): select the marker node.
      if (pending.footnoteRefId) {
        editor.state.doc.descendants((n, pos) => {
          if (n.type.name === 'footnoteMark' && n.attrs.refId === pending.footnoteRefId) {
            editor.chain().focus().setNodeSelection(pos).scrollIntoView().run();
            return false;
          }
          return true;
        });
        return;
      }
      const range = findNthMatchInDoc(editor.state.doc, pending.query, pending.wordIndex);
      if (!range) { editor.commands.focus(); return; }
      editor.chain().focus().setTextSelection(range).scrollIntoView().run();
    });
  }, [activeChapterId, editor]);

  // Jump to a search result: switch chapter (if needed) and select the term.
  // `query` is the raw search text (from the bar) — used to locate the Nth
  // occurrence in the tiptap doc.
  const handleGoToMatch = useCallback((match, query) => {
    if (!match || !query) return;
    if (match.chapterId === activeChapterId && editor) {
      const range = findNthMatchInDoc(editor.state.doc, query, match.wordIndex);
      if (range) editor.chain().focus().setTextSelection(range).scrollIntoView().run();
    } else {
      // Different chapter — stash and switch; the effect above applies it.
      pendingMatchRef.current = { chapterId: match.chapterId, wordIndex: match.wordIndex, query };
      setActiveChapter(match.chapterId);
    }
  }, [activeChapterId, editor, setActiveChapter]);

  // Expose the jump-to-match command so the central search bar (in Layout) can
  // drive the editor without prop drilling — same window-command pattern as
  // window.editorUndo/editorRedo below.
  useEffect(() => {
    window.editorGoToMatch = (match, query) => handleGoToMatch(match, query);
    return () => { delete window.editorGoToMatch; };
  }, [handleGoToMatch]);

  // ── Footnotes: insert / open / jump ─────────────────────────────────────────
  // Anchor the popover next to a marker (by refId) using ProseMirror coords.
  const openPopoverForRef = useCallback((refId) => {
    if (!editor) return;
    let coords = null;
    editor.state.doc.descendants((n, pos) => {
      if (n.type.name === 'footnoteMark' && n.attrs.refId === refId) {
        try { coords = editor.view.coordsAtPos(pos); } catch { /* off-screen */ }
        return false;
      }
      return true;
    });
    if (coords) setFnPopover({ refId, x: coords.left, y: coords.bottom });
    else setFnPopover({ refId, x: null, y: null }); // fallback: centered
  }, [editor]);

  // Insert a new footnote marker at the cursor and open its editor popover.
  const handleInsertFootnote = useCallback(() => {
    if (!editor || !activeChapter) return;
    const refId = `fn-${nanoid(6)}`;
    editor.chain().focus().insertFootnote(refId).run();
    addFootnote(activeChapter.id, refId, '');
    // Sync numbering from the new body, then open the popover to type the note.
    syncFootnotesFromBody(activeChapter.id, footnoteRefsIn(editor.getHTML()));
    requestAnimationFrame(() => openPopoverForRef(refId));
  }, [editor, activeChapter, addFootnote, syncFootnotesFromBody, openPopoverForRef]);

  // A marker was clicked (event from the NodeView) → open its popover.
  useEffect(() => {
    const onOpen = (e) => openPopoverForRef(e.detail?.refId);
    window.addEventListener('footnote:open', onOpen);
    return () => window.removeEventListener('footnote:open', onOpen);
  }, [openPopoverForRef]);

  // Jump to a footnote's marker (from the side panel list): switch chapter if
  // needed, then select the marker. Uses the same pending-switch pattern as search.
  const handleGoToFootnote = useCallback((chapterId, refId) => {
    const selectMark = () => {
      if (!editor) return;
      editor.state.doc.descendants((n, pos) => {
        if (n.type.name === 'footnoteMark' && n.attrs.refId === refId) {
          editor.chain().focus().setNodeSelection(pos).scrollIntoView().run();
          return false;
        }
        return true;
      });
    };
    if (chapterId === activeChapterId) { selectMark(); }
    else {
      pendingMatchRef.current = { chapterId, footnoteRefId: refId };
      setActiveChapter(chapterId);
    }
  }, [editor, activeChapterId, setActiveChapter]);

  useEffect(() => {
    window.editorGoToFootnote = (chapterId, refId) => handleGoToFootnote(chapterId, refId);
    return () => { delete window.editorGoToFootnote; };
  }, [handleGoToFootnote]);

  const wordCount = activeChapter?.wordCount || 0;

  const applyQuote = useCallback((template) => {
    if (!editor) return;
    
    const { from, to } = editor.state.selection;
    if (from === to) return;
    
    const selectedText = editor.state.doc.textBetween(from, to);
    if (!selectedText.trim()) return;
    
    editor.chain().focus().toggleBlockquote().run();
  }, [editor]);

  const removeQuote = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().unsetBlockquote().run();
  }, [editor]);

  // Split the current chapter at the cursor: everything before stays here, a new
  // chapter is created with everything after. Fixes "the detector missed a
  // chapter" — the user puts the cursor where the new chapter begins.
  const handleSplitHere = useCallback(() => {
    if (!editor || !activeChapter) return;
    const { doc, selection } = editor.state;
    // Split at the START of the block containing the cursor, so a heading/line
    // isn't cut mid-way. $from.before(1) is the position before the top-level
    // block; fall back to the raw cursor position.
    const $from = selection.$from;
    let cut = selection.from;
    try { cut = $from.before(1); } catch { /* use raw from */ }
    if (cut <= 0 || cut >= doc.content.size) {
      toast.info('Coloca el cursor donde quieres que empiece el nuevo capítulo (no al inicio ni al final del texto).');
      return;
    }
    // Serialize the two halves to HTML via the schema's DOM serializer.
    const serializer = DOMSerializer.fromSchema(editor.schema);
    const toHtml = (fragment) => {
      const div = document.createElement('div');
      div.appendChild(serializer.serializeFragment(fragment));
      return div.innerHTML;
    };
    const beforeFrag = doc.slice(0, cut).content;
    const afterFrag = doc.slice(cut, doc.content.size).content;
    const htmlBefore = toHtml(beforeFrag);
    const htmlAfter = toHtml(afterFrag);
    if (!htmlAfter.trim()) return;
    // Title for the new chapter = text of its first line.
    const afterText = doc.slice(cut, doc.content.size).content.firstChild?.textContent?.trim() || '';
    const newTitle = afterText.slice(0, 80) || 'Nuevo capítulo';
    // splitChapter changes activeChapterId → the reload effect swaps the editor
    // content to the new chapter (guarded by isLoadingContentRef). No manual
    // guard needed here.
    splitChapter(activeChapter.id, htmlBefore, htmlAfter, newTitle);
  }, [editor, activeChapter, splitChapter]);

  if (!activeChapter) {
    return (
      <div className="editor-area">
        <div className="editor-empty">
          <p>Selecciona un capítulo para empezar a editar</p>
        </div>
      </div>
    );
  }

  if (!editor) {
    return null;
  }

  return (
    <section className="editor-section" role="main" aria-label="Editor de contenido">
      <div className="editor-toolbar" role="toolbar" aria-label="Herramientas de edición">
        <div className="toolbar-group">
          <button
            className={`btn btn-icon ${editor.isActive('bold') ? 'active' : ''}`}
            title="Negrita (Ctrl+B)"
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>
            </svg>
          </button>
          <button 
            className={`btn btn-icon ${editor.isActive('italic') ? 'active' : ''}`}
            title="Cursiva (Ctrl+I)" 
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/>
            </svg>
          </button>
          <button 
            className={`btn btn-icon ${editor.isActive('underline') ? 'active' : ''}`}
            title="Subrayado (Ctrl+U)" 
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/>
            </svg>
          </button>
          <button 
            className={`btn btn-icon ${editor.isActive('strike') ? 'active' : ''}`}
            title="Tachado" 
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="12" x2="20" y2="12"/><path d="M17.5 7.5c-.5-1.5-2.5-3-5.5-3-3.5 0-5.5 2-5.5 4 0 1.5 1 2.5 2.5 3"/>
              <path d="M8.5 16.5c.5 1 2 2 5 2 3 0 5-1.5 5-4 0-1-.5-1.5-1.5-2"/>
            </svg>
          </button>
        </div>
        
        <div className="toolbar-separator"></div>
        
        <div className="toolbar-group">
          <button 
            className={`btn btn-icon ${editor.isActive('heading', { level: 1 }) ? 'active' : ''}`}
            title="Título 1" 
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            H1
          </button>
          <button 
            className={`btn btn-icon ${editor.isActive('heading', { level: 2 }) ? 'active' : ''}`}
            title="Título 2" 
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            H2
          </button>
          <button 
            className={`btn btn-icon ${editor.isActive('heading', { level: 3 }) ? 'active' : ''}`}
            title="Título 3" 
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            H3
          </button>
        </div>
        
        <div className="toolbar-separator"></div>
        
        <div className="toolbar-group">
          <button 
            className={`btn btn-icon ${editor.isActive('bulletList') ? 'active' : ''}`}
            title="Lista con viñetas" 
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
          </button>
          <button 
            className={`btn btn-icon ${editor.isActive('orderedList') ? 'active' : ''}`}
            title="Lista numerada" 
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>
            </svg>
          </button>
        </div>
        
        <div className="toolbar-separator"></div>
        
        <div className="toolbar-group" title="Citas">
          <select 
            value={quoteTemplate}
            onChange={(e) => setQuoteTemplate(e.target.value)}
            style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid #d1d5db' }}
          >
            <option value="classic">Clásico</option>
            <option value="bar">Barra</option>
            <option value="italic">Italiano</option>
            <option value="indent">Sangría</option>
            <option value="minimal">Minimal</option>
          </select>
          <button 
            className={`btn btn-icon ${editor.isActive('blockquote') ? 'active' : ''}`}
            title="Aplicar cita al texto seleccionado" 
            onClick={() => applyQuote(quoteTemplate)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"/>
            </svg>
          </button>
          <button 
            className="btn btn-icon" 
            title="Quitar formato de cita" 
            onClick={removeQuote}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        
        <div className="toolbar-separator"></div>

        <div className="toolbar-group">
          <button
            type="button"
            className="btn btn-icon"
            aria-label="Dividir capítulo en el cursor"
            title="Dividir capítulo aquí (crea un capítulo nuevo desde el cursor)"
            onClick={handleSplitHere}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 3v18"/><path d="M3 12h5"/><path d="M16 3v18"/><path d="M21 12h-5"/>
              <path d="M12 8v8" strokeDasharray="2 2"/>
            </svg>
          </button>
        </div>

        <div className="toolbar-separator"></div>

        <div className="toolbar-group">
          <button
            className={`btn btn-icon ${showPageBreaks ? 'active' : ''}`}
            title={showPageBreaks ? 'Ocultar saltos de página' : 'Mostrar saltos de página'}
            onClick={handleTogglePageBreaks}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="12" x2="12" y2="18"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
          </button>
          <button
            className={`btn btn-icon ${pageLayoutMode ? 'page-layout-active' : ''}`}
            title={pageLayoutMode ? 'Volver a vista normal' : 'Modo Diseño (vista de página)'}
            onClick={() => {
              const next = !pageLayoutMode;
              setPageLayoutMode(next);
              if (next) setShowPageBreaks(true);
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="1"/>
              <line x1="3" y1="9" x2="21" y2="9"/>
              <line x1="3" y1="15" x2="21" y2="15"/>
            </svg>
          </button>
        </div>
        
        <div className="toolbar-separator"></div>
        
        <div className="toolbar-info">
          <span className="toolbar-chapter-name">{activeChapter.title}</span>
          <span className="toolbar-separator"></span>
          <span className="toolbar-stats">{wordCount} palabras</span>
        </div>
      </div>

      {pageLayoutMode ? (
        <PageLayoutView pushChange={pushChange} onContentChange={onContentChange} />
      ) : (
        <>
          <div className="editor-content" ref={editorContentRef}>
            <div
              ref={measureRef}
              className="editor-measure-ref"
              style={{ width: '400px', fontFamily: 'Georgia, serif', fontSize: '12pt', lineHeight: 1.5 }}
            />
            <div className="editor-wrapper">
              <EditorContent
                editor={editor}
                className={`main-editor${showPageBreaks ? ' show-page-breaks' : ''}`}
              />
              <FootnoteBubbleMenu editor={editor} onInsertFootnote={handleInsertFootnote} />
              <PageBreakMarkers
                pages={pages}
                chapterTitle={activeChapter?.title}
                editorRef={editorContentRef}
                visible={showPageBreaks}
                pageLayout={false}
              />
            </div>
          </div>
          {fnPopover && activeChapter && (
            <FootnotePopover
              anchor={fnPopover}
              chapterId={activeChapter.id}
              onClose={() => setFnPopover(null)}
              onDelete={(refId) => {
                // Remove the marker node from the body for this refId.
                if (!editor) return;
                editor.state.doc.descendants((n, pos) => {
                  if (n.type.name === 'footnoteMark' && n.attrs.refId === refId) {
                    editor.chain().focus().deleteRange({ from: pos, to: pos + n.nodeSize }).run();
                    return false;
                  }
                  return true;
                });
              }}
            />
          )}

          <div className="editor-footer">
            <span className="editor-info">Listo para editar</span>
            <div className="editor-actions">
              <button className="btn btn-primary">
                Guardar capítulo
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export default Editor;
