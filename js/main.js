/**
 * EDITORIAL APP - PUNTO DE ENTRADA PRINCIPAL
 * ============================================
 * 
 * Orquestador de la aplicación.
 * Inicializa componentes, maneja eventos globales y coordina módulos.
 */

class EditorialApp {
    
    constructor() {
        // Estado de la aplicación
        this.state = {
            document: {
                title: '',
                author: '',
                chapters: [],
                bookType: 'novela',
                pageFormat: '6x9',
                margins: {}
            },
            editing: {
                activeChapterId: null,
                isDirty: false
            },
            config: {
                pageFormat: 'a5',
                fontSize: 12,
                lineHeight: 1.6,
                chaptersOnRight: true,
                showPageNumbers: true,
                pageNumberPos:   'bottom', // 'top' | 'bottom'
                pageNumberAlign: 'center', // 'left' | 'center' | 'right' | 'outer'
                showHeaders:     false,
                headerContent:   'both',   // 'title' | 'chapter' | 'both'
                headerPosition:  'top',
                headerLine:      true
            }
        };

        // Estado del zoom
        this.currentZoom = 50; // Valor inicial de zoom

        // DOM Elements
        this.elements = {};
        this.cacheElements();

        // Inicializar
        this.init();
    }

    /**
     * Cachear referencias a elementos DOM
     */
    cacheElements() {
        // Header
        this.elements.btnNew = document.getElementById('btn-new-project');
        this.elements.btnOpen = document.getElementById('btn-open-project');
        this.elements.btnSave = document.getElementById('btn-save-project');

        // Upload
        this.elements.uploadArea = document.getElementById('upload-area');
        this.elements.fileInput = document.getElementById('file-input');
        this.elements.btnSelectFile = document.getElementById('btn-select-file');
        this.elements.textareaInput = document.getElementById('textarea-paste');
        this.elements.btnProcessText = document.getElementById('btn-process-text');

        // Editor
        this.elements.editorArea = document.getElementById('editor-area');
        this.elements.mainEditor = document.getElementById('main-editor');
        this.elements.btnSaveChapter = document.getElementById('btn-save-chapter');
        this.elements.btnUndo = document.getElementById('btn-undo');
        this.elements.btnRedo = document.getElementById('btn-redo');
        this.elements.btnBold = document.getElementById('btn-bold');
        this.elements.btnItalic = document.getElementById('btn-italic');
        this.elements.editorChapterName = document.getElementById('editor-chapter-name');
        this.elements.editorWordCount = document.getElementById('editor-word-count');

        // Sidebar - Estructura
        this.elements.chaptersList = document.getElementById('chapters-list');
        this.elements.btnAddChapter = document.getElementById('btn-add-chapter');
        this.elements.btnAddSection = document.getElementById('btn-add-section');
        this.elements.statChapters = document.getElementById('stat-chapters');
        this.elements.statWords = document.getElementById('stat-words');
        this.elements.statCharacters = document.getElementById('stat-characters');
        this.elements.statPages = document.getElementById('stat-pages');
        this.elements.statReadingTime = document.getElementById('stat-reading-time');

        // Sidebar - Configuración
        this.elements.configPageFormat = document.getElementById('config-page-format');
        this.elements.configFontSize = document.getElementById('config-font-size');
        this.elements.configLineHeight = document.getElementById('config-line-height');
        this.elements.configChaptersRight = document.getElementById('config-chapters-right');

        // Numeración y encabezados
        this.elements.configShowNumbers   = document.getElementById('config-show-numbers');
        this.elements.configNumbersPos    = document.getElementById('config-numbers-position');
        this.elements.configNumbersAlign  = document.getElementById('config-numbers-align');
        this.elements.configNumbersOpts   = document.getElementById('config-numbers-options');
        this.elements.configShowHeaders   = document.getElementById('config-show-headers');
        this.elements.configHeaderContent = document.getElementById('config-header-content');
        this.elements.configHeaderPos     = document.getElementById('config-header-position');
        this.elements.configHeaderLine    = document.getElementById('config-header-line');
        this.elements.configHeadersOpts   = document.getElementById('config-headers-options');

        // Preview
        this.elements.previewContainer = document.getElementById('preview-container');
        this.elements.previewContent = document.getElementById('preview-content');
        this.elements.previewZoomWrapper = document.querySelector('.preview-zoom-wrapper');
        this.elements.btnTogglePreview = document.getElementById('btn-toggle-preview');
        this.elements.previewZoom = document.getElementById('preview-zoom');
        this.elements.btnZoomOut = document.getElementById('btn-zoom-out');
        this.elements.btnZoomIn = document.getElementById('btn-zoom-in');
        this.elements.btnPrevPage = document.getElementById('btn-prev-page');
        this.elements.btnNextPage = document.getElementById('btn-next-page');
        this.elements.btnFullscreen = document.getElementById('btn-fullscreen-preview');
        this.elements.btnExportPdf = document.getElementById('btn-export-pdf');
        this.elements.btnExportEpub = document.getElementById('btn-export-epub');
        this.elements.btnExportHtml = document.getElementById('btn-export-html');

        // Fullscreen
        this.elements.fullscreenContainer = document.getElementById('fullscreen-preview-container');
        this.elements.fullscreenContent   = document.getElementById('fullscreen-preview-content');
        this.elements.btnExitFullscreen   = document.getElementById('btn-exit-fullscreen');
        this.elements.fsBtnPrev           = document.getElementById('fs-btn-prev');
        this.elements.fsBtnNext           = document.getElementById('fs-btn-next');
        this.elements.fsZoomSelect        = document.getElementById('fs-zoom-select');
        this.elements.fsCurrentPage       = document.getElementById('fs-current-page');
        this.elements.fsTotalPages        = document.getElementById('fs-total-pages');
        this.elements.fsTitle             = document.getElementById('fullscreen-title');

        // Tabs
        this.elements.sidebarTabs = document.querySelectorAll('.sidebar-tab');
    }

