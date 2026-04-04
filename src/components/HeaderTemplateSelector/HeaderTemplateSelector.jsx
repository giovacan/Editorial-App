import { useState, memo } from 'react';
import './HeaderTemplateSelector.css';

/**
 * Large preview component for modal
 */
const TemplatePreviewLarge = memo(function TemplatePreviewLarge({ 
  template, 
  isSelected,
  onClick
}) {
  // Simulate content for preview - shows content based on position
  const getPreviewContent = (content) => {
    switch (content) {
      case 'title':     return 'Mi Libro';
      case 'chapter':   return 'Capítulo 3';
      case 'subheader': return 'Sección 2.1';
      case 'page':      return '42';
      default:          return '';
    }
  };

  const CONTENT_LABELS = {
    title: 'Título', chapter: 'Capítulo', subheader: 'Subtema', page: 'Pág', none: '—',
  };

  const renderPreviewPage = (pageConfig, side) => {
    const isEven = side === 'even';
    const badge  = isEven ? 'PAR' : 'IMPAR';
    const folioAtTop  = template.pageNumberPos === 'top';
    const folioAlign  = template.pageNumberAlign || 'center';
    const folioOnOuter = folioAlign === 'outer' || folioAlign === 'paragraph-edge' || folioAlign === 'paragraph';

    // For folio-at-top templates: inject '42' into the correct slot for the preview
    let leftContent   = getPreviewContent(pageConfig.leftContent);
    let centerContent = getPreviewContent(pageConfig.centerContent);
    let rightContent  = getPreviewContent(pageConfig.rightContent);

    if (folioAtTop && folioOnOuter) {
      // outer = left on even, right on odd
      if (isEven) leftContent  = leftContent  ? `42 | ${leftContent}`  : '42';
      else        rightContent = rightContent ? `${rightContent} | 42` : '42';
    } else if (folioAtTop) {
      // center alignment: show number above text line in preview
      centerContent = centerContent ? `42 | ${centerContent}` : '42';
    }

    return (
      <div className={`preview-page-large preview-${side}`}>
        <div className="preview-page-badge">{badge}</div>
        <div className="preview-header-large">
          <span className="preview-header-left" title={CONTENT_LABELS[pageConfig.leftContent]}>
            {leftContent}
          </span>
          <span className="preview-header-center" title={CONTENT_LABELS[pageConfig.centerContent]}>
            {centerContent}
          </span>
          <span className="preview-header-right" title={CONTENT_LABELS[pageConfig.rightContent]}>
            {rightContent}
          </span>
        </div>
        {template.showLine && (
          <div className={`preview-line-large preview-line-${template.lineStyle}`} />
        )}
        <div className="preview-content-large">
          <div className="preview-line-text" />
          <div className="preview-line-text" />
          <div className="preview-line-text short" />
        </div>
      </div>
    );
  };

  return (
    <button
      type="button"
      className={`template-card-large ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <div className="template-preview-large-container">
        <div className="template-preview-spread-large">
          {renderPreviewPage(template.evenPage, 'even')}
          {renderPreviewPage(template.oddPage, 'odd')}
        </div>
      </div>
      <div className="template-info-large">
        <span className="template-icon-large">{template.icon}</span>
        <div className="template-text">
          <span className="template-name-large">{template.name}</span>
          <span className="template-description">{template.description}</span>
        </div>
      </div>
      {isSelected && <div className="template-selected-badge">✓</div>}
    </button>
  );
});

/**
 * Subtopic configuration panel
 */
const SubtopicConfigPanel = memo(function SubtopicConfigPanel({
  config,
  onChange
}) {
  if (!config) return null;
  const handleSubtopicBehaviorChange = (behavior) => {
    onChange({ ...config, subtopicBehavior: behavior });
  };

  const handleSeparatorChange = (separator) => {
    onChange({ ...config, subtopicSeparator: separator });
  };

  const handleMaxLengthChange = (e) => {
    const value = parseInt(e.target.value) || 60;
    onChange({ ...config, subtopicMaxLength: value });
  };

  return (
    <div className="subtopic-config-panel">
      <div className="config-group">
        <legend>Comportamiento de Subtemas</legend>
        <div className="radio-group">
          <label>
            <input
              type="radio"
              value="none"
              checked={config.subtopicBehavior === 'none'}
              onChange={(e) => handleSubtopicBehaviorChange(e.target.value)}
            />
            No mostrar
          </label>
          <label>
            <input
              type="radio"
              value="combine"
              checked={config.subtopicBehavior === 'combine'}
              onChange={(e) => handleSubtopicBehaviorChange(e.target.value)}
            />
            Combinar con contenido
          </label>
          <label>
            <input
              type="radio"
              value="replace"
              checked={config.subtopicBehavior === 'replace'}
              onChange={(e) => handleSubtopicBehaviorChange(e.target.value)}
            />
            Reemplazar contenido
          </label>
          <label>
            <input
              type="radio"
              value="odd-only"
              checked={config.subtopicBehavior === 'odd-only'}
              onChange={(e) => handleSubtopicBehaviorChange(e.target.value)}
            />
            Solo páginas impares
          </label>
          <label>
            <input
              type="radio"
              value="even-only"
              checked={config.subtopicBehavior === 'even-only'}
              onChange={(e) => handleSubtopicBehaviorChange(e.target.value)}
            />
            Solo páginas pares
          </label>
        </div>
      </div>

      <div className="config-group">
        <legend>Separador de Subtemas</legend>
        <div className="radio-group">
          <label>
            <input
              type="radio"
              value=" | "
              checked={config.subtopicSeparator === ' | '}
              onChange={() => handleSeparatorChange(' | ')}
            />
            Barra vertical (|)
          </label>
          <label>
            <input
              type="radio"
              value=" • "
              checked={config.subtopicSeparator === ' • '}
              onChange={() => handleSeparatorChange(' • ')}
            />
            Punto medio (•)
          </label>
          <label>
            <input
              type="radio"
              value=" — "
              checked={config.subtopicSeparator === ' — '}
              onChange={() => handleSeparatorChange(' — ')}
            />
            Guión largo (—)
          </label>
          <label>
            <input
              type="radio"
              value=" / "
              checked={config.subtopicSeparator === ' / '}
              onChange={() => handleSeparatorChange(' / ')}
            />
            Diagonal (/)
          </label>
        </div>
      </div>

      <div className="config-group">
        <legend>Longitud Máxima</legend>
        <div className="number-row">
          <label>Caracteres máximos:</label>
          <input
            type="number"
            min="20"
            max="100"
            value={config.subtopicMaxLength || 60}
            onChange={handleMaxLengthChange}
          />
        </div>
      </div>
    </div>
  );
});

/**
 * Compact button for sidebar
 */
function HeaderTemplateButton({ currentTemplate, onClick }) {
  return (
    <button 
      type="button"
      className="header-template-button"
      onClick={onClick}
    >
      <span className="template-button-icon">{currentTemplate.icon}</span>
      <span className="template-button-name">{currentTemplate.name}</span>
      <span className="template-button-arrow">›</span>
    </button>
  );
}

/**
 * Modal component for template selection with subtopic configuration
 */
function HeaderTemplateModal({ 
  isOpen, 
  onClose, 
  templates, 
  selectedId, 
  onSelect,
  headerConfig,
  onHeaderConfigChange
}) {
  if (!isOpen) return null;

  const currentTemplate = templates.find(t => t.id === selectedId);
  const hasSubtopicFeatures = !!(currentTemplate?.trackSubheaders ||
    (currentTemplate?.subtopicBehavior && currentTemplate.subtopicBehavior !== 'none'));

  return (
    <div className="header-template-modal-overlay" onClick={onClose}>
      <div className="header-template-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Seleccionar Plantilla de Encabezado</h3>
          <button 
            type="button"
            className="modal-close-btn" 
            onClick={onClose}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        <div className="modal-content">
          <div className="template-grid-large">
            {templates.map(template => (
              <TemplatePreviewLarge
                key={template.id}
                template={template}
                isSelected={selectedId === template.id}
                onClick={() => onSelect(template.id)}
              />
            ))}
          </div>
          
          {hasSubtopicFeatures && (
            <div className="subtopic-config-section">
              <h4>Configuración de Subtemas</h4>
              <SubtopicConfigPanel 
                config={headerConfig}
                onChange={onHeaderConfigChange}
              />
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button 
            type="button"
            className="btn btn-secondary" 
            onClick={onClose}
          >
            Cancelar
          </button>
          <button 
            type="button"
            className="btn btn-primary" 
            onClick={onClose}
          >
            Seleccionar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Main Header Template Selector Component with subtopic support
 */
function HeaderTemplateSelector({ 
  value, 
  onChange,
  templates,
  headerConfig,
  onHeaderConfigChange
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const currentTemplate = templates.find(t => t.id === value) || templates[0];
  const hasSubtopicFeatures = !!(currentTemplate?.trackSubheaders ||
    (currentTemplate?.subtopicBehavior && currentTemplate.subtopicBehavior !== 'none'));

  const handleOpenModal = () => setIsModalOpen(true);
  const handleCloseModal = () => setIsModalOpen(false);
  
  const handleSelect = (templateId) => {
    onChange(templateId);
    // Apply template defaults to header config
    const template = templates.find(t => t.id === templateId);
    if (template && typeof onHeaderConfigChange === 'function') {
      onHeaderConfigChange({
        ...headerConfig,
        subtopicBehavior: template.subtopicBehavior || 'none',
        subtopicSeparator: template.subtopicSeparator || ' | ',
        subtopicMaxLength: template.subtopicMaxLength || 60
      });
    }
  };

  return (
    <div className="header-template-selector">
      <HeaderTemplateButton 
        currentTemplate={currentTemplate}
        onClick={handleOpenModal}
      />
      
      {hasSubtopicFeatures && (
        <div className="subtopic-indicator">
          <span className="subtopic-badge">🏷️ Subtemas</span>
        </div>
      )}
      
      <HeaderTemplateModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        templates={templates}
        selectedId={value}
        onSelect={handleSelect}
        headerConfig={headerConfig}
        onHeaderConfigChange={onHeaderConfigChange}
      />
    </div>
  );
}

export default memo(HeaderTemplateSelector);