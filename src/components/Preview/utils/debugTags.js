/**
 * Adds visual debug tags to HTML content for development inspection.
 */
export const addDebugTags = (html, debugConfig, paragraphConfig) => {
  if (!debugConfig?.enabled || !html) return html;

  const isChapterTitle = (text) => {
    const patterns = [
      /^(cap[ií]tulo|chapter|cap\.?)\s+\d+/i,
      /^(parte|part|book)\s+\d+/i,
      /^(introducci[ó]n|introduction|pr[ó]logo|prologue)/i,
      /^\d+\.\s+[A-ZÁÉÍÓÚÑ]/,
      /^secci[ó]n\s+\d+/i
    ];
    return patterns.some(p => p.test(text.trim()));
  };

  let processedHtml = html;

  if (debugConfig.elements?.headers) {
    processedHtml = processedHtml.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (match, level) => {
      const tag = 'h' + level;
      return `<span class="debug-tag ${tag}">[${tag.toUpperCase()}]</span>${match}`;
    });

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    let maxFontSize = 0;
    tempDiv.querySelectorAll('p strong, p b').forEach(el => {
      const fontSize = parseFloat(window.getComputedStyle(el).fontSize) || 0;
      if (fontSize > maxFontSize) maxFontSize = fontSize;
    });

    const sizeThreshold = maxFontSize * 0.9;

    processedHtml = processedHtml.replace(/<p[^>]*>\s*<(strong|b)[^>]*>([\s\S]*?)<\/\1>\s*<\/p>/gi, (match, tag, content) => {
      const textContent = content.replace(/<[^>]+>/g, '').trim();
      const isChapter = isChapterTitle(textContent);

      const tempP = document.createElement('p');
      tempP.innerHTML = match;
      const strongEl = tempP.querySelector('strong, b');
      let isLargest = false;
      if (strongEl) {
        const fontSize = parseFloat(window.getComputedStyle(strongEl).fontSize) || 0;
        isLargest = fontSize >= sizeThreshold;
      }

      if (textContent.length > 2) {
        const label = isChapter || isLargest ? 'h1' : 'h2';
        return `<span class="debug-tag ${label}">[${label.toUpperCase()}]</span>${match}`;
      }
      return match;
    });
  }

  if (debugConfig.elements?.quotes) {
    processedHtml = processedHtml.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (match) =>
      `<span class="debug-tag quote">[Q]</span>${match}`
    );
    processedHtml = processedHtml.replace(/<p[^>]*class="[^"]*quote[^"]*"[^>]*>([\s\S]*?)<\/p>/gi, (match) =>
      `<span class="debug-tag quote">[Q]</span>${match}`
    );
    processedHtml = processedHtml.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, (match) => {
      const text = match.replace(/<[^>]+>/g, '').trim();
      if (text.length > 10 && text.length < 500) {
        return `<span class="debug-tag quote">[Q]</span>${match}`;
      }
      return match;
    });
  }

  if (debugConfig.elements?.paragraphs) {
    processedHtml = processedHtml.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (match, content) => {
      const textContent = content.replace(/<[^>]+>/g, '').trim();
      const hasBold = /<strong[^>]*>|<\/?b[^>]*>/i.test(content);
      if (textContent.length > 0 && !hasBold) {
        const indent = paragraphConfig?.firstLineIndent;
        const indentLabel = indent > 0 ? `[SANG:${indent}em]` : '';
        return `<span class="debug-tag paragraph">[P]${indentLabel}</span>${match}`;
      }
      return match;
    });
  }

  return processedHtml;
};