    /**
     * Inicializar la aplicación
     */
    init() {
        console.log('📖 Editorial App iniciando...');
        
        // Verificar que KDP Standards esté disponible
        if (typeof AMAZON_KDP_STANDARDS === 'undefined') {
            console.error('⚠️ Estándares KDP no cargados. Verifica que amazon-kdp-standards.js esté en la carpeta lib/');
        } else {
            console.log('✓ Estándares Amazon KDP cargados correctamente');
            this.initializeKDPStandards();
        }

        this.setupListeners();
        this.setupTabs();
        this.createSampleChapter();

        console.log('✓ Editorial App lista');
    }

    /**
     * NUEVO: Inicializar estándares KDP
     */
    initializeKDPStandards() {
        // Obtener configuración recomendada para novela
        const recommendedConfig = AMAZON_KDP_STANDARDS.getRecommendations('novela');
        
        console.log('📐 Configuración recomendada para Novela:', recommendedConfig);
        
        // Aplicar configuración inicial
        this.applyKDPConfig('novela');
    }

    /**
     * NUEVO: Aplicar configuración KDP según tipo de libro
     */
    applyKDPConfig(bookType) {
        const config = AMAZON_KDP_STANDARDS.getBookTypeConfig(bookType);
        const format = AMAZON_KDP_STANDARDS.getPageFormat(config.recommendedFormat);
        
        // Actualizar estado
        this.state.document.bookType = bookType;
        this.state.document.pageFormat = config.recommendedFormat;
        this.state.document.margins = {
            top: config.marginTop,
            bottom: config.marginBottom,
            left: config.marginLeft,
            right: config.marginRight
        };

        // Actualizar UI
        if (this.elements.configPageFormat) {
            this.elements.configPageFormat.value = config.recommendedFormat;
        }
        if (this.elements.configFontSize) {
            this.elements.configFontSize.value = config.fontSize;
        }
        if (this.elements.configLineHeight) {
            this.elements.configLineHeight.value = config.lineHeight;
        }

        console.log(`✓ Configuración ${bookType} aplicada:`, {
            formato: format.name,
            fuente: `${config.fontFamily} ${config.fontSize}pt`,
            interlineado: config.lineHeight,
            márgenes: this.state.document.margins
        });
    }

    /**
     * NUEVO: Obtener recomendaciones KDP para mostrar al usuario
     */
    getKDPRecommendations(bookType) {
        return AMAZON_KDP_STANDARDS.getRecommendations(bookType);
    }

    /**
     * NUEVO: Validar márgenes contra estándares KDP
     */
    validateMarginsKDP(margins) {
        return AMAZON_KDP_STANDARDS.validateMargins(margins, 'paperback');
    }

