import axios from 'axios';
import { decodeHTML } from 'entities';

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

// Helper: Strip HTML tags safely
const stripTags = (html: string): string => {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

// Helper: Decode HTML entities safely
const decodeEntities = (text: string): string => {
  if (!text) return '';
  try {
    return decodeHTML(text);
  } catch {
    return text;
  }
};

// Safe regex match with fallback
const safeMatch = (text: string, pattern: RegExp): string | null => {
  if (!text) return null;
  try {
    const match = text.match(pattern);
    return match ? match[1] : null;
  } catch {
    return null;
  }
};

// Extract title from URL (same as Python)
const extractTitleFromUrl = (url: string): string => {
  try {
    const parsedUrl = new URL(url);
    let path = parsedUrl.pathname;
    if (path.endsWith('.html')) path = path.slice(0, -5);
    
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

const makeAbsoluteUrl = (relativeUrl: string, baseUrl: string): string => {
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

// Create axios instance with HTTP/1.1 preference via headers
const httpClient = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,image/jpeg,image/jpg,image/png,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
  },
});

// Fetch with fallback to proxy for FreeWebNovel
const fetchWithFallback = async (url: string, isFreeWebNovel: boolean): Promise<string> => {
  // For FreeWebNovel, always use proxy to force HTTP/1.1 and bypass blocks
  if (isFreeWebNovel) {
    console.log('[Scraper] FreeWebNovel - using proxy for HTTP/1.1');
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    try {
      const response = await httpClient.get(proxyUrl);
      return response.data;
    } catch (proxyError) {
      console.warn('[Scraper] Proxy failed, trying direct:', proxyError.message);
      // Fallback to direct if proxy fails
      const directResponse = await httpClient.get(url);
      return directResponse.data;
    }
  }
  
  // For other sites, try direct first
  try {
    const response = await httpClient.get(url);
    return response.data;
  } catch (directError) {
    console.warn('[Scraper] Direct fetch failed, trying proxy:', directError.message);
    // Fallback to proxy if direct fails
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const proxyResponse = await httpClient.get(proxyUrl);
    return proxyResponse.data;
  }
};

export const directFetchNovelMeta = async (url: string): Promise<NovelMeta> => {
  console.log('[Scraper] Fetching novel meta from:', url);
  
  try {
    const domainLower = url.toLowerCase();
    const isReadNovelFull = domainLower.includes('readnovelfull');
    const isNovelFull = domainLower.includes('novelfull') && !isReadNovelFull;
    const isFreeWebNovel = domainLower.includes('freewebnovel') || domainLower.includes('bednovel');
    
    // Fetch HTML with appropriate method
    const html = await fetchWithFallback(url, isFreeWebNovel);
    
    // Extract title from URL first (like Python)
    let title = extractTitleFromUrl(url);
    
    // Extract author
    let author = 'Unknown Author';
    
    // Extract synopsis
    let synopsis = 'No summary available.';
    
    // Extract cover URL
    let coverUrl = '';
    
    // Extract first chapter URL
    let firstChapterUrl: string | null = null;
    
    // --- READNOVELFULL & NOVELFULL ---
    if (isReadNovelFull || isNovelFull) {
      // TITLE
      const titleMatch = safeMatch(html, /<h3[^>]*class="title"[^>]*>([^<]+)<\/h3>/i) ||
                         safeMatch(html, /<h1[^>]*class="title"[^>]*>([^<]+)<\/h1>/i) ||
                         safeMatch(html, /<div[^>]*class="book-title"[^>]*>([^<]+)<\/div>/i);
      if (titleMatch) title = decodeEntities(titleMatch);
      
      // AUTHOR
      if (isReadNovelFull) {
        const authorMatch = safeMatch(html, /<span[^>]*itemprop="author"[^>]*>.*?<meta[^>]*itemprop="name"[^>]*content="([^"]+)"/i);
        if (authorMatch) author = decodeEntities(authorMatch);
      }
      if (isNovelFull) {
        const authorMatch = safeMatch(html, /<div[^>]*class="info"[^>]*>.*?<h3[^>]*>Author:<\/h3>\s*<a[^>]*>([^<]+)<\/a>/i);
        if (authorMatch) author = decodeEntities(authorMatch);
      }
      
      // SYNOPSIS
      if (isReadNovelFull) {
        const descMatch = safeMatch(html, /<div[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/div>/i);
        if (descMatch) {
          const paragraphs = descMatch.match(/<p[^>]*>(.*?)<\/p>/gis);
          if (paragraphs) {
            synopsis = paragraphs.map(p => decodeEntities(stripTags(p))).join('\n\n');
          } else {
            synopsis = decodeEntities(stripTags(descMatch));
          }
        }
      }
      if (isNovelFull) {
        const descMatch = safeMatch(html, /<div[^>]*class="desc-text"[^>]*>([\s\S]*?)<\/div>/i);
        if (descMatch) {
          const paragraphs = descMatch.match(/<p[^>]*>(.*?)<\/p>/gis);
          if (paragraphs) {
            synopsis = paragraphs.map(p => decodeEntities(stripTags(p))).join('\n\n');
          } else {
            synopsis = decodeEntities(stripTags(descMatch));
          }
        }
      }
      
      // COVER
      const coverMatch = safeMatch(html, /<div[^>]*class="book"[^>]*>.*?<img[^>]*src="([^"]+)"[^>]*>/i);
      if (coverMatch) coverUrl = makeAbsoluteUrl(coverMatch, url);
      
      // FIRST CHAPTER
      const chapterMatch = safeMatch(html, /<(?:div|ul)[^>]*(?:id="(?:tab-chapters|list-chapter)"|class="list-chapter")[^>]*>.*?<li[^>]*>.*?<a[^>]*href="([^"]+)"/i);
      if (chapterMatch) {
        firstChapterUrl = makeAbsoluteUrl(chapterMatch, url);
      } else {
        const chapterLinkMatch = safeMatch(html, /<a[^>]*href="([^"]*chapter[-/]1[^"]*)"[^>]*>/i);
        if (chapterLinkMatch) firstChapterUrl = makeAbsoluteUrl(chapterLinkMatch, url);
      }
    }
    
    // --- FREEWEBNOVEL (with constructed first chapter and proxy) ---
    if (isFreeWebNovel) {
      console.log('[Scraper] FreeWebNovel detected');
      
      // CONSTRUCT FIRST CHAPTER URL (prevents freezing)
      let baseNovelUrl = url.replace(/\/$/, '');
      if (baseNovelUrl.includes('/chapter-')) {
        baseNovelUrl = baseNovelUrl.split('/chapter-')[0];
      }
      firstChapterUrl = `${baseNovelUrl}/chapter-1`;
      console.log('[Scraper] Constructed first chapter URL:', firstChapterUrl);
      
      // TITLE — h1.tit inside div.m-desc
      const titleMatch = safeMatch(html, /<h1[^>]*class="tit"[^>]*>([^<]+)<\/h1>/i);
      if (titleMatch) title = decodeEntities(titleMatch);
      
      // COVER — div.m-imgtxt > div.pic > img[src]
      const coverMatch = safeMatch(html, /<div[^>]*class="pic"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*>/i);
      if (coverMatch) coverUrl = makeAbsoluteUrl(coverMatch, url);
      
      // AUTHOR — div.item > div.right > a.a1
      const authorMatch = safeMatch(html, /<div[^>]*class="item"[^>]*>[\s\S]*?<div[^>]*class="right"[^>]*>[\s\S]*?<a[^>]*class="a1"[^>]*>([^<]+)<\/a>/i);
      if (authorMatch) author = decodeEntities(authorMatch);
      
      // SYNOPSIS — div.m-desc > div.txt > div.inner > p
      const txtMatch = safeMatch(html, /<div[^>]*class="m-desc[^"]*"[^>]*>[\s\S]*?<div[^>]*class="txt"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
      if (txtMatch) {
        const innerMatch = safeMatch(txtMatch, /<div[^>]*class="inner"[^>]*>([\s\S]*?)<\/div>/i);
        if (innerMatch) {
          const paragraphs = innerMatch.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
          if (paragraphs) {
            synopsis = paragraphs.map(p => decodeEntities(stripTags(p))).filter(t => t.length > 0).join('\n\n');
          }
        }
      }
    }

    console.log('[Scraper] Found first chapter:', firstChapterUrl);
    
    return {
      title: decodeEntities(title),
      author: decodeEntities(author),
      synopsis: decodeEntities(synopsis),
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
    const isFreeWebNovel = url.toLowerCase().includes('freewebnovel');
    const html = await fetchWithFallback(url, isFreeWebNovel);
    
    // Extract chapter title
    let title = `Chapter ${chapterNum}`;
    const titleMatch = safeMatch(html, /<(?:h1|h2|span)[^>]*(?:class="(?:chapter-title|chr-title|entry-title)")[^>]*>([^<]+)</i);
    if (titleMatch) {
      const rawTitle = stripTags(titleMatch);
      const cleanTitle = rawTitle.replace(/^Chapter\s*\d+\s*[:\-]*\s*/i, '').trim();
      if (cleanTitle) title = `Chapter ${chapterNum}: ${cleanTitle}`;
    }
    
    // Extract content
    // FreeWebNovel wraps content in a specific container — target it first (mirrors Python)
    let paragraphMatches: string[] | null = null;
    if (isFreeWebNovel) {
      const containerMatch = html.match(/<div[^>]*class="chapter-content"[^>]*>([\s\S]*?)<\/div>/i) ||
                             html.match(/<div[^>]*id="chapter-container"[^>]*>([\s\S]*?)<\/div>/i);
      if (containerMatch) {
        paragraphMatches = containerMatch[1].match(/<p[^>]*>([\s\S]*?)<\/p>/gis);
      }
    }
    // Fallback for all sites: grab all <p> tags
    if (!paragraphMatches) {
      paragraphMatches = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gis);
    }

    const validParagraphs: string[] = [];
    
    if (paragraphMatches) {
      for (const p of paragraphMatches) {
        let text = stripTags(p);
        text = decodeEntities(text);
        if (text.length > 5 && 
            !text.toLowerCase().includes('next chapter') &&
            !text.toLowerCase().includes('previous chapter') &&
            !text.toLowerCase().includes('back to') &&
            !text.toLowerCase().includes('table of contents')) {
          validParagraphs.push(text);
        }
      }
    }
    
    let content = validParagraphs.join('\n\n');
    
    // If no paragraphs found, try content containers
    if (!content) {
      const contentMatch = safeMatch(html, /<div[^>]*class="chapter-content"[^>]*>([\s\S]*?)<\/div>/i) ||
                           safeMatch(html, /<div[^>]*class="content"[^>]*>([\s\S]*?)<\/div>/i) ||
                           safeMatch(html, /<div[^>]*id="chapter-content"[^>]*>([\s\S]*?)<\/div>/i) ||
                           safeMatch(html, /<article[^>]*>([\s\S]*?)<\/article>/i);
      if (contentMatch) {
        const innerParagraphs = contentMatch.match(/<p[^>]*>(.*?)<\/p>/gis);
        if (innerParagraphs) {
          const texts: string[] = [];
          for (const p of innerParagraphs) {
            let text = stripTags(p);
            text = decodeEntities(text);
            if (text.length > 5) texts.push(text);
          }
          content = texts.join('\n\n');
        } else {
          content = decodeEntities(stripTags(contentMatch));
        }
      }
    }
    
    // Find next chapter URL - exact Python translation with safe regex
    let nextUrl: string | null = null;
    
    const linkRegex = /<a\s+[^>]*href="([^"]+)"[^>]*>.*?<\/a>/gi;
    let linkMatch;
    
    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const fullLink = linkMatch[0];
      const href = linkMatch[1];
      
      // Extract text content safely
      const textMatch = fullLink.match(/>([^<]*)</);
      const txt = textMatch ? textMatch[1].toLowerCase() : '';
      
      // Extract class attribute safely
      const classMatch = fullLink.match(/class=["']([^"']*)["']/i);
      const classAttr = classMatch ? classMatch[1].toLowerCase() : '';
      
      // Extract id attribute safely
      const idMatch = fullLink.match(/id=["']([^"']*)["']/i);
      const idAttr = idMatch ? idMatch[1].toLowerCase() : '';
      
      const attrs = classAttr + idAttr;
      
      if ((txt.includes('next') || txt.includes('next chapter') || 
           attrs.includes('next') || attrs.includes('next_chapter')) && href) {
        nextUrl = makeAbsoluteUrl(href, url);
        console.log('[Scraper] Found next chapter:', nextUrl);
        break;
      }
    }
    
    if (!nextUrl) {
      console.log('[Scraper] No next chapter found.');
    }
    
    return {
      url,
      title: decodeEntities(title),
      content: content || 'No content available.',
      nextUrl
    };
  } catch (error: any) {
    console.error('[Scraper] Error:', error.message);
    throw new Error(`Failed to fetch chapter: ${error.message}`);
  }
};

