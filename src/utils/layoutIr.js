/**
 * layoutIr.js
 *
 * Shared HTML block/fragment representation for deterministic pagination.
 * This module is intentionally DOM-free and worker-safe.
 */

export const JUSTIFY_SLACK_RATIO = 0.04;

export const htmlToText = (html = '') => (html || '').replace(/<[^>]*>/g, '');

const SELF_CLOSING_TAGS = new Set(['BR', 'HR', 'IMG', 'INPUT', 'META', 'LINK']);

const toDatasetKey = (name) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

const parseAttributes = (openTag) => {
  const attrs = {};
  const attrRe = /([^\s=/>]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;

  while ((match = attrRe.exec(openTag)) !== null) {
    const name = match[1];
    if (!name || name.startsWith('<') || name === '/') continue;
    if (name === openTag.match(/^<([^\s/>]+)/)?.[1]) continue;
    attrs[name] = match[2] ?? match[3] ?? match[4] ?? '';
  }

  return attrs;
};

const buildDataset = (attrs) => {
  const dataset = {};
  for (const [name, value] of Object.entries(attrs)) {
    if (!name.startsWith('data-')) continue;
    dataset[toDatasetKey(name.slice(5))] = value;
  }
  return dataset;
};

const getTagName = (openTag) => {
  const match = openTag.match(/^<([a-zA-Z][^\s/>]*)/);
  return match ? match[1].toUpperCase() : 'UNKNOWN';
};

export const parseTopLevelBlocks = (html = '') => {
  if (!html) return [];

  const blocks = [];
  let cursor = 0;

  while (cursor < html.length) {
    while (cursor < html.length && html[cursor] !== '<') cursor++;
    if (cursor >= html.length) break;

    const tagStart = cursor;
    const tagEnd = html.indexOf('>', cursor);
    if (tagEnd === -1) break;

    const openTag = html.slice(tagStart, tagEnd + 1);
    const tagName = getTagName(openTag);
    const isSelfClosing = openTag.endsWith('/>') || SELF_CLOSING_TAGS.has(tagName);
    cursor = tagEnd + 1;

    if (isSelfClosing) {
      const attrs = parseAttributes(openTag);
      blocks.push({
        tag: tagName,
        tagName,
        tagLower: tagName.toLowerCase(),
        openTag,
        closeTag: '',
        outerHtml: openTag,
        innerHTML: '',
        textContent: '',
        attrs,
        style: attrs.style || '',
        dataset: buildDataset(attrs),
        className: attrs.class || '',
        classList: (attrs.class || '').split(/\s+/).filter(Boolean),
        isSelfClosing: true
      });
      continue;
    }

    let depth = 1;
    let searchFrom = cursor;
    const openRe = new RegExp(`<${tagName}[\\s>]`, 'i');
    const closeRe = new RegExp(`</${tagName}>`, 'i');

    while (searchFrom < html.length && depth > 0) {
      const sliced = html.slice(searchFrom);
      const nextOpen = openRe.exec(sliced);
      const nextClose = closeRe.exec(sliced);
      if (!nextClose) break;

      if (nextOpen && nextOpen.index < nextClose.index) {
        depth++;
        searchFrom += nextOpen.index + 1;
      } else {
        depth--;
        searchFrom += nextClose.index + nextClose[0].length;
      }
    }

    const outerHtml = html.slice(tagStart, searchFrom);
    const closeTagMatch = outerHtml.match(/<\/[^>]+>\s*$/);
    const closeTag = closeTagMatch ? closeTagMatch[0].trim() : `</${tagName.toLowerCase()}>`;
    const innerHTML = closeTagMatch
      ? outerHtml.slice(openTag.length, outerHtml.length - closeTagMatch[0].length)
      : '';
    const attrs = parseAttributes(openTag);

    blocks.push({
      tag: tagName,
      tagName,
      tagLower: tagName.toLowerCase(),
      openTag,
      closeTag,
      outerHtml,
      innerHTML,
      textContent: htmlToText(innerHTML),
      attrs,
      style: attrs.style || '',
      dataset: buildDataset(attrs),
      className: attrs.class || '',
      classList: (attrs.class || '').split(/\s+/).filter(Boolean),
      isSelfClosing: false
    });

    cursor = searchFrom;
  }

  return blocks;
};

export const serializeBlocks = (blocks = []) => blocks.map((block) => block.outerHtml).join('');

export const cloneBlock = (block) => {
  if (!block) return block;
  return {
    ...block,
    attrs: block.attrs ? { ...block.attrs } : {},
    dataset: block.dataset ? { ...block.dataset } : {},
    classList: Array.isArray(block.classList) ? [...block.classList] : []
  };
};

export const cloneBlocks = (blocks = []) => blocks.map(cloneBlock);

export const ensureBlocks = (value = '') => {
  if (Array.isArray(value)) return cloneBlocks(value);
  if (value && Array.isArray(value.blocks)) return cloneBlocks(value.blocks);
  if (value && typeof value === 'object' && typeof value.html === 'string') {
    return parseTopLevelBlocks(value.html || '');
  }
  return parseTopLevelBlocks(typeof value === 'string' ? value : '');
};

export const serializeBlocksTrimmed = (blocks = []) => serializeBlocks(blocks).trim();

export const getPageBlocks = (page) => ensureBlocks(page);

export const setPageBlocks = (page, blocks = [], extra = {}) => {
  const nextBlocks = ensureBlocks(blocks);
  const html = serializeBlocksTrimmed(nextBlocks);
  return {
    ...page,
    ...extra,
    blocks: nextBlocks,
    html,
    isBlank: extra.isBlank ?? (!html)
  };
};

export const setPageHtml = (page, html = '', extra = {}) =>
  setPageBlocks(page, parseTopLevelBlocks(html), extra);

export const getFirstBlock = (html = '') => parseTopLevelBlocks(html)[0] || null;

export const getLastBlock = (html = '') => {
  const blocks = parseTopLevelBlocks(html);
  return blocks.length > 0 ? blocks[blocks.length - 1] : null;
};

export const removeBlockAt = (html = '', index) => {
  const blocks = parseTopLevelBlocks(html);
  if (index < 0 || index >= blocks.length) return html;
  const toRemove = blocks[index].outerHtml;
  const pos = html.indexOf(toRemove);
  if (pos === -1) return html;
  return (html.slice(0, pos) + html.slice(pos + toRemove.length)).trim();
};

export const removeLastBlock = (html = '') => {
  const blocks = parseTopLevelBlocks(html);
  if (blocks.length === 0) return { newHtml: html, removed: null };
  const last = blocks[blocks.length - 1];
  const pos = html.lastIndexOf(last.outerHtml);
  if (pos === -1) return { newHtml: html, removed: last };
  return { newHtml: html.slice(0, pos).trim(), removed: last };
};

export const removeFirstBlock = (html = '') => {
  const blocks = parseTopLevelBlocks(html);
  if (blocks.length === 0) return { newHtml: html, removed: null };
  const first = blocks[0];
  const pos = html.indexOf(first.outerHtml);
  if (pos === -1) return { newHtml: html, removed: first };
  return { newHtml: html.slice(pos + first.outerHtml.length).trim(), removed: first };
};

export const getBoldTextRatio = (outerHtml = '') => {
  const totalText = htmlToText(outerHtml).trim();
  let boldLen = 0;
  const boldRe = /<(?:strong|b)(?:\s[^>]*)?>([^<]*(?:<(?!\/(?:strong|b)>)[^<]*)*)<\/(?:strong|b)>/gi;
  let match;

  while ((match = boldRe.exec(outerHtml)) !== null) {
    boldLen += htmlToText(match[1]).trim().length;
  }

  return { boldLen, totalLen: totalText.length };
};

export const extractInlineStyle = (htmlString = '') => {
  const styleMatch = htmlString.match(/^<[^>]+\sstyle="([^"]*)"/i);
  return styleMatch ? styleMatch[1] : null;
};

