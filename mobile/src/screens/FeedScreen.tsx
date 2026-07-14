import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  useColorScheme,
  ListRenderItemInfo,
  Animated,
  Pressable,
  AccessibilityInfo,
} from 'react-native';

import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { API_BASE_URL, DEBOUNCE_MS } from '../config';
import { Theme, LIGHT_THEME, DARK_THEME } from '../theme';
import ComposeModal from './ComposeModal';
import PostDetailModal from './PostDetailModal';

// ─── Types ────────────────────────────────────────────────────────────────────

type Post = {
  id: number;
  user_id: number;
  body: string;
  image_url: string | null;
  created_at: string;
  authenticity_score: number;
  score?: number;
  similarity?: number;
};

type FeedMode = 'discover' | 'connections';

type FeedResponse = {
  data: Post[];
  meta: { page: number; per_page: number; has_more: boolean };
};

type SearchResponse = {
  data: Post[];
};

// ─── Time-ago helper ──────────────────────────────────────────────────────────

function timeAgo(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// ─── API helper ───────────────────────────────────────────────────────────────

interface ApiError {
  status: number;
  message: string;
}

async function apiFetch<T>(
  path: string,
  authToken: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const error: ApiError = { status: res.status, message: body || res.statusText };
    throw error;
  }

  return res.json() as Promise<T>;
}

// ─── Shimmer animation ────────────────────────────────────────────────────────

function useShimmerAnimation(): Animated.Value {
  const anim = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, reduceMotion]);

  return anim;
}

function ShimmerBar({ anim, style }: { anim: Animated.Value; style?: object }) {
  const opacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 0.8],
  });
  return <Animated.View style={[{ opacity }, style]} />;
}

function SkeletonCard({ theme }: { theme: Theme }) {
  const anim = useShimmerAnimation();
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.cardShadow }]}>
      <View style={styles.cardHeader}>
        <ShimmerBar anim={anim} style={[styles.avatar, { backgroundColor: theme.skeleton }]} />
        <ShimmerBar anim={anim} style={[styles.skeletonText, { backgroundColor: theme.skeleton, width: 100 }]} />
      </View>
      <ShimmerBar anim={anim} style={[styles.skeletonText, { backgroundColor: theme.skeleton, width: '100%', marginTop: 10 }]} />
      <ShimmerBar anim={anim} style={[styles.skeletonText, { backgroundColor: theme.skeleton, width: '70%', marginTop: 6 }]} />
      <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
        <ShimmerBar anim={anim} style={[styles.skeletonButton, { backgroundColor: theme.skeleton, width: 70 }]} />
        <ShimmerBar anim={anim} style={[styles.skeletonText, { backgroundColor: theme.skeleton, width: 50 }]} />
      </View>
    </View>
  );
}

// ─── Post card ────────────────────────────────────────────────────────────────

interface PostCardProps {
  post: Post;
  onReact: (postId: number, type: string) => void;
  onComment: (post: Post) => void;
  theme: Theme;
}

function authenticityBadge(score: number): { label: string; bg: string } {
  if (score >= 0.7) return { label: 'Verified', bg: '#2E7D32' };
  if (score >= 0.5) return { label: 'Likely Authentic', bg: '#E65100' };
  return { label: 'Low Signal', bg: '#9E9E9E' };
}

const AVATAR_COLORS = [
  '#E4572E', '#2E7D32', '#1565C0', '#6A1B9A',
  '#00838F', '#F57C00', '#D81B60', '#283593',
];

type ReactionType = 'heart' | 'star' | 'fire';
const REACTIONS: { type: ReactionType; icon: string; symbol: string }[] = [
  { type: 'heart', icon: '❤️', symbol: 'heart.fill' },
  { type: 'star', icon: '⭐', symbol: 'star.fill' },
  { type: 'fire', icon: '🔥', symbol: 'flame.fill' },
];

