import { useCallback } from 'react';
import {
  ContinuousIcon,
  SpacedIcon,
  HalfPageIcon,
  FullPageIcon,
  HierarchyClassicIcon,
  HierarchyMinimalIcon,
  HierarchyNumberIcon,
  HierarchyRomanIcon,
  HierarchyElegantIcon,
  HierarchyModernIcon,
} from '../icons';
import { transformAllChapters, detectTitleFormat, TITLE_FORMAT_OPTIONS } from '../../../utils/titleTransformer';

const CHAPTER_LAYOUTS = [
  { id: 'continuous', label: 'Seguido', icon: ContinuousIcon },
  { id: 'spaced', label: 'Con espacio', icon: SpacedIcon },
  { id: 'halfPage', label: 'Media página', icon: HalfPageIcon },
  { id: 'fullPage', label: 'Página completa', icon: FullPageIcon },
];

const HIERARCHY_TEMPLATES = [
  {
    id: 'classic',
    label: 'Clásico',
    icon: HierarchyClassicIcon,
    config: { hierarchyLabelSizeMultiplier: 0.7, hierarchyTitleSizeMultiplier: 1.0, hierarchyLabelColor: '#6b7280', hierarchyLabelBold: true }
  },
  {
    id: 'minimal',
    label: 'Minimal',
    icon: HierarchyMinimalIcon,
    config: { hierarchyEnabled: false }
  },
  {
    id: 'number',
    label: 'Número',
    icon: HierarchyNumberIcon,
    config: { hierarchyLabelSizeMultiplier: 1.0, hierarchyTitleSizeMultiplier: 0.85, hierarchyLabelColor: '#1f2937', hierarchyLabelBold: true }
  },
  {
    id: 'roman',
    label: 'Romano',
    icon: HierarchyRomanIcon,
    config: { hierarchyLabelSizeMultiplier: 0.9, hierarchyTitleSizeMultiplier: 0.9, hierarchyLabelColor: '#1f2937', hierarchyLabelBold: false }
  },
  {
    id: 'elegant',
    label: 'Elegante',
    icon: HierarchyElegantIcon,
    config: { hierarchyLabelSizeMultiplier: 0.65, hierarchyTitleSizeMultiplier: 1.0, hierarchyLabelColor: '#6b7280', hierarchyLabelBold: false }
  },
  {
    id: 'modern',
    label: 'Moderno',
    icon: HierarchyModernIcon,
    config: { hierarchyLabelSizeMultiplier: 1.2, hierarchyTitleSizeMultiplier: 0.8, hierarchyLabelColor: '#3b82f6', hierarchyLabelBold: true }
  },
];

