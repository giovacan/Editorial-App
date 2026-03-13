import HeaderTemplateSelector from '../../HeaderTemplateSelector/HeaderTemplateSelector';
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
} from '../../../data/headerTemplates';

function HeaderPanel({ safeConfig, setConfig }) {
  return (
    <>
      <fieldset className="config-group">
        <legend>Mostrar</legend>
        <label className="checkbox-label">
          <input type="checkbox" checked={safeConfig.showHeaders} onChange={(e) => setConfig({
            showHeaders: e.target.checked,
            header: { ...safeConfig.header, enabled: e.target.checked }
          })} />
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
                setConfig({
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
                      onChange={(e) => setConfig({
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
                      onChange={(e) => setConfig({
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
                      onChange={(e) => setConfig({
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
                      onChange={(e) => setConfig({
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
                      onChange={(e) => setConfig({
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
                      onChange={(e) => setConfig({
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
                onChange={(e) => setConfig({
                  header: { ...safeConfig.header, trackSubheaders: e.target.checked }
                })}
              />
              Mostrar subtema actual (H1-H6) en encabezado
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={safeConfig.header?.trackPseudoHeaders || false}
                onChange={(e) => setConfig({
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
                    onChange={(e) => setConfig({
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
                          setConfig({
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
                        onChange={(e) => setConfig({
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
                      onChange={(e) => setConfig({
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
              onChange={(e) => setConfig({
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
                        setConfig({
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
                  onChange={(e) => setConfig({
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
                  onChange={(e) => setConfig({
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
                  onChange={(e) => setConfig({
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
                onChange={(e) => setConfig({
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
                    onChange={(e) => setConfig({
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
                    onChange={(e) => setConfig({
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
                onChange={(e) => setConfig({
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
                onChange={(e) => setConfig({
                  header: { ...safeConfig.header, skipFirstChapterPage: e.target.checked }
                })}
              />
              Omitir en primera página de capítulo
            </label>
          </fieldset>
        </>
      )}
    </>
  );
}

export default HeaderPanel;
