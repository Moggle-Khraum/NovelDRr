import { directFetchNovelMeta, directFetchChapter } from './useDirectScraper';

export type { NovelMeta, ChapterData } from './useDirectScraper';

export const fetchNovelMeta = directFetchMeta;
export const fetchChapter = directFetchChapter;
