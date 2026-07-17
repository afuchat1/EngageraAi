import React, { useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

/**
 * Compact action row shown under a finished assistant message — copy,
 * share, regenerate, read aloud, and a "more" overflow. Kept to small
 * muted icon buttons on one line so it stays out of the way of reading.
 */
export function MessageActions({
  text,
  onRegenerate,
  onDelete,
}: {
  text: string;
  onRegenerate: () => void;
  onDelete: () => void;
}) {
  const colors = useColors();
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: text });
    } catch {
      // User cancelled or share sheet failed — nothing to surface.
    }
  };

  const handleSpeak = async () => {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    Speech.speak(text, { onDone: () => setSpeaking(false), onStopped: () => setSpeaking(false), onError: () => setSpeaking(false) });
  };

  const handleMore = () => {
    Alert.alert('Message options', undefined, [
      { text: 'Delete response', style: 'destructive', onPress: onDelete },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.row}>
      <ActionButton icon={copied ? 'checkmark' : 'copy-outline'} color={colors.mutedForeground} onPress={handleCopy} />
      <ActionButton icon="refresh-outline" color={colors.mutedForeground} onPress={onRegenerate} />
      <ActionButton
        icon={speaking ? 'stop-circle-outline' : 'volume-medium-outline'}
        color={speaking ? colors.foreground : colors.mutedForeground}
        onPress={handleSpeak}
      />
      <ActionButton icon="share-outline" color={colors.mutedForeground} onPress={handleShare} />
      <ActionButton icon="ellipsis-horizontal" color={colors.mutedForeground} onPress={handleMore} />
    </View>
  );
}

function ActionButton({ icon, color, onPress }: { icon: keyof typeof Ionicons.glyphMap; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.btn}>
      <Ionicons name={icon} size={16} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  btn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