function PostCard({ post, onReact, onComment, theme }: PostCardProps) {
  const [reacted, setReacted] = useState<ReactionType | null>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const initials = `U${post.user_id}`.slice(0, 2).toUpperCase();
  const badge = authenticityBadge(post.authenticity_score);
  const avatarColor = AVATAR_COLORS[post.user_id % AVATAR_COLORS.length];

  const handleReact = useCallback((type: ReactionType) => {
    if (reacted) return;
    setReacted(type);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onReact(post.id, type);
  }, [post.id, onReact, reacted]);

  const onPressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      stiffness: 300,
      damping: 30,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const onPressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      stiffness: 300,
      damping: 30,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  return (
    <Pressable onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.cardShadow, transform: [{ scale: scaleAnim }] }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.headerTextGroup}>
            <Text style={[styles.username, { color: theme.textPrimary }]}>User #{post.user_id}</Text>
            <View style={[styles.badge, { backgroundColor: badge.bg }]}>
              <Text style={styles.badgeText}>{badge.label}</Text>
            </View>
          </View>
        </View>
        <Text selectable style={[styles.body, { color: theme.textPrimary }]}>{post.body}</Text>
        <View style={[styles.reactionRow, { borderTopColor: theme.border }]}>
          <View style={styles.reactionIcons}>
            {REACTIONS.map(({ type, icon, symbol }) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.reactionIcon,
                  reacted === type && { backgroundColor: theme.brandLight },
                ]}
                onPress={() => handleReact(type)}
                activeOpacity={0.6}
                disabled={reacted !== null}
              >
                <SymbolView
                  name={symbol as any}
                  size={22}
                  tintColor={reacted === type ? theme.brand : theme.textSecondary}
                  fallback={<Text style={[styles.reactionEmoji, reacted === type && styles.reactionEmojiActive]}>{icon}</Text>}
                />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.reactionIcon}
              onPress={() => onComment(post)}
              activeOpacity={0.6}
            >
              <SymbolView
                name="message.fill"
                size={22}
                tintColor={theme.textSecondary}
                fallback={<Text style={styles.reactionEmoji}>💬</Text>}
              />
            </TouchableOpacity>
          </View>
          <Text style={[styles.timestamp, { color: theme.textTertiary }]}>{timeAgo(post.created_at)}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── Animated post card with entrance stagger ──────────────────────────────

const AnimatedPostCard = React.memo(function AnimatedPostCard({
  post, onReact, onComment, theme, index,
}: PostCardProps & { index: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const reduceMotion = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { reduceMotion.current = v; });
  }, []);

  useEffect(() => {
    if (reduceMotion.current) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }
    opacity.setValue(0);
    translateY.setValue(20);
    Animated.spring(opacity, {
      toValue: 1,
      stiffness: 150,
      damping: 20,
      useNativeDriver: true,
      delay: index * 40,
    }).start();
    Animated.spring(translateY, {
      toValue: 0,
      stiffness: 150,
      damping: 20,
      useNativeDriver: true,
      delay: index * 40,
    }).start();
  }, [post.id, index, opacity, translateY]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <PostCard post={post} onReact={onReact} onComment={onComment} theme={theme} />
    </Animated.View>
  );
});

// ─── Feed screen ──────────────────────────────────────────────────────────────

