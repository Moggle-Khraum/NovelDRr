import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
  const { novels } = useLibrary();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

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
          <Text style={[styles.versionText, { color: colors.textMuted }]}>Novel DR — Version 1.0</Text>
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
});
