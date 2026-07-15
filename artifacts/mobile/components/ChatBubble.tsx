import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { SourceStrip } from '@/components/SourceStrip';
import { MarkdownText } from '@/components/MarkdownText';
import { BrandMark } from '@/components/BrandMark';
import type { SearchInfo } from '@/lib/chat';

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  imageUri?: string;
  searchInfo?: SearchInfo;
  pending?: boolean;
}

/** Flat, borderless transcript row — no chat bubbles, matches a clean editorial feel. */
export function ChatBubble({ message }: { message: DisplayMessage }) {
  const colors = useColors();
  const isUser = message.role === 'user';

  return (
    <View style={styles.row}>
      <View style={styles.avatarRow}>
        {isUser ? (
          <View style={[styles.avatarDot, { backgroundColor: colors.muted }]} />
        ) : (
          <BrandMark size={14} />
        )}
        <Text style={[styles.label, { color: colors.mutedForeground }]}>{isUser ? 'You' : 'Engagera'}</Text>
      </View>

      <View style={styles.body}>
        {message.imageUri ? (
          <Image source={{ uri: message.imageUri }} style={[styles.image, { borderRadius: 12 }]} />
        ) : null}
        {message.text.length > 0 ? (
          <MarkdownText text={message.text} color={colors.foreground} />
        ) : null}
      </View>

      {!isUser && message.searchInfo && message.searchInfo.sources.length > 0 ? (
        <SourceStrip searchInfo={message.searchInfo} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginBottom: 22,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 6,
  },
  avatarDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  label: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.2,
  },
  body: {
    gap: 8,
  },
  image: {
    width: 200,
    height: 200,
  },
});
