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

// ========== HELPERS ==========
const stripTags = (html: string): string => {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

const decodeEntities = (text: string): string => {
  if (!text) return '';
  try { return decodeHTML(text); } catch { return text; }
};

const safeMatch = (text: string, pattern: RegExp): string | null => {
  if (!text) return null;
  try {
    const match = text.match(pattern);
    return match ? match[1] : null;
  } catch { return null; }
};

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
    if (!novelSlug && pathParts.length > 0) novelSlug = pathParts[pathParts.length - 1];
    if (novelSlug) {
      novelSlug = novelSlug.replace(/^\d+[\s\-\.]+/, '');
      const title = novelSlug.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
      return title.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }
    return 'Unknown Novel';
  } catch { return 'Unknown Novel'; }
};

const makeAbsoluteUrl = (relativeUrl: string, baseUrl: string): string => {
  if (!relativeUrl) return baseUrl;
  if (relativeUrl.startsWith('http')) return relativeUrl;
  if (relativeUrl.startsWith('/')) {
    try {
      const parsed = new URL(baseUrl);
      return `${parsed.protocol}//${parsed.host}${relativeUrl}`;
    } catch { return relativeUrl; }
  }
  try { return new URL(relativeUrl, baseUrl).href; } catch { return relativeUrl; }
};

const httpClient = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,image/jpg,image/jpeg,image/png,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
  },
});

const fetchWithFallback = async (url: string, isFreeWebNovel: boolean): Promise<string> => {
  if (isFreeWebNovel) {
    console.log('[Scraper] FreeWebNovel - using proxy');
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    try {
      const response = await httpClient.get(proxyUrl);
      return response.data;
    } catch (proxyError: any) {
      console.warn('[Scraper] Proxy failed, trying direct:', proxyError?.message);
      const directResponse = await httpClient.get(url);
      return directResponse.data;
    }
  }
  try {
    const response = await httpClient.get(url);
    return response.data;
  } catch (directError: any) {
    console.warn('[Scraper] Direct fetch failed, trying proxy:', directError?.message);
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const proxyResponse = await httpClient.get(proxyUrl);
    return proxyResponse.data;
  }
};

