import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useLibrary } from "@/context/LibraryContext";
import { useTheme } from "@/context/ThemeContext";

const FONT_SIZES = [12, 13, 14, 15, 16, 17, 18, 19, 20];
const LINE_SPACINGS = [1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2.0];
const AUTO_SCROLL_SPEEDS = [0.5, 0.8, 1, 1.5, 1.8, 2];

// Storage keys for persistent settings
const STORAGE_KEYS = {
  FONT_SIZE_IDX: 'reader_font_size_idx',
  LINE_SPACING_IDX: 'reader_line_spacing_idx',
};

export default function ReaderScreen() {
  const { id, chapterIndex: indexParam } = useLocalSearchParams<{
    id: string;
    chapterIndex: string;
  }>();
  const { getNovel, saveReadingProgress } = useLibrary();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [fontSizeIdx, setFontSizeIdx] = useState(1);
  const [lineSpacingIdx, setLineSpacingIdx] = useState(1);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [showTOC, setShowTOC] = useState(false);
  const [chapterIndex, setChapterIndex] = useState(parseInt(indexParam) || 0);
  const scrollRef = useRef<ScrollView>(null);

  const [autoScrollActive, setAutoScrollActive] = useState(false);
  const [autoScrollSpeedIdx, setAutoScrollSpeedIdx] = useState(1);
  
  // Progress tracking
  const [readingProgress, setReadingProgress] = useState(0);
  const scrollYRef = useRef(0);
  const contentHeightRef = useRef(0);
  const scrollViewHeightRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track if we've already restored scroll position for current chapter
  const hasRestoredScrollRef = useRef(false);
  // Track the chapter we restored for
  const restoredChapterRef = useRef<number>(-1);

  const novel = getNovel(id);
  const chapter = novel?.chapters[chapterIndex];

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  // Load saved settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [savedFontSize, savedLineSpacing] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.FONT_SIZE_IDX),
          AsyncStorage.getItem(STORAGE_KEYS.LINE_SPACING_IDX),
        ]);
        
        if (savedFontSize !== null) {
          setFontSizeIdx(parseInt(savedFontSize));
        }
        if (savedLineSpacing !== null) {
          setLineSpacingIdx(parseInt(savedLineSpacing));
        }
      } catch (error) {
        console.error('Failed to load reader settings:', error);
      } finally {
        setSettingsLoaded(true);
      }
    };
    
    loadSettings();
  }, []);

  // Save font size when changed
  const handleFontSizeChange = async (newIdx: number) => {
    setFontSizeIdx(newIdx);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.FONT_SIZE_IDX, newIdx.toString());
    } catch (error) {
      console.error('Failed to save font size:', error);
    }
  };

  // Save line spacing when changed
  const handleLineSpacingChange = async (newIdx: number) => {
    setLineSpacingIdx(newIdx);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.LINE_SPACING_IDX, newIdx.toString());
    } catch (error) {
      console.error('Failed to save line spacing:', error);
    }
  };

  // Save progress when unmounting or when chapter changes
  useEffect(() => {
    // Save current chapter's scroll position before changing
    return () => {
      if (novel && chapter) {
        saveReadingProgress(
          novel.id,
          chapterIndex,
          chapter.title,
          scrollYRef.current
        );
      }
    };
  }, [chapterIndex, novel?.id, novel, chapter, saveReadingProgress]);

  // Restore scroll position when chapter changes or component mounts
  useEffect(() => {
    if (!settingsLoaded) return;
    
    // Only restore if this is a different chapter than the last restored one
    if (restoredChapterRef.current !== chapterIndex) {
      hasRestoredScrollRef.current = false;
    }
    
    const savedOffset = novel?.lastRead?.scrollOffset || 0;
    
    // Only restore if we haven't restored for this chapter yet
    if (!hasRestoredScrollRef.current) {
      if (savedOffset > 0) {
        // Small delay to ensure the ScrollView has rendered
        const timer = setTimeout(() => {
          scrollRef.current?.scrollTo({
            y: savedOffset,
            animated: false,
          });
          hasRestoredScrollRef.current = true;
          restoredChapterRef.current = chapterIndex;
        }, 150);
        
        return () => clearTimeout(timer);
      } else {
        // No saved position, scroll to top
        scrollRef.current?.scrollTo({ y: 0, animated: false });
        hasRestoredScrollRef.current = true;
        restoredChapterRef.current = chapterIndex;
      }
    }
  }, [chapterIndex, novel?.lastRead?.scrollOffset, settingsLoaded]);

  // Calculate reading progress
  const updateReadingProgress = useCallback(() => {
    if (contentHeightRef.current > scrollViewHeightRef.current) {
      const maxScroll = contentHeightRef.current - scrollViewHeightRef.current;
      const progress = (scrollYRef.current / maxScroll) * 100;
      setReadingProgress(Math.min(100, Math.max(0, progress)));
    } else {
      setReadingProgress(0);
    }
  }, []);

  // Auto-scroll logic
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
    const baseSpeedPxPerSec = 60;
    const stepPxPerFrame = (baseSpeedPxPerSec * speed) / 60;

    intervalRef.current = setInterval(() => {
      if (!scrollRef.current) return;
      const currentY = scrollYRef.current;
      const maxY = Math.max(0, contentHeightRef.current - scrollViewHeightRef.current);
      const newY = Math.min(maxY, currentY + stepPxPerFrame);

      scrollRef.current.scrollTo({ y: newY, animated: false });

      if (newY >= maxY) stopAutoScroll();
    }, 1000 / 60);
  }, [autoScrollSpeedIdx, stopAutoScroll]);

  useEffect(() => {
    if (autoScrollActive) startAutoScroll();
    else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoScrollActive, startAutoScroll]);

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

  const handleChapterSelect = (index: number) => {
    // Save current chapter progress before switching
    if (novel && chapter) {
      saveReadingProgress(
        novel.id,
        chapterIndex,
        chapter.title,
        scrollYRef.current
      );
    }
    // Reset the restore flag for the new chapter
    hasRestoredScrollRef.current = false;
    setChapterIndex(index);
    setShowTOC(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  if (!novel || !chapter || !settingsLoaded) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Loading...</Text>
      </View>
    );
  }

  const fontSize = FONT_SIZES[fontSizeIdx];
  const lineSpacing = LINE_SPACINGS[lineSpacingIdx];
  const currentSpeed = AUTO_SCROLL_SPEEDS[autoScrollSpeedIdx];

  const goChapter = (dir: 1 | -1) => {
    const next = chapterIndex + dir;
    if (next < 0 || next >= novel.chapters.length) {
      Alert.alert("Navigation", dir === -1 ? "First chapter reached" : "Last chapter reached");
      return;
    }
    
    // Save current chapter progress before navigating
    if (novel && chapter) {
      saveReadingProgress(
        novel.id,
        chapterIndex,
        chapter.title,
        scrollYRef.current
      );
    }
    
    // Reset the restore flag for the new chapter
    hasRestoredScrollRef.current = false;
    
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
              <Pressable style={[styles.controlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setAutoScrollActive((prev) => !prev)}>
                <Ionicons name={autoScrollActive ? "pause" : "play"} size={16} color={colors.text} />
              </Pressable>
              <Pressable style={[styles.controlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setAutoScrollSpeedIdx((i) => Math.max(0, i - 1))}>
                <Ionicons name="remove" size={16} color={colors.text} />
              </Pressable>
              <Text style={[styles.controlValue, { color: colors.text }]}>{currentSpeed.toFixed(1)}x</Text>
              <Pressable style={[styles.controlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setAutoScrollSpeedIdx((i) => Math.min(AUTO_SCROLL_SPEEDS.length - 1, i + 1))}>
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
        <Text style={[styles.content, { color: colors.text, fontSize, lineHeight: fontSize * lineSpacing }]} >
          {chapter.content || "Content not available for this chapter."}
        </Text>
      </ScrollView>

      {/* Progress Bar placed above bottom navigation */}
      <View style={[styles.progressBarContainer, { backgroundColor: colors.border }]}>
        <View 
          style={[
            styles.progressBar, 
            { 
              backgroundColor: colors.accent,
              width: `${readingProgress}%`
            }
          ]} 
        />
      </View>

      <View style={[styles.bottomNav, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: bottomPad + 8 }]}>
        <Pressable style={[styles.navChBtn, { backgroundColor: chapterIndex === 0 ? colors.border : colors.card, borderColor: colors.border }]} onPress={() => goChapter(-1)} disabled={chapterIndex === 0}>
          <Ionicons name="chevron-back" size={18} color={chapterIndex === 0 ? colors.textMuted : colors.text} />
          <Text style={[styles.navChText, { color: chapterIndex === 0 ? colors.textMuted : colors.text }]}>Previous</Text>
        </Pressable>

        {/* TOC Button - using chapter count */}
        <Pressable style={[styles.tocButton, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => setShowTOC(true)}>
          <Text style={[styles.tocButtonText, { color: colors.text }]}>
            {chapterIndex + 1} / {novel.chapters.length}
          </Text>
        </Pressable>

        <Pressable style={[styles.navChBtn, { backgroundColor: chapterIndex === novel.chapters.length - 1 ? colors.border : colors.accent, borderColor: chapterIndex === novel.chapters.length - 1 ? colors.border : colors.accent }]} onPress={() => goChapter(1)} disabled={chapterIndex === novel.chapters.length - 1}>
          <Text style={[styles.navChText, { color: chapterIndex === novel.chapters.length - 1 ? colors.textMuted : "#fff" }]}>Next</Text>
          <Ionicons name="chevron-forward" size={18} color={chapterIndex === novel.chapters.length - 1 ? colors.textMuted : "#fff"} />
        </Pressable>
      </View>

      {/* Table of Contents Modal */}
      <Modal
        visible={showTOC}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowTOC(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Table of Contents</Text>
              <Pressable onPress={() => setShowTOC(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScrollView}>
              {novel.chapters.map((ch, idx) => (
                <Pressable
                  key={idx}
                  style={[
                    styles.tocItem,
                    idx === chapterIndex && [styles.tocItemActive, { backgroundColor: colors.accent + '20' }]
                  ]}
                  onPress={() => handleChapterSelect(idx)}
                >
                  <View style={styles.tocItemContent}>
                    <Text style={[
                      styles.tocChapterNum,
                      { color: idx === chapterIndex ? colors.accent : colors.textSecondary }
                    ]}>
                      Chapter {idx + 1}
                    </Text>
                    <Text style={[
                      styles.tocChapterTitle,
                      { color: idx === chapterIndex ? colors.accent : colors.text }
                    ]}>
                      {ch.title}
                    </Text>
                  </View>
                  {idx === chapterIndex && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                  )}
                </Pressable>
              ))}
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
    flexDirection: "row", 
    alignItems: "center", 
    paddingHorizontal: 4, 
    paddingBottom: 10, 
    borderBottomWidth: StyleSheet.hairlineWidth, 
    gap: 4 
  },
  navBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  chapterTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, flex: 1, textAlign: "center" },
  
  // Progress Bar Styles
  progressBarContainer: {
    height: 3,
    width: '100%',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    width: '0%',
  },
  
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
  bottomNav: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between", 
    paddingHorizontal: 16, 
    paddingTop: 10, 
    borderTopWidth: StyleSheet.hairlineWidth, 
    gap: 12 
  },
  navChBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  navChText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  tocButton: { 
    paddingHorizontal: 16, 
    paddingVertical: 10, 
    borderRadius: 10, 
    borderWidth: 1,
    minWidth: 70,
    alignItems: "center",
  },
  tocButtonText: { 
    fontFamily: "Inter_600SemiBold", 
    fontSize: 14,
  },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalScrollView: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  tocItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  tocItemActive: {
    borderRadius: 8,
  },
  tocItemContent: {
    flex: 1,
  },
  tocChapterNum: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginBottom: 4,
  },
  tocChapterTitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
});

