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

// Debug logger that can be used to send messages to the Activity Log
let debugLogCallback: ((message: string, type: string) => void) | null = null;

export const setDebugLogCallback = (callback: (message: string, type: string) => void) => {
  debugLogCallback = callback;
};

const debugLog = (message: string, type: string = "info") => {
  console.log(`[DEBUG] ${message}`);
  if (debugLogCallback) {
    debugLogCallback(message, type);
  }
};

export const directFetchNovelMeta = async (url: string): Promise<NovelMeta> => {
  debugLog(`Fetching novel meta from: ${url}`, "downloading");
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
      },
      timeout: 15000
    });
    
    const html = response.data;
    const domainLower = url.toLowerCase();
    const isReadNovelFull = domainLower.includes('readnovelfull');
    const isNovelFull = domainLower.includes('novelfull') && !isReadNovelFull;
    const isFreeWebNovel = domainLower.includes('freewebnovel');
    
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
    
    if (isReadNovelFull || isNovelFull) {
      // --- TITLE for ReadNovelFull/NovelFull ---
      const titleMatch = html.match(/<h3[^>]*class="title"[^>]*>([^<]+)<\/h3>/i) ||
                         html.match(/<h1[^>]*class="title"[^>]*>([^<]+)<\/h1>/i) ||
                         html.match(/<div[^>]*class="book-title"[^>]*>([^<]+)<\/div>/i);
      if (titleMatch) title = decodeHTML(titleMatch[1].trim());
      
      // --- AUTHOR for ReadNovelFull ---
      if (isReadNovelFull) {
        const authorMatch = html.match(/<span[^>]*itemprop="author"[^>]*>.*?<meta[^>]*itemprop="name"[^>]*content="([^"]+)"/i);
        if (authorMatch) author = decodeHTML(authorMatch[1]);
      }
      
      // --- AUTHOR for NovelFull ---
      if (isNovelFull) {
        const authorMatch = html.match(/<div[^>]*class="info"[^>]*>.*?<h3[^>]*>Author:<\/h3>\s*<a[^>]*>([^<]+)<\/a>/i);
        if (authorMatch) author = decodeHTML(authorMatch[1].trim());
      }
      
      // --- SYNOPSIS for ReadNovelFull ---
      if (isReadNovelFull) {
        const descMatch = html.match(/<div[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/div>/i);
        if (descMatch) {
          const paragraphs = descMatch[1].match(/<p[^>]*>(.*?)<\/p>/gis);
          if (paragraphs) {
            synopsis = paragraphs.map(p => stripTags(p)).join('\n\n');
          } else {
            synopsis = stripTags(descMatch[1]);
          }
        }
      }
      
      // --- SYNOPSIS for NovelFull ---
      if (isNovelFull) {
        const descMatch = html.match(/<div[^>]*class="desc-text"[^>]*>([\s\S]*?)<\/div>/i);
        if (descMatch) {
          const paragraphs = descMatch[1].match(/<p[^>]*>(.*?)<\/p>/gis);
          if (paragraphs) {
            synopsis = paragraphs.map(p => stripTags(p)).join('\n\n');
          } else {
            synopsis = stripTags(descMatch[1]);
          }
        }
      }
      
      // --- COVER for ReadNovelFull/NovelFull ---
      const coverMatch = html.match(/<div[^>]*class="book"[^>]*>.*?<img[^>]*src="([^"]+)"[^>]*>/i);
      if (coverMatch) coverUrl = makeAbsoluteUrl(coverMatch[1], url);
      
      // --- FIRST CHAPTER for ReadNovelFull/NovelFull ---
      const chapterMatch = html.match(/<(?:div|ul)[^>]*(?:id="(?:tab-chapters|list-chapter)"|class="list-chapter")[^>]*>.*?<li[^>]*>.*?<a[^>]*href="([^"]+)"/i);
      if (chapterMatch) {
        firstChapterUrl = makeAbsoluteUrl(chapterMatch[1], url);
      } else {
        const chapterLinkMatch = html.match(/<a[^>]*href="([^"]*chapter[-/]1[^"]*)"[^>]*>/i);
        if (chapterLinkMatch) firstChapterUrl = makeAbsoluteUrl(chapterLinkMatch[1], url);
      }
    }
    
    // ============================================
    // FREEWEBNOVEL SPECIFIC EXTRACTION
    // ============================================
    if (isFreeWebNovel) {
      debugLog("FreeWebNovel detected", "downloading");
      
      // --- TITLE (from img alt or h1) ---
      const imgTitleMatch = html.match(/<img[^>]*alt="([^"]+)"[^>]*>/i);
      if (imgTitleMatch && imgTitleMatch[1]) {
        title = decodeHTML(imgTitleMatch[1].trim());
        debugLog(`Title from image: ${title}`, "success");
      }
      const h1Match = html.match(/<h1[^>]*class="novel-title"[^>]*>([^<]+)<\/h1>/i);
      if (h1Match) title = decodeHTML(h1Match[1].trim());
      
      // --- COVER (div.pic img) ---
      const coverMatch = html.match(/<div[^>]*class="pic"[^>]*>.*?<img[^>]*src="([^"]+)"[^>]*>/i);
      if (coverMatch) {
        let coverPath = coverMatch[1];
        if (coverPath.startsWith('/')) {
          const baseUrl = new URL(url);
          coverUrl = `${baseUrl.protocol}//${baseUrl.host}${coverPath}`;
        } else {
          coverUrl = coverPath;
        }
        debugLog(`Cover found: ${coverUrl}`, "info");
      }
      
      // --- AUTHOR (div.item > div.right > a.a1) ---
      const authorMatch = html.match(/<div[^>]*class="item"[^>]*>.*?<div[^>]*class="right"[^>]*>.*?<a[^>]*class="a1"[^>]*>([^<]+)<\/a>/i);
      if (authorMatch) {
        author = decodeHTML(authorMatch[1].trim());
        debugLog(`Author found: ${author}`, "info");
      }
      
      // --- SYNOPSIS (div.m-desc > div.inner > p) ---
      const descMatch = html.match(/<div[^>]*class="m-desc"[^>]*>([\s\S]*?)<\/div>/i);
      if (descMatch) {
        const innerMatch = descMatch[1].match(/<div[^>]*class="inner"[^>]*>([\s\S]*?)<\/div>/i);
        if (innerMatch) {
          const paragraphs = innerMatch[1].match(/<p[^>]*>(.*?)<\/p>/gis);
          if (paragraphs) {
            synopsis = paragraphs.map(p => stripTags(p)).filter(t => t.length > 0).join('\n\n');
            debugLog(`Synopsis found (${synopsis.length} chars)`, "info");
          }
        }
      }
      
      // --- FIRST CHAPTER - Add "/chapter-1" for FreeWebNovel ---
      let baseNovelUrl = url;
      if (baseNovelUrl.endsWith('/')) {
        baseNovelUrl = baseNovelUrl.slice(0, -1);
      }
      // Remove any existing chapter part
      if (baseNovelUrl.includes('/chapter-')) {
        baseNovelUrl = baseNovelUrl.split('/chapter-')[0];
      }
      firstChapterUrl = `${baseNovelUrl}/chapter-1`;
      debugLog(`Constructed first chapter URL: ${firstChapterUrl}`, "success");
    }
    
    debugLog(`Title: ${title}`, "success");
    debugLog(`Author: ${author}`, "info");
    
    return {
      title: decodeHTML(title),
      author: decodeHTML(author),
      synopsis: decodeHTML(synopsis),
      coverUrl,
      firstChapterUrl
    };
  } catch (error: any) {
    debugLog(`Error: ${error.message}`, "error");
    throw new Error(`Failed to fetch novel: ${error.message}`);
  }
};

