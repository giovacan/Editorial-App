import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { searchChapters } from '../../utils/bookSearch';
import './CentralSearchBar.css';

/**
 * CentralSearchBar — persistent search bar at the TOP of the central column.
 * Always visible; searches the plain text of every chapter. Selecting a result
 * opens that chapter's editor and selects the term (via onGoToMatch).
 *
 * @param {Array}    chapters    - bookData.chapters
 * @param {Function} onGoToMatch - (match, query) => void: open editor + select
 */
export default function CentralSearchBar({ chapters, onGoToMatch }) {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [open, setOpen] = useState(false); // results dropdown
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const barRef = useRef(null);

  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 180);
    return () => clearTimeout(t);
  }, [query]);

  const { matches, capped } = useMemo(
    () => searchChapters(chapters, debounced),
    [chapters, debounced]
  );

  // Open the list automatically on a NEW query; typing more keeps it as-is.
  const lastQueryRef = useRef('');
  useEffect(() => {
    setActiveIdx(0);
    if (debounced.trim() && debounced !== lastQueryRef.current) setOpen(true);
    if (!debounced.trim()) setOpen(false);
    lastQueryRef.current = debounced;
  }, [debounced]);

  const goToIdx = useCallback((i) => {
    const m = matches[i];
    if (m) onGoToMatch?.(m, debounced);
  }, [matches, onGoToMatch, debounced]);

  // Pick a result by clicking it → jump AND close the list (but keep the query
  // and the active index so it can be reopened right where we left off).
  const pickResult = useCallback((i) => {
    setActiveIdx(i);
    goToIdx(i);
    setOpen(false);
  }, [goToIdx]);

  // Navigating with ↑/↓/Enter jumps to the result AND reopens the list so you
  // see where you are (unlike picking a result by click, which closes it).
  const goNext = useCallback(() => {
    if (!matches.length) return;
    const n = (activeIdx + 1) % matches.length;
    setActiveIdx(n); goToIdx(n); setOpen(true);
  }, [matches.length, activeIdx, goToIdx]);
  const goPrev = useCallback(() => {
    if (!matches.length) return;
    const n = (activeIdx - 1 + matches.length) % matches.length;
    setActiveIdx(n); goToIdx(n); setOpen(true);
  }, [matches.length, activeIdx, goToIdx]);

  useEffect(() => {
    listRef.current?.querySelector('.cs-result.active')?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  // Ctrl/Cmd+F focuses this bar (and reopens the list if there's a query).
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        if (debounced.trim()) setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [debounced]);

  // Click outside the bar closes the list (keeps query + active index).
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (barRef.current && !barRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? goPrev() : goNext(); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); inputRef.current?.blur(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); goNext(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); goPrev(); }
  };

  const renderSnippet = (m) => {
    const [s, e] = m.matchInSnippet;
    return (<>{m.snippet.slice(0, s)}<mark>{m.snippet.slice(s, e)}</mark>{m.snippet.slice(e)}</>);
  };

  const hasQuery = debounced.trim().length > 0;

  return (
    <div className="central-search-bar" role="search" aria-label="Buscar en el libro" ref={barRef}>
      <div className="cs-header">
        <svg className="cs-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        <input
          ref={inputRef}
          className="cs-input"
          type="text"
          placeholder="Buscar texto en el libro y abrir su editor…  (Ctrl+F)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Texto a buscar"
        />
        {hasQuery && (
          <>
            <span className="cs-count" aria-live="polite">
              {matches.length ? `${activeIdx + 1}/${matches.length}${capped ? '+' : ''}` : '0'}
            </span>
            <button className="cs-nav" onClick={goPrev} disabled={!matches.length} title="Anterior (Shift+Enter)" aria-label="Anterior">↑</button>
            <button className="cs-nav" onClick={goNext} disabled={!matches.length} title="Siguiente (Enter)" aria-label="Siguiente">↓</button>
            <button
              className={`cs-toggle ${open ? 'open' : ''}`}
              onClick={() => setOpen((v) => !v)}
              disabled={!matches.length}
              title={open ? 'Ocultar resultados' : 'Mostrar resultados'}
              aria-label={open ? 'Ocultar lista de resultados' : 'Mostrar lista de resultados'}
              aria-expanded={open}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            <button className="cs-clear" onClick={() => { setQuery(''); setOpen(false); }} title="Limpiar" aria-label="Limpiar búsqueda">✕</button>
          </>
        )}
      </div>

      {open && hasQuery && (
        <div className="cs-results" ref={listRef}>
          {matches.length === 0 ? (
            <div className="cs-empty">Sin resultados</div>
          ) : (
            matches.map((m, i) => (
              <button
                key={`${m.chapterId}-${m.wordIndex}`}
                className={`cs-result ${i === activeIdx ? 'active' : ''}`}
                onClick={() => pickResult(i)}
              >
                <span className="cs-result-chapter">{m.chapterTitle || `Capítulo ${m.chapterIndex + 1}`}</span>
                <span className="cs-result-snippet">{renderSnippet(m)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
