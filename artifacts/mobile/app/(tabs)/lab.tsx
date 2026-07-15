import React, { useRef } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useChatSession } from '@/hooks/useChatSession';
import { ChatBubble } from '@/components/ChatBubble';
import { ChatInput } from '@/components/ChatInput';
import { TypingDots } from '@/components/TypingDots';
import { GuestBanner } from '@/components/GuestBanner';
import { useAuth } from '@/hooks/useAuth';
import { LAB_MODEL } from '@/lib/chat';

export default function LabScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const listRef = useRef<FlatList>(null);
  const { messages, inputText, setInputText, pendingImage, setPendingImage, busy, send, remaining } =
    useChatSession(LAB_MODEL, 'research');

  const lastIsPending = messages.length > 0 && messages[messages.length - 1].pending;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderColor: colors.border }]}>
        <View style={styles.titleRow}>
          <Ionicons name="flask-outline" size={20} color={colors.foreground} />
          <Text style={[styles.title, { color: colors.foreground }]}>Lab</Text>
        </View>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Research mode · searches the web and cites sources
        </Text>
      </View>

      {!user ? <GuestBanner remaining={remaining} /> : null}

      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="flask-outline" size={36} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Deep research</Text>
            <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
              Ask a harder question. Lab browses the web, reasons over multiple sources, and shows its
              citations.
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
            placeholder="Ask Lab to research something…"
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
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 12 },
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
