import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { useChatSession } from '@/hooks/useChatSession';
import { ChatBubble, type DisplayMessage } from '@/components/ChatBubble';
import { ChatInput } from '@/components/ChatInput';
import { TypingDots } from '@/components/TypingDots';
import { ImageGenIndicator } from '@/components/ImageGenIndicator';
import { BrandMark } from '@/components/BrandMark';
import { ModeSwitch, type ChatMode } from '@/components/ModeSwitch';
import { Sidebar } from '@/components/Sidebar';
import { CHAT_MODEL, LAB_MODEL } from '@/lib/chat';
import { fetchConversationMessages, type ConversationSummary } from '@/lib/conversations';
import { SearchEngine } from '@/components/SearchEngine';

const CHAT_COPY = {
  placeholder: 'Message Engagera…',
  emptyTitle: 'Ask me anything',
  emptyBody: 'Attach a photo and I can read, describe, or reason about it too.',
};

// ─── FocusBubble ────────────────────────────────────────────────────────────
// Wraps a chat item with a gentle slide-up + fade-in on mount.
// Only plays the animation when isNew=true at mount time — history renders
// instantly. Because it only reads isNew once (empty dep array), re-renders
// caused by FlatList recycling don't re-trigger the animation.
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
        duration: 400,
        easing: Easing.out(Easing.cubic),
      });
      opacity.value = withTiming(1, { duration: 320 });
    }
    // Intentionally empty deps — animate on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  // Skip the Animated.View wrapper entirely for old messages to keep
  // the render path lightweight.
  if (!isNew) return <>{children}</>;
  return <Animated.View style={animStyle}>{children}</Animated.View>;
}

