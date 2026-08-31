import React, { memo, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { ImageLightbox } from '@/components/ImageLightbox';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { SourceStrip } from '@/components/SourceStrip';
import { Markdown } from '@/components/Markdown';
import { MessageActions } from '@/components/MessageActions';
import { ClockWidget } from '@/components/ClockWidget';
import { WeatherWidget } from '@/components/WeatherWidget';
import { toPlainText } from '@/lib/plainText';
import type { ContentPart, SearchInfo, TimeInfo, WeatherInfo } from '@/lib/chat';

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  imageUri?: string;
  /** In-memory multimodal payload used for follow-up questions in this thread. */
  imageContent?: ContentPart[];
  searchInfo?: SearchInfo;
  timeInfo?: TimeInfo;
  weatherInfo?: WeatherInfo;
  pending?: boolean;
  /** True while this assistant message is still actively receiving tokens. */
  streaming?: boolean;
  /** True while an image-generation reply for this message is in flight. */
  imageGenerating?: boolean;
  /** Live search status message shown while external tools are running. */
  searchStatus?: string;
  /** URLs read by AfuBot for this answer. */
  crawledUrls?: string[];
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

function CrawlStrip({ urls, colors }: { urls: string[]; colors: ReturnType<typeof useColors> }) {
  if (!urls.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.crawlStrip}>
      {urls.map((url, index) => {
        let label = 'Read page';
        try {
          label = `Read: ${new URL(url).hostname.replace(/^www\./, '')}`;
        } catch {
          // Keep a generic label for malformed URLs.
        }
        return (
          <Pressable
            key={`${url}-${index}`}
            onPress={() => WebBrowser.openBrowserAsync(url)}
            style={[styles.crawlChip, { borderColor: colors.border, backgroundColor: colors.muted }]}
          >
            <Ionicons name="link-outline" size={12} color={colors.mutedForeground} />
            <Text style={[styles.crawlText, { color: colors.mutedForeground }]} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
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
}: {
  message: DisplayMessage;
  onRegenerate?: (id: string) => void;
}) {
  const colors = useColors();

  const [lightboxOpen, setLightboxOpen] = useState(false);

  const isUser = message.role === 'user';
  const isLive = !isUser && (message.streaming || message.pending);
  const plain = message.text.length > 0 ? toPlainText(message.text) : '';
  // Show the action bar on every finished assistant message that has content.
  const showActions = !isUser && !isLive && !!message.text.trim();

  return (
    <View style={[styles.row, { alignItems: isUser ? 'flex-end' : 'flex-start' }]}>
      <View style={[styles.body, isUser ? [styles.bubble, { backgroundColor: colors.primary }] : styles.assistantBody]}>
        {!isUser && message.timeInfo ? <ClockWidget /> : null}
        {!isUser && message.weatherInfo ? <WeatherWidget /> : null}

        {message.imageUri ? (
          <>
            <Pressable onPress={() => setLightboxOpen(true)} style={styles.imagePressable}>
              <Image source={{ uri: message.imageUri }} style={styles.image} />
            </Pressable>
            <ImageLightbox
              uri={message.imageUri}
              visible={lightboxOpen}
              onClose={() => setLightboxOpen(false)}
            />
          </>
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
      {!isUser && message.crawledUrls?.length ? <CrawlStrip urls={message.crawledUrls} colors={colors} /> : null}

      {showActions ? (
        <MessageActions
          text={plain}
          onRegenerate={onRegenerate ? () => onRegenerate(message.id) : undefined}
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
  imagePressable: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  image: {
    width: 200,
    height: 200,
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
  crawlStrip: {
    marginTop: 2,
  },
  crawlChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: 7,
    maxWidth: 180,
  },
  crawlText: {
    fontSize: 11,
  },
});
