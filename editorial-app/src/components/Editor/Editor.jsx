import { useEffect, useRef, useMemo, useCallback } from 'react';
import useEditorStore from '../../store/useEditorStore';
import './Editor.css';

function Editor() {
  const editorRef = useRef(null);
  
  const bookData = useEditorStore((state) => state.bookData);
  const editing = useEditorStore((state) => state.editing);
  const updateChapter = useEditorStore((state) => state.updateChapter);
  const setActiveChapter = useEditorStore((state) => state.setActiveChapter);
  
  const activeChapter = bookData?.chapters?.find(ch => ch.id === editing?.activeChapterId);

  useEffect(() => {
    if (editorRef.current && activeChapter && editorRef.current.innerHTML !== activeChapter.html) {
      editorRef.current.innerHTML = activeChapter.html;
    }
  }, [editing?.activeChapterId]);

  const wordCount = useMemo(() => {
    if (!editorRef.current) return activeChapter?.wordCount || 0;
    return editorRef.current.innerText.split(/\s+/).filter(w => w.length > 0).length;
  }, [activeChapter?.wordCount]);

  const handleInput = useCallback(() => {
    if (activeChapter && editorRef.current) {
      const html = editorRef.current.innerHTML;
      const text = editorRef.current.innerText;
      const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
      updateChapter(activeChapter.id, { html, wordCount });
    }
  }, [activeChapter, updateChapter]);

  const applyFormat = useCallback((command) => {
    window.document.execCommand(command, false, null);
    editorRef.current?.focus();
  }, []);

  if (!activeChapter) {
    return (
      <div className="editor-area">
        <div className="editor-empty">
          <p>Selecciona un capítulo para empezar a editar</p>
        </div>
      </div>
    );
  }

  return (
    <section className="editor-section" role="main" aria-label="Editor de contenido">
      <div className="editor-toolbar" role="toolbar" aria-label="Herramientas de edición">
        <div className="toolbar-group">
          <button className="btn btn-icon" title="Deshacer (Ctrl+Z)" onClick={() => applyFormat('undo')}>↶</button>
          <button className="btn btn-icon" title="Rehacer (Ctrl+Shift+Z)" onClick={() => applyFormat('redo')}>↷</button>
        </div>
        <div className="toolbar-separator"></div>
        <div className="toolbar-group">
          <button className="btn btn-icon" title="Negrita (Ctrl+B)" onClick={() => applyFormat('bold')}><strong>B</strong></button>
          <button className="btn btn-icon" title="Cursiva (Ctrl+I)" onClick={() => applyFormat('italic')}><em>I</em></button>
          <button className="btn btn-icon" title="Tachado" onClick={() => applyFormat('strikeThrough')}><del>S</del></button>
        </div>
        <div className="toolbar-separator"></div>
        <div className="toolbar-group">
          <button className="btn btn-icon" title="Lista con viñetas" onClick={() => applyFormat('insertUnorderedList')}>•</button>
          <button className="btn btn-icon" title="Lista numerada" onClick={() => applyFormat('insertOrderedList')}>1.</button>
        </div>
        <div className="toolbar-separator"></div>
        <div className="toolbar-info">
          <span className="toolbar-chapter-name">{activeChapter.title}</span>
          <span className="toolbar-separator"></span>
          <span className="toolbar-stats">{wordCount} palabras</span>
        </div>
      </div>

      <div className="editor-content">
        <div 
          ref={editorRef}
          className="main-editor" 
          contentEditable="true" 
          spellCheck="true"
          onInput={handleInput}
          role="textbox" 
          aria-label="Editor de contenido del capítulo"
          aria-multiline="true"
        />
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
