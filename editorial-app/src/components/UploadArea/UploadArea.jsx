import { useState, useRef, useEffect } from 'react';
import './UploadArea.css';

function UploadArea({ onContentLoaded }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [mammothReady, setMammothReady] = useState(() => !!window.mammoth);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (mammothReady) return;
    
    const script = window.document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js';
    script.onload = () => {
      console.log('Mammoth loaded successfully');
      setMammothReady(true);
    };
    script.onerror = () => {
      console.error('Failed to load mammoth');
      alert('Error al cargar la librería DOCX. Por favor intenta de nuevo.');
    };
    document.head.appendChild(script);
  }, [mammothReady]);

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
        
        if (!html || html.trim() === '') {
          alert('El documento DOCX está vacío o no se pudo leer.');
          return;
        }
        
        parseAndLoadContentFromHtml(html, file.name);
      } catch (error) {
        console.error('Error loading DOCX:', error);
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
    reader.onerror = () => {
      alert('Error al leer el archivo');
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

  const parseAndLoadContent = (content) => {
    const lines = content.split('\n').filter(line => line.trim());
    const chapters = [];
    let currentChapter = null;
    let currentSection = null;

    const isChapterHeader = (line) => {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('# ')) return true;
      
      if (/^(capítulo|chapter|cap\.?)\s*#?\d+/i.test(trimmed)) return true;
      if (/^(capítulo|chapter|cap\.?)\s*#?\d+\s*[-–—:]\s*/i.test(trimmed)) return true;
      if (/^(capítulo|chapter|cap\.?)\s+[ivxlcdm]+/i.test(trimmed)) return true;
      if (/^(capítulo|chapter|cap\.?)\s+(primero|segundo|tercero|cuarto|quinto|sexto|séptimo|octavo|noveno|décimo)/i.test(trimmed)) return true;
      
      if (/^(parte|part|book)\s+\d+/i.test(trimmed)) return true;
      if (/^(parte|part|book)\s+[ivxlcdm]+/i.test(trimmed)) return true;
      if (/^(parte|part|book)\s+(primera|segunda|tercera|cuarta|quinta)/i.test(trimmed)) return true;
      
      if (/^libro\s+\d+/i.test(trimmed)) return true;
      
      if (/^CAPÍTULO\s+/i.test(trimmed)) return true;
      if (/^CAPITULO\s+/i.test(trimmed)) return true;
      if (/^CHAPTER\s+/i.test(trimmed)) return true;
      
      const lower = trimmed.toLowerCase();
      const specialChapters = ['prólogo', 'prologo', 'epílogo', 'epilogo', 'introducción', 'introduccion', 'conclusión', 'conclusion', 'dedicatoria', 'agradecimientos', 'bibliografía', 'bibliografia', 'prefacio'];
      if (specialChapters.includes(lower)) return true;
      
      return false;
    };

    const isSectionHeader = (line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('## ')) return true;
      if (trimmed.startsWith('### ')) return true;
      if (/^#{3,}\s+/.test(trimmed)) return true;
      
      if (/^subtítulo|^subtitle/i.test(trimmed)) return true;
      if (/^nota\s+/i.test(trimmed)) return true;
      if (/^\d+\.\d+/.test(trimmed)) return true;
      
      return false;
    };

    lines.forEach((line) => {
      const trimmed = line.trim();

      if (isChapterHeader(trimmed)) {
        if (currentSection && currentChapter) {
          currentChapter.html += `<h3>${currentSection.title}</h3>${currentSection.html}`;
          currentSection = null;
        }
        if (currentChapter) {
          chapters.push(currentChapter);
        }
        currentChapter = {
          id: `chapter-${Date.now()}-${chapters.length}`,
          type: 'chapter',
          title: trimmed.replace(/^#+\s*/, ''),
          html: '',
          wordCount: 0
        };
        currentSection = null;
      } else if (isSectionHeader(trimmed)) {
        if (currentChapter) {
          if (currentSection) {
            currentChapter.html += `<h3>${currentSection.title}</h3>${currentSection.html}`;
          }
          currentSection = {
            id: `section-${Date.now()}-${chapters.length}-${Math.random()}`,
            type: 'section',
            title: trimmed.replace(/^#+\s*/, ''),
            html: ''
          };
        }
      } else if (currentChapter) {
        if (currentSection) {
          currentSection.html += `<p>${trimmed}</p>`;
        } else {
          currentChapter.html += `<p>${trimmed}</p>`;
        }
      }
    });

    if (currentSection && currentChapter) {
      currentChapter.html += `<h3>${currentSection.title}</h3>${currentSection.html}`;
    }

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

  const parseAndLoadContentFromHtml = (htmlContent) => {
    const tempDiv = window.document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    const chapters = [];
    
    const isChapterHeading = (el) => {
      const tag = el.tagName?.toLowerCase();
      const text = el.textContent?.trim() || '';
      
      if (tag === 'h1' || tag === 'h2') return true;
      
      if (tag === 'p' || tag === 'div') {
        const lowerText = text.toLowerCase();
        
        if (/^(capítulo|chapter|cap\.?)\s*#?\d+/i.test(text)) return true;
        if (/^(capítulo|chapter|cap\.?)\s*#?\d+\s*[-–—:]\s*/i.test(text)) return true;
        if (/^(capítulo|chapter|cap\.?)\s+[ivxlcdm]+/i.test(text)) return true;
        if (/^(capítulo|chapter|cap\.?)\s+(primero|segundo|tercero|cuarto|quinto|sexto|séptimo|octavo|noveno|décimo|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)/i.test(text)) return true;
        
        if (/^(parte|part|book)\s+\d+/i.test(text)) return true;
        if (/^(parte|part|book)\s+[ivxlcdm]+/i.test(text)) return true;
        if (/^(parte|part|book)\s+(primera|segunda|tercera|cuarta|quinta|sexta|séptima|octava|novena|décima|first|second|third|fourth|fifth)/i.test(text)) return true;
        
        if (/^libro\s+\d+/i.test(text)) return true;
        
        if (/^capítulo\s+\d+/i.test(text)) return true;
        
        if (/^capitulo\s+\d+/i.test(text)) return true;
        
        if (/^CAPÍTULO\s+/i.test(text)) return true;
        if (/^CAPITULO\s+/i.test(text)) return true;
        if (/^CHAPTER\s+/i.test(text)) return true;
        
        const specialChapters = ['prólogo', 'prologo', 'epílogo', 'epilogo', 'introducción', 'introduccion', 'conclusión', 'conclusion', 'dedicatoria', 'agradecimientos', 'bibliografía', 'bibliografia', 'prefacio', 'colofón', 'colofon'];
        if (specialChapters.includes(lowerText)) return true;
      }
      return false;
    };
    
    const isSubtitle = (el) => {
      const tag = el.tagName?.toLowerCase();
      const text = el.textContent?.trim() || '';

      if (tag === 'h3' || tag === 'h4') return true;

      if (tag === 'p' || tag === 'div') {
        if (/^subtítulo|subtitle/i.test(text)) return true;
        if (/^nota\s+/i.test(text)) return true;
        if (/^reseña/i.test(text)) return true;
        if (/^\d+\.\d+/.test(text)) return true;

        // Solo es subtitle si es corto (títulos/secciones típicamente < 80 chars)
        // Párrafos largos en bold son énfasis, no títulos
        if (text.length > 80) return false;

        try {
          const computedStyle = el.ownerDocument.defaultView?.getComputedStyle(el);
          const fontWeight = computedStyle?.fontWeight;
          if (fontWeight && (fontWeight >= 700 || fontWeight === 'bold')) {
            return true;
          }
        } catch { /* ignore computedStyle errors */ }

        const style = el.getAttribute('style') || '';
        if (style.includes('font-weight: bold') || style.includes('font-weight:700') || style.includes('font-weight:bold')) {
          return true;
        }
      }
      return false;
    };
    
    const allElements = tempDiv.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div, section, article');
    
    // Si no hay suficientes elementos, el contenido puede estar todo en un solo div/p
    // En ese caso, dividir por saltos de línea
    if (allElements.length < 5 && htmlContent.length > 5000) {
      // Dividir el contenido por párrafos naturales
      const paragraphs = htmlContent
        .split(/(?:<br\s*\/?>|\n|\r\n|\r|(?:<\/p>)|(?:<div>)|(?:<\/div>)|(?:<hr\s*\/?>))/i)
        .map(p => p.trim())
        .filter(p => p.length > 0);
      
      // Convertir cada párrafo en un elemento HTML
      const processedHtml = paragraphs
        .map(p => {
          // Si ya tiene tags, dejarlos
          if (/<[a-z]/i.test(p)) return p;
          // Si no, envolver en <p>
          return `<p>${p}</p>`;
        })
        .join('');
      
      tempDiv.innerHTML = processedHtml;
    }
    
    const elementsToProcess = Array.from(tempDiv.children);
    
    let currentChapter = null;
    let currentSection = null;
    
    elementsToProcess.forEach((el, index) => {
      const text = el.textContent?.trim() || '';
      if (!text || text.length < 2) return;

      if (isChapterHeading(el)) {
        if (currentChapter) {
          if (currentSection) {
            currentChapter.html += `<h3>${currentSection.title}</h3>${currentSection.html}`;
            currentSection = null;
          }
          chapters.push(currentChapter);
        }
        currentChapter = {
          id: `chapter-${Date.now()}-${chapters.length}`,
          type: 'chapter',
          title: text,
          html: '',
          wordCount: 0
        };
        currentSection = null;
      } else if (isSubtitle(el)) {
        if (currentChapter) {
          if (currentSection) {
            currentChapter.html += `<h3>${currentSection.title}</h3>${currentSection.html}`;
          }
          currentSection = {
            id: `section-${Date.now()}-${index}`,
            type: 'section',
            title: text,
            html: ''
          };
        }
      } else if (currentChapter) {
        if (currentSection) {
          currentSection.html += el.outerHTML;
        } else {
          currentChapter.html += el.outerHTML;
        }
      }
    });

    if (currentSection && currentChapter) {
      currentChapter.html += `<h3>${currentSection.title}</h3>${currentSection.html}`;
    }
    
    if (currentChapter) {
      chapters.push(currentChapter);
    }
    
    if (chapters.length === 0) {
      chapters.push({
        id: `chapter-${Date.now()}`,
        type: 'chapter',
        title: 'Capítulo 1',
        html: htmlContent,
        wordCount: htmlContent.replace(/<[^>]*>/g, '').split(/\s+/).filter(w => w.length > 0).length
      });
    }
    
    chapters.forEach(ch => {
      const html = ch.html || '';
      const text = html.replace(/<[^>]*>/g, '');
      ch.wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    });

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
          <h3>Formatos detectados como capítulos</h3>
          <ul>
            <li><strong>CAPÍTULO #1 – NEPSIS</strong></li>
            <li><strong>Capítulo 1</strong>, <strong>Capítulo III</strong>, <strong>Capítulo Primero</strong></li>
            <li><strong>Chapter 1</strong>, <strong>Chapter Ten</strong></li>
            <li><strong>Parte I</strong>, <strong>Parte Primera</strong></li>
            <li><strong>Libro 1</strong></li>
            <li><strong>Prólogo</strong>, <strong>Introducción</strong>, <strong>Epílogo</strong></li>
            <li>Encabezados <strong>H1</strong>, <strong>H2</strong> en Word</li>
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
          <h3>Ejemplos de formato</h3>
          <ul>
            <li><code># Capítulo 1</code> o <code>## Subtítulo</code> (Markdown)</li>
            <li><code>Capítulo 1: Título</code></li>
            <li><code>Parte I</code> o <code>Parte Primera</code></li>
            <li>Encabezados en Word se detectan automáticamente</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default UploadArea;
