import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
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
  chapterNumber?: number; // Optional field for reliable sorting
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

// =============================================================================
// FILE SYSTEM PATHS
// =============================================================================

const APP_FOLDER_NAME = 'NovelDR';
const LIBRARY_FILE_NAME = 'novel_library_v1.json';
const SORT_PREFERENCE_FILE_NAME = 'chapter_sort_preference.json';
const CHAPTERS_FOLDER_NAME = 'chapters';
const INIT_FLAG_FILE_NAME = '.initialized';

const POSSIBLE_STORAGE_LOCATIONS = [
  () => `${FileSystem.documentDirectory}${APP_FOLDER_NAME}/`,
  () => `${FileSystem.documentDirectory}noveldr/`,
  () => `${FileSystem.cacheDirectory}../${APP_FOLDER_NAME}/`,
  () => `${FileSystem.documentDirectory}ExponentExperience/data/${APP_FOLDER_NAME}/`,
];

const getAppStoragePath = () => `${FileSystem.documentDirectory}${APP_FOLDER_NAME}/`;
const getLibraryFilePath = () => `${getAppStoragePath()}${LIBRARY_FILE_NAME}`;
const getSortPreferenceFilePath = () => `${getAppStoragePath()}${SORT_PREFERENCE_FILE_NAME}`;
const getChaptersPath = () => `${getAppStoragePath()}${CHAPTERS_FOLDER_NAME}/`;
const getNovelChaptersPath = (novelId: string) => `${getChaptersPath()}${novelId}/`;
const getChapterFilePath = (novelId: string, chapterIndex: number) => `${getNovelChaptersPath(novelId)}chapter_${chapterIndex}.json`;
const getInitFlagPath = () => `${getAppStoragePath()}${INIT_FLAG_FILE_NAME}`;

// =============================================================================
// DIRECTORY & FILE HELPERS
// =============================================================================

const ensureAppDirectoryExists = async () => {
  const appDir = getAppStoragePath();
  const dirInfo = await FileSystem.getInfoAsync(appDir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(appDir, { intermediates: true });
  }
};

const ensureDirectoryExists = async (dirPath: string) => {
  const dirInfo = await FileSystem.getInfoAsync(dirPath);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
  }
};

const copyDirectory = async (fromPath: string, toPath: string) => {
  await ensureDirectoryExists(toPath);
  try {
    const items = await FileSystem.readDirectoryAsync(fromPath);
    for (const item of items) {
      const sourceItemPath = `${fromPath}${item}`;
      const destItemPath = `${toPath}${item}`;
      try {
        const itemInfo = await FileSystem.getInfoAsync(sourceItemPath);
        if (itemInfo.exists && itemInfo.isDirectory) {
          await copyDirectory(sourceItemPath, destItemPath);
        } else if (itemInfo.exists) {
          await FileSystem.copyAsync({ from: sourceItemPath, to: destItemPath });
        }
      } catch (copyError) {
        console.error(`[Recovery] Failed to copy ${item}:`, copyError);
      }
    }
  } catch (readError) {
    console.error('[Recovery] Failed to read directory:', readError);
  }
};

const saveToFile = async (filePath: string, data: any) => {
  await ensureAppDirectoryExists();
  await FileSystem.writeAsStringAsync(filePath, JSON.stringify(data));
};

const loadFromFile = async (filePath: string): Promise<string | null> => {
  try {
    const fileInfo = await FileSystem.getInfoAsync(filePath);
    if (!fileInfo.exists) return null;
    return await FileSystem.readAsStringAsync(filePath);
  } catch {
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
    console.error('[Storage] Error deleting file:', error);
  }
};

const saveChapterToFile = async (novelId: string, chapterIndex: number, chapterData: { title: string; url: string; content: string; chapterNumber?: number }) => {
  await ensureDirectoryExists(getNovelChaptersPath(novelId));
  await FileSystem.writeAsStringAsync(
    getChapterFilePath(novelId, chapterIndex),
    JSON.stringify(chapterData)
  );
};

const loadChapterFromFile = async (novelId: string, chapterIndex: number): Promise<Chapter | null> => {
  try {
    const content = await loadFromFile(getChapterFilePath(novelId, chapterIndex));
    return content ? JSON.parse(content) : null;
  } catch {
    return null;
  }
};

