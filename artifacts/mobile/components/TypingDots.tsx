import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';

/**
 * "Thinking" indicator shown while waiting for the first streamed token —
 * a pulsing orb plus a shimmering label, mirroring the web app's thinking
 * state. Intentionally carries no brand logo/avatar: per product decision,
 * the logo never appears inside chat messages.
 */
export function TypingDots() {
  const colors = useColors();
  const pulse = useSharedValue(0.85);
  const ringOpacity = useSharedValue(0.6);
  const shimmer = useSharedValue(0.35);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(1, { duration: 700 }), withTiming(0.85, { duration: 700 })),
      -1,
      true,
    );
    ringOpacity.value = withRepeat(
      withSequence(withTiming(0.15, { duration: 700 }), withTiming(0.6, { duration: 700 })),
      -1,
      true,
    );
    shimmer.value = withRepeat(
      withSequence(withTiming(1, { duration: 800 }), withTiming(0.35, { duration: 800 })),
      -1,
      true,
    );
  }, [pulse, ringOpacity, shimmer]);

  const coreStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: ringOpacity.value }));
  const textStyle = useAnimatedStyle(() => ({ opacity: shimmer.value }));

  return (
    <View style={styles.row}>
      <View style={styles.orbWrap}>
        <Animated.View style={[styles.orbRing, { borderColor: colors.foreground }, ringStyle]} />
        <Animated.View style={[styles.orbCore, { backgroundColor: colors.foreground }, coreStyle]} />
      </View>
      <Animated.Text style={[styles.label, { color: colors.foreground }, textStyle]}>Thinking</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 4,
  },
  orbWrap: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbRing: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
  },
  orbCore: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  label: {
    fontSize: 13.5,
    fontFamily: 'Inter_500Medium',
    letterSpacing: 0.1,
  },
});
