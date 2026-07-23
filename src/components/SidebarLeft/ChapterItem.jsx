import { useState, useCallback, memo } from 'react';
import { composeTitle, parseLabelAndName } from '../../utils/chapterTitle';

const ChapterItem = memo(function ChapterItem({
  chapter,
  index,
  isActive,
  onSelect,
  onDelete,
  onMove,
  onMerge,
  onTitleChange,
  onUpdateChapter,
  totalChapters
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);

  // Prefer the parser's structured fields; fall back to splitting the title.
  const split = parseLabelAndName(chapter.title);
  const label = chapter.chapterLabel ?? split.label;
  const name = chapter.chapterName ?? split.name;

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

  // Update label or name → recompose title and persist all three fields.
  const applyFields = useCallback((nextLabel, nextName) => {
    const cleanLabel = (nextLabel || '').trim();
    const cleanName = (nextName || '').trim();
    const title = composeTitle(cleanLabel, cleanName) || 'Sin título';
    if (onUpdateChapter) {
      onUpdateChapter(chapter.id, { chapterLabel: cleanLabel, chapterName: cleanName, title });
    } else {
      onTitleChange(chapter.id, title); // fallback: only title
    }
  }, [chapter.id, onUpdateChapter, onTitleChange]);

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
          value={name}
          onChange={(e) => applyFields(label, e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onFocus={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.target.blur();
            }
          }}
          onBlur={(e) => {
            if (!e.target.value.trim() && !label.trim()) {
              applyFields('', 'Sin título');
            }
          }}
        />
        <div className="reorder-buttons">
          <button
            className="btn-reorder"
            onClick={(e) => { e.stopPropagation(); setEditingLabel(v => !v); }}
            title="Editar número/etiqueta"
          >
            #
          </button>
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
          className="btn-merge-item"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`¿Fusionar "${name || chapter.title}" con el capítulo anterior?`)) {
              onMerge(chapter.id);
            }
          }}
          disabled={index === 0}
          title="Fusionar con el capítulo anterior"
          aria-label="Fusionar con anterior"
        >
          ⭱
        </button>
        <button
          className="btn-delete-item"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`¿Eliminar "${name || chapter.title}"?`)) {
              onDelete(chapter.id);
            }
          }}
          aria-label="Eliminar"
        >
          ✕
        </button>
      </div>

      {editingLabel && (
        <div className="chapter-item-label-edit" onClick={(e) => e.stopPropagation()}>
          <label className="chapter-label-field">
            <span>Número / etiqueta</span>
            <input
              className="chapter-item-label-input"
              value={label}
              placeholder="Ej. CAPÍTULO 2"
              onChange={(e) => applyFields(e.target.value, name)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }}
            />
          </label>
        </div>
      )}

      <span className="chapter-item-meta">{chapter.wordCount} palabras</span>
    </div>
  );
});

export default ChapterItem;
