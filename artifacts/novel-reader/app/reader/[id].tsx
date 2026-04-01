import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLibrary } from "@/context/LibraryContext";
import { useTheme } from "@/context/ThemeContext";

const FONT_SIZES = [13, 15, 17, 19, 22];
const LINE_SPACINGS = [1.4, 1.6, 1.8, 2.0];
const AUTO_SCROLL_SPEEDS = [0.5, 1, 1.5, 2]; // speed multipliers (base = 60px/s)

export default function ReaderScreen() {
  const { id, chapterIndex: indexParam } = useLocalSearchParams<{
    id: string;
    chapterIndex: string;
  }>();
  const { getNovel, saveReadingProgress } = useLibrary();
  const { colors, theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [fontSizeIdx, setFontSizeIdx] = useState(1);
  const [lineSpacingIdx, setLineSpacingIdx] = useState(1);
  const [showControls, setShowControls] = useState(false);
  const [chapterIndex, setChapterIndex] = useState(parseInt(indexParam) || 0);
  const scrollRef = useRef<ScrollView>(null);

  // Auto‑scroll state
  const [autoScrollActive, setAutoScrollActive] = useState(false);
  const [autoScrollSpeedIdx, setAutoScrollSpeedIdx] = useState(1); // default 1.0x

  // Refs for scroll position and layout
  const scrollYRef = useRef(0);
  const contentHeightRef = useRef(0);
  const scrollViewHeightRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const novel = getNovel(id);
  const chapter = novel?.chapters[chapterIndex];

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  // ----- Auto‑scroll control functions -----
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
    const baseSpeedPxPerSec = 60; // pixels per second at 1.0x
    const stepPxPerFrame = (baseSpeedPxPerSec * speed) / 60; // 60 fps

    intervalRef.current = setInterval(() => {
      if (!scrollRef.current) return;
      const currentY = scrollYRef.current;
      const maxY = Math.max(0, contentHeightRef.current - scrollViewHeightRef.current);
      const newY = Math.min(maxY, currentY + stepPxPerFrame);

      scrollRef.current.scrollTo({ y: newY, animated: false });

      // Stop if we reached the bottom
      if (newY >= maxY) {
        stopAutoScroll();
      }
    }, 1000 / 60); // ~16ms for 60fps
  }, [autoScrollSpeedIdx, stopAutoScroll]);

  // Start / stop auto‑scroll when active flag changes
  useEffect(() => {
    if (autoScrollActive) {
      startAutoScroll();
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoScrollActive, startAutoScroll]);

  // Restart auto‑scroll if speed changes while active
  useEffect(() => {
    if (autoScrollActive) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      startAutoScroll();
    }
  }, [autoScrollSpeedIdx, autoScrollActive, startAutoScroll]);

  // Stop auto‑scroll when changing chapters
  useEffect(() => {
    stopAutoScroll();
  }, [chapterIndex, stopAutoScroll]);

  // ----- Event handlers for scroll tracking -----
  const handleScroll = (event: any) => {
    scrollYRef.current = event.nativeEvent.contentOffset.y;
  };

  const handleScrollBeginDrag = () => {
    if (autoScrollActive) {
      stopAutoScroll();
    }
  };

  const handleContentSizeChange = (_width: number, height: number) => {
    contentHeightRef.current = height;
  };

  const handleScrollViewLayout = (event: any) => {
    scrollViewHeightRef.current = event.nativeEvent.layout.height;
  };

  // ----- Existing effects and navigation -----
  useEffect(() => {
    if (novel && chapter) {
      saveReadingProgress(novel.id, chapterIndex, chapter.title);
    }
  }, [chapterIndex, novel?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [chapterIndex]);

  if (!novel || !chapter) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Chapter not found</Text>
      </View>
    );
  }

  const fontSize = FONT_SIZES[fontSizeIdx];
  const lineSpacing = LINE_SPACINGS[lineSpacingIdx];
  const currentSpeed = AUTO_SCROLL_SPEEDS[autoScrollSpeedIdx];

  const goChapter = (dir: 1 | -1) => {
    const next = chapterIndex + dir;
    if (next < 0 || next >= novel.chapters.length) {
      const msg = dir === -1 ? "First chapter reached" : "Last chapter reached";
      Alert.alert("Navigation", msg);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setChapterIndex(next);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.topBar,
          {
            paddingTop: topPad + 4,
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable
          style={styles.navBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
        >
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>

        <Text
          style={[styles.chapterTitle, { color: colors.text }]}
          numberOfLines={1}
        >
          {chapter.title}
        </Text>

        <Pressable style={styles.navBtn} onPress={() => setShowControls((v) => !v)}>
          {/* Changed from "text" to gear icon */}
          <Ionicons name="settings-outline" size={20} color={colors.text} />
        </Pressable>
      </View>

      {showControls && (
        <View
          style={[
            styles.controls,
            { backgroundColor: colors.card, borderBottomColor: colors.border },
          ]}
        >
          <View style={styles.controlRow}>
            <Text
              style={[styles.controlLabel, { color: colors.textSecondary }]}
            >
              Font
            </Text>
            <View style={styles.controlBtns}>
              <Pressable
                style={[
                  styles.controlBtn,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={() => setFontSizeIdx((i) => Math.max(0, i - 1))}
              >
                <Text
                  style={[styles.controlBtnText, { color: colors.text, fontSize: 12 }]}
                >
                  A
                </Text>
              </Pressable>
              <Text style={[styles.controlValue, { color: colors.text }]}>
                {fontSize}pt
              </Text>
              <Pressable
                style={[
                  styles.controlBtn,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={() =>
                  setFontSizeIdx((i) => Math.min(FONT_SIZES.length - 1, i + 1))
                }
              >
                <Text
                  style={[styles.controlBtnText, { color: colors.text, fontSize: 18 }]}
                >
                  A
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.controlRow}>
            <Text
              style={[styles.controlLabel, { color: colors.textSecondary }]}
            >
              Spacing
            </Text>
            <View style={styles.controlBtns}>
              <Pressable
                style={[
                  styles.controlBtn,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={() => setLineSpacingIdx((i) => Math.max(0, i - 1))}
              >
                <Ionicons name="remove" size={16} color={colors.text} />
              </Pressable>
              <Text style={[styles.controlValue, { color: colors.text }]}>
                {lineSpacing.toFixed(1)}x
              </Text>
              <Pressable
                style={[
                  styles.controlBtn,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={() =>
                  setLineSpacingIdx((i) => Math.min(LINE_SPACINGS.length - 1, i + 1))
                }
              >
                <Ionicons name="add" size={16} color={colors.text} />
              </Pressable>
            </View>
          </View>

          {/* New AutoScroll row */}
          <View style={styles.controlRow}>
            <Text
              style={[styles.controlLabel, { color: colors.textSecondary }]}
            >
              AutoScroll
            </Text>
            <View style={styles.controlBtns}>
              <Pressable
                style={[
                  styles.controlBtn,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={() => setAutoScrollActive((prev) => !prev)}
              >
                <Ionicons
                  name={autoScrollActive ? "pause" : "play"}
                  size={16}
                  color={colors.text}
                />
              </Pressable>
              <Pressable
                style={[
                  styles.controlBtn,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={() =>
                  setAutoScrollSpeedIdx((i) => Math.max(0, i - 1))
                }
              >
                <Ionicons name="remove" size={16} color={colors.text} />
              </Pressable>
              <Text style={[styles.controlValue, { color: colors.text }]}>
                {currentSpeed.toFixed(1)}x
              </Text>
              <Pressable
                style={[
                  styles.controlBtn,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={() =>
                  setAutoScrollSpeedIdx((i) =>
                    Math.min(AUTO_SCROLL_SPEEDS.length - 1, i + 1)
                  )
                }
              >
                <Ionicons name="add" size={16} color={colors.text} />
              </Pressable>
            </View>
          </View>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.scrollArea}
        contentContainerStyle={[
          styles.textContainer,
          { paddingBottom: bottomPad + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        onScrollBeginDrag={handleScrollBeginDrag}
        onContentSizeChange={handleContentSizeChange}
        onLayout={handleScrollViewLayout}
        scrollEventThrottle={16}
      >
        <Text style={[styles.chapterHeader, { color: colors.accent }]}>
          {chapter.title}
        </Text>
        <Text
          style={[
            styles.content,
            {
              color: colors.text,
              fontSize,
              lineHeight: fontSize * lineSpacing,
            },
          ]}
          selectable
        >
          {chapter.content || "Content not available for this chapter."}
        </Text>
      </ScrollView>

      <View
        style={[
          styles.bottomNav,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingBottom: bottomPad + 8,
          },
        ]}
      >
        <Pressable
          style={[
            styles.navChBtn,
            {
              backgroundColor: chapterIndex === 0 ? colors.border : colors.card,
              borderColor: colors.border,
            },
          ]}
          onPress={() => goChapter(-1)}
          disabled={chapterIndex === 0}
        >
          <Ionicons
            name="chevron-back"
            size={18}
            color={chapterIndex === 0 ? colors.textMuted : colors.text}
          />
          <Text
            style={[
              styles.navChText,
              {
                color: chapterIndex === 0 ? colors.textMuted : colors.text,
              },
            ]}
          >
            Previous
          </Text>
        </Pressable>

        <Text style={[styles.chapNum, { color: colors.textSecondary }]}>
          {chapterIndex + 1} / {novel.chapters.length}
        </Text>

        <Pressable
          style={[
            styles.navChBtn,
            {
              backgroundColor:
                chapterIndex === novel.chapters.length - 1
                  ? colors.border
                  : colors.accent,
              borderColor:
                chapterIndex === novel.chapters.length - 1
                  ? colors.border
                  : colors.accent,
            },
          ]}
          onPress={() => goChapter(1)}
          disabled={chapterIndex === novel.chapters.length - 1}
        >
          <Text
            style={[
              styles.navChText,
              {
                color:
                  chapterIndex === novel.chapters.length - 1
                    ? colors.textMuted
                    : "#fff",
              },
            ]}
          >
            Next
          </Text>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={
              chapterIndex === novel.chapters.length - 1
                ? colors.textMuted
                : "#fff"
            }
          />
        </Pressable>
      </View>
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
    gap: 4,
  },
  navBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  chapterTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    flex: 1,
    textAlign: "center",
  },
  controls: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  controlLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    width: 60,
  },
  controlBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  controlBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
  },
  controlBtnText: {
    fontFamily: "Inter_700Bold",
  },
  controlValue: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    width: 40,
    textAlign: "center",
  },
  scrollArea: { flex: 1 },
  textContainer: {
    paddingHorizontal: 22,
    paddingTop: 20,
  },
  chapterHeader: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    marginBottom: 20,
    lineHeight: 26,
  },
  content: {
    fontFamily: "Inter_400Regular",
  },
  bottomNav: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  navChBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  navChText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  chapNum: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    flex: 1,
    textAlign: "center",
  },
});
