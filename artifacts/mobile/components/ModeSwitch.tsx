import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export type ChatMode = 'chat' | 'camera';

const OPTIONS: { key: ChatMode; label: string }[] = [
  { key: 'chat', label: 'Chat' },
  { key: 'camera', label: 'Camera' },
];

const WIDTH = 156;
const HEIGHT = 34;
const PAD = 3;

/**
 * Floating pill segmented control — replaces the bottom tab bar entirely.
 * Both modes stay mounted by the parent screen, so switching never loses
 * conversation state.
 */
export function ModeSwitch({ value, onChange }: { value: ChatMode; onChange: (mode: ChatMode) => void }) {
  const colors = useColors();
  const optionWidth = (WIDTH - PAD * 2) / OPTIONS.length;
  const anim = useRef(new Animated.Value(value === 'chat' ? 0 : 1)).current;

  const set = (mode: ChatMode) => {
    if (mode === value) return;
    Animated.spring(anim, {
      toValue: mode === 'chat' ? 0 : 1,
      useNativeDriver: true,
      damping: 18,
      stiffness: 220,
      mass: 0.6,
    }).start();
    onChange(mode);
  };

  return (
    <View
      style={[
        styles.track,
        { width: WIDTH, height: HEIGHT, backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Animated.View
        style={[
          styles.indicator,
          {
            width: optionWidth,
            height: HEIGHT - PAD * 2,
            backgroundColor: colors.foreground,
            transform: [
              {
                translateX: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [PAD, PAD + optionWidth],
                }),
              },
            ],
          },
        ]}
      />
      {OPTIONS.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable key={opt.key} style={[styles.option, { width: optionWidth }]} onPress={() => set(opt.key)}>
            <Text
              style={[
                styles.label,
                { color: active ? colors.background : colors.mutedForeground, fontWeight: active ? '700' : '600' },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    padding: PAD,
  },
  indicator: {
    position: 'absolute',
    top: PAD,
    left: 0,
    borderRadius: 999,
  },
  option: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: -0.1,
  },
});
