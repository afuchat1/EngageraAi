import React, { useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Native-only modules — guarded by Platform checks at call sites
const File = Platform.OS !== 'web' ? require('expo-file-system').File : null;
const Paths = Platform.OS !== 'web' ? require('expo-file-system').Paths : null;
const MediaLibrary = Platform.OS !== 'web' ? require('expo-media-library') : null;
const Sharing = Platform.OS !== 'web' ? require('expo-sharing') : null;
const Haptics = Platform.OS !== 'web' ? require('expo-haptics') : null;

const { width: W, height: H } = Dimensions.get('window');

interface Props {
  uri: string;
  visible: boolean;
  onClose: () => void;
}

export function ImageLightbox({ uri, visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const ext = uri.toLowerCase().includes('.png') ? 'png' : 'jpg';

  /** Save image to camera roll / gallery. */
  const handleDownload = async () => {
    if (downloading || sharing) return;
    setDownloading(true);
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      if (Platform.OS === 'web') {
        // Web: open in new tab so user can long-press / right-click to save
        window.open(uri, '_blank');
        showToast('Opened in new tab');
        return;
      }
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        showToast('Gallery permission denied');
        return;
      }
      const dest = new File(Paths.cache, `engagera_dl_${Date.now()}.${ext}`);
      const saved = await File.downloadFileAsync(uri, dest);
      await MediaLibrary.saveToLibraryAsync(saved.uri);
      showToast('Saved to gallery ✓');
    } catch {
      showToast('Could not save image');
    } finally {
      setDownloading(false);
    }
  };

  /** Share image via the native share sheet. */
  const handleShare = async () => {
    if (downloading || sharing) return;
    setSharing(true);
    Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      if (Platform.OS === 'web') {
        if (navigator.share) {
          await navigator.share({ url: uri });
        } else {
          await Share.share({ message: uri });
        }
        return;
      }
      const dest = new File(Paths.cache, `engagera_sh_${Date.now()}.${ext}`);
      const downloaded = await File.downloadFileAsync(uri, dest);
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(downloaded.uri, {
          mimeType: `image/${ext}`,
          dialogTitle: 'Share image',
        });
      } else {
        await Share.share({ message: uri });
      }
    } catch {
      // User cancelled — nothing to surface.
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.iconBtn}>
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
        </View>

        {/* Image fills the middle */}
        <View style={styles.imageWrap}>
          <Image
            source={{ uri }}
            style={styles.image}
            contentFit="contain"
            transition={120}
          />
        </View>

        {/* Bottom actions — Download and Share as separate pill buttons */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 20 }]}>
          <Pressable
            onPress={handleDownload}
            disabled={downloading || sharing}
            style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          >
            {downloading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="download-outline" size={20} color="#fff" />
            )}
            <Text style={styles.actionLabel}>Download</Text>
          </Pressable>

          <Pressable
            onPress={handleShare}
            disabled={downloading || sharing}
            style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          >
            {sharing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="share-outline" size={20} color="#fff" />
            )}
            <Text style={styles.actionLabel}>Share</Text>
          </Pressable>
        </View>

        {/* Toast feedback */}
        {toast ? (
          <View style={[styles.toast, { bottom: insets.bottom + 110 }]}>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrap: {
    flex: 1,
    width: W,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: W,
    height: H * 0.72,
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingTop: 16,
    paddingHorizontal: 24,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  actionBtnPressed: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  actionLabel: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  toastText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
});