    /**
     * Configurar listeners de eventos
     */
    setupListeners() {
        // Proyecto
        if (this.elements.btnNew) this.elements.btnNew.addEventListener('click', () => this.newProject());
        if (this.elements.btnSave) this.elements.btnSave.addEventListener('click', () => this.saveProject());

        // Upload
        if (this.elements.btnSelectFile) this.elements.btnSelectFile.addEventListener('click', () => this.selectFile());
        if (this.elements.fileInput) this.elements.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        if (this.elements.btnProcessText) this.elements.btnProcessText.addEventListener('click', () => this.processText());

        // Drag and drop
        document.addEventListener('dragover', (e) => this.handleDragOver(e));
        document.addEventListener('drop', (e) => this.handleDrop(e));

        // Editor
        if (this.elements.mainEditor) this.elements.mainEditor.addEventListener('input', () => this.onEditorInput());
        if (this.elements.btnSaveChapter) this.elements.btnSaveChapter.addEventListener('click', () => this.saveChapter());
        if (this.elements.btnUndo) this.elements.btnUndo.addEventListener('click', () => this.undo());
        if (this.elements.btnRedo) this.elements.btnRedo.addEventListener('click', () => this.redo());
        if (this.elements.btnBold) this.elements.btnBold.addEventListener('click', () => this.applyFormat('bold'));
        if (this.elements.btnItalic) this.elements.btnItalic.addEventListener('click', () => this.applyFormat('italic'));

        // Capítulos y secciones
        if (this.elements.btnAddChapter) this.elements.btnAddChapter.addEventListener('click', () => this.addChapter());
        if (this.elements.btnAddSection) this.elements.btnAddSection.addEventListener('click', () => this.addSection());

        // Preview
        if (this.elements.btnTogglePreview) this.elements.btnTogglePreview.addEventListener('click', () => this.togglePreview());
        if (this.elements.previewZoom) this.elements.previewZoom.addEventListener('change', (e) => this.setPreviewZoom(e.target.value));
        if (this.elements.btnZoomOut) this.elements.btnZoomOut.addEventListener('click', () => this.adjustZoom(-25));
        if (this.elements.btnZoomIn) this.elements.btnZoomIn.addEventListener('click', () => this.adjustZoom(25));
        if (this.elements.btnPrevPage) this.elements.btnPrevPage.addEventListener('click', () => this.previewRenderer?.previousPage());
        if (this.elements.btnNextPage) this.elements.btnNextPage.addEventListener('click', () => this.previewRenderer?.nextPage());
        if (this.elements.btnFullscreen) this.elements.btnFullscreen.addEventListener('click', () => this.openFullscreen());

        // Fullscreen controls
        if (this.elements.btnExitFullscreen) this.elements.btnExitFullscreen.addEventListener('click', () => this.closeFullscreen());
        if (this.elements.fsBtnPrev) this.elements.fsBtnPrev.addEventListener('click', () => this.fsNavigate(-1));
        if (this.elements.fsBtnNext) this.elements.fsBtnNext.addEventListener('click', () => this.fsNavigate(1));
        if (this.elements.fsZoomSelect) this.elements.fsZoomSelect.addEventListener('change', (e) => {
            this.fsZoom = parseInt(e.target.value);
            this.fsRenderCurrentPage();
        });
        document.addEventListener('keydown', (e) => {
            if (!this.elements.fullscreenContainer || this.elements.fullscreenContainer.hidden) return;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') this.fsNavigate(1);
            if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   this.fsNavigate(-1);
            if (e.key === 'Escape') this.closeFullscreen();
        });

        // Lupa — hover sobre el preview container
        if (this.elements.previewContent) this._setupMagnifier();

        // Exportación
        if (this.elements.btnExportPdf) this.elements.btnExportPdf.addEventListener('click', () => this.exportPdf());
        if (this.elements.btnExportEpub) this.elements.btnExportEpub.addEventListener('click', () => this.exportEpub());
        if (this.elements.btnExportHtml) this.elements.btnExportHtml.addEventListener('click', () => this.exportHtml());

        // Configuración — re-renderiza el preview al cambiar cualquier valor
        if (this.elements.configPageFormat) {
            this.elements.configPageFormat.addEventListener('change', (e) => {
                this.state.document.pageFormat = e.target.value;
                this._rerenderPreviewIfVisible();
            });
        }
        if (this.elements.configFontSize) {
            this.elements.configFontSize.addEventListener('change', (e) => {
                this.state.config.fontSize = parseInt(e.target.value);
                this._rerenderPreviewIfVisible();
            });
        }
        if (this.elements.configLineHeight) {
            this.elements.configLineHeight.addEventListener('change', (e) => {
                this.state.config.lineHeight = parseFloat(e.target.value);
                this._rerenderPreviewIfVisible();
            });
        }

        // Numeración de página
        if (this.elements.configShowNumbers) {
            this.elements.configShowNumbers.addEventListener('change', (e) => {
                this.state.config.showPageNumbers = e.target.checked;
                if (this.elements.configNumbersOpts) {
                    this.elements.configNumbersOpts.hidden = !e.target.checked;
                }
                this._rerenderPreviewIfVisible();
            });
        }
        if (this.elements.configNumbersPos) {
            this.elements.configNumbersPos.addEventListener('change', (e) => {
                this.state.config.pageNumberPos = e.target.value;
                this._rerenderPreviewIfVisible();
            });
        }
        if (this.elements.configNumbersAlign) {
            this.elements.configNumbersAlign.addEventListener('change', (e) => {
                this.state.config.pageNumberAlign = e.target.value;
                this._rerenderPreviewIfVisible();
            });
        }

        // Encabezados
        if (this.elements.configShowHeaders) {
            this.elements.configShowHeaders.addEventListener('change', (e) => {
                this.state.config.showHeaders = e.target.checked;
                if (this.elements.configHeadersOpts) {
                    this.elements.configHeadersOpts.hidden = !e.target.checked;
                }
                this._rerenderPreviewIfVisible();
            });
        }
        if (this.elements.configHeaderContent) {
            this.elements.configHeaderContent.addEventListener('change', (e) => {
                this.state.config.headerContent = e.target.value;
                this._rerenderPreviewIfVisible();
            });
        }
        if (this.elements.configHeaderPos) {
            this.elements.configHeaderPos.addEventListener('change', (e) => {
                this.state.config.headerPosition = e.target.value;
                this._rerenderPreviewIfVisible();
            });
        }
        if (this.elements.configHeaderLine) {
            this.elements.configHeaderLine.addEventListener('change', (e) => {
                this.state.config.headerLine = e.target.checked;
                this._rerenderPreviewIfVisible();
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
    }

    /**
     * Configurar sistema de tabs
     */
    setupTabs() {
        this.elements.sidebarTabs.forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab));
        });
    }

    /**
     * Cambiar tab activo
     */
    switchTab(tabButton) {
        const tabName = tabButton.getAttribute('data-tab');
        const sidebar = tabButton.closest('.sidebar');

        // Desactivar todos los tabs
        sidebar.querySelectorAll('.sidebar-tab').forEach(t => {
            t.classList.remove('active');
            t.setAttribute('aria-selected', 'false');
        });

        // Ocultar todos los paneles
        sidebar.querySelectorAll('[data-tab-panel]').forEach(panel => {
            panel.hidden = true;
        });

        // Activar tab y panel seleccionado
        tabButton.classList.add('active');
        tabButton.setAttribute('aria-selected', 'true');
        const panel = sidebar.querySelector(`[data-tab-panel="${tabName}"]`);
        if (panel) {
            panel.hidden = false;
        }
    }

    /**
     * Crear capítulo de ejemplo
     */
    createSampleChapter() {
        const chapter = {
            id: `chapter-${Date.now()}`,
            title: 'Sin título',
            html: '<p>Comienza a escribir aquí...</p>',
            wordCount: 0
        };

        this.state.document.chapters.push(chapter);
        this.state.editing.activeChapterId = chapter.id;
        this.renderChaptersList();
        this.showEditor();
        this.loadChapterInEditor(chapter.id);
    }

    /**
     * PROYECTO: Nuevo proyecto
     */
    newProject() {
    if (confirm('¿Crear nuevo proyecto? Se perderán los cambios sin guardar.')) {
        this.state.document = {
            title: '',
            author: '',
            chapters: []
        };
        this.showUploadArea();
        this.showNotification('Nuevo proyecto creado');
    }
}

    /**
     * PROYECTO: Guardar proyecto
     */
    saveProject() {
        try {
            const projectData = {
                timestamp: Date.now(),
                document: this.state.document,
                config: this.state.config
            };

            const json = JSON.stringify(projectData, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `libro-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);

            this.showNotification('✓ Proyecto guardado');
        } catch (error) {
            this.showError(`Error guardando proyecto: ${error.message}`);
        }
    }

    /**
     * UPLOAD: Seleccionar archivo
     */
    selectFile() {
        this.elements.fileInput.click();
    }

    /**
     * UPLOAD: Procesar archivo subido
     */
    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const ext = file.name.split('.').pop().toLowerCase();

        if (ext === 'docx') {
            // DOCX es binario — usar mammoth.js para convertir a HTML/texto
            if (!window.mammoth) {
                this.showError('Mammoth.js no cargado. Verifica tu conexión a internet.');
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                mammoth.extractRawText({ arrayBuffer: e.target.result })
                    .then(result => {
                        if (result.messages.length > 0) {
                            console.warn('Mammoth warnings:', result.messages);
                        }
                        this.processContent(result.value, file.name);
                    })
                    .catch(err => this.showError(`Error leyendo DOCX: ${err.message}`));
            };
            reader.readAsArrayBuffer(file);
        } else {
            // TXT, MD, HTML, ODT — texto plano
            const reader = new FileReader();
            reader.onload = (e) => this.processContent(e.target.result, file.name);
            reader.readAsText(file, 'UTF-8');
        }
    }

    /**
     * UPLOAD: Procesar texto pegado
     */
    processText() {
        const text = this.elements.textareaInput.value;
        if (text.trim().length === 0) {
            this.showError('Ingresa contenido antes de procesar');
            return;
        }

        this.processContent(text, 'pasted-content');
    }

    /**
     * UPLOAD: Procesar contenido (archivo o pegado)
     */
    processContent(content, sourceName) {
        try {
            if (!window.TextParser) {
                this.showError('TextParser no cargado.');
                return;
            }

            const parser   = new TextParser();
            const chapters = parser.parse(content);

            if (chapters.length === 0) {
                this.showError('No se detectó contenido en el archivo.');
                return;
            }

            this.state.document.chapters = chapters;

            // Actualizar UI
            this.state.editing.activeChapterId = chapters[0].id;
            this.renderChaptersList();
            this.loadChapterInEditor(chapters[0].id);
            this.updateStats();
            this.showEditor();

            // Mostrar preview automáticamente — diferir un frame para que el DOM esté pintado
            if (this.elements.previewContainer) {
                this.elements.previewContainer.hidden = false;
                requestAnimationFrame(() => this.renderPreviewKDP());
            }

            const n = chapters.length;
            this.showNotification(`✓ ${n} capítulo${n > 1 ? 's' : ''} importado${n > 1 ? 's' : ''}`);
        } catch (error) {
            this.showError(`Error procesando contenido: ${error.message}`);
        }
    }

    /**
     * AUXILIAR: Escapar HTML
     */
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, char => map[char]);
    }

    /**
     * AUXILIAR: Contar palabras
     */
    countWords(text) {
        return text.trim().split(/\s+/).filter(w => w.length > 0).length;
    }

    /**
     * AUXILIAR: Manejar drag over
     */
    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        if (this.elements.uploadArea && !this.elements.uploadArea.hidden) {
            this.elements.uploadArea.classList.add('drag-over');
        }
    }

    /**
     * AUXILIAR: Manejar drop
     */
    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        if (this.elements.uploadArea && !this.elements.uploadArea.hidden) {
            this.elements.uploadArea.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.elements.fileInput.files = files;
                this.handleFileUpload({ target: this.elements.fileInput });
            }
        }
    }

    /**
     * EDITOR: Mostrar editor
     */
    showEditor() {
    if (this.elements.uploadArea) this.elements.uploadArea.hidden = true;
    if (this.elements.editorArea) this.elements.editorArea.hidden = false;
}

showUploadArea() {
    if (this.elements.editorArea) this.elements.editorArea.hidden = true;
    if (this.elements.uploadArea) this.elements.uploadArea.hidden = false;
    this.elements.textareaInput.value = '';
    this.elements.fileInput.value = '';
}

    /**
     * EDITOR: Cargar capítulo en editor
     */
    loadChapterInEditor(chapterId) {
        const chapter = this.state.document.chapters.find(ch => ch.id === chapterId);
        if (!chapter) return;

        if (this.elements.mainEditor) {
            this.elements.mainEditor.innerHTML = chapter.html;
            this.elements.mainEditor.contentEditable = 'true';
        }
        if (this.elements.editorChapterName) {
            this.elements.editorChapterName.textContent = chapter.title;
        }
        this.state.editing.activeChapterId = chapterId;
        this.updateEditorStats();
    }

    /**
     * EDITOR: Input en editor
     */
    onEditorInput() {
        const chapter = this.state.document.chapters.find(
            ch => ch.id === this.state.editing.activeChapterId
        );
        if (chapter && this.elements.mainEditor) {
            chapter.html = this.elements.mainEditor.innerHTML;
            this.state.editing.isDirty = true;
            this.updateEditorStats();
        }
    }

    /**
     * EDITOR: Guardar capítulo
     */
    saveChapter() {
        const chapter = this.state.document.chapters.find(
            ch => ch.id === this.state.editing.activeChapterId
        );
        if (chapter && this.elements.mainEditor) {
            chapter.html = this.elements.mainEditor.innerHTML;
            this.state.editing.isDirty = false;
            this.showNotification('✓ Capítulo guardado');
        }
    }

    /**
     * EDITOR: Undo
     */
    undo() {
        document.execCommand('undo');
    }

    /**
     * EDITOR: Redo
     */
    redo() {
        document.execCommand('redo');
    }

    /**
     * EDITOR: Aplicar formato
     */
    applyFormat(command) {
        document.execCommand(command);
        if (this.elements.mainEditor) this.elements.mainEditor.focus();
    }

    /**
     * EDITOR: Actualizar estadísticas
     */
    updateEditorStats() {
        if (!this.elements.mainEditor) return;
        const text = this.elements.mainEditor.innerText;
        const words = this.countWords(text);
        if (this.elements.editorWordCount) {
            this.elements.editorWordCount.textContent = `${words} palabras`;
        }
    }

    /**
     * CAPÍTULOS: Listar capítulos
     */
    renderChaptersList() {
        if (!this.elements.chaptersList) return;
        this.elements.chaptersList.innerHTML = '';

        if (this.state.document.chapters.length === 0) {
            this.elements.chaptersList.innerHTML = '<p class="empty-state">Sin capítulos cargados</p>';
            return;
        }

        this.state.document.chapters.forEach((chapter, index) => {
            const isSection = chapter.type === 'section';
            const item = document.createElement('div');
            item.className = isSection ? 'chapter-item section-item' : 'chapter-item';
            if (chapter.id === this.state.editing.activeChapterId) {
                item.classList.add('active');
            }

            const badge = isSection
                ? `<span class="item-type-badge section-badge">Sección</span>`
                : `<span class="item-type-badge chapter-badge">Cap.</span>`;

            item.innerHTML = `
                <div class="chapter-item-header">
                    ${badge}
                    <span class="chapter-item-title">${this.escapeHtml(chapter.title)}</span>
                    <button class="btn-delete-item" title="Eliminar" aria-label="Eliminar ${this.escapeHtml(chapter.title)}">✕</button>
                </div>
                <span class="chapter-item-meta">${chapter.wordCount || 0} palabras</span>
            `;

            // Clic en el item → cargar en editor
            item.addEventListener('click', (e) => {
                if (e.target.closest('.btn-delete-item')) return; // evitar activar al borrar
                this.loadChapterInEditor(chapter.id);
                this.renderChaptersList();
            });

            // Clic en botón borrar
            item.querySelector('.btn-delete-item').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteChapterOrSection(chapter.id, chapter.title);
            });

            this.elements.chaptersList.appendChild(item);
        });
    }

    /**
     * CAPÍTULOS: Agregar capítulo (empieza siempre en página derecha)
     */
    addChapter() {
        const title = prompt('Título del capítulo:');
        if (!title) return;

        const chapter = {
            id: `chapter-${Date.now()}`,
            type: 'chapter',
            title: title.trim(),
            html: '<p>Comienza a escribir aquí...</p>',
            wordCount: 0
        };

        this.state.document.chapters.push(chapter);
        this.renderChaptersList();
        this.loadChapterInEditor(chapter.id);
        this._rerenderPreviewIfVisible();
        this.showNotification('✓ Capítulo agregado');
    }

    /**
     * SECCIONES: Agregar sección (página libre, sin forzar página derecha)
     */
    addSection() {
        const title = prompt('Nombre de la sección (ej: Prólogo, Dedicatoria, Introducción):');
        if (!title) return;

        const section = {
            id: `section-${Date.now()}`,
            type: 'section',
            title: title.trim(),
            html: '<p>Escribe el contenido de esta sección...</p>',
            wordCount: 0
        };

        this.state.document.chapters.push(section);
        this.renderChaptersList();
        this.loadChapterInEditor(section.id);
        this._rerenderPreviewIfVisible();
        this.showNotification('✓ Sección agregada');
    }

    /**
     * CAPÍTULOS/SECCIONES: Eliminar
     */
    deleteChapterOrSection(id, title) {
        const label = this.state.document.chapters.find(c => c.id === id)?.type === 'section'
            ? 'sección'
            : 'capítulo';

        if (!confirm(`¿Eliminar ${label} "${title}"?\nEsta acción no se puede deshacer.`)) return;

        const idx = this.state.document.chapters.findIndex(c => c.id === id);
        if (idx === -1) return;

        this.state.document.chapters.splice(idx, 1);

        // Si era el activo, cargar el anterior (o el primero disponible)
        if (this.state.editing.activeChapterId === id) {
            const newActive = this.state.document.chapters[Math.max(0, idx - 1)];
            if (newActive) {
                this.state.editing.activeChapterId = newActive.id;
                this.loadChapterInEditor(newActive.id);
            } else {
                this.state.editing.activeChapterId = null;
                if (this.elements.mainEditor) this.elements.mainEditor.innerHTML = '';
                if (this.elements.editorChapterName) this.elements.editorChapterName.textContent = '';
            }
        }

        this.renderChaptersList();
        this._rerenderPreviewIfVisible();
        this.showNotification(`✓ ${label.charAt(0).toUpperCase() + label.slice(1)} eliminado`);
    }

    /**
     * ESTADÍSTICAS: Actualizar
     */
    updateStats() {
        const totalChapters = this.state.document.chapters.length;
        const totalWords = this.state.document.chapters.reduce(
            (sum, ch) => sum + this.countWords(ch.html.replace(/<[^>]*>/g, '')),
            0
        );

        const estimatedPages = Math.ceil(totalWords / 275);
        const readingTime = Math.ceil(totalWords / 250);

        if (this.elements.statChapters) this.elements.statChapters.textContent = totalChapters;
        if (this.elements.statWords) this.elements.statWords.textContent = totalWords;
        if (this.elements.statCharacters) this.elements.statCharacters.textContent = totalWords * 5;
        if (this.elements.statPages) this.elements.statPages.textContent = estimatedPages;
        if (this.elements.statReadingTime) this.elements.statReadingTime.textContent = readingTime;
    }

    /**
     * PREVIEW: Mostrar/ocultar
     */
    togglePreview() {
        if (!this.elements.previewContainer) return;
        const isHidden = this.elements.previewContainer.hidden;
        this.elements.previewContainer.hidden = !isHidden;

        if (isHidden) {
            requestAnimationFrame(() => this.renderPreviewKDP());
        }

        if (this.elements.btnTogglePreview) {
            this.elements.btnTogglePreview.textContent = isHidden ? '👁 Ocultar preview' : '👁 Mostrar preview';
        }
    }

    /**
     * PREVIEW: Re-renderizar solo si el preview está visible y hay contenido
     */
    _rerenderPreviewIfVisible() {
        if (!this.elements.previewContainer) return;
        if (this.elements.previewContainer.hidden) return;
        if (!this.state.document.chapters.length) return;
        requestAnimationFrame(() => this.renderPreviewKDP());
    }

    /**
     * PREVIEW: Renderizar con estándares KDP
     */
    renderPreviewKDP() {
        if (!window.PreviewRenderer) {
            this.showError('Preview Renderer no cargado');
            return;
        }

        if (!this.previewRenderer) {
            this.previewRenderer = new PreviewRenderer(this.elements.previewContent);
        }

        this.previewRenderer.render(
            this.state.document.chapters,
            this.state.document.bookType || 'novela',
            this.state.document.pageFormat || '6x9',
            this.state
        );

        // Establecer zoom inicial al cargar el preview
        this.setPreviewZoom(this.currentZoom || 50);

        const info = this.previewRenderer.getBookInfo();
        console.log('Preview Info:', info);
    }

    /**
     * PREVIEW: Zoom
     */
    setPreviewZoom(level) {
        const zoomLevel = parseInt(level);
        this.currentZoom = zoomLevel;
        
        // Sincronizar el select con el valor actual
        if (this.elements.previewZoom) {
            this.elements.previewZoom.value = zoomLevel;
        }
        
        if (this.previewRenderer) {
            this.previewRenderer.applyZoom(zoomLevel);
        }
        
        // Aplicar transformación CSS al contenedor de zoom
        this.applyZoomTransform(zoomLevel);
    }

    /**
     * PREVIEW: Ajustar zoom (in/out buttons)
     */
    adjustZoom(delta) {
        const current = this.currentZoom || 50;
        const options = [25, 40, 50, 75, 100, 125, 150, 200];
        let newIndex = options.indexOf(current);
        
        if (newIndex === -1) {
            // Si el valor actual no está en las opciones, usar el más cercano
            newIndex = options.findIndex(opt => opt >= current);
            if (newIndex === -1) newIndex = options.length - 1;
        }
        
        newIndex = Math.max(0, Math.min(options.length - 1, newIndex + (delta > 0 ? 1 : -1)));
        const newZoom = options[newIndex];
        
        this.setPreviewZoom(newZoom);
    }

    /**
     * PREVIEW: Aplicar transformación CSS de zoom
     */
    applyZoomTransform(zoomLevel) {
        if (!this.elements.previewZoomWrapper) return;
        
        const scale = zoomLevel / 100;
        this.elements.previewZoomWrapper.style.transform = `scale(${scale})`;
        
        // Ajustar el padding para compensar el scale
        const basePadding = 16; // var(--space-lg) en px
        const scaledPadding = basePadding / scale;
        this.elements.previewZoomWrapper.style.padding = `${scaledPadding}px`;
    }

    // ================================================================
    // LUPA — ventana flotante al hacer hover sobre el preview
    // ================================================================

    _setupMagnifier() {
        // Crear elemento de lupa
        this._lens = document.createElement('div');
        this._lens.className = 'preview-lens';
        this._lens.innerHTML = `
            <div class="preview-lens-header">
                <span id="lens-page-info">Página 1</span>
                <span>Vista ampliada</span>
            </div>
            <div class="preview-lens-body" id="lens-body"></div>`;
        document.body.appendChild(this._lens);

        const container = this.elements.previewContainer;
        if (!container) return;

        let hideTimer = null;

        const show = (e) => {
            if (!this.previewRenderer || !this.previewRenderer.pages.length) return;
            clearTimeout(hideTimer);
            this._updateLens(e);
            this._lens.classList.add('visible');
        };

        const move = (e) => {
            if (!this.previewRenderer || !this.previewRenderer.pages.length) return;
            clearTimeout(hideTimer);
            if (!this._lens.classList.contains('visible')) {
                this._lens.classList.add('visible');
            }
            this._updateLens(e);
        };

        const hide = () => {
            hideTimer = setTimeout(() => {
                this._lens.classList.remove('visible');
            }, 120);
        };

        container.addEventListener('mouseenter', show);
        container.addEventListener('mousemove', move);
        container.addEventListener('mouseleave', hide);
    }

    /**
     * Actualiza el contenido de la lupa según posición del cursor.
     * Detecta en qué zona vertical de la página está el mouse y hace
     * zoom sobre esa región usando CSS transform + translateY negativo.
     */
    _updateLens(e) {
        if (!this.previewRenderer) return;
        const page = this.previewRenderer.pages[this.previewRenderer.currentPage];
        if (!page) return;

        const { book, format } = this.previewRenderer.config;
        if (!book || !format) return;

        const dims = this.previewRenderer.calculateDimensions(book, format);

        // La lupa muestra la página a escala 1:1 (100%) pero en una ventana más pequeña
        // con clip + translateY para mostrar la región donde está el cursor
        const LENS_ZOOM   = 1.6;   // ampliación real de la lupa
        const LENS_W      = 400;   // ancho visible de la lupa (px)
        const LENS_H      = 340;   // alto visible de la lupa (px)
        const PT2PX       = 96 / 72;

        // Escala base del preview actual (para saber dónde está la página en pantalla)
        const previewScale = this.previewRenderer.currentZoom / 100;

        // Encontrar el elemento de la página dentro del preview
        const pageEl = this.elements.previewContent?.querySelector('div > div');

        let ratioY = 0.5; // posición relativa vertical del cursor (0=top, 1=bottom)
        let ratioX = 0.5; // posición relativa horizontal del cursor (0=left, 1=right)
        if (pageEl) {
            const rect = pageEl.getBoundingClientRect();
            ratioY = Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height));
            ratioX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        }

        // Dimensiones de la página a escala de lupa
        const pageW = Math.round(dims.pageWidthPx  * LENS_ZOOM);
        const pageH = Math.round(dims.pageHeightPx * LENS_ZOOM);
        const mT    = Math.round(dims.marginTopPx    * LENS_ZOOM);
        const mB    = Math.round(dims.marginBottomPx * LENS_ZOOM);
        const mL    = Math.round(dims.marginLeftPx   * LENS_ZOOM);
        const mR    = Math.round(dims.marginRightPx  * LENS_ZOOM);
        const fontSize = Math.round(book.fontSize * PT2PX * LENS_ZOOM);

        // Desplazamiento vertical: centrar la zona donde está el cursor
        const maxShiftY  = pageH - LENS_H;
        const translateY = -Math.round(ratioY * maxShiftY);

        // Desplazamiento horizontal: seguir el cursor en X
        // La página es más ancha que la lupa → desplazar para ver la zona bajo el cursor
        const maxShiftX  = Math.max(0, pageW - LENS_W);
        const translateX = -Math.round(ratioX * maxShiftX);

        const lensBody = document.getElementById('lens-body');
        const lensInfo = document.getElementById('lens-page-info');

        if (lensInfo) {
            const pct = Math.round(ratioY * 100);
            lensInfo.textContent = `Pág. ${page.pageNumber}/${this.previewRenderer.pages.length} · ${pct}%`;
        }

        if (lensBody) {
            lensBody.style.cssText = `
                width:${LENS_W}px;
                height:${LENS_H}px;
                overflow:hidden;
                position:relative;
            `;
            lensBody.innerHTML = `
                <div style="
                    width:${pageW}px;
                    height:${pageH}px;
                    background:white;
                    padding:${mT}px ${mR}px ${mB}px ${mL}px;
                    box-sizing:border-box;
                    position:absolute;
                    top:0;
                    left:0;
                    transform:translate(${translateX}px, ${translateY}px);
                    will-change:transform;
                ">
                    <div style="
                        font-family:${book.fontFamily};
                        font-size:${fontSize}px;
                        line-height:${book.lineHeight};
                        color:#1a1a1a;
                        text-align:justify;
                        hyphens:auto;
                        word-wrap:break-word;
                        overflow:hidden;
                        height:100%;
                    ">${page.isBlank ? '' : page.html}</div>
                </div>`;
        }

        this._positionLens(e);
    }

    _positionLens(e) {
        if (!this._lens) return;
        const lensW = 420;
        const lensH = this._lens.offsetHeight || 400;
        const margin = 16;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        let x = e.clientX + margin;
        let y = e.clientY - lensH / 2;

        // Evitar que se salga de la pantalla
        if (x + lensW > vw - margin) x = e.clientX - lensW - margin;
        if (y < margin) y = margin;
        if (y + lensH > vh - margin) y = vh - lensH - margin;

        this._lens.style.left = `${x}px`;
        this._lens.style.top  = `${y}px`;
    }

    // ================================================================
    // FULLSCREEN — pantalla completa con controles propios
    // ================================================================

    openFullscreen() {
        if (!this.previewRenderer || !this.previewRenderer.pages.length) {
            this.showError('No hay preview para mostrar. Procesa un documento primero.');
            return;
        }

        this.fsPage = this.previewRenderer.currentPage;
        this.fsZoom = 90;

        if (this.elements.fsZoomSelect) this.elements.fsZoomSelect.value = '90';
        if (this.elements.fsTitle) {
            this.elements.fsTitle.textContent =
                this.state.document.title || 'Vista Previa';
        }

        this.elements.fullscreenContainer.hidden = false;
        document.body.style.overflow = 'hidden';

        this.fsRenderCurrentPage();
    }

    closeFullscreen() {
        if (this.elements.fullscreenContainer) {
            this.elements.fullscreenContainer.hidden = true;
        }
        document.body.style.overflow = '';
    }

    fsNavigate(delta) {
        if (!this.previewRenderer) return;
        const total = this.previewRenderer.pages.length;
        this.fsPage = Math.max(0, Math.min(total - 1, (this.fsPage || 0) + delta));
        this.fsRenderCurrentPage();
    }

    fsRenderCurrentPage() {
        if (!this.previewRenderer || !this.elements.fullscreenContent) return;

        const pages = this.previewRenderer.pages;
        const page  = pages[this.fsPage];
        if (!page) return;

        const { book, format } = this.previewRenderer.config;
        const dims  = this.previewRenderer.calculateDimensions(book, format);
        const scale = (this.fsZoom || 90) / 100;
        const PT2PX = 96 / 72;

        const W  = Math.round(dims.pageWidthPx    * scale);
        const H  = Math.round(dims.pageHeightPx   * scale);
        const mT = Math.round(dims.marginTopPx    * scale);
        const mB = Math.round(dims.marginBottomPx * scale);
        const mL = Math.round(dims.marginLeftPx   * scale);
        const mR = Math.round(dims.marginRightPx  * scale);
        const fontSize = Math.round(book.fontSize * PT2PX * scale);

        const numSide   = this.fsPage % 2 === 0 ? 'right' : 'left';
        const numOffset = this.fsPage % 2 === 0 ? mR : mL;
        const numSize   = Math.max(9, Math.round(9 * PT2PX * scale));

        const pageNumHtml = !page.isBlank ? `
            <div style="position:absolute;bottom:${Math.round(mB*0.45)}px;${numSide}:${numOffset}px;font-size:${numSize}px;color:#888;font-family:${book.fontFamily};line-height:1;">
                ${page.pageNumber}
            </div>` : '';

        this.elements.fullscreenContent.innerHTML = `
            <div style="position:relative;width:${W}px;height:${H}px;background:white;border:1px solid #ccc;box-shadow:0 8px 32px rgba(0,0,0,0.5);padding:${mT}px ${mR}px ${mB}px ${mL}px;box-sizing:border-box;overflow:hidden;">
                <div style="font-family:${book.fontFamily};font-size:${fontSize}px;line-height:${book.lineHeight};color:#1a1a1a;text-align:justify;hyphens:auto;word-wrap:break-word;overflow:hidden;height:100%;">
                    ${page.isBlank ? '' : page.html}
                </div>
                ${pageNumHtml}
            </div>`;

        // Actualizar info de página
        if (this.elements.fsCurrentPage) this.elements.fsCurrentPage.textContent = this.fsPage + 1;
        if (this.elements.fsTotalPages)  this.elements.fsTotalPages.textContent  = pages.length;
        if (this.elements.fsBtnPrev) this.elements.fsBtnPrev.disabled = this.fsPage === 0;
        if (this.elements.fsBtnNext) this.elements.fsBtnNext.disabled = this.fsPage >= pages.length - 1;
    }

    /**
     * EXPORTACIÓN: PDF — CSS print via ventana nueva
     */
    exportPdf() {
        if (!this.state.document.chapters.length) {
            this.showError('No hay contenido para exportar. Carga un documento primero.');
            return;
        }

        if (!window.PdfExporter) {
            this.showError('PDF Exporter no cargado.');
            return;
        }

        try {
            const exporter = new PdfExporter(AMAZON_KDP_STANDARDS);

            exporter.generate(
                this.state.document.chapters,
                this.state.document.bookType  || 'novela',
                this.state.document.pageFormat || '6x9',
                {
                    title:  this.state.document.title  || 'Sin título',
                    author: this.state.document.author || ''
                },
                this.state
            );

            this.showNotification('✓ PDF generado y descargado');
        } catch (error) {
            this.showError(`Error exportando PDF: ${error.message}`);
        }
    }

    /**
     * EXPORTACIÓN: EPUB
     */
    exportEpub() {
        this.showNotification('EPUB: Funcionalidad pendiente');
    }

    /**
     * EXPORTACIÓN: HTML
     */
    exportHtml() {
        try {
            let html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(this.state.document.title || 'Sin título')}</title>
</head>
<body>
    <h1>${this.escapeHtml(this.state.document.title || 'Sin título')}</h1>
`;

            this.state.document.chapters.forEach(chapter => {
                html += `
    <section>
        <h2>${this.escapeHtml(chapter.title)}</h2>
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

            this.showNotification('✓ HTML exportado');
        } catch (error) {
            this.showError(`Error exportando: ${error.message}`);
        }
    }

    /**
     * KEYBOARD SHORTCUTS
     */
    handleKeyboardShortcuts(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            this.saveProject();
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            this.saveChapter();
        }
    }

    /**
     * UI: Mostrar notificación
     */
    showNotification(message) {
        const container = document.getElementById('notifications-container');
        if (!container) return;
        const notif = document.createElement('div');
        notif.className = 'notification notification-success';
        notif.textContent = message;

        container.appendChild(notif);

        setTimeout(() => {
            notif.remove();
        }, 3000);
    }

    /**
     * UI: Mostrar error
     */
    showError(message) {
        const container = document.getElementById('notifications-container');
        if (!container) return;
        const notif = document.createElement('div');
        notif.className = 'notification notification-error';
        notif.textContent = message;

        container.appendChild(notif);

        setTimeout(() => {
            notif.remove();
        }, 5000);
    }
}

/* ================================================================
   INICIALIZAR APP AL CARGAR DOM
   ================================================================ */

document.addEventListener('DOMContentLoaded', () => {
    window.app = new EditorialApp();
});