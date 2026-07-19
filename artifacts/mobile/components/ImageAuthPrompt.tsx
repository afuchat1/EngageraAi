import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

/**
 * Shown in the chat when a guest tries to generate an image.
 * Clean card — no bubble chrome — with two CTA pill buttons.
 */
export function ImageAuthPrompt() {
  const colors = useColors();

  const go = (mode: 'signIn' | 'signUp') => {
    router.push({ pathname: '/account', params: { mode } });
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Icon */}
      <View style={[styles.iconWrap, { backgroundColor: colors.background }]}>
        <Ionicons name="image-outline" size={22} color={colors.foreground} />
      </View>

      {/* Copy */}
      <Text style={[styles.title, { color: colors.foreground }]}>
        Sign in to generate images
      </Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        AI image generation is available to signed-in users. It's free and only takes a moment.
      </Text>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          onPress={() => go('signUp')}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: colors.foreground, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={[styles.primaryText, { color: colors.background }]}>
            Create free account
          </Text>
        </Pressable>

        <Pressable
          onPress={() => go('signIn')}
          style={({ pressed }) => [
            styles.secondary,
            { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.secondaryText, { color: colors.foreground }]}>
            Sign in
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 10,
    maxWidth: 320,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  title: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.1,
  },
  body: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 19,
  },
  actions: {
    gap: 8,
    marginTop: 4,
  },
  primary: {
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  secondary: {
    height: 44,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
});
