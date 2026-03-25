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
    
    // Extract first chapter URL - ENHANCED FOR FREEWEBNOVEL
    let firstChapterUrl: string | null = null;
    
    if (isFreeWebNovel) {
      console.log('[Scraper] FreeWebNovel detected, looking for chapter links...');
      
      // Try multiple patterns for FreeWebNovel
      const patterns = [
        /<ul[^>]*class="ul-list5"[^>]*>.*?<li[^>]*>.*?<a[^>]*href="([^"]+)"[^>]*>/i,
        /<ul[^>]*class="[^"]*chapter[^"]*"[^>]*>.*?<li[^>]*>.*?<a[^>]*href="([^"]+)"[^>]*>/i,
        /<a[^>]*href="([^"]*chapter-1[^"]*)"[^>]*>/i,
        /href="([^"]*chapter-1[^"]*)"/i,
        /<a[^>]*href="([^"]+)"[^>]*>Chapter\s*1<\/a>/i,
        /<a[^>]*href="([^"]+)"[^>]*>Start Reading<\/a>/i,
        /<a[^>]*href="([^"]+)"[^>]*>Read First Chapter<\/a>/i,
      ];
      
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          firstChapterUrl = makeAbsoluteUrl(match[1], url);
          console.log('[Scraper] Found FreeWebNovel first chapter:', firstChapterUrl);
          break;
        }
      }
      
      // Fallback: find any chapter link
      if (!firstChapterUrl) {
        const chapterLinks = html.match(/<a[^>]*href="([^"]*chapter[^"]*)"[^>]*>/gi);
        if (chapterLinks && chapterLinks.length > 0) {
          for (const link of chapterLinks) {
            const hrefMatch = link.match(/href="([^"]+)"/i);
            if (hrefMatch && hrefMatch[1]) {
              firstChapterUrl = makeAbsoluteUrl(hrefMatch[1], url);
              break;
            }
          }
        }
      }
    } else {
      // ReadNovelFull and NovelFull extraction
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
    
    // Extract content - ENHANCED FOR FREEWEBNOVEL
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
    
    // If no paragraphs found, try content containers
    if (!content) {
      const contentMatch = html.match(/<div[^>]*class="chapter-content"[^>]*>(.*?)<\/div>/is) ||
                           html.match(/<div[^>]*class="content"[^>]*>(.*?)<\/div>/is) ||
                           html.match(/<article[^>]*>(.*?)<\/article>/is) ||
                           html.match(/<div[^>]*id="chapter-content"[^>]*>(.*?)<\/div>/is);
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
