import { useState, useMemo, useCallback, memo } from 'react';
import useEditorStore from '../../store/useEditorStore';
import { KDP_STANDARDS } from '../../utils/kdpStandards';
import Accordion from '../Accordion/Accordion';
import HeaderTemplateSelector from '../HeaderTemplateSelector/HeaderTemplateSelector';
import { 
  HEADER_TEMPLATES, 
  getHeaderTemplateConfig, 
  HEADER_CONTENT_LABELS,
  HEADER_DISPLAY_MODES,
  LINE_STYLE_OPTIONS,
  FONT_STYLE_OPTIONS,
  SUBHEADER_FORMAT_OPTIONS,
  PAGINATION_CONFLICT_OPTIONS,
  SUBTOPIC_BEHAVIORS,
  SEPARATOR_OPTIONS
} from '../../data/headerTemplates';
import './SidebarLeft.css';

// Layout icons as inline components
const ContinuousIcon = () => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', width: '20px' }}>
    <div style={{ width: '16px', height: '3px', background: '#1f2937', borderRadius: '1px' }}></div>
    <div style={{ width: '16px', height: '2px', background: '#e5e7eb', borderRadius: '1px' }}></div>
    <div style={{ width: '16px', height: '2px', background: '#e5e7eb', borderRadius: '1px' }}></div>
  </div>
);

const SpacedIcon = () => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', width: '20px' }}>
    <div style={{ width: '14px', height: '2px', background: '#1f2937', borderRadius: '1px' }}></div>
    <div style={{ height: '6px' }}></div>
    <div style={{ width: '14px', height: '2px', background: '#d1d5db', borderRadius: '1px' }}></div>
  </div>
);

const HalfPageIcon = () => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', width: '20px' }}>
    <div style={{ width: '16px', height: '3px', background: '#1f2937', borderRadius: '1px' }}></div>
    <div style={{ width: '16px', height: '2px', background: '#e5e7eb', borderRadius: '1px' }}></div>
    <div style={{ height: '4px', borderTop: '1px solid #6b7280' }}></div>
    <div style={{ width: '16px', height: '2px', background: '#e5e7eb', borderRadius: '1px' }}></div>
  </div>
);

const FullPageIcon = () => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', width: '20px', height: '32px' }}>
    <div style={{ width: '16px', height: '3px', background: '#1f2937', borderRadius: '1px' }}></div>
  </div>
);

const RuledIcon = () => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', width: '20px' }}>
    <div style={{ width: '12px', height: '1px', background: '#1f2937' }}></div>
    <div style={{ width: '16px', height: '2px', background: '#1f2937', borderRadius: '1px' }}></div>
    <div style={{ width: '12px', height: '1px', background: '#1f2937' }}></div>
  </div>
);

const CHAPTER_LAYOUTS = [
  { id: 'continuous', label: 'Seguido', icon: ContinuousIcon },
  { id: 'spaced', label: 'Con espacio', icon: SpacedIcon },
  { id: 'halfPage', label: 'Media página', icon: HalfPageIcon },
  { id: 'fullPage', label: 'Página completa', icon: FullPageIcon },
  { id: 'ruled', label: 'Con líneas', icon: RuledIcon },
];

