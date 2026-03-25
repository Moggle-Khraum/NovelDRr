import axios from 'axios';
import { parse } from 'fast-html-parser';

export interface NovelMeta {
  title: string;
  author: string;
  synopsis: string;
  coverUrl: string;
  firstChapterUrl: string | null;
}

export interface ChapterData {
  url: string;
  title: string;
  content: string;
  nextUrl: string | null;
}

// Helper to get text from element
const getText = (element: any): string => {
  if (!element) return '';
  if (element.rawText) return element.rawText.trim();
  if (element.text) return element.text.trim();
  if (element.structure && element.structure.text) return element.structure.text.trim();
  return '';
};

// Helper to get attribute
const getAttr = (element: any, attr: string): string => {
  if (!element) return '';
  if (element.attributes && element.attributes[attr]) return element.attributes[attr];
  return '';
};

// Helper to find first element by selector
const findOne = (root: any, selector: string): any => {
  if (!root) return null;
  
  // Simple selector parser (supports tag, #id, .class)
  let tag = '*';
  let id = '';
  let className = '';
  
  if (selector.includes('#')) {
    const parts = selector.split('#');
    tag = parts[0] || '*';
    const idAndClass = parts[1].split('.');
    id = idAndClass[0];
    className = idAndClass.slice(1).join('.');
  } else if (selector.includes('.')) {
    const parts = selector.split('.');
    tag = parts[0] || '*';
    className = parts.slice(1).join('.');
  } else {
    tag = selector;
  }
  
  const search = (node: any): any => {
    if (!node) return null;
    
    // Check current node
    if (node.tagName && node.tagName.toLowerCase() === tag.toLowerCase()) {
      if (id && node.attributes && node.attributes.id !== id) {
        // not matching id
      } else if (className) {
        const nodeClass = node.attributes?.class || '';
        const classes = nodeClass.split(' ');
        if (classes.includes(className)) {
          return node;
        }
      } else if (!id && !className) {
        return node;
      } else if (id && node.attributes && node.attributes.id === id) {
        return node;
      }
    }
    
    // Search children
    if (node.childNodes) {
      for (let i = 0; i < node.childNodes.length; i++) {
        const result = search(node.childNodes[i]);
        if (result) return result;
      }
    }
    
    return null;
  };
  
  return search(root);
};

// Helper to find all elements by selector
const findAll = (root: any, selector: string): any[] => {
  const results: any[] = [];
  
  let tag = '*';
  let className = '';
  
  if (selector.includes('.')) {
    const parts = selector.split('.');
    tag = parts[0] || '*';
    className = parts.slice(1).join('.');
  } else {
    tag = selector;
  }
  
  const search = (node: any) => {
    if (!node) return;
    
    if (node.tagName && node.tagName.toLowerCase() === tag.toLowerCase()) {
      if (className) {
        const nodeClass = node.attributes?.class || '';
        const classes = nodeClass.split(' ');
        if (classes.includes(className)) {
          results.push(node);
        }
      } else {
        results.push(node);
      }
    }
    
    if (node.childNodes) {
      for (let i = 0; i < node.childNodes.length; i++) {
        search(node.childNodes[i]);
      }
    }
  };
  
  search(root);
  return results;
};

// Helper to extract title from URL (same as Python)
const extractTitleFromUrl = (url: string): string => {
  try {
    const parsedUrl = new URL(url);
    let path = parsedUrl.pathname;
    
    if (path.endsWith('.html')) {
      path = path.slice(0, -5);
    }
    
    const pathParts = path.split('/').filter(part => part);
    
    let novelSlug = null;
    for (const part of pathParts) {
      if (part && !part.toLowerCase().includes('chapter') && part.length > 5) {
        novelSlug = part;
        break;
      }
    }
    
    if (!novelSlug && pathParts.length > 0) {
      novelSlug = pathParts[pathParts.length - 1];
    }
    
    if (novelSlug) {
      novelSlug = novelSlug.replace(/^\d+[\s\-\.]+/, '');
      const title = novelSlug.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
      return title.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }
    
    return 'Unknown Novel';
  } catch (error) {
    return 'Unknown Novel';
  }
};