export default function FeedScreen({ authToken }: { authToken: string }): React.JSX.Element {
  const [posts, setPosts] = useState<Post[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showComposer, setShowComposer] = useState(false);
  const [manualDark, setManualDark] = useState(false);
  const [feedMode, setFeedMode] = useState<FeedMode>('discover');

  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<Post[] | null>(null);
  const [searching, setSearching] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayedPosts = searchResults ?? posts;
  const isEmpty = !loading && !error && displayedPosts.length === 0;
  const showSkeleton = loading && posts.length === 0;

  // ── Fetch feed ──────────────────────────────────────────────────────────────

  const fetchFeed = useCallback(
    async (targetPage: number, append: boolean) => {
      setError(null);
      if (append) setLoadingMore(true);

      try {
        const path = feedMode === 'connections' ? '/real-connections/feed' : '/feed';
        const response = await apiFetch<FeedResponse>(`${path}?page=${targetPage}`, authToken);
        setPosts((prev) => (append ? [...prev, ...response.data] : response.data));
        setHasMore(response.meta.has_more);
        setPage(targetPage);
      } catch (e: unknown) {
        const err = e as ApiError;
        setError(err.message || 'Something went wrong');
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [authToken, feedMode],
  );

  // ── Initial load ────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchFeed(1, false);
  }, [fetchFeed]);

  // ── Pull-to-refresh ─────────────────────────────────────────────────────────

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setSearchText('');
    setSearchResults(null);
    fetchFeed(1, false);
  }, [fetchFeed]);

  // ── Infinite scroll ─────────────────────────────────────────────────────────

  const onEndReached = useCallback(() => {
    if (loadingMore || !hasMore) return;
    if (searchResults !== null) return;
    fetchFeed(page + 1, true);
  }, [loadingMore, hasMore, page, searchResults, fetchFeed]);

  // ── Search ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const q = searchText.trim();
    if (!q) {
      setSearchResults(null);
      setSearching(false);
      return;
    }

    setSearching(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const response = await apiFetch<SearchResponse>(`/search?q=${encodeURIComponent(q)}`, authToken);
        setSearchResults(response.data);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchText, authToken]);

  // ── Reactions & detail ──────────────────────────────────────────────────────

  const [detailPost, setDetailPost] = useState<Post | null>(null);

  const handleReact = useCallback(
    async (postId: number, type: string) => {
      try {
        await apiFetch<unknown>('/interactions', authToken, {
          method: 'POST',
          body: JSON.stringify({ post_id: postId, type }),
        });
      } catch {
        // silently fail
      }
    },
    [authToken],
  );

  const handleOpenDetail = useCallback((post: Post) => {
    setDetailPost(post);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailPost(null);
  }, []);

  // ── Auto-track views ────────────────────────────────────────────────────────

  const trackedViews = useRef<Set<number>>(new Set());

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: { isViewable: boolean; item: Post }[] }) => {
      viewableItems.forEach(({ isViewable, item }) => {
        if (isViewable && !trackedViews.current.has(item.id)) {
          trackedViews.current.add(item.id);
          apiFetch<unknown>('/interactions', authToken, {
            method: 'POST',
            body: JSON.stringify({ post_id: item.id, type: 'view' }),
          }).catch(() => { });
        }
      });
    },
    [authToken],
  );

  const viewabilityConfig = useMemo(() => ({
    viewAreaCoveragePercentThreshold: 50,
  }), []);

  // ── Compose modal ────────────────────────────────────────────────────────────

  const handlePublished = useCallback(() => {
    setShowComposer(false);
    fetchFeed(1, false);
  }, [fetchFeed]);

  const handleDismiss = useCallback(() => {
    setShowComposer(false);
  }, []);

  // ── Render helpers ──────────────────────────────────────────────────────────

  const colorScheme = useColorScheme();
  const isDark = manualDark || colorScheme === 'dark';
  const theme = useMemo(() => (isDark ? DARK_THEME : LIGHT_THEME), [isDark]);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Post>) => (
      <AnimatedPostCard post={item} onReact={handleReact} onComment={handleOpenDetail} theme={theme} index={index} />
    ),
    [handleReact, handleOpenDetail, theme],
  );

  const keyExtractor = useCallback((item: Post) => String(item.id), []);

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={theme.brand} />
      </View>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {/* Search bar */}
      <View style={[styles.searchContainer, { backgroundColor: theme.searchBg }]}>
        <Text style={[styles.searchIcon, { color: theme.textTertiary }]}>🔍</Text>
        <TextInput
          style={[styles.searchInput, { color: theme.textPrimary }]}
          placeholder="Search posts…"
          placeholderTextColor={theme.textTertiary}
          value={searchText}
          onChangeText={setSearchText}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searching && (
          <ActivityIndicator
            style={styles.searchSpinner}
            size="small"
            color={theme.brand}
          />
        )}
        <TouchableOpacity
          style={styles.themeToggle}
          onPress={() => setManualDark(prev => !prev)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.themeToggleText, { color: theme.textSecondary }]}>
            {isDark ? '☀️' : '🌙'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Feed mode tabs */}
      <View style={[styles.modeTabs, { borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.modeTab, feedMode === 'discover' && { borderBottomColor: theme.brand }]}
          onPress={() => setFeedMode('discover')}
        >
          <Text style={[styles.modeTabText, { color: feedMode === 'discover' ? theme.brand : theme.textTertiary }]}>
            Discover
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeTab, feedMode === 'connections' && { borderBottomColor: theme.brand }]}
          onPress={() => setFeedMode('connections')}
        >
          <Text style={[styles.modeTabText, { color: feedMode === 'connections' ? theme.brand : theme.textTertiary }]}>
            Real Connections
          </Text>
        </TouchableOpacity>
      </View>

      {/* Skeleton loaders */}
      {showSkeleton && (
        <View style={styles.skeletonContainer}>
          <SkeletonCard theme={theme} />
          <SkeletonCard theme={theme} />
          <SkeletonCard theme={theme} />
        </View>
      )}

      {/* Error state */}
      {!showSkeleton && error !== null && posts.length === 0 && (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: theme.brand }]}>{error}</Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: theme.brand }]}
            onPress={() => {
              setLoading(true);
              fetchFeed(1, false);
            }}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Empty state */}
      {isEmpty && (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
            {searchResults !== null ? 'No posts match that search' : 'No posts yet'}
          </Text>
        </View>
      )}

      {/* Feed list */}
      {!showSkeleton && !isEmpty && (
        <FlatList
          data={displayedPosts}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.brand}
              colors={[theme.brand]}
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* FAB */}
      <FABButton theme={theme} onPress={() => setShowComposer(true)} />

      {/* Compose modal */}
      <ComposeModal
        visible={showComposer}
        onDismiss={handleDismiss}
        onPublished={handlePublished}
        authToken={authToken}
        theme={theme}
      />

      {/* Post detail modal */}
      <PostDetailModal
        visible={detailPost !== null}
        post={detailPost}
        onDismiss={handleCloseDetail}
        authToken={authToken}
        theme={theme}
      />
    </View>
  );
}

