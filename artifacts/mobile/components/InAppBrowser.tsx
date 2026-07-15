import React, { useCallback, useRef, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import WebView, { type WebViewNavigation } from 'react-native-webview';
import { useColors } from '@/hooks/useColors';

interface Props {
  url: string | null;
  onClose: () => void;
}

export function InAppBrowser({ url, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const [navState, setNavState] = useState<WebViewNavigation | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [urlBarText, setUrlBarText] = useState('');
  const [editingUrl, setEditingUrl] = useState(false);
  const urlInputRef = useRef<TextInput>(null);

  const currentUrl = navState?.url ?? url ?? '';
  const canGoBack = navState?.canGoBack ?? false;
  const canGoForward = navState?.canGoForward ?? false;
  const isLoading = navState ? navState.loading : true;

  const displayUrl = (() => {
    try {
      const u = new URL(currentUrl);
      return u.hostname + (u.pathname !== '/' ? u.pathname : '');
    } catch {
      return currentUrl;
    }
  })();

  const handleNavState = useCallback((state: WebViewNavigation) => {
    setNavState(state);
    if (!editingUrl) setUrlBarText(state.url ?? '');
  }, [editingUrl]);

  const handleUrlSubmit = () => {
    let target = urlBarText.trim();
    if (!target) return;
    if (!/^https?:\/\//i.test(target)) {
      target = target.includes('.') && !target.includes(' ')
        ? `https://${target}`
        : `https://www.google.com/search?q=${encodeURIComponent(target)}`;
    }
    setEditingUrl(false);
    webViewRef.current?.injectJavaScript(`window.location.href = ${JSON.stringify(target)};`);
  };

  const handleShare = async () => {
    try {
      await Share.share({ url: currentUrl, message: currentUrl });
    } catch { /**/ }
  };

  const handleOpenExternal = () => {
    Linking.openURL(currentUrl).catch(() => {});
  };

  if (!url) return null;

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* ── Nav bar ─────────────────────────────────────────────────────── */}
        <View style={[styles.navBar, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
          <Pressable
            onPress={() => webViewRef.current?.goBack()}
            disabled={!canGoBack}
            hitSlop={8}
            style={styles.navBtn}
          >
            <Ionicons
              name="chevron-back"
              size={22}
              color={canGoBack ? colors.foreground : colors.mutedForeground}
            />
          </Pressable>

          <Pressable
            onPress={() => webViewRef.current?.goForward()}
            disabled={!canGoForward}
            hitSlop={8}
            style={styles.navBtn}
          >
            <Ionicons
              name="chevron-forward"
              size={22}
              color={canGoForward ? colors.foreground : colors.mutedForeground}
            />
          </Pressable>

          {/* URL bar */}
          <Pressable
            style={[styles.urlBar, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {
              setUrlBarText(currentUrl);
              setEditingUrl(true);
              setTimeout(() => urlInputRef.current?.focus(), 50);
            }}
          >
            {editingUrl ? (
              <TextInput
                ref={urlInputRef}
                style={[styles.urlInput, { color: colors.foreground }]}
                value={urlBarText}
                onChangeText={setUrlBarText}
                onSubmitEditing={handleUrlSubmit}
                onBlur={() => setEditingUrl(false)}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="go"
                selectTextOnFocus
              />
            ) : (
              <Text style={[styles.urlText, { color: colors.mutedForeground }]} numberOfLines={1}>
                {isLoading ? '⟳  Loading…' : `🔒  ${displayUrl}`}
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={isLoading ? () => webViewRef.current?.stopLoading() : () => webViewRef.current?.reload()}
            hitSlop={8}
            style={styles.navBtn}
          >
            <Ionicons
              name={isLoading ? 'close-outline' : 'refresh-outline'}
              size={20}
              color={colors.foreground}
            />
          </Pressable>

          <Pressable onPress={handleShare} hitSlop={8} style={styles.navBtn}>
            <Ionicons name={Platform.OS === 'ios' ? 'share-outline' : 'share-social-outline'} size={20} color={colors.foreground} />
          </Pressable>

          <Pressable onPress={handleOpenExternal} hitSlop={8} style={styles.navBtn}>
            <Ionicons name="open-outline" size={18} color={colors.foreground} />
          </Pressable>

          <Pressable onPress={onClose} hitSlop={8} style={styles.navBtn}>
            <Ionicons name="close" size={22} color={colors.foreground} />
          </Pressable>
        </View>

        {/* ── Progress bar ─────────────────────────────────────────────────── */}
        {isLoading && loadProgress > 0 && loadProgress < 1 ? (
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View
              style={[styles.progressFill, { width: `${loadProgress * 100}%`, backgroundColor: colors.foreground }]}
            />
          </View>
        ) : null}

        {/* ── WebView ───────────────────────────────────────────────────────── */}
        <WebView
          ref={webViewRef}
          source={{ uri: url }}
          style={styles.webView}
          onNavigationStateChange={handleNavState}
          onLoadProgress={({ nativeEvent }) => setLoadProgress(nativeEvent.progress)}
          onLoad={() => setLoadProgress(1)}
          onError={() => setLoadProgress(0)}
          allowsBackForwardNavigationGestures
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          sharedCookiesEnabled
          domStorageEnabled
          javaScriptEnabled
          userAgent="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  navBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  urlBar: {
    flex: 1,
    height: 34,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  urlText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  urlInput: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    padding: 0,
  },
  progressTrack: {
    height: 2,
    width: '100%',
  },
  progressFill: {
    height: 2,
  },
  webView: { flex: 1 },
});
