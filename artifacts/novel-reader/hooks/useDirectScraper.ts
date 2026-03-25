// hooks/useDirectScraper.ts
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

// Helper functions (mirroring Python helpers)
const ensureAbsoluteUrl = (url: string, baseUrl: string): string => {
  if (!url) return baseUrl;
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) {
    try {
      const parsed = new URL(baseUrl);
      return `${parsed.protocol}//${parsed.host}${url}`;
    } catch {
      return url;
    }
  }
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
};

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

// Direct translation of Python's _get_first_chapter_url
const getFirstChapterUrl = (doc: any, baseUrl: string): string | null => {
  // 1. Target the Specific Chapter List Containers (ReadNovelFull)
  const chapterContainer = doc.querySelector('#tab-chapters, #list-chapter');
  
  if (chapterContainer) {
    const chapterUl = chapterContainer.querySelector('ul.list-chapter');
    if (chapterUl) {
      const firstLi = chapterUl.querySelector('li');
      if (firstLi) {
        const firstA = firstLi.querySelector('a');
        if (firstA && firstA.getAttribute('href')) {
          return ensureAbsoluteUrl(firstA.getAttribute('href'), baseUrl);
        }
      }
    }
  }
  
  // 2. Method: Table-based lists (Fallback)
  const chapterTable = doc.querySelector('table#chapters');
  if (chapterTable) {
    const firstLink = chapterTable.querySelector('a');
    if (firstLink && firstLink.getAttribute('href')) {
      return ensureAbsoluteUrl(firstLink.getAttribute('href'), baseUrl);
    }
  }
  
  // 3. Method: "Brute Force" Keyword Search
  const allLinks = doc.querySelectorAll('a');
  for (let i = 0; i < allLinks.length; i++) {
    const link = allLinks[i];
    const href = link.getAttribute('href')?.toLowerCase() || '';
    const text = link.textContent?.toLowerCase() || '';
    
    if ((href.includes('chapter-1') || href.includes('chapter-01') || href.includes('chapter1') ||
         text.includes('chapter 1') || text.includes('chapter1')) &&
        !href.includes('next') && !href.includes('last')) {
      return ensureAbsoluteUrl(link.getAttribute('href'), baseUrl);
    }
  }
  
  return null;
};

// Direct translation of Python's get_first_chapter for FreeWebNovel
const getFreeWebNovelFirstChapter = (doc: any, baseUrl: string): string | null => {
  const ul = doc.querySelector('ul.ul-list5');
  if (!ul) return null;
  
  const firstLi = ul.querySelector('li');
  if (!firstLi) return null;
  
  const firstA = firstLi.querySelector('a');
  if (!firstA) return null;
  
  const href = firstA.getAttribute('href');
  return href ? ensureAbsoluteUrl(href, baseUrl) : null;
};

// Direct translation of Python's chapter title extraction
const extractChapterTitle = (doc: any, chapterNum: number): string => {
  let displayTitle = `Chapter ${chapterNum}`;
  
  // Look for title in h1, h2, or span with chapter-related classes
  const titleSelectors = [
    'h1.chapter-title', 'h2.chapter-title', 'span.chapter-title',
    'h1.chr-title', 'h2.chr-title', 'span.chr-title',
    'h1.entry-title', 'h2.entry-title', 'span.entry-title'
  ];
  
  for (const selector of titleSelectors) {
    const titleTag = doc.querySelector(selector);
    if (titleTag) {
      const rawName = titleTag.textContent?.trim() || '';
      const cleanName = rawName.replace(/^Chapter\s*\d+\s*[:\-]*\s*/i, '').trim();
      if (cleanName) {
        displayTitle = `Chapter ${chapterNum}: ${cleanName}`;
      }
      break;
    }
  }
  
  return displayTitle;
};

// Direct translation of Python's content extraction
const extractChapterContent = (doc: any): string => {
  const paragraphs = doc.querySelectorAll('p');
  const validParagraphs: string[] = [];
  
  for (let i = 0; i < paragraphs.length; i++) {
    const text = paragraphs[i].textContent?.trim() || '';
    // Filter out short paragraphs (likely navigation elements)
    if (text.length > 5 && !text.toLowerCase().includes('next chapter')) {
      validParagraphs.push(text);
    }
  }
  
  return validParagraphs.join('\n\n');
};

// Direct translation of Python's next chapter link finding
const findNextChapterLink = (doc: any, currentUrl: string): string | null => {
  const allLinks = doc.querySelectorAll('a');
  
  for (let i = 0; i < allLinks.length; i++) {
    const link = allLinks[i];
    const text = link.textContent?.toLowerCase() || '';
    const href = link.getAttribute('href') || '';
    const classes = link.getAttribute('class')?.toLowerCase() || '';
    const id = link.getAttribute('id')?.toLowerCase() || '';
    
    if ((text.includes('next') || text.includes('next chapter') ||
         classes.includes('next') || id.includes('next')) && href) {
      return ensureAbsoluteUrl(href, currentUrl);
    }
  }
  
  return null;
};

