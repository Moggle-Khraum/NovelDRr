import { directFetchNovelMeta, directFetchChapter } from './useDirectScraper';

export type { NovelMeta, ChapterData } from './useDirectScraper';

export const fetchNovelMeta = directFetchNovelMeta;
export const fetchChapter = directFetchChapter;
