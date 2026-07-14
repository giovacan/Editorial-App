import { useState } from 'react';
import useEditorStore from '../../store/useEditorStore';

const LABELS = {
  overflow: 'Texto desbordado',
  crater: 'Página con hueco grande',
  stretched_cut: 'Línea de corte corta estirada',
  heading_bottom: 'Subtítulo huérfano al pie',
  underfill: 'Página poco llena',
  cut_left: 'Corte sin justificar',
  runt: 'Última línea de 1 palabra',
};

const SEVERITY_ORDER = ['overflow', 'stretched_cut', 'crater', 'heading_bottom', 'underfill', 'cut_left', 'runt'];

/**
 * Badge de calidad editorial — muestra el puntaje 0-10 calculado por el motor
 * tras cada paginación y, al hacer click, la lista de defectos con su página.
 */
function QualityBadge() {
  const report = useEditorStore((s) => s.qualityReport);
  const [open, setOpen] = useState(false);

  if (!report) return null;

  const color = report.score >= 9 ? '#059669' : report.score >= 7 ? '#d97706' : '#dc2626';
  const bg = report.score >= 9 ? '#ecfdf5' : report.score >= 7 ? '#fffbeb' : '#fef2f2';
  const totalDefects = report.defects.length;

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        title={`Calidad editorial: ${report.score}/10 — ${totalDefects} aviso${totalDefects === 1 ? '' : 's'} en ${report.pages} páginas`}
        aria-label="Calidad editorial"
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '4px 10px', borderRadius: '9999px',
          border: `1px solid ${color}33`, background: bg, color,
          fontSize: '13px', fontWeight: 600, cursor: 'pointer',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17l-6.1 3.6 1.4-6.8L2.2 9.1l6.9-.8z" />
        </svg>
        {report.score.toFixed(1)}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 60,
            width: '320px', maxHeight: '380px', overflowY: 'auto',
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '12px',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#1f2937', marginBottom: '8px' }}>
            Calidad editorial: {report.score.toFixed(1)}/10
            <span style={{ fontWeight: 400, color: '#6b7280' }}> · {report.pages} páginas</span>
          </div>
          {totalDefects === 0 ? (
            <div style={{ fontSize: '12px', color: '#059669' }}>Sin defectos detectados ✓</div>
          ) : (
            SEVERITY_ORDER.filter((t) => report.counts[t]).map((t) => {
              const items = report.defects.filter((d) => d.type === t);
              return (
                <div key={t} style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>
                    {LABELS[t] || t} · {items.length}
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px', lineHeight: 1.6 }}>
                    {items.slice(0, 8).map((d, i) => (
                      <div key={i}>pág. {d.page}{d.detail ? ` — ${d.detail}` : ''}</div>
                    ))}
                    {items.length > 8 && <div>… y {items.length - 8} más</div>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default QualityBadge;
