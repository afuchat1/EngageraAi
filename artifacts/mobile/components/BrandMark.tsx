import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

/**
 * Engagera's mark: a small rotated square nested inside a hollow ring,
 * rendered purely from Views so it never needs a raster asset and always
 * matches the current palette. Doubles as the empty-state glyph.
 */
export function BrandMark({ size = 22 }: { size?: number }) {
  const colors = useColors();
  const ring = size;
  const core = size * 0.34;

  return (
    <View style={[styles.ring, { width: ring, height: ring, borderColor: colors.foreground }]}>
      <View
        style={[
          styles.core,
          {
            width: core,
            height: core,
            backgroundColor: colors.foreground,
            borderRadius: core * 0.2,
            transform: [{ rotate: '45deg' }],
          },
        ]}
      />
    </View>
  );
}

export function Wordmark({ size = 17 }: { size?: number }) {
  const colors = useColors();
  return (
    <Text
      style={[
        styles.word,
        { color: colors.foreground, fontSize: size, lineHeight: size * 1.15 },
      ]}
    >
      engagera
    </Text>
  );
}

const styles = StyleSheet.create({
  ring: {
    borderWidth: 1.5,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  core: {},
  word: {
    fontFamily: 'SpaceGrotesk_700Bold',
    letterSpacing: -0.4,
  },
});
