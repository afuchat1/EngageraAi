import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import type { SearchInfo } from '@/lib/chat';

export function SourceStrip({ searchInfo }: { searchInfo: SearchInfo }) {
  const colors = useColors();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
      contentContainerStyle={styles.stripContent}
    >
      {searchInfo.sources.map((source, idx) => (
        <Pressable
          key={`${source.url}-${idx}`}
          onPress={() => WebBrowser.openBrowserAsync(source.url)}
          style={({ pressed }) => [
            styles.chip,
            {
              backgroundColor: colors.muted,
              borderColor: colors.border,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
        >
          <Ionicons name="link" size={12} color={colors.mutedForeground} />
          <Text style={[styles.chipText, { color: colors.mutedForeground }]} numberOfLines={1}>
            {source.title}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: {
    marginTop: 8,
  },
  stripContent: {
    gap: 8,
    paddingRight: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 160,
  },
  chipText: {
    fontSize: 12,
  },
});
