import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  FlatList,
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

export default function NovelDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getNovel, sortOrder, toggleSortOrder, getSortedChapters } = useLibrary();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);

  const novel = getNovel(id);

  if (!novel) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Novel not found</Text>
      </View>
    );
  }

  const sortedChapters = getSortedChapters(novel.chapters);

  const progress = novel.lastRead
    ? `${novel.lastRead.chapterIndex + 1} / ${novel.chapters.length}`
    : `0 / ${novel.chapters.length}`;
  const progressPct = novel.lastRead
    ? (novel.lastRead.chapterIndex + 1) / Math.max(novel.chapters.length, 1)
    : 0;

  const firstParagraph = novel.synopsis.split("\n\n")[0] || novel.synopsis.slice(0, 200);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.navBar, { paddingTop: topPad + 4, borderBottomColor: colors.border }]}>
        <Pressable
          style={styles.backBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
          <Text style={[styles.backLabel, { color: colors.accent }]}>Library</Text>
        </Pressable>
        <Text style={[styles.navTitle, { color: colors.text }]} numberOfLines={1}>
          {novel.title}
        </Text>
        <View style={{ width: 70 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPad + 20 }}
      >
        <View style={styles.hero}>
          <View style={styles.coverWrap}>
            {novel.coverUrl ? (
              <Image source={{ uri: novel.coverUrl }} style={styles.cover} contentFit="cover" />
            ) : (
              <View style={[styles.coverPlaceholder, { backgroundColor: colors.card }]}>
                <Ionicons name="book" size={48} color={colors.accent} />
              </View>
            )}
          </View>
          <View style={styles.heroInfo}>
            <Text style={[styles.heroTitle, { color: colors.text }]}>{novel.title}</Text>
            <Text style={[styles.heroAuthor, { color: colors.textSecondary }]}>{novel.author}</Text>

            <View style={styles.heroButtons}>
              <Pressable
                style={[styles.readBtn, { backgroundColor: colors.accent }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  const startIndex = novel.lastRead?.chapterIndex ?? 0;
                  router.push({
                    pathname: "/reader/[id]",
                    params: { id: novel.id, chapterIndex: startIndex.toString() },
                  });
                }}
              >
                <Ionicons name={novel.lastRead ? "play" : "book-outline"} size={16} color="#fff" />
                <Text style={styles.readBtnText}>
                  {novel.lastRead ? "Continue" : "Start Reading"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.content}>
          {novel.lastRead && (
            <View style={[styles.progressCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.progressTop}>
                <Text style={[styles.progressLabel, { color: colors.text }]}>Reading Progress</Text>
                <Text style={[styles.progressCount, { color: colors.accent }]}>{progress}</Text>
              </View>
              <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.progressFill,
                    { backgroundColor: colors.accent, width: `${progressPct * 100}%` },
                  ]}
                />
              </View>
              <Text style={[styles.lastReadLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                Last: {novel.lastRead.chapterTitle}
              </Text>
            </View>
          )}

          <Text style={[styles.sectionTitle, { color: colors.text }]}>Synopsis</Text>
          <Pressable
            style={[styles.synopsisCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setSynopsisExpanded((e) => !e)}
          >
            <Text style={[styles.synopsisText, { color: colors.textSecondary }]}>
              {synopsisExpanded ? novel.synopsis : firstParagraph}
              {!synopsisExpanded && novel.synopsis.length > firstParagraph.length ? "..." : ""}
            </Text>
            <View style={styles.seeMoreRow}>
              <Text style={[styles.seeMore, { color: colors.accent }]}>
                {synopsisExpanded ? "See Less" : "See More"}
              </Text>
              <Ionicons
                name={synopsisExpanded ? "chevron-up" : "chevron-down"}
                size={14}
                color={colors.accent}
              />
            </View>
          </Pressable>

          {/* Chapters Header with Sort Toggle */}
          <View style={styles.chapterHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Chapters ({novel.chapters.length})
            </Text>
            <Pressable
              onPress={toggleSortOrder}
              style={[styles.sortBtn, { borderColor: colors.border }]}
            >
              <Ionicons
                name={sortOrder === "ascending" ? "arrow-up" : "arrow-down"}
                size={16}
                color={colors.accent}
              />
              <Text style={[styles.sortBtnText, { color: colors.accent }]}>
                {sortOrder === "ascending" ? "Asc" : "Desc"}
              </Text>
            </Pressable>
          </View>

          {sortedChapters.map((ch, i) => {
            // Find original index for "Continue" highlighting
            const originalIndex = novel.chapters.findIndex(c => c.url === ch.url);
            const isCurrent = novel.lastRead?.chapterIndex === originalIndex;
            return (
              <Pressable
                key={i}
                style={[
                  styles.chapterRow,
                  {
                    backgroundColor: isCurrent ? colors.accent + "18" : colors.card,
                    borderColor: isCurrent ? colors.accent : colors.border,
                  },
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  router.push({
                    pathname: "/reader/[id]",
                    params: { id: novel.id, chapterIndex: originalIndex.toString() },
                  });
                }}
              >
                <Text style={[styles.chapterTitle, { color: isCurrent ? colors.accent : colors.text }]} numberOfLines={1}>
                  {isCurrent ? "► " : ""}{ch.title}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 8,
    minWidth: 70,
  },
  backLabel: { fontFamily: "Inter_500Medium", fontSize: 15 },
  navTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    flex: 1,
    textAlign: "center",
  },
  hero: {
    flexDirection: "row",
    padding: 20,
    gap: 16,
    alignItems: "flex-start",
  },
  coverWrap: {
    width: 100,
    height: 140,
    borderRadius: 12,
    overflow: "hidden",
    flexShrink: 0,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  cover: { width: "100%", height: "100%" },
  coverPlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  heroInfo: { flex: 1, gap: 6 },
  heroTitle: { fontFamily: "Inter_700Bold", fontSize: 17, lineHeight: 24 },
  heroAuthor: { fontFamily: "Inter_400Regular", fontSize: 13 },
  heroButtons: { marginTop: 10 },
  readBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  readBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  content: { paddingHorizontal: 16, gap: 12 },
  progressCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 8,
  },
  progressTop: { flexDirection: "row", justifyContent: "space-between" },
  progressLabel: { fontFamily: "Inter_500Medium", fontSize: 13 },
  progressCount: { fontFamily: "Inter_700Bold", fontSize: 13 },
  progressBar: { height: 4, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2 },
  lastReadLabel: { fontFamily: "Inter_400Regular", fontSize: 12 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 17 },
  synopsisCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 8,
  },
  synopsisText: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 22 },
  seeMoreRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  seeMore: { fontFamily: "Inter_500Medium", fontSize: 13 },
  chapterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  sortBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  chapterRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chapterTitle: { fontFamily: "Inter_500Medium", fontSize: 14, flex: 1 },
});