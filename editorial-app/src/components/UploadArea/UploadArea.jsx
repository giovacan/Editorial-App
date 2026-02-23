import { useState, useRef, useEffect } from 'react';
import './UploadArea.css';

function UploadArea({ onContentLoaded }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [mammothReady, setMammothReady] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js';
    script.onload = () => setMammothReady(true);
    document.head.appendChild(script);
  }, []);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleFile = async (file) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    
    if (ext === 'docx') {
      if (!mammothReady || !window.mammoth) {
        alert('Cargando librería para DOCX... intenta de nuevo en un momento.');
        return;
      }
      
      try {
        const arrayBuffer = await file.arrayBuffer();
        const result = await window.mammoth.convertToHtml({ arrayBuffer });
        const html = result.value;
        parseAndLoadContentFromHtml(html, file.name);
      } catch (error) {
        alert('Error al leer el archivo DOCX: ' + error.message);
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content === 'string') {
        parseAndLoadContent(content, file.name);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleProcessText = () => {
    if (!pasteText.trim()) {
      alert('Ingresa contenido antes de procesar');
      return;
    }
    parseAndLoadContent(pasteText, 'pasted-content');
  };

  const parseAndLoadContent = (content, sourceName) => {
    const lines = content.split('\n').filter(line => line.trim());
    const chapters = [];
    let currentChapter = null;

    lines.forEach((line) => {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('# ') || /^[A-Z][A-Z\s]+$/.test(trimmed)) {
        if (currentChapter) {
          chapters.push(currentChapter);
        }
        currentChapter = {
          id: `chapter-${Date.now()}-${chapters.length}`,
          type: 'chapter',
          title: trimmed.replace(/^#\s*/, ''),
          html: '',
          wordCount: 0
        };
      } else if (currentChapter) {
        currentChapter.html += `<p>${trimmed}</p>`;
      }
    });

    if (currentChapter) {
      chapters.push(currentChapter);
    }

    if (chapters.length === 0) {
      chapters.push({
        id: `chapter-${Date.now()}`,
        type: 'chapter',
        title: 'Capítulo 1',
        html: content.split('\n').map(p => `<p>${p}</p>`).join(''),
        wordCount: content.split(/\s+/).length
      });
    }

    chapters.forEach(ch => {
      const text = ch.html.replace(/<[^>]*>/g, '');
      ch.wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    });

    onContentLoaded(chapters);
  };

  const parseAndLoadContentFromHtml = (htmlContent, sourceName) => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    const chapters = [];
    const headings = tempDiv.querySelectorAll('h1, h2, h3');
    
    if (headings.length > 0) {
      let lastIndex = 0;
      headings.forEach((heading, index) => {
        const title = heading.textContent;
        const nextHeading = headings[index + 1];
        const start = heading.nextSibling;
        
        let chapterHtml = '';
        let node = start;
        while (node && node !== nextHeading) {
          if (node.nodeType === 1) {
            chapterHtml += node.outerHTML;
          } else if (node.nodeType === 3 && node.textContent.trim()) {
            chapterHtml += `<p>${node.textContent}</p>`;
          }
          node = node.nextSibling;
        }
        
        chapters.push({
          id: `chapter-${Date.now()}-${index}`,
          type: heading.tagName === 'H1' ? 'chapter' : 'section',
          title: title,
          html: chapterHtml,
          wordCount: chapterHtml.replace(/<[^>]*>/g, '').split(/\s+/).filter(w => w.length > 0).length
        });
      });
    } else {
      chapters.push({
        id: `chapter-${Date.now()}`,
        type: 'chapter',
        title: 'Capítulo 1',
        html: htmlContent,
        wordCount: htmlContent.replace(/<[^>]*>/g, '').split(/\s+/).filter(w => w.length > 0).length
      });
    }

    onContentLoaded(chapters);
  };

  return (
    <div className="upload-area" role="region" aria-label="Área de carga de archivos">
      <div className="upload-column">
        <div 
          className={`upload-box ${isDragOver ? 'drag-over' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <svg className="upload-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <h2 className="upload-title">Importar manuscrito</h2>
          <p className="upload-subtitle">Arrastra un archivo o haz clic para seleccionar</p>
          <input 
            ref={fileInputRef}
            type="file" 
            accept=".txt,.md,.html,.docx" 
            onChange={handleFileChange} 
            hidden 
            aria-label="Seleccionar archivo"
          />
          <button className="btn btn-primary" onClick={handleFileSelect}>
            Seleccionar archivo
          </button>
          <p className="upload-formats">Formatos: <strong>TXT, MD, HTML, DOCX</strong></p>
        </div>
        <div className="upload-info">
          <h3>Requisitos de archivo</h3>
          <ul>
            <li>Máximo 50 MB</li>
            <li>Formato: TXT, MD, HTML, DOCX</li>
            <li>Usa "# Título" para capítulos</li>
          </ul>
        </div>
      </div>
      
      <div className="upload-divider"><span>O</span></div>
      
      <div className="upload-column">
        <div className="paste-box">
          <h2 className="paste-title">Pegar contenido</h2>
          <p className="paste-subtitle">Copia y pega tu manuscrito aquí</p>
          <textarea 
            className="textarea-paste" 
            placeholder="Pega el contenido de tu libro aquí..."
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            aria-label="Área para pegar contenido"
          />
          <button className="btn btn-primary btn-block" onClick={handleProcessText}>
            Procesar contenido
          </button>
        </div>
        <div className="upload-tips">
          <h3>Tips para mejor resultado</h3>
          <ul>
            <li>Usa "# Capítulo 1" para marcar capítulos</li>
            <li>Usa "## Sección" para subsecciones</li>
            <li>Los párrafos se separan con línea en blanco</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default UploadArea;