const ensureAbsoluteUrl = (relativeUrl: string, baseUrl: string): string => {
  if (!relativeUrl) return baseUrl;
  if (relativeUrl.startsWith('http')) return relativeUrl;
  if (relativeUrl.startsWith('/')) {
    try {
      const parsed = new URL(baseUrl);
      return `${parsed.protocol}//${parsed.host}${relativeUrl}`;
    } catch {
      return relativeUrl;
    }
  }
  try {
    return new URL(relativeUrl, baseUrl).href;
  } catch {
    return relativeUrl;
  }
};

// Main novel meta extraction
export const directFetchNovelMeta = async (url: string): Promise<NovelMeta> => {
  console.log('[Scraper] Fetching novel meta from:', url);
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
      },
      timeout: 15000
    });
    
    const html = response.data;
    const root = parse(html);
    
    const domainLower = url.toLowerCase();
    const isReadNovelFull = domainLower.includes('readnovelfull');
    const isNovelFull = domainLower.includes('novelfull') && !isReadNovelFull;
    const isFreeWebNovel = domainLower.includes('freewebnovel');
    
    // Extract title
    let title = extractTitleFromUrl(url);
    
    if (isReadNovelFull || isNovelFull) {
      const titleElem = findOne(root, 'h3.title') || findOne(root, 'h1.title') || findOne(root, '.book-title');
      if (titleElem) title = getText(titleElem);
    } else if (isFreeWebNovel) {
      const titleElem = findOne(root, 'h1.novel-title') || findOne(root, 'h1.title');
      if (titleElem) title = getText(titleElem);
    }
    
    // Extract author
    let author = 'Unknown Author';
    
    if (isReadNovelFull) {
      const authorSpan = findOne(root, 'span[itemprop="author"]');
      if (authorSpan && authorSpan.childNodes) {
        for (const child of authorSpan.childNodes) {
          if (child.tagName === 'meta' && child.attributes && child.attributes.itemprop === 'name') {
            author = child.attributes.content || 'Unknown';
            break;
          }
        }
      }
    } else if (isNovelFull) {
      const infoDiv = findOne(root, 'div.info');
      if (infoDiv && infoDiv.childNodes) {
        for (const child of infoDiv.childNodes) {
          if (child.tagName === 'h3' && getText(child).includes('Author:')) {
            if (child.nextSibling) {
              const authorLink = findOne(child.nextSibling, 'a');
              if (authorLink) author = getText(authorLink);
            }
            break;
          }
        }
      }
    } else if (isFreeWebNovel) {
      const authorLink = findOne(root, 'div.item div.right a.a1');
      if (authorLink) author = getText(authorLink);
    }
    
    // Extract synopsis
    let synopsis = 'No summary available.';
    
    if (isReadNovelFull) {
      const descDiv = findOne(root, 'div[itemprop="description"]');
      if (descDiv) {
        const paragraphs = findAll(descDiv, 'p');
        if (paragraphs.length > 0) {
          const texts = paragraphs.map(p => getText(p)).filter(t => t.length > 0);
          synopsis = texts.join('\n\n');
        } else {
          synopsis = getText(descDiv);
        }
      }
    } else if (isNovelFull) {
      const descDiv = findOne(root, 'div.desc-text');
      if (descDiv) {
        const paragraphs = findAll(descDiv, 'p');
        if (paragraphs.length > 0) {
          const texts = paragraphs.map(p => getText(p)).filter(t => t.length > 0);
          synopsis = texts.join('\n\n');
        } else {
          synopsis = getText(descDiv);
        }
      }
    } else if (isFreeWebNovel) {
      const descDiv = findOne(root, 'div.m-desc');
      if (descDiv) {
        const inner = findOne(descDiv, 'div.inner');
        if (inner) {
          const paragraphs = findAll(inner, 'p');
          if (paragraphs.length > 0) {
            const texts = paragraphs.map(p => getText(p)).filter(t => t.length > 0);
            synopsis = texts.join('\n\n');
          }
        }
      }
    }
    
    // Extract cover URL
    let coverUrl = '';
    
    const picDiv = findOne(root, 'div.pic');
    if (picDiv) {
      const img = findOne(picDiv, 'img');
      if (img) {
        const src = getAttr(img, 'src');
        if (src) coverUrl = ensureAbsoluteUrl(src, url);
      }
    }
    
    if (!coverUrl) {
      const coverDiv = findOne(root, 'div.book');
      if (coverDiv) {
        const img = findOne(coverDiv, 'img');
        if (img) {
          const src = getAttr(img, 'src');
          if (src) coverUrl = ensureAbsoluteUrl(src, url);
        }
      }
    }
    
    // Extract first chapter URL
    let firstChapterUrl: string | null = null;
    
    if (isFreeWebNovel) {
      const ul = findOne(root, 'ul.ul-list5');
      if (ul) {
        const firstLi = ul.childNodes?.find((n: any) => n.tagName === 'li');
        if (firstLi) {
          const firstA = findOne(firstLi, 'a');
          if (firstA) {
            const href = getAttr(firstA, 'href');
            if (href) firstChapterUrl = ensureAbsoluteUrl(href, url);
          }
        }
      }
    } else {
      // Try chapter containers
      const chapterContainer = findOne(root, '#tab-chapters') || findOne(root, '#list-chapter');
      if (chapterContainer) {
        const chapterUl = findOne(chapterContainer, 'ul.list-chapter');
        if (chapterUl) {
          const firstLi = chapterUl.childNodes?.find((n: any) => n.tagName === 'li');
          if (firstLi) {
            const firstA = findOne(firstLi, 'a');
            if (firstA) {
              const href = getAttr(firstA, 'href');
              if (href) firstChapterUrl = ensureAbsoluteUrl(href, url);
            }
          }
        }
      }
      
      // Fallback: find any chapter 1 link
      if (!firstChapterUrl) {
        const allLinks = findAll(root, 'a');
        for (const link of allLinks) {
          const href = getAttr(link, 'href')?.toLowerCase() || '';
          const text = getText(link).toLowerCase();
          if ((href.includes('chapter-1') || href.includes('chapter/1') || text.includes('chapter 1')) &&
              !href.includes('next') && !href.includes('last')) {
            firstChapterUrl = ensureAbsoluteUrl(getAttr(link, 'href'), url);
            break;
          }
        }
      }
    }
    
    console.log('[Scraper] Found first chapter:', firstChapterUrl);
    
    return {
      title,
      author,
      synopsis,
      coverUrl,
      firstChapterUrl
    };
  } catch (error: any) {
    console.error('[Scraper] Error:', error.message);
    throw new Error(`Failed to fetch novel: ${error.message}`);
  }
};

