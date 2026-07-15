import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { BrandMark } from '@/components/BrandMark';

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

/** Flat typing indicator, styled to match the borderless transcript rows. */
export function TypingDots() {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <View style={styles.avatarRow}>
        <BrandMark size={14} />
        <Text style={[styles.label, { color: colors.mutedForeground }]}>Engagera</Text>
      </View>
      <View style={styles.dots}>
        <Dot delay={0} color={colors.mutedForeground} />
        <Dot delay={150} color={colors.mutedForeground} />
        <Dot delay={300} color={colors.mutedForeground} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: 22 },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.2,
  },
  dots: {
    flexDirection: 'row',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
