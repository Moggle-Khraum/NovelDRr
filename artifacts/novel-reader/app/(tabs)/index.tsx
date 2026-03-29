import { Ionicons } from "@expo/vector-icons";
import React, { useState, useCallback, useRef } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { useLibrary, Novel } from "@/context/LibraryContext";
import { useTheme } from "@/context/ThemeContext";
import { useRouter } from "expo-router";

function NovelCard({ novel, onPress, isSelected, selectionMode }: { novel: Novel; onPress: () => void; isSelected: boolean; selectionMode: boolean; }) {
  const { colors } = useTheme();
  
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
  const { novels, removeNovel, refreshLibrary, loading } = useLibrary();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedNovels, setSelectedNovels] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const fabAnim = useRef(new Animated.Value(0)).current;
  const [fabVisible, setFabVisible] = useState(true);

  // Animate FAB on scroll
  const handleScroll = (event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const shouldShow = offsetY < 50;
    
    if (shouldShow !== fabVisible) {
      setFabVisible(shouldShow);
      Animated.spring(fabAnim, {
        toValue: shouldShow ? 0 : 100,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();
    }
  };

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
        }
        ListEmptyComponent={renderEmpty}
        renderItem={({ item }) => (
          <NovelCard
            novel={item}
            onPress={() => handleNovelPress(item)}
            onLongPress={() => handleNovelLongPress(item)}
            isSelected={selectedNovels.includes(item.id)}
            selectionMode={selectionMode}
          />
        )}
      />
      
      {/* Floating Action Button - Refresh (like Python doesn't have this, but nice to have) */}
      {!selectionMode && (
        <Animated.View
          style={[
            styles.fab,
            {
              backgroundColor: colors.accent,
              transform: [{ translateY: fabAnim }],
              bottom: insets.bottom + 20,
            },
          ]}
        >
          <Pressable
            onPress={onRefresh}
            style={({ pressed }) => ({
              opacity: pressed ? 0.8 : 1,
              width: 56,
              height: 56,
              borderRadius: 28,
              justifyContent: 'center',
              alignItems: 'center',
            })}
          >
            <Ionicons name="refresh" size={28} color="#fff" />
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
    fontFamily: "Inter_700Bold",
    fontSize: 24,
  },
  headerCount: {
    fontFamily: "Inter_400Regular",
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
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
  },
  selectionDelete: {
    padding: 8,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
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
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
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
  cardContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    marginBottom: 4,
  },
  cardAuthor: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    marginBottom: 2,
  },
  cardChapters: {
    fontFamily: "Inter_400Regular",
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
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
  },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
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