// Chapter fetching
export const directFetchChapter = async (url: string, chapterNum: number): Promise<ChapterData> => {
  console.log('[Scraper] Fetching chapter:', url);
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
      },
      timeout: 15000
    });
    
    const html = response.data;
    const root = parse(html);
    
    // Extract chapter title
    let title = `Chapter ${chapterNum}`;
    const titleSelectors = [
      'h1.chapter-title', 'h2.chapter-title', 'span.chapter-title',
      'h1.chr-title', 'h2.chr-title', 'span.chr-title',
      'h1.entry-title', 'h2.entry-title', 'span.entry-title'
    ];
    
    for (const selector of titleSelectors) {
      const titleElem = findOne(root, selector);
      if (titleElem) {
        const rawTitle = getText(titleElem);
        const cleanTitle = rawTitle.replace(/^Chapter\s*\d+\s*[:\-]*\s*/i, '').trim();
        if (cleanTitle && cleanTitle.length > 0) {
          title = `Chapter ${chapterNum}: ${cleanTitle}`;
        }
        break;
      }
    }
    
    // Extract content (all paragraphs)
    const paragraphs = findAll(root, 'p');
    const validParagraphs: string[] = [];
    
    for (const p of paragraphs) {
      const text = getText(p);
      if (text.length > 5 && !text.toLowerCase().includes('next chapter')) {
        validParagraphs.push(text);
      }
    }
    
    const content = validParagraphs.join('\n\n');
    
    // Find next chapter link
    let nextUrl: string | null = null;
    const allLinks = findAll(root, 'a');
    
    for (const link of allLinks) {
      const text = getText(link).toLowerCase();
      const href = getAttr(link, 'href');
      const classes = getAttr(link, 'class')?.toLowerCase() || '';
      const id = getAttr(link, 'id')?.toLowerCase() || '';
      
      if (href && (text.includes('next') || text.includes('next chapter') ||
                   classes.includes('next') || id.includes('next'))) {
        nextUrl = ensureAbsoluteUrl(href, url);
        break;
      }
    }
    
    return {
      url,
      title,
      content: content || 'No content available.',
      nextUrl
    };
  } catch (error: any) {
    console.error('[Scraper] Error:', error.message);
    throw new Error(`Failed to fetch chapter: ${error.message}`);
  }
};
