import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Modal,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLibrary } from "@/context/LibraryContext";
import { useTheme } from "@/context/ThemeContext";

// Export format types
type ExportFormat = "txt" | "epub" | "docx" | "rtf" | "mobi";

// Export options configuration
const EXPORT_OPTIONS: { format: ExportFormat; label: string; icon: string; color: string }[] = [
  { format: "txt", label: "Plain Text (.txt)", icon: "document-text-outline", color: "#4A90E2" },
  { format: "epub", label: "EPUB (.epub)", icon: "book-outline", color: "#27AE60" },
  { format: "docx", label: "Word Document (.docx)", icon: "document-outline", color: "#2B579A" },
  { format: "rtf", label: "Rich Text (.rtf)", icon: "text-outline", color: "#E67E22" },
  { format: "mobi", label: "Kindle (.mobi)", icon: "tablet-portrait-outline", color: "#8E44AD" },
];

// ── Export Functions ────────────────────────────────────────────────────────

async function loadFullNovelContent(novelId: string, chapters: { title: string; url: string }[]): Promise<{ title: string; content: string }[]> {
  const chaptersDir = `${FileSystem.documentDirectory}NovelDR/chapters/${novelId}/`;
  const result: { title: string; content: string }[] = [];

  for (let i = 0; i < chapters.length; i++) {
    const chapterPath = `${chaptersDir}chapter_${i}.json`;
    try {
      const fileInfo = await FileSystem.getInfoAsync(chapterPath);
      if (fileInfo.exists) {
        const raw = await FileSystem.readAsStringAsync(chapterPath);
        const chapterData = JSON.parse(raw);
        result.push({
          title: chapterData.title || chapters[i].title || `Chapter ${i + 1}`,
          content: chapterData.content || "",
        });
      } else if (chapters[i].title) {
        // Fallback: chapter file not found, use metadata only
        result.push({
          title: chapters[i].title,
          content: `[Content not available for this chapter. Please re-download.]`,
        });
      }
    } catch {
      result.push({
        title: chapters[i]?.title || `Chapter ${i + 1}`,
        content: `[Error loading chapter content.]`,
      });
    }
  }

  return result;
}

function generateTXT(novelTitle: string, author: string, chapters: { title: string; content: string }[]): string {
  let txt = `${novelTitle}\n`;
  txt += `by ${author}\n`;
  txt += `${"=".repeat(50)}\n\n`;

  for (const ch of chapters) {
    txt += `${ch.title}\n`;
    txt += `${"-".repeat(30)}\n\n`;
    txt += `${ch.content}\n\n\n`;
  }

  return txt;
}

function generateEPUB(novelTitle: string, author: string, chapters: { title: string; content: string }[]): string {
  // Simple EPUB format (XHTML-based)
  let epub = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  epub += `<!DOCTYPE html>\n`;
  epub += `<html xmlns="http://www.w3.org/1999/xhtml">\n`;
  epub += `<head><title>${escapeXML(novelTitle)}</title></head>\n`;
  epub += `<body>\n`;
  epub += `<h1>${escapeXML(novelTitle)}</h1>\n`;
  epub += `<p>by ${escapeXML(author)}</p>\n`;
  epub += `<hr/>\n`;

  for (const ch of chapters) {
    epub += `<h2>${escapeXML(ch.title)}</h2>\n`;
    epub += `<p>${escapeXML(ch.content).replace(/\n/g, '<br/>')}</p>\n`;
    epub += `<hr/>\n`;
  }

  epub += `</body></html>`;
  return epub;
}

function generateDOCX(novelTitle: string, author: string, chapters: { title: string; content: string }[]): string {
  // Simple DOCX using HTML wrapper (can be opened by Word)
  let docx = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">\n`;
  docx += `<head><meta charset="UTF-8"/><title>${escapeXML(novelTitle)}</title></head>\n`;
  docx += `<body>\n`;
  docx += `<h1>${escapeXML(novelTitle)}</h1>\n`;
  docx += `<p><strong>by ${escapeXML(author)}</strong></p>\n`;
  docx += `<hr/>\n`;

  for (const ch of chapters) {
    docx += `<h2>${escapeXML(ch.title)}</h2>\n`;
    docx += `<p>${escapeXML(ch.content).replace(/\n/g, '<br/>')}</p>\n`;
    docx += `<br/>\n`;
  }

  docx += `</body></html>`;
  return docx;
}

