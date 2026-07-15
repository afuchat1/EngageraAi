import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';

function Dot({ delay, color }: { delay: number; color: string }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(1, { duration: 350 }), withTiming(0.3, { duration: 350 })), -1, false),
    );
  }, [delay, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

export function TypingDots() {
  const colors = useColors();
  return (
    <View
      style={[
        styles.bubble,
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
      ]}
    >
      <Dot delay={0} color={colors.mutedForeground} />
      <Dot delay={150} color={colors.mutedForeground} />
      <Dot delay={300} color={colors.mutedForeground} />
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    flexDirection: 'row',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 14,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
