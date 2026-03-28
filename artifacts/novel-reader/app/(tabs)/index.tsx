import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Modal,
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

function NovelCard({ novel, onPress, isSelected, selectionMode }: { novel: Novel; onPress: () => void; isSelected: boolean; selectionMode: boolean; }) {
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
        style={[styles.card, { backgroundColor: isSelected ? colors.accent + '20' : colors.card, borderColor: isSelected ? colors.accent : colors.border }, animStyle]}
      >
        {selectionMode && (
          <View style={styles.checkboxContainer}>
            <Ionicons
              name={isSelected ? "checkbox" : "square-outline"}
              size={24}
              color={isSelected ? colors.accent : colors.textSecondary}
            />
          </View>
        )}
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
  const { novels, removeNovel, loading, refreshLibrary } = useLibrary();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  // Selection mode state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedNovels, setSelectedNovels] = useState<string[]>([]);
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const enterSelectionMode = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectionMode(true);
    setSelectedNovels([]);
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedNovels([]);
  };

  const toggleNovelSelection = (novelId: string) => {
    setSelectedNovels(prev =>
      prev.includes(novelId) ? prev.filter(id => id !== novelId) : [...prev, novelId]
    );
  };

  const showFirstConfirmation = () => {
    if (selectedNovels.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Confirm Deletion",
      `Remove ${selectedNovels.length} novel(s) from your Library?`,
      [
        { text: "Cancel", style: "cancel", onPress: () => {} },
        { text: "Delete", style: "destructive", onPress: () => setConfirmDeleteVisible(true) },
      ]
    );
  };

  const performBatchDelete = async () => {
    if (confirmText.toUpperCase() !== "DELETE") {
      Alert.alert("Confirmation Failed", 'Type "DELETE" to confirm deletion.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setConfirmDeleteVisible(false);
    for (const novelId of selectedNovels) {
      await removeNovel(novelId);
    }
    setSelectionMode(false);
    setSelectedNovels([]);
    await refreshLibrary();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setConfirmText("");
  };

  const handleNovelPress = (novel: Novel) => {
    if (selectionMode) {
      toggleNovelSelection(novel.id);
    } else {
      router.push({ pathname: "/novel/[id]", params: { id: novel.id } });
    }
  };

  const renderHeader = () => (
    <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
      <View>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Novel DR</Text>
        <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
          {novels.length} {novels.length === 1 ? "novel" : "novels"}
        </Text>
      </View>
      <Pressable onPress={enterSelectionMode} style={styles.menuButton}>
        <Ionicons name="ellipsis-vertical" size={24} color={colors.text} />
      </Pressable>
    </View>
  );

  const renderSelectionHeader = () => (
    <View style={[styles.selectionHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: topPad + 12 }]}>
      <Pressable onPress={exitSelectionMode} style={styles.selectionBack}>
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </Pressable>
      <Text style={[styles.selectionTitle, { color: colors.text }]}>
        Selected: {selectedNovels.length}
      </Text>
      {selectedNovels.length > 0 && (
        <Pressable onPress={showFirstConfirmation} style={styles.selectionDelete}>
          <Ionicons name="trash-outline" size={24} color={colors.error} />
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {selectionMode ? renderSelectionHeader() : renderHeader()}

      {!loading && novels.length === 0 ? (
        <View style={styles.emptyState}>
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
        </View>
      ) : (
        <FlatList
          data={novels}
          keyExtractor={(n) => n.id}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeIn.delay(index * 50)}>
              <NovelCard
                novel={item}
                onPress={() => handleNovelPress(item)}
                isSelected={selectedNovels.includes(item.id)}
                selectionMode={selectionMode}
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

      {/* Batch Delete Confirmation Modal */}
      <Modal
        visible={confirmDeleteVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setConfirmDeleteVisible(false);
          setConfirmText("");
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Ionicons name="alert-circle" size={48} color={colors.error} style={styles.modalIcon} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>Confirm Deletion</Text>
            <Text style={[styles.modalMessage, { color: colors.textSecondary }]}>
              This will permanently delete {selectedNovels.length} novel(s) and all their chapters.
            </Text>
            <Text style={[styles.modalWarning, { color: colors.error }]}>
              Type "DELETE" to confirm.
            </Text>
            <TextInput
              style={[styles.modalInput, {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                color: colors.text
              }]}
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder="DELETE"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoFocus={true}
            />
            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, styles.modalCancelButton, { borderColor: colors.border }]}
                onPress={() => {
                  setConfirmDeleteVisible(false);
                  setConfirmText("");
                }}
              >
                <Text style={[styles.modalButtonText, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.modalDeleteButton, { backgroundColor: colors.error }]}
                onPress={performBatchDelete}
              >
                <Text style={[styles.modalButtonText, { color: "#fff" }]}>DELETE</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  menuButton: {
    padding: 8,
  },
  selectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  selectionBack: {
    padding: 8,
  },
  selectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
  },
  selectionDelete: {
    padding: 8,
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
  checkboxContainer: {
    marginRight: 4,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "80%",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    gap: 12,
  },
  modalIcon: {
    marginBottom: 8,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
  },
  modalMessage: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
  },
  modalWarning: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    marginTop: 8,
  },
  modalInput: {
    width: "100%",
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    textAlign: "center",
    marginTop: 8,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
    width: "100%",
  },
  modalButton: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  modalCancelButton: {
    borderWidth: 1,
  },
  modalDeleteButton: {
    backgroundColor: "#ff4444",
  },
  modalButtonText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
});
