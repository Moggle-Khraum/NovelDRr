import axios from 'axios';
// Correct import for react-native-html-parser
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
  if (relativeUrl.startsWith('//')) return `https:${relativeUrl}`;
  try {
    return new URL(relativeUrl, baseUrl).href;
  } catch {
    return relativeUrl;
  }
};

// Safe text extraction helper
const getTextContent = (element: any): string => {
  if (!element) return '';
  if (typeof element.textContent === 'string') return element.textContent.trim();
  if (typeof element.text === 'string') return element.text.trim();
  return '';
};

// Safe attribute extraction helper
const getAttribute = (element: any, attr: string): string => {
  if (!element) return '';
  if (element.getAttribute) return element.getAttribute(attr) || '';
  if (element.attributes && element.attributes[attr]) return element.attributes[attr];
  return '';
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
    
    try {
      if (isReadNovelFull || isNovelFull) {
        const titleElem = doc.querySelector('h3.title, h1.title, .book-title');
        if (titleElem) title = getTextContent(titleElem);
      } else if (isFreeWebNovel) {
        const titleElem = doc.querySelector('h1.novel-title, h1.title');
        if (titleElem) title = getTextContent(titleElem);
      }
    } catch (e) {
      console.log('Title extraction failed, using URL title');
    }
    
    // Extract author
    let author = 'Unknown Author';
    
    try {
      if (isReadNovelFull) {
        const authorSpan = doc.querySelector('span[itemprop="author"]');
        if (authorSpan) {
          const authorMeta = authorSpan.querySelector('meta[itemprop="name"]');
          if (authorMeta) author = getAttribute(authorMeta, 'content') || 'Unknown';
        }
      } else if (isNovelFull) {
        const infoDiv = doc.querySelector('div.info');
        if (infoDiv) {
          const allH3 = infoDiv.querySelectorAll('h3');
          for (let i = 0; i < allH3.length; i++) {
            const h3 = allH3[i];
            const text = getTextContent(h3);
            if (text.includes('Author:')) {
              const nextElement = h3.nextElementSibling;
              if (nextElement) {
                const authorLink = nextElement.querySelector('a');
                if (authorLink) author = getTextContent(authorLink);
              }
              break;
            }
          }
        }
      } else if (isFreeWebNovel) {
        const authorLink = doc.querySelector('div.item div.right a.a1');
        if (authorLink) author = getTextContent(authorLink);
      }
    } catch (e) {
      console.log('Author extraction failed');
    }
    
    // Extract synopsis
    let synopsis = 'No summary available.';
    
    try {
      if (isReadNovelFull) {
        const descDiv = doc.querySelector('div[itemprop="description"]');
        if (descDiv) {
          const paragraphs = descDiv.querySelectorAll('p');
          if (paragraphs && paragraphs.length > 0) {
            const texts: string[] = [];
            for (let i = 0; i < paragraphs.length; i++) {
              const text = getTextContent(paragraphs[i]);
              if (text) texts.push(text);
            }
            synopsis = texts.join('\n\n');
          } else {
            synopsis = getTextContent(descDiv);
          }
        }
      } else if (isNovelFull) {
        const descDiv = doc.querySelector('div.desc-text');
        if (descDiv) {
          const paragraphs = descDiv.querySelectorAll('p');
          if (paragraphs && paragraphs.length > 0) {
            const texts: string[] = [];
            for (let i = 0; i < paragraphs.length; i++) {
              const text = getTextContent(paragraphs[i]);
              if (text) texts.push(text);
            }
            synopsis = texts.join('\n\n');
          } else {
            synopsis = getTextContent(descDiv);
          }
        }
      } else if (isFreeWebNovel) {
        const descDiv = doc.querySelector('div.m-desc');
        if (descDiv) {
          const inner = descDiv.querySelector('div.inner');
          if (inner) {
            const paragraphs = inner.querySelectorAll('p');
            if (paragraphs && paragraphs.length > 0) {
              const texts: string[] = [];
              for (let i = 0; i < paragraphs.length; i++) {
                const text = getTextContent(paragraphs[i]);
                if (text) texts.push(text);
              }
              synopsis = texts.join('\n\n');
            }
          }
        }
      }
    } catch (e) {
      console.log('Synopsis extraction failed');
    }
    
    // Extract cover URL
    let coverUrl = '';
    
    try {
      if (isFreeWebNovel) {
        const img = doc.querySelector('div.pic img');
        if (img) {
          const src = getAttribute(img, 'src');
          if (src) coverUrl = makeAbsoluteUrl(src, url);
        }
      }
      
      if (!coverUrl && (isReadNovelFull || isNovelFull)) {
        const img = doc.querySelector('div.book img');
        if (img) {
          const src = getAttribute(img, 'src');
          if (src) coverUrl = makeAbsoluteUrl(src, url);
        }
      }
    } catch (e) {
      console.log('Cover extraction failed');
    }
    
    // Extract first chapter URL
    let firstChapterUrl: string | null = null;
    
    try {
      if (isFreeWebNovel) {
        const firstLink = doc.querySelector('ul.ul-list5 li:first-child a');
        if (firstLink) {
          const href = getAttribute(firstLink, 'href');
          if (href) firstChapterUrl = makeAbsoluteUrl(href, url);
        }
      } else {
        const chapterContainer = doc.querySelector('#tab-chapters, #list-chapter');
        if (chapterContainer) {
          const firstLink = chapterContainer.querySelector('ul.list-chapter li:first-child a');
          if (firstLink) {
            const href = getAttribute(firstLink, 'href');
            if (href) firstChapterUrl = makeAbsoluteUrl(href, url);
          }
        }
        
        if (!firstChapterUrl) {
          const links = doc.querySelectorAll('a[href*="chapter"]');
          for (let i = 0; i < links.length; i++) {
            const link = links[i];
            const href = getAttribute(link, 'href');
            const text = getTextContent(link).toLowerCase();
            if (href && (text.includes('chapter 1') || href.includes('chapter-1') || href.includes('chapter1'))) {
              firstChapterUrl = makeAbsoluteUrl(href, url);
              break;
            }
          }
        }
      }
    } catch (e) {
      console.log('First chapter extraction failed');
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
    try {
      const titleSelectors = [
        'h1.chapter-title', 'h2.chr-title', 'span.entry-title', '.chapter-title'
      ];
      for (const selector of titleSelectors) {
        const titleElem = doc.querySelector(selector);
        if (titleElem) {
          const rawTitle = getTextContent(titleElem);
          const cleanTitle = rawTitle.replace(/^Chapter\s*\d+\s*[:\-]*\s*/i, '');
          if (cleanTitle && cleanTitle.length > 0) {
            title = `Chapter ${chapterNum}: ${cleanTitle}`;
          }
          break;
        }
      }
    } catch (e) {
      console.log('Title extraction failed');
    }
    
    // Extract content
    let content = '';
    try {
      const paragraphs = doc.querySelectorAll('p');
      if (paragraphs && paragraphs.length > 0) {
        const textParagraphs: string[] = [];
        for (let i = 0; i < paragraphs.length; i++) {
          const text = getTextContent(paragraphs[i]);
          if (text.length > 5 && !text.toLowerCase().includes('next chapter')) {
            textParagraphs.push(text);
          }
        }
        content = textParagraphs.join('\n\n');
      }
    } catch (e) {
      console.log('Content extraction failed');
    }
    
    // Fallback to article content
    if (!content) {
      try {
        const article = doc.querySelector('article, .chapter-content, .content-inner');
        if (article) {
          const paragraphs = article.querySelectorAll('p');
          if (paragraphs && paragraphs.length > 0) {
            const texts: string[] = [];
            for (let i = 0; i < paragraphs.length; i++) {
              const text = getTextContent(paragraphs[i]);
              if (text) texts.push(text);
            }
            content = texts.join('\n\n');
          } else {
            content = getTextContent(article);
          }
        }
      } catch (e) {
        console.log('Article extraction failed');
      }
    }
    
    // Find next chapter URL
    let nextUrl: string | null = null;
    try {
      const links = doc.querySelectorAll('a');
      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const text = getTextContent(link).toLowerCase();
        const href = getAttribute(link, 'href');
        const className = getAttribute(link, 'class') || '';
        const id = getAttribute(link, 'id') || '';
        
        if (href && (text.includes('next') || text.includes('next chapter') || 
                     className.includes('next') || id.includes('next'))) {
          nextUrl = makeAbsoluteUrl(href, url);
          break;
        }
      }
    } catch (e) {
      console.log('Next chapter extraction failed');
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
