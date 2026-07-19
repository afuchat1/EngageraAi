import React, { useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
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

  const handleDownload = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      // Share as plain text so the native sheet offers "Save to Files" on Android/iOS.
      await Share.share({ message: text, title: 'Save message' });
    } catch {
      // User cancelled — nothing to surface.
    }
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
        label="Copy"
        onPress={handleCopy}
      />
      <ActionButton
        icon="thumbs-up-outline"
        color={feedback === 'up' ? activeColor : mutedColor}
        label="Good"
        onPress={() => handleFeedback('up')}
      />
      <ActionButton
        icon="thumbs-down-outline"
        color={feedback === 'down' ? activeColor : mutedColor}
        label="Bad"
        onPress={() => handleFeedback('down')}
      />
      <ActionButton
        icon={speaking ? 'stop-circle-outline' : 'volume-medium-outline'}
        color={speaking ? activeColor : mutedColor}
        label={speaking ? 'Stop' : 'Listen'}
        onPress={handleSpeak}
      />
      <ActionButton icon="download-outline" color={mutedColor} label="Save" onPress={handleDownload} />
      <ActionButton icon="share-outline" color={mutedColor} label="Share" onPress={handleShare} />
      {onRegenerate && (
        <ActionButton icon="refresh-outline" color={mutedColor} label="Retry" onPress={handleMore} />
      )}
    </View>
  );
}

function ActionButton({
  icon,
  color,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
    >
      <Ionicons name={icon} size={15} color={color} />
      <Text style={[styles.btnLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  btnPressed: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  btnLabel: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
  },
});
