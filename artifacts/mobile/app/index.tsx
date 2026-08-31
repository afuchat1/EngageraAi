import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
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
import { useDialog } from '@/contexts/DialogContext';
import { AudioChatModal } from '@/components/AudioChatModal';
import { useAuth } from '@/hooks/useAuth';

const CHAT_COPY = {
  placeholder: 'Message Engagera…',
  emptyTitle: 'Ask me anything',
  emptyBody: 'Attach a photo and I can read, describe, or reason about it too.',
};

// ─── FocusBubble ─────────────────────────────────────────────────────────────
// Wraps a chat item with a gentle slide-up + fade-in on mount.
// Only animates when isNew=true at mount time — history items skip the wrapper.
function FocusBubble({ isNew, children }: { isNew: boolean; children: React.ReactNode }) {
  const translateY = useSharedValue(isNew ? 26 : 0);
  const opacity = useSharedValue(isNew ? 0 : 1);

  useEffect(() => {
    if (isNew) {
      translateY.value = withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) });
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

// ─── ChatScreen ───────────────────────────────────────────────────────────────
export default function ChatScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const { show: showDialog } = useDialog();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [mode, setMode] = useState<ChatMode>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [kbHeight, setKbHeight] = useState(0);
  const [audioChatOpen, setAudioChatOpen] = useState(false);

  // ── Focus-mode tracking ──────────────────────────────────────────────────
  // animateFromIdx: items at this index and above slide+fade in on mount.
  const [animateFromIdx, _setAnimateFromIdx] = useState<number | undefined>(undefined);
  const animateFromIdxRef = useRef<number | undefined>(undefined);
  const setAnimateFromIdx = useCallback((v: number | undefined) => {
    animateFromIdxRef.current = v;
    _setAnimateFromIdx(v);
  }, []);

  // Stores the y-offset (in scroll-content coordinates) of every rendered message.
  // Populated by onLayout on each message wrapper. Used to scroll precisely so the
  // current user message sits at the very top of the visible area.
  const msgYRef = useRef<Map<string, number>>(new Map());

  // The ID of the message we want pinned to the top of the visible area.
  // Updated each time the user sends a new message.
  const focusMsgIdRef = useRef<string | null>(null);

  // Pending: we've called send() and are waiting for the new message to render
  // (so we can read its y-offset from onLayout).
  const pendingFocusIdRef = useRef<string | null>(null);

  // ── Sessions ──────────────────────────────────────────────────────────────
  const chatSession = useChatSession(CHAT_MODEL);
  const labSession = useChatSession(LAB_MODEL, 'research');
  const session = mode === 'chat' ? chatSession : labSession;

  const {
    messages,
    inputText,
    setInputText,
    pendingImage,
    setPendingImage,
    busy,
    send,
    regenerateMessage,
    conversationId,
  } = session;

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;
  const lastIsPending = !!lastMessage?.pending;

  // ── Scroll helpers ────────────────────────────────────────────────────────
  /**
   * Scrolls so `msgId` is at the very top of the visible area.
   * Falls back to scrollToEnd if the layout hasn't been measured yet.
   */
  const scrollToMsg = useCallback(
    (msgId: string, animated = true) => {
      const y = msgYRef.current.get(msgId);
      if (y !== undefined) {
        // Subtract a small amount of top padding so the bubble breathes.
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated });
      } else {
        scrollRef.current?.scrollToEnd({ animated });
      }
    },
    [],
  );

  // ── Keyboard listeners ────────────────────────────────────────────────────
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
    return () => { showSub.remove(); hideSub.remove(); };
  }, [scrollToMsg]);

  // ── onLayout callback for each message row ────────────────────────────────
  const handleMsgLayout = useCallback(
    (msgId: string, e: LayoutChangeEvent) => {
      const y = e.nativeEvent.layout.y;
      msgYRef.current.set(msgId, y);

      // If this is the message we were waiting for (just rendered after send),
      // scroll to it now that we have its y position.
      if (pendingFocusIdRef.current === msgId) {
        pendingFocusIdRef.current = null;
        setTimeout(() => scrollToMsg(msgId, true), 40);
      }
    },
    [scrollToMsg],
  );

  // ── Watch messages for new sends ──────────────────────────────────────────
  // pendingFocusRef holds the expected index of the new user message.
  // We stash the index at send time and resolve the ID once messages updates.
  const pendingFocusIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (pendingFocusIndexRef.current !== null && messages.length > pendingFocusIndexRef.current) {
      const idx = pendingFocusIndexRef.current;
      pendingFocusIndexRef.current = null;

      const msg = messages[idx];
      if (!msg) return;

      focusMsgIdRef.current = msg.id;
      setAnimateFromIdx(idx);

      // If onLayout already fired (fast render), scroll immediately.
      const y = msgYRef.current.get(msg.id);
      if (y !== undefined) {
        setTimeout(() => scrollToMsg(msg.id, true), 60);
      } else {
        // Otherwise, onLayout will trigger the scroll when the row renders.
        pendingFocusIdRef.current = msg.id;
      }
    }
  }, [messages, setAnimateFromIdx, scrollToMsg]);

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    Keyboard.dismiss();
    pendingFocusIndexRef.current = messages.length;
    send();
  }, [send, messages.length]);

  const handleAudioChat = useCallback(() => {
    if (!user) {
      router.push('/account');
      return;
    }
    setAudioChatOpen(true);
  }, [user]);

  // ── New chat ──────────────────────────────────────────────────────────────
  const handleNewChat = useCallback(() => {
    chatSession.startNewConversation();
    labSession.startNewConversation();
    setAnimateFromIdx(undefined);
    focusMsgIdRef.current = null;
    msgYRef.current.clear();
    setSidebarOpen(false);
  }, [chatSession, labSession, setAnimateFromIdx]);

  // ── Load conversation ─────────────────────────────────────────────────────
  const handleSelectConversation = useCallback(
    async (conv: ConversationSummary) => {
      const targetMode: ChatMode =
        conv.model === LAB_MODEL ||
        conv.model === 'engagera-2.1' ||
        conv.model === 'engagera-reason'
          ? 'lab'
          : 'chat';
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

        // Focus on the last user message — no fade-in animation for history loads.
        const lastUserMsg = [...displayMessages].reverse().find((m) => m.role === 'user');
        setAnimateFromIdx(undefined);
        focusMsgIdRef.current = lastUserMsg?.id ?? null;
        msgYRef.current.clear();
        setMode(targetMode);
        setSidebarOpen(false);

        // Scroll after layouts settle
        if (lastUserMsg) {
          setTimeout(() => scrollToMsg(lastUserMsg.id, false), 200);
        }
      } catch {
        showDialog('Could not open chat', 'Please check your connection and try again.');
      }
    },
    [chatSession, labSession, setAnimateFromIdx, scrollToMsg],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable
          onPress={() => { setSidebarOpen(true); setRefreshToken((t) => t + 1); }}
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
              <View style={styles.emptyMark}><BrandMark size={48} /></View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {CHAT_COPY.emptyTitle}
              </Text>
              <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
                {CHAT_COPY.emptyBody}
              </Text>
            </View>
          ) : (
            // ScrollView instead of FlatList so we can use exact pixel y-offsets
            // from onLayout to scroll precisely — FlatList's scrollToIndex is
            // unreliable without fixed item heights.
            <ScrollView
              ref={scrollRef}
              contentContainerStyle={styles.listContent}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {messages.map((item, index) => {
                const isNew = animateFromIdx !== undefined && index >= animateFromIdx;
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
                      onRegenerate={item.role === 'assistant' ? regenerateMessage : undefined}
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
                onAudioChat={handleAudioChat}
              busy={busy || lastIsPending}
              placeholder={CHAT_COPY.placeholder}
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

      <AudioChatModal
        visible={audioChatOpen}
        onClose={() => setAudioChatOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
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
  // Large paddingBottom = the full screen height. Without this, when chat
  // content is shorter than the screen, scrollTo() has no room to move and the
  // previous conversation stays visible. The padding is invisible whitespace —
  // the user only sees it if they scroll all the way past the last message.
  listContent: { padding: 16, paddingBottom: Dimensions.get('window').height },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 40,
  },
  emptyMark: { alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { fontSize: 19, fontFamily: 'Inter_700Bold', letterSpacing: -0.2 },
  emptyBody: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 19 },
});
