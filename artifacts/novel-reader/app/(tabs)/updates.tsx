import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  FlatList,
} from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLibrary, Novel, Chapter } from "@/context/LibraryContext";
import { useTheme } from "@/context/ThemeContext";
import { fetchChapter } from "@/hooks/useApi"; // Ensure this matches your scraper hook
import Colors from "@/constants/colors";

type LogEntry = {
  id: string;
  text: string;
  type: "info" | "downloading" | "success" | "error" | "warning";
};

function LogLine({ entry }: { entry: LogEntry }) {
  const { colors } = useTheme();
  const colorMap = {
    info: colors.textSecondary,
    downloading: Colors.downloading,
    success: Colors.success,
    error: Colors.error,
    warning: Colors.amber,
  };
  
  const getIcon = (text: string) => {
    if (text.includes("CONNECTING")) return "🔍";
    if (text.includes("Source Domain")) return "📡";
    if (text.includes("Title:")) return "📚";
    if (text.includes("Chapter")) return "📄";
    if (text.includes("DONE")) return "✅";
    if (text.includes("ERROR")) return "❌";
    return "•";
  };

  return (
    <View style={styles.logLine}>
      <Text style={styles.logIcon}>{getIcon(entry.text)}</Text>
      <Text style={[styles.logText, { color: colorMap[entry.type] }]}>
        {entry.text}
      </Text>
    </View>
  );
}

export default function UpdatesScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { novels, addChapter, updateNovel } = useLibrary();

  const [selectedNovelId, setSelectedNovelId] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState(0);
  
  const scrollRef = useRef<ScrollView>(null);
  const stopSignal = useRef(false);

  const addLog = (text: string, type: LogEntry["type"] = "info") => {
    setLogs((prev) => [
      ...prev,
      { id: Math.random().toString(36).substring(7), text, type },
    ]);
  };

  const handleStart = async () => {
    const novel = novels.find((n) => n.id === selectedNovelId);
    
    if (!novel) {
      addLog("Please select a novel to update.", "error");
      return;
    }

    if (isDownloading) {
      stopSignal.current = true;
      return;
    }

    setIsDownloading(true);
    stopSignal.current = false;
    setLogs([]);
    setProgress(0);
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addLog(`CONNECTING: ${novel.title}`, "info");

    try {
      // Logic: Start from the URL of the last chapter we have saved.
      // If no chapters exist, we'd need a starting URL from the novel meta.
      let currentUrl = novel.lastChapterUrl;
      let chapterNum = novel.chapters?.length || 0;
      let newChaptersCount = 0;

      if (!currentUrl) {
        addLog("No source URL found for this novel. Cannot update.", "error");
        setIsDownloading(false);
        return;
      }

      // First, fetch the last saved chapter to find the "Next" link
      addLog("Checking for new chapters...", "info");
      const initialData = await fetchChapter(currentUrl);
      let nextUrl = initialData.nextUrl;

      while (nextUrl && !stopSignal.current) {
        chapterNum++;
        addLog(`Downloading Chapter ${chapterNum}...`, "downloading");

        const chapterData = await fetchChapter(nextUrl);

        const newChapter: Chapter = {
          id: `${novel.id}-ch${chapterNum}`,
          novelId: novel.id,
          title: chapterData.title,
          content: chapterData.content,
          chapterNum: chapterNum,
          url: nextUrl,
          createdAt: new Date().toISOString(),
        };

        // Save chapter to local library
        await addChapter(newChapter);
        
        // Update the novel's 'lastChapterUrl' so we can resume later
        await updateNovel(novel.id, {
          lastChapterUrl: nextUrl,
          updatedAt: new Date().toISOString(),
        });

        newChaptersCount++;
        nextUrl = chapterData.nextUrl;
        
        // Visual progress (infinite feel since we don't know the total)
        setProgress((prev) => Math.min(prev + 0.1, 0.9));
      }

      if (stopSignal.current) {
        addLog("Update paused by user.", "warning");
      } else if (newChaptersCount === 0) {
        addLog("DONE: Novel is already up to date!", "success");
        setProgress(1);
      } else {
        addLog(`DONE: Successfully added ${newChaptersCount} new chapters.`, "success");
        setProgress(1);
      }

    } catch (err: any) {
      addLog(`ERROR: ${err.message || "Failed to fetch update"}`, "error");
    } finally {
      setIsDownloading(false);
      stopSignal.current = false;
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={[styles.title, { color: colors.text }]}>Library Updates</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Sync saved novels with the source
        </Text>
      </View>

      <ScrollView 
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {/* Novel Selection List */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Select Novel</Text>
          <FlatList
            data={novels}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => setSelectedNovelId(item.id)}
                style={[
                  styles.novelCard,
                  { 
                    backgroundColor: colors.card,
                    borderColor: selectedNovelId === item.id ? colors.primary : "transparent"
                  }
                ]}
              >
                <Text numberOfLines={1} style={[styles.novelCardText, { color: colors.text }]}>
                  {item.title}
                </Text>
              </Pressable>
            )}
            contentContainerStyle={styles.novelList}
          />
        </View>

        {/* Progress Display */}
        {isDownloading || logs.length > 0 ? (
          <View style={styles.statusBox}>
            <View style={styles.progressSection}>
              <View style={styles.progressHeader}>
                <Ionicons name="download-outline" size={18} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Progress</Text>
              </View>
              <View style={[styles.progressBar, { backgroundColor: isDark ? "#333" : "#eee" }]}>
                <View 
                  style={[
                    styles.progressFill, 
                    { backgroundColor: colors.primary, width: `${progress * 100}%` }
                  ]} 
                />
              </View>
            </View>

            <View style={styles.logSection}>
              {logs.map((log) => (
                <LogLine key={log.id} entry={log} />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <Pressable
          onPress={handleStart}
          style={({ pressed }) => [
            styles.primaryBtn,
            { 
              backgroundColor: isDownloading ? colors.error : colors.primary,
              opacity: pressed ? 0.8 : 1 
            },
          ]}
        >
          {isDownloading ? (
            <>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.primaryBtnText}>Stop Update</Text>
            </>
          ) : (
            <>
              <Ionicons name="refresh-outline" size={20} color="#fff" />
              <Text style={styles.primaryBtnText}>Initiate Update</Text>
            </>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, marginBottom: 15 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", marginTop: 4 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 20 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 10 },
  novelList: { gap: 10 },
  novelCard: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 2,
    marginRight: 8,
    maxWidth: 200,
  },
  novelCardText: { fontFamily: "Inter_500Medium", fontSize: 14 },
  statusBox: { marginTop: 10 },
  progressSection: { marginBottom: 20 },
  progressHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  progressBar: { height: 8, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: "100%" },
  logSection: { gap: 6 },
  logLine: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  logIcon: { fontSize: 14 },
  logText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  footer: { paddingHorizontal: 20, paddingTop: 10 },
  primaryBtn: {
    flexDirection: "row",
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
