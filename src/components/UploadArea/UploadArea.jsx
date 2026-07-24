import { useState, useRef, useEffect } from 'react';
import { toast } from '../../utils/toast';
import { extractImagesFromHtml } from '../../utils/extractImages';
import { docxToHtml } from '../../utils/docxToHtml';
import ChapterReview from '../ChapterReview/ChapterReview';
import useEditorStore from '../../store/useEditorStore';
import { detectChaptersLocal } from './utils/chapterDetection';
import { parseTextContent, parseHtmlContent } from './utils/contentParser';
import { useAuth } from '../../contexts/AuthContext';
import './UploadArea.css';

function UploadArea({ onContentLoaded, onChaptersDetected, bookId = null }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [mammothReady, setMammothReady] = useState(() => !!window.mammoth);
  const [pendingChapters, setPendingChapters] = useState(null);
  const [pendingBookTitle, setPendingBookTitle] = useState('');
  const [showChapterDetection, setShowChapterDetection] = useState(false);
  const [chapterDetectionConfirmed, setChapterDetectionConfirmed] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef(null);

  const setConfirmedChapterTitles = useEditorStore(s => s.setConfirmedChapterTitles);
  const paginationActive = useEditorStore(s => s.paginationProgress.isActive);
  const { user } = useAuth();

  // Lazy-load mammoth for DOCX support
  useEffect(() => {
    if (mammothReady) return;
    const script = window.document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js';
    script.onload = () => setMammothReady(true);
    script.onerror = () => toast.error('Error al cargar la librería DOCX. Por favor intenta de nuevo.');
    document.head.appendChild(script);
  }, [mammothReady]);

  const showDetectionDialog = (chapters) => {
    const detected = detectChaptersLocal(chapters);
    if (detected.length > 0) {
      setPendingChapters(chapters);
      setPendingBookTitle('');
      setShowChapterDetection(true);
    } else {
      setConfirmedChapterTitles([]);
      onContentLoaded(chapters);
    }
  };

  const handleFile = async (file) => {
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'docx') {
      if (!mammothReady || !window.mammoth) {
        toast.info('Cargando librería para DOCX… intenta de nuevo en un momento.');
        return;
      }
      try {
        setIsImporting(true);
        // Decode the .docx in a Worker (off the main thread) so the UI stays
        // responsive during the heavy ~9-16s convert on image-heavy books.
        const rawHtml = await docxToHtml(file);
        if (!rawHtml?.trim()) { toast.error('El documento DOCX está vacío o no se pudo leer.'); return; }
        const hasImages = rawHtml.indexOf('<img') !== -1;

        // Extract images (base64 → data-img-id in the content store) BEFORE the
        // review, so the review's preview shows real images and the html that
        // enters the store is already lightweight. This runs during the
        // "Procesando documento…" spinner. Falls back to raw html on failure.
        let finalHtml = rawHtml;
        if (hasImages) {
          try { finalHtml = await extractImagesFromHtml(rawHtml, bookId); }
          catch (e) { console.warn('extractImagesFromHtml falló, importando sin extraer:', e); }
          if (!user) {
            toast.info('Tu libro tiene imágenes guardadas solo en este navegador. Inicia sesión para guardarlas en la nube y no perderlas.');
          }
        }
        handleHtmlContent(finalHtml);
      } catch (error) {
        toast.error('Error al leer el archivo DOCX: ' + error.message);
      } finally {
        setIsImporting(false);
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === 'string') handleTextContent(e.target.result);
    };
    reader.onerror = () => toast.error('Error al leer el archivo');
    reader.readAsText(file, 'UTF-8');
  };

  const handleTextContent = (content) => {
    const chapters = parseTextContent(content);
    showDetectionDialog(chapters);
  };

  const handleHtmlContent = (htmlContent) => {
    // htmlContent already has images extracted (data-img-id) if there were any.
    const { chapters, detectedHeadings, bookTitle } = parseHtmlContent(htmlContent);
    if (detectedHeadings.length > 0) {
      // Open the full-screen "Revisa tus capítulos" step over the REAL chapters.
      setPendingChapters(chapters);
      setPendingBookTitle(bookTitle || '');
      setShowChapterDetection(true);
    } else {
      // No chapters detected → load directly into the editor.
      setConfirmedChapterTitles([]);
      onContentLoaded(chapters, bookTitle || '');
    }
  };

  // Continue: load the chapters the user edited in the review.
  const handleReviewConfirm = (editedChapters, reviewBookTitle) => {
    if (onChaptersDetected) onChaptersDetected(editedChapters);
    onContentLoaded(editedChapters, reviewBookTitle || pendingBookTitle || '');
    setPendingChapters(null);
    // Review stays open (shows the progress bar) — closes when pagination ends.
    setChapterDetectionConfirmed(true);
  };

  // Omitir revisión: load the chapters as detected, no edits.
  const handleReviewCancel = (originalChapters, reviewBookTitle) => {
    setConfirmedChapterTitles([]);
    onContentLoaded(originalChapters, reviewBookTitle || pendingBookTitle || '');
    setPendingChapters(null);
    setChapterDetectionConfirmed(true);
  };

  // Close the review automatically when pagination finishes (after confirm).
  useEffect(() => {
    if (!paginationActive && chapterDetectionConfirmed && showChapterDetection) {
      setShowChapterDetection(false);
      setChapterDetectionConfirmed(false);
    }
  }, [paginationActive, chapterDetectionConfirmed, showChapterDetection]);

  const handleProcessText = () => {
    if (!pasteText.trim()) { toast.error('Ingresa contenido antes de procesar'); return; }
    handleTextContent(pasteText);
  };

  return (
    <>
      {showChapterDetection && pendingChapters && (
        <ChapterReview
          chapters={pendingChapters}
          bookTitle={pendingBookTitle}
          onConfirm={handleReviewConfirm}
          onCancel={handleReviewCancel}
        />
      )}
      <div className="upload-area" role="region" aria-label="Área de carga de archivos">
        <div className="upload-column">
          <div
            className={`upload-box ${isDragOver ? 'drag-over' : ''} ${isImporting ? 'is-importing' : ''}`}
            onDragOver={(e) => { if (isImporting) return; e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragOver(false); if (isImporting) return; const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          >
            {isImporting ? (
              <>
                <div className="upload-spinner" aria-hidden="true" />
                <h2 className="upload-title">Procesando documento…</h2>
                <p className="upload-subtitle">Leyendo el archivo y sus imágenes. Esto puede tardar unos segundos en libros grandes.</p>
              </>
            ) : (
              <>
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
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  hidden
                  aria-label="Seleccionar archivo"
                />
                <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
                  Seleccionar archivo
                </button>
                <p className="upload-formats">Formatos: <strong>TXT, MD, HTML, DOCX</strong></p>
              </>
            )}
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
    </>
  );
}

export default UploadArea;
