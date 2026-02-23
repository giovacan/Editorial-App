import useEditorStore from '../../store/useEditorStore';
import Header from '../Header/Header';
import SidebarLeft from '../SidebarLeft/SidebarLeft';
import SidebarRight from '../SidebarRight/SidebarRight';
import UploadArea from '../UploadArea/UploadArea';
import Editor from '../Editor/Editor';
import './Layout.css';

function Layout() {
  const { ui, document, loadContent, newProject } = useEditorStore();

  const handleNewProject = () => {
    if (document.chapters.length > 0) {
      if (confirm('¿Crear nuevo proyecto? Se perderán los cambios sin guardar.')) {
        newProject();
      }
    } else {
      newProject();
    }
  };

  const handleSaveProject = () => {
    const projectData = {
      timestamp: Date.now(),
      document: useEditorStore.getState().document,
      config: useEditorStore.getState().config
    };

    const json = JSON.stringify(projectData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `libro-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleContentLoaded = (chapters) => {
    loadContent(chapters);
  };

  const handleExportPdf = () => {
    alert('Exportación PDF - Funcionalidad en desarrollo');
  };

  const handleExportEpub = () => {
    alert('Exportación EPUB - Funcionalidad en desarrollo');
  };

  const handleExportHtml = () => {
    const { document } = useEditorStore.getState();
    
    let html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${document.title || 'Sin título'}</title>
</head>
<body>
    <h1>${document.title || 'Sin título'}</h1>
`;

    document.chapters.forEach(chapter => {
      html += `
    <section>
        <h2>${chapter.title}</h2>
        ${chapter.html}
    </section>
`;
    });

    html += `
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `libro-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-container" role="application" aria-label="Editorial App">
      <Header onNewProject={handleNewProject} onSaveProject={handleSaveProject} />
      
      <main className="app-main">
        <SidebarLeft />
        
        {ui.showUpload ? (
          <UploadArea onContentLoaded={handleContentLoaded} />
        ) : (
          <Editor />
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
