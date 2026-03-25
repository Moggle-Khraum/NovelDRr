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

export const directFetchNovelMeta = async (url: string): Promise<NovelMeta> => {
  console.log('[Scraper] Fetching novel meta from:', url);
  
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
      console.log('[Scraper] FreeWebNovel detected');
      
      // --- TITLE (from img alt or h1) ---
      const imgTitleMatch = html.match(/<img[^>]*alt="([^"]+)"[^>]*>/i);
      if (imgTitleMatch && imgTitleMatch[1]) {
        title = decodeHTML(imgTitleMatch[1].trim());
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
        console.log('[Scraper] Found cover:', coverUrl);
      }
      
      // --- AUTHOR (div.item > div.right > a.a1) ---
      const authorMatch = html.match(/<div[^>]*class="item"[^>]*>.*?<div[^>]*class="right"[^>]*>.*?<a[^>]*class="a1"[^>]*>([^<]+)<\/a>/i);
      if (authorMatch) {
        author = decodeHTML(authorMatch[1].trim());
        console.log('[Scraper] Found author:', author);
      }
      
      // --- SYNOPSIS (div.m-desc > div.inner > p) ---
      const descMatch = html.match(/<div[^>]*class="m-desc"[^>]*>([\s\S]*?)<\/div>/i);
      if (descMatch) {
        const innerMatch = descMatch[1].match(/<div[^>]*class="inner"[^>]*>([\s\S]*?)<\/div>/i);
        if (innerMatch) {
          const paragraphs = innerMatch[1].match(/<p[^>]*>(.*?)<\/p>/gis);
          if (paragraphs) {
            synopsis = paragraphs.map(p => stripTags(p)).filter(t => t.length > 0).join('\n\n');
            console.log('[Scraper] Found synopsis, length:', synopsis.length);
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
      console.log('[Scraper] FreeWebNovel first chapter URL:', firstChapterUrl);
      
      // Also try to find from ul.ul-list5 as fallback
      const ulMatch = html.match(/<ul[^>]*class="ul-list5"[^>]*>([\s\S]*?)<\/ul>/i);
      if (ulMatch) {
        const ulContent = ulMatch[1];
        const firstLiMatch = ulContent.match(/<li[^>]*>([\s\S]*?)<\/li>/i);
        if (firstLiMatch) {
          const firstAMatch = firstLiMatch[1].match(/<a[^>]*href="([^"]+)"[^>]*>/i);
          if (firstAMatch && firstAMatch[1]) {
            firstChapterUrl = makeAbsoluteUrl(firstAMatch[1], url);
            console.log('[Scraper] Found FreeWebNovel first chapter via ul.ul-list5');
          }
        }
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
    
    // Extract chapter title
    let title = `Chapter ${chapterNum}`;
    
    // Special handling for FreeWebNovel chapter title
    if (isFreeWebNovel) {
      const titleMatch = html.match(/<h1[^>]*class="chapter-title"[^>]*>([^<]+)<\/h1>/i) ||
                         html.match(/<h1[^>]*>Chapter\s*\d+[:\-]?\s*([^<]+)<\/h1>/i);
      if (titleMatch) {
        const rawTitle = stripTags(titleMatch[1]);
        const cleanTitle = rawTitle.replace(/^Chapter\s*\d+\s*[:\-]*\s*/i, '').trim();
        if (cleanTitle) {
          title = `Chapter ${chapterNum}: ${cleanTitle}`;
        } else {
          title = `Chapter ${chapterNum}`;
        }
      }
    } else {
      // For ReadNovelFull and NovelFull
      const titleMatch = html.match(/<(?:h1|h2|span)[^>]*(?:class="(?:chapter-title|chr-title|entry-title)")[^>]*>([^<]+)</i);
      if (titleMatch) {
        const rawTitle = stripTags(titleMatch[1]);
        const cleanTitle = rawTitle.replace(/^Chapter\s*\d+\s*[:\-]*\s*/i, '').trim();
        if (cleanTitle) title = `Chapter ${chapterNum}: ${cleanTitle}`;
      }
    }
    
    // Extract content (all paragraphs)
    const paragraphMatches = html.match(/<p[^>]*>(.*?)<\/p>/gis);
    const validParagraphs: string[] = [];
    
    if (paragraphMatches) {
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
    }
    
    let content = validParagraphs.join('\n\n');
    
    // If no paragraphs found, try content containers (especially for FreeWebNovel)
    if (!content) {
      const contentMatch = html.match(/<div[^>]*class="chapter-content"[^>]*>([\s\S]*?)<\/div>/i) ||
                           html.match(/<div[^>]*class="content"[^>]*>([\s\S]*?)<\/div>/i) ||
                           html.match(/<div[^>]*id="chapter-content"[^>]*>([\s\S]*?)<\/div>/i) ||
                           html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
      if (contentMatch) {
        const innerContent = contentMatch[1];
        const innerParagraphs = innerContent.match(/<p[^>]*>(.*?)<\/p>/gis);
        if (innerParagraphs) {
          const texts: string[] = [];
          for (const p of innerParagraphs) {
            const text = stripTags(p);
            if (text.length > 5) texts.push(text);
          }
          content = texts.join('\n\n');
        } else {
          content = stripTags(innerContent);
        }
      }
    }
    
    // Find next chapter URL - EXACT PYTHON TRANSLATION
    let nextUrl: string | null = null;
    
    const linkRegex = /<a\s+[^>]*href="([^"]+)"[^>]*>.*?<\/a>/gi;
    let linkMatch;
    
    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const fullLink = linkMatch[0];
      const href = linkMatch[1];
      
      // Extract text content (like a.get_text().lower())
      const textMatch = fullLink.match(/>([^<]*)</);
      const txt = textMatch ? textMatch[1].toLowerCase() : '';
      
      // Extract class attribute (like str(a.get('class', [])).lower())
      const classMatch = fullLink.match(/class=["']([^"']*)["']/i);
      const classAttr = classMatch ? classMatch[1].toLowerCase() : '';
      
      // Extract id attribute (like a.get('id', '').lower())
      const idMatch = fullLink.match(/id=["']([^"']*)["']/i);
      const idAttr = idMatch ? idMatch[1].toLowerCase() : '';
      
      // Combine attrs like Python does
      const attrs = classAttr + idAttr;
      
      // Check conditions exactly like Python
      if (txt.includes('next') || 
          txt.includes('next chapter') || 
          attrs.includes('next') || 
          attrs.includes('next_chapter')) {
        nextUrl = makeAbsoluteUrl(href, url);
        console.log('[Scraper] Found next chapter:', nextUrl);
        break;
      }
    }
    
    if (!nextUrl) {
      console.log('[Scraper] No next chapter found. Checked all links.');
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