function TitlePanel({ safeConfig, config, chapters, setConfig, setBookData }) {
  const updateChapterTitle = useCallback((key, value) => {
    const currentChapterTitle = config?.chapterTitle || { align: 'center', bold: true, sizeMultiplier: 1.8, marginTop: 2, marginBottom: 1, startOnRightPage: true, layout: 'continuous', showLines: false, lineWidth: 0.5, lineStyle: 'solid', lineColor: '#333333', lineWidthTitle: false };
    setConfig({ chapterTitle: { ...currentChapterTitle, [key]: value } });
  }, [setConfig, config?.chapterTitle]);

  const updateChapterLayout = useCallback((layout) => {
    console.log('🔘 Botón layout clickeado:', layout);
    const currentChapterTitle = config?.chapterTitle || { align: 'center', bold: true, sizeMultiplier: 1.8, marginTop: 2, marginBottom: 1, startOnRightPage: true, layout: 'continuous', showLines: false, lineWidth: 0.5, lineStyle: 'solid', lineColor: '#333333', lineWidthTitle: false };
    setConfig({ chapterTitle: { ...currentChapterTitle, layout } });
    console.log('🔘 Config actualizada, nuevo layout:', layout);
  }, [setConfig, config?.chapterTitle]);

  const applyHierarchyTemplate = useCallback((templateId) => {
    const template = HIERARCHY_TEMPLATES.find(t => t.id === templateId);
    if (!template) return;

    const currentChapterTitle = config?.chapterTitle || {};
    const updates = { ...template.config };

    if (templateId === 'minimal') {
      updates.hierarchyEnabled = false;
    } else {
      updates.hierarchyEnabled = true;
    }

    setConfig({
      chapterTitle: {
        ...currentChapterTitle,
        ...updates
      }
    });
  }, [setConfig, config?.chapterTitle]);

  const isHierarchyTemplateActive = (template) => {
    if (template.id === 'minimal') {
      return safeConfig.chapterTitle?.hierarchyEnabled === false;
    }
    if (safeConfig.chapterTitle?.hierarchyEnabled === false) return false;

    const ct = safeConfig.chapterTitle || {};
    return ct.hierarchyLabelSizeMultiplier === template.config.hierarchyLabelSizeMultiplier &&
           ct.hierarchyLabelColor === template.config.hierarchyLabelColor;
  };

  const handleTransformTitles = useCallback((targetFormat) => {
    if (!chapters || chapters.length === 0) return;

    const transformed = transformAllChapters(chapters, targetFormat);

    const detectedFormats = chapters.map(ch => detectTitleFormat(ch.title));
    const uniqueFormats = [...new Set(detectedFormats.filter(Boolean))];

    const actionLabel = uniqueFormats.length > 0
      ? `Transformar de ${uniqueFormats[0]} a ${targetFormat}`
      : `Transformar a ${targetFormat}`;

    setBookData({ chapters: transformed });

    if (typeof window.trackChange === 'function') {
      window.trackChange(actionLabel);
    }
  }, [chapters, setBookData]);

  return (
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

      <fieldset className="config-group">
        <legend>Decoración</legend>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={safeConfig.chapterTitle?.showLines || false}
            onChange={(e) => updateChapterTitle('showLines', e.target.checked)}
          />
          Mostrar líneas decorativas
        </label>

        {safeConfig.chapterTitle?.showLines && (
          <>
            <fieldset className="config-group">
              <legend>Estilo de línea</legend>
              <div className="radio-group">
                <label>
                  <input
                    type="radio"
                    name="lineStyle"
                    value="solid"
                    checked={(safeConfig.chapterTitle?.lineStyle || 'solid') === 'solid'}
                    onChange={(e) => updateChapterTitle('lineStyle', e.target.value)}
                  /> Sólida
                </label>
                <label>
                  <input
                    type="radio"
                    name="lineStyle"
                    value="dashed"
                    checked={(safeConfig.chapterTitle?.lineStyle || 'solid') === 'dashed'}
                    onChange={(e) => updateChapterTitle('lineStyle', e.target.value)}
                  /> Discontinua
                </label>
                <label>
                  <input
                    type="radio"
                    name="lineStyle"
                    value="dotted"
                    checked={(safeConfig.chapterTitle?.lineStyle || 'solid') === 'dotted'}
                    onChange={(e) => updateChapterTitle('lineStyle', e.target.value)}
                  /> Punteada
                </label>
                <label>
                  <input
                    type="radio"
                    name="lineStyle"
                    value="double"
                    checked={(safeConfig.chapterTitle?.lineStyle || 'solid') === 'double'}
                    onChange={(e) => updateChapterTitle('lineStyle', e.target.value)}
                  /> Doble
                </label>
              </div>
            </fieldset>

            <fieldset className="config-group">
              <legend>Grosor</legend>
              <div className="number-row">
                <input
                  type="number"
                  min="0.25"
                  max="3"
                  step="0.25"
                  value={safeConfig.chapterTitle?.lineWidth || 0.5}
                  onChange={(e) => updateChapterTitle('lineWidth', parseFloat(e.target.value))}
                />
                <span>px</span>
              </div>
            </fieldset>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={safeConfig.chapterTitle?.lineWidthTitle || false}
                onChange={(e) => updateChapterTitle('lineWidthTitle', e.target.checked)}
              />
              Líneas del ancho del título
            </label>
          </>
        )}
      </fieldset>

      <fieldset className="config-group">
        <legend>Espaciado del título</legend>
        <div className="number-row">
          <label>Espacio antes:</label>
          <input
            type="number"
            min="0" max="5" step="0.5"
            value={safeConfig.chapterTitle?.marginTop ?? 2}
            onChange={(e) => updateChapterTitle('marginTop', parseFloat(e.target.value))}
          />
          <span>líneas</span>
        </div>
        <div className="number-row">
          <label>Espacio después:</label>
          <input
            type="number"
            min="0" max="3" step="0.25"
            value={safeConfig.chapterTitle?.marginBottom ?? 1}
            onChange={(e) => updateChapterTitle('marginBottom', parseFloat(e.target.value))}
          />
          <span>líneas</span>
        </div>
      </fieldset>

      <fieldset className="config-group">
        <legend>Jerarquía de título</legend>

        <div className="layout-selector" style={{ marginBottom: '12px', gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {HIERARCHY_TEMPLATES.map(template => {
            const IconComponent = template.icon;
            const isActive = isHierarchyTemplateActive(template);
            return (
              <button
                key={template.id}
                className={`layout-card ${isActive ? 'active' : ''}`}
                onClick={() => applyHierarchyTemplate(template.id)}
                title={template.label}
                style={{ padding: '6px', minHeight: 'auto' }}
              >
                <div className="layout-card-preview" style={{ transform: 'scale(0.7)' }}>
                  <IconComponent />
                </div>
                <span className="layout-card-label" style={{ fontSize: '9px' }}>{template.label}</span>
              </button>
            );
          })}
        </div>

        <fieldset className="config-group" style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px dashed #e5e7eb' }}>
          <legend style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
            Transformar Títulos
          </legend>
          <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '10px' }}>
            Transforma el formato de todos los capítulos a la vez
          </div>
          <select
            onChange={(e) => {
              if (e.target.value) {
                handleTransformTitles(e.target.value);
                e.target.value = '';
              }
            }}
            defaultValue=""
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #d1d5db',
              fontSize: '12px',
              backgroundColor: 'white'
            }}
          >
            <option value="" disabled>Seleccionar formato...</option>
            {TITLE_FORMAT_OPTIONS.map(format => (
              <option key={format.id} value={format.id}>
                {format.label} - {format.example}
              </option>
            ))}
          </select>
        </fieldset>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={safeConfig.chapterTitle?.hierarchyEnabled !== false}
            onChange={(e) => updateChapterTitle('hierarchyEnabled', e.target.checked)}
          />
          Detectar etiqueta y título automáticamente
        </label>
        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
          Detecta patrones como "Capítulo 1 – Título" y los separa visualmente.
        </div>

        {safeConfig.chapterTitle?.hierarchyEnabled !== false && (
          <>
            <div className="number-row">
              <label>Tamaño etiqueta:</label>
              <input
                type="number"
                min="0.4" max="1.0" step="0.05"
                value={safeConfig.chapterTitle?.hierarchyLabelSizeMultiplier ?? 0.7}
                onChange={(e) => updateChapterTitle('hierarchyLabelSizeMultiplier', parseFloat(e.target.value))}
              />
              <span>×</span>
            </div>
            <div className="number-row">
              <label>Tamaño título:</label>
              <input
                type="number"
                min="0.8" max="1.5" step="0.05"
                value={safeConfig.chapterTitle?.hierarchyTitleSizeMultiplier ?? 1.0}
                onChange={(e) => updateChapterTitle('hierarchyTitleSizeMultiplier', parseFloat(e.target.value))}
              />
              <span>×</span>
            </div>
            <div className="number-row">
              <label>Color etiqueta:</label>
              <input
                type="color"
                value={safeConfig.chapterTitle?.hierarchyLabelColor || '#666666'}
                onChange={(e) => updateChapterTitle('hierarchyLabelColor', e.target.value)}
              />
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={safeConfig.chapterTitle?.hierarchyLabelBold || false}
                onChange={(e) => updateChapterTitle('hierarchyLabelBold', e.target.checked)}
              />
              Etiqueta en negrita
            </label>
          </>
        )}
      </fieldset>
    </>
  );
}

export default TitlePanel;
