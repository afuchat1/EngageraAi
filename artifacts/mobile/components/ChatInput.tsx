import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

export interface PendingImage {
  uri: string;
  base64: string;
  mimeType: string;
}

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  image: PendingImage | null;
  onImagePicked: (image: PendingImage | null) => void;
  disabled?: boolean;
  busy?: boolean;
  placeholder?: string;
}

export function ChatInput({
  value,
  onChangeText,
  onSend,
  image,
  onImagePicked,
  disabled,
  busy,
  placeholder = 'Message Engagera…',
}: Props) {
  const colors = useColors();
  const [picking, setPicking] = useState(false);

  const canSend = !disabled && !busy && (value.trim().length > 0 || !!image);

  const pickImage = async () => {
    setPicking(true);
    try {
      // Gallery only — no camera permission is requested since capture
      // isn't a feature of this app, keeping permissions to what's used.
      const permission = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        const requested = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!requested.granted) {
          setPicking(false);
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        base64: true,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets[0]?.base64) {
        const asset = result.assets[0];
        onImagePicked({
          uri: asset.uri,
          base64: asset.base64!,
          mimeType: asset.mimeType ?? 'image/jpeg',
        });
      }
    } finally {
      setPicking(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      {image ? (
        <View style={styles.previewRow}>
          <View style={[styles.previewWrap, { borderColor: colors.border }]}>
            <Image source={{ uri: image.uri }} style={styles.previewImage} />
            <Pressable
              onPress={() => onImagePicked(null)}
              style={[styles.removeBtn, { backgroundColor: colors.background }]}
              hitSlop={8}
            >
              <Ionicons name="close" size={12} color={colors.foreground} />
            </Pressable>
          </View>
        </View>
      ) : null}
      <View
        style={[
          styles.row,
          { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius + 8 },
        ]}
      >
        <Pressable onPress={pickImage} disabled={picking || disabled} hitSlop={10} style={styles.iconBtn}>
          {picking ? (
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          ) : (
            <Ionicons name="image-outline" size={22} color={colors.mutedForeground} />
          )}
        </Pressable>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { color: colors.foreground }]}
          multiline
          editable={!disabled}
        />
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onSend();
          }}
          disabled={!canSend}
          hitSlop={10}
          style={[
            styles.sendBtn,
            { backgroundColor: canSend ? colors.primary : colors.secondary },
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Ionicons
              name="arrow-up"
              size={18}
              color={canSend ? colors.primaryForeground : colors.mutedForeground}
            />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  previewRow: {
    marginBottom: 8,
  },
  previewWrap: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  removeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
  },
  iconBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    fontSize: 16,
    maxHeight: 120,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
