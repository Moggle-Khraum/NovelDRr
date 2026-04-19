import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type Chapter = {
  title: string;
  url: string;
  content?: string;
};

export type NovelStatus = "unread" | "reading" | "completed";

export type Novel = {
  id: string;
  title: string;
  author: string;
  synopsis: string;
  coverUrl: string;
  sourceUrl: string;
  chapters: Chapter[];
  dateAdded: number;
  status: NovelStatus;
  lastRead?: {
    chapterIndex: number;
    chapterTitle: string;
    scrollOffset: number;
  };
};

const LIBRARY_KEY = "novel_library_v1";

type LibraryContextType = {
  novels: Novel[];
  loading: boolean;
  addNovel: (novel: Novel) => Promise<void>;
  updateNovel: (id: string, updates: Partial<Novel>) => Promise<void>;
  removeNovel: (id: string) => Promise<void>;
  removeNovels: (ids: string[]) => Promise<void>;
  getNovel: (id: string) => Novel | undefined;
  saveReadingProgress: (
    novelId: string, 
    chapterIndex: number, 
    chapterTitle: string, 
    scrollOffset: number
  ) => Promise<void>;
  setNovelStatus: (novelId: string, status: NovelStatus) => Promise<void>;
};

const LibraryContext = createContext<LibraryContextType>({
  novels: [],
  loading: true,
  addNovel: async () => {},
  updateNovel: async () => {},
  removeNovel: async () => {},
  removeNovels: async () => {},
  getNovel: () => undefined,
  saveReadingProgress: async () => {},
  setNovelStatus: async () => {},
});

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [novels, setNovels] = useState<Novel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(LIBRARY_KEY).then((data) => {
      if (data) {
        try {
          const parsed: Novel[] = JSON.parse(data);
          const migrated = parsed.map((n) => ({
            ...n,
            status: n.status ?? (n.lastRead ? "reading" : "unread"),
          }));
          setNovels(migrated);
        } catch {}
      }
      setLoading(false);
    });
  }, []);

  const persist = useCallback(async (updated: Novel[]) => {
    setNovels(updated);
    await AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(updated));
  }, []);

  const addNovel = useCallback(
    async (novel: Novel) => {
      setNovels((currentNovels) => {
        const updated = [novel, ...currentNovels.filter((n) => n.id !== novel.id)];
        AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(updated));
        return updated;
      });
    },
    []
  );

  const updateNovel = useCallback(
    async (id: string, updates: Partial<Novel>) => {
      setNovels((currentNovels) => {
        const updated = currentNovels.map((n) =>
          n.id === id ? { ...n, ...updates } : n
        );
        AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(updated));
        return updated;
      });
    },
    []
  );

  const removeNovel = useCallback(
    async (id: string) => {
      setNovels((currentNovels) => {
        const updated = currentNovels.filter((n) => n.id !== id);
        AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(updated));
        return updated;
      });
    },
    []
  );

  const removeNovels = useCallback(
    async (ids: string[]) => {
      setNovels((currentNovels) => {
        const updated = currentNovels.filter((n) => !ids.includes(n.id));
        AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(updated));
        return updated;
      });
    },
    []
  );

  const getNovel = useCallback(
    (id: string) => novels.find((n) => n.id === id),
    [novels]
  );

  const saveReadingProgress = useCallback(
    async (
      novelId: string, 
      chapterIndex: number, 
      chapterTitle: string, 
      scrollOffset: number
    ) => {
      await updateNovel(novelId, {
        lastRead: { 
          chapterIndex, 
          chapterTitle, 
          scrollOffset 
        },
        status: "reading",
      });
    },
    [updateNovel]
  );

  const setNovelStatus = useCallback(
    async (novelId: string, status: NovelStatus) => {
      await updateNovel(novelId, { status });
    },
    [updateNovel]
  );

  return (
    <LibraryContext.Provider
      value={{
        novels,
        loading,
        addNovel,
        updateNovel,
        removeNovel,
        removeNovels,
        getNovel,
        saveReadingProgress,
        setNovelStatus,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  return useContext(LibraryContext);
}
