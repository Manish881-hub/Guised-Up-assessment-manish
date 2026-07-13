import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

import { API_BASE_URL } from '../config';

const MAX_CHARS = 2000;

interface ComposeModalProps {
  visible: boolean;
  onDismiss: () => void;
  onPublished: () => void;
  authToken: string;
}

export default function ComposeModal({ visible, onDismiss, onPublished, authToken }: ComposeModalProps) {
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const remaining = MAX_CHARS - body.length;
  const canPost = body.trim().length > 0 && !posting;

  const handlePost = useCallback(async () => {
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ body: body.trim() }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
      }
      setBody('');
      onPublished();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setPosting(false);
    }
  }, [body, authToken, onPublished]);

  const handleDismiss = useCallback(() => {
    if (posting) return;
    setBody('');
    setError(null);
    onDismiss();
  }, [posting, onDismiss]);

  const counterColor = remaining < 50 ? '#E4572E' : remaining < 200 ? '#E65100' : '#AEAEB2';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleDismiss}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={handleDismiss} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.dismissText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>New Post</Text>
          <TouchableOpacity
            onPress={handlePost}
            disabled={!canPost}
            style={[styles.postButton, !canPost && styles.postButtonDisabled]}
          >
            {posting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.postButtonText}>Post</Text>
            )}
          </TouchableOpacity>
        </View>

        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="What's the fashion move?"
          placeholderTextColor="#AEAEB2"
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={MAX_CHARS}
          autoFocus
          textAlignVertical="top"
        />

        <View style={styles.footer}>
          {error && <Text style={styles.errorText}>{error}</Text>}
          <Text style={[styles.counter, { color: counterColor }]}>
            {remaining}/{MAX_CHARS}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E3DE',
  },
  dismissText: {
    fontSize: 17,
    color: '#E4572E',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  postButton: {
    backgroundColor: '#E4572E',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    minWidth: 64,
    alignItems: 'center',
  },
  postButtonDisabled: {
    opacity: 0.4,
  },
  postButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  input: {
    flex: 1,
    fontSize: 17,
    color: '#1C1C1E',
    paddingHorizontal: 16,
    paddingTop: 16,
    lineHeight: 24,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#E4572E',
    marginRight: 12,
  },
  counter: {
    fontSize: 14,
    fontWeight: '500',
  },
});
