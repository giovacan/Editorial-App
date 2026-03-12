const ROMAN_NUMERALS = [
  ['M', 1000], ['CM', 900], ['D', 500], ['CD', 400],
  ['C', 100], ['XC', 90], ['L', 50], ['XL', 40],
  ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]
];

const SPANISH_NUMBERS = [
  'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
  'treinta', 'treinta y uno', 'treinta y dos', 'treinta y tres', 'treinta y cuatro', 'treinta y cinco'
];

export const toRoman = (num) => {
  if (typeof num !== 'number' || num < 1 || num > 50) return String(num);
  let result = '';
  for (const [letter, value] of ROMAN_NUMERALS) {
    while (num >= value) {
      result += letter;
      num -= value;
    }
  }
  return result;
};

export const fromRoman = (str) => {
  let result = 0;
  let upper = str.toUpperCase();
  for (const [letter, value] of ROMAN_NUMERALS) {
    while (upper.startsWith(letter)) {
      result += value;
      upper = upper.slice(letter.length);
    }
  }
  return result > 0 ? result : null;
};

export const parseNumber = (str) => {
  const cleaned = str.replace(/[.,\s]/g, '');
  const arabic = parseInt(cleaned, 10);
  if (!isNaN(arabic)) return arabic;
  
  const spanish = SPANISH_NUMBERS.findIndex(n => str.toLowerCase().includes(n));
  if (spanish >= 0) return spanish;
  
  const roman = fromRoman(str);
  if (roman) return roman;
  
  return null;
};

export const detectTitleFormat = (title) => {
  if (!title || typeof title !== 'string') return null;
  
  const trimmed = title.trim();
  
  const patterns = {
    classic: /^(cap[ií]tulo|chapter|cap\.?)\s+/i,
    roman: /^([IVXLCDM]+)\.?\s*[:\-–—]?\s*/i,
    number: /^(#?\d+)\.?\s*[:\-–—]?\s*/i,
    spanish: /^(cap[ií]tulo\s+(?:uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciséis))/i,
    part: /^(parte?|part)\s+/i,
    book: /^(libro|book)\s+/i,
    section: /^(secci[oó]n|section)\s+/i,
  };
  
  for (const [format, pattern] of Object.entries(patterns)) {
    if (pattern.test(trimmed)) {
      return format;
    }
  }
  
  return 'minimal';
};

export const formatLabels = {
  classic: (label) => {
    const num = parseNumber(label);
    if (num !== null) {
      return `Capítulo ${num}`;
    }
    return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
  },
  roman: (label) => {
    const num = parseNumber(label);
    if (num !== null) {
      return `${toRoman(num)}.`;
    }
    return label.toUpperCase();
  },
  number: (label) => {
    const num = parseNumber(label);
    if (num !== null) {
      return `${num}.`;
    }
    return label;
  },
  spanish: (label) => {
    const num = parseNumber(label);
    if (num !== null && num <= 35) {
      const spanishNum = SPANISH_NUMBERS[num] || label;
      return `Capítulo ${spanishNum}`;
    }
    return label;
  },
  modern: (label) => {
    const num = parseNumber(label);
    if (num !== null) {
      return String(num).padStart(2, '0');
    }
    return label;
  },
  minimal: () => null,
};

export const transformChapterTitle = (title, targetFormat) => {
  if (!title || typeof title !== 'string') return title;
  
  const trimmed = title.trim();
  const parsed = parseChapterTitle(trimmed);
  
  if (!parsed.label) {
    if (targetFormat === 'minimal') {
      return title;
    }
    return title;
  }
  
  const formatter = formatLabels[targetFormat];
  if (!formatter) return title;
  
  const newLabel = formatter(parsed.label);
  if (!newLabel) {
    return parsed.title;
  }
  
  return `${newLabel} – ${parsed.title}`;
};

const parseChapterTitle = (title) => {
  const patterns = [
    /^((?:cap[ií]tulo|chapter|cap\.?)\s+(?:#?\d+|[IVXLCDM]+|[a-z]+))\s*[:\-–—]\s*(.+)$/i,
    /^((?:parte?|part)\s+(?:#?\d+|[IVXLCDM]+|[a-z]+))\s*[:\-–—]\s*(.+)$/i,
    /^((?:libro|book)\s+(?:#?\d+|[IVXLCDM]+))\s*[:\-–—]\s*(.+)$/i,
     /^((?:secci[oó]n|section)\s+(?:#?\d+|[IVXLCDM]+))\s*[:\-–—]\s*(.+)$/i,
    /^(#?\d+\.)\s+(.+)$/,
    /^([IVXLCDM]+\.)\s+(.+)$/,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) {
      return { label: match[1].trim(), title: match[2].trim() };
    }
  }

  return { label: null, title };
};

export const transformAllChapters = (chapters, targetFormat) => {
  if (!chapters || !Array.isArray(chapters)) return chapters;
  
  return chapters.map(chapter => {
    if (!chapter.title) return chapter;
    
    const transformedTitle = transformChapterTitle(chapter.title, targetFormat);
    
    return {
      ...chapter,
      title: transformedTitle
    };
  });
};

export const TITLE_FORMAT_OPTIONS = [
  { id: 'classic', label: 'Clásico', example: 'Capítulo 1 – Título' },
  { id: 'roman', label: 'Romano', example: 'I. – Título' },
  { id: 'number', label: 'Número', example: '1. – Título' },
  { id: 'spanish', label: 'Español', example: 'Capítulo Uno – Título' },
  { id: 'modern', label: 'Moderno', example: '01 – Título' },
  { id: 'minimal', label: 'Minimal', example: 'Título' },
];

export default {
  toRoman,
  fromRoman,
  detectTitleFormat,
  transformChapterTitle,
  transformAllChapters,
  TITLE_FORMAT_OPTIONS,
};
