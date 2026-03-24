// hooks/useApi.ts
import { 
  directFetchNovelMeta, 
  directFetchChapter,
  NovelMeta,
  ChapterData 
} from './useDirectScraper';

export type { NovelMeta, ChapterData };

export const fetchNovelMeta = async (url: string): Promise<NovelMeta> => {
  return directFetchNovelMeta(url);
};

export const fetchChapter = async (url: string, chapterNum: number): Promise<ChapterData> => {
  return directFetchChapter(url, chapterNum);
};