function SidebarLeft() {
  const [activeTab, setActiveTab] = useState('structure');
  const [selectedSubheaderLevel, setSelectedSubheaderLevel] = useState('h1');
  
  const store = useEditorStore((s) => s);
  
  const safeBookData = store.bookData || { title: '', author: '', chapters: [], bookType: 'novela' };
  const safeConfig = store.config || { 
    pageFormat: 'a5', 
    fontSize: 12, 
    lineHeight: 1.6,
    showHeaders: false,
    header: {
      enabled: false,
      template: 'classic',
      displayMode: 'alternate',
      evenPage: { leftContent: 'title', centerContent: 'none', rightContent: 'none' },
      oddPage: { leftContent: 'none', centerContent: 'none', rightContent: 'chapter' },
      trackSubheaders: false,
      trackPseudoHeaders: false,
      subheaderLevels: ['h1', 'h2'],
      subheaderFormat: 'full',
      fontFamily: 'same',
      fontSize: 70,
      showLine: true,
      lineStyle: 'solid',
      lineWidth: 0.5,
      lineColor: 'black',
      marginTop: 0,
      marginBottom: 0.5,
      distanceFromPageNumber: 0.5,
      whenPaginationSamePosition: 'merge',
      skipFirstChapterPage: true
    },
    chapterTitle: { align: 'center', bold: true, sizeMultiplier: 1.8, marginTop: 2, marginBottom: 1, startOnRightPage: true, layout: 'continuous' },
    subheaders: {
      h1: { align: 'center', bold: true, sizeMultiplier: 1.5, marginTop: 1.5, marginBottom: 0.5, minLinesAfter: 2 },
      h2: { align: 'center', bold: true, sizeMultiplier: 1.35, marginTop: 1.25, marginBottom: 0.5, minLinesAfter: 2 },
      h3: { align: 'center', bold: true, sizeMultiplier: 1.25, marginTop: 1, marginBottom: 0.5, minLinesAfter: 1 },
      h4: { align: 'left', bold: true, sizeMultiplier: 1.15, marginTop: 1, marginBottom: 0.5, minLinesAfter: 1 },
      h5: { align: 'left', bold: true, sizeMultiplier: 1.1, marginTop: 0.75, marginBottom: 0.25, minLinesAfter: 1 },
      h6: { align: 'left', bold: false, sizeMultiplier: 1.0, marginTop: 0.5, marginBottom: 0.25, minLinesAfter: 1 }
    },
    paragraph: { firstLineIndent: 1.5, align: 'justify', spacingBetween: 0 },
    quote: { enabled: true, indentLeft: 2, indentRight: 2, showLine: true, italic: true, sizeMultiplier: 0.95, marginTop: 1, marginBottom: 1 },
    pagination: { minOrphanLines: 2, minWidowLines: 2, splitLongParagraphs: true }
  };
  
  const stats = useMemo(() => store.getStatsSelector(), [safeBookData?.chapters?.length]);

  const handleAddChapter = useCallback(() => {
    const title = prompt('Título del capítulo:');
    if (title) {
      store.addChapter(title);
    }
  }, [store.addChapter]);

  const handleAddSection = useCallback(() => {
    const title = prompt('Nombre de la sección (ej: Prólogo, Dedicatoria):');
    if (title) {
      store.addSection(title);
    }
  }, [store.addSection]);

  const handleTitleChange = useCallback((chapterId, newTitle) => {
    store.updateChapter(chapterId, { title: newTitle });
  }, [store.updateChapter]);

  const handleDocumentTitleChange = (e) => {
    store.setBookData({ title: e.target.value });
  };

  const handleDocumentAuthorChange = (e) => {
    store.setBookData({ author: e.target.value });
  };

  const handleBookTypeChange = (e) => {
    const bookConfig = KDP_STANDARDS.getBookTypeConfig(e.target.value);
    store.setBookData({ bookType: e.target.value });
    store.setConfig({
      pageFormat: bookConfig.recommendedFormat,
      fontSize: bookConfig.fontSize,
      lineHeight: bookConfig.lineHeight
    });
  };

  const updateChapterTitle = (key, value) => {
    store.setConfig({ chapterTitle: { ...safeConfig.chapterTitle, [key]: value } });
  };

  const updateChapterLayout = (layout) => {
    store.setConfig({ chapterTitle: { ...safeConfig.chapterTitle, layout } });
  };

  const updateSubheader = (key, value) => {
    const currentSubheader = safeConfig.subheaders?.[selectedSubheaderLevel] || {};
    store.setConfig({
      subheaders: {
        ...safeConfig.subheaders,
        [selectedSubheaderLevel]: { ...currentSubheader, [key]: value }
      }
    });
  };

  const updateParagraph = (key, value) => {
    store.setConfig({ paragraph: { ...safeConfig.paragraph, [key]: value } });
  };

  const updateQuote = (key, value) => {
    store.setConfig({ quote: { ...safeConfig.quote, [key]: value } });
  };

  const updatePagination = (key, value) => {
    store.setConfig({ pagination: { ...safeConfig.pagination, [key]: value } });
  };

  // Helper for safe access to current subheader config
  const currentSubheaderConfig = useMemo(() =>
    safeConfig.subheaders?.[selectedSubheaderLevel] || {
      align: 'center',
      bold: true,
      sizeMultiplier: 1.5,
      marginTop: 1.5,
      marginBottom: 0.5,
      minLinesAfter: 2
    },
    [safeConfig.subheaders, selectedSubheaderLevel]
  );

  const accordionItems = useMemo(() => [
    {
      id: 'formato',
      title: 'Formato del Libro',
      icon: '📐',
      content: (
        <>
          <fieldset className="config-group">
            <legend>Tipo de libro</legend>
            <select 
              value={safeBookData?.bookType || 'novela'} 
              onChange={handleBookTypeChange}
            >
              <option value="novela">Novela / Ficción</option>
              <option value="ensayo">Ensayo / No ficción</option>
              <option value="poesia">Poesía</option>
              <option value="manual">Manual / Técnico</option>
              <option value="infantil">Libro Infantil</option>
            </select>
          </fieldset>

          <fieldset className="config-group">
            <legend>Formato de página</legend>
            <select 
              value={safeConfig.pageFormat} 
              onChange={(e) => store.setConfig({ pageFormat: e.target.value })}
            >
              <option value="a5">A5 (14.8 × 21 cm)</option>
              <option value="a4">A4 (21 × 29.7 cm)</option>
              <option value="letter">Letter (8.5 × 11 in)</option>
              <option value="5x8">5 × 8 inches</option>
              <option value="6x9">6 × 9 inches</option>
              <option value="8x10">8 × 10 inches</option>
            </select>
          </fieldset>
        </>
      )
    },
    {
      id: 'tipografia',
      title: 'Tipografía Base',
      icon: '🔤',
      content: (
        <>
          <fieldset className="config-group">
            <legend>Familia de fuente</legend>
            <select 
              value={safeConfig.fontFamily} 
              onChange={(e) => store.setConfig({ fontFamily: e.target.value })}
            >
              <optgroup label="Serif">
                <option value="Georgia, serif">Georgia</option>
                <option value="'Times New Roman', serif">Times New Roman</option>
                <option value="Garamond, serif">Garamond</option>
                <option value="Merriweather, serif">Merriweather</option>
                <option value="Palatino, serif">Palatino</option>
                <option value="'Book Antiqua', serif">Book Antiqua</option>
                <option value="Cambria, serif">Cambria</option>
                <option value="Baskerville, serif">Baskerville</option>
              </optgroup>
              <optgroup label="Sans Serif">
                <option value="Arial, sans-serif">Arial</option>
                <option value="Helvetica, sans-serif">Helvetica</option>
                <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
                <option value="Verdana, sans-serif">Verdana</option>
                <option value="Calibri, sans-serif">Calibri</option>
                <option value="'Segoe UI', sans-serif">Segoe UI</option>
                <option value="Tahoma, sans-serif">Tahoma</option>
              </optgroup>
              <optgroup label="Monoespaciada">
                <option value="'Courier New', monospace">Courier New</option>
                <option value="Consolas, monospace">Consolas</option>
              </optgroup>
            </select>
          </fieldset>

          <fieldset className="config-group">
            <legend>Tamaño de fuente (pt)</legend>
            <input 
              type="number" 
              min="10" 
              max="16" 
              value={safeConfig.fontSize}
              onChange={(e) => store.setConfig({ fontSize: parseInt(e.target.value) })}
            />
          </fieldset>

          <fieldset className="config-group">
            <legend>Interlineado</legend>
            <select 
              value={safeConfig.lineHeight}
              onChange={(e) => store.setConfig({ lineHeight: parseFloat(e.target.value) })}
            >
              <option value="1.4">1.4 (Apretado)</option>
              <option value="1.5">1.5 (Recomendado)</option>
              <option value="1.6">1.6 (Espaciado)</option>
              <option value="1.8">1.8 (Amplio)</option>
              <option value="2.0">2.0 (Doble)</option>
            </select>
          </fieldset>
        </>
      )
    },
    {
      id: 'formato-capitulo',
      title: 'Formato de Títulos',
      icon: '📄',
      content: (
        <>
          <fieldset className="config-group">
            <legend>Estilo de título de capítulo</legend>
            <div className="layout-selector">
              {CHAPTER_LAYOUTS.map(layout => {
                const IconComponent = layout.icon;
                const currentLayout = safeConfig.chapterTitle?.layout || 'continuous';
                return (
                  <button
                    key={layout.id}
                    className={`layout-card ${currentLayout === layout.id ? 'active' : ''}`}
                    onClick={() => updateChapterLayout(layout.id)}
                    title={layout.label}
                  >
                    <div className="layout-card-preview">
                      <IconComponent />
                    </div>
                    <span className="layout-card-label">{layout.label}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </>
      )
    },
    {
      id: 'subheaders',
      title: 'Subencabezados (H1-H6)',
      icon: '📋',
      content: (
        <>
          <div className="level-selector">
            {['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map(level => (
              <button 
                key={level}
                className={`level-btn ${selectedSubheaderLevel === level ? 'active' : ''}`}
                onClick={() => setSelectedSubheaderLevel(level)}
              >
                {level.toUpperCase()}
              </button>
            ))}
          </div>

          <fieldset className="config-group">
            <legend>Alineación</legend>
            <div className="radio-group">
              <label><input type="radio" name="subAlign" value="left" checked={currentSubheaderConfig.align === 'left'} onChange={(e) => updateSubheader('align', e.target.value)} /> Izquierda</label>
              <label><input type="radio" name="subAlign" value="center" checked={currentSubheaderConfig.align === 'center'} onChange={(e) => updateSubheader('align', e.target.value)} /> Centro</label>
              <label><input type="radio" name="subAlign" value="right" checked={currentSubheaderConfig.align === 'right'} onChange={(e) => updateSubheader('align', e.target.value)} /> Derecha</label>
            </div>
          </fieldset>

          <fieldset className="config-group">
            <legend>Estilo</legend>
            <label className="checkbox-label">
              <input type="checkbox" checked={currentSubheaderConfig.bold} onChange={(e) => updateSubheader('bold', e.target.checked)} />
              Negrita
            </label>
          </fieldset>

          <fieldset className="config-group">
            <legend>Tamaño relativo</legend>
            <div className="number-row">
              <input type="number" min="0.8" max="2.0" step="0.05" value={currentSubheaderConfig.sizeMultiplier} onChange={(e) => updateSubheader('sizeMultiplier', parseFloat(e.target.value))} />
              <span>({Math.round(safeConfig.fontSize * currentSubheaderConfig.sizeMultiplier)}pt)</span>
            </div>
          </fieldset>

          <fieldset className="config-group">
            <legend>Espaciado</legend>
            <div className="number-row">
              <label>Antes:</label>
              <input type="number" min="0" max="3" step="0.25" value={currentSubheaderConfig.marginTop} onChange={(e) => updateSubheader('marginTop', parseFloat(e.target.value))} />
              <span>líneas</span>
            </div>
            <div className="number-row">
              <label>Después:</label>
              <input type="number" min="0" max="2" step="0.25" value={currentSubheaderConfig.marginBottom} onChange={(e) => updateSubheader('marginBottom', parseFloat(e.target.value))} />
              <span>líneas</span>
            </div>
          </fieldset>

          <fieldset className="config-group">
            <legend>Paginación</legend>
            <div className="number-row">
              <label>Mín. líneas después:</label>
              <input type="number" min="1" max="4" value={currentSubheaderConfig.minLinesAfter} onChange={(e) => updateSubheader('minLinesAfter', parseInt(e.target.value))} />
            </div>
          </fieldset>
        </>
      )
    },
    {
      id: 'parrafos',
      title: 'Párrafos',
      icon: '📝',
      content: (
        <>
          <fieldset className="config-group">
            <legend>Sangría primera línea</legend>
            <div className="number-row">
              <input type="number" min="0" max="3" step="0.25" value={safeConfig.paragraph?.firstLineIndent || 1.5} onChange={(e) => updateParagraph('firstLineIndent', parseFloat(e.target.value))} />
              <span>em</span>
            </div>
          </fieldset>

          <fieldset className="config-group">
            <legend>Alineación</legend>
            <div className="radio-group">
              <label><input type="radio" name="paraAlign" value="justify" checked={(safeConfig.paragraph?.align || 'justify') === 'justify'} onChange={(e) => updateParagraph('align', e.target.value)} /> Justificar</label>
              <label><input type="radio" name="paraAlign" value="left" checked={safeConfig.paragraph?.align === 'left'} onChange={(e) => updateParagraph('align', e.target.value)} /> Izquierda</label>
            </div>
          </fieldset>

          <fieldset className="config-group">
            <legend>Espaciado entre párrafos</legend>
            <div className="number-row">
              <input type="number" min="0" max="1" step="0.25" value={safeConfig.paragraph?.spacingBetween || 0} onChange={(e) => updateParagraph('spacingBetween', parseFloat(e.target.value))} />
              <span>líneas</span>
            </div>
          </fieldset>
        </>
      )
    },
    {
      id: 'citas',
      title: 'Citas',
      icon: '❝',
      content: (
        <>
          <fieldset className="config-group">
            <legend>Habilitar estilo</legend>
            <label className="checkbox-label">
              <input type="checkbox" checked={safeConfig.quote.enabled} onChange={(e) => updateQuote('enabled', e.target.checked)} />
              Aplicar estilo especial a citas
            </label>
          </fieldset>

          <fieldset className="config-group">
            <legend>Sangría</legend>
            <div className="number-row">
              <label>Izquierda:</label>
              <input type="number" min="0" max="4" step="0.5" value={safeConfig.quote.indentLeft} onChange={(e) => updateQuote('indentLeft', parseFloat(e.target.value))} />
              <span>em</span>
            </div>
            <div className="number-row">
              <label>Derecha:</label>
              <input type="number" min="0" max="4" step="0.5" value={safeConfig.quote.indentRight} onChange={(e) => updateQuote('indentRight', parseFloat(e.target.value))} />
              <span>em</span>
            </div>
          </fieldset>

          <fieldset className="config-group">
            <legend>Estilo</legend>
            <label className="checkbox-label">
              <input type="checkbox" checked={safeConfig.quote.italic} onChange={(e) => updateQuote('italic', e.target.checked)} />
              Cursiva
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={safeConfig.quote.showLine} onChange={(e) => updateQuote('showLine', e.target.checked)} />
              Línea decorativa izquierda
            </label>
          </fieldset>

          <fieldset className="config-group">
            <legend>Tamaño</legend>
            <div className="number-row">
              <input type="number" min="0.7" max="1.2" step="0.05" value={safeConfig.quote.sizeMultiplier} onChange={(e) => updateQuote('sizeMultiplier', parseFloat(e.target.value))} />
              <span>({Math.round(safeConfig.fontSize * safeConfig.quote.sizeMultiplier)}pt)</span>
            </div>
          </fieldset>

          <fieldset className="config-group">
            <legend>Márgenes</legend>
            <div className="number-row">
              <label>Superior:</label>
              <input type="number" min="0" max="2" step="0.25" value={safeConfig.quote.marginTop} onChange={(e) => updateQuote('marginTop', parseFloat(e.target.value))} />
              <span>em</span>
            </div>
            <div className="number-row">
              <label>Inferior:</label>
              <input type="number" min="0" max="2" step="0.25" value={safeConfig.quote.marginBottom} onChange={(e) => updateQuote('marginBottom', parseFloat(e.target.value))} />
              <span>em</span>
            </div>
          </fieldset>
        </>
      )
    },
    {
      id: 'headers',
      title: 'Encabezados (Headers)',
      icon: '📑',
      content: (
        <>
          <fieldset className="config-group">
            <legend>Mostrar</legend>
            <label className="checkbox-label">
              <input type="checkbox" checked={safeConfig.showHeaders} onChange={(e) => store.setConfig({ showHeaders: e.target.checked })} />
              Mostrar encabezados en páginas
            </label>
          </fieldset>

          {safeConfig.showHeaders && (
            <>
              <fieldset className="config-group">
                <legend>Plantilla de encabezado</legend>
                <HeaderTemplateSelector 
                  value={safeConfig.header?.template || 'classic'}
                  onChange={(templateId) => {
                    const templateConfig = getHeaderTemplateConfig(templateId);
                    store.setConfig({ 
                      showHeaders: true,
                      header: { 
                        ...safeConfig.header,
                        ...templateConfig,
                        enabled: true 
                      } 
                    });
                  }}
                  templates={Object.values(HEADER_TEMPLATES)}
                />
              </fieldset>

              {/* Custom configuration when template is 'custom' */}
              {safeConfig.header?.template === 'custom' && (
                <>
                  <fieldset className="config-group">
                    <legend>Páginas pares (izquierda)</legend>
                    <div className="header-page-config">
                      <div className="header-cell-config">
                        <label>Izquierda</label>
                        <select 
                          value={safeConfig.header?.evenPage?.leftContent || 'title'}
                          onChange={(e) => store.setConfig({ 
                            header: { 
                              ...safeConfig.header, 
                              evenPage: { ...safeConfig.header?.evenPage, leftContent: e.target.value }
                            }
                          })}
                        >
                          {Object.entries(HEADER_CONTENT_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="header-cell-config">
                        <label>Centro</label>
                        <select 
                          value={safeConfig.header?.evenPage?.centerContent || 'none'}
                          onChange={(e) => store.setConfig({ 
                            header: { 
                              ...safeConfig.header, 
                              evenPage: { ...safeConfig.header?.evenPage, centerContent: e.target.value }
                            }
                          })}
                        >
                          {Object.entries(HEADER_CONTENT_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="header-cell-config">
                        <label>Derecha</label>
                        <select 
                          value={safeConfig.header?.evenPage?.rightContent || 'none'}
                          onChange={(e) => store.setConfig({ 
                            header: { 
                              ...safeConfig.header, 
                              evenPage: { ...safeConfig.header?.evenPage, rightContent: e.target.value }
                            }
                          })}
                        >
                          {Object.entries(HEADER_CONTENT_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </fieldset>

                  <fieldset className="config-group">
                    <legend>Páginas impares (derecha)</legend>
                    <div className="header-page-config">
                      <div className="header-cell-config">
                        <label>Izquierda</label>
                        <select 
                          value={safeConfig.header?.oddPage?.leftContent || 'none'}
                          onChange={(e) => store.setConfig({ 
                            header: { 
                              ...safeConfig.header, 
                              oddPage: { ...safeConfig.header?.oddPage, leftContent: e.target.value }
                            }
                          })}
                        >
                          {Object.entries(HEADER_CONTENT_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="header-cell-config">
                        <label>Centro</label>
                        <select 
                          value={safeConfig.header?.oddPage?.centerContent || 'none'}
                          onChange={(e) => store.setConfig({ 
                            header: { 
                              ...safeConfig.header, 
                              oddPage: { ...safeConfig.header?.oddPage, centerContent: e.target.value }
                            }
                          })}
                        >
                          {Object.entries(HEADER_CONTENT_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="header-cell-config">
                        <label>Derecha</label>
                        <select 
                          value={safeConfig.header?.oddPage?.rightContent || 'chapter'}
                          onChange={(e) => store.setConfig({ 
                            header: { 
                              ...safeConfig.header, 
                              oddPage: { ...safeConfig.header?.oddPage, rightContent: e.target.value }
                            }
                          })}
                        >
                          {Object.entries(HEADER_CONTENT_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </fieldset>
                </>
              )}

              {/* Subheader tracking configuration */}
              <fieldset className="config-group">
                <legend>Vincular subtemas</legend>
                <label className="checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={safeConfig.header?.trackSubheaders || false}
                    onChange={(e) => store.setConfig({ 
                      header: { ...safeConfig.header, trackSubheaders: e.target.checked }
                    })}
                  />
                  Mostrar subtema actual (H1-H6) en encabezado
                </label>
                <label className="checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={safeConfig.header?.trackPseudoHeaders || false}
                    onChange={(e) => store.setConfig({ 
                      header: { ...safeConfig.header, trackPseudoHeaders: e.target.checked }
                    })}
                  />
                  Detectar negritas como subtemas
                </label>
                
                {/* Subtopic behavior options - show when either tracking option is enabled */}
                {(safeConfig.header?.trackSubheaders || safeConfig.header?.trackPseudoHeaders) && (
                  <div className="subtopic-options" style={{ marginTop: '12px' }}>
                    <div className="subtopic-behavior">
                      <label style={{ fontWeight: '500', marginBottom: '6px', display: 'block' }}>
                        Comportamiento del subtema:
                      </label>
                      <select 
                        value={safeConfig.header?.subtopicBehavior || 'none'}
                        onChange={(e) => store.setConfig({ 
                          header: { ...safeConfig.header, subtopicBehavior: e.target.value }
                        })}
                        style={{ width: '100%', marginBottom: '8px' }}
                      >
                        {SUBTOPIC_BEHAVIORS.map(behavior => (
                          <option key={behavior.value} value={behavior.value}>
                            {behavior.label}
                          </option>
                        ))}
                      </select>
                      <small style={{ color: '#6b7280', display: 'block', marginBottom: '12px' }}>
                        {SUBTOPIC_BEHAVIORS.find(b => b.value === (safeConfig.header?.subtopicBehavior || 'none'))?.description}
                      </small>
                    </div>
                    
                    {/* Separator options - show when behavior is 'combine' */}
                    {safeConfig.header?.subtopicBehavior === 'combine' && (
                      <div className="separator-options">
                        <label style={{ fontWeight: '500', marginBottom: '6px', display: 'block' }}>
                          Separador:
                        </label>
                        <select 
                          value={SEPARATOR_OPTIONS.some(opt => opt.value === safeConfig.header?.subtopicSeparator) 
                            ? safeConfig.header?.subtopicSeparator 
                            : 'custom'}
                          onChange={(e) => {
                            if (e.target.value !== 'custom') {
                              store.setConfig({ 
                                header: { ...safeConfig.header, subtopicSeparator: e.target.value }
                              });
                            }
                          }}
                          style={{ width: '100%', marginBottom: '8px' }}
                        >
                          {SEPARATOR_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label} - {opt.example}
                            </option>
                          ))}
                        </select>
                        
                        {/* Custom separator input */}
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input 
                            type="text"
                            placeholder="Separador personalizado"
                            value={!SEPARATOR_OPTIONS.some(opt => opt.value === safeConfig.header?.subtopicSeparator) 
                              ? safeConfig.header?.subtopicSeparator || ''
                              : ''}
                            onChange={(e) => store.setConfig({ 
                              header: { ...safeConfig.header, subtopicSeparator: e.target.value }
                            })}
                            style={{ flex: 1, padding: '4px 8px' }}
                          />
                        </div>
                      </div>
                    )}
                    
                    {/* Max length for subtopics */}
                    <div className="subtopic-max-length" style={{ marginTop: '12px' }}>
                      <label style={{ fontWeight: '500', marginBottom: '6px', display: 'block' }}>
                        Longitud máxima del subtema:
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input 
                          type="number"
                          min="20"
                          max="100"
                          step="5"
                          value={safeConfig.header?.subtopicMaxLength || 60}
                          onChange={(e) => store.setConfig({ 
                            header: { ...safeConfig.header, subtopicMaxLength: parseInt(e.target.value) || 60 }
                          })}
                          style={{ width: '80px', padding: '4px 8px' }}
                        />
                        <span style={{ color: '#6b7280' }}>caracteres</span>
                      </div>
                    </div>
                  </div>
                )}
              </fieldset>

              {/* Display mode selector */}
              <fieldset className="config-group">
                <legend>Mostrar en</legend>
                <select 
                  value={safeConfig.header?.displayMode || 'alternate'}
                  onChange={(e) => store.setConfig({ 
                    header: { ...safeConfig.header, displayMode: e.target.value }
                  })}
                >
                  {HEADER_DISPLAY_MODES.map(mode => (
                    <option key={mode.value} value={mode.value}>{mode.label}</option>
                  ))}
                </select>
              </fieldset>

              {safeConfig.header?.trackSubheaders && (
                <>
                  <fieldset className="config-group">
                    <legend>Niveles a rastrear</legend>
                    <div className="subheader-levels">
                      {['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map(level => (
                        <button
                          key={level}
                          type="button"
                          className={`subheader-level-btn ${(safeConfig.header?.subheaderLevels || ['h1', 'h2']).includes(level) ? 'active' : ''}`}
                          onClick={() => {
                            const currentLevels = safeConfig.header?.subheaderLevels || ['h1', 'h2'];
                            const newLevels = currentLevels.includes(level)
                              ? currentLevels.filter(l => l !== level)
                              : [...currentLevels, level];
                            store.setConfig({ 
                              header: { ...safeConfig.header, subheaderLevels: newLevels }
                            });
                          }}
                        >
                          {level.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <fieldset className="config-group">
                    <legend>Formato del subtema</legend>
                    <select 
                      value={safeConfig.header?.subheaderFormat || 'full'}
                      onChange={(e) => store.setConfig({ 
                        header: { ...safeConfig.header, subheaderFormat: e.target.value }
                      })}
                    >
                      {SUBHEADER_FORMAT_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </fieldset>
                </>
              )}

              {/* Style options */}
              <fieldset className="config-group">
                <legend>Estilo visual</legend>
                <div className="header-style-options">
                  <div className="style-option">
                    <label>Fuente</label>
                    <select 
                      value={safeConfig.header?.fontFamily || 'same'}
                      onChange={(e) => store.setConfig({ 
                        header: { ...safeConfig.header, fontFamily: e.target.value }
                      })}
                    >
                      {FONT_STYLE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="style-option">
                    <label>Tamaño (%)</label>
                    <input 
                      type="number" 
                      min="50" 
                      max="100" 
                      step="5"
                      value={safeConfig.header?.fontSize || 70}
                      onChange={(e) => store.setConfig({ 
                        header: { ...safeConfig.header, fontSize: parseInt(e.target.value) }
                      })}
                    />
                  </div>
                </div>
              </fieldset>

              <fieldset className="config-group">
                <legend>Línea divisoria</legend>
                <label className="checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={safeConfig.header?.showLine ?? true}
                    onChange={(e) => store.setConfig({ 
                      header: { ...safeConfig.header, showLine: e.target.checked }
                    })}
                  />
                  Mostrar línea
                </label>
                {safeConfig.header?.showLine && (
                  <div className="header-style-options" style={{ marginTop: '8px' }}>
                    <div className="style-option">
                      <label>Estilo</label>
                      <select 
                        value={safeConfig.header?.lineStyle || 'solid'}
                        onChange={(e) => store.setConfig({ 
                          header: { ...safeConfig.header, lineStyle: e.target.value }
                        })}
                      >
                        {LINE_STYLE_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="style-option">
                      <label>Grosor (pt)</label>
                      <input 
                        type="number" 
                        min="0.25" 
                        max="2" 
                        step="0.25"
                        value={safeConfig.header?.lineWidth || 0.5}
                        onChange={(e) => store.setConfig({ 
                          header: { ...safeConfig.header, lineWidth: parseFloat(e.target.value) }
                        })}
                      />
                    </div>
                  </div>
                )}
              </fieldset>

              {/* Pagination conflict resolution */}
              {safeConfig.pageNumberPos === 'top' && (
                <fieldset className="config-group">
                  <legend>Cuando paginación también está arriba</legend>
                  <select 
                    value={safeConfig.header?.whenPaginationSamePosition || 'merge'}
                    onChange={(e) => store.setConfig({ 
                      header: { ...safeConfig.header, whenPaginationSamePosition: e.target.value }
                    })}
                  >
                    {PAGINATION_CONFLICT_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </fieldset>
              )}

              <fieldset className="config-group">
                <legend>Opciones avanzadas</legend>
                <label className="checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={safeConfig.header?.skipFirstChapterPage ?? true}
                    onChange={(e) => store.setConfig({ 
                      header: { ...safeConfig.header, skipFirstChapterPage: e.target.checked }
                    })}
                  />
                  Omitir en primera página de capítulo
                </label>
              </fieldset>
            </>
          )}
        </>
      )
    },
    {
      id: 'paginas',
      title: 'Números de Página',
      icon: '#️⃣',
      content: (
        <>
          <fieldset className="config-group">
            <legend>Mostrar</legend>
            <label className="checkbox-label">
              <input type="checkbox" checked={safeConfig.showPageNumbers} onChange={(e) => store.setConfig({ showPageNumbers: e.target.checked })} />
              Mostrar números de página
            </label>
          </fieldset>

          {safeConfig.showPageNumbers && (
            <>
              <fieldset className="config-group">
                <legend>Posición</legend>
                <select value={safeConfig.pageNumberPos} onChange={(e) => store.setConfig({ pageNumberPos: e.target.value })}>
                  <option value="top">Arriba</option>
                  <option value="bottom">Abajo</option>
                </select>
              </fieldset>

              <fieldset className="config-group">
                <legend>Alineación</legend>
                <select value={safeConfig.pageNumberAlign} onChange={(e) => store.setConfig({ pageNumberAlign: e.target.value })}>
                  <option value="left">Izquierda</option>
                  <option value="center">Centro</option>
                  <option value="right">Derecha</option>
                  <option value="outer">Exterior (alterno)</option>
                </select>
              </fieldset>
            </>
          )}
        </>
      )
    },
    {
      id: 'paginacion',
      title: 'Reglas de Paginación',
      icon: '📄',
      content: (
        <>
          <fieldset className="config-group">
            <legend>Páginas huérfanas (orphan)</legend>
            <div className="number-row">
              <label>Mín. líneas al final:</label>
              <input type="number" min="1" max="4" value={safeConfig.pagination.minOrphanLines} onChange={(e) => updatePagination('minOrphanLines', parseInt(e.target.value))} />
            </div>
          </fieldset>

          <fieldset className="config-group">
            <legend>Páginas viudas (widow)</legend>
            <div className="number-row">
              <label>Mín. líneas al inicio:</label>
              <input type="number" min="1" max="4" value={safeConfig.pagination.minWidowLines} onChange={(e) => updatePagination('minWidowLines', parseInt(e.target.value))} />
            </div>
          </fieldset>

          <fieldset className="config-group">
            <legend>Párrafos largos</legend>
            <label className="checkbox-label">
              <input type="checkbox" checked={safeConfig.pagination.splitLongParagraphs} onChange={(e) => updatePagination('splitLongParagraphs', e.target.checked)} />
              Dividir párrafos entre páginas
            </label>
          </fieldset>
        </>
      )
    }
  ], [selectedSubheaderLevel, safeConfig, safeBookData?.bookType, handleBookTypeChange, store.setConfig, currentSubheaderConfig]);

  return (
    <aside className="sidebar sidebar-left" role="complementary" aria-label="Panel de estructura y configuración">
      <div className="sidebar-tabs">
        <button 
          className={`sidebar-tab ${activeTab === 'structure' ? 'active' : ''}`}
          onClick={() => setActiveTab('structure')}
          aria-selected={activeTab === 'structure'}
        >
          Estructura
        </button>
        <button 
          className={`sidebar-tab ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
          aria-selected={activeTab === 'config'}
        >
          Configuración
        </button>
      </div>

      {activeTab === 'structure' && (
        <section className="sidebar-section">
          <h2 className="sidebar-title">Estructura del Libro</h2>
          
          <div className="document-metadata">
            <label className="metadata-label">
              <span>Título del libro</span>
              <input 
                type="text" 
                value={safeBookData?.title || ''} 
                onChange={handleDocumentTitleChange}
                placeholder="Título de tu libro"
                className="metadata-input"
              />
            </label>
            <label className="metadata-label">
              <span>Autor</span>
              <input 
                type="text" 
                value={safeBookData?.author || ''} 
                onChange={handleDocumentAuthorChange}
                placeholder="Nombre del autor"
                className="metadata-input"
              />
            </label>
          </div>
          
          <div className="structure-controls">
            <button className="btn btn-small" onClick={handleAddChapter}>
              + Capítulo
            </button>
            <button className="btn btn-small btn-secondary" onClick={handleAddSection}>
              + Sección
            </button>
          </div>

          <nav className="structure-panel" aria-label="Estructura de capítulos">
            <div className="chapters-list">
              {safeBookData?.chapters?.length === 0 ? (
                <p className="empty-state">Sin capítulos cargados</p>
              ) : (
                safeBookData?.chapters?.map((chapter, index) => (
                  <ChapterItem
                    key={chapter.id}
                    chapter={chapter}
                    index={index}
                    isActive={store.editing?.activeChapterId === chapter.id}
                    onSelect={store.setActiveChapter}
                    onDelete={store.deleteChapter}
                    onMove={store.moveChapter}
                    onTitleChange={handleTitleChange}
                    totalChapters={safeBookData.chapters.length}
                  />
                ))
              )}
            </div>
          </nav>

          <div className="document-stats">
            <h3 className="stats-title">Estadísticas</h3>
            <dl className="stats-list">
              <dt>Capítulos:</dt>
              <dd>{stats.chapters}</dd>
              <dt>Palabras:</dt>
              <dd>{stats.words}</dd>
              <dt>Caracteres:</dt>
              <dd>{stats.characters}</dd>
              <dt>Páginas estimadas:</dt>
              <dd>{stats.pages}</dd>
              <dt>Tiempo de lectura:</dt>
              <dd>{stats.readingTime} min</dd>
            </dl>
          </div>
        </section>
      )}

      {activeTab === 'config' && (
        <section className="sidebar-section">
          <h2 className="sidebar-title">Configuración Editorial</h2>
          <Accordion items={accordionItems} defaultOpen="formato" />
        </section>
      )}
    </aside>
  );
}

const ChapterItem = memo(function ChapterItem({ 
  chapter, 
  index, 
  isActive, 
  onSelect, 
  onDelete, 
  onMove, 
  onTitleChange,
  totalChapters 
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleDragStart = useCallback((e) => {
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index);
  }, [index]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setDragOver(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    if (!isDragging) {
      setDragOver(true);
    }
  }, [isDragging]);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (fromIndex !== index) {
      onMove(fromIndex, index);
    }
    setIsDragging(false);
  }, [index, onMove]);

  return (
    <div 
      className={`chapter-item ${isActive ? 'active' : ''} ${dragOver ? 'drag-over' : ''} ${isDragging ? 'dragging' : ''}`}
      onClick={() => onSelect(chapter.id)}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="chapter-item-header">
        <span className="chapter-drag-handle" title="Arrastrar">⋮⋮</span>
        <span className={`item-type-badge ${chapter.type === 'section' ? 'section-badge' : 'chapter-badge'}`}>
          {chapter.type === 'section' ? 'Sección' : 'Cap.'}
        </span>
        <input 
          className="chapter-item-title-input"
          value={chapter.title}
          onChange={(e) => onTitleChange(chapter.id, e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onFocus={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.target.blur();
            }
          }}
          onBlur={(e) => {
            if (!e.target.value.trim()) {
              onTitleChange(chapter.id, 'Sin título');
            }
          }}
        />
        <div className="reorder-buttons">
          <button 
            className="btn-reorder"
            onClick={(e) => {
              e.stopPropagation();
              onMove(index, index - 1);
            }}
            disabled={index === 0}
            title="Subir"
          >
            ↑
          </button>
          <button 
            className="btn-reorder"
            onClick={(e) => {
              e.stopPropagation();
              onMove(index, index + 1);
            }}
            disabled={index === totalChapters - 1}
            title="Bajar"
          >
            ↓
          </button>
        </div>
        <button 
          className="btn-delete-item" 
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`¿Eliminar "${chapter.title}"?`)) {
              onDelete(chapter.id);
            }
          }}
          aria-label="Eliminar"
        >
          ✕
        </button>
      </div>
      <span className="chapter-item-meta">{chapter.wordCount} palabras</span>
    </div>
  );
});

export default memo(SidebarLeft);
