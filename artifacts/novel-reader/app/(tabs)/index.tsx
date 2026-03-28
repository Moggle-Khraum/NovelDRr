import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLibrary, Novel } from "@/context/LibraryContext";
import { useTheme } from "@/context/ThemeContext";

function NovelCard({ novel, onPress }: { novel: Novel; onPress: () => void }) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const chapters = novel.chapters.length;
  const progress = novel.lastRead
    ? `Ch. ${novel.lastRead.chapterIndex + 1}/${chapters}`
    : `${chapters} chapters`;

  return (
    <Pressable
      onPress={() => {
        scale.value = withSpring(1, { damping: 15 });
        onPress();
      }}
      onPressIn={() => {
        scale.value = withSpring(0.97, { damping: 15 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 15 });
      }}
    >
      <Animated.View
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, animStyle]}
      >
        <View style={styles.coverContainer}>
          {novel.coverUrl ? (
            <Image
              source={{ uri: novel.coverUrl }}
              style={styles.cover}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.coverPlaceholder, { backgroundColor: colors.surface }]}>
              <Ionicons name="book" size={28} color={colors.accent} />
            </View>
          )}
        </View>
        <View style={styles.info}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
            {novel.title}
          </Text>
          <Text style={[styles.author, { color: colors.textSecondary }]} numberOfLines={1}>
            {novel.author}
          </Text>
          <View style={styles.footer}>
            <View style={[styles.badge, { backgroundColor: colors.accent + "22" }]}>
              <Text style={[styles.badgeText, { color: colors.accent }]}>{progress}</Text>
            </View>
            {novel.lastRead && (
              <View style={[styles.continueBadge, { backgroundColor: colors.accent }]}>
                <Text style={styles.continueText}>Continue</Text>
              </View>
            )}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={styles.chevron} />
      </Animated.View>
    </Pressable>
  );
}

export default function LibraryScreen() {
  const { novels, loading } = useLibrary();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 12,
            borderBottomColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.text }]}>Novel DR</Text>
        <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
          {novels.length} {novels.length === 1 ? "novel" : "novels"}
        </Text>
      </View>

      {!loading && novels.length === 0 ? (
        <Animated.View entering={FadeIn} style={styles.emptyState}>
          <Image
            source={require("@/assets/images/shook.png")}
            style={styles.shookImg}
            contentFit="contain"
          />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Your library is empty</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Head to the Download tab to add your first novel
          </Text>
          <Pressable
            style={[styles.addBtn, { backgroundColor: colors.accent }]}
            onPress={() => router.push("/(tabs)/add")}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnText}>Add Novel</Text>
          </Pressable>
        </Animated.View>
      ) : (
        <FlatList
          data={novels}
          keyExtractor={(n) => n.id}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeIn.delay(index * 50)}>
              <NovelCard
                novel={item}
                onPress={() =>
                  router.push({ pathname: "/novel/[id]", params: { id: item.id } })
                }
              />
            </Animated.View>
          )}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: bottomPad + 90,
            gap: 12,
          }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
  },
  headerSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    marginTop: 2,
  },
  card: {
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    alignItems: "center",
    padding: 12,
    gap: 12,
  },
  coverContainer: {
    width: 64,
    height: 88,
    borderRadius: 8,
    overflow: "hidden",
    flexShrink: 0,
  },
  cover: { width: "100%", height: "100%" },
  coverPlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  info: { flex: 1, gap: 4 },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    lineHeight: 21,
  },
  author: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },
  footer: { flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
  continueBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  continueText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: "#fff",
  },
  chevron: { marginLeft: "auto" },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  shookImg: { width: 120, height: 120 },
  emptyTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 20,
    textAlign: "center",
  },
  emptySubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  addBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
});
