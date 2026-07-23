import { useState, useRef, useEffect } from 'react';
import { toast } from '../../utils/toast';
import { extractImagesFromHtml } from '../../utils/extractImages';
import ChapterDetectionDialog from '../ChapterDetectionDialog/ChapterDetectionDialog';
import useEditorStore from '../../store/useEditorStore';
import { detectChaptersLocal } from './utils/chapterDetection';
import { parseTextContent, parseHtmlContent } from './utils/contentParser';
import { useAuth } from '../../contexts/AuthContext';
import './UploadArea.css';

function UploadArea({ onContentLoaded, onChaptersDetected, bookId = null }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [mammothReady, setMammothReady] = useState(() => !!window.mammoth);
  const [detectedChaptersLocal, setDetectedChaptersLocal] = useState([]);
  const [pendingChapters, setPendingChapters] = useState(null);
  const [pendingBookTitle, setPendingBookTitle] = useState('');
  const [showChapterDetection, setShowChapterDetection] = useState(false);
  const [chapterDetectionConfirmed, setChapterDetectionConfirmed] = useState(false);
  const fileInputRef = useRef(null);
  // B2 perf: image extraction runs in the background while the chapter dialog is
  // shown. extractionRef holds that promise; hadImagesRef tells confirm whether
  // to re-parse the extracted html (images) or use the already-parsed chapters.
  const extractionRef = useRef(null);
  const hadImagesRef = useRef(false);

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
      setDetectedChaptersLocal(detected);
      setPendingChapters(chapters);
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
        const _t0 = performance.now();
        const arrayBuffer = await file.arrayBuffer();
        const result = await window.mammoth.convertToHtml({ arrayBuffer });
        if (!result.value?.trim()) { toast.error('El documento DOCX está vacío o no se pudo leer.'); return; }
        const rawHtml = result.value;
        console.log(`[import] mammoth ${(performance.now() - _t0).toFixed(0)}ms · ${(rawHtml.length/1024).toFixed(0)}KB · ${(rawHtml.match(/<img/gi)||[]).length} imgs`);
        const _tDlg = performance.now();
        const hasImages = rawHtml.indexOf('<img') !== -1;
        hadImagesRef.current = hasImages;

        // B2 perf: image extraction (decode + measure every image) is the slow
        // part (~7s for 100+ images) and the chapter-detection dialog DOESN'T
        // need it — detection reads text headings only. So kick off extraction
        // in the BACKGROUND and show the dialog immediately; we await the result
        // when the user confirms (by then it's usually done). Falls back to raw
        // HTML if extraction fails. No images → skip entirely (raw == final).
        extractionRef.current = hasImages
          ? extractImagesFromHtml(rawHtml, bookId).catch((e) => {
              console.warn('extractImagesFromHtml falló, importando sin extraer:', e);
              return rawHtml;
            })
          : Promise.resolve(rawHtml);

        if (!user && hasImages) {
          toast.info('Tu libro tiene imágenes guardadas solo en este navegador. Inicia sesión para guardarlas en la nube y no perderlas.');
        }

        // Detect chapters from the RAW html now (fast) → show the dialog. The
        // final store insert uses the extracted html (see handleChaptersConfirm).
        handleHtmlContent(rawHtml);
        console.log(`[import] detección+diálogo ${(performance.now() - _tDlg).toFixed(0)}ms`);
      } catch (error) {
        toast.error('Error al leer el archivo DOCX: ' + error.message);
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
    const { chapters, detectedHeadings, bookTitle } = parseHtmlContent(htmlContent);
    if (detectedHeadings.length > 0) {
      const chapterDetections = chapters.map((ch, idx) => ({
        chapterId: ch.id, chapterIndex: idx,
        chapterTitle: ch.title, detectedTitle: ch.title, confirmed: true
      }));
      setDetectedChaptersLocal(chapterDetections);
      setPendingChapters(chapters);
      setPendingBookTitle(bookTitle || '');
      setShowChapterDetection(true);
    } else {
      // No chapter dialog → load directly. Still swap in the extracted html so
      // base64 never reaches the store (await the background extraction first).
      setConfirmedChapterTitles([]);
      if (hadImagesRef.current && extractionRef.current) {
        extractionRef.current.then((extractedHtml) => {
          const parsed = parseHtmlContent(extractedHtml);
          extractionRef.current = null; hadImagesRef.current = false;
          onContentLoaded(parsed.chapters?.length ? parsed.chapters : chapters, parsed.bookTitle || bookTitle || '');
        });
      } else {
        onContentLoaded(chapters, bookTitle || '');
      }
    }
  };

  const handleChaptersConfirm = async (confirmedList) => {
    setConfirmedChapterTitles(confirmedList.filter(ch => ch.confirmed).map(ch => ch.detectedTitle));
    if (onChaptersDetected) onChaptersDetected(confirmedList);

    // The dialog was shown from chapters parsed off the RAW html (fast, but with
    // base64 still inline). Before storing, swap in the chapters parsed from the
    // EXTRACTED html (images pulled out → data-img-id). Await the background
    // extraction that started at import (usually already done by now).
    let chaptersToLoad = pendingChapters;
    let titleToLoad = pendingBookTitle;
    if (hadImagesRef.current && extractionRef.current) {
      try {
        const extractedHtml = await extractionRef.current;
        const parsed = parseHtmlContent(extractedHtml);
        if (parsed.chapters?.length) { chaptersToLoad = parsed.chapters; titleToLoad = parsed.bookTitle || titleToLoad; }
      } catch (e) {
        console.warn('No se pudo re-parsear el html con imágenes extraídas:', e);
      }
    }
    extractionRef.current = null;
    hadImagesRef.current = false;

    if (chaptersToLoad) { onContentLoaded(chaptersToLoad, titleToLoad); setPendingChapters(null); setPendingBookTitle(''); }
    // Dialog stays open — closes automatically when pagination finishes
    setChapterDetectionConfirmed(true);
  };

  const handleChaptersCancel = () => {
    setShowChapterDetection(false);
    setChapterDetectionConfirmed(false);
    setPendingChapters(null);
    setConfirmedChapterTitles([]);
  };

  // Close dialog automatically when pagination finishes (after confirm was clicked)
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
      {showChapterDetection && (
        <ChapterDetectionDialog
          chapters={detectedChaptersLocal}
          onConfirm={handleChaptersConfirm}
          onCancel={handleChaptersCancel}
        />
      )}
      <div className="upload-area" role="region" aria-label="Área de carga de archivos">
        <div className="upload-column">
          <div
            className={`upload-box ${isDragOver ? 'drag-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
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
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              hidden
              aria-label="Seleccionar archivo"
            />
            <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
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
    </>
  );
}

export default UploadArea;
