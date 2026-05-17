import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import * as FileSystem from 'expo-file-system';
import * as Speech from 'expo-speech';
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLibrary } from "@/context/LibraryContext";
import { useTheme } from "@/context/ThemeContext";

const FONT_SIZES = [14, 15, 16, 17, 18, 19, 20, 22];
const LINE_SPACINGS = [1.2, 1.3, 1.5, 1.8, 2.0, 2.5];
const AUTO_SCROLL_SPEEDS = [0.5, 1, 1.5, 1.8, 2, 2.5];

const READER_SETTINGS_FILE = `${FileSystem.documentDirectory}NovelDR/reader_settings.json`;
const TTS_SETTINGS_FILE = `${FileSystem.documentDirectory}NovelDR/tts_simple_settings.json`;

const TTS_MIN_CHARS = 500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const loadChapterContentWithFallback = async (
  novelId: string,
  chapterIndex: number,
  chapter: { title: string; url: string; content?: string },
  loadFromFileSystem: (novelId: string, chapterIndex: number) => Promise<any>
): Promise<string> => {
  try {
    const fileChapter = await loadFromFileSystem(novelId, chapterIndex);
    if (fileChapter && fileChapter.content) return fileChapter.content;
  } catch {
    console.log('[Reader] File system load failed, trying fallbacks...');
  }

  if (chapter.content && chapter.content.trim().length > 0) return chapter.content;

  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const libraryData = await AsyncStorage.getItem('novel_library_v1');
    if (libraryData) {
      const novels = JSON.parse(libraryData);
      const novel = novels.find((n: any) => n.id === novelId);
      if (novel?.chapters?.[chapterIndex]?.content?.trim().length > 0) {
        return novel.chapters[chapterIndex].content;
      }
    }
  } catch (asyncError) {
    console.log('[Reader] AsyncStorage fallback failed:', asyncError);
  }

  try {
    const altPaths = [
      `${FileSystem.documentDirectory}noveldr/chapters/${novelId}/chapter_${chapterIndex}.json`,
      `${FileSystem.cacheDirectory}../NovelDR/chapters/${novelId}/chapter_${chapterIndex}.json`,
    ];
    for (const altPath of altPaths) {
      const fileInfo = await FileSystem.getInfoAsync(altPath);
      if (fileInfo.exists) {
        const content = await FileSystem.readAsStringAsync(altPath);
        const chapterData = JSON.parse(content);
        if (chapterData.content) return chapterData.content;
      }
    }
  } catch {
    console.log('[Reader] Alternative path fallback failed');
  }

  return "Content not available for this chapter. It may still be downloading or wasn't saved properly. Try re-downloading the novel from the Updates tab.";
};

