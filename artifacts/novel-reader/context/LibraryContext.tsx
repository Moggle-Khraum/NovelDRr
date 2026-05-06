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

const POSSIBLE_STORAGE_LOCATIONS = [
  () => `${FileSystem.documentDirectory}${APP_FOLDER_NAME}/`,
  () => `${FileSystem.documentDirectory}noveldr/`,
  () => `${FileSystem.cacheDirectory}../${APP_FOLDER_NAME}/`,
  () => `${FileSystem.documentDirectory}ExponentExperience/data/${APP_FOLDER_NAME}/`,
];

const getAppStoragePath = () => {
  return `${FileSystem.documentDirectory}${APP_FOLDER_NAME}/`;
};

const getLibraryFilePath = () => `${getAppStoragePath()}${LIBRARY_FILE_NAME}`;
const getSortPreferenceFilePath = () => `${getAppStoragePath()}${SORT_PREFERENCE_FILE_NAME}`;
const getChaptersPath = () => `${getAppStoragePath()}${CHAPTERS_FOLDER_NAME}/`;
const getNovelChaptersPath = (novelId: string) => `${getChaptersPath()}${novelId}/`;
const getChapterFilePath = (novelId: string, chapterIndex: number) => `${getNovelChaptersPath(novelId)}chapter_${chapterIndex}.json`;

// =============================================================================
// DIRECTORY & FILE HELPERS
// =============================================================================

const ensureAppDirectoryExists = async () => {
  const appDir = getAppStoragePath();
  const dirInfo = await FileSystem.getInfoAsync(appDir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(appDir, { intermediates: true });
    console.log('[Storage] Created app directory:', appDir);
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
  try {
    await ensureAppDirectoryExists();
    await FileSystem.writeAsStringAsync(filePath, JSON.stringify(data));
  } catch (error) {
    console.error('[Storage] Error saving to file:', error);
    throw error;
  }
};

const loadFromFile = async (filePath: string): Promise<string | null> => {
  try {
    const fileInfo = await FileSystem.getInfoAsync(filePath);
    if (!fileInfo.exists) return null;
    return await FileSystem.readAsStringAsync(filePath);
  } catch (error) {
    console.error('[Storage] Error loading from file:', error);
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

const saveChapterToFile = async (novelId: string, chapterIndex: number, chapterData: { title: string; url: string; content: string }) => {
  try {
    await ensureDirectoryExists(getNovelChaptersPath(novelId));
    await FileSystem.writeAsStringAsync(
      getChapterFilePath(novelId, chapterIndex),
      JSON.stringify(chapterData)
    );
  } catch (error) {
    console.error('[Storage] Error saving chapter:', error);
    throw error;
  }
};

const loadChapterFromFile = async (novelId: string, chapterIndex: number): Promise<Chapter | null> => {
  try {
    const content = await loadFromFile(getChapterFilePath(novelId, chapterIndex));
    if (content) return JSON.parse(content);
    return null;
  } catch (error) {
    console.error('[Storage] Error loading chapter:', error);
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
        content: chapters[i].content
      });
    }
  }
};

