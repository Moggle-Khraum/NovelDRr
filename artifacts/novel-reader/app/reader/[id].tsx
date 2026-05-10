import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import * as FileSystem from 'expo-file-system';
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLibrary } from "@/context/LibraryContext";
import { useTheme } from "@/context/ThemeContext";

const FONT_SIZES = [14, 15, 16, 17, 18, 19, 20, 22];
const LINE_SPACINGS = [1.2, 1.3, 1.5, 1.8, 2.0, 2.5];
const AUTO_SCROLL_SPEEDS = [0.5, 1, 1.5, 1.8, 2, 2.5];

const READER_SETTINGS_FILE = `${FileSystem.documentDirectory}NovelDR/reader_settings.json`;

const loadChapterContentWithFallback = async (
  novelId: string,
  chapterIndex: number,
  chapter: { title: string; url: string; content?: string },
  loadFromFileSystem: (novelId: string, chapterIndex: number) => Promise<any>
): Promise<string> => {
  try {
    const fileChapter = await loadFromFileSystem(novelId, chapterIndex);
    if (fileChapter && fileChapter.content) {
      return fileChapter.content;
    }
  } catch (error) {
    console.log('[Reader] File system load failed, trying fallbacks...');
  }
  
  if (chapter.content && chapter.content.trim().length > 0) {
    return chapter.content;
  }
  
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const libraryData = await AsyncStorage.getItem('novel_library_v1');
    if (libraryData) {
      const novels = JSON.parse(libraryData);
      const novel = novels.find((n: any) => n.id === novelId);
      if (novel && novel.chapters && novel.chapters[chapterIndex]) {
        const legacyChapter = novel.chapters[chapterIndex];
        if (legacyChapter.content && legacyChapter.content.trim().length > 0) {
          return legacyChapter.content;
        }
      }
    }
  } catch (asyncError) {
    console.log('[Reader] AsyncStorage fallback failed:', asyncError);
  }
  
  try {
    const altPaths = [
      `${FileSystem.documentDirectory}noveldr/chapters/${novelId}/chapter_${chapterIndex}.json`,
      `${FileSystem.cacheDirectory}../NovelDR/chapters/${novelId}/chapter_${chapterIndex}.json`,
    ];
    
    for (const altPath of altPaths) {
      const fileInfo = await FileSystem.getInfoAsync(altPath);
      if (fileInfo.exists) {
        const content = await FileSystem.readAsStringAsync(altPath);
        const chapterData = JSON.parse(content);
        if (chapterData.content) {
          return chapterData.content;
        }
      }
    }
  } catch (altError) {
    console.log('[Reader] Alternative path fallback failed');
  }
  
  return "Content not available for this chapter. It may still be downloading or wasn't saved properly. Try re-downloading the novel from the Updates tab.";
};