function splitIntoSentences(text: string): string[] {
  const raw = text.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) ?? [];
  const sentences: string[] = [];

  for (const chunk of raw) {
    const trimmed = chunk.trim();
    if (trimmed.length <= 1) continue;

    const sub = trimmed.match(/[^,;]+[,;]?/g) ?? [trimmed];
    for (const s of sub) {
      const st = s.trim();
      if (st.length > 1) sentences.push(st);
    }
  }

  return sentences;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReaderScreen() {
  const { id, chapterIndex: indexParam } = useLocalSearchParams<{ id: string; chapterIndex: string; }>();
  const { getNovel, saveReadingProgress, loadChapterContent, sortOrder, toggleSortOrder, getSortedChapters } = useLibrary();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [fontSizeIdx, setFontSizeIdx] = useState(1);
  const [lineSpacingIdx, setLineSpacingIdx] = useState(1);
  const [autoScrollSpeedIdx, setAutoScrollSpeedIdx] = useState(1);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [showTOC, setShowTOC] = useState(false);
  const [chapterIndex, setChapterIndex] = useState(parseInt(indexParam) || 0);
  const scrollRef = useRef<ScrollView>(null);

  const [autoScrollActive, setAutoScrollActive] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);
  const scrollYRef = useRef(0);
  const contentHeightRef = useRef(0);
  const scrollViewHeightRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const hasRestoredScrollRef = useRef(false);
  const restoredChapterRef = useRef<number>(-1);
  const forceTopRef = useRef(false);
  const pendingScrollOffsetRef = useRef<number | null>(null);

  const [chapterContent, setChapterContent] = useState<string>("");
  const [contentLoading, setContentLoading] = useState(false);

  // Simple TTS States
  const [ttsActive, setTtsActive] = useState(false);
  const [ttsSentences, setTtsSentences] = useState<string[]>([]);
  const [ttsIndex, setTtsIndex] = useState(-1);
  const ttsIndexRef = useRef(-1);
  const ttsSentencesRef = useRef<string[]>([]);
  const ttsActiveRef = useRef(false);
  const ttsScrollCounterRef = useRef(0);

  const [showTTSSettings, setShowTTSSettings] = useState(false);
  const [ttsVoices, setTtsVoices] = useState<Speech.Voice[]>([]);
  const [ttsVoiceId, setTtsVoiceId] = useState<string | undefined>(undefined);
  const ttsVoiceIdRef = useRef<string | undefined>(undefined);
  const [isRefreshingVoices, setIsRefreshingVoices] = useState(false);
  const [previewVoiceId, setPreviewVoiceId] = useState<string | null>(null);

  const novel = getNovel(id);
  const sortedChapters = novel ? getSortedChapters(novel.chapters) : [];
  const chapter = novel?.chapters[chapterIndex];

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  // Load General UI Settings
  useEffect(() => {
    (async () => {
      try {
        const fileInfo = await FileSystem.getInfoAsync(READER_SETTINGS_FILE);
        if (fileInfo.exists) {
          const content = await FileSystem.readAsStringAsync(READER_SETTINGS_FILE);
          const settings = JSON.parse(content);
          if (settings.fontSizeIdx !== undefined) setFontSizeIdx(settings.fontSizeIdx);
          if (settings.lineSpacingIdx !== undefined) setLineSpacingIdx(settings.lineSpacingIdx);
          if (settings.autoScrollSpeedIdx !== undefined) setAutoScrollSpeedIdx(settings.autoScrollSpeedIdx);
        }
      } catch (error) {
        console.error('Failed to load reader settings:', error);
      } finally {
        setSettingsLoaded(true);
      }
    })();
  }, []);

  const saveAllSettings = async (font: number, line: number, scroll: number) => {
    try {
      const dir = `${FileSystem.documentDirectory}NovelDR/`;
      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      await FileSystem.writeAsStringAsync(
        READER_SETTINGS_FILE,
        JSON.stringify({ fontSizeIdx: font, lineSpacingIdx: line, autoScrollSpeedIdx: scroll })
      );
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  // Query engine voices (with structural warm-up fallback)
  const fetchSystemVoices = async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshingVoices(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    try {
      let voices = await Speech.getAvailableVoicesAsync();
      if (voices.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 600));
        voices = await Speech.getAvailableVoicesAsync();
      }
      const english = voices.filter(v => v.language?.toLowerCase().startsWith('en'));
      setTtsVoices(english.length > 0 ? english : voices);
    } catch (e) {
      console.warn('[TTS] Voice lookups failed:', e);
    } finally {
      if (isManualRefresh) setIsRefreshingVoices(false);
    }
  };

  // Load Voice Profiles on initialization
  useEffect(() => {
    (async () => {
      try {
        const fileInfo = await FileSystem.getInfoAsync(TTS_SETTINGS_FILE);
        if (fileInfo.exists) {
          const raw = await FileSystem.readAsStringAsync(TTS_SETTINGS_FILE);
          const s = JSON.parse(raw);
          if (s.voiceId !== undefined) {
            setTtsVoiceId(s.voiceId);
            ttsVoiceIdRef.current = s.voiceId;
          }
        }
      } catch (e) {
        console.warn('[TTS] Failed to load TTS settings:', e);
      }
      await fetchSystemVoices();
    })();
  }, []);

  const saveSelectedVoice = async (voiceId: string | undefined) => {
    try {
      const dir = `${FileSystem.documentDirectory}NovelDR/`;
      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      await FileSystem.writeAsStringAsync(TTS_SETTINGS_FILE, JSON.stringify({ voiceId }));
    } catch (e) {
      console.warn('[TTS] Failed to save voice:', e);
    }
  };

  // Handle previewing target text voice samples
  const toggleVoicePreview = (voiceIdentifier: string) => {
    if (previewVoiceId === voiceIdentifier) {
      Speech.stop();
      setPreviewVoiceId(null);
      return;
    }
    
    // Stop any active primary chapter reading first
    if (ttsActiveRef.current) stopTTS();
    
    Speech.stop();
    setPreviewVoiceId(voiceIdentifier);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Speech.speak("Testing voice setup on NovelDR", {
      language: 'en',
      voice: voiceIdentifier,
      rate: 0.95,
      pitch: 1.0,
      onDone: () => setPreviewVoiceId(null),
      onError: () => setPreviewVoiceId(null)
    });
  };

  // Load Content and Cache Pre-Split Sentences (Crucial to avoid rendering lag)
  useEffect(() => {
    const loadContent = async () => {
      if (novel && chapter) {
        setContentLoading(true);
        try {
          const content = await loadChapterContentWithFallback(novel.id, chapterIndex, chapter, loadChapterContent);
          setChapterContent(content);
          setTtsSentences(splitIntoSentences(content));
        } catch (error) {
          setChapterContent("Error loading chapter content. Please try again.");
        } finally {
          setContentLoading(false);
        }
      }
    };
    loadContent();
  }, [chapterIndex, novel?.id]);

  const stopTTS = useCallback(() => {
    Speech.stop();
    ttsActiveRef.current = false;
    ttsIndexRef.current = -1;
    ttsScrollCounterRef.current = 0;
    setTtsActive(false);
    setTtsIndex(-1);
  }, []);

  useEffect(() => { stopTTS(); }, [chapterIndex]);
  useEffect(() => { return () => { Speech.stop(); }; }, []);

  const speakSentence = useCallback((sentences: string[], index: number) => {
    if (index >= sentences.length || !ttsActiveRef.current) {
      stopTTS();
      return;
    }

    ttsIndexRef.current = index;
    setTtsIndex(index);

    Speech.speak(sentences[index], {
      language: 'en',
      pitch: 1.0, 
      rate: 0.95, 
      voice: ttsVoiceIdRef.current,
      onDone: () => {
        if (!ttsActiveRef.current) return;
        ttsScrollCounterRef.current += 1;
        if (ttsScrollCounterRef.current >= 5) { // Triggers every 5 sentences
          ttsScrollCounterRef.current = 0;
          const newY = scrollYRef.current + 140;
          scrollRef.current?.scrollTo({ y: newY, animated: true });
          scrollYRef.current = newY;
        }
        speakSentence(sentences, index + 1);
      },
      onError: () => {
        if (!ttsActiveRef.current) return;
        speakSentence(sentences, index + 1);
      }
    });
  }, [stopTTS]);

  const toggleTTS = useCallback(() => {
    if (previewVoiceId) { Speech.stop(); setPreviewVoiceId(null); }
    if (ttsActiveRef.current) {
      stopTTS();
      return;
    }
    if (!chapterContent || ttsSentences.length === 0) return;

    ttsSentencesRef.current = ttsSentences;
    ttsActiveRef.current = true;
    ttsScrollCounterRef.current = 0;
    setTtsActive(true);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const scrollRatio = contentHeightRef.current > 0 ? scrollYRef.current / contentHeightRef.current : 0;
    const startIndex = Math.max(0, Math.min(Math.floor(scrollRatio * ttsSentences.length), ttsSentences.length - 1));
    speakSentence(ttsSentences, startIndex);
  }, [chapterContent, ttsSentences, speakSentence, stopTTS, previewVoiceId]);

  useEffect(() => {
    return () => {
      if (novel && chapter) saveReadingProgress(novel.id, chapterIndex, chapter.title, scrollYRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [chapterIndex, novel?.id]);

  useEffect(() => {
    if (!settingsLoaded) return;
    if (restoredChapterRef.current !== chapterIndex) {
      hasRestoredScrollRef.current = false;
    }
    if (forceTopRef.current) {
      forceTopRef.current = false;
      pendingScrollOffsetRef.current = 0;
      return;
    }
    const savedLastRead = novel?.lastRead;
    const savedOffset = savedLastRead?.chapterIndex === chapterIndex ? savedLastRead.scrollOffset ?? 0 : 0;
    if (!hasRestoredScrollRef.current) {
      pendingScrollOffsetRef.current = savedOffset;
    }
  }, [chapterIndex, novel?.lastRead, settingsLoaded, contentLoading]);

  const updateReadingProgress = useCallback(() => {
    if (contentHeightRef.current > scrollViewHeightRef.current) {
      const maxScroll = contentHeightRef.current - scrollViewHeightRef.current;
      setReadingProgress(Math.min(100, Math.max(0, (scrollYRef.current / maxScroll) * 100)));
    } else {
      setReadingProgress(0);
    }
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setAutoScrollActive(false);
  }, []);

  const startAutoScroll = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const speed = AUTO_SCROLL_SPEEDS[autoScrollSpeedIdx];
    intervalRef.current = setInterval(() => {
      if (!scrollRef.current) return;
      const currentY = scrollYRef.current;
      const maxY = Math.max(0, contentHeightRef.current - scrollViewHeightRef.current);
      if (currentY >= maxY) { stopAutoScroll(); return; }
      const newY = Math.min(maxY, currentY + ((30 * speed) / 20));
      scrollRef.current.scrollTo({ y: newY, animated: false });
      scrollYRef.current = newY;
    }, 50);
    setAutoScrollActive(true);
  }, [autoScrollSpeedIdx, stopAutoScroll]);

  const handleScroll = (event: any) => {
    scrollYRef.current = event.nativeEvent.contentOffset.y;
    updateReadingProgress();
  };

  const handleScrollBeginDrag = () => {
    if (autoScrollActive) stopAutoScroll();
  };

  const handleContentSizeChange = (_width: number, height: number) => {
    contentHeightRef.current = height;
    updateReadingProgress();

    if (!hasRestoredScrollRef.current && pendingScrollOffsetRef.current !== null && height > 0) {
      const offset = pendingScrollOffsetRef.current;
      pendingScrollOffsetRef.current = null;
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: offset, animated: false });
        hasRestoredScrollRef.current = true;
        restoredChapterRef.current = chapterIndex;
        scrollYRef.current = offset;
        updateReadingProgress();
      }, 80);
    }
  };

  const handleScrollViewLayout = (event: any) => {
    scrollViewHeightRef.current = event.nativeEvent.layout.height;
    updateReadingProgress();
  };

  const goChapter = (dir: 1 | -1) => {
    const next = chapterIndex + dir;
    if (next < 0 || next >= (novel?.chapters.length ?? 0)) {
      Alert.alert("Navigation", dir === -1 ? "First chapter reached" : "Last chapter reached");
      return;
    }
    if (novel && chapter) saveReadingProgress(novel.id, chapterIndex, chapter.title, scrollYRef.current);
    stopAutoScroll(); stopTTS();
    scrollYRef.current = 0; hasRestoredScrollRef.current = false; forceTopRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setChapterIndex(next); setReadingProgress(0);
  };

  if (!novel || !chapter || !settingsLoaded) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const fontSize = FONT_SIZES[fontSizeIdx];
  const lineSpacing = LINE_SPACINGS[lineSpacingIdx];
  const currentSpeed = AUTO_SCROLL_SPEEDS[autoScrollSpeedIdx];
  const ttsAvailable = chapterContent.trim().length >= TTS_MIN_CHARS;
  const currentSentence = ttsIndex >= 0 ? ttsSentences[ttsIndex] : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: topPad + 4, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable style={styles.navBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.chapterTitle, { color: colors.text }]} numberOfLines={1}>{chapter.title}</Text>
        <Pressable style={styles.navBtn} onPress={() => setShowControls((v) => !v)}>
          <Ionicons name="settings-outline" size={20} color={colors.text} />
        </Pressable>
      </View>

      {/* Reader Controls Panel */}
      {showControls && (
        <View style={[styles.controls, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <View style={styles.controlRow}>
            <Text style={[styles.controlLabel, { color: colors.textSecondary }]}>Font</Text>
            <View style={styles.controlBtns}>
              <Pressable style={[styles.controlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => { setFontSizeIdx(m => Math.max(0, m - 1)); saveAllSettings(Math.max(0, fontSizeIdx - 1), lineSpacingIdx, autoScrollSpeedIdx); }}>
                <Text style={[styles.controlBtnText, { color: colors.text, fontSize: 12 }]}>A</Text>
              </Pressable>
              <Text style={[styles.controlValue, { color: colors.text }]}>{fontSize}pt</Text>
              <Pressable style={[styles.controlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => { setFontSizeIdx(m => Math.min(FONT_SIZES.length - 1, m + 1)); saveAllSettings(Math.min(FONT_SIZES.length - 1, fontSizeIdx + 1), lineSpacingIdx, autoScrollSpeedIdx); }}>
                <Text style={[styles.controlBtnText, { color: colors.text, fontSize: 18 }]}>A</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.controlRow}>
            <Text style={[styles.controlLabel, { color: colors.textSecondary }]}>Spacing</Text>
            <View style={styles.controlBtns}>
              <Pressable style={[styles.controlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => { setLineSpacingIdx(m => Math.max(0, m - 1)); saveAllSettings(fontSizeIdx, Math.max(0, lineSpacingIdx - 1), autoScrollSpeedIdx); }}>
                <Ionicons name="remove" size={16} color={colors.text} />
              </Pressable>
              <Text style={[styles.controlValue, { color: colors.text }]}>{lineSpacing.toFixed(1)}x</Text>
              <Pressable style={[styles.controlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => { setLineSpacingIdx(m => Math.min(LINE_SPACINGS.length - 1, m + 1)); saveAllSettings(fontSizeIdx, Math.min(LINE_SPACINGS.length - 1, lineSpacingIdx + 1), autoScrollSpeedIdx); }}>
                <Ionicons name="add" size={16} color={colors.text} />
              </Pressable>
            </View>
          </View>

          <View style={styles.controlRow}>
            <Text style={[styles.controlLabel, { color: colors.textSecondary }]}>AutoScroll</Text>
            <View style={styles.controlBtns}>
              <Pressable style={[styles.controlBtn, { backgroundColor: autoScrollActive ? colors.accent : colors.surface, borderColor: colors.border }]} onPress={() => autoScrollActive ? stopAutoScroll() : startAutoScroll()}>
                <Ionicons name={autoScrollActive ? "pause" : "play"} size={16} color={autoScrollActive ? "#fff" : colors.text} />
              </Pressable>
              <Pressable style={[styles.controlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => { setAutoScrollSpeedIdx(m => Math.max(0, m - 1)); saveAllSettings(fontSizeIdx, lineSpacingIdx, Math.max(0, autoScrollSpeedIdx - 1)); }}>
                <Ionicons name="remove" size={16} color={colors.text} />
              </Pressable>
              <Text style={[styles.controlValue, { color: colors.text }]}>{currentSpeed.toFixed(1)}x</Text>
              <Pressable style={[styles.controlBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => { setAutoScrollSpeedIdx(m => Math.min(AUTO_SCROLL_SPEEDS.length - 1, m + 1)); saveAllSettings(fontSizeIdx, lineSpacingIdx, Math.min(AUTO_SCROLL_SPEEDS.length - 1, autoScrollSpeedIdx + 1)); }}>
                <Ionicons name="add" size={16} color={colors.text} />
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Main Content Pane */}
      <View style={styles.scrollWrapper}>
        <ScrollView
          ref={scrollRef}
          style={styles.scrollArea}
          contentContainerStyle={[styles.textContainer, { paddingBottom: bottomPad + 100 }]}
          onScroll={handleScroll}
          onScrollBeginDrag={handleScrollBeginDrag}
          onContentSizeChange={handleContentSizeChange}
          onLayout={handleScrollViewLayout}
          scrollEventThrottle={16}
        >
          <Text style={[styles.chapterHeader, { color: colors.accent }]}>{chapter.title}</Text>

          {contentLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.accent} />
            </View>
          ) : (
            <Text style={[styles.content, { color: colors.text, fontSize, lineHeight: fontSize * lineSpacing }]}>
              {ttsSentences.map((sentence, idx) => {
                const isCurrent = idx === ttsIndex;
                return (
                  <Text
                    key={idx}
                    style={{
                      backgroundColor: isCurrent ? `${colors.accent}30` : 'transparent',
                      color: isCurrent ? colors.accent : colors.text,
                    }}
                  >
                    {sentence}{' '}
                  </Text>
                );
              })}
            </Text>
          )}
        </ScrollView>

        {/* Action Button */}
        {ttsAvailable && (
          <Pressable
            style={[styles.ttsFloatingBtn, { backgroundColor: colors.accent }]}
            onPress={toggleTTS}
            onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowTTSSettings(true); }}
            delayLongPress={400}
          >
            <Ionicons name={ttsActive ? "pause" : "volume-high"} size={22} color="#fff" />
          </Pressable>
        )}
      </View>

      {/* Status Reading Block Overlay */}
      {ttsActive && (
        <View style={[styles.ttsSentenceBox, { backgroundColor: colors.accent + '12', borderColor: colors.accent + '40' }]}>
          <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.accent} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.ttsSentenceLabel, { color: colors.accent }]}>now reading</Text>
            <Text style={[styles.ttsSentenceText, { color: colors.text }]} numberOfLines={2} ellipsizeMode="tail">
              {currentSentence ?? "Starting…"}
            </Text>
          </View>
        </View>
      )}

      {/* Bottom Layout Progress Lines */}
      <View style={[styles.progressBarContainer, { backgroundColor: colors.border }]}>
        <View style={[styles.progressBar, { backgroundColor: colors.accent, width: `${readingProgress}%` }]} />
      </View>

      {/* Chapter Action Navigation */}
      <View style={[styles.bottomNav, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: bottomPad + 8 }]}>
        <Pressable style={[styles.navChBtn, { backgroundColor: chapterIndex === 0 ? colors.border : colors.card, borderColor: colors.border }]} onPress={() => goChapter(-1)} disabled={chapterIndex === 0}>
          <Ionicons name="chevron-back" size={18} color={chapterIndex === 0 ? colors.textMuted : colors.text} />
          <Text style={[styles.navChText, { color: chapterIndex === 0 ? colors.textMuted : colors.text }]}>Prev</Text>
        </Pressable>
        <Pressable style={[styles.tocButton, { borderColor: colors.border }]} onPress={() => setShowTOC(true)}>
          <Text style={[styles.tocButtonText, { color: colors.text }]}>{chapterIndex + 1} / {novel.chapters.length}</Text>
        </Pressable>
        <Pressable style={[styles.navChBtn, { backgroundColor: chapterIndex === (novel.chapters.length - 1) ? colors.border : colors.accent, borderColor: chapterIndex === (novel.chapters.length - 1) ? colors.border : colors.accent }]} onPress={() => goChapter(1)} disabled={chapterIndex === (novel.chapters.length - 1)}>
          <Text style={[styles.navChText, { color: chapterIndex === (novel.chapters.length - 1) ? colors.textMuted : "#fff" }]}>Next</Text>
          <Ionicons name="chevron-forward" size={18} color={chapterIndex === (novel.chapters.length - 1) ? colors.textMuted : "#fff"} />
        </Pressable>
      </View>

      {/* TOC Panel */}
      <Modal visible={showTOC} animationType="slide" transparent onRequestClose={() => setShowTOC(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Table of Contents</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable onPress={toggleSortOrder} style={[styles.sortBtn, { borderColor: colors.border }]}>
                  <Ionicons name={sortOrder === "ascending" ? "arrow-up" : "arrow-down"} size={18} color={colors.accent} />
                  <Text style={[styles.sortBtnText, { color: colors.accent }]}>{sortOrder === "ascending" ? "Asc" : "Desc"}</Text>
                </Pressable>
                <Pressable onPress={() => setShowTOC(false)} style={styles.modalCloseBtn}><Ionicons name="close" size={24} color={colors.text} /></Pressable>
              </View>
            </View>
            <ScrollView style={styles.modalScrollView}>
              {sortedChapters.map((ch, idx) => {
                const originalIndex = novel.chapters.findIndex(c => c.url === ch.url);
                const isCurrent = chapterIndex === originalIndex;
                return (
                  <Pressable key={ch.url || idx} style={[styles.tocItem, isCurrent && [styles.tocItemActive, { backgroundColor: colors.accent + '20' }]]} onPress={() => { const originalIndex = novel?.chapters.findIndex(c => c.url === sortedChapters[idx].url) ?? 0; if (novel && chapter) saveReadingProgress(novel.id, chapterIndex, chapter.title, scrollYRef.current); scrollYRef.current = 0; hasRestoredScrollRef.current = false; forceTopRef.current = true; setChapterIndex(originalIndex); setShowTOC(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
                    <View style={styles.tocItemContent}>
                      <Text style={[styles.tocChapterNum, { color: isCurrent ? colors.accent : colors.textSecondary }]}>Chapter {originalIndex + 1}</Text>
                      <Text style={[styles.tocChapterTitle, { color: isCurrent ? colors.accent : colors.text }]}>{ch.title}</Text>
                    </View>
                    {isCurrent && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Bottom Voice Selector Modal */}
      <Modal visible={showTTSSettings} animationType="slide" transparent statusBarTranslucent onRequestClose={() => { Speech.stop(); setPreviewVoiceId(null); setShowTTSSettings(false); }}>
        <View style={styles.ttsModalOverlay}>
          <Pressable style={styles.ttsModalDismiss} onPress={() => { Speech.stop(); setPreviewVoiceId(null); setShowTTSSettings(false); }} />
          <View style={[styles.ttsModalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.ttsModalHandle, { backgroundColor: colors.border }]} />
            
            <View style={styles.modalHeadingRow}>
              <Text style={[styles.ttsModalTitle, { color: colors.text }]}>Voice Engine Selection</Text>
              <Pressable style={styles.reloadBtn} onPress={() => fetchSystemVoices(true)} disabled={isRefreshingVoices}>
                {isRefreshingVoices ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Ionicons name="refresh-outline" size={20} color={colors.accent} />
                )}
              </Pressable>
            </View>

            {ttsVoices.length > 0 ? (
              <View style={styles.ttsSettingRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 2 }}>
                  {ttsVoices.map((voice) => {
                    const isSelected = ttsVoiceId === voice.identifier;
                    const isPreviewing = previewVoiceId === voice.identifier;
                    return (
                      <View key={voice.identifier} style={[styles.chipContainer, { borderColor: isSelected ? colors.accent : colors.border, backgroundColor: isSelected ? `${colors.accent}10` : colors.card }]}>
                        <Pressable
                          style={styles.ttsVoiceChipContent}
                          onPress={() => {
                            setTtsVoiceId(voice.identifier);
                            ttsVoiceIdRef.current = voice.identifier;
                            saveSelectedVoice(voice.identifier);
                          }}
                        >
                          <Text style={[styles.ttsVoiceChipText, { color: colors.text }]} numberOfLines={1}>{voice.name ?? voice.identifier}</Text>
                          <Text style={[styles.ttsVoiceChipLang, { color: colors.textSecondary }]}>{voice.language}</Text>
                        </Pressable>
                        <Pressable 
                          style={[styles.previewBadge, { backgroundColor: isPreviewing ? colors.accent : colors.border }]} 
                          onPress={() => toggleVoicePreview(voice.identifier)}
                        >
                          <Ionicons name={isPreviewing ? "square" : "play"} size={10} color={isPreviewing ? "#fff" : colors.text} />
                        </Pressable>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            ) : (
              <Text style={{ color: colors.textSecondary, textAlign: 'center', marginVertical: 20 }}>No native system voice engines detected.</Text>
            )}

            <Pressable style={[styles.ttsTestBtn, { backgroundColor: colors.accent }]} onPress={() => { Speech.stop(); setPreviewVoiceId(null); setShowTTSSettings(false); }}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>Save Configuration</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 4, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  navBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  chapterTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, flex: 1, textAlign: "center" },
  progressBarContainer: { height: 3, width: '100%', overflow: 'hidden' },
  progressBar: { height: '100%', width: '0%' },
  controls: { paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  controlRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  controlLabel: { fontFamily: "Inter_500Medium", fontSize: 13, width: 80 },
  controlBtns: { flexDirection: "row", alignItems: "center", gap: 12 },
  controlBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 8, borderWidth: 1 },
  controlBtnText: { fontFamily: "Inter_700Bold" },
  controlValue: { fontFamily: "Inter_500Medium", fontSize: 13, width: 40, textAlign: "center" },
  scrollWrapper: { flex: 1, position: 'relative' },
  scrollArea: { flex: 1 },
  textContainer: { paddingHorizontal: 22, paddingTop: 20 },
  chapterHeader: { fontFamily: "Inter_700Bold", fontSize: 18, marginBottom: 20, lineHeight: 26 },
  content: { fontFamily: "Inter_400Regular" },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  ttsFloatingBtn: { position: 'absolute', bottom: 20, right: 18, width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  ttsSentenceBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: 14, marginBottom: 20, borderRadius: 10, borderWidth: 2, paddingHorizontal: 12, paddingVertical: 8 },
  ttsSentenceLabel: { fontFamily: "Inter_600SemiBold", fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  ttsSentenceText: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 },
  bottomNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 12 },
  navChBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  navChText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  tocButton: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, minWidth: 70, alignItems: "center" },
  tocButtonText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%', minHeight: '50%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e0e0e0' },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 18 },
  modalCloseBtn: { padding: 4 },
  modalScrollView: { paddingHorizontal: 20, paddingVertical: 12 },
  tocItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e0e0e0' },
  tocItemActive: { borderRadius: 8 },
  tocItemContent: { flex: 1 },
  tocChapterNum: { fontFamily: "Inter_400Regular", fontSize: 12, marginBottom: 4 },
  tocChapterTitle: { fontFamily: "Inter_500Medium", fontSize: 14 },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  sortBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  ttsModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  ttsModalDismiss: { flex: 1 },
  ttsModalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12, marginBottom: 11 },
  ttsModalHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20, position: 'relative' },
  ttsModalTitle: { fontFamily: "Inter_700Bold", fontSize: 17, textAlign: 'center' },
  reloadBtn: { position: 'absolute', right: 4, padding: 4 },
  ttsSettingRow: { marginBottom: 20, minHeight: 62 },
  chipContainer: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingLeft: 12, paddingRight: 8, paddingVertical: 8, minWidth: 125, maxWidth: 160 },
  ttsVoiceChipContent: { flex: 1, marginRight: 6 },
  ttsVoiceChipText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  ttsVoiceChipLang: { fontFamily: "Inter_400Regular", fontSize: 10, marginTop: 2 },
  previewBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  ttsTestBtn: { height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 4 }
});
