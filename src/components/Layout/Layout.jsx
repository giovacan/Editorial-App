import { useSearchParams } from 'react-router-dom';
import { createBook, saveChapters } from '../../services/books';
import { retagBookImages } from '../../utils/imageStore';
import { useEffect, useRef, useCallback, useState } from 'react';
import useEditorStore from '../../store/useEditorStore';
import { useBookSync } from '../../hooks/useBookSync';
import { useConfigHistory } from '../../hooks/useConfigHistory';
import { useAuth } from '../../contexts/AuthContext';
import { syncBookImages } from '../../utils/imageSync';
import { addRecentBook } from '../../utils/recentBooks';
import { toast } from '../../utils/toast';
import ExportPreviewModal from '../ExportPreviewModal/ExportPreviewModal';
import Header from '../Header/Header';
import SidebarLeft from '../SidebarLeft/SidebarLeft';
import SidebarRight from '../SidebarRight/SidebarRight';
import UploadArea from '../UploadArea/UploadArea';
import Editor from '../Editor/Editor';
import CentralSearchBar from './CentralSearchBar';
import './Layout.css';

function Layout() {
  const [searchParams, setSearchParams] = useSearchParams();
  const bookId = searchParams.get('bookId');

  // Call unconditionally (Rules of Hooks); useBookSync no-ops when bookId is
  // falsy. flushWrites forces pending Firestore writes on demand (Save button).
  const { flushWrites } = useBookSync(bookId);

  const { user } = useAuth();
  const bookData = useEditorStore((s) => s.bookData);
  const chapters = useEditorStore((s) => s.bookData?.chapters);

  // B2 PR-B: with a cloud book + signed-in owner, upload the book's images from
  // IndexedDB to Firebase Storage in the BACKGROUND (never blocks the UI).
  // Keyed on the chapter set so newly-imported images get picked up too.
  useEffect(() => {
    if (!bookId || !user) return;
    const t = setTimeout(() => { syncBookImages(bookId); }, 800);
    return () => clearTimeout(t);
  }, [bookId, user, chapters]);

  // B2 PR-B: promote a local book to the cloud whenever there's a signed-in user
  // but no cloud bookId and the book has content. Covers BOTH (a) importing a
  // .docx while logged in, and (b) an anonymous user who imported locally then
  // logs in. Creates the Firestore book, re-tags its local images to the new id,
  // and switches the URL — which triggers useBookSync (persist chapters) and the
  // image sync effect above. Guarded so it runs once per promotion.
  const promotingRef = useRef(false);
  useEffect(() => {
    if (!user || bookId || promotingRef.current) return;
    const hasContent = (chapters || []).some((ch) => ch.html && ch.html.trim());
    if (!hasContent) return;
    promotingRef.current = true;
    (async () => {
      try {
        const localId = bookData?.id || null;
        const localChapters = bookData?.chapters || [];
        const newBookId = await createBook(user.uid, {
          title: bookData?.title || 'Libro sin título',
          author: bookData?.author || '',
          bookType: bookData?.bookType || 'novela',
          pageFormat: bookData?.pageFormat || '6x9',
        });
        // CRITICAL: persist the chapters to the new book BEFORE switching the
        // URL. Otherwise useBookSync mounts on the new (empty) book, loads 0
        // chapters and wipes the local content — the book shows up empty in
        // "mis libros" and the preview goes blank.
        if (localChapters.length) await saveChapters(newBookId, localChapters);
        if (localId) await retagBookImages(localId, newBookId);
        setSearchParams({ bookId: newBookId }, { replace: true });
        toast.success('Libro guardado en tu cuenta.');
      } catch (e) {
        promotingRef.current = false;
        console.warn('No se pudo promover el libro local a la nube:', e);
        toast.error('No se pudo guardar el libro en tu cuenta. Sigue disponible localmente.');
      }
    })();
  }, [user, bookId, chapters]); // eslint-disable-line react-hooks/exhaustive-deps
  const config = useEditorStore((s) => s.config);
  const ui = useEditorStore((s) => s.ui);
  const loadContent = useEditorStore((s) => s.loadContent);
  const newProject = useEditorStore((s) => s.newProject);
  const setConfig = useEditorStore((s) => s.setConfig);

  const {
    canUndo,
    canRedo,
    changeLog,
    pushChange,
    undo,
    redo,
    restore,
    showHistoryPanel,
    setShowHistoryPanel
  } = useConfigHistory(config);

  const [editorUndoState, setEditorUndoState]   = useState({ canUndo: false, canRedo: false });
  const [exportModal, setExportModal]            = useState({ open: false, format: 'pdf' });
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const isRestoringRef = useRef(false);
  const prevConfigRef = useRef(config);

  // Save to recent books when bookData changes
  useEffect(() => {
    if (bookData?.title) {
      addRecentBook({
        id: bookData.id || bookId || 'local-' + Date.now(),
        title: bookData.title,
        author: bookData.author,
        lastOpened: Date.now()
      });
    }
  }, [bookData?.id, bookData?.title]);

  // Track editor undo/redo state
  useEffect(() => {
    const handleEditorStateChange = () => {
      setEditorUndoState({
        canUndo: window.editorCanUndo ? window.editorCanUndo() : false,
        canRedo: window.editorCanRedo ? window.editorCanRedo() : false
      });
    };
    window.addEventListener('editorStateChange', handleEditorStateChange);
    handleEditorStateChange();
    return () => window.removeEventListener('editorStateChange', handleEditorStateChange);
  }, []);

  // Expose trackChange for sidebar/editor components
  const trackChangeFn = useCallback((action, customConfig) => {
    pushChange(action, customConfig || config);
  }, [config, pushChange]);

  useEffect(() => {
    window.trackChange = trackChangeFn;
    return () => { delete window.trackChange; };
  }, [trackChangeFn]);

  // Auto-push config changes to history
  useEffect(() => {
    if (isRestoringRef.current) {
      isRestoringRef.current = false;
      return;
    }
    if (prevConfigRef.current && config && JSON.stringify(prevConfigRef.current) !== JSON.stringify(config)) {
      pushChange('Cambio de configuración', config);
    }
    prevConfigRef.current = config;
  }, [config, pushChange]);

  const handleUndo = useCallback(() => {
    if (window.editorUndo && window.editorUndo()) return;
    const prev = undo();
    if (prev) setConfig(prev);
  }, [undo, setConfig]);

  const handleRedo = useCallback(() => {
    if (window.editorRedo && window.editorRedo()) return;
    const next = redo();
    if (next) setConfig(next);
  }, [redo, setConfig]);

  const handleRestore = (configToRestore) => {
    isRestoringRef.current = true;
    restore(configToRestore);
    setConfig(configToRestore);
    setShowHistoryPanel(false);
  };

  const handleNewProject = () => {
    const startNew = () => {
      // Detach from any cloud book FIRST: while ?bookId=… is in the URL,
      // useBookSync keeps re-loading that book (loadContent sets showUpload:false)
      // and would immediately hide the UploadArea again. Clearing the param
      // stops the sync so the fresh, empty project (showUpload:true) sticks.
      if (bookId) setSearchParams({}, { replace: true });
      promotingRef.current = false; // allow a future local→cloud promotion
      newProject();
    };
    const safeChapters = chapters || [];
    if (safeChapters.length > 0) {
      if (confirm('¿Crear nuevo proyecto? Se perderán los cambios sin guardar.')) startNew();
    } else {
      startNew();
    }
  };

  const handleOpenProject = () => {
    const input = window.document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const projectData = JSON.parse(await file.text());
        if (projectData.safeBookData?.chapters && projectData.safeConfig) {
          useEditorStore.setState({
            bookData: projectData.safeBookData,
            config: projectData.safeConfig,
            ui: { showUpload: false, showPreview: true, activeTab: 'structure' },
            editing: { activeChapterId: projectData.safeBookData.chapters[0]?.id || null, isDirty: false }
          });
        } else {
          toast.error('Archivo de proyecto no válido');
        }
      } catch (error) {
        toast.error('Error al abrir proyecto: ' + error.message);
      }
    };
    input.click();
  };

  const handleSaveProject = async () => {
    const { bookData: bd, config: cfg } = useEditorStore.getState();
    const json = JSON.stringify({ timestamp: Date.now(), safeBookData: bd, safeConfig: cfg }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `libro-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    // For a cloud book, also flush pending writes to Firestore immediately
    // (otherwise they only persist via the debounced auto-save).
    if (bookId && flushWrites) {
      try {
        await flushWrites();
        toast.success('Proyecto guardado (local + nube).');
      } catch (err) {
        toast.error('Guardado local OK, pero falló la nube: ' + (err?.message || err));
      }
    } else {
      toast.success('Proyecto descargado.');
    }
  };

  const handleContentLoaded = (loadedChapters, bookTitle) => {
    loadContent(loadedChapters, bookTitle);
    // If signed in without a cloud book, the promotion effect below picks this
    // up (chapters now have content) and creates the cloud book automatically.
  };

  const handleExportPdf  = () => setExportModal({ open: true, format: 'pdf' });
  const handleExportEpub = () => setExportModal({ open: true, format: 'epub' });
  const handleExportHtml = () => setExportModal({ open: true, format: 'html' });

  // Search result → open that chapter's editor and select the term. Leaving the
  // upload screen mounts the Editor, which exposes window.editorGoToMatch; a
  // short retry covers the mount/setContent delay when we had to switch views.
  const handleSearchGoToMatch = useCallback((match, query) => {
    if (!match) return;
    const st = useEditorStore.getState();
    const wasUpload = st.ui?.showUpload ?? true;
    if (wasUpload) {
      useEditorStore.setState((s) => ({ ui: { ...s.ui, showUpload: false } }));
    }
    const run = (tries) => {
      if (typeof window.editorGoToMatch === 'function') {
        window.editorGoToMatch(match, query);
      } else if (tries > 0) {
        setTimeout(() => run(tries - 1), 60);
      }
    };
    run(wasUpload ? 8 : 2);
  }, []);

  const safeUi = ui || { showUpload: true };
  const showUpload = safeUi?.showUpload ?? true;

  return (
    <div className="app-container" role="application" aria-label="Editorial App">
      <Header
        onNewProject={handleNewProject}
        onSaveProject={handleSaveProject}
        onOpenProject={handleOpenProject}
        canUndo={editorUndoState.canUndo}
        canRedo={editorUndoState.canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        changeLog={changeLog}
        showHistoryPanel={showHistoryPanel}
        setShowHistoryPanel={setShowHistoryPanel}
        onRestore={handleRestore}
        lastSaveTime={lastSaveTime}
      />
      <main className="app-main">
        <SidebarLeft />

        <div className="central-column">
          <CentralSearchBar
            chapters={chapters}
            onGoToMatch={handleSearchGoToMatch}
          />
          {showUpload ? (
            <UploadArea onContentLoaded={handleContentLoaded} bookId={bookId || bookData?.id || null} />
          ) : (
            <Editor pushChange={pushChange} onContentChange={(time) => setLastSaveTime(time)} />
          )}
        </div>

        <SidebarRight
          onExportPdf={handleExportPdf}
          onExportEpub={handleExportEpub}
          onExportHtml={handleExportHtml}
        />
      </main>

      {exportModal.open && (
        <ExportPreviewModal
          initialFormat={exportModal.format}
          onClose={() => setExportModal({ open: false, format: 'pdf' })}
        />
      )}

      <footer className="app-footer" role="contentinfo">
        <div className="footer-content">
          <p className="footer-version">Editorial App v1.0.0</p>
          <nav className="footer-links">
            <a href="#">Documentación</a>
            <span className="separator">•</span>
            <a href="#">Atajos</a>
            <span className="separator">•</span>
            <a href="#">Acerca de</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export default Layout;
