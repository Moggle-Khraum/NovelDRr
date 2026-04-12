import { Ionicons } from "@expo/vector-icons";
import React, { useState, useCallback, useRef } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  Modal,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { useLibrary, Novel } from "@/context/LibraryContext";
import { useTheme } from "@/context/ThemeContext";
import { useRouter } from "expo-router";

function NovelCard({ novel, onPress, isSelected, selectionMode }: { novel: Novel; onPress: () => void; isSelected: boolean; selectionMode: boolean; }) {
  const { colors } = useTheme();
  
  return (
    <Pressable onPress={onPress}>
      <View style={[styles.card, { backgroundColor: isSelected ? colors.accent + '20' : colors.card, borderColor: isSelected ? colors.accent : colors.border }]}>
        <View style={styles.coverContainer}>
          {novel.coverUrl ? (
            <Image
              source={{ uri: novel.coverUrl }}
              style={styles.cover}
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
          <Text style={[styles.cardAuthor, { color: colors.textSecondary }]}>
            {novel.author}
          </Text>
          <Text style={[styles.cardChapters, { color: colors.textMuted }]}>
            {novel.chapters.length} chapters
          </Text>
        </View>
        {selectionMode && (
          <View style={styles.checkboxContainer}>
            <Ionicons
              name={isSelected ? "checkbox" : "square-outline"}
              size={24}
              color={isSelected ? colors.accent : colors.textSecondary}
            />
          </View>
        )}
      </View>
    </Pressable>
  );
};

export default function LibraryScreen() {
  const { novels, removeNovel, loading, refreshLibrary } = useLibrary();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedNovels, setSelectedNovels] = useState<string[]>([]);
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshLibrary();
    setRefreshing(false);
  }, [refreshLibrary]);

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

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No novels yet</Text>
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
        Add some novels to get started
      </Text>
    </View>
  );

  const renderHeader = () => (
    <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
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
    <View style={[styles.selectionHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: insets.top + 12 }]}>
      <Pressable onPress={exitSelectionMode} style={styles.selectionBack}>
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </Pressable>
      <Text style={[styles.selectionTitle, { color: colors.text }]}>
        Selected: {selectedNovels.length}
      </Text>
      {selectedNovels.length > 0 && (
        <Pressable onPress={showFirstConfirmation} style={styles.selectionDelete}>
          <Ionicons name="trash-outline" size={24} color={colors.text} />
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {selectionMode ? renderSelectionHeader() : renderHeader()}

      {loading && novels.length === 0 ? (
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading...</Text>
        </View>
      ) : (
        <FlatList
          data={novels}
          keyExtractor={(n) => n.id}
          ListEmptyComponent={renderEmpty}
          renderItem={({ item }) => (
            <NovelCard
              novel={item}
              onPress={() => handleNovelPress(item)}
              isSelected={selectedNovels.includes(item.id)}
              selectionMode={selectionMode}
            />
          )}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 90,
            gap: 12,
          }}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      )}
          
      {/* Batch Delete Confirmation Modal */}
      <Modal
        visible={confirmDeleteVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setConfirmDeleteVisible(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Ionicons name="alert-circle" size={48} color={colors.text} style={styles.modalIcon} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>Confirm Deletion</Text>
            <Text style={[styles.modalMessage, { color: colors.textSecondary }]}>
              This will permanently delete {selectedNovels.length} novel(s) and all their chapters.
              Are you sure about this? Press 'DELETE' to continue.
            </Text>
            
            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, styles.modalCancelButton, { borderColor: colors.border }]}
                onPress={() => {
                  setConfirmDeleteVisible(false);
                }}
              >
                <Text style={[styles.modalButtonText, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.modalDeleteButton, { backgroundColor: colors.text }]}
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
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
  },
  headerSub: {
    fontSize: 14,
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
    fontSize: 18,
    fontWeight: "600",
  },
  selectionDelete: {
    padding: 8,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  coverContainer: {
    width: 64,
    height: 88,
    borderRadius: 8,
    overflow: "hidden",
    flexShrink: 0,
  },
  cover: {
    width: "100%",
    height: "100%",
  },
  coverPlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  info: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontWeight: "600",
    fontSize: 16,
  },
  cardAuthor: {
    fontSize: 13,
  },
  cardChapters: {
    fontSize: 12,
  },
  checkboxContainer: {
    marginLeft: 12,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 100,
    gap: 12,
  },
  emptyTitle: {
    fontWeight: "600",
    fontSize: 18,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
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
    fontWeight: "700",
    fontSize: 20,
  },
  modalMessage: {
    fontSize: 14,
    textAlign: "center",
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
    fontWeight: "600",
    fontSize: 14,
  },
});
