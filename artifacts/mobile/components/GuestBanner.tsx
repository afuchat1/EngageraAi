import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
export function GuestBanner() {
  const colors = useColors();

  return (
    <Pressable
      onPress={() => router.push('/account')}
      style={({ pressed }) => [
        styles.banner,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <View style={styles.left}>
        <Ionicons name="sparkles" size={12} color={colors.mutedForeground} />
        <Text style={[styles.text, { color: colors.mutedForeground }]}>
          Sign in to use Engagera
        </Text>
      </View>
      <Text style={[styles.cta, { color: colors.foreground }]}>Sign in</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  text: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    flexShrink: 1,
  },
  cta: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
  },
});
