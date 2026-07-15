import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { GUEST_MESSAGE_LIMIT } from '@/lib/chat';

export function GuestBanner({ remaining }: { remaining: number }) {
  const colors = useColors();

  return (
    <Pressable
      onPress={() => router.push('/account')}
      style={({ pressed }) => [
        styles.banner,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text style={[styles.text, { color: colors.mutedForeground }]}>
        {remaining > 0
          ? `Guest mode · ${remaining} of ${GUEST_MESSAGE_LIMIT} messages left`
          : 'Guest limit reached'}
      </Text>
      <Text style={[styles.cta, { color: colors.foreground }]}>Sign in for unlimited</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  text: {
    fontSize: 12,
    flexShrink: 1,
  },
  cta: {
    fontSize: 12,
    fontWeight: '600',
  },
});
