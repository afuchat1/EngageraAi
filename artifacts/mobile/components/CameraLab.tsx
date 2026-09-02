import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions, type CameraCapturedPicture } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import { File, Paths } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/hooks/useAuth';
import { streamChat } from '@/lib/chat';
import type { ChatMessage } from '@/lib/chat';

interface Props {
  onConversationCreated?: (conversationId: number) => void;
}

interface CapturedPhoto {
  uri: string;
  base64: string;
}

const CAMERA_PROMPT =
  'Edit this captured photo according to the user request. Return only the finished image, with no explanation unless the request cannot be completed.';

function extractImageData(content: string): string | null {
  const match = content.match(/data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+/i);
  return match?.[0] ?? null;
}

async function saveDataImageToGallery(dataUri: string): Promise<void> {
  const match = dataUri.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
  if (!match) throw new Error('The result was not a valid image.');

  const extension = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  const file = new File(Paths.cache, `engagera-camera-${Date.now()}.${extension}`);
  file.write(match[2], { encoding: 'base64' });

  const permission = await MediaLibrary.requestPermissionsAsync();
  if (!permission.granted) throw new Error('Gallery permission is required to save the result.');
  await MediaLibrary.saveToLibraryAsync(file.uri);
}

function PermissionCard({
  canAskAgain,
  onRequest,
}: {
  canAskAgain: boolean;
  onRequest: () => void;
}) {
  const colors = useColors();
  return (
    <View style={[styles.permissionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.permissionIcon, { backgroundColor: colors.muted }]}>
        <Ionicons name="camera-outline" size={26} color={colors.foreground} />
      </View>
      <Text style={[styles.permissionTitle, { color: colors.foreground }]}>Camera access needed</Text>
      <Text style={[styles.permissionBody, { color: colors.mutedForeground }]}>
        Engagera uses your camera to turn real-world moments into useful results.
      </Text>
      <Pressable
        testID="camera-permission-button"
        onPress={onRequest}
        style={[styles.primaryButton, { backgroundColor: colors.primary }]}
      >
        <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
          {canAskAgain ? 'Allow camera' : 'Open settings'}
        </Text>
      </Pressable>
    </View>
  );
}

