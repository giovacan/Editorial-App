import { useState } from 'react';

export function FilterSidebar({ 
  categories, 
  selectedCategory, 
  onCategoryChange,
  priceRange,
  onPriceRangeChange,
  selectedFormats,
  onFormatChange,
  selectedRatings,
  onRatingChange,
  bookCounts 
}) {
  const [expandedSections, setExpandedSections] = useState({
    category: true,
    price: true,
    rating: true,
    format: true,
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const formats = [
    { id: 'ebook', label: 'eBook', count: bookCounts?.ebook || 12 },
    { id: 'pdf', label: 'PDF', count: bookCounts?.pdf || 8 },
    { id: 'kindle', label: 'Kindle', count: bookCounts?.kindle || 10 },
  ];

  const ratings = [
    { value: 4, label: '4+ estrellas', count: bookCounts?.['4plus'] || 15 },
    { value: 3, label: '3+ estrellas', count: bookCounts?.['3plus'] || 22 },
  ];

  return (
    <div style={styles.sidebar}>
      <div style={styles.header}>
        <h3 style={styles.title}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          Filtros
        </h3>
        <button 
          style={styles.clearBtn}
          onClick={() => {
            onCategoryChange('all');
            onPriceRangeChange([0, 50]);
            onFormatChange([]);
            onRatingChange([]);
          }}
        >
          Limpiar todo
        </button>
      </div>

      <div style={styles.section}>
        <button 
          style={styles.sectionHeader}
          onClick={() => toggleSection('category')}
        >
          <span style={styles.sectionTitle}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
            Categoría
          </span>
          <span style={styles.chevron}>{expandedSections.category ? '▼' : '▶'}</span>
        </button>
        {expandedSections.category && (
          <div style={styles.sectionContent}>
            {categories.map(cat => (
              <label key={cat.id} style={styles.checkboxLabel}>
                <input
                  type="radio"
                  name="category"
                  checked={selectedCategory === cat.id}
                  onChange={() => onCategoryChange(cat.id)}
                  style={styles.checkbox}
                />
                <span style={styles.checkboxText}>{cat.label}</span>
                <span style={styles.count}>({cat.count})</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div style={styles.section}>
        <button 
          style={styles.sectionHeader}
          onClick={() => toggleSection('price')}
        >
          <span style={styles.sectionTitle}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
            Precio
          </span>
          <span style={styles.chevron}>{expandedSections.price ? '▼' : '▶'}</span>
        </button>
        {expandedSections.price && (
          <div style={styles.sectionContent}>
            <div style={styles.priceInputs}>
              <input
                type="number"
                value={priceRange[0]}
                onChange={(e) => onPriceRangeChange([Number(e.target.value), priceRange[1]])}
                style={styles.priceInput}
                placeholder="Min"
              />
              <span style={styles.priceDash}>-</span>
              <input
                type="number"
                value={priceRange[1]}
                onChange={(e) => onPriceRangeChange([priceRange[0], Number(e.target.value)])}
                style={styles.priceInput}
                placeholder="Max"
              />
            </div>
            <input
              type="range"
              min="0"
              max="50"
              value={priceRange[1]}
              onChange={(e) => onPriceRangeChange([priceRange[0], Number(e.target.value)])}
              style={styles.rangeSlider}
            />
            <div style={styles.priceLabels}>
              <span>${priceRange[0]}</span>
              <span>${priceRange[1]}</span>
            </div>
          </div>
        )}
      </div>

      <div style={styles.section}>
        <button 
          style={styles.sectionHeader}
          onClick={() => toggleSection('rating')}
        >
          <span style={styles.sectionTitle}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            Rating
          </span>
          <span style={styles.chevron}>{expandedSections.rating ? '▼' : '▶'}</span>
        </button>
        {expandedSections.rating && (
          <div style={styles.sectionContent}>
            {ratings.map(rat => (
              <label key={rat.value} style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={selectedRatings.includes(rat.value)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onRatingChange([...selectedRatings, rat.value]);
                    } else {
                      onRatingChange(selectedRatings.filter(r => r !== rat.value));
                    }
                  }}
                  style={styles.checkbox}
                />
                <span style={styles.checkboxText}>{rat.label}</span>
                <span style={styles.count}>({rat.count})</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div style={styles.section}>
        <button 
          style={styles.sectionHeader}
          onClick={() => toggleSection('format')}
        >
          <span style={styles.sectionTitle}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
            Formato
          </span>
          <span style={styles.chevron}>{expandedSections.format ? '▼' : '▶'}</span>
        </button>
        {expandedSections.format && (
          <div style={styles.sectionContent}>
            {formats.map(fmt => (
              <label key={fmt.id} style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={selectedFormats.includes(fmt.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onFormatChange([...selectedFormats, fmt.id]);
                    } else {
                      onFormatChange(selectedFormats.filter(f => f !== fmt.id));
                    }
                  }}
                  style={styles.checkbox}
                />
                <span style={styles.checkboxText}>{fmt.label}</span>
                <span style={styles.count}>({fmt.count})</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  sidebar: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    border: '1px solid #f0f0f0',
    position: 'sticky',
    top: '100px',
    maxHeight: 'calc(100vh - 140px)',
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    paddingBottom: '16px',
    borderBottom: '1px solid #f0f0f0',
    gap: '8px',
  },
  title: {
    fontSize: '18px',
    fontWeight: '800',
    color: '#1e293b',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  clearBtn: {
    background: 'none',
    border: 'none',
    color: '#6366f1',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '4px',
    transition: 'background 0.2s',
  },
  section: {
    marginBottom: '16px',
  },
  sectionHeader: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'none',
    border: 'none',
    padding: '10px 0',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '700',
    color: '#1e293b',
  },
  sectionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#374151',
  },
  chevron: {
    fontSize: '10px',
    color: '#9ca3af',
  },
  sectionContent: {
    paddingTop: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
    padding: '6px 8px',
    borderRadius: '6px',
    transition: 'background 0.2s',
    width: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    minWidth: '16px',
    accentColor: '#6366f1',
    cursor: 'pointer',
  },
  checkboxText: {
    flex: 1,
    minWidth: 0,
    fontSize: '13px',
    color: '#4b5563',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  count: {
    fontSize: '12px',
    color: '#9ca3af',
  },
  priceInputs: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
  },
  priceInput: {
    flex: 1,
    minWidth: 0,
    width: '100%',
    padding: '8px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  priceDash: {
    color: '#9ca3af',
  },
  rangeSlider: {
    width: '100%',
    marginTop: '12px',
    accentColor: '#6366f1',
  },
  priceLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '4px',
  },
};

export default FilterSidebar;