// ─── ChatScreen ──────────────────────────────────────────────────────────────
export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);
  const [mode, setMode] = useState<ChatMode>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  // Tracks the keyboard height for manual avoidance. KeyboardProvider from
  // react-native-keyboard-controller sets windowSoftInputMode=adjustNothing
  // globally, so neither the OS nor the stock KeyboardAvoidingView can move
  // the layout. We listen to Keyboard events (which still fire under
  // adjustNothing) and pad the input container ourselves.
  const [kbHeight, setKbHeight] = useState(0);

  // ── Focus mode state ────────────────────────────────────────────────────
  // animateFromIdx: messages at this index and above slide/fade in on mount.
  //   undefined = no animation (fresh load or loaded conversation).
  // focusScrollIdxRef: where to scroll when a new conversation pair starts or
  //   the keyboard pops up. Kept as a ref so keyboard listeners stay stable.
  const [animateFromIdx, _setAnimateFromIdx] = useState<number | undefined>(undefined);
  const animateFromIdxRef = useRef<number | undefined>(undefined);
  const focusScrollIdxRef = useRef(0);

  const setAnimateFromIdx = useCallback((v: number | undefined) => {
    animateFromIdxRef.current = v;
    _setAnimateFromIdx(v);
  }, []);

  // Records the expected index of the next user message (set at send time) so
  // we can scroll to it once FlatList has rendered that item.
  const pendingFocusRef = useRef<number | null>(null);

  // ── Sessions ────────────────────────────────────────────────────────────
  const chatSession = useChatSession(CHAT_MODEL);
  const labSession = useChatSession(LAB_MODEL, 'research');
  const session = mode === 'chat' ? chatSession : labSession;
  const copy = CHAT_COPY;

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
    conversationId,
  } = session;

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

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;
  const lastIsPending = !!lastMessage?.pending;

  // ── scrollToFocus ────────────────────────────────────────────────────────
  // Smoothly scrolls the list so the first message of the active conversation
  // pair is pinned at the top of the visible area. Falls back to scrollToEnd
  // for index 0 (first-ever message) or empty lists.
  const scrollToFocus = useCallback(
    (idx: number, animated = true) => {
      if (idx <= 0 || messages.length === 0) {
        listRef.current?.scrollToEnd({ animated });
        return;
      }
      const safeIdx = Math.min(idx, messages.length - 1);
      listRef.current?.scrollToIndex({
        index: safeIdx,
        animated,
        viewPosition: 0,  // pin to top of visible area
        viewOffset: 4,
      });
    },
    [messages.length],
  );

  // ── Keyboard listeners (manual avoidance) ───────────────────────────────
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setKbHeight(e.endCoordinates.height);
      // Re-pin the active conversation to the top so it isn't hidden behind
      // the keyboard.
      const fi = focusScrollIdxRef.current;
      setTimeout(() => scrollToFocus(fi), 60);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKbHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [scrollToFocus]);

  // ── Pending-focus effect ─────────────────────────────────────────────────
  // After send() adds the new user message to the list, scroll to it and
  // mark messages from that index onwards as "new" (→ fade-in animation).
  useEffect(() => {
    if (pendingFocusRef.current !== null && messages.length > pendingFocusRef.current) {
      const idx = pendingFocusRef.current;
      pendingFocusRef.current = null;
      focusScrollIdxRef.current = idx;
      setAnimateFromIdx(idx);
      setTimeout(() => scrollToFocus(idx), 100);
    }
  }, [messages, setAnimateFromIdx, scrollToFocus]);

  // ── Send ─────────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    Keyboard.dismiss();
    // Record where the new user message will land so the pending-focus effect
    // can scroll to it once FlatList has rendered it.
    pendingFocusRef.current = messages.length;
    send();
  }, [send, messages.length]);

  // ── New chat ─────────────────────────────────────────────────────────────
  const handleNewChat = useCallback(() => {
    chatSession.startNewConversation();
    labSession.startNewConversation();
    setAnimateFromIdx(undefined);
    focusScrollIdxRef.current = 0;
    setSidebarOpen(false);
  }, [chatSession, labSession, setAnimateFromIdx]);

  // ── Load conversation ────────────────────────────────────────────────────
  const handleSelectConversation = useCallback(
    async (conv: ConversationSummary) => {
      const targetMode: ChatMode = conv.model === LAB_MODEL ? 'lab' : 'chat';
      const target = targetMode === 'lab' ? labSession : chatSession;
      try {
        const history = await fetchConversationMessages(conv.id);
        const displayMessages: DisplayMessage[] = history
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({
            id: String(m.id),
            role: m.role as 'user' | 'assistant',
            text: m.content,
            searchInfo:
              m.sources && m.sources.length > 0
                ? { query: '', sources: m.sources }
                : undefined,
            timeInfo: m.timeInfo,
            weatherInfo: m.weatherInfo,
          }));
        target.loadConversation(conv.id, displayMessages);

        // Scroll to the last user message so the final exchange is visible.
        // No fade-in animation — this is a history load, not a fresh send.
        const lastUserIdx = displayMessages.reduce(
          (best, m, i) => (m.role === 'user' ? i : best),
          0,
        );
        setAnimateFromIdx(undefined);
        focusScrollIdxRef.current = lastUserIdx;
        setMode(targetMode);
        setSidebarOpen(false);
        setTimeout(() => scrollToFocus(lastUserIdx, false), 150);
      } catch {
        Alert.alert('Could not open chat', 'Please check your connection and try again.');
      }
    },
    [chatSession, labSession, setAnimateFromIdx, scrollToFocus],
  );

  // ── renderItem ────────────────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item, index }: { item: DisplayMessage; index: number }) => {
      // A message is "new" (and should animate in) only if it belongs to the
      // current send — i.e. its index is at or after animateFromIdx.
      const isNew = animateFromIdx !== undefined && index >= animateFromIdx;

      const bubble =
        item.pending && item.text.length === 0 ? (
          item.imageGenerating ? (
            <ImageGenIndicator />
          ) : (
            <TypingDots label={item.searchStatus} />
          )
        ) : (
          <ChatBubble
            message={item}
            onRegenerate={item.role === 'assistant' ? regenerateMessage : undefined}
          />
        );

      return <FocusBubble isNew={isNew}>{bubble}</FocusBubble>;
    },
    [animateFromIdx, regenerateMessage],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable
          onPress={() => {
            setSidebarOpen(true);
            setRefreshToken((t) => t + 1);
          }}
          hitSlop={10}
          style={styles.headerBtn}
        >
          <Ionicons name="menu-outline" size={24} color={colors.foreground} />
        </Pressable>

        <ModeSwitch value={mode} onChange={setMode} />

        <Pressable onPress={handleNewChat} hitSlop={10} style={styles.headerBtn}>
          <Ionicons name="create-outline" size={22} color={colors.foreground} />
        </Pressable>
      </View>

      {/* Lab — always mounted so search/AI state survives mode switches */}
      <View style={[styles.flex, mode !== 'lab' && styles.hidden]}>
        <SearchEngine topPad={0} />
      </View>

      {/* Chat — always mounted for same reason */}
      <View style={[styles.flex, mode !== 'chat' && styles.hidden]}>
        <View style={styles.flex}>
          {messages.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyMark}>
                <BrandMark size={48} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {copy.emptyTitle}
              </Text>
              <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                {copy.emptyBody}
              </Text>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              // extraData ensures renderItem re-evaluates when animateFromIdx changes
              // (otherwise memoized items wouldn't pick up the new isNew values).
              extraData={animateFromIdx}
              contentContainerStyle={styles.listContent}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              // Keep a generous render window so history is immediately available
              // when the user scrolls up, without virtualization gaps.
              initialNumToRender={30}
              windowSize={12}
              onScrollToIndexFailed={({ index }) => {
                // The item isn't in the render window yet — scroll to end to
                // force it into view, then retry.
                listRef.current?.scrollToEnd({ animated: false });
                setTimeout(() => {
                  listRef.current?.scrollToIndex({
                    index,
                    animated: true,
                    viewPosition: 0,
                    viewOffset: 4,
                  });
                }, 120);
              }}
            />
          )}

          {/* paddingBottom expands when the keyboard is up to push the input
              bar above it. kbHeight is always the raw keyboard height because
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
              busy={busy || lastIsPending}
              disabled={guestBlocked}
              placeholder={guestBlocked ? 'Sign in to keep chatting…' : copy.placeholder}
            />
          </View>
        </View>
      </View>

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewChat={handleNewChat}
        onSelectConversation={handleSelectConversation}
        activeConversationId={conversationId}
        refreshToken={refreshToken}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  // Keeps a view mounted (state preserved) but completely invisible + layout-free
  hidden: { display: 'none' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  headerBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: { padding: 16, paddingBottom: 4 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 40,
  },
  emptyMark: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
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