// =============================================================================
// MIGRATION & RECOVERY WITH PROGRESS REPORTING
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
    
    const libraryFileInfo = await FileSystem.getInfoAsync(getLibraryFilePath());
    if (libraryFileInfo.exists) {
      onStep({ id: stepId, message: 'Current data found', status: 'done', detail: 'No migration needed' });
      return false;
    }
    
    const legacyLibraryData = await AsyncStorage.getItem(LEGACY_ASYNC_KEYS.LIBRARY);
    if (!legacyLibraryData) {
      onStep({ id: stepId, message: 'No legacy data found', status: 'done', detail: 'Starting fresh' });
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
  onStep({ id: stepId, message: 'Scanning storage locations...', status: 'running' });
  
  try {
    const primaryPath = getAppStoragePath();
    const primaryLibraryPath = getLibraryFilePath();
    
    const primaryInfo = await FileSystem.getInfoAsync(primaryLibraryPath);
    if (primaryInfo.exists) {
      onStep({ id: stepId, message: 'Data found in primary location', status: 'done', detail: 'Ready' });
      return false;
    }
    
    onStep({ id: stepId, message: 'Searching alternate locations...', status: 'running' });
    
    const foundData = await findExistingData();
    if (foundData && foundData.path !== primaryPath) {
      onStep({ 
        id: stepId, 
        message: `Found data in backup location!`, 
        status: 'running', 
        detail: `${foundData.novelCount} novels` 
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
        message: 'Data recovered successfully!', 
        status: 'done', 
        detail: `${foundData.novelCount} novels restored` 
      });
      return true;
    }
    
    onStep({ id: stepId, message: 'No existing data found', status: 'done', detail: 'Starting fresh' });
    return false;
  } catch (error: any) {
    onStep({ id: stepId, message: 'Recovery scan failed', status: 'error', detail: error.message });
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
  saveChapterContent: (novelId: string, chapterIndex: number, title: string, url: string, content: string) => Promise<void>;
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
// HELPERS
// =============================================================================

function extractChapterNumber(chapter: Chapter): number {
  if (!chapter) return 0;
  
  const title = chapter.title || '';
  const url = chapter.url || '';
  
  // Try multiple title patterns
  const titlePatterns = [
    /chapter\s*(\d+)/i,
    /ch\.?\s*(\d+)/i,
    /^(\d+)[\.\s\-]/,
    /\[(\d+)\]/,
    /\((\d+)\)/,
    /#(\d+)/,
  ];
  for (const pattern of titlePatterns) {
    const match = title.match(pattern);
    if (match) return parseInt(match[1], 10);
  }
  
  // Try URL patterns
  const urlPatterns = [
    /chapter[-/](\d+)/i,
    /ch[-/](\d+)/i,
    /(\d+)\.html?$/,
  ];
  for (const pattern of urlPatterns) {
    const match = url.match(pattern);
    if (match) return parseInt(match[1], 10);
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
      try {
        addInitStep({ id: 'start', message: 'Initializing storage system...', status: 'running' });
        
        // Step 1: Migration
        const migrated = await migrateFromLegacyStorage(addInitStep);
        
        // Step 2: Recovery
        const recovered = await recoverDataIfNeeded(addInitStep);
        
        // Step 3: Ensure directories
        addInitStep({ id: 'directory', message: 'Setting up storage directories...', status: 'running' });
        await ensureAppDirectoryExists();
        await ensureDirectoryExists(getChaptersPath());
        addInitStep({ id: 'directory', message: 'Storage directories ready', status: 'done' });
        
        // Step 4: Load preferences
        addInitStep({ id: 'preferences', message: 'Loading preferences...', status: 'running' });
        const sortData = await loadFromFile(getSortPreferenceFilePath());
        if (sortData === "descending") setSortOrder("descending");
        addInitStep({ id: 'preferences', message: 'Preferences loaded', status: 'done' });
        
        // Step 5: Load library data
        addInitStep({ id: 'library', message: 'Loading library...', status: 'running' });
        const libraryData = await loadFromFile(getLibraryFilePath());
        if (libraryData) {
          try {
            const parsed: Novel[] = JSON.parse(libraryData);
            const migratedNovels = parsed.map((n) => ({
              ...n,
              status: n.status ?? (n.lastRead ? "reading" : "unread"),
              chapters: n.chapters.map(ch => ({ title: ch.title, url: ch.url })) // keep metadata only
            }));
            setNovels(migratedNovels);
            
            let totalChapters = 0;
            try {
              const chaptersDir = getChaptersPath();
              const novelDirs = await FileSystem.readDirectoryAsync(chaptersDir);
              for (const dir of novelDirs) {
                const dirPath = getNovelChaptersPath(dir);
                const dirInfo = await FileSystem.getInfoAsync(dirPath);
                if (dirInfo.exists && dirInfo.isDirectory) {
                  const files = await FileSystem.readDirectoryAsync(dirPath);
                  totalChapters += files.length;
                }
              }
            } catch {}
            
            addInitStep({ 
              id: 'library', 
              message: 'Library loaded successfully', 
              status: 'done', 
              detail: `${migratedNovels.length} novels, ${totalChapters} chapters` 
            });
          } catch (error) {
            addInitStep({ id: 'library', message: 'Library data needs repair', status: 'error' });
          }
        } else {
          addInitStep({ id: 'library', message: 'No library data found', status: 'done', detail: 'Welcome! Add novels to get started.' });
        }
        
        // Step 6: Complete
        addInitStep({ 
          id: 'complete', 
          message: migrated || recovered ? '✅ Data restored successfully!' : '✅ Ready!', 
          status: 'done',
          detail: migrated ? 'Migrated from previous version' : recovered ? 'Recovered from backup' : undefined
        });
        setInitComplete(true);
        await new Promise(resolve => setTimeout(resolve, 500));
        
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
      chapters: novel.chapters.map(ch => ({ title: ch.title, url: ch.url }))
    }));
    await saveToFile(getLibraryFilePath(), metadataOnly);
  };

  const addNovel = useCallback(async (novel: Novel) => {
    setNovels(current => {
      const existingIndex = current.findIndex(n => n.id === novel.id);
      if (existingIndex >= 0) {
        const existing = current[existingIndex];
        const existingUrls = new Set(existing.chapters.map(ch => ch.url));
        const newChapters = novel.chapters.filter(ch => !existingUrls.has(ch.url));
        const merged = { ...existing, ...novel, chapters: [...existing.chapters, ...newChapters] };
        const updated = [...current];
        updated[existingIndex] = merged;
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

  // ── FIX #4: Robust chapter sorting ────────────────────────────────────────
  const getSortedChapters = useCallback(
    (chapters: Chapter[]): Chapter[] => {
      if (!chapters || chapters.length === 0) return [];
      
      const sorted = [...chapters].sort((a, b) => {
        const numA = extractChapterNumber(a);
        const numB = extractChapterNumber(b);
        if (numA > 0 && numB > 0) return numA - numB;
        if (numA > 0) return -1;
        if (numB > 0) return 1;
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
    content: string
  ) => {
    await saveChapterToFile(novelId, chapterIndex, { title, url, content });
    
    setNovels(current => {
      const novelIndex = current.findIndex(n => n.id === novelId);
      if (novelIndex === -1) return current;
      
      const novel = { ...current[novelIndex] };
      if (chapterIndex >= novel.chapters.length) {
        novel.chapters = [...novel.chapters, { title, url }];
      } else {
        const chapters = [...novel.chapters];
        chapters[chapterIndex] = { ...chapters[chapterIndex], title, url };
        novel.chapters = chapters;
      }
      
      const updated = [...current];
      updated[novelIndex] = novel;
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
    </LibraryContextLibraryContext.Provider.Provider>
 >
  );
 );
}

export function}

export function useLibrary useLibrary() {
  return() {
  return useContext(L useContext(LibraryContext);
ibraryContext);
}