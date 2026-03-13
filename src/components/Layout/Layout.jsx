import { useSearchParams } from 'react-router-dom';
import { useEffect, useRef, useCallback, useState } from 'react';
import useEditorStore from '../../store/useEditorStore';
import { useBookSync } from '../../hooks/useBookSync';
import { useConfigHistory } from '../../hooks/useConfigHistory';
import { addRecentBook } from '../../utils/recentBooks';
import { exportPdf, exportEpub, exportHtml } from './utils/exporters';
import Header from '../Header/Header';
import PaginationProgressBar from '../PaginationProgressBar/PaginationProgressBar';
import SidebarLeft from '../SidebarLeft/SidebarLeft';
import SidebarRight from '../SidebarRight/SidebarRight';
import UploadArea from '../UploadArea/UploadArea';
import Editor from '../Editor/Editor';
import './Layout.css';

function Layout() {
  const [searchParams] = useSearchParams();
  const bookId = searchParams.get('bookId');

  if (bookId) {
    useBookSync(bookId);
  }

  const bookData = useEditorStore((s) => s.bookData);
  const chapters = useEditorStore((s) => s.bookData?.chapters);
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

  const [editorUndoState, setEditorUndoState] = useState({ canUndo: false, canRedo: false });
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
    const safeChapters = chapters || [];
    if (safeChapters.length > 0) {
      if (confirm('¿Crear nuevo proyecto? Se perderán los cambios sin guardar.')) newProject();
    } else {
      newProject();
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
          alert('Archivo de proyecto no válido');
        }
      } catch (error) {
        alert('Error al abrir proyecto: ' + error.message);
      }
    };
    input.click();
  };

  const handleSaveProject = () => {
    const { bookData: bd, config: cfg } = useEditorStore.getState();
    const json = JSON.stringify({ timestamp: Date.now(), safeBookData: bd, safeConfig: cfg }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `libro-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleContentLoaded = (loadedChapters) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('📥 Content loaded:', loadedChapters);
    }
    loadContent(loadedChapters);
  };

  const handleExportPdf = () => {
    const { bookData: bd, config: cfg } = useEditorStore.getState();
    exportPdf(bd, cfg);
  };

  const handleExportEpub = () => {
    const { bookData: bd } = useEditorStore.getState();
    exportEpub(bd);
  };

  const handleExportHtml = () => {
    const { bookData: bd } = useEditorStore.getState();
    exportHtml(bd);
  };

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
      <PaginationProgressBar />

      <main className="app-main">
        <SidebarLeft />

        {showUpload ? (
          <UploadArea onContentLoaded={handleContentLoaded} />
        ) : (
          <Editor pushChange={pushChange} onContentChange={(time) => setLastSaveTime(time)} />
        )}

        <SidebarRight
          onExportPdf={handleExportPdf}
          onExportEpub={handleExportEpub}
          onExportHtml={handleExportHtml}
        />
      </main>

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
