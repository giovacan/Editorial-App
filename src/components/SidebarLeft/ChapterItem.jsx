import { useState, useCallback, memo } from 'react';

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

export default ChapterItem;
