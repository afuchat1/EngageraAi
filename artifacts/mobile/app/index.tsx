import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
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
  // adjustNothing) and pad the input container ourselves — works in both
  // Expo Go (no native module) and production APK.
  const [kbHeight, setKbHeight] = useState(0);

  // Both sessions stay mounted at all times so switching modes with the
  // pill switch never loses either conversation's history.
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
    isGuest,
    guestBlocked,
    conversationId,
    startNewConversation,
    loadConversation,
  } = session;

  // When the free guest cap is hit, immediately surface an actionable
  // prompt — the passive "Guest limit reached" banner alone is easy to miss.
  useEffect(() => {
    if (!guestBlocked) return;
    Alert.alert(
      "Free messages used up",
      `You've used all your free guest messages. Create a free account to keep chatting, generate images, and unlock all models.`,
      [
        {
          text: 'Sign in',
          onPress: () => router.push('/account'),
        },
        { text: 'Maybe later', style: 'cancel' },
      ],
    );
  }, [guestBlocked]);
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;
  const lastIsPending = !!lastMessage?.pending;
  const lastIsStreaming = !!lastMessage?.streaming;

  // Keyboard show/hide: track height for manual avoidance + keep scroll pinned.
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setKbHeight(e.endCoordinates.height);
      listRef.current?.scrollToEnd({ animated: true });
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKbHeight(0);
      listRef.current?.scrollToEnd({ animated: false });
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleSend = useCallback(() => {
    // Close the keyboard the instant Send is tapped so the just-sent
    // message and the reply that follows are fully visible immediately,
    // instead of staying hidden behind the keyboard until it's dismissed.
    Keyboard.dismiss();
    send();
  }, [send]);

  const handleNewChat = useCallback(() => {
    chatSession.startNewConversation();
    labSession.startNewConversation();
    setSidebarOpen(false);
  }, [chatSession, labSession]);

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
            searchInfo: m.sources && m.sources.length > 0 ? { query: '', sources: m.sources } : undefined,
            timeInfo: m.timeInfo,
            weatherInfo: m.weatherInfo,
          }));
        target.loadConversation(conv.id, displayMessages);
        setMode(targetMode);
        setSidebarOpen(false);
      } catch {
        Alert.alert('Could not open chat', 'Please check your connection and try again.');
      }
    },
    [chatSession, labSession],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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

      {/* ── Lab — always mounted so search/AI state survives mode switches ── */}
      <View style={[styles.flex, mode !== 'lab' && styles.hidden]}>
        <SearchEngine topPad={0} />
      </View>

      {/* ── Chat — always mounted for same reason ────────────────────────── */}
      <View style={[styles.flex, mode !== 'chat' && styles.hidden]}>
        <View style={styles.flex}>
          {messages.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyMark}>
                <BrandMark size={48} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{copy.emptyTitle}</Text>
              <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>{copy.emptyBody}</Text>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) =>
                item.pending && item.text.length === 0 ? (
                  item.imageGenerating ? <ImageGenIndicator /> : <TypingDots label={item.searchStatus} />
                ) : (
                  <ChatBubble
                    message={item}
                    onRegenerate={item.role === 'assistant' ? regenerateMessage : undefined}
                  />
                )
              }
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: !lastIsStreaming })}
            />
          )}

          {/* paddingBottom expands when the keyboard is up to push the input
              bar above it. kbHeight is always the raw keyboard height because
              KeyboardProvider sets adjustNothing — no double-offset risk. */}
          <View style={{ paddingBottom: kbHeight > 0 ? kbHeight + 6 : insets.bottom + 10, paddingTop: 8 }}>
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
  emptyTitle: { fontSize: 19, fontFamily: 'SpaceGrotesk_600SemiBold', letterSpacing: -0.2 },
  emptyBody: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 19 },
});
