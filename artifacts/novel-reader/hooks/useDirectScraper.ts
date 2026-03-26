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

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Strip all HTML tags and collapse whitespace */
const stripTags = (html: string): string =>
  html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/** Decode HTML entities including numeric ones (&#8220; → ", &#8217; → ', etc.) */
const decode = (text: string): string => decodeHTML(text);

/** Make any URL absolute given a base */
const makeAbsoluteUrl = (relativeUrl: string, baseUrl: string): string => {
  if (!relativeUrl) return baseUrl;
  if (relativeUrl.startsWith('http')) return relativeUrl;
  try {
    return new URL(relativeUrl, baseUrl).href;
  } catch {
    return relativeUrl;
  }
};

/** Extract a human-readable title from the URL path (fallback) */
const extractTitleFromUrl = (url: string): string => {
  try {
    const parsedUrl = new URL(url);
    let path = parsedUrl.pathname;
    if (path.endsWith('.html')) path = path.slice(0, -5);

    const pathParts = path.split('/').filter(Boolean);

    let novelSlug: string | null = null;
    for (const part of pathParts) {
      if (!part.toLowerCase().includes('chapter') && part.length > 5) {
        novelSlug = part;
        break;
      }
    }
    if (!novelSlug && pathParts.length > 0) {
      novelSlug = pathParts[pathParts.length - 1];
    }

    if (novelSlug) {
      novelSlug = novelSlug.replace(/^\d+[\s\-.]+/, '');
      return novelSlug
        .replace(/[-_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
    return 'Unknown Novel';
  } catch {
    return 'Unknown Novel';
  }
};

/** Shared axios headers mimicking a real browser */
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Cache-Control': 'max-age=0',
};

// ─── Site Detection ──────────────────────────────────────────────────────────

type SiteType = 'readnovelfull' | 'novelfull' | 'freewebnovel' | 'novelbin' | 'generic';

const detectSite = (url: string): SiteType => {
  const d = url.toLowerCase();
  if (d.includes('readnovelfull')) return 'readnovelfull';
  if (d.includes('novelfull')) return 'novelfull';   // must be after readnovelfull
  if (d.includes('freewebnovel')) return 'freewebnovel';
  if (d.includes('novelbin')) return 'novelbin';
  return 'generic';
};

// ─── First-chapter URL extractors ────────────────────────────────────────────

/**
 * ReadNovelFull / NovelFull / Novelbin:
 *   <div id="tab-chapters"> or <div id="list-chapter">
 *     <ul class="list-chapter"><li><a href="...">
 */
const extractFirstChapterRNF = (html: string, baseUrl: string): string | null => {
  const containerMatch = html.match(
    /id="(?:tab-chapters|list-chapter)"[^>]*>[\s\S]*?class="list-chapter"[^>]*>[\s\S]*?<li[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"/i
  );
  if (containerMatch) return makeAbsoluteUrl(containerMatch[1], baseUrl);

  // Fallback: link pointing to chapter-1 / chapter/1
  const ch1Match = html.match(/<a[^>]*href="([^"]*chapter[-/]1[^"]*)"[^>]*>/i);
  if (ch1Match) return makeAbsoluteUrl(ch1Match[1], baseUrl);

  return null;
};

/**
 * FreeWebNovel: <ul class="ul-list5"><li><a href="...">
 */
const extractFirstChapterFWN = (html: string, baseUrl: string): string | null => {
  const match = html.match(
    /class="ul-list5"[^>]*>[\s\S]*?<li[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"/i
  );
  return match ? makeAbsoluteUrl(match[1], baseUrl) : null;
};

// ─── Shared content helpers ──────────────────────────────────────────────────

/** Returns true if text is navigation boilerplate we should skip */
const isNavigationText = (text: string): boolean => {
  const lower = text.toLowerCase();
  return (
    lower.includes('next chapter') ||
    lower.includes('previous chapter') ||
    lower.includes('prev chapter') ||
    lower.includes('back to') ||
    lower.includes('table of contents') ||
    lower.includes('bookmark') ||
    lower.includes('report error')
  );
};

/**
 * Extract all valid content paragraphs from raw HTML.
 * Decodes HTML entities so &#8220; → " and &#8217; → ' etc.
 */
const extractParagraphs = (html: string): string => {
  const matches = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
  if (!matches) return '';

  const valid: string[] = [];
  for (const p of matches) {
    const text = decode(stripTags(p));
    if (text.length > 5 && !isNavigationText(text)) {
      valid.push(text);
    }
  }
  return valid.join('\n\n');
};

/**
 * Find the "Next Chapter" link — mirrors Python's logic exactly.
 * Checks link text AND class/id attributes for "next" keywords.
 */
const extractNextChapterUrl = (html: string, baseUrl: string): string | null => {
  const linkRegex = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const fullTag = match[0];
    const href = match[1];
    const innerText = stripTags(match[2]).toLowerCase();

    const classMatch = fullTag.match(/class=["']([^"']*)["']/i);
    const idMatch = fullTag.match(/id=["']([^"']*)["']/i);
    const attrs =
      (classMatch?.[1] ?? '').toLowerCase() + (idMatch?.[1] ?? '').toLowerCase();

    if (
      innerText.includes('next') ||
      attrs.includes('next') ||
      attrs.includes('next_chapter')
    ) {
      const absolute = makeAbsoluteUrl(href, baseUrl);
      // Guard: skip self-referencing links
      if (absolute !== baseUrl) {
        console.log('[Scraper] Found next chapter:', absolute);
        return absolute;
      }
    }
  }

  console.log('[Scraper] No next chapter found.');
  return null;
};

// ─── fetchNovelMeta ──────────────────────────────────────────────────────────

export const directFetchNovelMeta = async (url: string): Promise<NovelMeta> => {
  console.log('[Scraper] Fetching novel meta from:', url);

  let html: string;
  try {
    const response = await axios.get(url, {
      headers: BROWSER_HEADERS,
      timeout: 15000,
    });
    html = response.data;
  } catch (error: any) {
    console.error('[Scraper] Network error:', error.message);
    throw new Error(`Failed to fetch novel page: ${error.message}`);
  }

  const site = detectSite(url);

  let title = extractTitleFromUrl(url);
  let author = 'Unknown Author';
  let synopsis = 'No summary available.';
  let coverUrl = '';
  let firstChapterUrl: string | null = null;

  // ── ReadNovelFull ──────────────────────────────────────────────────────────
  if (site === 'readnovelfull') {
    // Title
    const titleMatch =
      html.match(/<h3[^>]*class="title"[^>]*>([^<]+)<\/h3>/i) ||
      html.match(/<h1[^>]*class="title"[^>]*>([^<]+)<\/h1>/i);
    if (titleMatch) title = decode(titleMatch[1].trim());

    // Author: <span itemprop="author"><meta itemprop="name" content="...">
    const authorMatch = html.match(
      /itemprop="author"[\s\S]*?itemprop="name"[^>]*content="([^"]+)"/i
    );
    if (authorMatch) author = decode(authorMatch[1].trim());

    // Synopsis: <div itemprop="description"><p>...</p>
    const descMatch = html.match(/<div[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/div>/i);
    if (descMatch) {
      const paragraphs = descMatch[1].match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
      synopsis = paragraphs
        ? paragraphs.map(p => decode(stripTags(p))).filter(Boolean).join('\n\n')
        : decode(stripTags(descMatch[1]));
    }

    // Cover: <div class="book"><img src="...">
    const coverMatch = html.match(/<div[^>]*class="book"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i);
    if (coverMatch) coverUrl = makeAbsoluteUrl(coverMatch[1], url);

    firstChapterUrl = extractFirstChapterRNF(html, url);
  }

  // ── NovelFull ──────────────────────────────────────────────────────────────
  else if (site === 'novelfull') {
    // Title
    const titleMatch =
      html.match(/<h3[^>]*class="title"[^>]*>([^<]+)<\/h3>/i) ||
      html.match(/<h1[^>]*class="title"[^>]*>([^<]+)<\/h1>/i);
    if (titleMatch) title = decode(titleMatch[1].trim());

    // Author: <div class="info">...<h3>Author:</h3><a>Name</a>
    const authorMatch = html.match(
      /<div[^>]*class="info"[^>]*>[\s\S]*?<h3[^>]*>Author:<\/h3>\s*<a[^>]*>([^<]+)<\/a>/i
    );
    if (authorMatch) author = decode(authorMatch[1].trim());

    // Synopsis: <div class="desc-text"><p>...</p>
    const descMatch = html.match(/<div[^>]*class="desc-text"[^>]*>([\s\S]*?)<\/div>/i);
    if (descMatch) {
      const paragraphs = descMatch[1].match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
      synopsis = paragraphs
        ? paragraphs.map(p => decode(stripTags(p))).filter(Boolean).join('\n\n')
        : decode(stripTags(descMatch[1]));
    }

    // Cover
    const coverMatch = html.match(/<div[^>]*class="book"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i);
    if (coverMatch) coverUrl = makeAbsoluteUrl(coverMatch[1], url);

    firstChapterUrl = extractFirstChapterRNF(html, url);
  }

  // ── FreeWebNovel ───────────────────────────────────────────────────────────
  else if (site === 'freewebnovel') {
    // Title
    const titleMatch =
      html.match(/<h1[^>]*class="[^"]*"[^>]*>([^<]+)<\/h1>/i);
    if (titleMatch) title = decode(titleMatch[1].trim());

    // Author: <div class="item"><span title="Author">...<a class="a1">Name</a>
    const authorMatch = html.match(/title="Author"[\s\S]*?<a[^>]*class="a1"[^>]*>([^<]+)<\/a>/i);
    if (authorMatch) author = decode(authorMatch[1].trim());

    // Synopsis: <div class="m-desc"><div class="inner"><p>...</p>
    const descMatch = html.match(
      /<div[^>]*class="m-desc"[^>]*>[\s\S]*?<div[^>]*class="inner"[^>]*>([\s\S]*?)<\/div>/i
    );
    if (descMatch) {
      const paragraphs = descMatch[1].match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
      synopsis = paragraphs
        ? paragraphs.map(p => decode(stripTags(p))).filter(Boolean).join('\n\n')
        : decode(stripTags(descMatch[1]));
    }

    // Cover: <div class="pic"><img src="...">
    const coverMatch = html.match(/<div[^>]*class="pic"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i);
    if (coverMatch) coverUrl = makeAbsoluteUrl(coverMatch[1], url);

    firstChapterUrl = extractFirstChapterFWN(html, url);
  }

  // ── Novelbin ───────────────────────────────────────────────────────────────
  else if (site === 'novelbin') {
    // Title: inside <div class="col-xs-12 col-sm-8 desc"><h3 class="title">
    const titleMatch = html.match(
      /col-xs-12 col-sm-8 desc[\s\S]*?<h3[^>]*class="title"[^>]*>([^<]+)<\/h3>/i
    );
    if (titleMatch) title = decode(titleMatch[1].trim());

    // Author: <ul class="info info-meta">...<h3>Author:</h3><a>Name</a>
    const authorMatch = html.match(
      /class="info info-meta"[\s\S]*?<h3[^>]*>Author:<\/h3>\s*<a[^>]*>([^<]+)<\/a>/i
    );
    if (authorMatch) author = decode(authorMatch[1].trim());

    // Synopsis: <div class="desc-text" itemprop="description"><p>...
    const descMatch =
      html.match(/<div[^>]*class="desc-text"[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<div[^>]*itemprop="description"[^>]*>([\s\S]*?)<\/div>/i);
    if (descMatch) {
      const paragraphs = descMatch[1].match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
      synopsis = paragraphs
        ? paragraphs.map(p => decode(stripTags(p))).filter(Boolean).join('\n\n')
        : decode(stripTags(descMatch[1]));
    }

    // Cover
    const coverMatch =
      html.match(/<div[^>]*class="book"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i) ||
      html.match(/<img[^>]*class="[^"]*cover[^"]*"[^>]*src="([^"]+)"/i);
    if (coverMatch) coverUrl = makeAbsoluteUrl(coverMatch[1], url);

    // First chapter: find the #list-chapter section and grab the very first <a>
    const listSection = html.match(/id="list-chapter"([\s\S]*?)(?=id="tab-description"|<\/section|<footer)/i);
    if (listSection) {
      const firstA = listSection[1].match(/<a[^>]*href="([^"]+)"/i);
      if (firstA) firstChapterUrl = makeAbsoluteUrl(firstA[1], url);
    }
    if (!firstChapterUrl) firstChapterUrl = extractFirstChapterRNF(html, url);
  }

  // ── Generic fallback ───────────────────────────────────────────────────────
  else {
    const titleMatch =
      html.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
      html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) title = decode(titleMatch[1].trim());
    firstChapterUrl = extractFirstChapterRNF(html, url);
  }

  console.log('[Scraper] Site:', site, '| Title:', title, '| First chapter:', firstChapterUrl);

  return {
    title: decode(title),
    author: decode(author),
    synopsis: decode(synopsis),
    coverUrl,
    firstChapterUrl,
  };
};

