import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Keyboard,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { ChatBubble, type DisplayMessage } from '@/components/ChatBubble';
import { ChatInput, type PendingImage } from '@/components/ChatInput';
import { TypingDots } from '@/components/TypingDots';
import { ImageGenIndicator } from '@/components/ImageGenIndicator';
import { BrandMark } from '@/components/BrandMark';

/** The subset of useChatSession that ChatTabView needs. */
interface ChatSession {
  messages: DisplayMessage[];
  inputText: string;
  setInputText: (text: string) => void;
  pendingImage: PendingImage | null;
  setPendingImage: (img: PendingImage | null) => void;
  busy: boolean;
  send: () => void;
  regenerateMessage: (id: string) => void;
  guestBlocked: boolean;
  conversationId: number | undefined;
}

interface Props {
  session: ChatSession;
  /** Displayed in the header center. */
  title: string;
  placeholder: string;
  emptyTitle: string;
  emptyBody: string;
  onOpenSidebar: () => void;
  onNewChat: () => void;
}

// ─── FocusBubble ─────────────────────────────────────────────────────────────
// Wraps a chat item with a gentle slide-up + fade-in on mount.
// Only animates when isNew=true at mount time — history items skip the wrapper.
function FocusBubble({
  isNew,
  children,
}: {
  isNew: boolean;
  children: React.ReactNode;
}) {
  const translateY = useSharedValue(isNew ? 26 : 0);
  const opacity = useSharedValue(isNew ? 0 : 1);

  useEffect(() => {
    if (isNew) {
      translateY.value = withTiming(0, {
        duration: 420,
        easing: Easing.out(Easing.cubic),
      });
      opacity.value = withTiming(1, { duration: 340 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!isNew) return <>{children}</>;
  return <Animated.View style={animStyle}>{children}</Animated.View>;
}

// ─── ChatTabView ──────────────────────────────────────────────────────────────
export function ChatTabView({
  session,
  title,
  placeholder,
  emptyTitle,
  emptyBody,
  onOpenSidebar,
  onNewChat,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [kbHeight, setKbHeight] = useState(0);

  // ── Focus-mode tracking ────────────────────────────────────────────────
  const [animateFromIdx, _setAnimateFromIdx] = useState<number | undefined>(
    undefined,
  );
  const animateFromIdxRef = useRef<number | undefined>(undefined);
  const setAnimateFromIdx = useCallback((v: number | undefined) => {
    animateFromIdxRef.current = v;
    _setAnimateFromIdx(v);
  }, []);

  // y-offset of every rendered message (populated by onLayout).
  const msgYRef = useRef<Map<string, number>>(new Map());
  // ID of the message pinned to the top of the visible area.
  const focusMsgIdRef = useRef<string | null>(null);
  // Waiting for a new message to render so we can read its y-offset.
  const pendingFocusIdRef = useRef<string | null>(null);
  // Expected index of the next user message (set at send time).
  const pendingFocusIndexRef = useRef<number | null>(null);

  const {
    messages,
    inputText,
    setInputText,
    pendingImage,
    setPendingImage,
    busy,
    send,
    regenerateMessage,
    guestBlocked,
  } = session;

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;
  const lastIsPending = !!lastMessage?.pending;

  // Guest cap alert
  useEffect(() => {
    if (!guestBlocked) return;
    Alert.alert(
      'Free messages used up',
      "You've used all your free guest messages. Create a free account to keep chatting, generate images, and unlock all models.",
      [
        { text: 'Sign in', onPress: () => router.push('/account') },
        { text: 'Maybe later', style: 'cancel' },
      ],
    );
  }, [guestBlocked]);

  // ── Scroll helpers ──────────────────────────────────────────────────────
  const scrollToMsg = useCallback((msgId: string, animated = true) => {
    const y = msgYRef.current.get(msgId);
    if (y !== undefined) {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated });
    } else {
      scrollRef.current?.scrollToEnd({ animated });
    }
  }, []);

  // ── Keyboard listeners ──────────────────────────────────────────────────
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setKbHeight(e.endCoordinates.height);
      const id = focusMsgIdRef.current;
      setTimeout(() => {
        if (id) scrollToMsg(id, true);
        else scrollRef.current?.scrollToEnd({ animated: true });
      }, 60);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKbHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [scrollToMsg]);

  // ── onLayout callback for each message row ──────────────────────────────
  const handleMsgLayout = useCallback(
    (msgId: string, e: LayoutChangeEvent) => {
      const y = e.nativeEvent.layout.y;
      msgYRef.current.set(msgId, y);
      if (pendingFocusIdRef.current === msgId) {
        pendingFocusIdRef.current = null;
        setTimeout(() => scrollToMsg(msgId, true), 40);
      }
    },
    [scrollToMsg],
  );

  // ── Watch messages for new sends ────────────────────────────────────────
  useEffect(() => {
    if (
      pendingFocusIndexRef.current !== null &&
      messages.length > pendingFocusIndexRef.current
    ) {
      const idx = pendingFocusIndexRef.current;
      pendingFocusIndexRef.current = null;
      const msg = messages[idx];
      if (!msg) return;
      focusMsgIdRef.current = msg.id;
      setAnimateFromIdx(idx);
      const y = msgYRef.current.get(msg.id);
      if (y !== undefined) {
        setTimeout(() => scrollToMsg(msg.id, true), 60);
      } else {
        pendingFocusIdRef.current = msg.id;
      }
    }
  }, [messages, setAnimateFromIdx, scrollToMsg]);

  // ── Send ────────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    Keyboard.dismiss();
    pendingFocusIndexRef.current = messages.length;
    send();
  }, [send, messages.length]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={onOpenSidebar} hitSlop={10} style={styles.headerBtn}>
          <Ionicons name="menu-outline" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {title}
        </Text>
        <Pressable onPress={onNewChat} hitSlop={10} style={styles.headerBtn}>
          <Ionicons name="create-outline" size={22} color={colors.foreground} />
        </Pressable>
      </View>

      {/* Message list */}
      <View style={styles.flex}>
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyMark}>
              <BrandMark size={48} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {emptyTitle}
            </Text>
            <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
              {emptyBody}
            </Text>
          </View>
        ) : (
          // ScrollView instead of FlatList so we can use exact pixel y-offsets
          // from onLayout to scroll precisely.
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.listContent}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {messages.map((item, index) => {
              const isNew =
                animateFromIdx !== undefined && index >= animateFromIdx;
              const inner =
                item.pending && item.text.length === 0 ? (
                  item.imageGenerating ? (
                    <ImageGenIndicator />
                  ) : (
                    <TypingDots label={item.searchStatus} />
                  )
                ) : (
                  <ChatBubble
                    message={item}
                    onRegenerate={
                      item.role === 'assistant' ? regenerateMessage : undefined
                    }
                  />
                );
              return (
                <View
                  key={item.id}
                  onLayout={(e) => handleMsgLayout(item.id, e)}
                >
                  <FocusBubble isNew={isNew}>{inner}</FocusBubble>
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* paddingBottom expands when the keyboard is up to push the input
            bar above it. kbHeight is the raw keyboard height because
            KeyboardProvider sets adjustNothing — no double-offset risk. */}
        <View
          style={{
            paddingBottom: kbHeight > 0 ? kbHeight + 6 : insets.bottom + 10,
            paddingTop: 8,
          }}
        >
          <ChatInput
            value={inputText}
            onChangeText={setInputText}
            onSend={handleSend}
            image={pendingImage}
            onImagePicked={setPendingImage}
            busy={!!busy || !!lastIsPending}
            disabled={!!guestBlocked}
            placeholder={
              guestBlocked ? 'Sign in to keep chatting…' : placeholder
            }
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: 'SpaceGrotesk_600SemiBold',
    letterSpacing: -0.2,
  },
  headerBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: Dimensions.get('window').height,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 40,
  },
  emptyMark: { alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: {
    fontSize: 19,
    fontFamily: 'SpaceGrotesk_600SemiBold',
    letterSpacing: -0.2,
  },
  emptyBody: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 19,
  },
});