const deleteNovelChapters = async (novelId: string) => {
  try {
    const novelChaptersDir = getNovelChaptersPath(novelId);
    const dirInfo = await FileSystem.getInfoAsync(novelChaptersDir);
    if (dirInfo.exists) {
      await FileSystem.deleteAsync(novelChaptersDir, { idempotent: true });
    }
  } catch (error) {
    console.error('[Storage] Error deleting chapters:', error);
  }
};

const saveAllChaptersToFile = async (novelId: string, chapters: Chapter[]) => {
  for (let i = 0; i < chapters.length; i++) {
    if (chapters[i].content) {
      await saveChapterToFile(novelId, i, {
        title: chapters[i].title,
        url: chapters[i].url,
        content: chapters[i].content,
        chapterNumber: chapters[i].chapterNumber,
      });
    }
  }
};

// =============================================================================
// INITIALIZATION FLAG (prevents repeated init screen)
// =============================================================================

const isInitialized = async (): Promise<boolean> => {
  try {
    const info = await FileSystem.getInfoAsync(getInitFlagPath());
    return info.exists;
  } catch {
    return false;
  }
};

const markInitialized = async () => {
  await ensureAppDirectoryExists();
  await FileSystem.writeAsStringAsync(getInitFlagPath(), Date.now().toString());
};

// =============================================================================
// MIGRATION & RECOVERY (only run when needed)
// =============================================================================

const LEGACY_ASYNC_KEYS = {
  LIBRARY: 'novel_library_v1',
  SORT_PREFERENCE: 'chapter_sort_preference',
  FONT_SIZE: 'reader_font_size_idx',
  LINE_SPACING: 'reader_line_spacing_idx',
};

type InitStep = {
  id: string;
  message: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
};

const migrateFromLegacyStorage = async (onStep: (step: InitStep) => void): Promise<boolean> => {
  const stepId = 'migrate';
  onStep({ id: stepId, message: 'Checking for legacy data...', status: 'running' });
  
  try {
    let AsyncStorage;
    try {
      AsyncStorage = require('@react-native-async-storage/async-storage').default;
    } catch {
      onStep({ id: stepId, message: 'Legacy storage not available', status: 'done', detail: 'Skipped' });
      return false;
    }
    
    // Already migrated? Check if library file exists in new location
    const libraryFileInfo = await FileSystem.getInfoAsync(getLibraryFilePath());
    if (libraryFileInfo.exists) {
      onStep({ id: stepId, message: 'Already migrated', status: 'done', detail: 'Library data present' });
      return false;
    }
    
    const legacyLibraryData = await AsyncStorage.getItem(LEGACY_ASYNC_KEYS.LIBRARY);
    if (!legacyLibraryData) {
      onStep({ id: stepId, message: 'No legacy data found', status: 'done' });
      return false;
    }
    
    onStep({ id: stepId, message: 'Found legacy data! Migrating...', status: 'running' });
    
    const parsed = JSON.parse(legacyLibraryData);
    await saveToFile(getLibraryFilePath(), parsed);
    const novelCount = Array.isArray(parsed) ? parsed.length : 0;
    
    const legacySort = await AsyncStorage.getItem(LEGACY_ASYNC_KEYS.SORT_PREFERENCE);
    if (legacySort) {
      await saveToFile(getSortPreferenceFilePath(), legacySort);
    }
    
    const legacyFontSize = await AsyncStorage.getItem(LEGACY_ASYNC_KEYS.FONT_SIZE);
    const legacyLineSpacing = await AsyncStorage.getItem(LEGACY_ASYNC_KEYS.LINE_SPACING);
    if (legacyFontSize || legacyLineSpacing) {
      const readerSettings = {
        fontSizeIdx: legacyFontSize ? parseInt(legacyFontSize) : 1,
        lineSpacingIdx: legacyLineSpacing ? parseInt(legacyLineSpacing) : 1,
      };
      await FileSystem.writeAsStringAsync(
        `${getAppStoragePath()}reader_settings.json`,
        JSON.stringify(readerSettings)
      );
    }
    
    onStep({ 
      id: stepId, 
      message: 'Migration complete!', 
      status: 'done', 
      detail: `${novelCount} novels restored` 
    });
    return true;
  } catch (error: any) {
    onStep({ id: stepId, message: 'Migration failed', status: 'error', detail: error.message });
    return false;
  }
};

