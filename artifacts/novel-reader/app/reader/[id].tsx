import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
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
const SCROLL_SPEEDS = [0.5, 1, 1.5, 2.5, 4]; // px per tick at 16ms interval
const SCROLL_SPEED_LABELS = ["Slow", "Normal", "Fast", "Faster", "Max"];

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
  const [autoScroll, setAutoScroll] = useState(false);
  const [scrollSpeedIdx, setScrollSpeedIdx] = useState(1);
  const scrollRef = useRef<ScrollView>(null);
  const autoScrollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollYRef = useRef(0);

  const startAutoScroll = () => {
    if (autoScrollRef.current) clearInterval(autoScrollRef.current);
    autoScrollRef.current = setInterval(() => {
      scrollYRef.current += SCROLL_SPEEDS[scrollSpeedIdx];
      scrollRef.current?.scrollTo({ y: scrollYRef.current, animated: false });
    }, 16);
  };

  const stopAutoScroll = () => {
    if (autoScrollRef.current) {
      clearInterval(autoScrollRef.current);
      autoScrollRef.current = null;
    }
    setAutoScroll(false);
  };

  const toggleAutoScroll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (autoScroll) {
      stopAutoScroll();
    } else {
      setAutoScroll(true);
      startAutoScroll();
    }
  };

  // restart interval when speed changes while scrolling
  useEffect(() => {
    if (autoScroll) startAutoScroll();
  }, [scrollSpeedIdx]);

  // stop auto-scroll on chapter change
  useEffect(() => {
    stopAutoScroll();
    scrollYRef.current = 0;
  }, [chapterIndex]);

  const novel = getNovel(id);
  const chapter = novel?.chapters[chapterIndex];

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

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
      <View style={[styles.topBar, { paddingTop: topPad + 4, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable
          style={styles.navBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
        >
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>

        <Text style={[styles.chapterTitle, { color: colors.text }]} numberOfLines={1}>
          {chapter.title}
        </Text>

        <Pressable
          style={styles.navBtn}
          onPress={() => setShowControls((v) => !v)}
        >
          <Ionicons name="text" size={20} color={colors.text} />
        </Pressable>

        <Pressable
          style={[styles.navBtn, autoScroll && { backgroundColor: colors.accent + "33", borderRadius: 10 }]}
          onPress={toggleAutoScroll}
        >
          <Ionicons name={autoScroll ? "pause-circle" : "play-circle"} size={22} color={autoScroll ? colors.accent : colors.text} />
        </Pressable>
      </View>

      {showControls && (
        <View style={[styles.controls, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View style={styles.controlRow}>
            <Text style={[styles.controlLabel, { color: colors.textSecondary }]}>Font</Text>
            <View style={styles.controlBtns}>
              <Pressable
                style={[styles.controlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => setFontSizeIdx((i) => Math.max(0, i - 1))}
              >
                <Text style={[styles.controlBtnText, { color: colors.text, fontSize: 12 }]}>A</Text>
              </Pressable>
              <Text style={[styles.controlValue, { color: colors.text }]}>{fontSize}pt</Text>
              <Pressable
                style={[styles.controlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => setFontSizeIdx((i) => Math.min(FONT_SIZES.length - 1, i + 1))}
              >
                <Text style={[styles.controlBtnText, { color: colors.text, fontSize: 18 }]}>A</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.controlRow}>
            <Text style={[styles.controlLabel, { color: colors.textSecondary }]}>Spacing</Text>
            <View style={styles.controlBtns}>
              <Pressable
                style={[styles.controlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => setLineSpacingIdx((i) => Math.max(0, i - 1))}
              >
                <Ionicons name="remove" size={16} color={colors.text} />
              </Pressable>
              <Text style={[styles.controlValue, { color: colors.text }]}>{lineSpacing.toFixed(1)}x</Text>
              <Pressable
                style={[styles.controlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => setLineSpacingIdx((i) => Math.min(LINE_SPACINGS.length - 1, i + 1))}
              >
                <Ionicons name="add" size={16} color={colors.text} />
              </Pressable>
            </View>
          </View>
          <View style={styles.controlRow}>
            <Text style={[styles.controlLabel, { color: colors.textSecondary }]}>Scroll</Text>
            <View style={styles.controlBtns}>
              <Pressable
                style={[styles.controlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => setScrollSpeedIdx((i) => Math.max(0, i - 1))}
              >
                <Ionicons name="remove" size={16} color={colors.text} />
              </Pressable>
              <Text style={[styles.controlValue, { color: colors.text, width: 52 }]}>
                {SCROLL_SPEED_LABELS[scrollSpeedIdx]}
              </Text>
              <Pressable
                style={[styles.controlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => setScrollSpeedIdx((i) => Math.min(SCROLL_SPEEDS.length - 1, i + 1))}
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
        onScrollBeginDrag={stopAutoScroll}
        onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
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

      <View style={[styles.bottomNav, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: bottomPad + 8 }]}>
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
          <Ionicons name="chevron-back" size={18} color={chapterIndex === 0 ? colors.textMuted : colors.text} />
          <Text style={[styles.navChText, { color: chapterIndex === 0 ? colors.textMuted : colors.text }]}>
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
              backgroundColor: chapterIndex === novel.chapters.length - 1 ? colors.border : colors.accent,
              borderColor: chapterIndex === novel.chapters.length - 1 ? colors.border : colors.accent,
            },
          ]}
          onPress={() => goChapter(1)}
          disabled={chapterIndex === novel.chapters.length - 1}
        >
          <Text style={[styles.navChText, { color: chapterIndex === novel.chapters.length - 1 ? colors.textMuted : "#fff" }]}>
            Next
          </Text>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={chapterIndex === novel.chapters.length - 1 ? colors.textMuted : "#fff"}
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
  controlRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  controlLabel: { fontFamily: "Inter_500Medium", fontSize: 13, width: 60 },
  controlBtns: { flexDirection: "row", alignItems: "center", gap: 12 },
  controlBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
  },
  controlBtnText: { fontFamily: "Inter_700Bold" },
  controlValue: { fontFamily: "Inter_500Medium", fontSize: 13, width: 40, textAlign: "center" },
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
  navChText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  chapNum: { fontFamily: "Inter_400Regular", fontSize: 13, flex: 1, textAlign: "center" },
});