// Main novel meta extraction (translated from Python)
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
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    const domainLower = url.toLowerCase();
    const isReadNovelFull = domainLower.includes('readnovelfull');
    const isNovelFull = domainLower.includes('novelfull') && !isReadNovelFull;
    const isFreeWebNovel = domainLower.includes('freewebnovel');
    
    // Extract title from URL first (like Python)
    let title = extractTitleFromUrl(url);
    
    // Try to get title from page if available
    if (isReadNovelFull || isNovelFull) {
      const titleElem = doc.querySelector('h3.title, h1.title, .book-title');
      if (titleElem) title = titleElem.textContent?.trim() || title;
    } else if (isFreeWebNovel) {
      const titleElem = doc.querySelector('h1.novel-title, h1.title');
      if (titleElem) title = titleElem.textContent?.trim() || title;
    }
    
    // Extract author (translated from Python)
    let author = 'Unknown Author';
    
    if (isReadNovelFull) {
      const authorSpan = doc.querySelector('span[itemprop="author"]');
      if (authorSpan) {
        const authorMeta = authorSpan.querySelector('meta[itemprop="name"]');
        if (authorMeta) author = authorMeta.getAttribute('content') || 'Unknown';
      }
    } else if (isNovelFull) {
      const infoDiv = doc.querySelector('div.info');
      if (infoDiv) {
        const h3Elements = infoDiv.querySelectorAll('h3');
        for (let i = 0; i < h3Elements.length; i++) {
          const h3 = h3Elements[i];
          if (h3.textContent?.includes('Author:')) {
            const authorLink = h3.nextElementSibling?.querySelector('a');
            if (authorLink) author = authorLink.textContent?.trim() || 'Unknown';
            break;
          }
        }
      }
    } else if (isFreeWebNovel) {
      const authorItem = doc.querySelector('div.item');
      if (authorItem) {
        const authorLink = authorItem.querySelector('div.right a.a1');
        if (authorLink) author = authorLink.textContent?.trim() || 'Unknown';
      }
    }
    
    // Extract synopsis (translated from Python)
    let synopsis = 'No summary available.';
    
    if (isReadNovelFull) {
      const descDiv = doc.querySelector('div[itemprop="description"]');
      if (descDiv) {
        const paragraphs = descDiv.querySelectorAll('p');
        if (paragraphs.length > 0) {
          const texts: string[] = [];
          for (let i = 0; i < paragraphs.length; i++) {
            const text = paragraphs[i].textContent?.trim() || '';
            if (text) texts.push(text);
          }
          synopsis = texts.join('\n\n');
        } else {
          synopsis = descDiv.textContent?.trim() || synopsis;
        }
      }
    } else if (isNovelFull) {
      const descDiv = doc.querySelector('div.desc-text');
      if (descDiv) {
        const paragraphs = descDiv.querySelectorAll('p');
        if (paragraphs.length > 0) {
          const texts: string[] = [];
          for (let i = 0; i < paragraphs.length; i++) {
            const text = paragraphs[i].textContent?.trim() || '';
            if (text) texts.push(text);
          }
          synopsis = texts.join('\n\n');
        } else {
          synopsis = descDiv.textContent?.trim() || synopsis;
        }
      }
    } else if (isFreeWebNovel) {
      const descDiv = doc.querySelector('div.m-desc');
      if (descDiv) {
        const inner = descDiv.querySelector('div.inner');
        if (inner) {
          const paragraphs = inner.querySelectorAll('p');
          if (paragraphs.length > 0) {
            const texts: string[] = [];
            for (let i = 0; i < paragraphs.length; i++) {
              const text = paragraphs[i].textContent?.trim() || '';
              if (text) texts.push(text);
            }
            synopsis = texts.join('\n\n');
          }
        }
      }
    }
    
    // Extract cover image (translated from Python)
    let coverUrl = '';
    let imgUrl = null;
    
    // FreeWebNovel cover
    const picDiv = doc.querySelector('div.pic');
    if (picDiv) {
      const imgTag = picDiv.querySelector('img');
      if (imgTag && imgTag.getAttribute('src')) {
        imgUrl = imgTag.getAttribute('src');
      }
    }
    
    // ReadNovelFull/NovelFull cover
    if (!imgUrl) {
      const coverDiv = doc.querySelector('div.book');
      if (coverDiv) {
        const imgTag = coverDiv.querySelector('img');
        if (imgTag && imgTag.getAttribute('src')) {
          imgUrl = imgTag.getAttribute('src');
        }
      }
    }
    
    if (imgUrl) coverUrl = ensureAbsoluteUrl(imgUrl, url);
    
    // Get first chapter URL (translated from Python)
    let firstChapterUrl: string | null = null;
    
    if (isFreeWebNovel) {
      firstChapterUrl = getFreeWebNovelFirstChapter(doc, url);
    } else {
      firstChapterUrl = getFirstChapterUrl(doc, url);
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

// Chapter fetching (translated from Python's download loop)
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
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    // Extract chapter title (like Python)
    const title = extractChapterTitle(doc, chapterNum);
    
    // Extract content (like Python)
    const content = extractChapterContent(doc);
    
    // Find next chapter link (like Python)
    const nextUrl = findNextChapterLink(doc, url);
    
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
