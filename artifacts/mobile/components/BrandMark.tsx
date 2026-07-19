import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Image } from 'expo-image';
import { useColors } from '@/hooks/useColors';

const LOGO = require('@/assets/images/logo.png');

/**
 * Engagera's real brand mark (the same asset used by the web app's
 * favicon/logo). Rendered from the actual PNG rather than a hand-drawn
 * shape so the app always matches the official logo everywhere it
 * appears — header, sidebar, splash/empty states. Per product decision,
 * this is intentionally NOT used inside individual chat messages.
 */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <Image
      source={LOGO}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessibilityLabel="Engagera"
    />
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
  word: {
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.4,
  },
});