// ========== METADATA EXTRACTION (FULL NEW VERSION) ==========
export const directFetchNovelMeta = async (url: string): Promise<NovelMeta> => {
  console.log('[Scraper] Fetching novel meta from:', url);
  try {
    const domainLower = url.toLowerCase();
    const isReadNovelFull = domainLower.includes('readnovelfull');
    const isNovelFullNet = domainLower.includes('novelfull.net') && !isReadNovelFull;
    const isNovelFullCom = domainLower.includes('novelfull.com');
    const isAllNovel = domainLower.includes('allnovel.org');
    const isNovgo = domainLower.includes('novgo.net');
    const isFreeWebNovel = domainLower.includes('freewebnovel') || domainLower.includes('bednovel');
    const isNovelBin = domainLower.includes('novelbin');
    const isLightNovelWorld = domainLower.includes('lightnovelworld');
    
    const html = await fetchWithFallback(url, isFreeWebNovel);
    let title = extractTitleFromUrl(url);
    let author = 'Unknown Author';
    let synopsis = 'No summary available.';
    let coverUrl = '';
    let firstChapterUrl: string | null = null;
    
    // NovelFull family
    if (isReadNovelFull || isNovelFullNet || isNovelFullCom || isAllNovel || isNovgo) {
      const titleMatch = safeMatch(html, /<h3[^>]*class="title"[^>]*>([^<]+)<\/h3>/i) ||
                         safeMatch(html, /<h1[^>]*class="title"[^>]*>([^<]+)<\/h1>/i) ||
                         safeMatch(html, /<div[^>]*class="book-title"[^>]*>([^<]+)<\/div>/i);
      if (titleMatch) title = decodeEntities(titleMatch);
      if (isReadNovelFull) {
        const authorMatch = safeMatch(html, /<span[^>]*itemprop="author"[^>]*>.*?<meta[^>]*itemprop="name"[^>]*content="([^"]+)"/i);
        if (authorMatch) author = decodeEntities(authorMatch);
      }
      if (isNovelFullNet || isNovelFullCom || isAllNovel || isNovgo) {
        const authorMatch = safeMatch(html, /<div[^>]*class="info"[^>]*>[\s\S]*?<h3>Author:<\/h3>\s*<a[^>]*>([^<]+)<\/a>/i);
        if (authorMatch) author = decodeEntities(authorMatch);
      }
      let descHtml = '';
      if (isReadNovelFull) {
        const descMatch = safeMatch(html, /<div[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/div>/i);
        if (descMatch) descHtml = descMatch;
      } else if (isNovelFullNet || isNovelFullCom || isAllNovel || isNovgo) {
        const descMatch = safeMatch(html, /<div[^>]*class="desc-text"[^>]*>([\s\S]*?)<\/div>/i);
        if (descMatch) descHtml = descMatch;
      }
      if (descHtml) {
        const paragraphs = descHtml.match(/<p[^>]*>(.*?)<\/p>/gis);
        if (paragraphs && paragraphs.length > 0) {
          synopsis = paragraphs.map(p => decodeEntities(stripTags(p))).filter(p => p.trim().length > 0).join('\n\n');
        } else {
          synopsis = decodeEntities(stripTags(descHtml));
        }
      }
      const coverMatch = safeMatch(html, /<div[^>]*class="book"[^>]*>.*?<img[^>]*src="([^"]+)"[^>]*>/i);
      if (coverMatch) coverUrl = makeAbsoluteUrl(coverMatch, url);
      const chapterMatch = safeMatch(html, /<(?:div|ul)[^>]*(?:id="(?:tab-chapters|list-chapter)"|class="list-chapter")[^>]*>.*?<li[^>]*>.*?<a[^>]*href="([^"]+)"/i);
      if (chapterMatch) firstChapterUrl = makeAbsoluteUrl(chapterMatch, url);
      else {
        const chapterLinkMatch = safeMatch(html, /<a[^>]*href="([^"]*chapter[-/]1[^"]*)"[^>]*>/i);
        if (chapterLinkMatch) firstChapterUrl = makeAbsoluteUrl(chapterLinkMatch, url);
      }
    }
    
    // FreeWebNovel
    if (isFreeWebNovel) {
      console.log('[Scraper] FreeWebNovel detected');
      let baseNovelUrl = url.replace(/\/$/, '');
      if (baseNovelUrl.includes('/chapter-')) baseNovelUrl = baseNovelUrl.split('/chapter-')[0];
      firstChapterUrl = `${baseNovelUrl}/chapter-1`;
      const titleMatch = safeMatch(html, /<h1[^>]*class="tit"[^>]*>([^<]+)<\/h1>/i);
      if (titleMatch) title = decodeEntities(titleMatch);
      const coverMatch = safeMatch(html, /<div[^>]*class="pic"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*>/i);
      if (coverMatch) coverUrl = makeAbsoluteUrl(coverMatch, url);
      const authorMatch = safeMatch(html, /<div[^>]*class="item"[^>]*>[\s\S]*?<div[^>]*class="right"[^>]*>[\s\S]*?<a[^>]*class="a1"[^>]*>([^<]+)<\/a>/i);
      if (authorMatch) author = decodeEntities(authorMatch);
      const innerMatch = safeMatch(html, /<div[^>]*class="inner"[^>]*>([\s\S]*?)<\/div>/i);
      if (innerMatch) {
        const paragraphs = innerMatch.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
        if (paragraphs) synopsis = paragraphs.map(p => decodeEntities(stripTags(p))).filter(p => p.trim().length > 0).join('\n\n');
      }
    }
    
    // NovelBin
    if (isNovelBin) {
      console.log('[Scraper] Novelbin detected');
      const titleMatch = safeMatch(html, /<h3[^>]*class="title"[^>]*itemprop="name"[^>]*>([^<]+)<\/h3>/i) ||
                         safeMatch(html, /<h3[^>]*itemprop="name"[^>]*class="title"[^>]*>([^<]+)<\/h3>/i);
      if (titleMatch) title = decodeEntities(titleMatch);
      const coverMatch = safeMatch(html, /<div[^>]*class="book"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*>/i);
      if (coverMatch) coverUrl = makeAbsoluteUrl(coverMatch, url);
      const authorMatch = safeMatch(html, /<span[^>]*itemprop="author"[^>]*>[\s\S]*?<meta[^>]*itemprop="name"[^>]*content="([^"]+)"/i);
      if (authorMatch) author = decodeEntities(authorMatch);
      const descDivMatch = html.match(/<div[^>]*id="novel-description-content"[^>]*>([\s\S]*?)<\/div>/i);
      if (descDivMatch) {
        const innerHtml = descDivMatch[1];
        const paragraphs = innerHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
        if (paragraphs && paragraphs.length > 0) {
          synopsis = paragraphs.map(p => decodeEntities(stripTags(p))).filter(t => t.length > 20).join('\n\n');
        } else {
          synopsis = decodeEntities(stripTags(innerHtml));
        }
      }
      const chapterMatch = safeMatch(html, /<a[^>]*href="([^"]*\/chapter-1[^"]*)"[^>]*>/i);
      if (chapterMatch) firstChapterUrl = makeAbsoluteUrl(chapterMatch, url);
    }
    
    // LightNovelWorld
    if (isLightNovelWorld) {
      console.log('[Scraper] LightNovelWorld detected');
      const titleMatch = safeMatch(html, /<h1[^>]*class="novel-title"[^>]*>([^<]+)<\/h1>/i);
      if (titleMatch) title = decodeEntities(titleMatch);
      const authorMatch = safeMatch(html, /<p[^>]*class="novel-author"[^>]*>[\s\S]*?<a[^>]*class="author-link"[^>]*>([^<]+)<\/a>/i);
      if (authorMatch) author = decodeEntities(authorMatch.trim());
      else {
        const authorFallback = safeMatch(html, /<p[^>]*class="novel-author"[^>]*>([\s\S]*?)<\/p>/i);
        if (authorFallback) author = decodeEntities(stripTags(authorFallback).replace(/^Author:\s*/i, '').trim());
      }
      const coverMatch = safeMatch(html, /<img[^>]*class="novel-cover"[^>]*src="([^"]+)"/i) ||
                         safeMatch(html, /<img[^>]*src="([^"]+)"[^>]*class="novel-cover"/i);
      if (coverMatch) coverUrl = makeAbsoluteUrl(coverMatch, url);
      const summaryMatch = safeMatch(html, /<div[^>]*class="summary-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (summaryMatch) {
        const paragraphs = summaryMatch.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
        if (paragraphs) synopsis = paragraphs.map(p => decodeEntities(stripTags(p))).filter(t => t.length > 0).join('\n\n');
      }
      const baseNovelUrl = url.replace(/\/$/, '');
      firstChapterUrl = `${baseNovelUrl}/chapter/1/`;
    }
    
    return { title: decodeEntities(title), author: decodeEntities(author), synopsis: decodeEntities(synopsis), coverUrl, firstChapterUrl };
  } catch (error: any) {
    throw new Error(`Failed to fetch novel: ${error.message}`);
  }
};

