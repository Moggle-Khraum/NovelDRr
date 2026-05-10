// Helper: extract inner HTML of a div by class name with proper nesting
const extractDivByClass = (html: string, className: string): string | null => {
  const openTagRegex = new RegExp(`<div[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>`, 'i');
  const startMatch = html.match(openTagRegex);
  if (!startMatch) return null;
  
  const startIndex = startMatch.index!;
  let openTagLength = startMatch[0].length;
  let pos = startIndex + openTagLength;
  let depth = 1;
  
  while (depth > 0 && pos < html.length) {
    const nextOpen = html.indexOf('<div', pos);
    const nextClose = html.indexOf('</div>', pos);
    if (nextClose === -1) return null;
    
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + 4;
    } else {
      depth--;
      pos = nextClose + 6;
    }
  }
  
  if (depth === 0) {
    return html.substring(startIndex, pos);
  }
  return null;
};

// Helper: extract content by element ID
const extractById = (html: string, id: string): string | null => {
  const idRegex = new RegExp(`<div[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/div>`, 'i');
  const match = html.match(idRegex);
  return match ? match[1] : null;
};

// Robust synopsis extraction with Novelbin-specific fixes
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

  // --- Novelbin: use ID first, then class-based extraction ---
  if (isNovelBin) {
    let container = extractById(html, 'novel-description-content');
    if (!container) {
      const possibleClasses = ['desc-text', 'summary', 'description', 'details'];
      for (const cls of possibleClasses) {
        container = extractDivByClass(html, cls);
        if (container) break;
      }
    }
    if (container) {
      const paragraphs = container.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
      if (paragraphs && paragraphs.length > 0) {
        const text = paragraphs
          .map(p => decodeEntities(stripTags(p)))
          .filter(t => t.length > 20)
          .join('\n\n');
        if (text.length > 50) {
          synopsis = text;
        }
      } else {
        const text = decodeEntities(stripTags(container));
        if (text.length > 50) {
          synopsis = text;
        }
      }
    }
  }

  // --- For other sites, keep original pattern matching (simpler) ---
  if (!synopsis) {
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

    if (isLightNovelWorld) {
      patterns.push(
        /<div[^>]*class="summary-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class="description"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*id="description"[^>]*>([\s\S]*?)<\/div>/i
      );
    }

    for (const pattern of patterns) {
      const match = safeMatch(html, pattern);
      if (match) {
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
  }

  // --- Meta tags fallback (for all sites) ---
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

  // --- Generic fallback: first few sentences ---
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