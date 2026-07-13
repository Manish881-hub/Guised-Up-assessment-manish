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
} from 'react-native';

import { API_BASE_URL, DEBOUNCE_MS } from '../config';
import ComposeModal from './ComposeModal';

// ─── Theme types ──────────────────────────────────────────────────────────────

interface Theme {
  bg: string;
  surface: string;
  brand: string;
  brandLight: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  success: string;
  warning: string;
  neutral: string;
  skeleton: string;
  cardShadow: string;
}

const LIGHT_THEME: Theme = {
  bg: '#F5F4F0',
  surface: '#FFFFFF',
  brand: '#E4572E',
  brandLight: '#FDE8E0',
  textPrimary: '#1C1C1E',
  textSecondary: '#636366',
  textTertiary: '#AEAEB2',
  border: '#E5E3DE',
  success: '#2E7D32',
  warning: '#E65100',
  neutral: '#9E9E9E',
  skeleton: '#E5E3DE',
  cardShadow: '0 1px 3px rgba(0,0,0,0.04)',
};

const DARK_THEME: Theme = {
  bg: '#1C1C1E',
  surface: '#2C2C2E',
  brand: '#E4572E',
  brandLight: '#3A1A10',
  textPrimary: '#F5F5F7',
  textSecondary: '#AEAEB2',
  textTertiary: '#636366',
  border: '#38383A',
  success: '#2E7D32',
  warning: '#E65100',
  neutral: '#9E9E9E',
  skeleton: '#38383A',
  cardShadow: '0 1px 3px rgba(0,0,0,0.2)',
};

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

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard({ theme }: { theme: Theme }) {
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.cardShadow }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { backgroundColor: theme.skeleton }]} />
        <View style={[styles.skeletonText, { backgroundColor: theme.skeleton, width: 100 }]} />
      </View>
      <View style={[styles.skeletonText, { backgroundColor: theme.skeleton, width: '100%', marginTop: 10 }]} />
      <View style={[styles.skeletonText, { backgroundColor: theme.skeleton, width: '70%', marginTop: 6 }]} />
      <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
        <View style={[styles.skeletonButton, { backgroundColor: theme.skeleton, width: 70 }]} />
        <View style={[styles.skeletonText, { backgroundColor: theme.skeleton, width: 50 }]} />
      </View>
    </View>
  );
}

// ─── Post card ────────────────────────────────────────────────────────────────

interface PostCardProps {
  post: Post;
  onReact: (postId: number) => void;
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

function PostCard({ post, onReact, theme }: PostCardProps) {
  const [reacted, setReacted] = useState(false);
  const initials = `U${post.user_id}`.slice(0, 2).toUpperCase();
  const badge = authenticityBadge(post.authenticity_score);
  const avatarColor = AVATAR_COLORS[post.user_id % AVATAR_COLORS.length];

  const handlePress = useCallback(() => {
    setReacted(true);
    onReact(post.id);
  }, [post.id, onReact]);

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, boxShadow: theme.cardShadow }]}>
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
      <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.reactButton, { backgroundColor: reacted ? theme.success : theme.brand }]}
          onPress={handlePress}
          activeOpacity={0.7}
          disabled={reacted}
        >
          <Text style={styles.reactButtonText}>
            {reacted ? 'Reacted ✓' : 'React'}
          </Text>
        </TouchableOpacity>
        <Text style={[styles.timestamp, { color: theme.textTertiary }]}>{timeAgo(post.created_at)}</Text>
      </View>
    </View>
  );
}

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
        const response = await apiFetch<FeedResponse>(`/feed?page=${targetPage}`, authToken);
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
    [authToken],
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

  // ── React interaction ───────────────────────────────────────────────────────

  const handleReact = useCallback(
    async (postId: number) => {
      try {
        await apiFetch<unknown>('/interactions', authToken, {
          method: 'POST',
          body: JSON.stringify({ post_id: postId, type: 'reaction' }),
        });
      } catch {
        // silently fail
      }
    },
    [authToken],
  );

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
          }).catch(() => {});
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
  const theme = useMemo(() => (colorScheme === 'dark' ? DARK_THEME : LIGHT_THEME), [colorScheme]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Post>) => (
      <PostCard post={item} onReact={handleReact} theme={theme} />
    ),
    [handleReact, theme],
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
      {/* Search bar */}
      <View style={[styles.searchContainer, { backgroundColor: theme.bg }]}>
        <TextInput
          style={[styles.searchInput, { backgroundColor: theme.surface, color: theme.textPrimary }]}
          placeholder="Search posts…"
          placeholderTextColor={theme.textTertiary}
          value={searchText}
          onChangeText={setSearchText}
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
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.brand }]}
        onPress={() => setShowComposer(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Compose modal */}
      <ComposeModal
        visible={showComposer}
        onDismiss={handleDismiss}
        onPublished={handlePublished}
        authToken={authToken}
      />
    </View>
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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  searchInput: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 17,
  },
  searchSpinner: {
    marginLeft: 12,
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
