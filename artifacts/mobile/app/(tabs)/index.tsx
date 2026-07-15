import React, { useRef } from 'react';
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
import { CHAT_MODEL } from '@/lib/chat';

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, displayName } = useAuth();
  const listRef = useRef<FlatList>(null);
  const { messages, inputText, setInputText, pendingImage, setPendingImage, busy, send, isGuest, remaining } =
    useChatSession(CHAT_MODEL);

  const showBanner = isGuest;
  const lastIsPending = messages.length > 0 && messages[messages.length - 1].pending;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderColor: colors.border }]}>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>Chat</Text>
          {user ? (
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{displayName}</Text>
          ) : null}
        </View>
        <Pressable onPress={() => router.push('/account')} hitSlop={10}>
          <Ionicons
            name={user ? 'person-circle' : 'person-circle-outline'}
            size={30}
            color={colors.foreground}
          />
        </Pressable>
      </View>

      {showBanner ? <GuestBanner remaining={remaining} /> : null}

      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="sparkles-outline" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Ask me anything</Text>
            <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
              Attach a photo and I can read, describe, or reason about it too.
            </Text>
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

        <View style={{ paddingBottom: insets.bottom + 8 }}>
          <ChatInput
            value={inputText}
            onChangeText={setInputText}
            onSend={send}
            image={pendingImage}
            onImagePicked={setPendingImage}
            busy={busy || lastIsPending}
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
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 2 },
  listContent: { padding: 16, paddingBottom: 8 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 40,
  },
  emptyTitle: { fontSize: 17, fontWeight: '600', marginTop: 8 },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
