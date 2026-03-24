import axios from 'axios';
import { DOMParser } from 'react-native-html-parser';

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

// Helper to extract title from URL
const extractTitleFromUrl = (url: string): string => {
  try {
    const parsedUrl = new URL(url);
    const path = parsedUrl.pathname;
    
    let cleanPath = path;
    if (cleanPath.endsWith('.html')) {
      cleanPath = cleanPath.slice(0, -5);
    }
    
    const pathParts = cleanPath.split('/').filter(part => part);
    
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

const makeAbsoluteUrl = (relativeUrl: string, baseUrl: string): string => {
  if (!relativeUrl) return baseUrl;
  if (relativeUrl.startsWith('http')) return relativeUrl;
  try {
    return new URL(relativeUrl, baseUrl).href;
  } catch {
    return relativeUrl;
  }
};

// Helper to get text content from element
const getText = (element: any): string => {
  if (!element) return '';
  return element.textContent?.trim() || '';
};

// Helper to get attribute value
const getAttr = (element: any, attr: string): string => {
  if (!element) return '';
  return element.getAttribute(attr) || '';
};

// Helper to find first element matching selector
const findElement = (doc: any, selector: string): any => {
  if (!doc) return null;
  return doc.querySelector(selector);
};

// Helper to find all elements matching selector
const findElements = (doc: any, selector: string): any[] => {
  if (!doc) return [];
  const elements: any[] = [];
  const results = doc.querySelectorAll(selector);
  for (let i = 0; i < results.length; i++) {
    elements.push(results[i]);
  }
  return elements;
};

export const directFetchNovelMeta = async (url: string): Promise<NovelMeta> => {
  console.log('[Scraper] Fetching novel meta from:', url);
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    });
    
    const html = response.data;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    const domainLower = url.toLowerCase();
    const isReadNovelFull = domainLower.includes('readnovelfull');
    const isNovelFull = domainLower.includes('novelfull') && !isReadNovelFull;
    const isFreeWebNovel = domainLower.includes('freewebnovel');
    
    // Extract title
    let title = extractTitleFromUrl(url);
    
    if (isReadNovelFull || isNovelFull) {
      const titleElem = findElement(doc, 'h3.title, h1.title, .book-title');
      if (titleElem) title = getText(titleElem);
    } else if (isFreeWebNovel) {
      const titleElem = findElement(doc, 'h1.novel-title, h1.title');
      if (titleElem) title = getText(titleElem);
    }
    
    // Extract author
    let author = 'Unknown Author';
    
    if (isReadNovelFull) {
      const authorSpan = findElement(doc, 'span[itemprop="author"]');
      if (authorSpan) {
        const authorMeta = findElement(authorSpan, 'meta[itemprop="name"]');
        if (authorMeta) author = getAttr(authorMeta, 'content') || 'Unknown';
      }
    } else if (isNovelFull) {
      const infoDiv = findElement(doc, 'div.info');
      if (infoDiv) {
        const authorH3 = findElement(infoDiv, 'h3');
        if (authorH3 && getText(authorH3).includes('Author:')) {
          const authorLink = authorH3.nextSibling;
          if (authorLink && authorLink.querySelector) {
            const link = findElement(authorLink, 'a');
            if (link) author = getText(link);
          }
        }
      }
    } else if (isFreeWebNovel) {
      const authorItem = findElement(doc, 'div.item');
      if (authorItem) {
        const authorLink = findElement(authorItem, 'div.right a.a1');
        if (authorLink) author = getText(authorLink);
      }
    }
    
    // Extract synopsis
    let synopsis = 'No summary available.';
    
    if (isReadNovelFull) {
      const descDiv = findElement(doc, 'div[itemprop="description"]');
      if (descDiv) {
        const paragraphs = findElements(descDiv, 'p');
        if (paragraphs.length > 0) {
          const texts = paragraphs.map((p: any) => getText(p));
          synopsis = texts.filter((t: string) => t.length > 0).join('\n\n');
        } else {
          synopsis = getText(descDiv);
        }
      }
    } else if (isNovelFull) {
      const descDiv = findElement(doc, 'div.desc-text');
      if (descDiv) {
        const paragraphs = findElements(descDiv, 'p');
        if (paragraphs.length > 0) {
          const texts = paragraphs.map((p: any) => getText(p));
          synopsis = texts.filter((t: string) => t.length > 0).join('\n\n');
        } else {
          synopsis = getText(descDiv);
        }
      }
    } else if (isFreeWebNovel) {
      const descDiv = findElement(doc, 'div.m-desc');
      if (descDiv) {
        const inner = findElement(descDiv, 'div.inner');
        if (inner) {
          const paragraphs = findElements(inner, 'p');
          if (paragraphs.length > 0) {
            const texts = paragraphs.map((p: any) => getText(p));
            synopsis = texts.filter((t: string) => t.length > 0).join('\n\n');
          }
        }
      }
    }
    
    // Extract cover URL
    let coverUrl = '';
    
    if (isFreeWebNovel) {
      const picDiv = findElement(doc, 'div.pic');
      if (picDiv) {
        const imgTag = findElement(picDiv, 'img');
        if (imgTag) {
          const src = getAttr(imgTag, 'src');
          if (src) coverUrl = makeAbsoluteUrl(src, url);
        }
      }
    }
    
    if (!coverUrl && (isReadNovelFull || isNovelFull)) {
      const coverDiv = findElement(doc, 'div.book');
      if (coverDiv) {
        const imgTag = findElement(coverDiv, 'img');
        if (imgTag) {
          const src = getAttr(imgTag, 'src');
          if (src) coverUrl = makeAbsoluteUrl(src, url);
        }
      }
    }
    
    // Extract first chapter URL
    let firstChapterUrl: string | null = null;
    
    if (isFreeWebNovel) {
      const ul = findElement(doc, 'ul.ul-list5');
      if (ul) {
        const firstLi = findElement(ul, 'li:first-child');
        if (firstLi) {
          const firstA = findElement(firstLi, 'a');
          if (firstA) {
            const href = getAttr(firstA, 'href');
            if (href) firstChapterUrl = makeAbsoluteUrl(href, url);
          }
        }
      }
    } else {
      const chapterContainer = findElement(doc, '#tab-chapters, #list-chapter');
      if (chapterContainer) {
        const chapterUl = findElement(chapterContainer, 'ul.list-chapter');
        if (chapterUl) {
          const firstLi = findElement(chapterUl, 'li:first-child');
          if (firstLi) {
            const firstA = findElement(firstLi, 'a');
            if (firstA) {
              const href = getAttr(firstA, 'href');
              if (href) firstChapterUrl = makeAbsoluteUrl(href, url);
            }
          }
        }
      }
      
      if (!firstChapterUrl) {
        const chapterLinks = findElements(doc, 'a[href*="chapter"]');
        for (const link of chapterLinks) {
          const href = getAttr(link, 'href');
          const text = getText(link).toLowerCase();
          if (href && (text.includes('chapter 1') || href.includes('chapter-1') || href.includes('chapter1'))) {
            firstChapterUrl = makeAbsoluteUrl(href, url);
            break;
          }
        }
      }
    }
    
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

export const directFetchChapter = async (url: string, chapterNum: number): Promise<ChapterData> => {
  console.log('[Scraper] Fetching chapter:', url);
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    });
    
    const html = response.data;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    // Extract chapter title
    let title = `Chapter ${chapterNum}`;
    const titleTag = findElement(doc, 'h1.chapter-title, h2.chr-title, span.entry-title, .chapter-title');
    if (titleTag) {
      const rawTitle = getText(titleTag);
      const cleanTitle = rawTitle.replace(/^Chapter\s*\d+\s*[:\-]*\s*/i, '');
      if (cleanTitle && cleanTitle.length > 0) {
        title = `Chapter ${chapterNum}: ${cleanTitle}`;
      }
    }
    
    // Extract content
    let content = '';
    const paragraphs = findElements(doc, 'p');
    
    if (paragraphs.length > 0) {
      const textParagraphs: string[] = [];
      for (const p of paragraphs) {
        const text = getText(p);
        if (text.length > 5 && !text.toLowerCase().includes('next chapter')) {
          textParagraphs.push(text);
        }
      }
      content = textParagraphs.join('\n\n');
    }
    
    // Fallback to article content
    if (!content) {
      const article = findElement(doc, 'article, .chapter-content, .content-inner');
      if (article) {
        const articleParagraphs = findElements(article, 'p');
        if (articleParagraphs.length > 0) {
          const texts = articleParagraphs.map((p: any) => getText(p));
          content = texts.filter((t: string) => t.length > 0).join('\n\n');
        } else {
          content = getText(article);
        }
      }
    }
    
    // Find next chapter URL
    let nextUrl: string | null = null;
    const nextLinks = findElements(doc, 'a');
    
    for (const link of nextLinks) {
      const text = getText(link).toLowerCase();
      const href = getAttr(link, 'href');
      const classes = getAttr(link, 'class') || '';
      const id = getAttr(link, 'id') || '';
      
      if (href && (text.includes('next') || text.includes('next chapter') || 
                   classes.includes('next') || id.includes('next'))) {
        nextUrl = makeAbsoluteUrl(href, url);
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
