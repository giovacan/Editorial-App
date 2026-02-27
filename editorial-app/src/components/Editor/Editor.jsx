import { useEffect, useRef, useCallback, useState } from 'react';
import useEditorStore from '../../store/useEditorStore';
import './Editor.css';

function Editor() {
  const editorRef = useRef(null);
  
  const activeChapterId = useEditorStore((s) => s.editing.activeChapterId);
  const chapters = useEditorStore((s) => s.bookData?.chapters);
  const updateChapter = useEditorStore((s) => s.updateChapter);
  
  const [quoteTemplate, setQuoteTemplate] = useState('classic');
  
  const activeChapter = chapters?.find(ch => ch.id === activeChapterId);

  useEffect(() => {
    if (editorRef.current && activeChapter && editorRef.current.innerHTML !== activeChapter.html) {
      editorRef.current.innerHTML = activeChapter.html;
    }
  }, [activeChapterId, activeChapter?.html]);

  const wordCount = activeChapter?.wordCount || 0;

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

  const applyQuote = useCallback((template) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    if (range.collapsed) return;
    
    const selectedText = range.toString();
    if (!selectedText.trim()) return;
    
    const wrapper = document.createElement('blockquote');
    wrapper.className = `quote ${template}`;
    wrapper.textContent = selectedText;
    
    range.deleteContents();
    range.insertNode(wrapper);
    
    handleInput();
    editorRef.current?.focus();
  }, [handleInput]);

  const removeQuote = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    let element = range.commonAncestorContainer;
    
    while (element && element.tagName !== 'BLOCKQUOTE') {
      element = element.parentElement;
    }
    
    if (element && element.tagName === 'BLOCKQUOTE') {
      const text = document.createTextNode(element.textContent);
      element.parentNode?.replaceChild(text, element);
      handleInput();
    }
    editorRef.current?.focus();
  }, [handleInput]);

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
        <div className="toolbar-group" title="Citas">
          <select 
            value={quoteTemplate}
            onChange={(e) => setQuoteTemplate(e.target.value)}
            style={{ padding: '2px 4px', fontSize: '12px', marginRight: '4px' }}
          >
            <option value="classic">Clásico</option>
            <option value="bar">Barra</option>
            <option value="italic">Italiano</option>
            <option value="indent">Sangría</option>
            <option value="minimal">Minimal</option>
          </select>
          <button 
            className="btn btn-icon" 
            title="Aplicar cita al texto seleccionado" 
            onClick={() => applyQuote(quoteTemplate)}
          >
            ❝
          </button>
          <button 
            className="btn btn-icon" 
            title="Quitar formato de cita" 
            onClick={removeQuote}
          >
            ✕
          </button>
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
