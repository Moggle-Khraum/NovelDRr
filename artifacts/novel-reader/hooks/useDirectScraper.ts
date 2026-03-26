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
    
    // Check for other similar sites (LightNovelWorld, AllNovelFull, LightNovelPub, NovelCool)
    const isSimilarSite = domainLower.includes('lightnovelworld') || 
                          domainLower.includes('allnovelfull') ||
                          domainLower.includes('lightnovelpub') ||
                          domainLower.includes('novelcool');
    
    const isFreeWebNovel = domainLower.includes('freewebnovel');
    const isNovelBin = domainLower.includes('novelbin');
    
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
    
    if (isReadNovelFull || isNovelFull || isSimilarSite) {
      // --- TITLE ---
      const titleMatch = html.match(/<h3[^>]*class="title"[^>]*>([^<]+)<\/h3>/i) ||
                         html.match(/<h1[^>]*class="title"[^>]*>([^<]+)<\/h1>/i) ||
                         html.match(/<div[^>]*class="book-title"[^>]*>([^<]+)<\/div>/i);
      if (titleMatch) title = decodeHTML(titleMatch[1].trim());
      
      // --- AUTHOR ---
      // [\s\S]*? so newlines between span and meta don't break the match
      const authorMatch = html.match(/<span[^>]*itemprop="author"[^>]*>[\s\S]*?<meta[^>]*itemprop="name"[^>]*content="([^"]+)"/i) ||
                          html.match(/<div[^>]*class="info"[^>]*>[\s\S]*?<h3[^>]*>Author:<\/h3>\s*<a[^>]*>([^<]+)<\/a>/i);
      if (authorMatch) author = decodeHTML(authorMatch[1].trim());
      
      // --- SYNOPSIS ---
      const descMatch = html.match(/<div[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/div>/i) ||
                        html.match(/<div[^>]*class="desc-text"[^>]*>([\s\S]*?)<\/div>/i);
      if (descMatch) {
        const paragraphs = descMatch[1].match(/<p[^>]*>([\s\S]*?)<\/p>/gis);
        if (paragraphs) {
          synopsis = paragraphs.map(p => decodeHTML(stripTags(p))).filter(Boolean).join('\n\n');
        } else {
          synopsis = decodeHTML(stripTags(descMatch[1]));
        }
      }
      
      // --- COVER ---
      // [\s\S]*? crosses newlines in real HTML (.*? does not in JS)
      const coverMatch = html.match(/<div[^>]*class="book"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*>/i) ||
                         html.match(/<div[^>]*class="pic"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*>/i);
      if (coverMatch) coverUrl = makeAbsoluteUrl(coverMatch[1], url);
      
      // --- FIRST CHAPTER ---
      // [\s\S]*? so newlines between tags don't break the match
      const chapterMatch = html.match(/<(?:div|ul)[^>]*(?:id="(?:tab-chapters|list-chapter)"|class="list-chapter")[^>]*>[\s\S]*?<li[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"/i);
      if (chapterMatch) {
        firstChapterUrl = makeAbsoluteUrl(chapterMatch[1], url);
      } else {
        const chapterLinkMatch = html.match(/<a[^>]*href="([^"]*chapter[-/]1[^"]*)"[^>]*>/i);
        if (chapterLinkMatch) firstChapterUrl = makeAbsoluteUrl(chapterLinkMatch[1], url);
      }
    }

    // --- FREEWEBNOVEL ---
    else if (isFreeWebNovel) {
      // Title: first <h1> on the page
      const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      if (titleMatch) title = decodeHTML(titleMatch[1].trim());

      // Author: <div class="item"><span title="Author">...<a class="a1">Name</a>
      const authorMatch = html.match(/title="Author"[\s\S]*?<a[^>]*class="a1"[^>]*>([^<]+)<\/a>/i);
      if (authorMatch) author = decodeHTML(authorMatch[1].trim());

      // Synopsis: <div class="m-desc"><div class="inner"><p>...</p>
      const descMatch = html.match(/<div[^>]*class="m-desc"[^>]*>[\s\S]*?<div[^>]*class="inner"[^>]*>([\s\S]*?)<\/div>/i);
      if (descMatch) {
        const paragraphs = descMatch[1].match(/<p[^>]*>([\s\S]*?)<\/p>/gis);
        if (paragraphs) {
          synopsis = paragraphs.map(p => decodeHTML(stripTags(p))).filter(Boolean).join('\n\n');
        } else {
          synopsis = decodeHTML(stripTags(descMatch[1]));
        }
      }

      // Cover: <div class="pic"><img src="...">
      const coverMatch = html.match(/<div[^>]*class="pic"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i);
      if (coverMatch) coverUrl = makeAbsoluteUrl(coverMatch[1], url);

      // First chapter: <ul class="ul-list5"><li><a href="...">
      const fwnChapterMatch = html.match(/class="ul-list5"[^>]*>[\s\S]*?<li[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"/i);
      if (fwnChapterMatch) firstChapterUrl = makeAbsoluteUrl(fwnChapterMatch[1], url);
    }

    // --- NOVELBIN ---
    else if (isNovelBin) {
      // Title: <div class="col-xs-12 col-sm-8 desc"><h3 class="title">Novel Title</h3>
      const titleMatch = html.match(/col-sm-8 desc[\s\S]*?<h3[^>]*class="title"[^>]*>([^<]+)<\/h3>/i);
      if (titleMatch) title = decodeHTML(titleMatch[1].trim());

      // Author: <ul class="info info-meta">...<h3>Author:</h3><a href="...">Name</a>
      const authorMatch = html.match(/class="info info-meta"[\s\S]*?<h3[^>]*>Author:<\/h3>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
      if (authorMatch) author = decodeHTML(authorMatch[1].trim());

      // Synopsis: <div class="desc-text" itemprop="description"><p>...</p>
      const descMatch = html.match(/<div[^>]*class="desc-text"[^>]*>([\s\S]*?)<\/div>/i);
      if (descMatch) {
        const paragraphs = descMatch[1].match(/<p[^>]*>([\s\S]*?)<\/p>/gis);
        if (paragraphs) {
          synopsis = paragraphs.map(p => decodeHTML(stripTags(p))).filter(Boolean).join('\n\n');
        } else {
          synopsis = decodeHTML(stripTags(descMatch[1]));
        }
      }

      // Cover: standard book cover img
      const coverMatch = html.match(/<div[^>]*class="book"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i);
      if (coverMatch) coverUrl = makeAbsoluteUrl(coverMatch[1], url);

      // First chapter: find #list-chapter, grab the very first <a href>
      const listSectionMatch = html.match(/id="list-chapter"([\s\S]*?)(?=id="tab-description"|<\/section|<footer)/i);
      if (listSectionMatch) {
        const firstA = listSectionMatch[1].match(/<a[^>]*href="([^"]+)"/i);
        if (firstA) firstChapterUrl = makeAbsoluteUrl(firstA[1], url);
      }
      // Fallback: generic chapter-1 link
      if (!firstChapterUrl) {
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
    const isFreeWebNovel = domainLower.includes('freewebnovel');
    
    // Extract chapter title
    let title = `Chapter ${chapterNum}`;
    const titleMatch = html.match(/<(?:h1|h2|span)[^>]*(?:class="(?:chapter-title|chr-title|entry-title)")[^>]*>([^<]+)</i);
    if (titleMatch) {
      const rawTitle = stripTags(titleMatch[1]);
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
        // decodeHTML converts &#8220; → " and &#8217; → ' etc.
        const text = decodeHTML(stripTags(p));
        if (text.length > 5 && 
            !text.toLowerCase().includes('next chapter') &&
            !text.toLowerCase().includes('previous chapter') &&
            !text.toLowerCase().includes('back to') &&
            !text.toLowerCase().includes('table of contents')) {
          validParagraphs.push(text);
        }
      }
    }
    
    const content = validParagraphs.join('\n\n');
    
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
