import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

/**
 * Shown the instant a message is detected as an image request — a picture
 * frame with a soft pulse, instead of the generic "Thinking" dots. Image
 * generation never streams text (the backend replies once the whole image
 * is ready), so without this the user would otherwise see nothing at all,
 * or worse, a "thinking" label that implies the model is reasoning about
 * something rather than actively drawing a picture for them.
 */
export function ImageGenIndicator() {
  const colors = useColors();
  const pulse = useSharedValue(0.4);
  const shimmer = useSharedValue(0.35);

  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(0.9, { duration: 750 }), withTiming(0.4, { duration: 750 })), -1, true);
    shimmer.value = withRepeat(withSequence(withTiming(1, { duration: 800 }), withTiming(0.35, { duration: 800 })), -1, true);
  }, [pulse, shimmer]);

  const iconStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const textStyle = useAnimatedStyle(() => ({ opacity: shimmer.value }));

  return (
    <View style={styles.wrap}>
      <View style={[styles.frame, { borderColor: colors.foreground + '33' }]}>
        <Animated.View style={iconStyle}>
          <Ionicons name="image-outline" size={22} color={colors.foreground} />
        </Animated.View>
      </View>
      <Animated.Text style={[styles.label, { color: colors.foreground }, textStyle]}>
        Creating your image…
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16, gap: 8, alignItems: 'flex-start' },
  frame: {
    width: 120,
    height: 90,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 13.5, fontFamily: 'Inter_500Medium', letterSpacing: 0.1 },
});
