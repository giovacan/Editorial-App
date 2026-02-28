import { useCallback, useRef, useState } from 'react';

export const useParagraphValidation = () => {
  const [validationState, setValidationState] = useState({
    isValidating: false,
    issues: [],
    corrections: [],
    needsUserAttention: false,
    currentError: null
  });

  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [currentError, setCurrentError] = useState(null);
  
  const [detectedChapters, setDetectedChapters] = useState([]);
  const [showChapterDialog, setShowChapterDialog] = useState(false);
  const [chaptersConfirmed, setChaptersConfirmed] = useState(false);

  const isChapterTitle = useCallback((text) => {
    if (!text) return false;
    const patterns = [
      /^(cap[ií]tulo|chapter|cap\.?)\s+\d+/i,
      /^(parte|part|book)\s+\d+/i,
      /^(introducci[ó]n|introduction|pr[ó]logo|prologue|prefacio|ep[ií]logo)/i,
      /^\d+\.\s+[A-ZÁÉÍÓÚÑ]/,
      /^secci[ó]n\s+\d+/i,
      /^apartado\s+\d+/i,
      /^\w+\s+\d{4}/,
      /^parte\s+\w+/i
    ];
    return patterns.some(p => p.test(text.trim()));
  }, []);

  const detectChapters = useCallback((chapters) => {
    const detected = [];
    
    chapters.forEach((chapter, chapterIndex) => {
      if (!chapter.html) return;
      
      const temp = document.createElement('div');
      temp.innerHTML = chapter.html;
      
      const paragraphs = Array.from(temp.querySelectorAll('p'));
      
      for (let i = 0; i < Math.min(paragraphs.length, 3); i++) {
        const p = paragraphs[i];
        const strong = p.querySelector('strong, b');
        const em = p.querySelector('em, i');
        
        let titleText = '';
        if (strong) {
          titleText = strong.textContent?.trim() || '';
        } else if (em && i === 0) {
          titleText = em.textContent?.trim() || '';
        } else if (i === 0) {
          titleText = p.textContent?.trim() || '';
        }
        
        if (titleText && isChapterTitle(titleText)) {
          detected.push({
            chapterId: chapter.id,
            chapterIndex,
            chapterTitle: chapter.title || titleText,
            detectedTitle: titleText,
            paragraphIndex: i,
            html: p.outerHTML,
            confirmed: true
          });
          break;
        }
      }
    });
    
    setDetectedChapters(detected);
    return detected;
  }, [isChapterTitle]);

  const confirmChapters = useCallback((chapterList) => {
    setDetectedChapters(chapterList);
    setChaptersConfirmed(true);
    setShowChapterDialog(false);
  }, []);

  const updateChapterConfirmation = useCallback((chapterId, confirmed) => {
    setDetectedChapters(prev => 
      prev.map(ch => 
        ch.chapterId === chapterId ? { ...ch, confirmed } : ch
      )
    );
  }, []);

  const extractOriginalParagraphs = useCallback((html) => {
    if (!html) return [];
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const paragraphs = Array.from(temp.querySelectorAll('p, div'))
      .map((p, index) => {
        const text = p.textContent?.trim() || '';
        const words = text.split(/\s+/).filter(w => w.length > 0);
        return {
          index,
          text,
          length: text.length,
          words: words.length,
          html: p.outerHTML,
          tag: p.tagName.toLowerCase()
        };
      })
      .filter(p => p.text.length > 0);
    return paragraphs;
  }, []);

  const extractPreviewParagraphs = useCallback((pages) => {
    if (!pages || pages.length === 0) return [];
    const paragraphs = [];
    pages.forEach(page => {
      const temp = document.createElement('div');
      temp.innerHTML = page.html || '';
      const pageParagraphs = Array.from(temp.querySelectorAll('p, div'))
        .map((p, index) => {
          const text = p.textContent?.trim() || '';
          const words = text.split(/\s+/).filter(w => w.length > 0);
          return {
            index: paragraphs.length + index,
            text,
            length: text.length,
            words: words.length,
            html: p.outerHTML,
            tag: p.tagName.toLowerCase(),
            pageNumber: page.pageNumber,
            chapterTitle: page.chapterTitle
          };
        })
        .filter(p => p.text.length > 0);
      paragraphs.push(...pageParagraphs);
    });
    return paragraphs;
  }, []);

  const compareParagraphs = useCallback((original, preview, confirmedTitles = []) => {
    const issues = [];
    const maxLen = Math.max(original.length, preview.length);

    // Normalizar títulos confirmados para comparación
    const normalizedTitles = confirmedTitles.map(t => t.trim().toLowerCase());

    const isConfirmedTitle = (text) => {
      if (!text) return false;
      const normalized = text.trim().toLowerCase();
      return normalizedTitles.some(t =>
        normalized.includes(t) || t.includes(normalized)
      );
    };

    for (let i = 0; i < maxLen; i++) {
      const orig = original[i];
      const prev = preview[i];

      // Skip si el texto coincide con un título confirmado
      if (orig && isConfirmedTitle(orig.text)) continue;
      if (prev && isConfirmedTitle(prev.text)) continue;

      if (!orig) {
        issues.push({
          type: 'MISSING_ORIGINAL',
          index: i,
          message: `Párrafo ${i + 1} faltante en original`
        });
        continue;
      }

      if (!prev) {
        issues.push({
          type: 'MISSING_PREVIEW',
          index: i,
          originalIndex: i,
          originalText: orig.text.substring(0, 50) + '...',
          message: `Párrafo ${i + 1} no aparece en preview`
        });
        continue;
      }

      const wordDiff = Math.abs(orig.words - prev.words);
      const charDiff = Math.abs(orig.length - prev.length);

      if (wordDiff > 0 || charDiff > 0) {
        issues.push({
          type: 'INCONSISTENT',
          index: i,
          originalWords: orig.words,
          previewWords: prev.words,
          originalChars: orig.length,
          previewChars: prev.length,
          wordDiff,
          charDiff,
          originalText: orig.text.substring(0, 50) + '...',
          previewText: prev.text.substring(0, 50) + '...',
          message: `Párrafo ${i + 1}: Original=${orig.words} palabras, Preview=${prev.words} palabras`
        });
      }
    }

    return issues;
  }, []);

  const validateHeaders = useCallback((original, preview) => {
    const issues = [];
    
    const origHeaders = [];
    const tempOrig = document.createElement('div');
    tempOrig.innerHTML = original;
    ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].forEach(tag => {
      tempOrig.querySelectorAll(tag).forEach(el => {
        origHeaders.push({
          tag,
          text: el.textContent.trim(),
          html: el.outerHTML
        });
      });
    });

    const prevHeaders = [];
    preview.forEach(p => {
      const tempPrev = document.createElement('div');
      tempPrev.innerHTML = p.html || '';
      ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].forEach(tag => {
        tempPrev.querySelectorAll(tag).forEach(el => {
          prevHeaders.push({
            tag,
            text: el.textContent.trim(),
            html: el.outerHTML,
            pageNumber: p.pageNumber
          });
        });
      });
    });

    if (origHeaders.length !== prevHeaders.length) {
      issues.push({
        type: 'HEADER_COUNT_MISMATCH',
        originalCount: origHeaders.length,
        previewCount: prevHeaders.length,
        message: `Headers: Original=${origHeaders.length}, Preview=${prevHeaders.length}`
      });
    }

    return issues;
  }, []);

  const validateQuotes = useCallback((original, preview) => {
    const issues = [];

    const origQuotes = [];
    const tempOrig = document.createElement('div');
    tempOrig.innerHTML = original;
    tempOrig.querySelectorAll('blockquote, .quote, em, i').forEach(el => {
      origQuotes.push({
        text: el.textContent.trim().substring(0, 100),
        tag: el.tagName.toLowerCase()
      });
    });

    let prevQuotesCount = 0;
    preview.forEach(p => {
      const tempPrev = document.createElement('div');
      tempPrev.innerHTML = p.html || '';
      prevQuotesCount += tempPrev.querySelectorAll('blockquote, .quote, em, i').length;
    });

    if (origQuotes.length > 0 && prevQuotesCount === 0) {
      issues.push({
        type: 'QUOTES_MISSING',
        originalCount: origQuotes.length,
        previewCount: prevQuotesCount,
        message: `Citas: Original=${origQuotes.length}, Preview=${prevQuotesCount}`
      });
    }

    return issues;
  }, []);

  const validateIndentations = useCallback((preview, paragraphConfig) => {
    const issues = [];
    const expectedIndent = paragraphConfig?.firstLineIndent || 1.5;

    preview.forEach(page => {
      const temp = document.createElement('div');
      temp.innerHTML = page.html || '';
      const paragraphs = temp.querySelectorAll('p');

      paragraphs.forEach((p, index) => {
        const style = p.getAttribute('style') || '';
        if (style.includes('text-indent')) {
          const match = style.match(/text-indent:\s*([\d.]+)em/);
          if (match) {
            const actualIndent = parseFloat(match[1]);
            if (Math.abs(actualIndent - expectedIndent) > 0.1) {
              issues.push({
                type: 'INDENT_MISMATCH',
                page: page.pageNumber,
                paragraphIndex: index,
                expected: expectedIndent,
                actual: actualIndent,
                message: `Página ${page.pageNumber}, Párrafo ${index + 1}: Sangría=${actualIndent}em, Esperado=${expectedIndent}em`
              });
            }
          }
        }
      });
    });

    return issues;
  }, []);

  const validatePageBreaks = useCallback((pages) => {
    const issues = [];

    if (!pages || pages.length < 2) return issues;

    for (let i = 0; i < pages.length - 1; i++) {
      const currentPage = pages[i];
      const nextPage = pages[i + 1];

      if (currentPage.chapterTitle !== nextPage.chapterTitle) continue;

      const tempCurrent = document.createElement('div');
      tempCurrent.innerHTML = currentPage.html || '';
      const currentParagraphs = Array.from(tempCurrent.querySelectorAll('p, div'));

      if (currentParagraphs.length > 0) {
        const lastP = currentParagraphs[currentParagraphs.length - 1];
        const lastText = lastP.textContent?.trim() || '';

        if (lastText.length > 0 && !lastText.endsWith('.')) {
          issues.push({
            type: 'SENTENCE_NOT_COMPLETE',
            page: currentPage.pageNumber,
            nextPage: nextPage.pageNumber,
            text: lastText.substring(0, 50) + '...',
            message: `Página ${currentPage.pageNumber}: Última oración no termina en punto`
          });
        }
      }
    }

    return issues;
  }, []);

  const autoCorrect = useCallback((issue, chapters, setChapters) => {
    let corrected = false;

    switch (issue.type) {
      case 'INDENT_MISMATCH':
        corrected = false;
        break;

      case 'HEADER_COUNT_MISMATCH':
      case 'QUOTES_MISSING':
        corrected = false;
        break;

      default:
        corrected = false;
    }

    return corrected;
  }, []);

  const validateAll = useCallback(async (chapters, pages, config, confirmedTitles = []) => {
    setValidationState(prev => ({ ...prev, isValidating: true, issues: [], corrections: [] }));

    const allIssues = [];

    chapters.forEach((chapter, chapterIndex) => {
      const originalParagraphs = extractOriginalParagraphs(chapter.html);

      const chapterPages = pages.filter(p => p.chapterTitle === chapter.title);
      const previewParagraphs = extractPreviewParagraphs(chapterPages);

      const paragraphIssues = compareParagraphs(originalParagraphs, previewParagraphs, confirmedTitles);
      paragraphIssues.forEach(i => ({ ...i, chapter: chapter.title, chapterIndex }));
      allIssues.push(...paragraphIssues);

      const headerIssues = validateHeaders(chapter.html, chapterPages);
      headerIssues.forEach(i => ({ ...i, chapter: chapter.title, chapterIndex }));
      allIssues.push(...headerIssues);

      const quoteIssues = validateQuotes(chapter.html, chapterPages);
      quoteIssues.forEach(i => ({ ...i, chapter: chapter.title, chapterIndex }));
      allIssues.push(...quoteIssues);
    });

    const pageBreakIssues = validatePageBreaks(pages);
    allIssues.push(...pageBreakIssues);

    const indentIssues = validateIndentations(pages, config?.paragraph);
    allIssues.push(...indentIssues);

    const needsUserAttention = allIssues.some(issue => {
      return !['INDENT_MISMATCH', 'SENTENCE_NOT_COMPLETE'].includes(issue.type);
    });

    setValidationState({
      isValidating: false,
      issues: allIssues,
      corrections: [],
      needsUserAttention,
      currentError: null
    });

    if (needsUserAttention && allIssues.length > 0) {
      setCurrentError(allIssues[0]);
      setShowErrorDialog(true);
    }

    return {
      isValid: !needsUserAttention,
      issues: allIssues,
      needsUserAttention
    };
  }, [extractOriginalParagraphs, extractPreviewParagraphs, compareParagraphs, validateHeaders, validateQuotes, validateIndentations, validatePageBreaks]);

  const handleErrorAction = useCallback((action, error, chapters, setChapters) => {
    switch (action) {
      case 'keep_original':
        break;
      case 'accept_preview':
        break;
      case 'edit_manual':
        break;
      default:
        break;
    }

    setShowErrorDialog(false);
    setCurrentError(null);
  }, []);

  const closeErrorDialog = useCallback(() => {
    setShowErrorDialog(false);
    setCurrentError(null);
  }, []);

  return {
    validateAll,
    validationState,
    autoCorrect,
    showErrorDialog,
    currentError,
    handleErrorAction,
    closeErrorDialog,
    extractOriginalParagraphs,
    extractPreviewParagraphs,
    compareParagraphs,
    validateHeaders,
    validateQuotes,
    validateIndentations,
    validatePageBreaks
  };
};

export default useParagraphValidation;
