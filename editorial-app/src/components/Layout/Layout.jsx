import useEditorStore from '../../store/useEditorStore';
import { KDP_STANDARDS } from '../../utils/kdpStandards';
import Header from '../Header/Header';
import SidebarLeft from '../SidebarLeft/SidebarLeft';
import SidebarRight from '../SidebarRight/SidebarRight';
import UploadArea from '../UploadArea/UploadArea';
import Editor from '../Editor/Editor';
import './Layout.css';

function Layout() {
  const chapters = useEditorStore((s) => s.bookData?.chapters);
  const ui = useEditorStore((s) => s.ui);
  const loadContent = useEditorStore((s) => s.loadContent);
  const newProject = useEditorStore((s) => s.newProject);
  
  const safeChapters = chapters || [];
  const safeUi = ui || { showPreview: false, showUpload: true, activeTab: 'structure' };

  const handleNewProject = () => {
    if (safeChapters?.length > 0) {
      if (confirm('¿Crear nuevo proyecto? Se perderán los cambios sin guardar.')) {
        newProject();
      }
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
        const text = await file.text();
        const projectData = JSON.parse(text);
        
        if (projectData.safeBookData && projectData.safeBookData.chapters && projectData.safeConfig) {
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
    const projectData = {
      timestamp: Date.now(),
      safeBookData: useEditorStore.getState().bookData,
      safeConfig: useEditorStore.getState().config
    };

    const json = JSON.stringify(projectData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `libro-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleContentLoaded = (chapters) => {
    console.log('📥 Content loaded:', chapters);
    loadContent(chapters);
  };

  const handleExportPdf = async () => {
    // Lazy load html2pdf only when needed
    const { default: html2pdf } = await import('html2pdf.js');

    const { bookData: safeBookData, config: safeConfig } = useEditorStore.getState();

    const bookConfig = KDP_STANDARDS.getBookTypeConfig(safeBookData.bookType);
    const pageFormat = KDP_STANDARDS.getPageFormat(safeConfig.pageFormat || bookConfig.recommendedFormat);

    const marginMM = {
      top: bookConfig.marginTop * 25.4,
      bottom: bookConfig.marginBottom * 25.4,
      left: (bookConfig.marginLeft + (bookConfig.gutter || 0)) * 25.4,
      right: bookConfig.marginRight * 25.4
    };

    let contentHtml = `
      <div style="font-family: ${bookConfig.fontFamily}; font-size: ${bookConfig.fontSize}pt; line-height: ${bookConfig.lineHeight};">
    `;

    safeBookData.chapters.forEach((chapter, index) => {
      contentHtml += `
        <div style="page-break-before: ${index === 0 ? 'avoid' : 'always'}; margin-top: 1em;">
          <h2 style="text-align: center; font-size: 1.3em; margin-bottom: 1em;">${chapter.title}</h2>
          <div>${chapter.html}</div>
        </div>
      `;
    });

    contentHtml += '</div>';

    const container = window.document.createElement('div');
    container.innerHTML = contentHtml;
    container.style.width = `${pageFormat.width * 10}mm`;
    container.style.padding = `${marginMM.top}mm ${marginMM.right}mm ${marginMM.bottom}mm ${marginMM.left}mm`;
    window.document.body.appendChild(container);

    const opt = {
      margin: [marginMM.top / 25.4, marginMM.right / 25.4, marginMM.bottom / 25.4, marginMM.left / 25.4],
      filename: `${safeBookData.title || 'libro'}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: [pageFormat.width * 10, pageFormat.height * 10], orientation: 'portrait' }
    };

    try {
      await html2pdf().set(opt).from(container).save();
    } catch (error) {
      alert('Error al generar PDF: ' + error.message);
    }

    window.document.body.removeChild(container);
  };

  const handleExportEpub = async () => {
    const { bookData: safeBookData } = useEditorStore.getState();
    
    const title = safeBookData.title || 'Sin título';
    const author = safeBookData.author || 'Autor desconocido';
    const usafeUid = 'urn:usafeUid:' + Date.now();
    
    const chaptersHtml = safeBookData.chapters.map((ch, i) => {
      return `    <item id="chapter${i}" href="chapter${i}.xhtml" media-type="application/xhtml+xml"/>`;
    }).join('\n');
    
    const spineHtml = safeBookData.chapters.map((ch, i) => {
      return `    <itemref idref="chapter${i}"/>`;
    }).join('\n');

    const chaptersContent = safeBookData.chapters.map((ch) => {
      return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>${ch.title}</title>
</head>
<body>
  <section>
    <h2>${ch.title}</h2>
    ${ch.html}
  </section>
</body>
</html>`;
    }).join('\n<!-- -->');

    const packageOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    <dc:language>es</dc:language>
    <dc:identifier id="bookid">${usafeUid}</dc:identifier>
    <meta property="dcterms:modified">${new Date().toISOString().split('T')[0]}T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="toc"/>
${chaptersHtml}
  </manifest>
  <spine>
${spineHtml}
  </spine>
</package>`;

    const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>Tabla de contenidos</title>
</head>
<body>
  <nav epub:type="toc">
    <h1>Tabla de contenidos</h1>
    <ol>
${safeBookData.chapters.map((ch, i) => `      <li><a href="chapter${i}.xhtml">${ch.title}</a></li>`).join('\n')}
    </ol>
  </nav>
</body>
</html>`;

    const tocXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${title}</title>
</head>
<body>
  <h1>${title}</h1>
  <p>Por ${author}</p>
</body>
</html>`;

    const files = [
      { name: 'mimetype', content: 'application/epub+zip' },
      { name: 'META-INF/container.xml', content: '<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n  <rootfiles>\n    <rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/>\n  </rootfiles>\n</container>' },
      { name: 'OEBPS/package.opf', content: packageOpf },
      { name: 'OEBPS/nav.xhtml', content: navXhtml },
      { name: 'OEBPS/toc.xhtml', content: tocXhtml }
    ];

    safeBookData.chapters.forEach((ch, i) => {
      files.push({ 
        name: `OEBPS/chapter${i}.xhtml`, 
        content: chaptersContent.split('<!-- -->')[i] 
      });
    });

    try {
      const zip = createSimpleZip(files);
      const blob = new Blob([zip], { type: 'application/epub+zip' });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.epub`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('Error al generar EPUB: ' + error.message);
    }
  };

  const createSimpleZip = (files) => {
    const parts = [];
    let totalSize = 0;
    
    files.forEach(file => {
      const data = new TextEncoder().encode(file.content);
      parts.push({ name: file.name, data });
      totalSize += 30 + file.name.length + data.length;
    });
    
    const zip = new Uint8Array(totalSize + 1000);
    const view = new DataView(zip.buffer);
    let offset = 0;
    
    const writeUint32 = (val) => {
      view.setUint32(offset, val);
      offset += 4;
    };
    const writeUint16 = (val) => {
      view.setUint16(offset, val);
      offset += 2;
    };
    const writeString = (str) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset++, str.charCodeAt(i));
      }
    };
    
    const crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      crcTable[i] = c;
    }
    
    const crc32 = (data) => {
      let crc = 0xFFFFFFFF;
      for (let i = 0; i < data.length; i++) {
        crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
      }
      return (crc ^ 0xFFFFFFFF) >>> 0;
    };
    
    const localHeaders = [];
    const localData = [];
    
    parts.forEach(part => {
      localHeaders.push(offset);
      writeString('PK\x03\x04');
      writeUint16(20);
      writeUint16(0);
      writeUint16(0);
      writeUint16(0);
      writeUint16(0);
      writeUint16(0);
      writeUint16(0);
      writeUint32(0);
      const crc = crc32(part.data);
      writeUint32(crc);
      writeUint32(part.data.length);
      writeUint32(part.data.length);
      writeUint16(part.name.length);
      writeUint16(0);
      writeString(part.name);
      localData.push({ start: offset, size: part.data.length, crc });
      for (let i = 0; i < part.data.length; i++) {
        view.setUint8(offset++, part.data[i]);
      }
    });
    
    const centralDirStart = offset;
    parts.forEach((part, i) => {
      writeString('PK\x01\x02');
      writeUint16(20);
      writeUint16(20);
      writeUint16(0);
      writeUint16(0);
      writeUint16(0);
      writeUint16(0);
      writeUint16(0);
      writeUint16(0);
      writeUint16(0);
      writeUint32(localData[i].crc);
      writeUint32(localData[i].size);
      writeUint32(localData[i].size);
      writeUint16(part.name.length);
      writeUint16(0);
      writeUint32(0);
      writeUint32(0);
      writeString(part.name);
    });
    
    const centralDirEnd = offset;
    writeString('PK\x05\x06');
    writeUint16(0);
    writeUint16(0);
    writeUint16(parts.length);
    writeUint16(parts.length);
    writeUint32(centralDirEnd - centralDirStart);
    writeUint32(centralDirStart);
    writeUint16(0);
    
    return zip.slice(0, offset);
  };

  const handleExportHtml = () => {
    const { bookData: safeBookData } = useEditorStore.getState();
    
    let html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeBookData.title || 'Sin título'}</title>
</head>
<body>
    <h1>${safeBookData.title || 'Sin título'}</h1>
`;

    safeBookData.chapters.forEach(chapter => {
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
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `libro-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-container" role="application" aria-label="Editorial App">
      <Header 
        onNewProject={handleNewProject} 
        onSaveProject={handleSaveProject}
        onOpenProject={handleOpenProject}
      />
      
      <main className="app-main">
        <SidebarLeft />
        
        {safeUi?.showUpload ? (
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
