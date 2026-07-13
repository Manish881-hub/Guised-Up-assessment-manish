import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  ListRenderItemInfo,
} from 'react-native';

import { API_BASE_URL, DEBOUNCE_MS } from '../config';

// ─── Types ────────────────────────────────────────────────────────────────────

type Post = {
  id: number;
  user_id: number;
  body: string;
  image_url: string | null;
  created_at: string;
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

function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, styles.skeleton]} />
        <View style={[styles.skeletonText, { width: 100 }]} />
      </View>
      <View style={[styles.skeletonText, { width: '100%', marginTop: 10 }]} />
      <View style={[styles.skeletonText, { width: '70%', marginTop: 6 }]} />
      <View style={styles.cardFooter}>
        <View style={[styles.skeletonButton, { width: 70 }]} />
        <View style={[styles.skeletonText, { width: 50 }]} />
      </View>
    </View>
  );
}

// ─── Post card ────────────────────────────────────────────────────────────────

interface PostCardProps {
  post: Post;
  onReact: (postId: number) => void;
}

function PostCard({ post, onReact }: PostCardProps) {
  const initials = `U${post.user_id}`.slice(0, 2).toUpperCase();

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.username}>User #{post.user_id}</Text>
      </View>
      <Text style={styles.body}>{post.body}</Text>
      <View style={styles.cardFooter}>
        <TouchableOpacity
          style={styles.reactButton}
          onPress={() => onReact(post.id)}
          activeOpacity={0.7}
        >
          <Text style={styles.reactButtonText}>React</Text>
        </TouchableOpacity>
        <Text style={styles.timestamp}>{timeAgo(post.created_at)}</Text>
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

  // ── Render helpers ──────────────────────────────────────────────────────────

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Post>) => (
      <PostCard post={item} onReact={handleReact} />
    ),
    [handleReact],
  );

  const keyExtractor = useCallback((item: Post) => String(item.id), []);

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color="#E4572E" />
      </View>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search posts…"
          placeholderTextColor="#999"
          value={searchText}
          onChangeText={setSearchText}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searching && (
          <ActivityIndicator
            style={styles.searchSpinner}
            size="small"
            color="#E4572E"
          />
        )}
      </View>

      {/* Skeleton loaders */}
      {showSkeleton && (
        <View style={styles.skeletonContainer}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      )}

      {/* Error state */}
      {!showSkeleton && error !== null && posts.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
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
          <Text style={styles.emptyText}>
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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#E4572E"
              colors={['#E4572E']}
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F5F2',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#F7F5F2',
  },
  searchInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#E8E4DF',
  },
  searchSpinner: {
    marginLeft: 10,
  },
  skeletonContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E4572E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  username: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    flexShrink: 1,
  },
  body: {
    fontSize: 15,
    color: '#444',
    lineHeight: 22,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reactButton: {
    backgroundColor: '#E4572E',
    paddingVertical: 6,
    paddingHorizontal: 18,
    borderRadius: 20,
  },
  reactButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
  },
  skeleton: {
    backgroundColor: '#E8E4DF',
  },
  skeletonText: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E8E4DF',
  },
  skeletonButton: {
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E8E4DF',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  footerLoader: {
    paddingVertical: 16,
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
    color: '#E4572E',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#E4572E',
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 24,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
});
