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
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLibrary, Novel, Chapter } from "@/context/LibraryContext";
import { useTheme } from "@/context/ThemeContext";
import { fetchNovelMeta, fetchChapter } from "@/hooks/useApi";
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
    if (text.includes("Author:")) return "✍️";
    if (text.includes("Synopsis:")) return "📝";
    if (text.includes("Cover found")) return "🖼️";
    if (text.includes("First chapter")) return "🔗";
    if (text.includes("Downloading Chapter")) return "📥";
    if (text.includes("Saved:")) return "💾";
    if (text.includes("COMPLETE")) return "🎉";
    if (text.includes("ERROR")) return "❌";
    if (text.includes("SKIPPED")) return "⏭️";
    if (text.includes("limit")) return "✅";
    if (text.includes("halted")) return "⚠️";
    if (text.includes("No more chapters")) return "🏁";
    if (text.includes("━━━━")) return "";
    return "";
  };
  
  const icon = getIcon(entry.text);
  const displayText = icon ? `${icon} ${entry.text}` : entry.text;
  
  return (
    <Text style={[styles.logLine, { color: colorMap[entry.type] }]}>
      {displayText}
    </Text>
  );
}

export default function AddNovelScreen() {
  const { colors } = useTheme();
  const { addNovel, novels } = useLibrary();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [url, setUrl] = useState("");
  const [startChStr, setStartChStr] = useState("1");
  const [maxChStr, setMaxChStr] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const stopRef = useRef(false);
  const logScrollRef = useRef<ScrollView>(null);

  const addLog = (text: string, type: LogEntry["type"] = "info") => {
    const entry: LogEntry = { id: Date.now().toString() + Math.random(), text, type };
    setLogs((prev) => [...prev.slice(-200), entry]);
    setTimeout(() => logScrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const clearAll = () => {
    setUrl("");
    setStartChStr("1");
    setMaxChStr("");
    setLogs([]);
    setProgress(0);
    setProgressLabel("");
  };

  const handleDownload = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      addLog("Error: URL field is empty!", "error");
      return;
    }
    if (!trimmedUrl.startsWith("http")) {
      addLog("Error: Please enter a valid URL starting with http/https", "error");
      return;
    }

    const startCh = Math.max(1, parseInt(startChStr) || 1);
    const maxCh = parseInt(maxChStr) || null;

    stopRef.current = false;
    setIsDownloading(true);
    setLogs([]);
    setProgress(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      let domain = "";
      try {
        const urlObj = new URL(trimmedUrl);
        domain = urlObj.hostname;
      } catch {
        domain = "Unknown";
      }
      
      addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "info");
      addLog(`CONNECTING TO SOURCE...`, "downloading");
      addLog(`Source Domain: ${domain}`, "info");
      addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "info");

      const meta = await fetchNovelMeta(trimmedUrl);
      
      addLog(`Connection successful!`, "success");
      addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "info");
      addLog(`NOVEL INFORMATION`, "downloading");
      addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "info");
      addLog(`Title: ${meta.title}`, "success");
      addLog(`Author: ${meta.author}`, "info");
      
      if (meta.synopsis && meta.synopsis !== "No summary available.") {
        const shortSynopsis = meta.synopsis.length > 100 
          ? meta.synopsis.substring(0, 100) + "..." 
          : meta.synopsis;
        addLog(`Synopsis: ${shortSynopsis}`, "info");
      }
      
      if (meta.coverUrl) {
        addLog(`Cover found`, "info");
      }
      
      addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "info");

      if (!meta.firstChapterUrl) {
        addLog("Could not find chapter links on this page", "error");
        setIsDownloading(false);
        return;
      }

      addLog(`First chapter URL found`, "success");
      addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "info");

      const existingNovel = novels.find((n) => n.title === meta.title);
      const safeId = meta.title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") + "-" + Date.now();
      const novelId = existingNovel?.id || safeId;

      const existingChapters: Chapter[] = existingNovel?.chapters || [];
      const existingCount = existingChapters.length;

      if (existingCount > 0) {
        addLog(`Existing chapters in library: ${existingCount}`, "info");
        addLog(`Will skip already downloaded chapters`, "info");
      }
      
      addLog(`Starting from chapter ${startCh}...`, "downloading");
      addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "info");

      let currentUrl: string | null = meta.firstChapterUrl;
      let chapterNum = 1;
      const newChapters: Chapter[] = [...existingChapters];
      let downloaded = 0;

      while (currentUrl && !stopRef.current) {
        if (chapterNum < startCh) {
          const data = await fetchChapter(currentUrl, chapterNum);
          if (!data.nextUrl) break;
          currentUrl = data.nextUrl;
          chapterNum++;
          continue;
        }

        if (maxCh !== null && downloaded >= maxCh) {
          addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "info");
          addLog(`Reached max chapter limit (${maxCh})`, "success");
          addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "info");
          break;
        }

        const alreadyExists = newChapters.some((c) => c.url === currentUrl);
        if (alreadyExists) {
          addLog(`[SKIPPED] Chapter ${chapterNum} already exists in library`, "info");
          chapterNum++;
          continue;
        }

        setProgressLabel(`Chapter ${chapterNum}`);
        addLog(`Downloading Chapter ${chapterNum}...`, "downloading");

        const data = await fetchChapter(currentUrl, chapterNum);

        newChapters.push({
          title: data.title,
          url: currentUrl,
          content: data.content,
        });

        downloaded++;
        
        if (downloaded % 10 === 0) {
          addLog(`Saved: ${data.title} [${downloaded} chapters downloaded so far]`, "success");
        } else {
          addLog(`Saved: ${data.title}`, "info");
        }

        if (maxCh) {
          setProgress((downloaded / maxCh) * 100);
        }

        if (!data.nextUrl) {
          addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "info");
          addLog(`No more chapters found.`, "info");
          addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "info");
          break;
        }
        currentUrl = data.nextUrl;
        chapterNum++;

        await new Promise((r) => setTimeout(r, 200));
      }

      addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "info");
      
      if (stopRef.current) {
        addLog(`Download halted by user.`, "warning");
        addLog(`Downloaded ${downloaded} chapters before stop.`, "info");
      } else {
        addLog(`DOWNLOAD COMPLETE!`, "success");
        addLog(`Total new chapters added: ${downloaded}`, "success");
        if (downloaded > 0) {
          addLog(`Novel saved to your library`, "success");
        }
      }
      
      addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "info");

      const novel: Novel = {
        id: novelId,
        title: meta.title,
        author: meta.author,
        synopsis: meta.synopsis,
        coverUrl: meta.coverUrl,
        sourceUrl: trimmedUrl,
        chapters: newChapters,
        dateAdded: existingNovel?.dateAdded || Date.now(),
        lastRead: existingNovel?.lastRead,
      };
      await addNovel(novel);
      setProgress(100);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "error");
      addLog(`ERROR: ${e.message || "Download failed"}`, "error");
      addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, "error");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsDownloading(false);
    }
  };

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      color: colors.text,
    },
  ];

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <Ionicons name="cloud-download" size={22} color={colors.accent} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Download Novel</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 20 }]}
        showsVerticalScrollIndicator={true}
        alwaysBounceVertical={true}
      >
        {/* Supported Sites Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>SUPPORTED SITES</Text>
          <Text style={[styles.cardValue, { color: colors.text }]}>
           ·  ReadNovelFull · NovelFull · 
          </Text>
        </View>

        {/* Form Section */}
        <View style={styles.form}>
          <View>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Novel URL</Text>
            <TextInput
              style={inputStyle}
              value={url}
              onChangeText={setUrl}
              placeholder="https://readnovelfull.com/novel-name.html"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              editable={!isDownloading}
            />
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Start Chapter</Text>
              <TextInput
                style={inputStyle}
                value={startChStr}
                onChangeText={setStartChStr}
                placeholder="1"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                editable={!isDownloading}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Max Chapters</Text>
              <TextInput
                style={inputStyle}
                value={maxChStr}
                onChangeText={setMaxChStr}
                placeholder="All"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                editable={!isDownloading}
              />
            </View>
          </View>

          <View style={styles.buttons}>
            <Pressable
              style={[
                styles.primaryBtn,
                { backgroundColor: isDownloading ? colors.border : colors.accent },
              ]}
              onPress={isDownloading ? undefined : handleDownload}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="download" size={18} color="#fff" />
              )}
              <Text style={styles.primaryBtnText}>
                {isDownloading ? "Downloading..." : "Start Download"}
              </Text>
            </Pressable>

            {isDownloading && (
              <Pressable
                style={[styles.outlineBtn, { borderColor: Colors.error }]}
                onPress={() => { stopRef.current = true; }}
              >
                <Ionicons name="stop" size={16} color={Colors.error} />
                <Text style={[styles.outlineBtnText, { color: Colors.error }]}>Halt</Text>
              </Pressable>
            )}

            {!isDownloading && (
              <Pressable
                style={[styles.outlineBtn, { borderColor: colors.border }]}
                onPress={clearAll}
              >
                <Ionicons name="trash-outline" size={16} color={colors.textSecondary} />
                <Text style={[styles.outlineBtnText, { color: colors.textSecondary }]}>Clear</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Progress Section - Always Visible */}
        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Ionicons name="bar-chart" size={15} color={colors.accent} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Progress</Text>
            {progressLabel ? (
              <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
                {progressLabel}
              </Text>
            ) : null}
          </View>
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.accent,
                  width: `${Math.min(progress, 100)}%`,
                },
              ]}
            />
          </View>
        </View>

        {/* Activity Log Section - Always Visible with Scroll */}
        <View style={styles.logSection}>
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
            contentContainerStyle={styles.logContent}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
          >
            {logs.length === 0 ? (
              <Text style={[styles.logLine, { color: colors.textMuted }]}>
                Ready to download...
              </Text>
            ) : (
              logs.map((entry) => (
                <LogLine key={entry.id} entry={entry} />
              ))
            )}
          </ScrollView>
        </View>

        {/* Extra space at bottom for better scrolling */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </KeyboardAvoidingView>
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
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
  },
  scrollContent: { 
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 16,
  },
  cardLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  cardValue: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  form: { 
    gap: 14,
    marginBottom: 16,
  },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    marginBottom: 6,
  },
  input: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  row: { flexDirection: "row", gap: 12 },
  buttons: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
  },
  primaryBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  outlineBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  progressSection: { 
    gap: 8,
    marginBottom: 16,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    flex: 1,
  },
  progressLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  logSection: { 
    gap: 8,
    marginBottom: 16,
  },
  logHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  clearLog: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  logBox: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    maxHeight: 280,
    minHeight: 150,
  },
  logContent: {
    paddingBottom: 8,
  },
  logLine: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  bottomSpacer: {
    height: 20,
  },
});
