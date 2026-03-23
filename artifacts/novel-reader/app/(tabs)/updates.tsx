import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLibrary, Novel, Chapter } from "@/context/LibraryContext";
import { useTheme } from "@/context/ThemeContext";
import { fetchChapter } from "@/hooks/useApi";
import Colors from "@/constants/colors";

type LogEntry = {
  id: string;
  text: string;
  type: "info" | "downloading" | "success" | "error" | "warning";
};

export default function UpdatesScreen() {
  const { colors } = useTheme();
  const { novels, updateNovel } = useLibrary();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [maxChStr, setMaxChStr] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const stopRef = useRef(false);
  const logScrollRef = useRef<ScrollView>(null);

  const addLog = (text: string, type: LogEntry["type"] = "info") => {
    setLogs((prev) => [...prev.slice(-80), { id: Date.now().toString() + Math.random(), text, type }]);
    setTimeout(() => logScrollRef.current?.scrollToEnd({ animated: true }), 50);
  };

  const handleUpdate = async () => {
    if (selectedIndex === null) {
      addLog("Please select a novel from the list above", "error");
      return;
    }
    const novel = novels[selectedIndex];
    if (!novel) return;

    stopRef.current = false;
    setIsUpdating(true);
    setLogs([]);
    setProgress(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const maxCh = parseInt(maxChStr) || null;
    const existingCount = novel.chapters.length;
    const startFromChapter = existingCount + 1;

    addLog(`Updating "${novel.title}"...`, "info");
    addLog(`Already have ${existingCount} chapters`, "info");
    addLog(`Fetching from chapter ${startFromChapter}...`, "downloading");

    try {
      let currentUrl = novel.chapters[existingCount - 1]?.url;
      if (!currentUrl) {
        addLog("Cannot determine last chapter URL", "error");
        setIsUpdating(false);
        return;
      }

      const firstData = await fetchChapter(currentUrl, existingCount);
      if (!firstData.nextUrl) {
        addLog("No new chapters available.", "success");
        setIsUpdating(false);
        return;
      }
      currentUrl = firstData.nextUrl;

      const newChapters: Chapter[] = [...novel.chapters];
      let downloaded = 0;
      let chNum = existingCount + 1;

      while (currentUrl && !stopRef.current) {
        if (maxCh !== null && downloaded >= maxCh) {
          addLog(`Reached limit of ${maxCh} new chapters`, "success");
          break;
        }

        addLog(`[UPDATING] Chapter ${chNum}...`, "downloading");
        const data = await fetchChapter(currentUrl, chNum);
        newChapters.push({ title: data.title, url: currentUrl, content: data.content });
        downloaded++;
        addLog(`[DONE] Chapter ${chNum}`, "success");

        if (maxCh) setProgress((downloaded / maxCh) * 100);

        if (!data.nextUrl) {
          addLog("No more chapters found.", "info");
          break;
        }
        currentUrl = data.nextUrl;
        chNum++;
        await new Promise((r) => setTimeout(r, 200));
      }

      await updateNovel(novel.id, { chapters: newChapters });
      addLog(`Update complete! Added ${downloaded} new chapters.`, "success");
      setProgress(100);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      addLog(`Error: ${e.message || "Update failed"}`, "error");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsUpdating(false);
    }
  };

  const colorMap = {
    info: "#888888",
    downloading: Colors.downloading,
    success: Colors.success,
    error: Colors.error,
    warning: Colors.amber,
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <Ionicons name="refresh-circle" size={22} color={colors.accent} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Novel Updates</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>SELECT NOVEL</Text>
        <View style={[styles.novelList, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {novels.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No novels in your library yet
            </Text>
          ) : (
            novels.map((novel, index) => (
              <Pressable
                key={novel.id}
                style={[
                  styles.novelRow,
                  { borderBottomColor: colors.border },
                  index === novels.length - 1 && styles.lastRow,
                  selectedIndex === index && { backgroundColor: colors.accent + "18" },
                ]}
                onPress={() => {
                  setSelectedIndex(index === selectedIndex ? null : index);
                  Haptics.selectionAsync();
                }}
              >
                <View style={styles.novelRowInfo}>
                  <Text style={[styles.novelNum, { color: colors.accent }]}>{index + 1}.</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.novelTitle, { color: colors.text }]} numberOfLines={1}>
                      {novel.title}
                    </Text>
                    <Text style={[styles.novelChCount, { color: colors.textSecondary }]}>
                      {novel.chapters.length} chapters
                    </Text>
                  </View>
                </View>
                {selectedIndex === index && (
                  <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                )}
              </Pressable>
            ))
          )}
        </View>

        <View style={styles.form}>
          <View>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Max New Chapters (optional)</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              value={maxChStr}
              onChangeText={setMaxChStr}
              placeholder="All available"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              editable={!isUpdating}
            />
          </View>

          <View style={styles.buttons}>
            <Pressable
              style={[
                styles.primaryBtn,
                {
                  backgroundColor:
                    isUpdating || selectedIndex === null
                      ? colors.border
                      : colors.accent,
                },
              ]}
              onPress={isUpdating ? undefined : handleUpdate}
              disabled={isUpdating || selectedIndex === null}
            >
              {isUpdating ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="cloud-download" size={18} color="#fff" />
              )}
              <Text style={styles.primaryBtnText}>
                {isUpdating ? "Updating..." : "Initiate Update"}
              </Text>
            </Pressable>

            {isUpdating && (
              <Pressable
                style={[styles.outlineBtn, { borderColor: Colors.error }]}
                onPress={() => { stopRef.current = true; }}
              >
                <Ionicons name="stop" size={16} color={Colors.error} />
                <Text style={[styles.outlineBtnText, { color: Colors.error }]}>Halt</Text>
              </Pressable>
            )}
          </View>
        </View>

        {(logs.length > 0 || isUpdating) && (
          <Animated.View entering={FadeIn} style={styles.logSection}>
            {maxChStr ? (
              <>
                <View style={styles.logHeader}>
                  <Ionicons name="bar-chart" size={15} color={colors.accent} />
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Progress</Text>
                </View>
                <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                  <View
                    style={[
                      styles.progressFill,
                      { backgroundColor: colors.accent, width: `${Math.min(progress, 100)}%` },
                    ]}
                  />
                </View>
              </>
            ) : null}

            <View style={styles.logHeader}>
              <Ionicons name="sync" size={15} color={colors.accent} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Activity Log</Text>
              <Pressable onPress={() => setLogs([])}>
                <Text style={[styles.clearLog, { color: colors.textMuted }]}>Clear</Text>
              </Pressable>
            </View>
            <ScrollView
              ref={logScrollRef}
              style={[styles.logBox, { backgroundColor: colors.surface, borderColor: colors.border }]}
              showsVerticalScrollIndicator={false}
            >
              {logs.map((entry) => (
                <Text
                  key={entry.id}
                  style={[styles.logLine, { color: colorMap[entry.type] }]}
                >
                  {entry.text}
                </Text>
              ))}
            </ScrollView>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22 },
  scroll: { padding: 16, gap: 16 },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.8,
  },
  novelList: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  novelRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lastRow: { borderBottomWidth: 0 },
  novelRowInfo: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  novelNum: { fontFamily: "Inter_700Bold", fontSize: 15, width: 24 },
  novelTitle: { fontFamily: "Inter_500Medium", fontSize: 14 },
  novelChCount: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    padding: 16,
    textAlign: "center",
  },
  form: { gap: 14 },
  label: { fontFamily: "Inter_500Medium", fontSize: 12, marginBottom: 6 },
  input: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  buttons: { flexDirection: "row", gap: 10 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
  },
  primaryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  outlineBtnText: { fontFamily: "Inter_500Medium", fontSize: 14 },
  logSection: { gap: 10 },
  logHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, flex: 1 },
  clearLog: { fontFamily: "Inter_400Regular", fontSize: 12 },
  progressBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  logBox: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    maxHeight: 180,
  },
  logLine: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 },
});