const findExistingData = async (): Promise<{ path: string; novelCount: number } | null> => {
  for (const getPath of POSSIBLE_STORAGE_LOCATIONS) {
    try {
      const location = getPath();
      const filePath = `${location}${LIBRARY_FILE_NAME}`;
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (fileInfo.exists) {
        const content = await FileSystem.readAsStringAsync(filePath);
        const data = JSON.parse(content);
        return { path: location, novelCount: Array.isArray(data) ? data.length : 0 };
      }
    } catch {}
  }
  return null;
};

const recoverDataIfNeeded = async (onStep: (step: InitStep) => void): Promise<boolean> => {
  const stepId = 'recovery';
  onStep({ id: stepId, message: 'Scanning storage...', status: 'running' });
  
  try {
    const primaryPath = getAppStoragePath();
    const primaryLibraryPath = getLibraryFilePath();
    
    const primaryInfo = await FileSystem.getInfoAsync(primaryLibraryPath);
    if (primaryInfo.exists) {
      onStep({ id: stepId, message: 'Primary storage ready', status: 'done' });
      return false;
    }
    
    const foundData = await findExistingData();
    if (foundData && foundData.path !== primaryPath) {
      onStep({ 
        id: stepId, 
        message: `Recovering ${foundData.novelCount} novels...`, 
        status: 'running' 
      });
      
      await ensureAppDirectoryExists();
      const items = await FileSystem.readDirectoryAsync(foundData.path);
      for (const item of items) {
        const sourcePath = `${foundData.path}${item}`;
        const destPath = `${primaryPath}${item}`;
        try {
          const sourceInfo = await FileSystem.getInfoAsync(sourcePath);
          if (sourceInfo.exists && sourceInfo.isDirectory) {
            await copyDirectory(sourcePath, destPath);
          } else if (sourceInfo.exists) {
            await FileSystem.copyAsync({ from: sourcePath, to: destPath });
          }
        } catch (copyError) {
          console.error(`[Recovery] Failed to copy ${item}:`, copyError);
        }
      }
      
      onStep({ 
        id: stepId, 
        message: 'Recovery complete!', 
        status: 'done', 
        detail: `${foundData.novelCount} novels restored` 
      });
      return true;
    }
    
    onStep({ id: stepId, message: 'No alternate data found', status: 'done' });
    return false;
  } catch (error: any) {
    onStep({ id: stepId, message: 'Recovery error', status: 'error', detail: error.message });
    return false;
  }
};

// =============================================================================
// CONTEXT TYPE DEFINITION
// =============================================================================

type LibraryContextType = {
  novels: Novel[];
  loading: boolean;
  initSteps: InitStep[];
  initComplete: boolean;
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
  saveChapterContent: (novelId: string, chapterIndex: number, title: string, url: string, content: string, chapterNumber?: number) => Promise<void>;
  loadChapterContent: (novelId: string, chapterIndex: number) => Promise<Chapter | null>;
};

const LibraryContext = createContext<LibraryContextType>({
  novels: [],
  loading: true,
  initSteps: [],
  initComplete: false,
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
  saveChapterContent: async () => {},
  loadChapterContent: async () => null,
});

// =============================================================================
// CHAPTER NUMBER EXTRACTION (ENHANCED)
// =============================================================================

function extractChapterNumber(chapter: Chapter): number {
  // If chapterNumber is already stored, use it
  if (chapter.chapterNumber !== undefined && chapter.chapterNumber > 0) {
    return chapter.chapterNumber;
  }
  
  const title = chapter.title || '';
  const url = chapter.url || '';
  
  // Enhanced patterns matching add.tsx and updates.tsx
  const patterns = [
    /chapter\s+(\d+(?:\.\d+)?)/i,
    /ch\.?\s*(\d+(?:\.\d+)?)/i,
    /#(\d+(?:\.\d+)?)/,
    /(\d+)(?:st|nd|rd|th)\s+chapter/i,
    /^(\d+(?:\.\d+)?)[\s\-:]/,
    /volume\s+\d+\s+chapter\s+(\d+)/i,
    /chapter[-/](\d+)/i,
    /ch[-/](\d+)/i,
    /\[(\d+)\]/,
    /\((\d+)\)/,
    /(\d+)\.html?$/,
  ];
  
  for (const pattern of patterns) {
    const match = title.match(pattern) || url.match(pattern);
    if (match) {
      return parseFloat(match[1]);
    }
  }
  return 0;
}