/**
 * Downloads all chapters of a novel by following the "next chapter" links.
 * Saves each chapter as soon as it's fetched, allowing incremental progress.
 *
 * @param startUrl - URL of the first chapter (e.g., from `firstChapterUrl`)
 * @param novelId - Unique identifier for the novel (used in the save callback)
 * @param saveChapter - Async function to store a chapter: (novelId, chapterIndex, title, content) => Promise<void>
 * @param onProgress - Optional callback for progress updates: (chapterNumber, title) => void
 * @param delayMs - Milliseconds to wait between chapter requests (default 500)
 * @returns Promise that resolves when all chapters are downloaded
 */
export async function downloadNovelByCrawling(
  startUrl: string,
  novelId: string,
  saveChapter: (novelId: string, chapterIndex: number, title: string, content: string) => Promise<void>,
  onProgress?: (chapterNumber: number, title: string) => void,
  delayMs: number = 500
): Promise<void> {
  let currentUrl: string | null = startUrl;
  let chapterNumber = 1;

  while (currentUrl) {
    console.log(`[Downloader] Fetching chapter ${chapterNumber} from ${currentUrl}`);

    try {
      const chapter = await directFetchChapter(currentUrl, chapterNumber);
      // Save the chapter with its extracted title (e.g., "Chapter 1: My Life...")
      await saveChapter(novelId, chapterNumber, chapter.title, chapter.content);

      if (onProgress) {
        onProgress(chapterNumber, chapter.title);
      }

      // Move to the next chapter
      currentUrl = chapter.nextUrl;
      chapterNumber++;

      // Be polite: avoid hammering the server
      if (delayMs > 0 && currentUrl) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (error: any) {
      console.error(`[Downloader] Failed at chapter ${chapterNumber}:`, error.message);
      // You could retry or abort; here we throw to let the caller decide
      throw new Error(`Download failed at chapter ${chapterNumber}: ${error.message}`);
    }
  }

  console.log(`[Downloader] Completed. Total chapters: ${chapterNumber - 1}`);
}