export default function ReaderScreen() {
  const { id, chapterIndex: indexParam } = useLocalSearchParams<{
    id: string;
    chapterIndex: string;
  }>();
  const { getNovel, saveReadingProgress, loadChapterContent, sortOrder, toggleSortOrder, getSortedChapters } = useLibrary();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [fontSizeIdx, setFontSizeIdx] = useState(1);
  const [lineSpacingIdx, setLineSpacingIdx] = useState(1);
  const [autoScrollSpeedIdx, setAutoScrollSpeedIdx] = useState(1);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [showTOC, setShowTOC] = useState(false);
  const [chapterIndex, setChapterIndex] = useState(parseInt(indexParam) || 0);
  const scrollRef = useRef<ScrollView>(null);

  const [autoScrollActive, setAutoScrollActive] = useState(false);
  
  const [readingProgress, setReadingProgress] = useState(0);
  const scrollYRef = useRef(0);
  const contentHeightRef = useRef(0);
  const scrollViewHeightRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const hasRestoredScrollRef = useRef(false);
  const restoredChapterRef = useRef<number>(-1);
  const forceTopRef = useRef(false);

  const [chapterContent, setChapterContent] = useState<string>("");
  const [contentLoading, setContentLoading] = useState(false);
  const [previousContent, setPreviousContent] = useState<string>("");

  const novel = getNovel(id);
  const sortedChapters = novel ? getSortedChapters(novel.chapters) : [];
  const chapter = novel?.chapters[chapterIndex];
  const currentChapterUrl = chapter?.url;
  const currentSortedIndex = sortedChapters.findIndex(ch => ch.url === currentChapterUrl);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  // Load saved settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const fileInfo = await FileSystem.getInfoAsync(READER_SETTINGS_FILE);
        if (fileInfo.exists) {
          const content = await FileSystem.readAsStringAsync(READER_SETTINGS_FILE);
          const settings = JSON.parse(content);
          if (settings.fontSizeIdx !== undefined) setFontSizeIdx(settings.fontSizeIdx);
          if (settings.lineSpacingIdx !== undefined) setLineSpacingIdx(settings.lineSpacingIdx);
          if (settings.autoScrollSpeedIdx !== undefined) setAutoScrollSpeedIdx(settings.autoScrollSpeedIdx);
        }
      } catch (error) {
        console.error('Failed to load reader settings:', error);
      } finally {
        setSettingsLoaded(true);
      }
    };
    loadSettings();
  }, []);

  // Save settings helper - write all at once to avoid recursive issues
  const saveAllSettings = async (font: number, line: number, scroll: number) => {
    try {
      const dir = `${FileSystem.documentDirectory}NovelDR/`;
      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }
      await FileSystem.writeAsStringAsync(
        READER_SETTINGS_FILE,
        JSON.stringify({ fontSizeIdx: font, lineSpacingIdx: line, autoScrollSpeedIdx: scroll })
      );
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const handleFontSizeChange = (newIdx: number) => {
    setFontSizeIdx(newIdx);
    saveAllSettings(newIdx, lineSpacingIdx, autoScrollSpeedIdx);
  };

  const handleLineSpacingChange = (newIdx: number) => {
    setLineSpacingIdx(newIdx);
    saveAllSettings(fontSizeIdx, newIdx, autoScrollSpeedIdx);
  };

  const handleAutoScrollSpeedChange = (newIdx: number) => {
    setAutoScrollSpeedIdx(newIdx);
    saveAllSettings(fontSizeIdx, lineSpacingIdx, newIdx);
  };

  // Load chapter content when chapter changes
  useEffect(() => {
    const loadContent = async () => {
      if (novel && chapter) {
        setContentLoading(true);
        try {
          const content = await loadChapterContentWithFallback(
            novel.id, chapterIndex, chapter, loadChapterContent
          );
          await new Promise(resolve => setTimeout(resolve, 50));
          setPreviousContent(chapterContent);
          setChapterContent(content);
        } catch (error) {
          console.error('Error loading chapter content:', error);
          setChapterContent("Error loading chapter content. Please try again.");
        } finally {
          setContentLoading(false);
        }
      }
    };
    loadContent();
  }, [chapterIndex, novel?.id]);

  // Save progress on unmount
  useEffect(() => {
    return () => {
      if (novel && chapter) {
        saveReadingProgress(novel.id, chapterIndex, chapter.title, scrollYRef.current);
      }
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [chapterIndex, novel?.id]);

  // Restore scroll position
  useEffect(() => {
    if (!settingsLoaded || contentLoading) return;

    if (forceTopRef.current) {
      forceTopRef.current = false;
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      return;
    }

    if (restoredChapterRef.current !== chapterIndex) {
      hasRestoredScrollRef.current = false;
    }

    const savedLastRead = novel?.lastRead;
    const savedOffset = (savedLastRead?.chapterIndex === chapterIndex) 
      ? savedLastRead.scrollOffset : 0;

    if (!hasRestoredScrollRef.current) {
      const timer = setTimeout(() => {
        scrollRef.current?.scrollTo({ y: savedOffset > 0 ? savedOffset : 0, animated: false });
        hasRestoredScrollRef.current = true;
        restoredChapterRef.current = chapterIndex;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [chapterIndex, novel?.lastRead, settingsLoaded, contentLoading]);

  const updateReadingProgress = useCallback(() => {
    if (contentHeightRef.current > scrollViewHeightRef.current) {
      const maxScroll = contentHeightRef.current - scrollViewHeightRef.current;
      const progress = (scrollYRef.current / maxScroll) * 100;
      setReadingProgress(Math.min(100, Math.max(0, progress)));
    } else {
      setReadingProgress(0);
    }
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setAutoScrollActive(false);
  }, []);

  const startAutoScroll = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const speed = AUTO_SCROLL_SPEEDS[autoScrollSpeedIdx];
    const baseSpeedPxPerSec = 30;
    const stepPxPerFrame = (baseSpeedPxPerSec * speed) / 20; // 20fps

    intervalRef.current = setInterval(() => {
      if (!scrollRef.current) return;
      const currentY = scrollYRef.current;
      const maxY = Math.max(0, contentHeightRef.current - scrollViewHeightRef.current);
      if (currentY >= maxY) {
        stopAutoScroll();
        return;
      }
      const newY = Math.min(maxY, currentY + stepPxPerFrame);
      scrollRef.current.scrollTo({ y: newY, animated: false });
      scrollYRef.current = newY;
    }, 50);
    
    setAutoScrollActive(true);
  }, [autoScrollSpeedIdx, stopAutoScroll]);

  const toggleAutoScroll = () => {
    if (autoScrollActive) {
      stopAutoScroll();
    } else {
      startAutoScroll();
    }
  };

  const handleScroll = (event: any) => {
    scrollYRef.current = event.nativeEvent.contentOffset.y;
    updateReadingProgress();
  };

  const handleScrollBeginDrag = () => {
    if (autoScrollActive) stopAutoScroll();
  };

  const handleContentSizeChange = (_width: number, height: number) => {
    contentHeightRef.current = height;
    updateReadingProgress();
  };

  const handleScrollViewLayout = (event: any) => {
    scrollViewHeightRef.current = event.nativeEvent.layout.height;
    updateReadingProgress();
  };

  const handleChapterSelect = (sortedIndex: number) => {
    const selectedChapter = sortedChapters[sortedIndex];
    if (!selectedChapter) return;
    const originalIndex = novel?.chapters.findIndex(c => c.url === selectedChapter.url) ?? 0;
    
    if (novel && chapter) {
      saveReadingProgress(novel.id, chapterIndex, chapter.title, scrollYRef.current);
    }
    
    scrollYRef.current = 0;
    hasRestoredScrollRef.current = false;
    forceTopRef.current = true;
    setChapterIndex(originalIndex);
    setShowTOC(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  if (!novel || !chapter || !settingsLoaded) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Loading reader...</Text>
      </View>
    );
  }

  const fontSize = FONT_SIZES[fontSizeIdx];
  const lineSpacing = LINE_SPACINGS[lineSpacingIdx];
  const currentSpeed = AUTO_SCROLL_SPEEDS[autoScrollSpeedIdx];

  const goChapter = (dir: 1 | -1) => {
    const next = chapterIndex + dir;
    if (next < 0 || next >= (novel?.chapters.length ?? 0)) {
      Alert.alert("Navigation", dir === -1 ? "First chapter reached" : "Last chapter reached");
      return;
    }
    
    if (novel && chapter) {
      saveReadingProgress(novel.id, chapterIndex, chapter.title, scrollYRef.current);
    }
    
    stopAutoScroll();
    scrollYRef.current = 0;
    hasRestoredScrollRef.current = false;
    forceTopRef.current = true;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setChapterIndex(next);
    setReadingProgress(0);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: topPad + 4, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable style={styles.navBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.chapterTitle, { color: colors.text }]} numberOfLines={1}>{chapter.title}</Text>
        <Pressable style={styles.navBtn} onPress={() => setShowControls((v) => !v)}>
          <Ionicons name="settings-outline" size={20} color={colors.text} />
        </Pressable>
      </View>

      {showControls && (
        <View style={[styles.controls, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View style={styles.controlRow}>
            <Text style={[styles.controlLabel, { color: colors.textSecondary }]}>Font</Text>
            <View style={styles.controlBtns}>
              <Pressable 
                style={[styles.controlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} 
                onPress={() => handleFontSizeChange(Math.max(0, fontSizeIdx - 1))}>
                <Text style={[styles.controlBtnText, { color: colors.text, fontSize: 12 }]}>A</Text>
              </Pressable>
              <Text style={[styles.controlValue, { color: colors.text }]}>{fontSize}pt</Text>
              <Pressable 
                style={[styles.controlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} 
                onPress={() => handleFontSizeChange(Math.min(FONT_SIZES.length - 1, fontSizeIdx + 1))}>
                <Text style={[styles.controlBtnText, { color: colors.text, fontSize: 18 }]}>A</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.controlRow}>
            <Text style={[styles.controlLabel, { color: colors.textSecondary }]}>Spacing</Text>
            <View style={styles.controlBtns}>
              <Pressable 
                style={[styles.controlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} 
                onPress={() => handleLineSpacingChange(Math.max(0, lineSpacingIdx - 1))}>
                <Ionicons name="remove" size={16} color={colors.text} />
              </Pressable>
              <Text style={[styles.controlValue, { color: colors.text }]}>{lineSpacing.toFixed(1)}x</Text>
              <Pressable 
                style={[styles.controlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} 
                onPress={() => handleLineSpacingChange(Math.min(LINE_SPACINGS.length - 1, lineSpacingIdx + 1))}>
                <Ionicons name="add" size={16} color={colors.text} />
              </Pressable>
            </View>
          </View>

          <View style={styles.controlRow}>
            <Text style={[styles.controlLabel, { color: colors.textSecondary }]}>AutoScroll</Text>
            <View style={styles.controlBtns}>
              <Pressable 
                style={[styles.controlBtn, { 
                  backgroundColor: autoScrollActive ? colors.accent : colors.surface, 
                  borderColor: colors.border 
                }]} 
                onPress={toggleAutoScroll}>
                <Ionicons 
                  name={autoScrollActive ? "pause" : "play"} 
                  size={16} 
                  color={autoScrollActive ? "#fff" : colors.text} 
                />
              </Pressable>
              <Pressable 
                style={[styles.controlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} 
                onPress={() => handleAutoScrollSpeedChange(Math.max(0, autoScrollSpeedIdx - 1))}>
                <Ionicons name="remove" size={16} color={colors.text} />
              </Pressable>
              <Text style={[styles.controlValue, { color: colors.text }]}>{currentSpeed.toFixed(1)}x</Text>
              <Pressable 
                style={[styles.controlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} 
                onPress={() => handleAutoScrollSpeedChange(Math.min(AUTO_SCROLL_SPEEDS.length - 1, autoScrollSpeedIdx + 1))}>
                <Ionicons name="add" size={16} color={colors.text} />
              </Pressable>
            </View>
          </View>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.scrollArea}
        contentContainerStyle={[styles.textContainer, { paddingBottom: bottomPad + 100 }]}
        onScroll={handleScroll}
        onScrollBeginDrag={handleScrollBeginDrag}
        onContentSizeChange={handleContentSizeChange}
        onLayout={handleScrollViewLayout}
        scrollEventThrottle={16}
      >
        <Text style={[styles.chapterHeader, { color: colors.accent }]}>{chapter.title}</Text>
        
        {contentLoading && !chapterContent ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading chapter...</Text>
          </View>
        ) : (
          <Text style={[styles.content, { color: colors.text, fontSize, lineHeight: fontSize * lineSpacing }]}>
            {chapterContent || previousContent || "Loading..."}
          </Text>
        )}
      </ScrollView>

      <View style={[styles.progressBarContainer, { backgroundColor: colors.border }]}>
        <View style={[styles.progressBar, { backgroundColor: colors.accent, width: `${readingProgress}%` }]} />
      </View>

      <View style={[styles.bottomNav, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: bottomPad + 8 }]}>
        <Pressable 
          style={[styles.navChBtn, { backgroundColor: chapterIndex === 0 ? colors.border : colors.card, borderColor: colors.border }]} 
          onPress={() => goChapter(-1)} 
          disabled={chapterIndex === 0}>
          <Ionicons name="chevron-back" size={18} color={chapterIndex === 0 ? colors.textMuted : colors.text} />
          <Text style={[styles.navChText, { color: chapterIndex === 0 ? colors.textMuted : colors.text }]}>Previous</Text>
        </Pressable>

        <Pressable 
          style={[styles.tocButton, { backgroundColor: colors.card, borderColor: colors.border }]} 
          onPress={() => setShowTOC(true)}>
          <Text style={[styles.tocButtonText, { color: colors.text }]}>{chapterIndex + 1} / {novel.chapters.length}</Text>
        </Pressable>

        <Pressable 
          style={[styles.navChBtn, { 
            backgroundColor: chapterIndex === (novel.chapters.length ?? 0) - 1 ? colors.border : colors.accent, 
            borderColor: chapterIndex === (novel.chapters.length ?? 0) - 1 ? colors.border : colors.accent 
          }]} 
          onPress={() => goChapter(1)} 
          disabled={chapterIndex === (novel.chapters.length ?? 0) - 1}>
          <Text style={[styles.navChText, { color: chapterIndex === (novel.chapters.length ?? 0) - 1 ? colors.textMuted : "#fff" }]}>Next</Text>
          <Ionicons name="chevron-forward" size={18} color={chapterIndex === (novel.chapters.length ?? 0) - 1 ? colors.textMuted : "#fff"} />
        </Pressable>
      </View>

      <Modal visible={showTOC} animationType="slide" transparent onRequestClose={() => setShowTOC(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Table of Contents</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable onPress={toggleSortOrder} style={[styles.sortBtn, { borderColor: colors.border }]}>
                  <Ionicons name={sortOrder === "ascending" ? "arrow-up" : "arrow-down"} size={18} color={colors.accent} />
                  <Text style={[styles.sortBtnText, { color: colors.accent }]}>{sortOrder === "ascending" ? "Asc" : "Desc"}</Text>
                </Pressable>
                <Pressable onPress={() => setShowTOC(false)} style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </Pressable>
              </View>
            </View>
            <ScrollView style={styles.modalScrollView}>
              {sortedChapters.map((ch, idx) => {
                const originalIndex = novel.chapters.findIndex(c => c.url === ch.url);
                const isCurrent = chapterIndex === originalIndex;
                return (
                  <Pressable
                    key={ch.url || idx}
                    style={[styles.tocItem, isCurrent && [styles.tocItemActive, { backgroundColor: colors.accent + '20' }]]}
                    onPress={() => handleChapterSelect(idx)}>
                    <View style={styles.tocItemContent}>
                      <Text style={[styles.tocChapterNum, { color: isCurrent ? colors.accent : colors.textSecondary }]}>
                        Chapter {originalIndex + 1}
                      </Text>
                      <Text style={[styles.tocChapterTitle, { color: isCurrent ? colors.accent : colors.text }]}>
                        {ch.title}
                      </Text>
                    </View>
                    {isCurrent && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: { 
    flexDirection: "row", alignItems: "center", paddingHorizontal: 4, 
    paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 
  },
  navBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  chapterTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, flex: 1, textAlign: "center" },
  progressBarContainer: { height: 3, width: '100%', overflow: 'hidden' },
  progressBar: { height: '100%', width: '0%' },
  controls: { paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  controlRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  controlLabel: { fontFamily: "Inter_500Medium", fontSize: 13, width: 80 },
  controlBtns: { flexDirection: "row", alignItems: "center", gap: 12 },
  controlBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 8, borderWidth: 1 },
  controlBtnText: { fontFamily: "Inter_700Bold" },
  controlValue: { fontFamily: "Inter_500Medium", fontSize: 13, width: 40, textAlign: "center" },
  scrollArea: { flex: 1 },
  textContainer: { paddingHorizontal: 22, paddingTop: 20 },
  chapterHeader: { fontFamily: "Inter_700Bold", fontSize: 18, marginBottom: 20, lineHeight: 26 },
  content: { fontFamily: "Inter_400Regular" },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 8 },
  bottomNav: { 
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", 
    paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 12 
  },
  navChBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  navChText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  tocButton: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, minWidth: 70, alignItems: "center" },
  tocButtonText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%', minHeight: '50%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e0e0e0' },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 18 },
  modalCloseBtn: { padding: 4 },
  modalScrollView: { paddingHorizontal: 20, paddingVertical: 12 },
  tocItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e0e0e0' },
  tocItemActive: { borderRadius: 8 },
  tocItemContent: { flex: 1 },
  tocChapterNum: { fontFamily: "Inter_400Regular", fontSize: 12, marginBottom: 4 },
  tocChapterTitle: { fontFamily: "Inter_500Medium", fontSize: 14 },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  sortBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
});
