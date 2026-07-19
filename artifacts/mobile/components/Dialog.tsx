import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  Dimensions,
  Modal,
} from 'react-native';
import { useColors } from '@/hooks/useColors';

export type DialogButtonStyle = 'default' | 'cancel' | 'destructive';

export interface DialogButton {
  text: string;
  style?: DialogButtonStyle;
  onPress?: () => void;
}

export interface DialogConfig {
  title: string;
  message?: string;
  buttons?: DialogButton[];
}

interface Props extends DialogConfig {
  visible: boolean;
  onDismiss: () => void;
}

const { width: W } = Dimensions.get('window');

export function Dialog({ visible, title, message, buttons = [], onDismiss }: Props) {
  const colors = useColors();
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.9)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(cardScale, { toValue: 1, useNativeDriver: true, damping: 20, stiffness: 280, mass: 0.7 }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 0, duration: 140, useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 0, duration: 120, useNativeDriver: true }),
      ]).start();
      cardScale.setValue(0.9);
    }
  }, [visible]);

  // Default single dismiss button if none provided
  const btns: DialogButton[] = buttons.length > 0
    ? buttons
    : [{ text: 'OK', style: 'default' }];

  const handlePress = (btn: DialogButton) => {
    onDismiss();
    btn.onPress?.();
  };

  const cancelBtn = btns.find((b) => b.style === 'cancel');
  const actionBtns = btns.filter((b) => b.style !== 'cancel');

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss} statusBarTranslucent>
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
      </Animated.View>

      {/* Card */}
      <View style={styles.centerer} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              transform: [{ scale: cardScale }],
              opacity: cardOpacity,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
            {message ? (
              <Text style={[styles.message, { color: colors.mutedForeground }]}>{message}</Text>
            ) : null}
          </View>

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Buttons */}
          <View style={styles.btnGroup}>
            {actionBtns.map((btn, i) => {
              const isDestructive = btn.style === 'destructive';
              return (
                <Pressable
                  key={i}
                  onPress={() => handlePress(btn)}
                  style={({ pressed }) => [
                    styles.btn,
                    isDestructive
                      ? { backgroundColor: colors.destructive, opacity: pressed ? 0.85 : 1 }
                      : { backgroundColor: colors.foreground, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Text
                    style={[
                      styles.btnText,
                      isDestructive
                        ? { color: colors.destructiveForeground }
                        : { color: colors.background },
                    ]}
                  >
                    {btn.text}
                  </Text>
                </Pressable>
              );
            })}

            {cancelBtn ? (
              <Pressable
                onPress={() => handlePress(cancelBtn)}
                style={({ pressed }) => [
                  styles.btn,
                  styles.cancelBtn,
                  { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.btnText, styles.cancelText, { color: colors.mutedForeground }]}>
                  {cancelBtn.text}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const CARD_WIDTH = Math.min(W - 48, 320);

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  centerer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 18,
    gap: 6,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  message: {
    fontSize: 13.5,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
    textAlign: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 0,
  },
  btnGroup: {
    padding: 14,
    gap: 8,
  },
  btn: {
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
  },
  btnText: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.1,
  },
  cancelText: {
    fontFamily: 'Inter_500Medium',
  },
});
