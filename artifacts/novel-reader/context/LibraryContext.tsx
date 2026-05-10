// Library.tsx
import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Alert,
  Modal,
} from 'react-native';
import { useLibrary, type Novel, type NovelStatus } from '../context/LibraryContext';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

// Helper to format date
const formatDate = (timestamp?: number): string => {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
};

// Progress indicator component
const ProgressBar = ({ current, total }: { current: number; total: number }) => {
  const percentage = total > 0 ? (current / total) * 100 : 0;
  
  return (
    <View className="w-full">
      <View className="flex-row justify-between mb-1">
        <Text className="text-xs text-gray-400">
          Ch. {current}/{total || '?'}
        </Text>
        <Text className="text-xs text-purple-400">Continue Reading</Text>
      </View>
      <View className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
        <View 
          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
          style={{ width: `${percentage}%` }}
        />
      </View>
    </View>
  );
};

// Novel Card Component
const NovelCard = ({ 
  novel, 
  onPress, 
  onLongPress,
  onStatusChange,
  isSelected,
  isSelectionMode,
}: { 
  novel: Novel; 
  onPress: () => void; 
  onLongPress: () => void;
  onStatusChange?: (status: NovelStatus) => void;
  isSelected?: boolean;
  isSelectionMode?: boolean;
}) => {
  const totalChapters = novel.totalChapters || novel.chapters?.length || 0;
  const currentChapter = novel.lastReadChapterNumber || 
    (novel.lastRead?.chapterIndex !== undefined ? novel.lastRead.chapterIndex + 1 : 0);
  
  const sourceName = novel.sourceDisplayName || 'Unknown';
  
  // Get status badge config
  const getStatusConfig = (status: NovelStatus) => {
    switch (status) {
      case 'completed':
        return { label: 'Completed', color: '#10b981', bg: 'rgba(16, 185, 129, 0.2)' };
      case 'reading':
        return { label: 'Reading', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.2)' };
      default:
        return { label: 'Unread', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.2)' };
    }
  };
  
  const statusConfig = getStatusConfig(novel.status);

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
      className={`mb-4 mx-4 rounded-xl overflow-hidden bg-white/5 border ${
        isSelected ? 'border-purple-500 bg-purple-500/10' : 'border-white/10'
      }`}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)']}
        className="absolute inset-0"
        pointerEvents="none"
      />
      
      <View className="p-4">
        {/* Selection indicator */}
        {isSelectionMode && (
          <View className="absolute top-2 right-2 z-10">
            <View className={`w-5 h-5 rounded-full border-2 ${isSelected ? 'bg-purple-500 border-purple-500' : 'border-white/50'}`}>
              {isSelected && <Ionicons name="checkmark" size={14} color="white" style={{ marginLeft: 1 }} />}
            </View>
          </View>
        )}
        
        {/* Title Row with Status Badge */}
        <View className="flex-row justify-between items-start mb-2 pr-6">
          <Text className="flex-1 text-xl font-bold text-white mr-2" numberOfLines={2}>
            {novel.title}
          </Text>
          {!isSelectionMode && (
            <TouchableOpacity 
              onPress={() => onStatusChange?.(novel.status === 'completed' ? 'reading' : 'completed')}
              style={{ backgroundColor: statusConfig.bg }}
              className="px-2 py-1 rounded-full"
            >
              <Text style={{ color: statusConfig.color }} className="text-xs font-medium">
                {statusConfig.label}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        
        {/* Author and Source Row */}
        <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1 mb-3">
          <View className="flex-row items-center">
            <Ionicons name="person-outline" size={14} color="#a78bfa" />
            <Text className="text-purple-300 text-sm ml-1">{novel.author}</Text>
          </View>
          <View className="flex-row items-center">
            <Ionicons name="globe-outline" size={14} color="#6b7280" />
            <Text className="text-gray-400 text-xs ml-1">{sourceName}</Text>
          </View>
          {novel.lastReadDate && (
            <View className="flex-row items-center">
              <Ionicons name="time-outline" size={12} color="#6b7280" />
              <Text className="text-gray-500 text-xs ml-1">{formatDate(novel.lastReadDate)}</Text>
            </View>
          )}
        </View>
        
        {/* Synopsis Preview */}
        {novel.synopsis && (
          <Text className="text-gray-400 text-sm mb-3 line-clamp-2" numberOfLines={2}>
            {novel.synopsis.substring(0, 100)}...
          </Text>
        )}
        
        {/* Progress Section */}
        <ProgressBar current={currentChapter} total={totalChapters} />
        
        {/* Action Buttons */}
        {!isSelectionMode && (
          <View className="flex-row gap-3 mt-4">
            <TouchableOpacity
              onPress={onPress}
              className="flex-1 flex-row items-center justify-center py-2.5 bg-purple-600 rounded-lg"
            >
              <Ionicons name="book-outline" size={18} color="white" />
              <Text className="text-white font-medium ml-2">
                {currentChapter > 0 ? 'Continue Reading' : 'Start Reading'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  novel.title,
                  'What would you like to do?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { 
                      text: 'Mark as Read', 
                      onPress: () => onStatusChange?.('completed')
                    },
                    { 
                      text: 'Mark as Unread', 
                      onPress: () => onStatusChange?.('unread')
                    },
                    { text: 'Remove', style: 'destructive', onPress: () => {} },
                  ]
                );
              }}
              className="px-4 py-2.5 bg-white/10 rounded-lg"
            >
              <Ionicons name="ellipsis-horizontal" size={20} color="#9ca3af" />
            </TouchableOpacity>
          </View>
        )}
      </View>
      
      {/* Cover Thumbnail as background accent */}
      {novel.coverUrl && (
        <View className="absolute top-0 right-0 w-24 h-24 opacity-10">
          <Image 
            source={{ uri: novel.coverUrl }} 
            className="w-full h-full"
            resizeMode="cover"
          />
        </View>
      )}
    </TouchableOpacity>
  );
};

