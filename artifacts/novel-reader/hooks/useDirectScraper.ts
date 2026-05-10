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

// Extract title from URL
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

// Create axios instance
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

// Fetch with fallback to proxy
const fetchWithFallback = async (url: string, isFreeWebNovel: boolean): Promise<string> => {
  if (isFreeWebNovel) {
    console.log('[Scraper] FreeWebNovel - using proxy for HTTP/1.1');
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    try {
      const response = await httpClient.get(proxyUrl);
      return response.data;
    } catch (proxyError) {
      console.warn('[Scraper] Proxy failed, trying direct:', proxyError.message);
      const directResponse = await httpClient.get(url);
      return directResponse.data;
    }
  }
  
  try {
    const response = await httpClient.get(url);
    return response.data;
  } catch (directError) {
    console.warn('[Scraper] Direct fetch failed, trying proxy:', directError.message);
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const proxyResponse = await httpClient.get(proxyUrl);
    return proxyResponse.data;
  }
};

// NEW: Robust synopsis extraction with multiple fallbacks
const extractSynopsis = (
  html: string,
  siteType: {
    isReadNovelFull: boolean;
    isNovelFull: boolean;
    isFreeWebNovel: boolean;
    isNovelBin: boolean;
    isLightNovelWorld: boolean;
  }
): string => {
  const { isReadNovelFull, isNovelFull, isFreeWebNovel, isNovelBin, isLightNovelWorld } = siteType;
  let synopsis = '';

  // Define patterns for each site type
  const patterns: RegExp[] = [];

  if (isReadNovelFull) {
    patterns.push(
      /<div[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="desc-text"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*id="description"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="summary"[^>]*>([\s\S]*?)<\/div>/i
    );
  }

  if (isNovelFull) {
    patterns.push(
      /<div[^>]*class="desc-text"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="summary"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*id="description"[^>]*>([\s\S]*?)<\/div>/i
    );
  }

  if (isFreeWebNovel) {
    patterns.push(
      /<div[^>]*class="inner"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="description"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*id="description"[^>]*>([\s\S]*?)<\/div>/i
    );
  }

  if (isNovelBin) {
    patterns.push(
      /<div[^>]*class="desc-text"[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*itemprop="description"[^>]*class="desc-text"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="summary"[^>]*>([\s\S]*?)<\/div>/i
    );
  }

  if (isLightNovelWorld) {
    patterns.push(
      /<div[^>]*class="summary-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="description"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*id="description"[^>]*>([\s\S]*?)<\/div>/i
    );
  }

  // Try each pattern
  for (const pattern of patterns) {
    const match = safeMatch(html, pattern);
    if (match) {
      // Try to extract paragraphs first
      const paragraphs = match.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
      if (paragraphs && paragraphs.length > 0) {
        const text = paragraphs
          .map(p => decodeEntities(stripTags(p)))
          .filter(t => t.length > 20)
          .join('\n\n');
        if (text.length > 50) {
          synopsis = text;
          break;
        }
      } else {
        const text = decodeEntities(stripTags(match));
        if (text.length > 50) {
          synopsis = text;
          break;
        }
      }
    }
  }

  // If still empty, check meta tags
  if (!synopsis) {
    const metaPatterns = [
      /<meta[^>]*name="description"[^>]*content="([^"]+)"/i,
      /<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i,
      /<meta[^>]*name="twitter:description"[^>]*content="([^"]+)"/i,
    ];
    for (const pattern of metaPatterns) {
      const match = safeMatch(html, pattern);
      if (match && match.length > 50) {
        synopsis = decodeEntities(stripTags(match));
        break;
      }
    }
  }

  // Final fallback: look for any longer text block (intelligent guess)
  if (!synopsis) {
    const bodyText = stripTags(html);
    const sentences = bodyText.match(/[^.!?]+[.!?]/g);
    if (sentences && sentences.length >= 4) {
      const candidate = sentences.slice(0, 6).join(' ');
      if (candidate.length > 100 && candidate.length < 2000) {
        synopsis = candidate;
      }
    }
  }

  // Cleanup
  if (synopsis) {
    synopsis = synopsis
      .replace(/Read\s+[\w\s]+\s+online\s+for\s+free/gi, '')
      .replace(/©\s+\d{4}\s+[\w\s]+/gi, '')
      .replace(/All\s+rights\s+reserved/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return synopsis || 'No summary available.';
};

export const directFetchNovelMeta = async (url: string): Promise<NovelMeta> => {
  console.log('[Scraper] Fetching novel meta from:', url);
  
  try {
    const domainLower = url.toLowerCase();
    const isReadNovelFull = domainLower.includes('readnovelfull');
    const isNovelFull = domainLower.includes('novelfull') && !isReadNovelFull;
    const isNovelFullCom = domainLower.includes('novelfull.com');
    const isAllNovel = domainLower.includes('allnovel.org');
    const isNovgo = domainLower.includes('novgo.net');
    const isFreeWebNovel = domainLower.includes('freewebnovel') || domainLower.includes('bednovel');
    const isNovelBin = domainLower.includes('novelbin');
    const isLightNovelWorld = domainLower.includes('lightnovelworld');
    
    const html = await fetchWithFallback(url, isFreeWebNovel);
    
    let title = extractTitleFromUrl(url);
    let author = 'Unknown Author';
    let coverUrl = '';
    let firstChapterUrl: string | null = null;
    
    // Extract synopsis using the robust helper
    const synopsis = extractSynopsis(html, {
      isReadNovelFull,
      isNovelFull: isNovelFull || isNovelFullCom || isAllNovel || isNovgo,
      isFreeWebNovel,
      isNovelBin,
      isLightNovelWorld,
    });
    
    // --- Site-specific metadata extraction ---
    if (isReadNovelFull || isNovelFull || isNovelFullCom || isAllNovel || isNovgo) {
      const titleMatch = safeMatch(html, /<h3[^>]*class="title"[^>]*>([^<]+)<\/h3>/i) ||
                         safeMatch(html, /<h1[^>]*class="title"[^>]*>([^<]+)<\/h1>/i) ||
                         safeMatch(html, /<div[^>]*class="book-title"[^>]*>([^<]+)<\/div>/i);
      if (titleMatch) title = decodeEntities(titleMatch);
      
      if (isReadNovelFull) {
        const authorMatch = safeMatch(html, /<span[^>]*itemprop="author"[^>]*>.*?<meta[^>]*itemprop="name"[^>]*content="([^"]+)"/i);
        if (authorMatch) author = decodeEntities(authorMatch);
      }
      if (isNovelFull || isNovelFullCom || isAllNovel || isNovgo) {
        const authorMatch = safeMatch(html, /<div[^>]*class="info"[^>]*>[\s\S]*?<h3>Author:<\/h3>\s*<a[^>]*>([^<]+)<\/a>/i);
        if (authorMatch) author = decodeEntities(authorMatch);
      }
      
      const coverMatch = safeMatch(html, /<div[^>]*class="book"[^>]*>.*?<img[^>]*src="([^"]+)"[^>]*>/i);
      if (coverMatch) coverUrl = makeAbsoluteUrl(coverMatch, url);
      
      const chapterMatch = safeMatch(html, /<(?:div|ul)[^>]*(?:id="(?:tab-chapters|list-chapter)"|class="list-chapter")[^>]*>.*?<li[^>]*>.*?<a[^>]*href="([^"]+)"/i);
      if (chapterMatch) {
        firstChapterUrl = makeAbsoluteUrl(chapterMatch, url);
      } else {
        const chapterLinkMatch = safeMatch(html, /<a[^>]*href="([^"]*chapter[-/]1[^"]*)"[^>]*>/i);
        if (chapterLinkMatch) firstChapterUrl = makeAbsoluteUrl(chapterLinkMatch, url);
      }
    }
    
    if (isFreeWebNovel) {
      console.log('[Scraper] FreeWebNovel detected');
      
      let baseNovelUrl = url.replace(/\/$/, '');
      if (baseNovelUrl.includes('/chapter-')) {
        baseNovelUrl = baseNovelUrl.split('/chapter-')[0];
      }
      firstChapterUrl = `${baseNovelUrl}/chapter-1`;
      
      const titleMatch = safeMatch(html, /<h1[^>]*class="tit"[^>]*>([^<]+)<\/h1>/i);
      if (titleMatch) title = decodeEntities(titleMatch);
      
      const coverMatch = safeMatch(html, /<div[^>]*class="pic"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*>/i);
      if (coverMatch) coverUrl = makeAbsoluteUrl(coverMatch, url);
      
      const authorMatch = safeMatch(html, /<div[^>]*class="item"[^>]*>[\s\S]*?<div[^>]*class="right"[^>]*>[\s\S]*?<a[^>]*class="a1"[^>]*>([^<]+)<\/a>/i);
      if (authorMatch) author = decodeEntities(authorMatch);
    }

    if (isNovelBin) {
      console.log('[Scraper] Novelbin detected');
      
      const titleMatch = safeMatch(html, /<h3[^>]*class="title"[^>]*itemprop="name"[^>]*>([^<]+)<\/h3>/i) ||
                         safeMatch(html, /<h3[^>]*itemprop="name"[^>]*class="title"[^>]*>([^<]+)<\/h3>/i);
      if (titleMatch) title = decodeEntities(titleMatch);
      
      const coverMatch = safeMatch(html, /<div[^>]*class="book"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*>/i);
      if (coverMatch) coverUrl = makeAbsoluteUrl(coverMatch, url);
      
      const authorMatch = safeMatch(html, /<span[^>]*itemprop="author"[^>]*>[\s\S]*?<meta[^>]*itemprop="name"[^>]*content="([^"]+)"/i);
      if (authorMatch) author = decodeEntities(authorMatch);
      
      const chapterMatch = safeMatch(html, /<a[^>]*href="([^"]*\/chapter-1[^"]*)"[^>]*>/i);
      if (chapterMatch) firstChapterUrl = makeAbsoluteUrl(chapterMatch, url);
    }

    if (isLightNovelWorld) {
      console.log('[Scraper] LightNovelWorld detected');
      
      const titleMatch = safeMatch(html, /<h1[^>]*class="novel-title"[^>]*>([^<]+)<\/h1>/i);
      if (titleMatch) title = decodeEntities(titleMatch);
      
      const authorMatch = safeMatch(html, /<p[^>]*class="novel-author"[^>]*>[\s\S]*?<a[^>]*class="author-link"[^>]*>([^<]+)<\/a>/i);
      if (authorMatch) {
        author = decodeEntities(authorMatch.trim());
      } else {
        const authorFallback = safeMatch(html, /<p[^>]*class="novel-author"[^>]*>([\s\S]*?)<\/p>/i);
        if (authorFallback) {
          author = decodeEntities(stripTags(authorFallback).replace(/^Author:\s*/i, '').trim());
        }
      }
      
      const coverMatch = safeMatch(html, /<img[^>]*class="novel-cover"[^>]*src="([^"]+)"/i) ||
                         safeMatch(html, /<img[^>]*src="([^"]+)"[^>]*class="novel-cover"/i);
      if (coverMatch) coverUrl = makeAbsoluteUrl(coverMatch, url);
      
      const baseNovelUrl = url.replace(/\/$/, '');
      firstChapterUrl = `${baseNovelUrl}/chapter/1/`;
    }

    console.log('[Scraper] Found first chapter:', firstChapterUrl);
    console.log('[Scraper] Synopsis extracted, length:', synopsis.length);
    
    return {
      title: decodeEntities(title),
      author: decodeEntities(author),
      synopsis: synopsis,
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
    const domainLower = url.toLowerCase();
    const isReadNovelFull = domainLower.includes('readnovelfull');
    const isNovelFull = domainLower.includes('novelfull') && !isReadNovelFull;
    const isNovelFullCom = domainLower.includes('novelfull.com');
    const isAllNovel = domainLower.includes('allnovel.org');
    const isNovgo = domainLower.includes('novgo.net');
    const isFreeWebNovel = domainLower.includes('freewebnovel') || domainLower.includes('bednovel');
    const isNovelBin = domainLower.includes('novelbin');
    const isLightNovelWorld = domainLower.includes('lightnovelworld');

    const html = await fetchWithFallback(url, isFreeWebNovel);
    
    let title = `Chapter ${chapterNum}`;
    
    // Extract real chapter title
    if (isReadNovelFull || isNovelFull || isNovelFullCom || isAllNovel || isNovgo) {
      const titleMatch = safeMatch(html, /<(?:h2|h3)[^>]*class="(?:chapter-title|title|chapter)"[^>]*>([^<]+)<\/(?:h2|h3)>/i) ||
                         safeMatch(html, /<(?:h2|h3)[^>]*>([^<]*Chapter[^<]*)<\/(?:h2|h3)>/i);
      if (titleMatch) title = decodeEntities(titleMatch.trim());
    }
    
    if (isFreeWebNovel) {
      const titleMatch = safeMatch(html, /<h1[^>]*class="tit"[^>]*>([^<]+)<\/h1>/i) ||
                         safeMatch(html, /<h4[^>]*>([^<]*Chapter[^<]*)<\/h4>/i) ||
                         safeMatch(html, /<h2[^>]*>([^<]*Chapter[^<]*)<\/h2>/i);
      if (titleMatch) title = decodeEntities(titleMatch.trim());
    }
    
    if (isNovelBin) {
      const titleMatch = safeMatch(html, /<h3[^>]*class="title"[^>]*>([^<]+)<\/h3>/i) ||
                         safeMatch(html, /<(?:h2|h3)[^>]*>([^<]*Chapter[^<]*)<\/(?:h2|h3)>/i) ||
                         safeMatch(html, /<a[^>]*class="chr-title"[^>]*>([^<]+)<\/a>/i);
      if (titleMatch) title = decodeEntities(titleMatch.trim());
    }
    
    if (isLightNovelWorld) {
      const titleMatch = safeMatch(html, /<h1[^>]*class="chapter-title"[^>]*>([^<]+)<\/h1>/i) ||
                         safeMatch(html, /<h2[^>]*class="chapter-title"[^>]*>([^<]+)<\/h2>/i) ||
                         safeMatch(html, /<h1[^>]*>([^<]*Chapter[^<]*)<\/h1>/i) ||
                         safeMatch(html, /<span[^>]*class="chapter-title"[^>]*>([^<]+)<\/span>/i);
      if (titleMatch) title = decodeEntities(titleMatch.trim());
    }
    
    if (title === `Chapter ${chapterNum}`) {
      const genericMatch = safeMatch(html, /<(?:h1|h2|h3)[^>]*>([^<]*(?:Chapter|Ch\.|Volume|Vol\.|Part|Book)[^<]*)<\/(?:h1|h2|h3)>/i);
      if (genericMatch) title = decodeEntities(genericMatch.trim());
    }
    
    title = title
      .replace(/\s+/g, ' ')
      .replace(/^\s*Chapter\s+(\d+)\s*[:.-]?\s*/i, 'Chapter $1: ')
      .trim();
    
    if (title === `Chapter ${chapterNum}` || title.match(/^Chapter\s+\d+$/i)) {
      const firstLineMatch = html.match(/<p[^>]*>([^<]*Chapter[^<]*)<\/p>/i);
      if (firstLineMatch) {
        const extractedTitle = decodeEntities(stripTags(firstLineMatch[1])).trim();
        if (extractedTitle.length > 0 && extractedTitle.length < 100) {
          title = extractedTitle;
        }
      }
    }
    
    console.log('[Scraper] Extracted title:', title);
    
    // Extract chapter content
    let paragraphMatches: string[] | null = null;

    if (isFreeWebNovel) {
      const containerMatch = html.match(/<div[^>]*class="chapter-content"[^>]*>([\s\S]*?)<\/div>/i) ||
                             html.match(/<div[^>]*id="chapter-container"[^>]*>([\s\S]*?)<\/div>/i);
      if (containerMatch) {
        paragraphMatches = containerMatch[1].match(/<p[^>]*>([\s\S]*?)<\/p>/gis);
      }
    }

    if (isLightNovelWorld && !paragraphMatches) {
      const containerMatch = html.match(/<div[^>]*id="chapterText"[^>]*>([\s\S]*?)<\/div>/i) ||
                             html.match(/<div[^>]*class="chapter-text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (containerMatch) {
        let cleaned = containerMatch[1]
          .replace(/<div[^>]*class="chapter-ad-container"[^>]*>[\s\S]*?<\/div>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        cleaned = cleaned.replace(/<div[^>]*class="text-to-speech[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
        cleaned = cleaned.replace(/<div[^>]*class="cta-banner[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
        paragraphMatches = cleaned.match(/<p[^>]*>([\s\S]*?)<\/p>/gis);
      }
    }

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

    let content = '';

    if (isNovelBin && validParagraphs.length > 0) {
      const junkPhrases = [
        'error loading comments',
        'please try again later',
        'total responses',
        'load comments',
        'login to comment',
        'post a comment',
        'report error',
        'novelbin.com',
        'novelbin.me',
      ];
      const filtered = validParagraphs.filter(text => {
        const lower = text.toLowerCase();
        return !junkPhrases.some(phrase => lower.includes(phrase));
      });
      content = filtered.join('\n\n') || validParagraphs.join('\n\n');

    } else if (isFreeWebNovel && validParagraphs.length > 0) {
      const junkPhrases = [
        'panda', 'novɐ1', 'com', 'freewebnovel.com', 'freewebnovel',
        'bednovel.com', 'bednovel', 'please visit', 'for a better experience',
        'click here', 'download the app', 'read latest chapters',
        'follow on', 'facebook', 'twitter', 'instagram', 'discord',
        'support the author', 'donate', 'patreon',
      ];
      const filtered = validParagraphs.filter(text => {
        const lower = text.toLowerCase();
        return !junkPhrases.some(phrase => lower.includes(phrase));
      });
      content = filtered.join('\n\n') || validParagraphs.join('\n\n');

    } else if (isLightNovelWorld && validParagraphs.length > 0) {
      const junkPhrases = [
        'text-to-speech is here', 'create a free account', 'unlock the full experience',
        'post comment', 'verification code', 'resend code', 'staff account detected',
        'forgot password', 'reset password', 'confirm password', 'username password',
        'mark as spoiler', 'poll options', 'add option', 'cancel post', 'posting...',
        'verifying...', 'sending...', 'resetting...', 'window.initializecomments',
        'light novel world', 'your gateway to infinite stories', '© 2025 light novel world',
        'loading chapters...', 'chapter comments', 'login to comment',
        'please follow common sense when posting comments',
        'spam, phishing, or any sort of suspicious comment will be deleted',
      ];

      const filtered = validParagraphs.filter(text => {
        const lower = text.toLowerCase();
        for (const phrase of junkPhrases) {
          if (lower.includes(phrase)) return false;
        }
        if (text.length < 20) return false;
        return true;
      });

      let startIdx = 0;
      while (startIdx < filtered.length && filtered[startIdx].length < 80) startIdx++;
      let endIdx = filtered.length - 1;
      while (endIdx >= 0 && filtered[endIdx].toLowerCase().includes('comment')) endIdx--;

      const cleaned = filtered.slice(startIdx, endIdx + 1);
      content = cleaned.join('\n\n');
      if (!content.trim()) {
        content = validParagraphs.join('\n\n');
      }

    } else if ((isNovelFull || isReadNovelFull || isNovelFullCom || isAllNovel || isNovgo) && validParagraphs.length > 0) {
      const junkPhrases = [
        'we are offering free books', 'read novel updated daily', 'light novel translations',
        'web novel, chinese novel', 'japanese novel, korean novel', 'other novel online',
        'novelfull.com', 'readnovelfull.com', 'allnovel.org', 'novgo.net',
      ];
      const filtered = validParagraphs.filter(text => {
        const lower = text.toLowerCase();
        return !junkPhrases.some(phrase => lower.includes(phrase));
      });
      content = filtered.join('\n\n') || validParagraphs.join('\n\n');

    } else {
      content = validParagraphs.join('\n\n');
    }
    
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
    
    let nextUrl: string | null = null;
    
    const linkRegex = /<a\s+([^>]*)>([\s\S]*?)<\/a>/gi;
    let linkMatch;
    
    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const attrsStr = linkMatch[1];
      const innerHtml = linkMatch[2];

      const hrefMatch = attrsStr.match(/href=["']([^"']+)["']/i);
      const href = hrefMatch ? hrefMatch[1] : null;

      const txt = stripTags(innerHtml).toLowerCase();

      const classMatch = attrsStr.match(/class=["']([^"']*)["']/i);
      const classAttr = classMatch ? classMatch[1].toLowerCase() : '';

      const idMatch = attrsStr.match(/id=["']([^"']*)["']/i);
      const idAttr = idMatch ? idMatch[1].toLowerCase() : '';

      const attrs = classAttr + ' ' + idAttr;
      
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

export async function downloadNovelByCrawling(
  startUrl: string,
  novelId: string,
  saveChapter: (novelId: string, chapterIndex: number, title: string, url: string, content: string) => Promise<void>,
  onProgress?: (chapterNumber: number, title: string) => void,
  delayMs: number = 500
): Promise<void> {
  let currentUrl: string | null = startUrl;
  let chapterNumber = 1;

  while (currentUrl) {
    console.log(`[Downloader] Fetching chapter ${chapterNumber} from ${currentUrl}`);

    try {
      const chapter = await directFetchChapter(currentUrl, chapterNumber);
      await saveChapter(novelId, chapterNumber - 1, chapter.title, currentUrl, chapter.content);

      if (onProgress) {
        onProgress(chapterNumber, chapter.title);
      }

      currentUrl = chapter.nextUrl;
      chapterNumber++;

      if (delayMs > 0 && currentUrl) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (error: any) {
      console.error(`[Downloader] Failed at chapter ${chapterNumber}:`, error.message);
      console.log(`[Downloader] Partial download completed. ${chapterNumber - 1} chapters saved.`);
      
      if (onProgress && chapterNumber > 1) {
        onProgress(chapterNumber, `Download paused at chapter ${chapterNumber - 1}. ${chapterNumber - 1} chapters saved.`);
      }
      
      break;
    }
  }

  console.log(`[Downloader] Completed. Total chapters: ${chapterNumber - 1}`);
}