// ========== CHAPTER EXTRACTION (NEW TITLE + OLD CONTENT) ==========
export const directFetchChapter = async (url: string, chapterNum: number): Promise<ChapterData> => {
  console.log('[Scraper] Fetching chapter:', url);
  try {
    const domainLower = url.toLowerCase();
    const isReadNovelFull = domainLower.includes('readnovelfull');
    const isNovelFull = domainLower.includes('novelfull') && !isReadNovelFull;
    const isFreeWebNovel = domainLower.includes('freewebnovel') || domainLower.includes('bednovel');
    const isNovelBin = domainLower.includes('novelbin');
    const isLightNovelWorld = domainLower.includes('lightnovelworld');
    const isAllNovel = domainLower.includes('allnovel.org');
    const isNovgo = domainLower.includes('novgo.net');
    const isNovelFullCom = domainLower.includes('novelfull.com');
    const isNovelFullNet = domainLower.includes('novelfull.net');

    const html = await fetchWithFallback(url, isFreeWebNovel);
    
    // ===== TITLE EXTRACTION (from NEW scraper) =====
    let title = `Chapter ${chapterNum}`;
    let skipCleanup = false;
    
    if (isReadNovelFull || isNovelFullNet || isNovelFullCom || isAllNovel || isNovgo) {
      const titleMatch = safeMatch(html, /<span[^>]*class="(?:chr-text|chapter-text)"[^>]*>([^<]+)<\/span>/i) ||
                         safeMatch(html, /<a[^>]*class="(?:chr-title|chapter-title)"[^>]*title="([^"]+)"/i) ||
                         safeMatch(html, /<(?:h2|h3)[^>]*class="(?:chapter-title|title|chapter)"[^>]*>([^<]+)<\/(?:h2|h3)>/i) ||
                         safeMatch(html, /<(?:h2|h3)[^>]*>([^<]*Chapter[^<]*)<\/(?:h2|h3)>/i);
      if (titleMatch) {
        let rawTitle = decodeEntities(titleMatch.trim()).replace(/\s+/g, ' ').trim();
        rawTitle = rawTitle.replace(/^.*Chapter\s+\d+(\s+\d+)?\s*[:.\-–—]?\s*/i, '').trim();
        rawTitle = rawTitle.replace(/^[\s,]+/, '').trim();
        title = rawTitle.length > 0 ? `Chapter ${chapterNum}: ${rawTitle}` : `Chapter ${chapterNum}`;
        skipCleanup = true;
      }
    }
    if (isFreeWebNovel) {
      const titleMatch = safeMatch(html, /<h1[^>]*class="tit"[^>]*>([^<]+)<\/h1>/i) ||
                         safeMatch(html, /<h4[^>]*>([^<]*Chapter[^<]*)<\/h4>/i) ||
                         safeMatch(html, /<h2[^>]*>([^<]*Chapter[^<]*)<\/h2>/i);
      if (titleMatch) {
        let rawTitle = decodeEntities(titleMatch.trim()).replace(/\s+/g, ' ').trim();
        rawTitle = rawTitle.replace(/Chapter\s+\d+\s*[:.\-–—]\s*/gi, '').trim();
        rawTitle = rawTitle.replace(new RegExp(`^\\s*${chapterNum}\\s*[:.\\-–—]?\\s*`, 'i'), '').trim();
        title = rawTitle.length > 0 ? `Chapter ${chapterNum}: ${rawTitle}` : `Chapter ${chapterNum}`;
        skipCleanup = true;
      }
    }
    if (isNovelBin) {
      const titleMatch = safeMatch(html, /<span[^>]*class="chr-text"[^>]*>([^<]+)<\/span>/i) ||
                         safeMatch(html, /<a[^>]*class="chr-title"[^>]*title="([^"]+)"/i) ||
                         safeMatch(html, /<h3[^>]*class="title"[^>]*>([^<]+)<\/h3>/i) ||
                         safeMatch(html, /<(?:h2|h3)[^>]*>([^<]*Chapter[^<]*)<\/(?:h2|h3)>/i);
      if (titleMatch) {
        let rawTitle = decodeEntities(titleMatch.trim()).replace(/\s+/g, ' ').trim();
        rawTitle = rawTitle.replace(/^.*Chapter\s+\d+(\s+\d+)?\s*[:.\-–—]?\s*/i, '').trim();
        title = rawTitle.length > 0 ? `Chapter ${chapterNum}: ${rawTitle}` : `Chapter ${chapterNum}`;
        skipCleanup = true;
      }
    }
    if (isLightNovelWorld) {
      const titleMatch = safeMatch(html, /<h1[^>]*class="chapter-title"[^>]*>([^<]+)<\/h1>/i) ||
                         safeMatch(html, /<h2[^>]*class="chapter-title"[^>]*>([^<]+)<\/h2>/i) ||
                         safeMatch(html, /<h1[^>]*>([^<]*Chapter[^<]*)<\/h1>/i) ||
                         safeMatch(html, /<span[^>]*class="chapter-title"[^>]*>([^<]+)<\/span>/i);
      if (titleMatch) { title = decodeEntities(titleMatch.trim()); skipCleanup = true; }
    }
    if (!skipCleanup && title === `Chapter ${chapterNum}`) {
      const genericMatch = safeMatch(html, /<(?:h1|h2|h3)[^>]*>([^<]*(?:Chapter|Ch\.|Volume|Vol\.|Part|Book)[^<]*)<\/(?:h1|h2|h3)>/i);
      if (genericMatch) title = decodeEntities(genericMatch.trim());
    }
    if (!skipCleanup && (title === `Chapter ${chapterNum}` || title.match(/^Chapter\s+\d+$/i))) {
      const firstLineMatch = html.match(/<p[^>]*>([^<]*Chapter[^<]*)<\/p>/i);
      if (firstLineMatch) {
        const extractedTitle = decodeEntities(stripTags(firstLineMatch[1])).trim();
        if (extractedTitle.length > 0 && extractedTitle.length < 100) title = extractedTitle;
      }
    }
    console.log('[Scraper] Extracted title:', title);
    
    // ===== CONTENT EXTRACTION (OLD version with line breaks) =====
    let paragraphMatches: string[] | null = null;
    if (isFreeWebNovel) {
      const containerMatch = html.match(/<div[^>]*class="chapter-content"[^>]*>([\s\S]*?)<\/div>/i) ||
                             html.match(/<div[^>]*id="chapter-container"[^>]*>([\s\S]*?)<\/div>/i);
      if (containerMatch) paragraphMatches = containerMatch[1].match(/<p[^>]*>([\s\S]*?)<\/p>/gis);
    }
    if (isLightNovelWorld && !paragraphMatches) {
      const containerMatch = html.match(/<div[^>]*id="chapterText"[^>]*>([\s\S]*?)<\/div>/i) ||
                             html.match(/<div[^>]*class="chapter-text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (containerMatch) {
        let cleaned = containerMatch[1]
          .replace(/<div[^>]*class="chapter-ad-container"[^>]*>[\s\S]*?<\/div>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<div[^>]*class="text-to-speech[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
          .replace(/<div[^>]*class="cta-banner[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
        paragraphMatches = cleaned.match(/<p[^>]*>([\s\S]*?)<\/p>/gis);
      }
    }
    if (!paragraphMatches) paragraphMatches = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gis);
    
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
    const junkPhrasesCommon = [
      'error loading comments', 'please try again later', 'total responses', 'load comments',
      'login to comment', 'post a comment', 'report error', 'novelbin.com', 'novelbin.me',
      'we are offering free books', 'read novel updated daily', 'light novel translations',
      'web novel, chinese novel', 'japanese novel, korean novel', 'other novel online', '𝕗𝚛𝚎𝚎𝐰𝗲𝗯𝗻𝚘𝚟𝚎𝗹.𝕔𝐨𝕞',
      'novelfull.com', 'readnovelfull.com', 'allnovel.org', 'novgo.net', 'panda', 'nove1', 'coM ......',
      // Navigation
      'next chapter', 'previous chapter', 'table of contents', 'back to', 'chapter list',
      'go to', 'return to', 'click to read', 'select chapter',
      
      // Comments & social
      'error loading comments', 'please try again later', 'total responses',
      'load comments', 'login to comment', 'post a comment', 'report error',
      'community', 'share your thoughts', 'react to the', 'latest chapter',
      'or reply', 'to other readers', 'thoughtful comments', 'make this page',
      'more useful', 'for everyone', 'support the author', 'donate', 'patreon',
      'comment', 'reply', 'like', 'share', 'follow', 'subscribe',
      
      // Site-specific domains
      'novelbin.com', 'novelbin.me', 'freewebnovel.com', 'freewebnovel', 
      'bednovel.com', 'bednovel', 'novelfull.com', 'readnovelfull.com', 
      'allnovel.org', 'novgo.net', 'lightnovelworld',
      
      // TTS & account (LightNovelWorld)
      'text-to-speech is here', 'create a free account', 'unlock the full experience',
      'verification code', 'resend code', 'staff account detected',
      'forgot password', 'reset password', 'confirm password', 'username password',
      'mark as spoiler', 'poll options', 'add option', 'cancel post', 'posting...',
      'verifying...', 'sending...', 'resetting...', 'window.initializecomments',
      'your gateway to infinite stories', 'loading chapters...', 'chapter comments',
      'please follow common sense when posting comments',
      'spam, phishing, or any sort of suspicious comment will be deleted',
      
      // NovelFull promotions
      'we are offering free books', 'read novel updated daily', 'light novel translations',
      'web novel, chinese novel', 'japanese novel, korean novel', 'other novel online',
      
      // FreeWebNovel clutter
      'panda', 'novɐ1', 'please visit', 'for a better experience', 'click here',
      'download the app', 'read latest chapters', 'follow on', 'facebook',
      'twitter', 'instagram', 'discord',
      
      // Ads & promotions
      'advertisement', 'sponsored', 'download app', 'read more', 'visit our',
      'check out', 'limited time', 'special offer', 'buy me a coffee',
      'support us', 'become a patron', 'disable adblock', 'whitelist',
      
      // Generic junk
      'copyright', 'dmca', 'all rights reserved', 'terms of service',
      'privacy policy', 'contact us', 'about us', '©', '®', '™',

    ];
    
    const filtered = validParagraphs.filter(text => {
      const lower = text.toLowerCase();
      return !junkPhrasesCommon.some(phrase => lower.includes(phrase));
    });
    content = filtered.join('\n\n') || validParagraphs.join('\n\n');
    
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
    
    // Find next chapter URL
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
      if ((txt.includes('next') || txt.includes('next chapter') || attrs.includes('next') || attrs.includes('next_chapter')) && href) {
        nextUrl = makeAbsoluteUrl(href, url);
        console.log('[Scraper] Found next chapter:', nextUrl);
        break;
      }
    }
    
    return { url, title: decodeEntities(title), content: content || 'No content available.', nextUrl };
  } catch (error: any) {
    console.error('[Scraper] Error:', error.message);
    throw new Error(`Failed to fetch chapter: ${error.message}`);
  }
};

