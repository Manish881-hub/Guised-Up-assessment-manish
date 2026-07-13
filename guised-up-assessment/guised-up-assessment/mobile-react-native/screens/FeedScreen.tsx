import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// Config — swap for your API base URL / auth token source
// -----------------------------------------------------------------------------

const API_BASE_URL = 'http://localhost:8000/api';

async function apiFetch(path: string, token: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
}

// -----------------------------------------------------------------------------
// Time-ago helper (kept dependency-free on purpose)
// -----------------------------------------------------------------------------

function timeAgo(isoDate: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// -----------------------------------------------------------------------------
// Post card
// -----------------------------------------------------------------------------

function PostCard({ post, onReact }: { post: Post; onReact: (postId: number) => void }) {
  const initials = `U${post.user_id}`.slice(0, 2).toUpperCase();

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={styles.username}>User #{post.user_id}</Text>
          <Text style={styles.timeAgo}>{timeAgo(post.created_at)}</Text>
        </View>
      </View>

      <Text style={styles.body}>{post.body}</Text>

      <Pressable style={styles.reactionButton} onPress={() => onReact(post.id)}>
        <Text style={styles.reactionButtonText}>React</Text>
      </Pressable>
    </View>
  );
}

// -----------------------------------------------------------------------------
// Loading skeleton
// -----------------------------------------------------------------------------

function FeedSkeleton() {
  return (
    <View>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.card, styles.skeletonCard]}>
          <View style={styles.cardHeader}>
            <View style={[styles.avatar, styles.skeletonBlock]} />
            <View style={{ flex: 1, gap: 6 }}>
              <View style={[styles.skeletonBlock, { width: '40%', height: 12 }]} />
              <View style={[styles.skeletonBlock, { width: '25%', height: 10 }]} />
            </View>
          </View>
          <View style={[styles.skeletonBlock, { width: '90%', height: 12, marginTop: 12 }]} />
          <View style={[styles.skeletonBlock, { width: '70%', height: 12, marginTop: 8 }]} />
        </View>
      ))}
    </View>
  );
}

// -----------------------------------------------------------------------------
// Feed screen
// -----------------------------------------------------------------------------

export default function FeedScreen({ authToken }: { authToken: string }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Post[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFeed = useCallback(
    async (targetPage: number) => {
      try {
        setError(null);
        const response: FeedResponse = await apiFetch(`/feed?page=${targetPage}`, authToken);
        setPosts((prev) => (targetPage === 1 ? response.data : [...prev, ...response.data]));
        setHasMore(response.meta.has_more);
        setPage(targetPage);
      } catch (err) {
        setError('Could not load the feed. Pull to refresh to try again.');
      } finally {
        setIsLoadingInitial(false);
        setIsLoadingMore(false);
      }
    },
    [authToken],
  );

  useEffect(() => {
    loadFeed(1);
  }, [loadFeed]);

  const handleLoadMore = () => {
    if (isLoadingMore || !hasMore || searchResults !== null) return;
    setIsLoadingMore(true);
    loadFeed(page + 1);
  };

  const handleReact = async (postId: number) => {
    try {
      await apiFetch('/interactions', authToken, {
        method: 'POST',
        body: JSON.stringify({ post_id: postId, type: 'reaction' }),
      });
    } catch {
      // Non-critical — a failed reaction log shouldn't interrupt the feed UX.
    }
  };

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (text.trim().length === 0) {
      setSearchResults(null);
      return;
    }

    searchDebounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await apiFetch(`/search?q=${encodeURIComponent(text)}`, authToken);
        setSearchResults(response.data);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 400);
  };

  const listData = searchResults !== null ? searchResults : posts;

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search — e.g. 'funny travel stories from last week'"
          placeholderTextColor="#8a8a8a"
          value={searchQuery}
          onChangeText={handleSearchChange}
        />
        {isSearching && <ActivityIndicator size="small" />}
      </View>

      {isLoadingInitial ? (
        <FeedSkeleton />
      ) : error && posts.length === 0 ? (
        <View style={styles.centeredState}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : listData.length === 0 ? (
        <View style={styles.centeredState}>
          <Text style={styles.emptyStateText}>
            {searchResults !== null
              ? 'No posts match that search yet.'
              : 'No posts yet — be the first to share something real.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <PostCard post={item} onReact={handleReact} />}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          refreshing={false}
          onRefresh={() => {
            setIsLoadingInitial(true);
            loadFeed(1);
          }}
          ListFooterComponent={
            isLoadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null
          }
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </View>
  );
}

// -----------------------------------------------------------------------------
// Styles — no default RN styling; intentional card-based visual language
// -----------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F5F2',
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EAE6E0',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1F1B16',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EFEAE3',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardHeaderText: {
    marginLeft: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E4572E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  username: {
    fontWeight: '600',
    fontSize: 14,
    color: '#1F1B16',
  },
  timeAgo: {
    fontSize: 11,
    color: '#9A9186',
    marginTop: 1,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: '#3A342C',
  },
  reactionButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#FBEAE3',
  },
  reactionButtonText: {
    color: '#E4572E',
    fontWeight: '600',
    fontSize: 12,
  },
  skeletonCard: {
    opacity: 0.7,
  },
  skeletonBlock: {
    backgroundColor: '#EDEAE4',
    borderRadius: 6,
  },
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    color: '#B3261E',
    textAlign: 'center',
    fontSize: 14,
  },
  emptyStateText: {
    color: '#9A9186',
    textAlign: 'center',
    fontSize: 14,
  },
});
