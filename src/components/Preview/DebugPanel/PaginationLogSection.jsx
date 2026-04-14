import { memo, useState, useCallback } from 'react';
import useEditorStore from '../../../store/useEditorStore';
import PageTimelineSection from './PageTimelineSection';

const PaginationLogSection = memo(function PaginationLogSection() {
  const paginationLog = useEditorStore(s => s.paginationLog);
  const [pageFilter, setPageFilter] = useState('');
  const [copied, setCopied] = useState('');

  const summary = paginationLog?.summary || [];
  const config = paginationLog?.config || {};

  const copyToClipboard = useCallback((text, label) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(''), 2000);
    });
  }, []);

  const handleCopySummary = useCallback(() => {
    if (!paginationLog) return;
    const lines = [];
    lines.push(`PAGINATION SUMMARY (${(paginationLog.timestamp || '').slice(0, 10)})`);
    lines.push(`Config: ${config.pageFormat || '?'}, ${config.fontSize || '?'}pt, ${config.lineHeight || '?'}lh, contentH=${config.contentHeight || '?'}px`);
    lines.push(`${paginationLog.totalPages} pages, ${paginationLog.totalEvents} events`);
    lines.push('');
    lines.push('Page | Fill% | Score | Splits | Moves | Violations');
    lines.push('-----+-------+-------+--------+-------+-----------');
    for (const s of summary) {
      if (s.blank) continue;
      if (s.score <= 50 && s.events === 0 && s.splits === 0 && s.moves === 0) continue;
      const viol = (s.violations || []).join(', ');
      lines.push(
        `${String(s.page).padStart(4)} | ${String(s.fillPct + '%').padStart(5)} | ${String(s.score).padStart(5)} | ${String(s.splits).padStart(6)} | ${String(s.moves).padStart(5)} | ${viol}`
      );
    }
    copyToClipboard(lines.join('\n'), 'summary');
  }, [paginationLog, summary, config, copyToClipboard]);

  const handleCopyFull = useCallback(() => {
    if (!paginationLog) return;
    copyToClipboard(JSON.stringify(paginationLog, null, 2), 'full');
  }, [paginationLog, copyToClipboard]);

  const handleCopyPage = useCallback(() => {
    if (!paginationLog || !pageFilter) return;
    const pageNum = parseInt(pageFilter);
    if (isNaN(pageNum)) return;
    const pageEntries = (paginationLog.entries || []).filter(e => e.page === pageNum);
    const pageSummary = summary.find(s => s.page === pageNum);
    const output = {
      page: pageNum,
      summary: pageSummary || null,
      events: pageEntries
    };
    copyToClipboard(JSON.stringify(output, null, 2), 'page');
  }, [paginationLog, pageFilter, summary, copyToClipboard]);

  if (!paginationLog) {
    return (
      <div className="debug-section">
        <div className="debug-section-title">Pagination Log</div>
        <div style={{ fontSize: '11px', color: '#888', padding: '4px 0' }}>
          No hay log disponible. Carga un libro para generar.
        </div>
      </div>
    );
  }

  const filteredSummary = pageFilter
    ? summary.filter(s => s.page === parseInt(pageFilter))
    : summary.filter(s => !s.blank && (s.score > 50 || s.events > 0 || s.splits > 0 || s.moves > 0));

  const getScoreColor = (score) => {
    if (score <= 50) return '#4caf50';
    if (score <= 300) return '#ff9800';
    return '#f44336';
  };

  return (
    <div className="debug-section">
      <div className="debug-section-title">
        Pagination Log ({paginationLog.totalPages} pages, {paginationLog.totalEvents} events)
      </div>

      {config.fmOffset > 0 && (
        <div style={{ fontSize: '10px', color: '#f0a500', padding: '3px 0 4px', fontFamily: 'monospace' }}>
          ⚠ FM: {config.fmOffset} págs. Contenido empieza en pág {config.fmOffset + 1}
        </div>
      )}

      <div style={{ display: 'flex', gap: '4px', marginBottom: '6px', flexWrap: 'wrap' }}>
        <button className="debug-copy-btn" onClick={handleCopySummary}>
          {copied === 'summary' ? 'Copied!' : 'Copy Summary'}
        </button>
        <button className="debug-copy-btn" onClick={handleCopyFull}>
          {copied === 'full' ? 'Copied!' : 'Copy Full Log'}
        </button>
        <input
          type="number"
          placeholder="Page #"
          value={pageFilter}
          onChange={e => setPageFilter(e.target.value)}
          style={{ width: '55px', fontSize: '11px', padding: '2px 4px', border: '1px solid #555', borderRadius: '3px', background: '#2a2a2a', color: '#eee' }}
        />
        {pageFilter && (
          <button className="debug-copy-btn" onClick={handleCopyPage}>
            {copied === 'page' ? 'Copied!' : `Copy p${pageFilter}`}
          </button>
        )}
      </div>

      <div style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '11px', fontFamily: 'monospace' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #555', color: '#aaa' }}>
              <th style={{ textAlign: 'left', padding: '2px 4px' }}>Pg</th>
              <th style={{ textAlign: 'right', padding: '2px 4px' }}>Fill%</th>
              <th style={{ textAlign: 'right', padding: '2px 4px' }}>Score</th>
              <th style={{ textAlign: 'center', padding: '2px 4px' }}>S</th>
              <th style={{ textAlign: 'center', padding: '2px 4px' }}>M</th>
              <th style={{ textAlign: 'left', padding: '2px 4px' }}>Violations</th>
            </tr>
          </thead>
          <tbody>
            {filteredSummary.map(s => (
              <tr key={s.page} style={{ borderBottom: '1px solid #333' }}>
                <td style={{ padding: '1px 4px' }}>{s.page}</td>
                <td style={{ padding: '1px 4px', textAlign: 'right' }}>{s.fillPct}%</td>
                <td style={{ padding: '1px 4px', textAlign: 'right', color: getScoreColor(s.score) }}>{s.score}</td>
                <td style={{ padding: '1px 4px', textAlign: 'center' }}>{s.splits || ''}</td>
                <td style={{ padding: '1px 4px', textAlign: 'center' }}>{s.moves || ''}</td>
                <td style={{ padding: '1px 4px', color: '#ff9800', fontSize: '10px' }}>
                  {(s.violations || []).join(', ')}
                </td>
              </tr>
            ))}
            {filteredSummary.length === 0 && (
              <tr><td colSpan="6" style={{ padding: '4px', color: '#888', textAlign: 'center' }}>
                {pageFilter ? 'Página no encontrada' : 'Todas las páginas OK (score ≤ 50)'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pageFilter && <PageTimelineSection paginationLog={paginationLog} selectedPage={parseInt(pageFilter)} />}
    </div>
  );
});

export default PaginationLogSection;