export function CameraLab({ onConversationCreated }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [prompt, setPrompt] = useState('');
  const [resultUri, setResultUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    Keyboard.dismiss();
    setPhoto(null);
    setPrompt('');
    setResultUri(null);
    setSaved(false);
    setBusy(false);
    setStatus('');
    setError(null);
  }, []);

  const capture = useCallback(async () => {
    if (!cameraRef.current || busy) return;
    setError(null);
    try {
      const captured: CameraCapturedPicture | undefined = await cameraRef.current.takePictureAsync({
        quality: 0.78,
        base64: true,
        skipProcessing: false,
      });
      if (!captured?.base64) throw new Error('Could not prepare the photo. Please try again.');
      setPhoto({ uri: captured.uri, base64: captured.base64 });
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : 'Could not take the photo.');
    }
  }, [busy]);

  const createResult = useCallback(async () => {
    if (!photo || !prompt.trim() || busy) return;
    if (!user) {
      router.push('/account');
      return;
    }

    Keyboard.dismiss();
    setBusy(true);
    setSaved(false);
    setResultUri(null);
    setError(null);
    setStatus('Creating your result…');

    let content = '';
    const imageMessage: ChatMessage = {
      role: 'user',
      content: [
        { type: 'text', text: `${CAMERA_PROMPT}\n\nUser request: ${prompt.trim()}` },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${photo.base64}` } },
      ],
    };

    try {
      await streamChat(
        { messages: [imageMessage], model: 'engagera-vision', stream: true, useAfuBot: false, localOnly: true },
        {
          onToken: (chunk) => { content += chunk; },
          onSearchStatus: (message) => setStatus(message),
          onDone: (done) => {
            if (done.conversationId) onConversationCreated?.(done.conversationId);
          },
        },
      );

      const imageData = extractImageData(content);
      if (!imageData) {
        throw new Error('The AI returned a description instead of an image. Try a more specific edit request.');
      }

      setResultUri(imageData);
      setStatus('Saving to your gallery…');
      await saveDataImageToGallery(imageData);
      setSaved(true);
      setStatus('Saved to your gallery');
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Could not create the image.';
      setError(message);
      setStatus(resultUri ? 'Result created, but it was not saved to your gallery' : '');
    } finally {
      setBusy(false);
    }
  }, [busy, onConversationCreated, photo, prompt, user]);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Ionicons name="phone-portrait-outline" size={34} color={colors.foreground} />
        <Text style={[styles.permissionTitle, { color: colors.foreground }]}>Open Engagera on Android</Text>
        <Text style={[styles.permissionBody, { color: colors.mutedForeground }]}>
          Camera Lab is a native camera experience and is available in the Android app.
        </Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <View style={[styles.permissionIcon, { backgroundColor: colors.muted }]}>
          <Ionicons name="camera-outline" size={26} color={colors.foreground} />
        </View>
        <Text style={[styles.permissionTitle, { color: colors.foreground }]}>Your camera studio</Text>
        <Text style={[styles.permissionBody, { color: colors.mutedForeground }]}>
          Sign in to create and save AI results from your camera.
        </Text>
        <Pressable
          testID="camera-sign-in-button"
          onPress={() => router.push('/account')}
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Sign in to begin</Text>
        </Pressable>
      </View>
    );
  }

  if (!permission) {
    return <View style={[styles.centered, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.foreground} /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <PermissionCard
          canAskAgain={permission.canAskAgain}
          onRequest={() => {
            if (permission.canAskAgain) requestPermission();
            else Linking.openSettings().catch(() => {});
          }}
        />
      </View>
    );
  }

  if (photo && !resultUri) {
    return (
      <View style={[styles.editor, { backgroundColor: colors.background }]}>
        <Image source={{ uri: photo.uri }} style={styles.editorImage} resizeMode="cover" />
        <View style={[styles.editorPanel, { backgroundColor: colors.background }]}>
          <View style={styles.editorHeader}>
            <Pressable testID="camera-retake-button" onPress={reset} hitSlop={10} style={styles.iconButton}>
              <Ionicons name="chevron-back" size={24} color={colors.foreground} />
            </Pressable>
            <Text style={[styles.editorTitle, { color: colors.foreground }]}>Describe your result</Text>
            <View style={styles.iconButton} />
          </View>
          <Text style={[styles.editorHint, { color: colors.mutedForeground }]}>
            Tell Engagera what to change, create, or understand from this photo.
          </Text>
          <TextInput
            testID="camera-prompt-input"
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Make the background a clean studio…"
            placeholderTextColor={colors.mutedForeground}
            multiline
            autoFocus
            style={[styles.promptInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
          />
          {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
          <Pressable
            testID="camera-create-button"
            onPress={createResult}
            disabled={!prompt.trim() || busy}
            style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: !prompt.trim() || busy ? 0.45 : 1 }]}
          >
            {busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Ionicons name="sparkles-outline" size={18} color={colors.primaryForeground} />}
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{busy ? status || 'Creating…' : 'Create result'}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (resultUri) {
    return (
      <View style={[styles.result, { backgroundColor: colors.background }]}>
        <Image source={{ uri: resultUri }} style={styles.resultImage} resizeMode="contain" />
        <View style={[styles.resultOverlay, { paddingBottom: insets.bottom + 18 }]}>
          <View style={[styles.savedPill, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name={saved ? 'checkmark-circle' : 'sync-outline'} size={17} color={saved ? colors.foreground : colors.mutedForeground} />
            <Text style={[styles.savedText, { color: error ? colors.destructive : colors.foreground }]}>
              {saved ? 'Saved to gallery' : error ? status : status || 'Saving…'}
            </Text>
          </View>
          <Pressable testID="camera-new-button" onPress={reset} style={[styles.secondaryButton, { borderColor: colors.border }]}>
            <Ionicons name="camera-outline" size={18} color={colors.foreground} />
            <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>Take another</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.camera}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} mode="picture" />
      <View style={[styles.cameraShade, { paddingTop: insets.top + 12 }]}>
        <View style={styles.cameraTopRow}>
          <View>
            <Text style={styles.cameraEyebrow}>CAMERA LAB</Text>
            <Text style={styles.cameraTitle}>Capture a starting point</Text>
          </View>
          <Pressable
            testID="camera-switch-button"
            onPress={() => setFacing((current) => current === 'back' ? 'front' : 'back')}
            hitSlop={10}
            style={styles.cameraIconButton}
          >
            <Ionicons name="camera-reverse-outline" size={22} color="#ffffff" />
          </Pressable>
        </View>
        <View style={styles.focusFrame} pointerEvents="none">
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>
        <View style={[styles.cameraBottom, { paddingBottom: insets.bottom + 14 }]}>
          <Text style={styles.cameraHint}>Take a photo, then describe the result you want.</Text>
          {error ? <Text style={styles.cameraError}>{error}</Text> : null}
          <Pressable testID="camera-capture-button" onPress={capture} style={styles.shutterOuter}>
            <View style={styles.shutterInner} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  camera: { flex: 1, backgroundColor: '#000000' },
  cameraShade: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.12)' },
  cameraTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20 },
  cameraEyebrow: { color: 'rgba(255,255,255,0.64)', fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.8 },
  cameraTitle: { color: '#ffffff', fontSize: 22, fontFamily: 'Inter_700Bold', marginTop: 5, letterSpacing: -0.5 },
  cameraIconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  focusFrame: { width: '78%', aspectRatio: 0.78, alignSelf: 'center', position: 'relative' },
  corner: { width: 30, height: 30, position: 'absolute', borderColor: 'rgba(255,255,255,0.9)' },
  cornerTL: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 },
  cameraBottom: { alignItems: 'center', paddingHorizontal: 20 },
  cameraHint: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontFamily: 'Inter_500Medium', textAlign: 'center', marginBottom: 16 },
  cameraError: { color: '#ffb4b4', fontSize: 12, textAlign: 'center', marginBottom: 10 },
  shutterOuter: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: '#ffffff', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.16)' },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#ffffff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34 },
  permissionCard: { width: '100%', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 22, padding: 24 },
  permissionIcon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  permissionTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', textAlign: 'center', letterSpacing: -0.3 },
  permissionBody: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 8, maxWidth: 300 },
  primaryButton: { minHeight: 48, borderRadius: 999, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20 },
  primaryButtonText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  editor: { flex: 1 },
  editorImage: { width: '100%', height: '48%' },
  editorPanel: { flex: 1, paddingHorizontal: 20, paddingTop: 14 },
  editorHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  editorTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  editorHint: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', marginTop: 8, marginBottom: 14 },
  promptInput: { minHeight: 100, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, lineHeight: 21, fontFamily: 'Inter_400Regular', textAlignVertical: 'top' },
  error: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular', marginTop: 10 },
  result: { flex: 1, justifyContent: 'center' },
  resultImage: { width: '100%', height: '76%' },
  resultOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: 12 },
  savedPill: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 10 },
  savedText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  secondaryButton: { minHeight: 48, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.8)' },
  secondaryButtonText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
});