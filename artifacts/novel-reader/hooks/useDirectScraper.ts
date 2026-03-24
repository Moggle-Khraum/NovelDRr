import axios from 'axios';
import * as cheerio from 'cheerio';
import { Platform } from 'react-native';

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

// Configure axios for native platforms
const axiosInstance = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
  }
});

// Helper to extract title from URL (copied from Python version)
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
  try {
    return new URL(relativeUrl, baseUrl).href;
  } catch {
    return relativeUrl;
  }
};

const extractChapterNumber = (url: string): number => {
  const match = url.match(/chapter[-\/](\d+)/i);
  if (match) return parseInt(match[1]);
  const numbers = url.match(/\d+/g);
  if (numbers) return parseInt(numbers[numbers.length - 1]);
  return 1;
};

export const directFetchNovelMeta = async (url: string): Promise<NovelMeta> => {
  console.log('[Scraper] Fetching novel meta from:', url);
  
  try {
    const response = await axiosInstance.get(url);
    const html = response.data;
    const $ = cheerio.load(html);
    
    const domainLower = url.toLowerCase();
    const isReadNovelFull = domainLower.includes('readnovelfull');
    const isNovelFull = domainLower.includes('novelfull') && !isReadNovelFull;
    const isFreeWebNovel = domainLower.includes('freewebnovel');
    
    // Extract title
    let title = extractTitleFromUrl(url);
    
    if (isReadNovelFull || isNovelFull) {
      const titleElem = $('h3.title, h1.title, .book-title');
      if (titleElem.length) title = titleElem.first().text().trim();
    } else if (isFreeWebNovel) {
      const titleElem = $('h1.novel-title, h1.title');
      if (titleElem.length) title = titleElem.first().text().trim();
    }
    
    // Extract author
    let author = 'Unknown Author';
    
    if (isReadNovelFull) {
      const authorSpan = $('span[itemprop="author"]');
      const authorMeta = authorSpan.find('meta[itemprop="name"]');
      if (authorMeta.length) author = authorMeta.attr('content') || 'Unknown';
    } else if (isNovelFull) {
      const infoDiv = $('div.info');
      const authorH3 = infoDiv.find('h3:contains("Author:")');
      if (authorH3.length) {
        const authorLink = authorH3.next('a');
        if (authorLink.length) author = authorLink.text().trim();
      }
    } else if (isFreeWebNovel) {
      const authorItem = $('div.item');
      if (authorItem.length) {
        const authorLink = authorItem.find('div.right a.a1');
        if (authorLink.length) author = authorLink.text().trim();
      }
    }
    
    // Extract synopsis
    let synopsis = 'No summary available.';
    
    if (isReadNovelFull) {
      const descDiv = $('div[itemprop="description"]');
      if (descDiv.length) {
        const paragraphs = descDiv.find('p');
        if (paragraphs.length) {
          synopsis = paragraphs.map((i, el) => $(el).text().trim()).get().join('\n\n');
        } else {
          synopsis = descDiv.text().trim();
        }
      }
    } else if (isNovelFull) {
      const descDiv = $('div.desc-text');
      if (descDiv.length) {
        const paragraphs = descDiv.find('p');
        if (paragraphs.length) {
          synopsis = paragraphs.map((i, el) => $(el).text().trim()).get().join('\n\n');
        } else {
          synopsis = descDiv.text().trim();
        }
      }
    } else if (isFreeWebNovel) {
      const descDiv = $('div.m-desc');
      if (descDiv.length) {
        const inner = descDiv.find('div.inner');
        if (inner.length) {
          const paragraphs = inner.find('p');
          if (paragraphs.length) {
            synopsis = paragraphs.map((i, el) => $(el).text().trim()).get().join('\n\n');
          }
        }
      }
    }
    
    // Extract cover URL
    let coverUrl = '';
    
    if (isFreeWebNovel) {
      const picDiv = $('div.pic');
      if (picDiv.length) {
        const imgTag = picDiv.find('img');
        if (imgTag.length && imgTag.attr('src')) {
          coverUrl = makeAbsoluteUrl(imgTag.attr('src')!, url);
        }
      }
    }
    
    if (!coverUrl && (isReadNovelFull || isNovelFull)) {
      const coverDiv = $('div.book');
      if (coverDiv.length) {
        const imgTag = coverDiv.find('img');
        if (imgTag.length && imgTag.attr('src')) {
          coverUrl = makeAbsoluteUrl(imgTag.attr('src')!, url);
        }
      }
    }
    
    // Extract first chapter URL
    let firstChapterUrl: string | null = null;
    
    if (isFreeWebNovel) {
      const ul = $('ul.ul-list5');
      if (ul.length) {
        const firstLi = ul.find('li:first-child');
        if (firstLi.length) {
          const firstA = firstLi.find('a');
          if (firstA.length && firstA.attr('href')) {
            firstChapterUrl = makeAbsoluteUrl(firstA.attr('href')!, url);
          }
        }
      }
    } else {
      const chapterContainer = $('#tab-chapters, #list-chapter');
      if (chapterContainer.length) {
        const chapterUl = chapterContainer.find('ul.list-chapter');
        if (chapterUl.length) {
          const firstLi = chapterUl.find('li:first-child');
          if (firstLi.length) {
            const firstA = firstLi.find('a');
            if (firstA.length && firstA.attr('href')) {
              firstChapterUrl = makeAbsoluteUrl(firstA.attr('href')!, url);
            }
          }
        }
      }
      
      if (!firstChapterUrl) {
        const chapterLinks = $('a[href*="chapter"]');
        for (let i = 0; i < chapterLinks.length; i++) {
          const link = chapterLinks.eq(i);
          const href = link.attr('href');
          const text = link.text().toLowerCase();
          if (href && (text.includes('chapter 1') || href.includes('chapter-1') || href.includes('chapter1'))) {
            firstChapterUrl = makeAbsoluteUrl(href, url);
            break;
          }
        }
      }
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
    const response = await axiosInstance.get(url);
    const html = response.data;
    const $ = cheerio.load(html);
    
    // Extract chapter title
    let title = `Chapter ${chapterNum}`;
    const titleTag = $('h1.chapter-title, h2.chr-title, span.entry-title, .chapter-title');
    if (titleTag.length) {
      const rawTitle = titleTag.first().text().trim();
      const cleanTitle = rawTitle.replace(/^Chapter\s*\d+\s*[:\-]*\s*/i, '');
      if (cleanTitle && cleanTitle.length > 0) {
        title = `Chapter ${chapterNum}: ${cleanTitle}`;
      }
    }
    
    // Extract content (like Python version)
    let content = '';
    const paragraphs = $('p');
    
    if (paragraphs.length) {
      const textParagraphs: string[] = [];
      paragraphs.each((i, el) => {
        const text = $(el).text().trim();
        if (text.length > 5 && !text.toLowerCase().includes('next chapter')) {
          textParagraphs.push(text);
        }
      });
      content = textParagraphs.join('\n\n');
    }
    
    // Fallback to article content
    if (!content) {
      const article = $('article, .chapter-content, .content-inner');
      if (article.length) {
        const articleParagraphs = article.find('p');
        if (articleParagraphs.length) {
          content = articleParagraphs.map((i, el) => $(el).text().trim()).get().join('\n\n');
        } else {
          content = article.text().trim();
        }
      }
    }
    
    // Find next chapter URL
    let nextUrl: string | null = null;
    const nextLinks = $('a');
    
    for (let i = 0; i < nextLinks.length; i++) {
      const link = nextLinks.eq(i);
      const text = link.text().toLowerCase();
      const href = link.attr('href');
      const classes = link.attr('class') || '';
      const id = link.attr('id') || '';
      
      if (href && (text.includes('next') || text.includes('next chapter') || 
                   classes.includes('next') || id.includes('next'))) {
        nextUrl = makeAbsoluteUrl(href, url);
        break;
      }
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

