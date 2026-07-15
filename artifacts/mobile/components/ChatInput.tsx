import React, { useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
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

interface AttachOption {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  comingSoon?: boolean;
}

const ATTACH_OPTIONS: AttachOption[] = [
  { key: 'photo', label: 'Photo', icon: 'image-outline' },
  { key: 'document', label: 'Document', icon: 'document-text-outline', comingSoon: true },
  { key: 'camera', label: 'Camera', icon: 'camera-outline', comingSoon: true },
  { key: 'audio', label: 'Audio', icon: 'mic-outline', comingSoon: true },
];

/**
 * The app's signature floating pill input. The pill itself only ever holds
 * the text field — attaching a file and sending are their own standalone
 * round buttons flanking it (a "+" that opens an attachment menu, and a
 * send plane), so the pill stays a pure text field.
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
  const [menuOpen, setMenuOpen] = useState(false);

  const canSend = !disabled && !busy && (value.trim().length > 0 || !!image);

  const pickImage = async () => {
    setMenuOpen(false);
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

  const handleOptionPress = (option: AttachOption) => {
    if (option.comingSoon) return;
    if (option.key === 'photo') pickImage();
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

      {menuOpen ? (
        <>
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)} />
          <View
            style={[
              styles.menu,
              { backgroundColor: colors.card, borderColor: colors.border },
              Platform.OS === 'ios' ? styles.shadowIOS : styles.shadowAndroid,
            ]}
          >
            {ATTACH_OPTIONS.map((option) => (
              <Pressable
                key={option.key}
                onPress={() => handleOptionPress(option)}
                disabled={option.comingSoon}
                style={({ pressed }) => [
                  styles.menuRow,
                  { backgroundColor: pressed && !option.comingSoon ? colors.muted : 'transparent' },
                ]}
              >
                <Ionicons
                  name={option.icon}
                  size={18}
                  color={option.comingSoon ? colors.mutedForeground : colors.foreground}
                />
                <Text
                  style={[
                    styles.menuLabel,
                    { color: option.comingSoon ? colors.mutedForeground : colors.foreground },
                  ]}
                >
                  {option.label}
                </Text>
                {option.comingSoon ? (
                  <View style={[styles.soonBadge, { backgroundColor: colors.muted }]}>
                    <Text style={[styles.soonText, { color: colors.mutedForeground }]}>Soon</Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.inputRow}>
        <Pressable
          onPress={() => setMenuOpen((open) => !open)}
          disabled={disabled}
          hitSlop={10}
          style={[styles.roundBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          {picking ? (
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          ) : (
            <Ionicons name={menuOpen ? 'close' : 'add'} size={22} color={colors.foreground} />
          )}
        </Pressable>

        <View
          style={[
            styles.pill,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.pill,
            },
            Platform.OS === 'ios' ? styles.shadowIOS : styles.shadowAndroid,
          ]}
        >
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground }]}
            multiline
            editable={!disabled}
          />
        </View>

        <Pressable
          onPress={onSend}
          disabled={!canSend}
          hitSlop={10}
          style={[
            styles.sendBtn,
            { backgroundColor: canSend ? colors.primary : colors.secondary },
            canSend && Platform.OS === 'ios' ? styles.shadowIOS : null,
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Ionicons
              name="send"
              size={18}
              color={canSend ? colors.primaryForeground : colors.mutedForeground}
              style={styles.sendIcon}
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  roundBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 4,
    minHeight: 42,
    justifyContent: 'center',
  },
  shadowIOS: {
    boxShadow: '0px 10px 20px rgba(0,0,0,0.5)',
  },
  shadowAndroid: {
    elevation: 14,
  },
  input: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    maxHeight: 120,
    paddingVertical: 8,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: {
    // Telegram's paper plane points up-and-right; nudge it to sit visually
    // centered against its own diagonal silhouette instead of the box.
    transform: [{ translateX: 1 }, { translateY: -1 }],
  },
  menuBackdrop: {
    position: 'absolute',
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -1000,
  },
  menu: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    marginBottom: 10,
    width: 200,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    zIndex: 20,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  menuLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  soonBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  soonText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.2,
  },
});