// Migration Progress Modal
const MigrationProgressModal = ({ 
  visible, 
  progress 
}: { 
  visible: boolean; 
  progress: { current: number; total: number; message: string } | null;
}) => {
  if (!visible || !progress) return null;
  
  const percentage = (progress.current / progress.total) * 100;
  
  return (
    <Modal transparent visible={visible} animationType="fade">
      <View className="flex-1 bg-black/80 items-center justify-center px-6">
        <View className="bg-slate-800 rounded-2xl p-6 w-full max-w-sm">
          <Text className="text-white text-lg font-bold text-center mb-2">
            Upgrading Library
          </Text>
          <Text className="text-gray-400 text-sm text-center mb-4">
            {progress.message}
          </Text>
          <View className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-2">
            <View 
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
              style={{ width: `${percentage}%` }}
            />
          </View>
          <Text className="text-gray-400 text-xs text-center">
            {progress.current} / {progress.total}
          </Text>
        </View>
      </View>
    </Modal>
  );
};

// Empty State Component
const EmptyLibrary = ({ onFindNovels }: { onFindNovels: () => void }) => (
  <View className="flex-1 items-center justify-center px-8">
    <View className="w-24 h-24 rounded-full bg-purple-500/20 items-center justify-center mb-6">
      <Ionicons name="library-outline" size={48} color="#a78bfa" />
    </View>
    <Text className="text-2xl font-bold text-white text-center mb-2">
      Your Library is Empty
    </Text>
    <Text className="text-gray-400 text-center mb-8">
      Start downloading novels to build your collection
    </Text>
    <TouchableOpacity
      onPress={onFindNovels}
      className="flex-row items-center px-6 py-3 bg-purple-600 rounded-xl"
    >
      <Ionicons name="search-outline" size={20} color="white" />
      <Text className="text-white font-medium ml-2">Find Novels to Download</Text>
    </TouchableOpacity>
  </View>
);