function generateRTF(novelTitle: string, author: string, chapters: { title: string; content: string }[]): string {
  let rtf = `{\\rtf1\\ansi\\deff0\n`;
  rtf += `{\\fonttbl{\\f0 Times New Roman;}}\n`;
  rtf += `\\f0\\fs24\n`;
  rtf += `{\\b ${escapeRTF(novelTitle)}}\\par\n`;
  rtf += `${escapeRTF(author)}\\par\\par\n`;

  for (const ch of chapters) {
    rtf += `{\\b ${escapeRTF(ch.title)}}\\par\n`;
    rtf += `${escapeRTF(ch.content).replace(/\n/g, '\\par ')}`;
    rtf += `\\par\\par\n`;
  }

  rtf += `}`;
  return rtf;
}

function generateMOBI(novelTitle: string, author: string, chapters: { title: string; content: string }[]): string {
  // MOBI uses same HTML structure as EPUB for simplicity
  return generateEPUB(novelTitle, author, chapters);
}

function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeRTF(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')
    .replace(/\n/g, '\\par ');
}

const generators: Record<ExportFormat, (title: string, author: string, chapters: { title: string; content: string }[]) => string> = {
  txt: generateTXT,
  epub: generateEPUB,
  docx: generateDOCX,
  rtf: generateRTF,
  mobi: generateMOBI,
};

const extensions: Record<ExportFormat, string> = {
  txt: ".txt",
  epub: ".epub",
  docx: ".doc",
  rtf: ".rtf",
  mobi: ".mobi",
};

const mimeTypes: Record<ExportFormat, string> = {
  txt: "text/plain",
  epub: "application/epub+zip",
  docx: "application/msword",
  rtf: "application/rtf",
  mobi: "application/x-mobipocket-ebook",
};

// ── Main Component ──────────────────────────────────────────────────────────

