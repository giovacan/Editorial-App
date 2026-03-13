import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import useEditorStore from '../../store/useEditorStore';
import { usePagination } from '../../hooks/usePagination';
import PageBreakMarkers from './PageBreakMarkers';
import './Editor.css';

function Editor({ pushChange, onContentChange }) {
  const activeChapterId = useEditorStore((s) => s.editing.activeChapterId);
  const chapters = useEditorStore((s) => s.bookData?.chapters);
  
  const updateChapter = useEditorStore((s) => s.updateChapter);
  const config = useEditorStore((s) => s.config);
  const ui = useEditorStore((s) => s.ui);
  const setUi = useEditorStore((s) => s.setUi);
  
  const [quoteTemplate, setQuoteTemplate] = useState('classic');
  const [editorState, setEditorState] = useState({ canUndo: false, canRedo: false });
  const [showPageBreaks, setShowPageBreaks] = useState(false);
  
  const activeChapter = chapters?.find(ch => ch.id === activeChapterId);
  const saveTimeoutRef = useRef(null);
  const lastSaveTimeRef = useRef(null);
  const editorRef = useRef(null);
  const editorContentRef = useRef(null);

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
      Underline,
    ],
    content: activeChapter?.html || '',
    onUpdate: ({ editor: ed }) => {
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
      const currentContent = editor.getHTML();
      if (currentContent !== activeChapter.html) {
        editor.commands.setContent(activeChapter.html || '');
      }
    }
  }, [activeChapterId, activeChapter?.html, editor]);

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
        </div>
        
        <div className="toolbar-separator"></div>
        
        <div className="toolbar-info">
          <span className="toolbar-chapter-name">{activeChapter.title}</span>
          <span className="toolbar-separator"></span>
          <span className="toolbar-stats">{wordCount} palabras</span>
        </div>
      </div>

      <div className="editor-content" ref={editorContentRef}>
        <div ref={measureRef} className="editor-measure-ref" style={{ width: '400px', fontFamily: 'Georgia, serif', fontSize: '12pt', lineHeight: 1.5 }}></div>
        <div className="editor-wrapper">
          <EditorContent editor={editor} className={`main-editor ${showPageBreaks ? 'show-page-breaks' : ''}`} />
          <PageBreakMarkers 
            pages={pages} 
            chapterTitle={activeChapter?.title} 
            editorRef={editorContentRef}
            visible={showPageBreaks}
          />
        </div>
      </div>

      <div className="editor-footer">
        <span className="editor-info">Listo para editar</span>
        <div className="editor-actions">
          <button className="btn btn-primary">
            Guardar capítulo
          </button>
        </div>
      </div>
    </section>
  );
}

export default Editor;
