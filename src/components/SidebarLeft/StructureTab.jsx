import ChapterItem from './ChapterItem';

function StructureTab({
  bookData,
  activeChapterId,
  stats,
  onTitleChange,
  onAuthorChange,
  onAddChapter,
  onAddSection,
  onSelectChapter,
  onDeleteChapter,
  onMoveChapter,
  onChapterTitleChange,
}) {
  return (
    <section className="sidebar-section">
      <h2 className="sidebar-title">Estructura del Libro</h2>

      <div className="document-metadata">
        <label className="metadata-label">
          <span>Título del libro</span>
          <input
            type="text"
            value={bookData?.title || ''}
            onChange={onTitleChange}
            placeholder="Título de tu libro"
            className="metadata-input"
          />
        </label>
        <label className="metadata-label">
          <span>Autor</span>
          <input
            type="text"
            value={bookData?.author || ''}
            onChange={onAuthorChange}
            placeholder="Nombre del autor"
            className="metadata-input"
          />
        </label>
      </div>

      <div className="structure-controls">
        <button className="btn btn-small" onClick={onAddChapter}>
          + Capítulo
        </button>
        <button className="btn btn-small btn-secondary" onClick={onAddSection}>
          + Sección
        </button>
      </div>

      <nav className="structure-panel" aria-label="Estructura de capítulos">
        <div className="chapters-list">
          {bookData?.chapters?.length === 0 ? (
            <p className="empty-state">Sin capítulos cargados</p>
          ) : (
            bookData?.chapters?.map((chapter, index) => (
              <ChapterItem
                key={chapter.id}
                chapter={chapter}
                index={index}
                isActive={activeChapterId === chapter.id}
                onSelect={onSelectChapter}
                onDelete={onDeleteChapter}
                onMove={onMoveChapter}
                onTitleChange={onChapterTitleChange}
                totalChapters={bookData.chapters.length}
              />
            ))
          )}
        </div>
      </nav>

      <div className="document-stats">
        <h3 className="stats-title">Estadísticas</h3>
        <dl className="stats-list">
          <dt>Capítulos:</dt>
          <dd>{stats.chapters}</dd>
          <dt>Palabras:</dt>
          <dd>{stats.words}</dd>
          <dt>Caracteres:</dt>
          <dd>{stats.characters}</dd>
          <dt>Páginas estimadas:</dt>
          <dd>{stats.pages}</dd>
          <dt>Tiempo de lectura:</dt>
          <dd>{stats.readingTime} min</dd>
        </dl>
      </div>
    </section>
  );
}

export default StructureTab;
