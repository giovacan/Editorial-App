import { memo, useState } from 'react';
import useEditorStore from '../../../store/useEditorStore';

const TOCBuildLogSection = memo(function TOCBuildLogSection() {
  const tocBuildLog = useEditorStore(s => s.tocBuildLog);
  const [copied, setCopied] = useState(false);

  if (!tocBuildLog || tocBuildLog.length === 0) {
    return (
      <div className="debug-section">
        <div className="debug-section-title">TOC Build Log</div>
        <div style={{ fontSize: '11px', color: '#888', padding: '4px 0' }}>
          Sin datos. Recarga el libro para generar el log de TOC.
        </div>
      </div>
    );
  }

  const pages = [...new Set(tocBuildLog.map(e => e.page))];
  const summaries = pages.map(pg => {
    const rows = tocBuildLog.filter(e => e.page === pg);
    const usable = rows[0]?.pageUsable ?? 0;
    const used = rows[rows.length - 1]?.usedAfter ?? 0;
    const fillPct = usable > 0 ? Math.round(used / usable * 100) : 0;
    const overflow = used > usable;
    const risky = rows.filter(r => !r.pageBreak && usable - r.usedAfter < (rows[0]?.entryPx ?? 20) * 0.5).length;
    return { pg, usable, used, fillPct, overflow, risky, count: rows.length };
  });

  const handleCopy = () => {
    const lines = ['TOC BUILD LOG'];
    for (const s of summaries) {
      lines.push(`\nPAGE ${s.pg}  usable=${s.usable.toFixed(1)}px  used=${s.used.toFixed(1)}px  fill=${s.fillPct}%${s.overflow ? ' OVERFLOW' : ''}`);
      lines.push('  # | Lv | Lines | Px    | UsedBefore | UsedAfter  | Remain   | Break | Title');
      const rows = tocBuildLog.filter(e => e.page === s.pg);
      for (const r of rows) {
        const remain = (r.pageUsable - r.usedAfter).toFixed(1);
        lines.push(
          `${String(r.idx).padStart(3)} | H${r.level} | ${String(r.rawLines).padStart(5)} | ${String(r.entryPx).padStart(5)} | ` +
          `${r.usedBefore.toFixed(1).padStart(10)} | ${r.usedAfter.toFixed(1).padStart(10)} | ${remain.padStart(8)} | ` +
          `${r.pageBreak ? 'YES' : '   '} | "${r.title}"`
        );
      }
    }
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const getColor = (pct) => pct > 100 ? '#f44336' : pct > 90 ? '#ff9800' : '#4caf50';

  return (
    <div className="debug-section">
      <div className="debug-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>TOC Build Log — {pages.length} pág(s), {tocBuildLog.length} entries</span>
        <button className="debug-copy-btn" onClick={handleCopy} style={{ marginLeft: '8px' }}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      <div style={{ fontSize: '11px', fontFamily: 'monospace', marginBottom: '6px' }}>
        {summaries.map(s => (
          <div key={s.pg} style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '2px 0', borderBottom: '1px solid #2a2a2a' }}>
            <span style={{ color: '#888', minWidth: '30px' }}>p{s.pg}</span>
            <span style={{ color: getColor(s.fillPct), minWidth: '36px' }}>{s.fillPct}%</span>
            <span style={{ color: '#aaa' }}>{s.used.toFixed(0)}/{s.usable.toFixed(0)}px</span>
            {s.overflow && <span style={{ color: '#f44336', fontWeight: 'bold' }}>OVERFLOW</span>}
            {s.risky > 0 && <span style={{ color: '#ff9800' }}>⚠{s.risky}</span>}
          </div>
        ))}
      </div>

      <div style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '10px', fontFamily: 'monospace' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #555', color: '#aaa' }}>
              <th style={{ textAlign: 'left', padding: '1px 3px' }}>#</th>
              <th style={{ textAlign: 'left', padding: '1px 3px' }}>Lv</th>
              <th style={{ textAlign: 'right', padding: '1px 3px' }}>Ln</th>
              <th style={{ textAlign: 'right', padding: '1px 3px' }}>Px</th>
              <th style={{ textAlign: 'right', padding: '1px 3px' }}>Rem</th>
              <th style={{ textAlign: 'left', padding: '1px 3px' }}>Title</th>
            </tr>
          </thead>
          <tbody>
            {tocBuildLog.map((r, i) => {
              const remain = r.pageUsable - r.usedAfter;
              const isBreak = r.pageBreak;
              const isOverflow = !isBreak && remain < 0;
              return (
                <tr key={i} style={{ borderBottom: '1px solid #222', backgroundColor: isBreak ? '#1a2a1a' : isOverflow ? '#2a1a1a' : undefined }}>
                  <td style={{ padding: '1px 3px', color: '#666' }}>{r.idx}</td>
                  <td style={{ padding: '1px 3px' }}>
                    <span style={{ color: r.level === 1 ? '#e74c3c' : r.level === 2 ? '#e67e22' : '#27ae60' }}>H{r.level}</span>
                  </td>
                  <td style={{ padding: '1px 3px', textAlign: 'right', color: '#aaa' }}>{r.rawLines}</td>
                  <td style={{ padding: '1px 3px', textAlign: 'right', color: '#aaa' }}>{r.entryPx}</td>
                  <td style={{ padding: '1px 3px', textAlign: 'right', color: remain < 0 ? '#f44336' : remain < r.entryPx ? '#ff9800' : '#4caf50' }}>
                    {remain.toFixed(0)}
                  </td>
                  <td style={{ padding: '1px 3px', color: isBreak ? '#3498db' : '#ccc' }}>
                    {isBreak ? '↵ ' : ''}{r.title}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default TOCBuildLogSection;
