import React, { useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

/**
 * Compact action row shown under a finished assistant message.
 * Actions: copy · thumbs up · thumbs down · listen · share · more (delete)
 * Mirrors the web app's MessageActions bar in capabilities and feel.
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

  const handleMore = () => {
    Alert.alert('Message options', undefined, [
      ...(onRegenerate ? [{ text: 'Regenerate', onPress: onRegenerate }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const activeColor = colors.foreground;
  const mutedColor = colors.mutedForeground;

  return (
    <View style={styles.row}>
      <ActionButton
        icon={copied ? 'checkmark' : 'copy-outline'}
        color={copied ? activeColor : mutedColor}
        onPress={handleCopy}
      />
      <ActionButton
        icon="thumbs-up-outline"
        color={feedback === 'up' ? activeColor : mutedColor}
        onPress={() => handleFeedback('up')}
      />
      <ActionButton
        icon="thumbs-down-outline"
        color={feedback === 'down' ? activeColor : mutedColor}
        onPress={() => handleFeedback('down')}
      />
      <ActionButton
        icon={speaking ? 'stop-circle-outline' : 'volume-medium-outline'}
        color={speaking ? activeColor : mutedColor}
        onPress={handleSpeak}
      />
      <ActionButton icon="share-outline" color={mutedColor} onPress={handleShare} />
      {onRegenerate && (
        <ActionButton icon="ellipsis-horizontal" color={mutedColor} onPress={handleMore} />
      )}
    </View>
  );
}

function ActionButton({
  icon,
  color,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
    >
      <Ionicons name={icon} size={16} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  btn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  btnPressed: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
});
