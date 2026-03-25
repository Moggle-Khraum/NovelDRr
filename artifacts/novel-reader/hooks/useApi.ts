import { directFetchNovelMeta, directFetchChapter } from './useDirectScraper';

export type { NovelMeta, ChapterData } from './useDirectScraper';

export const fetchNovelMeta = directFetchNovelMeta;  // Fixed: was directFetchMeta
export const fetchChapter = directFetchChapter;
