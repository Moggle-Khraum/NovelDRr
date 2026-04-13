import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState, useMemo } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLibrary, Novel, NovelStatus } from "@/context/LibraryContext";
import { useTheme } from "@/context/ThemeContext";

// ── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<NovelStatus, { label: string; color: string; icon: string }> = {
  unread:    { label: "Unread",    color: "#8B8B8B", icon: "bookmark-outline"          },
  reading:   { label: "Reading",   color: "#4A90E2", icon: "book-outline"              },
  completed: { label: "Completed", color: "#27AE60", icon: "checkmark-circle-outline"  },
};

const FILTER_TABS: { key: NovelStatus | "all"; label: string }[] = [
  { key: "all",       label: "All"       },
  { key: "unread",    label: "Unread"    },
  { key: "reading",   label: "Reading"   },
  { key: "completed", label: "Completed" },
];

// ── NovelCard ────────────────────────────────────────────────────────────────

function NovelCard({
  novel,
  onPress,
  onLongPress,
  isSelected,
  selectionMode,
}: {
  novel: Novel;
  onPress: () => void;
  onLongPress: () => void;
  isSelected: boolean;
  selectionMode: boolean;
}) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const chapters = novel.chapters.length;
  const progress = novel.lastRead
    ? `Ch. ${novel.lastRead.chapterIndex + 1}/${chapters}`
    : `${chapters} chapters`;

  const status = novel.status ?? "unread";
  const statusCfg = STATUS_CONFIG[status];

  return (
    <Pressable
      onPress={() => { scale.value = withSpring(1, { damping: 15 }); onPress(); }}
      onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onLongPress(); }}
      onPressIn={() => { scale.value = withSpring(0.97, { damping: 15 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 15 }); }}
    >
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: isSelected ? colors.accent + "20" : colors.card,
            borderColor: isSelected ? colors.accent : colors.border,
          },
          animStyle,
        ]}
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
            <Image source={{ uri: novel.coverUrl }} style={styles.cover} contentFit="cover" />
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
            <View style={[styles.statusBadge, { backgroundColor: statusCfg.color + "22" }]}>
              <View style={[styles.statusDot, { backgroundColor: statusCfg.color }]} />
              <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
            </View>
          </View>
        </View>

        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={styles.chevron} />
      </Animated.View>
    </Pressable>
  );
}

// ── Status Picker Sheet ──────────────────────────────────────────────────────

function StatusSheet({
  novel,
  visible,
  onClose,
  onSelect,
}: {
  novel: Novel | null;
  visible: boolean;
  onClose: () => void;
  onSelect: (status: NovelStatus) => void;
}) {
  const { colors } = useTheme();
  if (!novel) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.card }]}>
        <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
        <Text style={[styles.sheetTitle, { color: colors.text }]} numberOfLines={1}>
          {novel.title}
        </Text>
        <Text style={[styles.sheetSub, { color: colors.textSecondary }]}>Set reading status</Text>

        {(Object.keys(STATUS_CONFIG) as NovelStatus[]).map((key) => {
          const cfg = STATUS_CONFIG[key];
          const active = (novel.status ?? "unread") === key;
          return (
            <Pressable
              key={key}
              style={[
                styles.sheetOption,
                {
                  backgroundColor: active ? cfg.color + "18" : "transparent",
                  borderColor: active ? cfg.color : colors.border,
                },
              ]}
              onPress={() => { Haptics.selectionAsync(); onSelect(key); }}
            >
              <Ionicons name={cfg.icon as any} size={20} color={active ? cfg.color : colors.textSecondary} />
              <Text style={[styles.sheetOptionText, { color: active ? cfg.color : colors.text }]}>
                {cfg.label}
              </Text>
              {active && (
                <Ionicons name="checkmark" size={18} color={cfg.color} style={{ marginLeft: "auto" }} />
              )}
            </Pressable>
          );
        })}

        <Pressable style={[styles.sheetCancel, { borderColor: colors.border }]} onPress={onClose}>
          <Text style={[styles.sheetCancelText, { color: colors.textSecondary }]}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// ── LibraryScreen ────────────────────────────────────────────────────────────