export const directFetchChapter = async (url: string, chapterNum: number): Promise<ChapterData> => {
  debugLog(`Fetching chapter ${chapterNum} from: ${url}`, "downloading");
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
      },
      timeout: 15000
    });
    
    const html = response.data;
    const isFreeWebNovel = url.toLowerCase().includes('freewebnovel');
    
    // Debug: Check HTML content
    if (isFreeWebNovel) {
      debugLog(`HTML length: ${html.length} characters`, "info");
      debugLog(`Has 'm-desc': ${html.includes('m-desc')}`, "info");
      debugLog(`Has 'inner': ${html.includes('inner')}`, "info");
      debugLog(`Has '<p': ${html.includes('<p')}`, "info");
      
      // Show first 500 chars of HTML for debugging
      const htmlSnippet = html.substring(0, 500).replace(/\n/g, ' ');
      debugLog(`HTML snippet: ${htmlSnippet}...`, "info");
    }
    
    // Extract chapter title
    let title = `Chapter ${chapterNum}`;
    
    if (isFreeWebNovel) {
      const titleMatch = html.match(/<h1[^>]*class="chapter-title"[^>]*>([^<]+)<\/h1>/i) ||
                         html.match(/<h1[^>]*>Chapter\s*\d+[:\-]?\s*([^<]+)<\/h1>/i);
      if (titleMatch) {
        const rawTitle = stripTags(titleMatch[1]);
        const cleanTitle = rawTitle.replace(/^Chapter\s*\d+\s*[:\-]*\s*/i, '').trim();
        if (cleanTitle) {
          title = `Chapter ${chapterNum}: ${cleanTitle}`;
        }
        debugLog(`Chapter title: ${title}`, "success");
      } else {
        debugLog(`Could not find chapter title in HTML`, "warning");
      }
    } else {
      const titleMatch = html.match(/<(?:h1|h2|span)[^>]*(?:class="(?:chapter-title|chr-title|entry-title)")[^>]*>([^<]+)</i);
      if (titleMatch) {
        const rawTitle = stripTags(titleMatch[1]);
        const cleanTitle = rawTitle.replace(/^Chapter\s*\d+\s*[:\-]*\s*/i, '').trim();
        if (cleanTitle) title = `Chapter ${chapterNum}: ${cleanTitle}`;
      }
    }
    
    // ============================================
    // CONTENT EXTRACTION - ENHANCED FOR FREEWEBNOVEL
    // ============================================
    let content = '';
    
    if (isFreeWebNovel) {
      debugLog("FreeWebNovel content extraction...", "downloading");
      
      // Try FreeWebNovel specific content containers
      const contentPatterns = [
        // Pattern 1: m-desc > txt > inner > p
        /<div[^>]*class="m-desc[^"]*"[^>]*>[\s\S]*?<div[^>]*class="txt"[^>]*>[\s\S]*?<div[^>]*class="inner"[^>]*>([\s\S]*?)<\/div>/i,
        // Pattern 2: Direct inner div
        /<div[^>]*class="inner"[^>]*>([\s\S]*?)<\/div>/i,
        // Pattern 3: chapter-content
        /<div[^>]*class="chapter-content"[^>]*>([\s\S]*?)<\/div>/i,
        // Pattern 4: content class
        /<div[^>]*class="content"[^>]*>([\s\S]*?)<\/div>/i,
        // Pattern 5: Any div with class containing "chapter"
        /<div[^>]*class="[^"]*chapter[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      ];
      
      let contentHtml = '';
      for (let i = 0; i < contentPatterns.length; i++) {
        const match = html.match(contentPatterns[i]);
        if (match && match[1]) {
          contentHtml = match[1];
          debugLog(`Found content container with pattern ${i + 1}`, "success");
          break;
        }
      }
      
      if (contentHtml) {
        const paragraphs = contentHtml.match(/<p[^>]*>(.*?)<\/p>/gis);
        if (paragraphs && paragraphs.length > 0) {
          const validParagraphs: string[] = [];
          for (const p of paragraphs) {
            let text = stripTags(p);
            text = text.replace(/\s+/g, ' ').trim();
            if (text.length > 5 && 
                !text.toLowerCase().includes('next chapter') &&
                !text.toLowerCase().includes('previous chapter') &&
                !text.toLowerCase().includes('back to') &&
                !text.toLowerCase().includes('table of contents')) {
              validParagraphs.push(text);
            }
          }
          content = validParagraphs.join('\n\n');
          debugLog(`Extracted ${validParagraphs.length} paragraphs, total ${content.length} chars`, "success");
        } else {
          content = stripTags(contentHtml);
          debugLog(`Extracted text content: ${content.length} chars`, "info");
        }
      } else {
        debugLog(`No content container found`, "warning");
      }
    }
    
    // If no content yet, try general paragraph extraction
    if (!content) {
      const paragraphMatches = html.match(/<p[^>]*>(.*?)<\/p>/gis);
      if (paragraphMatches && paragraphMatches.length > 0) {
        const validParagraphs: string[] = [];
        for (const p of paragraphMatches) {
          const text = stripTags(p);
          if (text.length > 5 && 
              !text.toLowerCase().includes('next chapter') &&
              !text.toLowerCase().includes('previous chapter') &&
              !text.toLowerCase().includes('back to') &&
              !text.toLowerCase().includes('table of contents')) {
            validParagraphs.push(text);
          }
        }
        content = validParagraphs.join('\n\n');
        debugLog(`General extraction: ${validParagraphs.length} paragraphs, total ${content.length} chars`, "info");
      } else {
        debugLog(`No paragraphs found in HTML`, "warning");
      }
    }
    
    // Last resort fallback
    if (!content) {
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        content = stripTags(bodyMatch[1]).substring(0, 5000);
        debugLog(`Fallback content: ${content.length} chars`, "warning");
      }
    }
    
    debugLog(`Final content length: ${content.length} characters`, content.length > 0 ? "success" : "error");
    
    // Find next chapter URL - EXACT PYTHON TRANSLATION
    let nextUrl: string | null = null;
    
    const linkRegex = /<a\s+[^>]*href="([^"]+)"[^>]*>.*?<\/a>/gi;
    let linkMatch;
    
    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const fullLink = linkMatch[0];
      const href = linkMatch[1];
      
      const textMatch = fullLink.match(/>([^<]*)</);
      const txt = textMatch ? textMatch[1].toLowerCase() : '';
      
      const classMatch = fullLink.match(/class=["']([^"']*)["']/i);
      const classAttr = classMatch ? classMatch[1].toLowerCase() : '';
      
      const idMatch = fullLink.match(/id=["']([^"']*)["']/i);
      const idAttr = idMatch ? idMatch[1].toLowerCase() : '';
      
      const attrs = classAttr + idAttr;
      
      if (txt.includes('next') || 
          txt.includes('next chapter') || 
          attrs.includes('next') || 
          attrs.includes('next_chapter')) {
        nextUrl = makeAbsoluteUrl(href, url);
        debugLog(`Found next chapter: ${nextUrl}`, "success");
        break;
      }
    }
    
    if (!nextUrl) {
      debugLog(`No next chapter found`, "info");
    }
    
    return {
      url,
      title,
      content: content || 'No content available.',
      nextUrl
    };
  } catch (error: any) {
    debugLog(`Error: ${error.message}`, "error");
    throw new Error(`Failed to fetch chapter: ${error.message}`);
  }
};
