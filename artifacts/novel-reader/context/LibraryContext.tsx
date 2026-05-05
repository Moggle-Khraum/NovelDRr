import * as FileSystem from 'expo-file-system';
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

export type SortOrder = "ascending" | "descending";

// File system paths
const APP_FOLDER_NAME = 'NovelDR';
const LIBRARY_FILE_NAME = 'novel_library_v1.json';
const SORT_PREFERENCE_FILE_NAME = 'chapter_sort_preference.json';

// Helper functions for file system operations
const getAppStoragePath = () => {
  return `${FileSystem.documentDirectory}${APP_FOLDER_NAME}/`;
};

const getLibraryFilePath = () => {
  return `${getAppStoragePath()}${LIBRARY_FILE_NAME}`;
};

const getSortPreferenceFilePath = () => {
  return `${getAppStoragePath()}${SORT_PREFERENCE_FILE_NAME}`;
};

// Ensure app directory exists
const ensureAppDirectoryExists = async () => {
  const appDir = getAppStoragePath();
  const dirInfo = await FileSystem.getInfoAsync(appDir);
  
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(appDir, { intermediates: true });
    console.log('Created app directory:', appDir);
  }
};

// File system CRUD operations
const saveToFile = async (filePath: string, data: any) => {
  try {
    await ensureAppDirectoryExists();
    await FileSystem.writeAsStringAsync(filePath, JSON.stringify(data));
  } catch (error) {
    console.error('Error saving to file:', error);
    throw error;
  }
};

const loadFromFile = async (filePath: string) => {
  try {
    const fileInfo = await FileSystem.getInfoAsync(filePath);
    if (!fileInfo.exists) {
      return null;
    }
    const content = await FileSystem.readAsStringAsync(filePath);
    return content;
  } catch (error) {
    console.error('Error loading from file:', error);
    return null;
  }
};

const deleteFile = async (filePath: string) => {
  try {
    const fileInfo = await FileSystem.getInfoAsync(filePath);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(filePath);
    }
  } catch (error) {
    console.error('Error deleting file:', error);
  }
};

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
  sortOrder: SortOrder;
  toggleSortOrder: () => void;
  getSortedChapters: (chapters: Chapter[]) => Chapter[];
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
  sortOrder: "ascending",
  toggleSortOrder: () => {},
  getSortedChapters: (chapters) => chapters,
});

// Helper to extract chapter number from a Chapter object
function extractChapterNumber(chapter: Chapter): number {
  // Try to get number from title like "Chapter 5" or "Chapter 5: Title" or "Chapter 5 - Title"
  const titleMatch = chapter.title.match(/chapter\s*(\d+)/i);
  if (titleMatch) return parseInt(titleMatch[1], 10);
  
  // Fallback: try URL like ".../chapter-5" or ".../chapter/5/"
  const urlMatch = chapter.url.match(/chapter[-/](\d+)/i);
  if (urlMatch) return parseInt(urlMatch[1], 10);
  
  // Last resort: return 0 (will stay in original position)
  return 0;
}

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [novels, setNovels] = useState<Novel[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<SortOrder>("ascending");

  // Initialize app directory and load data on mount
  useEffect(() => {
    const initializeStorage = async () => {
      try {
        // Ensure app directory exists
        await ensureAppDirectoryExists();
        
        // Load sort preference
        const sortData = await loadFromFile(getSortPreferenceFilePath());
        if (sortData === "descending") {
          setSortOrder("descending");
        }
        
        // Load library data
        const libraryData = await loadFromFile(getLibraryFilePath());
        if (libraryData) {
          try {
            const parsed: Novel[] = JSON.parse(libraryData);
            const migrated = parsed.map((n) => ({
              ...n,
              status: n.status ?? (n.lastRead ? "reading" : "unread"),
            }));
            setNovels(migrated);
          } catch (error) {
            console.error('Error parsing library data:', error);
          }
        }
      } catch (error) {
        console.error('Error initializing storage:', error);
      } finally {
        setLoading(false);
      }
    };
    
    initializeStorage();
  }, []);

  const addNovel = useCallback(
    async (novel: Novel) => {
      setNovels((currentNovels) => {
        const existingIndex = currentNovels.findIndex((n) => n.id === novel.id);
        
        if (existingIndex !== -1) {
          // Novel exists - merge chapters
          const existing = currentNovels[existingIndex];
          const existingUrls = new Set(existing.chapters.map((ch) => ch.url));
          
          // Only add chapters that don't already exist
          const newChapters = novel.chapters.filter((ch) => !existingUrls.has(ch.url));
          
          const mergedNovel: Novel = {
            ...existing,
            title: novel.title,
            author: novel.author,
            synopsis: novel.synopsis || existing.synopsis,
            coverUrl: novel.coverUrl || existing.coverUrl,
            chapters: [...existing.chapters, ...newChapters],
          };
          
          const updated = [...currentNovels];
          updated[existingIndex] = mergedNovel;
          saveToFile(getLibraryFilePath(), updated);
          return updated;
        } else {
          // New novel
          const updated = [novel, ...currentNovels];
          saveToFile(getLibraryFilePath(), updated);
          return updated;
        }
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
        saveToFile(getLibraryFilePath(), updated);
        return updated;
      });
    },
    []
  );

  const removeNovel = useCallback(
    async (id: string) => {
      setNovels((currentNovels) => {
        const updated = currentNovels.filter((n) => n.id !== id);
        saveToFile(getLibraryFilePath(), updated);
        return updated;
      });
    },
    []
  );

  const removeNovels = useCallback(
    async (ids: string[]) => {
      setNovels((currentNovels) => {
        const updated = currentNovels.filter((n) => !ids.includes(n.id));
        saveToFile(getLibraryFilePath(), updated);
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

  // Toggle between ascending and descending
  const toggleSortOrder = useCallback(() => {
    setSortOrder((prev) => {
      const next = prev === "ascending" ? "descending" : "ascending";
      saveToFile(getSortPreferenceFilePath(), next);
      return next;
    });
  }, []);

  // Sort chapters by chapter number, then apply ascending/descending
  const getSortedChapters = useCallback(
    (chapters: Chapter[]): Chapter[] => {
      // First, sort numerically by chapter number
      const sorted = [...chapters].sort((a, b) => {
        const numA = extractChapterNumber(a);
        const numB = extractChapterNumber(b);
        return numA - numB;
      });
      
      // Then apply sort order preference
      if (sortOrder === "descending") {
        return sorted.reverse();
      }
      return sorted;
    },
    [sortOrder]
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
        sortOrder,
        toggleSortOrder,
        getSortedChapters,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  return useContext(LibraryContext);
}