export default function LibraryScreen() {
  const { novels, removeNovel, loading, setNovelStatus } = useLibrary();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [activeFilter, setActiveFilter] = useState<NovelStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedNovels, setSelectedNovels] = useState<string[]>([]);
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);

  const [statusSheetNovel, setStatusSheetNovel] = useState<Novel | null>(null);

  // Filter novels based on status AND search query
  const filteredNovels = useMemo(() => {
    let result = activeFilter === "all"
      ? novels
      : novels.filter((n) => (n.status ?? "unread") === activeFilter);
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (n) => n.title.toLowerCase().includes(query) || 
               n.author.toLowerCase().includes(query)
      );
    }
    
    return result;
  }, [novels, activeFilter, searchQuery]);

  const counts = {
    all:       novels.length,
    unread:    novels.filter((n) => (n.status ?? "unread") === "unread").length,
    reading:   novels.filter((n) => (n.status ?? "unread") === "reading").length,
    completed: novels.filter((n) => (n.status ?? "unread") === "completed").length,
  };

  const enterSelectionMode = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectionMode(true);
    setSelectedNovels([]);
    setShowSearch(false);
    setSearchQuery("");
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedNovels([]);
  };

  const toggleNovelSelection = (novelId: string) => {
    setSelectedNovels((prev) =>
      prev.includes(novelId) ? prev.filter((id) => id !== novelId) : [...prev, novelId]
    );
  };
  
  const showFirstConfirmation = () => {
    if (selectedNovels.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Confirm Deletion",
      `Remove ${selectedNovels.length} novel(s) from your Library?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => setConfirmDeleteVisible(true) },
      ]
    );
  };
 
  const performBatchDelete = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setConfirmDeleteVisible(false);
    for (const novelId of selectedNovels) {
      await removeNovel(novelId);
    }
    setSelectionMode(false);
    setSelectedNovels([]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleNovelPress = (novel: Novel) => {
    if (selectionMode) {
      toggleNovelSelection(novel.id);
    } else {
      router.push({ pathname: "/novel/[id]", params: { id: novel.id } });
    }
  };

  const handleNovelLongPress = (novel: Novel) => {
    if (selectionMode) {
      toggleNovelSelection(novel.id);
    } else {
      setStatusSheetNovel(novel);
    }
  };

  const handleStatusSelect = async (status: NovelStatus) => {
    if (!statusSheetNovel) return;
    await setNovelStatus(statusSheetNovel.id, status);
    setStatusSheetNovel(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const toggleSearch = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowSearch(!showSearch);
    if (!showSearch) {
      setSearchQuery("");
    }
  };

  const renderHeader = () => (
    <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
      <View>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Novel DR</Text>
        <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
          {filteredNovels.length} {filteredNovels.length === 1 ? "novel" : "novels"} 
          {searchQuery ? ` (filtered from ${novels.length})` : ""}
        </Text>
      </View>
      <View style={styles.headerButtons}>
        <Pressable onPress={toggleSearch} style={styles.iconButton}>
          <Ionicons name={showSearch ? "close" : "search"} size={24} color={colors.text} />
        </Pressable>
        <Pressable onPress={enterSelectionMode} style={styles.iconButton}>
          <Ionicons name="ellipsis-vertical" size={24} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );

  const renderSearchBar = () => (
    <Animated.View entering={FadeIn} style={[styles.searchContainer, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <View style={[styles.searchInputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <Ionicons name="search" size={20} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search by title or author..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoFocus
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>
      <Text style={[styles.searchResultText, { color: colors.textSecondary }]}>
        Found {filteredNovels.length} result{filteredNovels.length !== 1 ? "s" : ""}
      </Text>
    </Animated.View>
  );

  const renderSelectionHeader = () => (
    <View style={[styles.selectionHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: topPad + 12 }]}>
      <Pressable onPress={exitSelectionMode} style={styles.iconButton}>
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </Pressable>
      <Text style={[styles.selectionTitle, { color: colors.text }]}>
        Selected: {selectedNovels.length}
      </Text>
      {selectedNovels.length > 0 && (
        <Pressable onPress={showFirstConfirmation} style={styles.iconButton}>
          <Ionicons name="trash-outline" size={24} color={colors.text} />
        </Pressable>
      )}
    </View>
  );

  const renderFilterTabs = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.filterBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}
      contentContainerStyle={styles.filterBarContent}
    >
      {FILTER_TABS.map((tab) => {
        const active = activeFilter === tab.key;
        const color = tab.key !== "all" ? STATUS_CONFIG[tab.key as NovelStatus].color : colors.accent;
        return (
          <Pressable
            key={tab.key}
            style={[
              styles.filterTab,
              {
                backgroundColor: active ? color + "18" : "transparent",
                borderColor: active ? color : colors.border,
              },
            ]}
            onPress={() => { Haptics.selectionAsync(); setActiveFilter(tab.key as any); }}
          >
            <Text style={[styles.filterTabText, { color: active ? color : colors.textSecondary }]}>
              {tab.label}
            </Text>
            <View style={[styles.filterCount, { backgroundColor: active ? color : colors.surface }]}>
              <Text style={[styles.filterCountText, { color: active ? "#fff" : colors.textMuted }]}>
                {counts[tab.key as keyof typeof counts]}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const renderEmptyState = () => {
    const isFiltered = searchQuery || activeFilter !== "all";
    
    if (novels.length === 0) {
      return (
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
      );
    }

    return (
      <View style={styles.emptyState}>
        <Image
          source={require("@/assets/images/shook.png")}
          style={styles.shookImg}
          contentFit="contain"
        />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>No novels found</Text>
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
          {searchQuery 
            ? `No novels matching "${searchQuery}"`
            : `No novels marked as "${FILTER_TABS.find((t) => t.key === activeFilter)?.label}" yet.`
          }
        </Text>
        {isFiltered && (
          <Pressable
            style={[styles.clearBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => {
              setSearchQuery("");
              setActiveFilter("all");
              setShowSearch(false);
            }}
          >
            <Text style={[styles.clearBtnText, { color: colors.text }]}>Clear Filters</Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top chrome — flexShrink: 0 prevents it from being squished by the list */}
      <View style={styles.topChrome}>
        {selectionMode ? renderSelectionHeader() : renderHeader()}
        {showSearch && !selectionMode && renderSearchBar()}
        {!selectionMode && renderFilterTabs()}
      </View>

      {!loading && filteredNovels.length === 0 ? (
        renderEmptyState()
      ) : (
        <FlatList
          data={filteredNovels}
          keyExtractor={(n) => n.id}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeIn.delay(index * 50)}>
              <NovelCard
                novel={item}
                onPress={() => handleNovelPress(item)}
                onLongPress={() => handleNovelLongPress(item)}
                isSelected={selectedNovels.includes(item.id)}
                selectionMode={selectionMode}
              />
            </Animated.View>
          )}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 90, gap: 12 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Batch Delete Confirmation Modal */}
      <Modal
        visible={confirmDeleteVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setConfirmDeleteVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Ionicons name="alert-circle" size={48} color={colors.text} style={styles.modalIcon} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>Confirm Deletion</Text>
            <Text style={[styles.modalMessage, { color: colors.textSecondary }]}>
              This will permanently delete {selectedNovels.length} novel(s) and all their chapters.{"\n\n"}
              Are you sure about this? {"\n\n"}
              If YES, click the 'DELETE' button.
            </Text>
            
            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, styles.modalCancelButton, { borderColor: colors.border }]}
                onPress={() => setConfirmDeleteVisible(false)}
              >
                <Text style={[styles.modalButtonText, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.modalDeleteButton, { backgroundColor: "#FF4444" }]}
                onPress={performBatchDelete}
              >
                <Text style={[styles.modalButtonText, { color: "#fff" }]}>DELETE</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Status Picker Sheet */}
      <StatusSheet
        novel={statusSheetNovel}
        visible={!!statusSheetNovel}
        onClose={() => setStatusSheetNovel(null)}
        onSelect={handleStatusSelect}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // top chrome wrapper — never shrinks regardless of list content
  topChrome: { flexShrink: 0 },

  // header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 28 },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 2 },
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconButton: { padding: 8 },

  // selection header
  selectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  selectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 18 },

  // search bar
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    paddingVertical: 4,
  },
  searchResultText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    paddingLeft: 4,
  },

  // filter bar
  filterBar: { borderBottomWidth: StyleSheet.hairlineWidth, flexGrow: 0, flexShrink: 0 },
  filterBarContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: "row" },
  filterTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    flexShrink: 0,
  },
  filterTabText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  filterCount: { minWidth: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  filterCountText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },

  // card
  card: {
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    alignItems: "center",
    padding: 12,
    gap: 12,
  },
  checkboxContainer: { marginRight: 4 },
  coverContainer: { width: 64, height: 88, borderRadius: 8, overflow: "hidden", flexShrink: 0 },
  cover: { width: "100%", height: "100%" },
  coverPlaceholder: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center", borderRadius: 8 },
  info: { flex: 1, gap: 4 },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 15, lineHeight: 21 },
  author: { fontFamily: "Inter_400Regular", fontSize: 13 },
  footer: { flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  continueBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  continueText: { fontFamily: "Inter_500Medium", fontSize: 11, color: "#fff" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  chevron: { marginLeft: "auto" },

  // empty state
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, gap: 12 },
  shookImg: { width: 120, height: 120 },
  emptyTitle: { fontFamily: "Inter_600SemiBold", fontSize: 20, textAlign: "center" },
  emptySubtitle: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center", lineHeight: 20 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  addBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#fff" },
  clearBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 8, borderWidth: 1 },
  clearBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },

  // batch delete modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  modalContent: { width: "80%", borderRadius: 16, padding: 20, alignItems: "center", gap: 12 },
  modalIcon: { marginBottom: 8 },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 20 },
  modalMessage: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" },
  modalButtons: { flexDirection: "row", gap: 12, marginTop: 16, width: "100%" },
  modalButton: { flex: 1, height: 44, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  modalCancelButton: { borderWidth: 1 },
  modalDeleteButton: { backgroundColor: "#ff4444" },
  modalButtonText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },

  // status sheet
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 10 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 8 },
  sheetTitle: { fontFamily: "Inter_700Bold", fontSize: 16 },
  sheetSub: { fontFamily: "Inter_400Regular", fontSize: 13, marginBottom: 4 },
  sheetOption: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  sheetOptionText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  sheetCancel: { marginTop: 4, padding: 14, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  sheetCancelText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
});
