// Utility to analyze and preserve paragraph structure from original document

export const analyzeParagraphStructure = (htmlContent) => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;
  
  const elements = Array.from(tempDiv.children);
  
  const result = {
    totalElements: elements.length,
    paragraphs: [],
    headings: [],
    blockquotes: [],
    lists: [],
    other: []
  };
  
  elements.forEach((el, index) => {
    const tag = el.tagName.toLowerCase();
    const text = el.textContent?.trim() || '';
    const html = el.outerHTML;
    
    const item = {
      index,
      tag,
      text: text.substring(0, 100), // First 100 chars
      fullText: text,
      html,
      length: text.length
    };
    
    if (tag === 'p' || tag === 'div') {
      result.paragraphs.push(item);
    } else if (/^h[1-6]$/i.test(tag)) {
      result.headings.push(item);
    } else if (tag === 'blockquote') {
      result.blockquotes.push(item);
    } else if (tag === 'ul' || tag === 'ol') {
      result.lists.push(item);
    } else {
      result.other.push(item);
    }
  });
  
  result.stats = {
    totalParagraphs: result.paragraphs.length,
    totalHeadings: result.headings.length,
    totalBlockquotes: result.blockquotes.length,
    totalLists: result.lists.length,
    totalOther: result.other.length
  };
  
  return result;
};

export const detectChapterStructure = (chapterHtml) => {
  const structure = analyzeParagraphStructure(chapterHtml);
  
  // Detect chapter title from first heading
  if (structure.headings.length > 0) {
    structure.chapterTitle = structure.headings[0].text;
    structure.chapterTitleElement = structure.headings[0];
  }
  
  // Detect sections (subheadings)
  structure.sections = [];
  let currentSection = null;
  
  structure.headings.forEach((heading, idx) => {
    if (heading.tag === 'h2') {
      if (currentSection) {
        structure.sections.push(currentSection);
      }
      currentSection = {
        title: heading.text,
        startIndex: heading.index,
        elements: []
      };
    } else if (currentSection) {
      currentSection.elements.push(heading);
    }
  });
  
  if (currentSection) {
    structure.sections.push(currentSection);
  }
  
  return structure;
};

export const compareParagraphCounts = (originalAnalysis, paginatedPages) => {
  const originalCount = originalAnalysis.stats.totalParagraphs;
  
  let paginatedParagraphs = 0;
  paginatedPages.forEach(page => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = page.html || '';
    const paragraphs = tempDiv.querySelectorAll('p, div');
    paginatedParagraphs += paragraphs.length;
  });
  
  return {
    original: originalCount,
    paginated: paginatedParagraphs,
    match: originalCount === paginatedParagraphs,
    difference: paginatedParagraphs - originalCount
  };
};