export const getInnerHtml = (htmlString = '') => {
  const block = getFirstBlock(htmlString);
  return block ? block.innerHTML : htmlString;
};

export const truncateHtmlByCharsPreservingTags = (htmlString = '', maxChars = 0) => {
  if (!htmlString || maxChars <= 0) return '';

  let textCount = 0;
  let result = '';
  const tagStack = [];
  let cursor = 0;

  while (cursor < htmlString.length) {
    if (textCount >= maxChars) break;

    if (htmlString[cursor] === '<') {
      const end = htmlString.indexOf('>', cursor);
      if (end === -1) {
        result += htmlString[cursor++];
        continue;
      }

      const tag = htmlString.slice(cursor, end + 1);
      const tagNameMatch = tag.match(/^<\/?([a-zA-Z][^\s/>]*)/);
      const tagName = tagNameMatch ? tagNameMatch[1].toLowerCase() : null;
      const isClose = tag.startsWith('</');
      const isSelfClosing = tag.endsWith('/>');

      if (tagName && !isClose && !isSelfClosing) tagStack.push(tagName);
      else if (tagName && isClose) {
        const idx = tagStack.lastIndexOf(tagName);
        if (idx !== -1) tagStack.splice(idx, 1);
      }

      result += tag;
      cursor = end + 1;
      continue;
    }

    if (htmlString[cursor] === '&') {
      const end = htmlString.indexOf(';', cursor);
      if (end !== -1 && end - cursor <= 10) {
        result += htmlString.slice(cursor, end + 1);
        cursor = end + 1;
      } else {
        result += htmlString[cursor++];
      }
      textCount++;
      continue;
    }

    result += htmlString[cursor++];
    textCount++;
  }

  for (let i = tagStack.length - 1; i >= 0; i--) {
    result += `</${tagStack[i]}>`;
  }

  return result;
};

export const splitHtmlByCharsPreservingTags = (htmlString = '', maxChars = 0, options = {}) => {
  const { trimLeadingSpace = true } = options;
  if (!htmlString) return { headHtml: '', tailHtml: '' };
  if (maxChars <= 0) return { headHtml: '', tailHtml: trimLeadingSpace ? htmlString.trimStart() : htmlString };

  const headHtml = truncateHtmlByCharsPreservingTags(htmlString, maxChars);

  let visibleChars = 0;
  let cursor = 0;
  while (cursor < htmlString.length && visibleChars < maxChars) {
    if (htmlString[cursor] === '<') {
      const end = htmlString.indexOf('>', cursor);
      cursor = end === -1 ? cursor + 1 : end + 1;
    } else if (htmlString[cursor] === '&') {
      const end = htmlString.indexOf(';', cursor);
      cursor = end !== -1 && end - cursor <= 10 ? end + 1 : cursor + 1;
      visibleChars++;
    } else {
      cursor++;
      visibleChars++;
    }
  }

  let tailHtml = htmlString.slice(cursor);
  if (trimLeadingSpace) tailHtml = tailHtml.replace(/^\s+/, '');

  return { headHtml, tailHtml };
};
