import { memo, useState } from 'react';

const PHASE_COLORS = {
  greedy: '#3498db',
  fill: '#e67e22',
  'heading-fix': '#e74c3c',
  smooth: '#27ae60',
  merge: '#9b59b6',
  'short-line-fix': '#f1c40f'
};

const PageTimelineSection = memo(function PageTimelineSection({ paginationLog, selectedPage }) {
  const [openTraceId, setOpenTraceId] = useState(null);
  const [phaseFilter, setPhaseFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showRepro, setShowRepro] = useState(false);

  if (!paginationLog || !selectedPage) return null;

  const allPageEntries = (paginationLog.entries || []).filter(e => e.page === selectedPage);
  const pageEntries = allPageEntries.filter(e => {
    if (phaseFilter !== 'all' && e.phase !== phaseFilter) return false;
    if (typeFilter !== 'all' && e.type !== typeFilter) return false;
    return true;
  });
  const pageSummary = (paginationLog.summary || []).find(s => s.page === selectedPage);
  const lineAnalysis = pageSummary?.lineAnalysis || [];
  const reproBundle = paginationLog.reproBundle;

  const phases = ['all', ...new Set(allPageEntries.map(e => e.phase))];
  const types  = ['all', ...new Set(allPageEntries.map(e => e.type))];

  const selectStyle = {
    background: '#1a1a2e', color: '#aaa', border: '1px solid #555',
    borderRadius: '3px', fontSize: '9px', padding: '1px 3px', marginLeft: '4px'
  };

  return (
    <div style={{ marginTop: '6px', fontFamily: 'monospace', fontSize: '10px' }}>
      {lineAnalysis.length > 0 && (
        <div style={{ marginBottom: '6px', borderTop: '1px solid #444', paddingTop: '4px' }}>
          <div style={{ color: '#888', marginBottom: '3px' }}>
            Párrafos p{selectedPage} ({lineAnalysis.length})
            {lineAnalysis.some(l => l.isRunt || l.isWidow || l.isOrphan) &&
              <span style={{ color: '#f44336', marginLeft: '6px' }}>⚠ violations</span>}
          </div>
          {lineAnalysis.map(la => (
            <div key={la.index} style={{
              padding: '2px 4px', marginBottom: '2px',
              borderLeft: `2px solid ${(la.isWidow || la.isOrphan) ? '#f44336' : la.isRunt ? '#ff9800' : '#444'}`,
              color: (la.isWidow || la.isOrphan) ? '#f44336' : la.isRunt ? '#ff9800' : '#aaa'
            }}>
              <span style={{ color: '#666', marginRight: '4px' }}>#{la.index}</span>
              <span style={{ color: '#777' }}>{la.lineCount}L</span>
              <span style={{ marginLeft: '4px', color: la.lastLineWidthRatio < 0.35 ? '#ff9800' : '#666' }}>
                last={Math.round(la.lastLineWidthRatio * 100)}%
              </span>
              {la.isRunt   && <span style={{ color: '#ff9800', marginLeft: '4px' }}>[RUNT]</span>}
              {la.isWidow  && <span style={{ color: '#f44336', marginLeft: '4px' }}>[WIDOW]</span>}
              {la.isOrphan && <span style={{ color: '#f44336', marginLeft: '4px' }}>[ORPHAN]</span>}
              <span style={{ color: '#555', marginLeft: '6px' }}>"{la.text}"</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ borderTop: '1px solid #444', paddingTop: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap', gap: '2px' }}>
          <span style={{ color: '#888' }}>
            Eventos ({pageEntries.length}/{allPageEntries.length}):
          </span>
          <select value={phaseFilter} onChange={e => setPhaseFilter(e.target.value)} style={selectStyle}>
            {phases.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selectStyle}>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {reproBundle && (
            <button
              onClick={() => setShowRepro(v => !v)}
              style={{ ...selectStyle, marginLeft: '8px', cursor: 'pointer', color: showRepro ? '#3498db' : '#aaa' }}
            >
              {showRepro ? '▼ repro' : '▶ repro'}
            </button>
          )}
        </div>

        {showRepro && reproBundle && (
          <div style={{ background: '#0d1117', border: '1px solid #444', borderRadius: '3px', padding: '6px', marginBottom: '6px', fontSize: '9px' }}>
            <div style={{ color: '#3498db', marginBottom: '4px', fontSize: '10px' }}>Reproduction Bundle</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
              <div>
                <div style={{ color: '#666' }}>engine</div>
                <div style={{ color: '#ccc' }}>{reproBundle.engineVersion}</div>
              </div>
              <div>
                <div style={{ color: '#666' }}>thread</div>
                <div style={{ color: '#ccc' }}>{reproBundle.flags?.workerPath}</div>
              </div>
              <div>
                <div style={{ color: '#666' }}>ms hash</div>
                <div style={{ color: '#ccc' }}>{reproBundle.manuscriptHash}</div>
              </div>
              <div>
                <div style={{ color: '#666' }}>cfg hash</div>
                <div style={{ color: '#ccc' }}>{reproBundle.configHash}</div>
              </div>
              <div>
                <div style={{ color: '#666' }}>font</div>
                <div style={{ color: '#ccc' }}>{reproBundle.layoutCtx?.fontFamily}</div>
              </div>
              <div>
                <div style={{ color: '#666' }}>fontSize</div>
                <div style={{ color: '#ccc' }}>{reproBundle.layoutCtx?.baseFontSizePx?.toFixed(2)}px / {reproBundle.layoutCtx?.baseLineHeight}lh</div>
              </div>
              <div>
                <div style={{ color: '#666' }}>content</div>
                <div style={{ color: '#ccc' }}>{reproBundle.layoutCtx?.contentWidth?.toFixed(0)}×{reproBundle.layoutCtx?.contentHeight?.toFixed(0)}px</div>
              </div>
              <div>
                <div style={{ color: '#666' }}>fill target</div>
                <div style={{ color: '#ccc' }}>{((reproBundle.flags?.targetFillPct || 0) * 100).toFixed(0)}%</div>
              </div>
              <div>
                <div style={{ color: '#666' }}>indent</div>
                <div style={{ color: '#ccc' }}>{reproBundle.flags?.firstLineIndent}em</div>
              </div>
              <div>
                <div style={{ color: '#666' }}>chapters</div>
                <div style={{ color: '#ccc' }}>{reproBundle.chapterCount}</div>
              </div>
            </div>
          </div>
        )}

        <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
          {pageEntries.length === 0 && (
            <div style={{ color: '#666' }}>Sin eventos{phaseFilter !== 'all' || typeFilter !== 'all' ? ' (prueba quitar filtros)' : ' para esta página.'}</div>
          )}
          {pageEntries.map(entry => {
            const hasSnapshot = entry.beforeSnapshot || entry.afterSnapshot;
            const hasFeatures = entry.data?.features;
            const isExpandable = hasSnapshot || hasFeatures;
            const isOpen = openTraceId === entry.traceId;
            const d = entry.data || {};
            const isReject = entry.type === 'reject';
            return (
              <div
                key={entry.traceId}
                onClick={() => isExpandable && setOpenTraceId(isOpen ? null : entry.traceId)}
                style={{
                  borderLeft: `3px solid ${isReject ? '#c0392b' : PHASE_COLORS[entry.phase] || '#555'}`,
                  padding: '2px 4px', marginBottom: '2px',
                  cursor: isExpandable ? 'pointer' : 'default',
                  background: isOpen ? '#1a2030' : undefined,
                  opacity: entry.type === 'diag' || entry.type === 'cont-check' || entry.type === 'rest-cont-check' ? 0.5 : 1
                }}
              >
                <span style={{ color: isReject ? '#e74c3c' : PHASE_COLORS[entry.phase] || '#aaa' }}>
                  [{entry.phase}/{entry.type}]
                </span>
                {d.tag && <span style={{ color: '#888' }}> {d.tag}</span>}
                {d.reason && <span style={{ color: '#ff9800' }}> {d.reason}</span>}
                {d.before?.score != null && (
                  <span style={{ color: '#666' }}>
                    {' '}Δ{d.delta != null ? (d.delta > 0 ? '+' : '') + d.delta : '?'}
                    {' '}({d.before.score}→{d.after?.score})
                  </span>
                )}
                {d.text && <span style={{ color: '#666' }}> "{d.text}"</span>}
                {isExpandable && <span style={{ color: '#3498db' }}> ▶</span>}

                {isOpen && (
                  <div style={{ marginTop: '4px' }}>
                    {hasFeatures && (
                      <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '3px', padding: '4px', marginBottom: '4px' }}>
                        <div style={{ color: '#6366f1', marginBottom: '3px', fontSize: '9px' }}>Decision features</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px', fontSize: '9px' }}>
                          {Object.entries(d.features).map(([k, v]) => (
                            Array.isArray(v) ? (
                              <div key={k} style={{ gridColumn: '1/-1' }}>
                                <span style={{ color: '#6b7280' }}>{k}: </span>
                                <span style={{ color: v.length ? '#f59e0b' : '#666' }}>
                                  {v.length ? v.join(', ') : '—'}
                                </span>
                              </div>
                            ) : (
                              <div key={k}>
                                <span style={{ color: '#6b7280' }}>{k}: </span>
                                <span style={{ color: '#d1d5db' }}>{String(v)}</span>
                              </div>
                            )
                          ))}
                        </div>
                      </div>
                    )}
                    {hasSnapshot && (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: entry.beforeSnapshot && entry.afterSnapshot ? '1fr 1fr' : '1fr',
                        gap: '4px'
                      }}>
                        {entry.beforeSnapshot && (
                          <div>
                            <div style={{ color: '#888', marginBottom: '2px', fontSize: '9px' }}>
                              Before ({entry.beforeSnapshot.structure?.elementCount} el, {entry.beforeSnapshot.structure?.paragraphs}p)
                            </div>
                            <pre style={{
                              background: '#0d1117', padding: '4px', maxHeight: '100px',
                              overflow: 'auto', fontSize: '9px', margin: 0, color: '#ccc',
                              whiteSpace: 'pre-wrap', wordBreak: 'break-all'
                            }}>{entry.beforeSnapshot.html}</pre>
                          </div>
                        )}
                        {entry.afterSnapshot && (
                          <div>
                            <div style={{ color: '#888', marginBottom: '2px', fontSize: '9px' }}>
                              After ({entry.afterSnapshot.structure?.elementCount} el, {entry.afterSnapshot.structure?.paragraphs}p)
                            </div>
                            <pre style={{
                              background: '#0d1117', padding: '4px', maxHeight: '100px',
                              overflow: 'auto', fontSize: '9px', margin: 0, color: '#ccc',
                              whiteSpace: 'pre-wrap', wordBreak: 'break-all'
                            }}>{entry.afterSnapshot.html}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default PageTimelineSection;
