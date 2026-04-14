import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import React, { useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Modal } from "react-native";
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
  const [backupList, setBackupList] = useState<string[]>([]);
  const [showBackupList, setShowBackupList] = useState(false);
  const [commentPromptVisible, setCommentPromptVisible] = useState(false);
  const [pendingComment, setPendingComment] = useState("");
  const [showDevProfile, setShowDevProfile] = useState(false);

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

  // ── Logic: Duplicate Check (Title & ID) ──────────────────────────────────
  const getUniqueNovelsToImport = (backupNovels: any[]) => {
    const existingIds = new Set(novels.map((n) => n.id));
    const existingTitles = new Set(novels.map((n) => n.title.toLowerCase().trim()));

    return backupNovels.filter((n: any) => {
      const isDuplicateId = existingIds.has(n.id);
      const isDuplicateTitle = existingTitles.has(n.title?.toLowerCase().trim());
      return !isDuplicateId && !isDuplicateTitle;
    });
  };

  const processImport = async (backup: any, fileName: string) => {
    if (!backup.version || !Array.isArray(backup.novels)) {
      Alert.alert("Invalid Backup", "This file doesn't look like a NovelDRr backup.");
      return;
    }

    const toImport = getUniqueNovelsToImport(backup.novels);
    const skipped = backup.novels.length - toImport.length;

    if (toImport.length === 0) {
      Alert.alert("Nothing to Import", `All ${skipped} novel(s) are already in your library.`);
      return;
    }

    Alert.alert(
      "Confirm Import",
      `Import ${toImport.length} novel(s) from:\n"${fileName}"?${skipped > 0 ? `\n\n(${skipped} already in library will be skipped)` : ""}`,
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
            Alert.alert("Import Complete", `${toImport.length} novel(s) restored.`);
          },
        },
      ]
    );
  };

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
        })),
      };

      const filename = buildFilename(comment);
      const path = BACKUP_DIR + filename;
      await FileSystem.writeAsStringAsync(path, JSON.stringify(backup, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Backup Saved ✓", `Saved to Documents/noveldrr-backups/\n\n${filename}`, [
        { text: "OK" },
        {
          text: "Share",
          onPress: async () => {
            if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path);
          },
        },
      ]);
    } catch (e) { Alert.alert("Export Failed", String(e)); }
    finally { setExporting(false); }
  };

  const loadBackupList = async () => {
    try {
      await ensureDir();
      const files = await FileSystem.readDirectoryAsync(BACKUP_DIR);
      setBackupList(files.filter((f) => f.endsWith(".json")).sort().reverse());
      setShowBackupList(true);
    } catch (e) { Alert.alert("Error", String(e)); }
  };

  const handleImportFile = async (filename: string) => {
    try {
      setImporting(true);
      const raw = await FileSystem.readAsStringAsync(BACKUP_DIR + filename, { encoding: FileSystem.EncodingType.UTF8 });
      await processImport(JSON.parse(raw), filename);
    } catch (e) { Alert.alert("Import Failed", String(e)); }
    finally { setImporting(false); }
  };

  const handleImportFromPicker = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "application/json", copyToCacheDirectory: true });
      if (result.canceled) return;
      setImporting(true);
      const raw = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
      await processImport(JSON.parse(raw), result.assets[0].name);
    } catch (e) { Alert.alert("Import Failed", String(e)); }
    finally { setImporting(false); }
  };

  const handleDeleteBackup = (filename: string) => {
    Alert.alert("Delete Backup", `Delete "${filename}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await FileSystem.deleteAsync(BACKUP_DIR + filename, { idempotent: true });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setBackupList((prev) => prev.filter((f) => f !== filename));
        },
      },
    ]);
  };

  const parseFilename = (filename: string) => {
    const base = filename.replace("noveldrr-backup-", "").replace(".json", "");
    const [datePart, timePart, ...rest] = base.split("_");
    return { 
        date: datePart ?? "", 
        time: timePart ? timePart.replace("-", ":") : "", 
        tag: rest.join(" ").replace(/-/g, " ") || null 
    };
  };

  const totalChapters = novels.reduce((sum, n) => sum + n.chapters.length, 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header with Dev Icon */}
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <View style={styles.headerTitleContainer}>
            <Ionicons name="settings" size={22} color={colors.accent} />
            <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        </View>
        <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowDevProfile(true); }}>
            <Ionicons name="beer-outline" size={22} color={colors.accent} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad + 100 }]}>
        
        {/* System Warning Card */}
        <View style={[styles.warningCard, { backgroundColor: colors.surface, borderColor: "#ffb300" }]}>
          <View style={styles.aboutRow}>
            <Ionicons name="warning" size={18} color="#ffb300" />
            <Text style={[styles.warningTitle, { color: colors.text }]}>System Action Required</Text>
          </View>
          <Text style={[styles.warningText, { color: colors.textSecondary }]}>
            Turn off <Text style={{fontWeight: '700'}}>'Manage unused Apps'</Text> or <Text style={{fontWeight: '700'}}>'Remove permissions and free up space'</Text> in Android Settings for Novel DR to prevent imminent sudden deletion of your library data.
          </Text>
        </View>

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
          {(["dark", "light", "sepia"] as Theme[]).map((t) => (
            <ThemeButton
              key={t}
              label={t.charAt(0).toUpperCase() + t.slice(1)}
              icon={t === "dark" ? "moon" : t === "light" ? "sunny" : "book"}
              themeKey={t}
              active={theme === t}
              onPress={() => { setTheme(t); Haptics.selectionAsync(); }}
            />
          ))}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>BACKUP</Text>
        <View style={[styles.backupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.backupDesc, { color: colors.textSecondary }]}>
            Saves progress. Chapters excluded to save space. Persistence in <Text style={{ fontWeight: "500" }}>Documents/noveldrr-backups/</Text>.
          </Text>
          <View style={styles.backupRow}>
            <Pressable
              style={[styles.backupBtn, { backgroundColor: colors.accent, opacity: exporting || novels.length === 0 ? 0.6 : 1 }]}
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
          <Pressable
            style={[styles.backupBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: importing ? 0.6 : 1 }]}
            onPress={handleImportFromPicker}
            disabled={importing}
          >
            <Ionicons name="cloud-upload-outline" size={18} color={colors.accent} />
            <Text style={[styles.backupBtnText, { color: colors.accent }]}>{importing ? "Importing…" : "Import from File"}</Text>
          </Pressable>
        </View>

        {/* Developer Profile Modal */}
        <Modal visible={showDevProfile} transparent animationType="fade">
            <View style={styles.modalOverlay}>
                <View style={[styles.devCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.backupListHeader}>
                        <Text style={[styles.backupListTitle, { color: colors.text }]}>Developer Profile</Text>
                        <Pressable onPress={() => setShowDevProfile(false)}><Ionicons name="close" size={24} color={colors.textSecondary} /></Pressable>
                    </View>
                    <View style={styles.devContent}>
                        <View style={styles.devItem}>
                            <Text style={[styles.statLabel, { color: colors.textMuted }]}>DEVELOPER</Text>
                            <Text style={[styles.aboutText, { color: colors.text, fontSize: 16 }]}>Moggs (Agent_047)</Text>
                        </View>
                        <View style={styles.devItem}>
                            <Text style={[styles.statLabel, { color: colors.textMuted }]}>OFFICIAL SITE</Text>
                            <Text style={[styles.aboutSite, { color: colors.accent }]}>noveldrr.app</Text>
                        </View>
                        <View style={styles.devItem}>
                            <Text style={[styles.statLabel, { color: colors.textMuted }]}>TECH STACK</Text>
                            <Text style={[styles.aboutText, { color: colors.text }]}>React Native, Expo, TypeScript, GitHub Actions</Text>
                        </View>
                    </View>
                </View>
            </View>
        </Modal>

        {/* Backup list and comment modals remain largely the same as your source */}
        {showBackupList && (
          <View style={[styles.backupListCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.backupListHeader}>
              <Text style={[styles.backupListTitle, { color: colors.text }]}>Saved Backups</Text>
              <Pressable onPress={() => setShowBackupList(false)}><Ionicons name="close" size={20} color={colors.textSecondary} /></Pressable>
            </View>
            {backupList.length === 0 ? (
                <Text style={[styles.backupHint, { color: colors.textMuted }]}>No backups found.</Text>
            ) : (
                backupList.map((filename) => {
                    const { date, time, tag } = parseFilename(filename);
                    return (
                        <View key={filename} style={[styles.backupItem, { borderColor: colors.border }]}>
                            <Pressable style={styles.backupItemInfo} onPress={() => handleImportFile(filename)}>
                                <View style={styles.backupItemMeta}>
                                    <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                                    <Text style={[styles.backupItemDate, { color: colors.textSecondary }]}>{date} {time}</Text>
                                </View>
                                <Text style={[styles.backupItemTag, { color: tag ? colors.text : colors.textMuted }]}>{tag || "No label"}</Text>
                            </Pressable>
                            <Pressable onPress={() => handleDeleteBackup(filename)}><Ionicons name="trash-outline" size={18} color={colors.text} /></Pressable>
                        </View>
                    );
                })
            )}
          </View>
        )}

        {commentPromptVisible && (
          <View style={[styles.commentCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.commentTitle, { color: colors.text }]}>Label this backup</Text>
            <TextInput
              style={[styles.commentInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              placeholder="e.g. 50 novels backup"
              placeholderTextColor={colors.textMuted}
              value={pendingComment}
              onChangeText={setPendingComment}
              maxLength={40}
              autoFocus
            />
            <View style={styles.backupRow}>
              <Pressable style={[styles.backupBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]} onPress={() => setCommentPromptVisible(false)}>
                <Text style={[styles.backupBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.backupBtn, { backgroundColor: colors.accent }]} onPress={() => confirmExport(pendingComment)}>
                <Text style={styles.backupBtnText}>Save Backup</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={[styles.versionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.versionText, { color: colors.textMuted }]}>Novel DR — v1.3.8</Text>
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
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitleContainer: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22 },
  scroll: { padding: 16, gap: 12 },
  warningCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  warningTitle: { fontFamily: "Inter_700Bold", fontSize: 14 },
  warningText: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 0.8, marginTop: 8 },
  statsCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, flexDirection: "row", padding: 20 },
  statItem: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  statDivider: { width: StyleSheet.hairlineWidth, marginVertical: 4 },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 24 },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  themeRow: { flexDirection: "row", gap: 10 },
  themeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  themeBtnLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  backupCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 12 },
  backupDesc: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 },
  backupRow: { flexDirection: "row", gap: 10 },
  backupBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12 },
  backupBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  backupHint: { fontFamily: "Inter_400Regular", fontSize: 12, textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 },
  devCard: { borderRadius: 20, borderWidth: 1, padding: 20, gap: 15 },
  devContent: { gap: 12 },
  devItem: { gap: 2 },
  backupListCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 10 },
  backupListHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  backupListTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  backupItem: { flexDirection: "row", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 8 },
  backupItemInfo: { flex: 1, gap: 3 },
  backupItemMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  backupItemDate: { fontFamily: "Inter_400Regular", fontSize: 12 },
  backupItemTag: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  commentCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 12 },
  commentTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  commentInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontFamily: "Inter_400Regular", fontSize: 14 },
  aboutRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  aboutText: { fontFamily: "Inter_400Regular", fontSize: 13 },
  aboutSite: { fontFamily: "Inter_500Medium", fontSize: 13 },
  versionCard: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 14, alignItems: "center", marginTop: 4 },
  versionText: { fontFamily: "Inter_400Regular", fontSize: 12 },
});