// Stats Header Component
const LibraryStats = ({ 
  novels, 
  filter, 
  onFilterChange,
  onSortToggle,
  sortOrder,
}: { 
  novels: Novel[]; 
  filter: string; 
  onFilterChange: (text: string) => void;
  onSortToggle: () => void;
  sortOrder: 'ascending' | 'descending';
}) => {
  const total = novels.length;
  const reading = novels.filter(n => n.status === 'reading').length;
  const completed = novels.filter(n => n.status === 'completed').length;
  
  return (
    <View className="px-4 pt-2 pb-4">
      <View className="flex-row justify-between items-center mb-4">
        <View>
          <Text className="text-2xl font-bold text-white">My Library</Text>
          <Text className="text-purple-300 text-sm">{total} novels</Text>
        </View>
        
        {/* Stats Chips */}
        <View className="flex-row gap-2">
          <TouchableOpacity onPress={onSortToggle} className="px-3 py-1.5 bg-white/10 rounded-full">
            <Ionicons 
              name={sortOrder === 'ascending' ? 'arrow-up' : 'arrow-down'} 
              size={14} 
              color="#a78bfa" 
            />
          </TouchableOpacity>
          <View className="px-3 py-1.5 bg-purple-500/20 rounded-full">
            <Text className="text-purple-300 text-xs">Reading: {reading}</Text>
          </View>
          <View className="px-3 py-1.5 bg-green-500/20 rounded-full">
            <Text className="text-green-300 text-xs">Completed: {completed}</Text>
          </View>
        </View>
      </View>
      
      {/* Search Bar */}
      <View className="flex-row items-center bg-white/10 rounded-xl px-3 py-2 border border-white/20">
        <Ionicons name="search-outline" size={20} color="#9ca3af" />
        <TextInput
          placeholder="Search by title or author..."
          placeholderTextColor="#9ca3af"
          value={filter}
          onChangeText={onFilterChange}
          className="flex-1 text-white ml-2 text-base"
        />
        {filter !== '' && (
          <TouchableOpacity onPress={() => onFilterChange('')}>
            <Ionicons name="close-circle" size={18} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// Main Library Component
export default function Library() {
  const { 
    novels, 
    loading, 
    refreshLibrary, 
    removeNovel, 
    updateNovel,
    sortOrder,
    toggleSortOrder,
    migrationProgress,
    initComplete,
  } = useLibrary();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedNovels, setSelectedNovels] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showMigrationModal, setShowMigrationModal] = useState(true);

  // Filter novels based on search
  const filteredNovels = useMemo(() => {
    let filtered = novels;
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (novel) =>
          novel.title.toLowerCase().includes(query) ||
          novel.author.toLowerCase().includes(query)
      );
    }
    
    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      if (sortOrder === 'ascending') {
        return a.title.localeCompare(b.title);
      } else {
        return b.title.localeCompare(a.title);
      }
      return [...prev, step];
    });
    
    return sorted;
  }, [novels, searchQuery, sortOrder]);

  // Group novels by status for non-search view
  const groupedNovels = useMemo(() => {
    if (searchQuery) return null;
    
    const reading = filteredNovels.filter(n => n.status === 'reading');
    const unread = filteredNovels.filter(n => n.status === 'unread');
    const completed = filteredNovels.filter(n => n.status === 'completed');
    
    return { reading, unread, completed };
  }, [filteredNovels, searchQuery]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshLibrary();
    setRefreshing(false);
  };

  const handleNovelPress = (novel: Novel) => {
    if (isSelectionMode) {
      toggleSelection(novel.id);
    } else {
      router.push({
        pathname: '/reader',
        params: { 
          novelId: novel.id,
          chapterIndex: novel.lastRead?.chapterIndex ?? 0,
        }
      });
    }
  };

  const handleNovelLongPress = (novelId: string) => {
    setIsSelectionMode(true);
    toggleSelection(novelId);
  };

  const toggleSelection = (novelId: string) => {
    setSelectedNovels(prev => {
      const next = new Set(prev);
      if (next.has(novelId)) {
        next.delete(novelId);
        if (next.size === 0) setIsSelectionMode(false);
      } else {
        next.add(novelId);
      }
      return next;
    });
  };

  const handleStatusChange = async (novelId: string, status: NovelStatus) => {
    await updateNovel(novelId, { status });
  };

  const handleBulkDelete = async () => {
    Alert.alert(
      'Delete Novels',
      `Are you sure you want to delete ${selectedNovels.size} novel${selectedNovels.size > 1 ? 's' : ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            for (const id of selectedNovels) {
              await removeNovel(id);
            }
            setSelectedNovels(new Set());
            setIsSelectionMode(false);
          }
        }
      ]
    );
  };

  const handleBulkStatusChange = async (status: NovelStatus) => {
    for (const id of selectedNovels) {
      await updateNovel(id, { status });
    }
    setSelectedNovels(new Set());
    setIsSelectionMode(false);
  };

  const renderSection = (title: string, data: Novel[], iconName: string) => {
    if (data.length === 0) return null;
    
    return (
      <View key={title} className="mb-6">
        <View className="flex-row items-center px-4 mb-3">
          <Ionicons name={iconName as any} size={20} color="#a78bfa" />
          <Text className="text-white text-lg font-semibold ml-2">{title}</Text>
          <Text className="text-gray-400 text-sm ml-2">({data.length})</Text>
        </View>
        {data.map(novel => (
          <NovelCard
            key={novel.id}
            novel={novel}
            onPress={() => handleNovelPress(novel)}
            onLongPress={() => handleNovelLongPress(novel.id)}
            onStatusChange={(status) => handleStatusChange(novel.id, status)}
            isSelected={selectedNovels.has(novel.id)}
            isSelectionMode={isSelectionMode}
          />
        ))}
      </View>
    );
  };

  // Show migration modal during upgrade
  if (migrationProgress && showMigrationModal) {
    return (
      <MigrationProgressModal 
        visible={!!migrationProgress} 
        progress={migrationProgress} 
      />
    );
  }

  if (loading && novels.length === 0) {
    return (
      <View className="flex-1 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 items-center justify-center">
        <ActivityIndicator size="large" color="#a78bfa" />
        <Text className="text-white mt-4">Loading your library...</Text>
      </View>
    );
  }

  const saveChapterContent = useCallback(async (
    novelId: string,
    chapterIndex: number,
    title: string,
    url: string,
    content: string,
    chapterNumber?: number
  ) => {
    await saveChapterToFile(novelId, chapterIndex, { title, url, content, chapterNumber });
    setNovels(current => {
      const idx = current.findIndex(n => n.id === novelId);
      if (idx === -1) return current;
      const novel = { ...current[idx] };
      const newChapter = { title, url, chapterNumber };
      if (chapterIndex >= novel.chapters.length) {
        novel.chapters = [...novel.chapters, newChapter];
      } else {
        const chapters = [...novel.chapters];
        chapters[chapterIndex] = { ...chapters[chapterIndex], ...newChapter };
        novel.chapters = chapters;
      }
      const updated = [...current];
      updated[idx] = novel;
      saveLibraryToFile(updated);
      return updated;
    });
  }, []);

  const loadChapterContent = useCallback(async (novelId: string, chapterIndex: number) => {
    return await loadChapterFromFile(novelId, chapterIndex);
  }, []);

  // ── Refresh library from disk ────────────────────────────────────────────

  const refreshLibrary = useCallback(async () => {
    try {
      const { novels: refreshed, sortOrder: order } = await loadNovelsFromDisk();
      setSortOrder(order);
      setNovels(refreshed);
    } catch (error) {
      console.error('[Library] Refresh failed:', error);
    }
  }, []);

  return (
    <View className="flex-1 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Selection Mode Header */}
      {isSelectionMode && (
        <View className="flex-row items-center justify-between px-4 py-3 bg-purple-800/50 border-b border-purple-500/30">
          <TouchableOpacity onPress={() => {
            setSelectedNovels(new Set());
            setIsSelectionMode(false);
          }}>
            <Ionicons name="close" size={24} color="white" />
          </TouchableOpacity>
          <Text className="text-white font-semibold">
            {selectedNovels.size} selected
          </Text>
          <View className="flex-row gap-4">
            <TouchableOpacity onPress={() => handleBulkStatusChange('completed')}>
              <Ionicons name="checkmark-done" size={22} color="#a78bfa" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleBulkStatusChange('unread')}>
              <Ionicons name="refresh-outline" size={22} color="#fbbf24" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleBulkDelete}>
              <Ionicons name="trash-outline" size={22} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Library Stats & Search */}
      <LibraryStats 
        novels={filteredNovels} 
        filter={searchQuery} 
        onFilterChange={setSearchQuery}
        onSortToggle={toggleSortOrder}
        sortOrder={sortOrder}
      />

      {/* Novel List */}
      {filteredNovels.length === 0 ? (
        <EmptyLibrary onFindNovels={() => router.push('/search')} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#a78bfa" />
          }
        >
          {groupedNovels ? (
            <>
              {renderSection('📖 Currently Reading', groupedNovels.reading, 'book-outline')}
              {renderSection('✨ Unread', groupedNovels.unread, 'sparkles-outline')}
              {renderSection('🏆 Completed', groupedNovels.completed, 'trophy-outline')}
            </>
          ) : (
            <View className="mb-6">
              {filteredNovels.map(novel => (
                <NovelCard
                  key={novel.id}
                  novel={novel}
                  onPress={() => handleNovelPress(novel)}
                  onLongPress={() => handleNovelLongPress(novel.id)}
                  onStatusChange={(status) => handleStatusChange(novel.id, status)}
                  isSelected={selectedNovels.has(novel.id)}
                  isSelectionMode={isSelectionMode}
                />
              ))}
            </View>
          )}
          <View className="h-8" />
        </ScrollView>
      )}
    </View>
  );
}