// ========== DOWNLOAD LOOP (with retries, circular detection, max chapters) ==========
export async function downloadNovelByCrawling(
  startUrl: string,
  novelId: string,
  saveChapter: (novelId: string, chapterIndex: number, title: string, content: string) => Promise<void>,
  onProgress?: (chapterNumber: number, title: string) => void,
  delayMs: number = 500
): Promise<void> {
  let currentUrl: string | null = startUrl;
  let chapterNumber = 1;
  const MAX_CHAPTERS = 5000;
  const seenUrls = new Set<string>();

  while (currentUrl) {
    if (chapterNumber > MAX_CHAPTERS) {
      console.warn(`[Downloader] Hit chapter cap (${MAX_CHAPTERS}), stopping.`);
      break;
    }
    if (seenUrls.has(currentUrl)) {
      console.warn(`[Downloader] Circular URL detected at chapter ${chapterNumber}, stopping.`);
      break;
    }
    seenUrls.add(currentUrl);
    console.log(`[Downloader] Fetching chapter ${chapterNumber} from ${currentUrl}`);

    let retries = 2;
    let success = false;
    while (retries >= 0 && !success) {
      try {
        const chapter = await directFetchChapter(currentUrl, chapterNumber);
        await saveChapter(novelId, chapterNumber, chapter.title, chapter.content);
        if (onProgress) onProgress(chapterNumber, chapter.title);
        currentUrl = chapter.nextUrl;
        chapterNumber++;
        success = true;
        if (delayMs > 0 && currentUrl) await new Promise(resolve => setTimeout(resolve, delayMs));
      } catch (error: any) {
        retries--;
        if (retries >= 0) {
          console.warn(`[Downloader] Chapter ${chapterNumber} failed, retrying (${retries} left):`, error.message);
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          console.error(`[Downloader] Chapter ${chapterNumber} permanently failed:`, error.message);
          throw new Error(`Download stopped at chapter ${chapterNumber}: ${error.message}`);
        }
      }
    }
  }
  console.log(`[Downloader] Completed. Total chapters: ${chapterNumber - 1}`);
}
