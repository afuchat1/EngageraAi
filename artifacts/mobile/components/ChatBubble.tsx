import React, { memo, useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { SourceStrip } from '@/components/SourceStrip';
import { toPlainText } from '@/lib/plainText';
import type { SearchInfo } from '@/lib/chat';

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  imageUri?: string;
  searchInfo?: SearchInfo;
  pending?: boolean;
  /** True while this assistant message is still actively receiving tokens. */
  streaming?: boolean;
}

/**
 * Thin blinking caret shown at the end of an assistant message while it
 * streams. Implemented as an Animated.Text glyph (not a View) because it
 * needs to sit inline as a nested child of the message's <Text>.
 */
function StreamCursor({ color }: { color: string }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(withSequence(withTiming(0.15, { duration: 450 }), withTiming(1, { duration: 450 })), -1, true);
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.Text style={[styles.cursor, { color }, style]}>{' \u258C'}</Animated.Text>
  );
}

/**
 * Chat row — right-aligned filled bubble for the user, left-aligned plain
 * text for Engagera, matching the web app's layout. Messages never carry
 * the brand logo; only plain, unformatted text is ever rendered (no
 * markdown/rich text), per product decision.
 */
export const ChatBubble = memo(function ChatBubble({ message }: { message: DisplayMessage }) {
  const colors = useColors();
  const isUser = message.role === 'user';
  const plain = message.text.length > 0 ? toPlainText(message.text) : '';

  return (
    <View style={[styles.row, { alignItems: isUser ? 'flex-end' : 'flex-start' }]}>
      <View style={[styles.body, isUser ? [styles.bubble, { backgroundColor: colors.primary }] : styles.assistantBody]}>
        {message.imageUri ? (
          <Image source={{ uri: message.imageUri }} style={styles.image} />
        ) : null}
        {plain.length > 0 ? (
          <Text
            selectable
            style={[
              styles.text,
              { color: isUser ? colors.primaryForeground : colors.foreground },
            ]}
          >
            {plain}
            {!isUser && message.streaming ? <StreamCursor color={colors.foreground} /> : null}
          </Text>
        ) : null}
      </View>

      {!isUser && message.searchInfo && message.searchInfo.sources.length > 0 ? (
        <SourceStrip searchInfo={message.searchInfo} />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    marginBottom: 16,
    width: '100%',
  },
  body: {
    gap: 8,
  },
  bubble: {
    maxWidth: '86%',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 20,
    borderBottomRightRadius: 6,
  },
  assistantBody: {
    width: '100%',
  },
  image: {
    width: 200,
    height: 200,
    borderRadius: 14,
  },
  text: {
    fontSize: 16,
    lineHeight: 23,
    fontFamily: 'Inter_400Regular',
  },
  cursor: {
    fontSize: 15,
    fontWeight: '400',
  },
});
