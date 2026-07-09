'use strict';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';

/**
 * ChatMessage — renders a single chat bubble for either side of the conversation.
 *
 * - Assistant messages use react-native-markdown-display so bold/lists/code render
 *   correctly from the AI response. Sanitization is handled by the library (no
 *   dangerouslySetInnerHTML equivalent — threat T-09.2-05 mitigation).
 * - User messages use plain Text inside a blue bubble.
 * - Empty content (content === '') means the stream just started; show "..." indicator.
 *
 * @param {{ role: 'user'|'assistant', content: string }} props
 */
export default function ChatMessage({ role, content }) {
  const isAssistant = role === 'assistant';

  if (isAssistant) {
    return (
      <View style={[styles.bubble, styles.assistantBubble]}>
        {content === '' ? (
          <Text style={styles.streamingDots}>...</Text>
        ) : (
          <Markdown style={markdownStyles}>{content}</Markdown>
        )}
      </View>
    );
  }

  return (
    <View style={styles.userRow}>
      <View style={[styles.bubble, styles.userBubble]}>
        <Text style={styles.userText}>{content}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    maxWidth: '85%',
    padding: 12,
    borderRadius: 16,
    marginVertical: 4,
    marginHorizontal: 12,
  },
  assistantBubble: {
    backgroundColor: '#f3f4f6',
    alignSelf: 'flex-start',
  },
  userRow: {
    alignItems: 'flex-end',
  },
  userBubble: {
    backgroundColor: '#2563eb',
    alignSelf: 'flex-end',
  },
  userText: {
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 22,
  },
  streamingDots: {
    color: '#6b7280',
    fontSize: 20,
    letterSpacing: 2,
    paddingHorizontal: 4,
  },
});

// Styles passed to react-native-markdown-display — override defaults to match app theme
const markdownStyles = {
  body: {
    color: '#111827',
    fontSize: 15,
    lineHeight: 22,
  },
  strong: {
    fontWeight: '700',
    color: '#111827',
  },
  code_inline: {
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    paddingHorizontal: 4,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  fence: {
    backgroundColor: '#1f2937',
    borderRadius: 8,
    padding: 12,
  },
  code_block: {
    color: '#f9fafb',
    fontFamily: 'monospace',
    fontSize: 13,
  },
  bullet_list: {
    marginVertical: 4,
  },
  list_item: {
    marginVertical: 2,
  },
};