// ─── Animated FAB ─────────────────────────────────────────────────────────────

function FABButton({ theme, onPress }: { theme: Theme; onPress: () => void }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const mountAnim = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      mountAnim.setValue(1);
      return;
    }
    Animated.spring(mountAnim, {
      toValue: 1,
      stiffness: 100,
      damping: 12,
      useNativeDriver: true,
    }).start();
  }, [mountAnim, reduceMotion]);

  const onPressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.9,
      stiffness: 300,
      damping: 30,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const onPressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      stiffness: 300,
      damping: 30,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  return (
    <Animated.View style={{
      position: 'absolute', bottom: 24, right: 24, zIndex: 10,
      transform: [{ scale: Animated.multiply(mountAnim, scaleAnim) }],
      opacity: mountAnim,
    }}>
      <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
        <View style={[styles.fab, { backgroundColor: theme.brand }]}>
          <Text style={styles.fabText}>+</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Static layout styles (theme colors applied inline) ────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 40,
    marginBottom: 4,
    paddingHorizontal: 12,
    borderRadius: 10,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
    fontSize: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  searchSpinner: {
    marginLeft: 8,
  },
  themeToggle: {
    marginLeft: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeToggleText: {
    fontSize: 18,
  },
  modeTabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 4,
    borderBottomWidth: 1,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  modeTabText: {
    fontSize: 15,
    fontWeight: '600',
  },
  skeletonContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    borderCurve: 'continuous',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  headerTextGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    flexShrink: 1,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginLeft: 8,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  reactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  reactionIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionEmoji: {
    fontSize: 20,
    opacity: 0.7,
  },
  reactionEmojiActive: {
    opacity: 1,
  },
  reactButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    minWidth: 100,
    alignItems: 'center',
  },
  reactButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  timestamp: {
    fontSize: 13,
  },
  skeletonText: {
    height: 12,
    borderRadius: 6,
  },
  skeletonButton: {
    height: 36,
    borderRadius: 18,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 24,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    zIndex: 10,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '400',
    lineHeight: 30,
  },
});
