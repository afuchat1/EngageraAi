import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { SourceStrip } from '@/components/SourceStrip';
import type { SearchInfo } from '@/lib/chat';

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  imageUri?: string;
  searchInfo?: SearchInfo;
  pending?: boolean;
}

export function ChatBubble({ message }: { message: DisplayMessage }) {
  const colors = useColors();
  const isUser = message.role === 'user';

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: isUser ? colors.primary : colors.card,
            borderColor: colors.border,
            borderRadius: colors.radius,
          },
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
        ]}
      >
        {message.imageUri ? (
          <Image
            source={{ uri: message.imageUri }}
            style={[styles.image, { borderRadius: colors.radius - 6 }]}
          />
        ) : null}
        {message.text.length > 0 ? (
          <Text
            style={[
              styles.text,
              { color: isUser ? colors.primaryForeground : colors.foreground },
            ]}
            selectable
          >
            {message.text}
          </Text>
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
    marginBottom: 14,
    maxWidth: '86%',
  },
  rowUser: {
    alignSelf: 'flex-end',
  },
  rowAssistant: {
    alignSelf: 'flex-start',
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  bubbleUser: {
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: 'Inter_400Regular',
  },
  image: {
    width: 200,
    height: 200,
  },
});
