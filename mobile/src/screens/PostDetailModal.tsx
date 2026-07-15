import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';

import { API_BASE_URL } from '../config';
import type { Theme } from '../theme';

const AVATAR_COLORS = [
  '#E4572E', '#2E7D32', '#1565C0', '#6A1B9A',
  '#00838F', '#F57C00', '#D81B60', '#283593',
];

type Post = {
  id: number;
  user_id: number;
  body: string;
  image_url: string | null;
  created_at: string;
  authenticity_score: number;
};

type Comment = {
  id: number;
  user_id: number;
  username: string;
  body: string;
  created_at: string;
};

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

function authenticityBadge(score: number): { label: string; bg: string } {
  if (score >= 0.7) return { label: 'Verified', bg: '#2E7D32' };
  if (score >= 0.5) return { label: 'Likely Authentic', bg: '#E65100' };
  return { label: 'Low Signal', bg: '#9E9E9E' };
}

interface PostDetailModalProps {
  visible: boolean;
  post: Post | null;
  onDismiss: () => void;
  authToken: string;
  theme: Theme;
}

export default function PostDetailModal({ visible, post, onDismiss, authToken, theme }: PostDetailModalProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const morphAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      morphAnim.setValue(0);
      Animated.spring(morphAnim, {
        toValue: 1,
        stiffness: 200,
        damping: 24,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, morphAnim]);

  const fetchComments = useCallback(async () => {
    if (!post) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/posts/${post.id}/comments`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [post, authToken]);

  useEffect(() => {
    if (visible && post) {
      setComments([]);
      fetchComments();
    }
  }, [visible, post, fetchComments]);

  const handleSend = useCallback(async () => {
    const body = commentText.trim();
    if (!body || !post || posting) return;
    setPosting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/posts/${post.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        const newComment = await res.json();
        setComments(prev => [newComment, ...prev]);
        setCommentText('');
      }
    } catch {
      // silent
    } finally {
      setPosting(false);
    }
  }, [commentText, post, posting, authToken]);

  const handleDismiss = useCallback(() => {
    if (posting) return;
    onDismiss();
  }, [posting, onDismiss]);

  if (!post) return null;

  const badge = authenticityBadge(post.authenticity_score);
  const avatarColor = AVATAR_COLORS[post.user_id % AVATAR_COLORS.length];

  const renderHeader = () => (
    <View>
      <View style={[styles.postCard, { backgroundColor: theme.surface }]}>
        <View style={styles.postHeader}>
          <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
            <Text style={styles.avatarText}>U{post.user_id}</Text>
          </View>
          <View style={styles.headerTextGroup}>
            <Text style={[styles.username, { color: theme.textPrimary }]}>User #{post.user_id}</Text>
            <View style={[styles.badge, { backgroundColor: badge.bg }]}>
              <Text style={styles.badgeText}>{badge.label}</Text>
            </View>
          </View>
          <Text style={[styles.timestamp, { color: theme.textTertiary }]}>{timeAgo(post.created_at)}</Text>
        </View>
        <Text selectable style={[styles.body, { color: theme.textPrimary }]}>{post.body}</Text>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Comments ({comments.length})</Text>
      </View>
    </View>
  );

  const renderComment = ({ item }: { item: Comment }) => (
    <View style={[styles.comment, { borderBottomColor: theme.border }]}>
      <View style={[styles.commentAvatar, { backgroundColor: AVATAR_COLORS[item.user_id % AVATAR_COLORS.length] }]}>
        <Text style={styles.commentAvatarText}>{item.username.slice(0, 2).toUpperCase()}</Text>
      </View>
      <View style={styles.commentBody}>
        <View style={styles.commentHeader}>
          <Text style={[styles.commentUsername, { color: theme.textPrimary }]}>{item.username}</Text>
          <Text style={[styles.commentTime, { color: theme.textTertiary }]}>{timeAgo(item.created_at)}</Text>
        </View>
        <Text style={[styles.commentText, { color: theme.textPrimary }]}>{item.body}</Text>
      </View>
    </View>
  );

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { color: theme.textTertiary }]}>No comments yet. Be the first!</Text>
      </View>
    );
  };

  const cardScale = morphAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });
  const cardOpacity = morphAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.3, 1] });
  const cardTranslateY = morphAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });

  return (
    <Modal
      visible={visible}
      animationType="none"
      presentationStyle="pageSheet"
      onRequestClose={handleDismiss}
    >
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: theme.bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View style={[styles.morphContainer, {
          opacity: cardOpacity,
          transform: [{ scale: cardScale }, { translateY: cardTranslateY }],
        }]}>
          <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={handleDismiss} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={[styles.dismissText, { color: theme.brand }]}>Close</Text>
            </TouchableOpacity>
            <Text style={[styles.title, { color: theme.textPrimary }]}>Post</Text>
            <View style={{ width: 50 }} />
          </View>

          {loading && comments.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.brand} />
            </View>
          ) : (
            <FlatList
              data={comments}
              renderItem={renderComment}
              keyExtractor={(item) => String(item.id)}
              ListHeaderComponent={renderHeader}
              ListEmptyComponent={renderEmpty}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}

          <View style={[styles.inputBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
            <TextInput
              ref={inputRef}
              style={[styles.input, { color: theme.textPrimary, backgroundColor: theme.searchBg }]}
              placeholder="Write a comment..."
              placeholderTextColor={theme.textTertiary}
              value={commentText}
              onChangeText={setCommentText}
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              style={[styles.sendButton, { backgroundColor: theme.brand }, (!commentText.trim() || posting) && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={!commentText.trim() || posting}
            >
              {posting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.sendButtonText}>Send</Text>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  morphContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dismissText: {
    fontSize: 17,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
  },
  postCard: {
    padding: 20,
    marginBottom: 4,
  },
  postHeader: {
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
    fontSize: 14,
    fontWeight: '700',
  },
  headerTextGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
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
  timestamp: {
    fontSize: 13,
    marginLeft: 8,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  comment: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderCurve: 'continuous',
  },
  commentAvatarText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  commentBody: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  commentUsername: {
    fontSize: 14,
    fontWeight: '600',
  },
  commentTime: {
    fontSize: 12,
    marginLeft: 8,
  },
  commentText: {
    fontSize: 15,
    lineHeight: 21,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingBottom: 16,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
    borderCurve: 'continuous',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
