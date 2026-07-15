import React, { useCallback, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useChatSession } from '@/hooks/useChatSession';
import { ChatBubble, type DisplayMessage } from '@/components/ChatBubble';
import { ChatInput } from '@/components/ChatInput';
import { TypingDots } from '@/components/TypingDots';
import { GuestBanner } from '@/components/GuestBanner';
import { BrandMark } from '@/components/BrandMark';
import { ModeSwitch, type ChatMode } from '@/components/ModeSwitch';
import { Sidebar } from '@/components/Sidebar';
import { CHAT_MODEL, LAB_MODEL } from '@/lib/chat';
import { fetchConversationMessages, type ConversationSummary } from '@/lib/conversations';

const COPY: Record<ChatMode, { placeholder: string; emptyTitle: string; emptyBody: string }> = {
  chat: {
    placeholder: 'Message Engagera…',
    emptyTitle: 'Ask me anything',
    emptyBody: 'Attach a photo and I can read, describe, or reason about it too.',
  },
  lab: {
    placeholder: 'Ask Lab to research something…',
    emptyTitle: 'Deep research',
    emptyBody: 'Lab browses the web, reasons over multiple sources, and cites everything it finds.',
  },
};

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);
  const [mode, setMode] = useState<ChatMode>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  // Both sessions stay mounted at all times so switching modes with the
  // pill switch never loses either conversation's history.
  const chatSession = useChatSession(CHAT_MODEL);
  const labSession = useChatSession(LAB_MODEL, 'research');
  const session = mode === 'chat' ? chatSession : labSession;
  const copy = COPY[mode];

  const {
    messages,
    inputText,
    setInputText,
    pendingImage,
    setPendingImage,
    busy,
    send,
    isGuest,
    remaining,
    conversationId,
    startNewConversation,
    loadConversation,
  } = session;
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;
  const lastIsPending = !!lastMessage?.pending;
  const lastIsStreaming = !!lastMessage?.streaming;

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

      {isGuest ? <GuestBanner remaining={remaining} /> : null}

      <KeyboardAvoidingView style={styles.flex} behavior="padding">
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
              item.pending && item.text.length === 0 ? <TypingDots /> : <ChatBubble message={item} />
            }
            // While tokens are streaming in, snap to bottom without animating —
            // re-triggering a spring/ease animation on every frame is what
            // produces visible "shaking"; a hard jump keeps pace with the
            // growing text smoothly instead.
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: !lastIsStreaming })}
          />
        )}

        <View style={{ paddingBottom: insets.bottom + 10, paddingTop: 8 }}>
          <ChatInput
            value={inputText}
            onChangeText={setInputText}
            onSend={send}
            image={pendingImage}
            onImagePicked={setPendingImage}
            busy={busy || lastIsPending}
            placeholder={copy.placeholder}
          />
        </View>
      </KeyboardAvoidingView>

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
