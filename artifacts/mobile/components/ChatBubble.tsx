import React, { memo, useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { SourceStrip } from '@/components/SourceStrip';
import { Markdown } from '@/components/Markdown';
import { MessageActions } from '@/components/MessageActions';
import { ClockWidget } from '@/components/ClockWidget';
import { WeatherWidget } from '@/components/WeatherWidget';
import { toPlainText } from '@/lib/plainText';
import type { SearchInfo, TimeInfo, WeatherInfo } from '@/lib/chat';

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  imageUri?: string;
  searchInfo?: SearchInfo;
  timeInfo?: TimeInfo;
  weatherInfo?: WeatherInfo;
  pending?: boolean;
  /** True while this assistant message is still actively receiving tokens. */
  streaming?: boolean;
  /** True while an image-generation reply for this message is in flight. */
  imageGenerating?: boolean;
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
 * Chat row — right-aligned filled bubble for the user, left-aligned
 * response for Engagera, matching the web app's layout. User messages
 * always stay plain text. Assistant messages render as plain text with a
 * blinking cursor while actively streaming (cheapest to update per token),
 * then switch to full rich formatting — headings, clean bullets, numbered
 * lists, quotes, code — once the response has finished, plus a small
 * action row (copy / regenerate / read aloud / share / more).
 */
export const ChatBubble = memo(function ChatBubble({
  message,
  onRegenerate,
  onDelete,
}: {
  message: DisplayMessage;
  onRegenerate?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const colors = useColors();
  const isUser = message.role === 'user';
  const isLive = !isUser && (message.streaming || message.pending);
  const plain = message.text.length > 0 ? toPlainText(message.text) : '';
  const showActions = !isUser && !isLive && !!message.text.trim() && (onRegenerate || onDelete);

  return (
    <View style={[styles.row, { alignItems: isUser ? 'flex-end' : 'flex-start' }]}>
      <View style={[styles.body, isUser ? [styles.bubble, { backgroundColor: colors.primary }] : styles.assistantBody]}>
        {!isUser && message.timeInfo ? <ClockWidget timeInfo={message.timeInfo} /> : null}
        {!isUser && message.weatherInfo ? <WeatherWidget weatherInfo={message.weatherInfo} /> : null}

        {message.imageUri ? (
          <Image source={{ uri: message.imageUri }} style={styles.image} />
        ) : null}
        {isUser ? (
          plain.length > 0 ? (
            <Text selectable style={[styles.text, { color: colors.primaryForeground }]}>
              {plain}
            </Text>
          ) : null
        ) : isLive ? (
          plain.length > 0 ? (
            <Text selectable style={[styles.text, { color: colors.foreground }]}>
              {plain}
              {message.streaming ? <StreamCursor color={colors.foreground} /> : null}
            </Text>
          ) : null
        ) : (
          <Markdown text={message.text} color={colors.foreground} />
        )}
      </View>

      {!isUser && message.searchInfo && message.searchInfo.sources.length > 0 ? (
        <SourceStrip searchInfo={message.searchInfo} />
      ) : null}

      {showActions ? (
        <MessageActions
          text={plain}
          onRegenerate={() => onRegenerate?.(message.id)}
          onDelete={() => onDelete?.(message.id)}
        />
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
