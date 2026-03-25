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

// Helper: Extract content between tags
const extractBetween = (html: string, startTag: string, endTag: string): string => {
  const startIndex = html.indexOf(startTag);
  if (startIndex === -1) return '';
  const contentStart = startIndex + startTag.length;
  const endIndex = html.indexOf(endTag, contentStart);
  if (endIndex === -1) return '';
  return html.substring(contentStart, endIndex).trim();
};

// Helper: Strip HTML tags
const stripTags = (html: string): string => {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
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
    const domainLower = url.toLowerCase();
    const isReadNovelFull = domainLower.includes('readnovelfull');
    const isNovelFull = domainLower.includes('novelfull') && !isReadNovelFull;
    const isFreeWebNovel = domainLower.includes('freewebnovel');
    
    // Extract title
    let title = extractTitleFromUrl(url);
    
    if (isReadNovelFull || isNovelFull) {
      const titleMatch = html.match(/<h3[^>]*class="title"[^>]*>([^<]+)<\/h3>/i) ||
                         html.match(/<h1[^>]*class="title"[^>]*>([^<]+)<\/h1>/i) ||
                         html.match(/<div[^>]*class="book-title"[^>]*>([^<]+)<\/div>/i);
      if (titleMatch) title = decodeHTML(titleMatch[1].trim());
    } else if (isFreeWebNovel) {
      const titleMatch = html.match(/<h1[^>]*class="novel-title"[^>]*>([^<]+)<\/h1>/i) ||
                         html.match(/<h1[^>]*class="title"[^>]*>([^<]+)<\/h1>/i);
      if (titleMatch) title = decodeHTML(titleMatch[1].trim());
    }
    
    // Extract author
    let author = 'Unknown Author';
    
    if (isReadNovelFull) {
      const authorMatch = html.match(/<span[^>]*itemprop="author"[^>]*>.*?<meta[^>]*itemprop="name"[^>]*content="([^"]+)"/i);
      if (authorMatch) author = decodeHTML(authorMatch[1]);
    } else if (isNovelFull) {
      const authorMatch = html.match(/<div[^>]*class="info"[^>]*>.*?<h3[^>]*>Author:<\/h3>\s*<a[^>]*>([^<]+)<\/a>/i);
      if (authorMatch) author = decodeHTML(authorMatch[1].trim());
    } else if (isFreeWebNovel) {
      const authorMatch = html.match(/<div[^>]*class="item"[^>]*>.*?<div[^>]*class="right"[^>]*>.*?<a[^>]*class="a1"[^>]*>([^<]+)<\/a>/i);
      if (authorMatch) author = decodeHTML(authorMatch[1].trim());
    }
    
    // Extract synopsis
    let synopsis = 'No summary available.';
    
    if (isReadNovelFull) {
      const descMatch = html.match(/<div[^>]*itemprop="description"[^>]*>(.*?)<\/div>/is);
      if (descMatch) {
        const paragraphs = descMatch[1].match(/<p[^>]*>(.*?)<\/p>/gis);
        if (paragraphs) {
          synopsis = paragraphs.map(p => stripTags(p)).join('\n\n');
        } else {
          synopsis = stripTags(descMatch[1]);
        }
      }
    } else if (isNovelFull) {
      const descMatch = html.match(/<div[^>]*class="desc-text"[^>]*>(.*?)<\/div>/is);
      if (descMatch) {
        const paragraphs = descMatch[1].match(/<p[^>]*>(.*?)<\/p>/gis);
        if (paragraphs) {
          synopsis = paragraphs.map(p => stripTags(p)).join('\n\n');
        } else {
          synopsis = stripTags(descMatch[1]);
        }
      }
    } else if (isFreeWebNovel) {
      const descMatch = html.match(/<div[^>]*class="m-desc"[^>]*>(.*?)<\/div>/is);
      if (descMatch) {
        const innerMatch = descMatch[1].match(/<div[^>]*class="inner"[^>]*>(.*?)<\/div>/is);
        if (innerMatch) {
          const paragraphs = innerMatch[1].match(/<p[^>]*>(.*?)<\/p>/gis);
          if (paragraphs) {
            synopsis = paragraphs.map(p => stripTags(p)).join('\n\n');
          }
        }
      }
    }
    
    // Extract cover URL
    let coverUrl = '';
    const coverMatch = html.match(/<div[^>]*class="(?:pic|book)"[^>]*>.*?<img[^>]*src="([^"]+)"/i);
    if (coverMatch) coverUrl = makeAbsoluteUrl(coverMatch[1], url);
    
    // Extract first chapter URL
    let firstChapterUrl: string | null = null;
    
    if (isFreeWebNovel) {
      const chapterMatch = html.match(/<ul[^>]*class="ul-list5"[^>]*>.*?<li[^>]*>.*?<a[^>]*href="([^"]+)"/i);
      if (chapterMatch) firstChapterUrl = makeAbsoluteUrl(chapterMatch[1], url);
    } else {
      const chapterMatch = html.match(/<(?:div|ul)[^>]*(?:id="(?:tab-chapters|list-chapter)"|class="list-chapter")[^>]*>.*?<li[^>]*>.*?<a[^>]*href="([^"]+)"/i);
      if (chapterMatch) {
        firstChapterUrl = makeAbsoluteUrl(chapterMatch[1], url);
      } else {
        const chapterLinkMatch = html.match(/<a[^>]*href="([^"]*chapter[-/]1[^"]*)"[^>]*>/i);
        if (chapterLinkMatch) firstChapterUrl = makeAbsoluteUrl(chapterLinkMatch[1], url);
      }
    }
    
    console.log('[Scraper] Found first chapter:', firstChapterUrl);
    
    return {
      title: decodeHTML(title),
      author: decodeHTML(author),
      synopsis: decodeHTML(synopsis),
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
    
    // Extract chapter title
    let title = `Chapter ${chapterNum}`;
    const titleMatch = html.match(/<(?:h1|h2|span)[^>]*(?:class="(?:chapter-title|chr-title|entry-title)")[^>]*>([^<]+)</i);
    if (titleMatch) {
      const rawTitle = stripTags(titleMatch[1]);
      const cleanTitle = rawTitle.replace(/^Chapter\s*\d+\s*[:\-]*\s*/i, '').trim();
      if (cleanTitle) title = `Chapter ${chapterNum}: ${cleanTitle}`;
    }
    
    // Extract content (all paragraphs)
    const paragraphMatches = html.match(/<p[^>]*>(.*?)<\/p>/gis);
    const validParagraphs: string[] = [];
    
    if (paragraphMatches) {
      for (const p of paragraphMatches) {
        const text = stripTags(p);
        if (text.length > 5 && !text.toLowerCase().includes('next chapter')) {
          validParagraphs.push(text);
        }
      }
    }
    
    const content = validParagraphs.join('\n\n');
    
    // Find next chapter URL
    let nextUrl: string | null = null;
    const nextMatch = html.match(/<a[^>]*href="([^"]+)"[^>]*>(?:Next|Next Chapter|&gt;)/i);
    if (nextMatch) {
      nextUrl = makeAbsoluteUrl(nextMatch[1], url);
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