export default function NovelDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getNovel, loadChapterContent, sortOrder, toggleSortOrder, getSortedChapters } = useLibrary();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");

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

  // ── Export Handler ──────────────────────────────────────────────────────
  const handleExport = async (format: ExportFormat) => {
    setShowExportModal(false);
    setShowMenu(false);
    setExporting(true);
    setExportProgress("Loading chapters...");

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Load all chapter content from file system
      const chapters = await loadFullNovelContent(novel.id, novel.chapters);
      
      setExportProgress("Generating file...");
      
      // Generate the file content
      const generator = generators[format];
      const content = generator(novel.title, novel.author, chapters);
      
      // Create export directory
      const exportDir = `${FileSystem.documentDirectory}exports/`;
      const dirInfo = await FileSystem.getInfoAsync(exportDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(exportDir, { intermediates: true });
      }
      
      // Save file
      const safeTitle = novel.title.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_").substring(0, 50);
      const filename = `${safeTitle}${extensions[format]}`;
      const filePath = `${exportDir}${filename}`;
      
      await FileSystem.writeAsStringAsync(filePath, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      setExportProgress("Opening share dialog...");
      
      // Share the file
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(filePath, {
          mimeType: mimeTypes[format],
          dialogTitle: `Export ${novel.title}`,
        });
      } else {
        Alert.alert("Export Complete", `File saved to:\n${filename}\n\nYou can find it in your files app.`);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      Alert.alert("Export Failed", error.message || "An error occurred during export.");
    } finally {
      setExporting(false);
      setExportProgress("");
    }
  };

  // Memoized chapter render function
  const renderChapterItem = useCallback(({ item: ch, index: i }: { item: typeof sortedChapters[0], index: number }) => {
    const originalIndex = novel.chapters.findIndex(c => c.url === ch.url);
    const isCurrent = novel.lastRead?.chapterIndex === originalIndex;
    return (
      <Pressable
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
  }, [novel.chapters, novel.lastRead?.chapterIndex, novel.id, colors.accent, colors.text, colors.card, colors.border, colors.textMuted]);

  const keyExtractor = useCallback((item: typeof sortedChapters[0], index: number) => {
    return `${item.url}-${index}`;
  }, []);

  const getItemLayout = useCallback((_data: any, index: number) => ({
    length: 48,
    offset: 48 * index,
    index,
  }), []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header with menu button */}
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
        {/* Menu Button */}
        <Pressable
          style={styles.menuBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowMenu(true);
          }}
        >
          <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPad + 20 }}
        nestedScrollEnabled={true}
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

          {/* Chapter List */}
          <View style={styles.chapterListContainer}>
            <FlatList
              data={sortedChapters}
              keyExtractor={keyExtractor}
              renderItem={renderChapterItem}
              getItemLayout={getItemLayout}
              scrollEnabled={false}
              nestedScrollEnabled={true}
              initialNumToRender={20}
              maxToRenderPerBatch={30}
              windowSize={10}
              removeClippedSubviews={true}
              ListEmptyComponent={
                <View style={styles.emptyChapters}>
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    No chapters available yet.
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </ScrollView>

      {/* ── Menu Modal ── */}
      <Modal
        visible={showMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setShowMenu(false)}>
          <View style={[styles.menuContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.menuTitle, { color: colors.text }]} numberOfLines={1}>{novel.title}</Text>
            
            <Pressable
              style={[styles.menuItem, { borderColor: colors.border }]}
              onPress={() => {
                setShowMenu(false);
                setShowExportModal(true);
              }}
            >
              <Ionicons name="download-outline" size={20} color={colors.accent} />
              <Text style={[styles.menuItemText, { color: colors.text }]}>Export Novel</Text>
            </Pressable>

            <Pressable
              style={[styles.menuItem, { borderColor: colors.border }]}
              onPress={() => {
                setShowMenu(false);
                // Add other menu actions here (delete, etc.)
              }}
            >
              <Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} />
              <Text style={[styles.menuItemText, { color: colors.text }]}>Novel Info</Text>
            </Pressable>

            <Pressable
              style={[styles.menuCancelBtn, { borderColor: colors.border }]}
              onPress={() => setShowMenu(false)}
            >
              <Text style={[styles.menuCancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* ── Export Format Modal ── */}
      <Modal
        visible={showExportModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowExportModal(false)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setShowExportModal(false)}>
          <View style={[styles.exportContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.menuTitle, { color: colors.text }]}>Export as...</Text>
            
            {EXPORT_OPTIONS.map((option) => (
              <Pressable
                key={option.format}
                style={[styles.exportItem, { borderColor: colors.border }]}
                onPress={() => handleExport(option.format)}
              >
                <Ionicons name={option.icon as any} size={20} color={option.color} />
                <Text style={[styles.menuItemText, { color: colors.text }]}>{option.label}</Text>
              </Pressable>
            ))}

            <Pressable
              style={[styles.menuCancelBtn, { borderColor: colors.border }]}
              onPress={() => setShowExportModal(false)}
            >
              <Text style={[styles.menuCancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* ── Export Progress Modal ── */}
      <Modal
        visible={exporting}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.menuOverlay}>
          <View style={[styles.progressModal, { backgroundColor: colors.card }]}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={[styles.progressText, { color: colors.text }]}>{exportProgress}</Text>
            <Text style={[styles.progressSubText, { color: colors.textSecondary }]}>
              This may take a moment for large novels...
            </Text>
          </View>
        </View>
      </Modal>
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
  menuBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
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
  chapterListContainer: {
    minHeight: 200,
  },
  chapterRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 6,
  },
  chapterTitle: { fontFamily: "Inter_500Medium", fontSize: 14, flex: 1 },
  emptyChapters: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: 'center',
  },
  // Menu styles
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  menuContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    gap: 4,
  },
  menuTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    marginBottom: 12,
    textAlign: 'center',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuItemText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
  },
  menuCancelBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  menuCancelText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  // Export styles
  exportContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    gap: 4,
    maxHeight: '70%',
  },
  exportItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // Progress modal
  progressModal: {
    marginHorizontal: 40,
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    gap: 12,
    alignSelf: 'center',
    marginTop: 'auto',
    marginBottom: 'auto',
  },
  progressText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    textAlign: 'center',
  },
  progressSubText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textAlign: 'center',
  },
});
