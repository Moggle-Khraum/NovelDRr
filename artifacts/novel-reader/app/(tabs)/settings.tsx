import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import React, { useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLibrary } from "@/context/LibraryContext";
import { useTheme } from "@/context/ThemeContext";
import { Theme } from "@/constants/colors";

function ThemeButton({
  label,
  icon,
  themeKey,
  active,
  onPress,
}: {
  label: string;
  icon: string;
  themeKey: Theme;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      style={[
        styles.themeBtn,
        {
          backgroundColor: active ? colors.accent : colors.surface,
          borderColor: active ? colors.accent : colors.border,
        },
      ]}
      onPress={onPress}
    >
      <Ionicons
        name={icon as any}
        size={18}
        color={active ? "#fff" : colors.textSecondary}
      />
      <Text
        style={[
          styles.themeBtnLabel,
          { color: active ? "#fff" : colors.textSecondary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { colors, theme, setTheme } = useTheme();
  const { novels, addNovel } = useLibrary();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [backupList, setBackupList] = useState<FileSystem.FileInfo[]>([]);
  const [showBackupList, setShowBackupList] = useState(false);
  const [commentPromptVisible, setCommentPromptVisible] = useState(false);
  const [pendingComment, setPendingComment] = useState("");

  const BACKUP_DIR = FileSystem.documentDirectory + "noveldrr-backups/";

  const ensureDir = async () => {
    const info = await FileSystem.getInfoAsync(BACKUP_DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(BACKUP_DIR, { intermediates: true });
  };

  const formatDateTag = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
  };

  const buildFilename = (comment: string) => {
    const tag = comment.trim().replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    return `noveldrr-backup-${formatDateTag()}${tag ? "_" + tag : ""}.json`;
  };

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (novels.length === 0) return;
    setPendingComment("");
    setCommentPromptVisible(true);
  };

  const confirmExport = async (comment: string) => {
    try {
      setCommentPromptVisible(false);
      setExporting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      await ensureDir();

      const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        comment: comment.trim() || null,
        novels: novels.map((n) => ({
          id: n.id,
          title: n.title,
          author: n.author,
          coverUrl: n.coverUrl,
          synopsis: n.synopsis,
          sourceUrl: n.sourceUrl,
          dateAdded: n.dateAdded,
          lastRead: n.lastRead ?? null,
          chapterCount: n.chapters.length,
          // chapters intentionally excluded to save space
        })),
      };

      const filename = buildFilename(comment);
      const path = BACKUP_DIR + filename;

      await FileSystem.writeAsStringAsync(path, JSON.stringify(backup, null, 2), {
        encoding: FileSystem.EncodingType.UTF8,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Backup Saved ✓",
        `Saved to Documents/noveldrr-backups/\n\n${filename}`,
        [
          { text: "OK" },
          {
            text: "Share",
            onPress: async () => {
              const canShare = await Sharing.isAvailableAsync();
              if (canShare) await Sharing.shareAsync(path, { mimeType: "application/json", dialogTitle: "Share NovelDRr Backup" });
            },
          },
        ]
      );
    } catch (e) {
      Alert.alert("Export Failed", String(e));
    } finally {
      setExporting(false);
    }
  };

  // ── Load backup list ──────────────────────────────────────────────────────
  const loadBackupList = async () => {
    try {
      await ensureDir();
      const files = await FileSystem.readDirectoryAsync(BACKUP_DIR);
      const jsonFiles = files
        .filter((f) => f.endsWith(".json"))
        .sort()
        .reverse(); // newest first
      setBackupList(jsonFiles as any);
      setShowBackupList(true);
    } catch (e) {
      Alert.alert("Error", String(e));
    }
  };

  // ── Import from a specific file ───────────────────────────────────────────
  const handleImportFile = async (filename: string) => {
    try {
      setImporting(true);
      const path = BACKUP_DIR + filename;
      const raw = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
      const backup = JSON.parse(raw);

      if (!backup.version || !Array.isArray(backup.novels)) {
        Alert.alert("Invalid Backup", "This file doesn't look like a NovelDRr backup.");
        return;
      }

      const existingIds = new Set(novels.map((n) => n.id));
      const toImport = backup.novels.filter((n: any) => !existingIds.has(n.id));
      const skipped = backup.novels.length - toImport.length;

      if (toImport.length === 0) {
        Alert.alert("Nothing to Import", `All ${skipped} novel(s) are already in your library.`);
        return;
      }

      Alert.alert(
        "Confirm Import",
        `Import ${toImport.length} novel(s) from:\n"${filename}"?${skipped > 0 ? `\n\n(${skipped} already in library will be skipped)` : ""}`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Import",
            onPress: async () => {
              for (const n of toImport) {
                await addNovel({
                  id: n.id,
                  title: n.title,
                  author: n.author,
                  coverUrl: n.coverUrl ?? "",
                  synopsis: n.synopsis ?? "",
                  sourceUrl: n.sourceUrl ?? "",
                  dateAdded: n.dateAdded ?? Date.now(),
                  lastRead: n.lastRead ?? undefined,
                  chapters: [],
                });
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setShowBackupList(false);
              Alert.alert("Import Complete", `${toImport.length} novel(s) restored.\nRe-download chapters from the Add tab.`);
            },
          },
        ]
      );
    } catch (e) {
      Alert.alert("Import Failed", String(e));
    } finally {
      setImporting(false);
    }
  };

  // ── Delete a backup file ──────────────────────────────────────────────────
  const handleDeleteBackup = (filename: string) => {
    Alert.alert("Delete Backup", `Delete "${filename}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await FileSystem.deleteAsync(BACKUP_DIR + filename, { idempotent: true });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setBackupList((prev) => (prev as any[]).filter((f) => f !== filename) as any);
        },
      },
    ]);
  };

  // ── Parse filename into readable label ────────────────────────────────────
  const parseFilename = (filename: string) => {
    // noveldrr-backup-2026-03-30_14-22_my-tag.json
    const base = filename.replace("noveldrr-backup-", "").replace(".json", "");
    const [datePart, timePart, ...rest] = base.split("_");
    const date = datePart ?? "";
    const time = timePart ? timePart.replace("-", ":") : "";
    const tag = rest.join(" ").replace(/-/g, " ") || null;
    return { date, time, tag };
  };

  const totalChapters = novels.reduce((sum, n) => sum + n.chapters.length, 0);

  const handleThemeChange = (t: Theme) => {
    setTheme(t);
    Haptics.selectionAsync();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <Ionicons name="settings" size={22} color={colors.accent} />
        <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>LIBRARY STATISTICS</Text>
        <View style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.statItem}>
            <Ionicons name="library" size={20} color={colors.accent} />
            <View>
              <Text style={[styles.statValue, { color: colors.text }]}>{novels.length}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Novels</Text>
            </View>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Ionicons name="document-text" size={20} color={colors.accent} />
            <View>
              <Text style={[styles.statValue, { color: colors.text }]}>{totalChapters.toLocaleString()}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Chapters</Text>
            </View>
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>APP THEME</Text>
        <View style={styles.themeRow}>
          <ThemeButton
            label="Dark"
            icon="moon"
            themeKey="dark"
            active={theme === "dark"}
            onPress={() => handleThemeChange("dark")}
          />
          <ThemeButton
            label="Light"
            icon="sunny"
            themeKey="light"
            active={theme === "light"}
            onPress={() => handleThemeChange("light")}
          />
          <ThemeButton
            label="Sepia"
            icon="book"
            themeKey="sepia"
            active={theme === "sepia"}
            onPress={() => handleThemeChange("sepia")}
          />
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>BACKUP</Text>
        <View style={[styles.backupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.backupDesc, { color: colors.textSecondary }]}>
            Saves title, author, cover, synopsis, and reading progress. Chapters are excluded to keep the file small. Backups persist in{" "}
            <Text style={{ fontFamily: "Inter_500Medium" }}>Documents/noveldrr-backups/</Text>.
          </Text>
          <View style={styles.backupRow}>
            <Pressable
              style={[styles.backupBtn, { backgroundColor: colors.accent, opacity: exporting ? 0.6 : 1 }]}
              onPress={handleExport}
              disabled={exporting || novels.length === 0}
            >
              <Ionicons name="save-outline" size={18} color="#fff" />
              <Text style={styles.backupBtnText}>{exporting ? "Saving…" : "New Backup"}</Text>
            </Pressable>
            <Pressable
              style={[styles.backupBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: importing ? 0.6 : 1 }]}
              onPress={loadBackupList}
              disabled={importing}
            >
              <Ionicons name="folder-open-outline" size={18} color={colors.accent} />
              <Text style={[styles.backupBtnText, { color: colors.accent }]}>Restore</Text>
            </Pressable>
          </View>
          {novels.length === 0 && (
            <Text style={[styles.backupHint, { color: colors.textMuted }]}>
              Add novels to your library before creating a backup.
            </Text>
          )}
        </View>

        {/* Backup List Modal */}
        {showBackupList && (
          <View style={[styles.backupListCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.backupListHeader}>
              <Text style={[styles.backupListTitle, { color: colors.text }]}>Saved Backups</Text>
              <Pressable onPress={() => setShowBackupList(false)}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            {(backupList as any[]).length === 0 ? (
              <Text style={[styles.backupHint, { color: colors.textMuted }]}>
                No backups found in Documents/noveldrr-backups/
              </Text>
            ) : (
              (backupList as any[]).map((filename: string) => {
                const { date, time, tag } = parseFilename(filename);
                return (
                  <View key={filename} style={[styles.backupItem, { borderColor: colors.border }]}>
                    <Pressable style={styles.backupItemInfo} onPress={() => handleImportFile(filename)}>
                      <View style={styles.backupItemMeta}>
                        <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                        <Text style={[styles.backupItemDate, { color: colors.textSecondary }]}>{date}  {time}</Text>
                      </View>
                      {tag ? (
                        <Text style={[styles.backupItemTag, { color: colors.text }]}>{tag}</Text>
                      ) : (
                        <Text style={[styles.backupItemTag, { color: colors.textMuted }]}>No label</Text>
                      )}
                    </Pressable>
                    <Pressable onPress={() => handleDeleteBackup(filename)} style={styles.backupItemDelete}>
                      <Ionicons name="trash-outline" size={18} color={colors.error} />
                    </Pressable>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* Comment Prompt */}
        {commentPromptVisible && (
          <View style={[styles.commentCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.commentTitle, { color: colors.text }]}>Label this backup</Text>
            <Text style={[styles.commentSub, { color: colors.textSecondary }]}>
              Optional — helps you identify this backup later (e.g. "before vacation", "50 novels")
            </Text>
            <TextInput
              style={[styles.commentInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              placeholder="e.g. before vacation"
              placeholderTextColor={colors.textMuted}
              value={pendingComment}
              onChangeText={setPendingComment}
              maxLength={40}
              autoFocus
            />
            <View style={styles.backupRow}>
              <Pressable
                style={[styles.backupBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setCommentPromptVisible(false)}
              >
                <Text style={[styles.backupBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.backupBtn, { backgroundColor: colors.accent }]}
                onPress={() => confirmExport(pendingComment)}
              >
                <Ionicons name="save-outline" size={16} color="#fff" />
                <Text style={styles.backupBtnText}>Save Backup</Text>
              </Pressable>
            </View>
          </View>
        )}

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>ABOUT</Text>
        <View style={[styles.aboutCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.aboutRow}>
            <Ionicons name="globe" size={16} color={colors.accent} />
            <Text style={[styles.aboutText, { color: colors.text }]}>
              Download novels from 3 popular sites
            </Text>
          </View>
          {["ReadNovelFull", "NovelFull", "FreeWebNovel"].map((site) => (
            <View key={site} style={styles.aboutRow}>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
              <Text style={[styles.aboutSite, { color: colors.textSecondary }]}>{site}</Text>
            </View>
          ))}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.aboutRow}>
            <Ionicons name="eye" size={16} color={colors.accent} />
            <Text style={[styles.aboutText, { color: colors.text }]}>
              Beautiful in-app reading experience
            </Text>
          </View>
          <View style={styles.aboutRow}>
            <Ionicons name="bookmark" size={16} color={colors.accent} />
            <Text style={[styles.aboutText, { color: colors.text }]}>
              Reading progress tracking with Continue
            </Text>
          </View>
          <View style={styles.aboutRow}>
            <Ionicons name="phone-portrait" size={16} color={colors.accent} />
            <Text style={[styles.aboutText, { color: colors.text }]}>
              Dark, Light, and Sepia themes
            </Text>
          </View>
          <View style={styles.aboutRow}>
            <Ionicons name="cloud-offline" size={16} color={colors.accent} />
            <Text style={[styles.aboutText, { color: colors.text }]}>
              Offline reading capability
            </Text>
          </View>
        </View>

        <View style={[styles.versionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.versionText, { color: colors.textMuted }]}>Novel DR — v1.3rev054</Text>
        </View>
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
  scroll: { padding: 16, gap: 12 },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.8,
    marginTop: 8,
  },
  statsCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    padding: 20,
    gap: 0,
  },
  statItem: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  statDivider: { width: StyleSheet.hairlineWidth, marginVertical: 4 },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 24 },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  themeRow: { flexDirection: "row", gap: 10 },
  themeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  themeBtnLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  aboutCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 10,
  },
  aboutRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  aboutText: { fontFamily: "Inter_400Regular", fontSize: 13, flex: 1 },
  aboutSite: { fontFamily: "Inter_500Medium", fontSize: 13 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  versionCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    alignItems: "center",
    marginTop: 4,
  },
  versionText: { fontFamily: "Inter_400Regular", fontSize: 12 },
  backupCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  backupDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
  },
  backupRow: {
    flexDirection: "row",
    gap: 10,
  },
  backupBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backupBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
  backupHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    textAlign: "center",
  },
  backupListCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 10,
  },
  backupListHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  backupListTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  backupItem: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    gap: 8,
  },
  backupItemInfo: {
    flex: 1,
    gap: 3,
  },
  backupItemMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backupItemDate: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  backupItemTag: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  backupItemDelete: {
    padding: 6,
  },
  commentCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  commentTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  commentSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 18,
  },
  commentInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
});
