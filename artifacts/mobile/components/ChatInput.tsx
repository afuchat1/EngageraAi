import React, { useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { hapticImpact } from '@/lib/haptics';

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

/**
 * The app's signature floating pill input — always fully rounded, elevated
 * above the content with a real shadow rather than docked to the bottom
 * edge, so it never feels like an ordinary form field.
 */
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
          <View style={[styles.previewWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Image source={{ uri: image.uri }} style={styles.previewImage} />
            <Pressable
              onPress={() => onImagePicked(null)}
              style={[styles.removeBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
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
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: colors.pill,
          },
          Platform.OS === 'ios' ? styles.shadowIOS : styles.shadowAndroid,
        ]}
      >
        <Pressable onPress={pickImage} disabled={picking || disabled} hitSlop={10} style={styles.iconBtn}>
          {picking ? (
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          ) : (
            <Ionicons name="image-outline" size={20} color={colors.mutedForeground} />
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
            hapticImpact();
            onSend();
          }}
          disabled={!canSend}
          hitSlop={10}
          style={[styles.sendBtn, { backgroundColor: canSend ? colors.primary : colors.secondary }]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Ionicons
              name="arrow-up"
              size={17}
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
  },
  previewRow: {
    marginBottom: 10,
    paddingLeft: 4,
  },
  previewWrap: {
    width: 60,
    height: 60,
    borderRadius: 16,
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
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
  },
  shadowIOS: {
    boxShadow: '0px 10px 20px rgba(0,0,0,0.5)',
  },
  shadowAndroid: {
    elevation: 14,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    maxHeight: 120,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