// ─── fetchChapter ────────────────────────────────────────────────────────────

export const directFetchChapter = async (
  url: string,
  chapterNum: number
): Promise<ChapterData> => {
  console.log('[Scraper] Fetching chapter:', url);

  let html: string;
  try {
    const response = await axios.get(url, {
      headers: BROWSER_HEADERS,
      timeout: 15000,
    });
    html = response.data;
  } catch (error: any) {
    console.error('[Scraper] Network error:', error.message);
    throw new Error(`Failed to fetch chapter ${chapterNum}: ${error.message}`);
  }

  const site = detectSite(url);

  // ── Chapter title ──────────────────────────────────────────────────────────
  let title = `Chapter ${chapterNum}`;
  const titleMatch = html.match(
    /<(?:h1|h2|span)[^>]*class="(?:chapter-title|chr-title|entry-title)"[^>]*>([^<]+)</i
  );
  if (titleMatch) {
    const rawTitle = decode(stripTags(titleMatch[1]));
    const cleanTitle = rawTitle.replace(/^Chapter\s*\d+\s*[:\-]*\s*/i, '').trim();
    if (cleanTitle) title = `Chapter ${chapterNum}: ${cleanTitle}`;
  }

  // ── Chapter content ────────────────────────────────────────────────────────
  let content = '';

  if (site === 'freewebnovel') {
    // FreeWebNovel wraps content in a dedicated container
    const containerMatch =
      html.match(/<div[^>]*class="chapter-content"[^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<div[^>]*id="chapter-container"[^>]*>([\s\S]*?)<\/div>/i);

    if (containerMatch) {
      const paragraphs = containerMatch[1].match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
      if (paragraphs) {
        const valid = paragraphs
          .map(p => decode(stripTags(p)))
          .filter(t => t.length > 5 && !isNavigationText(t));
        content = valid.join('\n\n');
      }
    }

    // Fallback if container not matched
    if (!content) content = extractParagraphs(html);
  } else {
    // ReadNovelFull, NovelFull, Novelbin, Generic — all use standard <p> tags
    // For NovelFull especially, decoding here fixes &#8220; / &#8217; etc.
    content = extractParagraphs(html);
  }

  // ── Next chapter URL ───────────────────────────────────────────────────────
  const nextUrl = extractNextChapterUrl(html, url);

  return {
    url,
    title,
    content: content || 'No content available.',
    nextUrl,
  };
};
