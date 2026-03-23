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

export type Novel = {
  id: string;
  title: string;
  author: string;
  synopsis: string;
  coverUrl: string;
  sourceUrl: string;
  chapters: Chapter[];
  dateAdded: number;
  lastRead?: {
    chapterIndex: number;
    chapterTitle: string;
  };
};

const LIBRARY_KEY = "novel_library_v1";

type LibraryContextType = {
  novels: Novel[];
  loading: boolean;
  addNovel: (novel: Novel) => Promise<void>;
  updateNovel: (id: string, updates: Partial<Novel>) => Promise<void>;
  removeNovel: (id: string) => Promise<void>;
  getNovel: (id: string) => Novel | undefined;
  saveReadingProgress: (novelId: string, chapterIndex: number, chapterTitle: string) => Promise<void>;
};

const LibraryContext = createContext<LibraryContextType>({
  novels: [],
  loading: true,
  addNovel: async () => {},
  updateNovel: async () => {},
  removeNovel: async () => {},
  getNovel: () => undefined,
  saveReadingProgress: async () => {},
});

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [novels, setNovels] = useState<Novel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(LIBRARY_KEY).then((data) => {
      if (data) {
        try {
          setNovels(JSON.parse(data));
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
      const updated = [novel, ...novels.filter((n) => n.id !== novel.id)];
      await persist(updated);
    },
    [novels, persist]
  );

  const updateNovel = useCallback(
    async (id: string, updates: Partial<Novel>) => {
      const updated = novels.map((n) =>
        n.id === id ? { ...n, ...updates } : n
      );
      await persist(updated);
    },
    [novels, persist]
  );

  const removeNovel = useCallback(
    async (id: string) => {
      await persist(novels.filter((n) => n.id !== id));
    },
    [novels, persist]
  );

  const getNovel = useCallback(
    (id: string) => novels.find((n) => n.id === id),
    [novels]
  );

  const saveReadingProgress = useCallback(
    async (novelId: string, chapterIndex: number, chapterTitle: string) => {
      await updateNovel(novelId, {
        lastRead: { chapterIndex, chapterTitle },
      });
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
        getNovel,
        saveReadingProgress,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  return useContext(LibraryContext);
}
