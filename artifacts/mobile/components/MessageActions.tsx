import React, { useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useDialog } from '@/contexts/DialogContext';

/**
 * Icon-only action row shown under a finished assistant message.
 * Bold pill buttons — no text labels.
 * Actions: copy · thumbs-up · thumbs-down · listen · share · retry
 */
export function MessageActions({
  text,
  onRegenerate,
}: {
  text: string;
  onRegenerate?: () => void;
}) {
  const colors = useColors();
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [speaking, setSpeaking] = useState(false);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(text);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleFeedback = (direction: 'up' | 'down') => {
    const next = feedback === direction ? null : direction;
    setFeedback(next);
    if (next) Haptics.selectionAsync().catch(() => {});
  };

  const handleSpeak = async () => {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    Speech.speak(text, {
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: text });
    } catch {
      // User cancelled — nothing to surface.
    }
  };

  const { show: showDialog } = useDialog();

  const handleMore = () => {
    showDialog('Message options', undefined, [
      ...(onRegenerate ? [{ text: 'Regenerate', onPress: onRegenerate }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const activeColor = colors.foreground;
  const mutedColor = colors.mutedForeground;

  return (
    <View style={styles.row}>
      <Btn
        icon={copied ? 'checkmark' : 'copy-outline'}
        color={copied ? activeColor : mutedColor}
        active={copied}
        onPress={handleCopy}
        colors={colors}
      />
      <Btn
        icon="thumbs-up-outline"
        color={feedback === 'up' ? activeColor : mutedColor}
        active={feedback === 'up'}
        onPress={() => handleFeedback('up')}
        colors={colors}
      />
      <Btn
        icon="thumbs-down-outline"
        color={feedback === 'down' ? activeColor : mutedColor}
        active={feedback === 'down'}
        onPress={() => handleFeedback('down')}
        colors={colors}
      />
      <Btn
        icon={speaking ? 'stop-circle-outline' : 'volume-medium-outline'}
        color={speaking ? activeColor : mutedColor}
        active={speaking}
        onPress={handleSpeak}
        colors={colors}
      />
      <Btn
        icon="share-outline"
        color={mutedColor}
        onPress={handleShare}
        colors={colors}
      />
      {onRegenerate && (
        <Btn
          icon="refresh-outline"
          color={mutedColor}
          onPress={handleMore}
          colors={colors}
        />
      )}
    </View>
  );
}

function Btn({
  icon,
  color,
  active,
  onPress,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  active?: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.btn,
        {
          borderColor: active ? colors.foreground : 'rgba(255,255,255,0.13)',
          backgroundColor: active
            ? colors.foreground + '18'
            : pressed
            ? 'rgba(255,255,255,0.08)'
            : 'transparent',
        },
      ]}
    >
      <Ionicons name={icon} size={17} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  btn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
