import React, { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/hooks/useAuth';
import { useChatSession } from '@/hooks/useChatSession';
import { ChatBubble } from '@/components/ChatBubble';
import { ChatInput } from '@/components/ChatInput';
import { TypingDots } from '@/components/TypingDots';
import { GuestBanner } from '@/components/GuestBanner';
import { BrandMark, Wordmark } from '@/components/BrandMark';
import { ModeSwitch, type ChatMode } from '@/components/ModeSwitch';
import { CHAT_MODEL, LAB_MODEL } from '@/lib/chat';

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
  const { user, displayName } = useAuth();
  const listRef = useRef<FlatList>(null);
  const [mode, setMode] = useState<ChatMode>('chat');

  // Both sessions stay mounted at all times so switching modes with the
  // pill switch never loses either conversation's history.
  const chatSession = useChatSession(CHAT_MODEL);
  const labSession = useChatSession(LAB_MODEL, 'research');
  const session = mode === 'chat' ? chatSession : labSession;
  const copy = COPY[mode];

  const { messages, inputText, setInputText, pendingImage, setPendingImage, busy, send, isGuest, remaining } =
    session;
  const lastIsPending = messages.length > 0 && messages[messages.length - 1].pending;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.brandRow}>
          <BrandMark size={20} />
          <Wordmark size={16} />
        </View>
        <ModeSwitch value={mode} onChange={setMode} />
        <Pressable onPress={() => router.push('/account')} hitSlop={10} style={styles.avatarBtn}>
          <Ionicons
            name={user ? 'person-circle' : 'person-circle-outline'}
            size={26}
            color={colors.foreground}
          />
        </Pressable>
      </View>
      {user ? (
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{displayName}</Text>
      ) : null}

      {isGuest ? <GuestBanner remaining={remaining} /> : null}

      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.emptyGlow, { backgroundColor: colors.glow }]}>
              <BrandMark size={34} />
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
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
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
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  avatarBtn: {
    flex: 1,
    alignItems: 'flex-end',
  },
  subtitle: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    marginTop: -8,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  listContent: { padding: 16, paddingBottom: 4 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 40,
  },
  emptyGlow: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 19, fontFamily: 'SpaceGrotesk_600SemiBold', letterSpacing: -0.2 },
  emptyBody: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 19 },
});
