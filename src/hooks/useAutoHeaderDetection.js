import { useMemo, useCallback } from 'react';
import { analyzeAndConvertHierarchies, detectTextHierarchies, suggestHeaderMapping } from '../utils/headerHierarchyDetector';

export const useAutoHeaderDetection = (chapters, config) => {
  const autoDetectConfig = config?.autoDetectHeaders || {};
  const enabled = autoDetectConfig.enabled || false;
  const targetLevel = autoDetectConfig.targetLevel || 'h2';
  const preserveFormatting = autoDetectConfig.preserveFormatting !== false;

  const detectChapterHierarchies = useCallback((chapterHtml) => {
    if (!enabled || !chapterHtml) return null;
    
    return detectTextHierarchies(chapterHtml, {
      minTextLength: 3,
      similarityThreshold: 0.15,
      maxLevels: 3
    });
  }, [enabled]);

  const convertChapterToHeaders = useCallback((chapterHtml) => {
    if (!enabled || !chapterHtml) return chapterHtml;

    const result = analyzeAndConvertHierarchies(chapterHtml, {
      convertBold: true,
      preserveFormatting
    });

    return result.convertedHtml;
  }, [enabled, preserveFormatting]);

  const getChapterSuggestions = useCallback((chapterHtml, baseFontSize = 12) => {
    if (!chapterHtml) return null;

    const detection = detectTextHierarchies(chapterHtml, {
      minTextLength: 3,
      similarityThreshold: 0.15,
      maxLevels: 3
    });

    return suggestHeaderMapping(detection.hierarchies, baseFontSize);
  }, []);

  const applyToAllChapters = useCallback((chapters) => {
    if (!enabled) return chapters;

    return chapters.map(chapter => ({
      ...chapter,
      html: convertChapterToHeaders(chapter.html)
    }));
  }, [enabled, convertChapterToHeaders]);

  const getTotalDetectedHeaders = useMemo(() => {
    if (!enabled || !chapters) return { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };

    const counts = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };

    chapters.forEach(chapter => {
      const temp = document.createElement('div');
      temp.innerHTML = chapter.html || '';
      
      ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].forEach(tag => {
        counts[tag] += temp.querySelectorAll(tag).length;
      });
    });

    return counts;
  }, [enabled, chapters]);

  return {
    enabled,
    detectChapterHierarchies,
    convertChapterToHeaders,
    getChapterSuggestions,
    applyToAllChapters,
    getTotalDetectedHeaders,
    targetLevel,
    preserveFormatting
  };
};

export const AUTO_HEADER_LEVELS = [
  { value: 'h1', label: 'H1 (Título principal)', ratio: '1.8x' },
  { value: 'h2', label: 'H2 (Subtítulo grande)', ratio: '1.5x' },
  { value: 'h3', label: 'H3 (Subtítulo mediano)', ratio: '1.3x' },
  { value: 'h4', label: 'H4 (Subtítulo pequeño)', ratio: '1.15x' },
  { value: 'h5', label: 'H5 (Subtítulo menor)', ratio: '1.05x' },
  { value: 'h6', label: 'H6 (最小)', ratio: '1x' }
];
