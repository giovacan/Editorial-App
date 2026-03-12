import { memo, useState } from 'react';
import './ChapterDetectionDialog.css';

const ChapterDetectionDialog = memo(function ChapterDetectionDialog({
  chapters,
  onConfirm,
  onCancel
}) {
  const [chapterList, setChapterList] = useState(chapters);

  const handleToggleChapter = (index) => {
    setChapterList(prev =>
      prev.map((ch, i) =>
        i === index ? { ...ch, confirmed: !ch.confirmed } : ch
      )
    );
  };

  const handleToggleAll = (checked) => {
    setChapterList(prev =>
      prev.map(ch => ({ ...ch, confirmed: checked }))
    );
  };

  const handleConfirm = () => {
    onConfirm(chapterList);
  };

  const confirmedCount = chapterList.filter(ch => ch.confirmed).length;
  const allChecked = confirmedCount === chapterList.length;

  return (
    <div className="chapter-detection-overlay">
      <div className="chapter-detection-dialog">
        <div className="chapter-detection-header">
          <h2 className="chapter-detection-title">
            📖 Capítulos detectados
          </h2>
          <button
            className="chapter-detection-close"
            onClick={onCancel}
            title="Cancelar"
          >
            ✕
          </button>
        </div>

        <div className="chapter-detection-content">
          <div className="chapter-detection-info">
            <p>
              Se encontraron <strong>{chapterList.length} capítulos</strong> en tu documento:
            </p>
          </div>

          <div className="chapter-detection-list">
            <div className="chapter-detection-select-all">
              <label>
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => handleToggleAll(e.target.checked)}
                />
                <span className="chapter-detection-select-all-text">
                  {allChecked ? 'Deseleccionar todos' : 'Seleccionar todos'}
                </span>
              </label>
            </div>

            <div className="chapter-detection-items">
              {chapterList.map((chapter, index) => (
                <div key={index} className="chapter-detection-item">
                  <label className="chapter-detection-item-label">
                    <input
                      type="checkbox"
                      checked={chapter.confirmed}
                      onChange={() => handleToggleChapter(index)}
                    />
                    <span className="chapter-detection-item-number">
                      {index + 1}.
                    </span>
                    <span className="chapter-detection-item-text">
                      {chapter.detectedTitle || chapter.chapterTitle}
                    </span>
                    {chapter.chapterIndex !== undefined && (
                      <span className="chapter-detection-item-index">
                        (Cap. {chapter.chapterIndex + 1})
                      </span>
                    )}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="chapter-detection-summary">
            <p>
              Confirmando <strong>{confirmedCount}</strong> de <strong>{chapterList.length}</strong> capítulos
            </p>
          </div>
        </div>

        <div className="chapter-detection-actions">
          <button
            className="chapter-detection-btn chapter-detection-btn-secondary"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            className="chapter-detection-btn chapter-detection-btn-primary"
            onClick={handleConfirm}
            disabled={confirmedCount === 0}
          >
            Continuar con {confirmedCount} capítulos
          </button>
        </div>
      </div>
    </div>
  );
});

export default ChapterDetectionDialog;