// =============================================================================
// PROVIDER
// =============================================================================

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [novels, setNovels] = useState<Novel[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<SortOrder>("ascending");
  const [initSteps, setInitSteps] = useState<InitStep[]>([]);
  const [initComplete, setInitComplete] = useState(false);

  const addInitStep = useCallback((step: InitStep) => {
    setInitSteps(prev => {
      const existing = prev.findIndex(s => s.id === step.id);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = step;
        return updated;
      }
      return [...prev, step];
    });
  }, []);

  useEffect(() => {
    const initializeStorage = async () => {
      // If already fully initialized, skip the heavy logging and just load data
      const alreadyInit = await isInitialized();
      if (alreadyInit) {
        addInitStep({ id: 'start', message: 'Loading library...', status: 'done', detail: 'Already initialized' });
        // Load preferences and data quickly
        const sortData = await loadFromFile(getSortPreferenceFilePath());
        if (sortData === "descending") setSortOrder("descending");
        
        const libraryData = await loadFromFile(getLibraryFilePath());
        if (libraryData) {
          try {
            const parsed: Novel[] = JSON.parse(libraryData);
            const migratedNovels = parsed.map((n) => ({
              ...n,
              status: n.status ?? (n.lastRead ? "reading" : "unread"),
              chapters: n.chapters.map(ch => ({ 
                title: ch.title, 
                url: ch.url,
                chapterNumber: (ch as any).chapterNumber // preserve if exists
              }))
            }));
            setNovels(migratedNovels);
          } catch {}
        }
        setInitComplete(true);
        setLoading(false);
        return;
      }

      // First-time initialization with full migration/recovery sequence
      try {
        addInitStep({ id: 'start', message: 'Initializing storage...', status: 'running' });
        
        const migrated = await migrateFromLegacyStorage(addInitStep);
        const recovered = await recoverDataIfNeeded(addInitStep);
        
        await ensureAppDirectoryExists();
        await ensureDirectoryExists(getChaptersPath());
        addInitStep({ id: 'directory', message: 'Storage ready', status: 'done' });
        
        const sortData = await loadFromFile(getSortPreferenceFilePath());
        if (sortData === "descending") setSortOrder("descending");
        addInitStep({ id: 'preferences', message: 'Preferences loaded', status: 'done' });
        
        const libraryData = await loadFromFile(getLibraryFilePath());
        let totalChapters = 0;
        if (libraryData) {
          try {
            const parsed: Novel[] = JSON.parse(libraryData);
            const migratedNovels = parsed.map((n) => ({
              ...n,
              status: n.status ?? (n.lastRead ? "reading" : "unread"),
              chapters: n.chapters.map(ch => ({ 
                title: ch.title, 
                url: ch.url,
                chapterNumber: (ch as any).chapterNumber
              }))
            }));
            setNovels(migratedNovels);
            
            try {
              const novelDirs = await FileSystem.readDirectoryAsync(getChaptersPath());
              for (const dir of novelDirs) {
                const dirInfo = await FileSystem.getInfoAsync(getNovelChaptersPath(dir));
                if (dirInfo.exists && dirInfo.isDirectory) {
                  const files = await FileSystem.readDirectoryAsync(getNovelChaptersPath(dir));
                  totalChapters += files.length;
                }
              }
            } catch {}
            
            addInitStep({ 
              id: 'library', 
              message: 'Library loaded', 
              status: 'done', 
              detail: `${migratedNovels.length} novels, ${totalChapters} chapters` 
            });
          } catch {
            addInitStep({ id: 'library', message: 'Library repair needed', status: 'error' });
          }
        } else {
          addInitStep({ id: 'library', message: 'Fresh start', status: 'done', detail: 'Welcome!' });
        }
        
        // Mark as initialized so we never run the full sequence again
        await markInitialized();
        
        addInitStep({ 
          id: 'complete', 
          message: (migrated || recovered) ? '✅ Data restored' : '✅ Ready!', 
          status: 'done' 
        });
        setInitComplete(true);
        await new Promise(resolve => setTimeout(resolve, 800));
        
      } catch (error: any) {
        addInitStep({ id: 'error', message: 'Initialization failed', status: 'error', detail: error.message });
      } finally {
        setLoading(false);
      }
    };
    
    initializeStorage();
  }, [addInitStep]);

  // ── Library data management ──────────────────────────────────────────────
  const saveLibraryToFile = async (novelsData: Novel[]) => {
    const metadataOnly = novelsData.map(novel => ({
      ...novel,
      chapters: novel.chapters.map(ch => ({ 
        title: ch.title, 
        url: ch.url,
        chapterNumber: ch.chapterNumber // preserve chapterNumber in metadata
      }))
    }));
    await saveToFile(getLibraryFilePath(), metadataOnly);
  };

  const addNovel = useCallback(async (novel: Novel) => {
    setNovels(current => {
      const existing = current.find(n => n.id === novel.id);
      if (existing) {
        const existingUrls = new Set(existing.chapters.map(ch => ch.url));
        const newChapters = novel.chapters.filter(ch => !existingUrls.has(ch.url));
        const merged = { ...existing, ...novel, chapters: [...existing.chapters, ...newChapters] };
        const updated = current.map(n => n.id === novel.id ? merged : n);
        saveAllChaptersToFile(novel.id, newChapters);
        saveLibraryToFile(updated);
        return updated;
      } else {
        const updated = [novel, ...current];
        saveAllChaptersToFile(novel.id, novel.chapters);
        saveLibraryToFile(updated);
        return updated;
      }
    });
  }, []);

  const updateNovel = useCallback(async (id: string, updates: Partial<Novel>) => {
    setNovels(current => {
      const updated = current.map(n => n.id === id ? { ...n, ...updates } : n);
      saveLibraryToFile(updated);
      return updated;
    });
  }, []);

  const removeNovel = useCallback(async (id: string) => {
    setNovels(current => {
      const updated = current.filter(n => n.id !== id);
      saveLibraryToFile(updated);
      deleteNovelChapters(id);
      return updated;
    });
  }, []);

  const removeNovels = useCallback(async (ids: string[]) => {
    setNovels(current => {
      const updated = current.filter(n => !ids.includes(n.id));
      saveLibraryToFile(updated);
      ids.forEach(id => deleteNovelChapters(id));
      return updated;
    });
  }, []);

  const getNovel = useCallback((id: string) => novels.find(n => n.id === id), [novels]);

  const saveReadingProgress = useCallback(async (
    novelId: string, 
    chapterIndex: number, 
    chapterTitle: string, 
    scrollOffset: number
  ) => {
    await updateNovel(novelId, {
      lastRead: { chapterIndex, chapterTitle, scrollOffset },
      status: "reading",
    });
  }, [updateNovel]);

  const setNovelStatus = useCallback(async (novelId: string, status: NovelStatus) => {
    await updateNovel(novelId, { status });
  }, [updateNovel]);

  const toggleSortOrder = useCallback(() => {
    setSortOrder(prev => {
      const next = prev === "ascending" ? "descending" : "ascending";
      saveToFile(getSortPreferenceFilePath(), next);
      return next;
    });
  }, []);

  const getSortedChapters = useCallback(
    (chapters: Chapter[]): Chapter[] => {
      if (!chapters?.length) return [];
      const sorted = [...chapters].sort((a, b) => {
        const na = extractChapterNumber(a);
        const nb = extractChapterNumber(b);
        if (na && nb) return na - nb;
        if (na) return -1;
        if (nb) return 1;
        return (a.title || '').localeCompare(b.title || '');
      });
      return sortOrder === "descending" ? sorted.reverse() : sorted;
    },
    [sortOrder]
  );

  const saveChapterContent = useCallback(async (
    novelId: string, 
    chapterIndex: number, 
    title: string, 
    url: string, 
    content: string,
    chapterNumber?: number
  ) => {
    await saveChapterToFile(novelId, chapterIndex, { title, url, content, chapterNumber });
    setNovels(current => {
      const idx = current.findIndex(n => n.id === novelId);
      if (idx === -1) return current;
      const novel = { ...current[idx] };
      const newChapter = { title, url, chapterNumber };
      if (chapterIndex >= novel.chapters.length) {
        novel.chapters = [...novel.chapters, newChapter];
      } else {
        const chapters = [...novel.chapters];
        chapters[chapterIndex] = { ...chapters[chapterIndex], ...newChapter };
        novel.chapters = chapters;
      }
      const updated = [...current];
      updated[idx] = novel;
      saveLibraryToFile(updated);
      return updated;
    });
  }, []);

  const loadChapterContent = useCallback(async (novelId: string, chapterIndex: number) => {
    return await loadChapterFromFile(novelId, chapterIndex);
  }, []);

  return (
    <LibraryContext.Provider
      value={{
        novels,
        loading,
        initSteps,
        initComplete,
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
        saveChapterContent,
        loadChapterContent,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  return useContext(LibraryContext);
}