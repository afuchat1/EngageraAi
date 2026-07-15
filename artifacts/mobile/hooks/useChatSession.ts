import { useCallback, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/hooks/useAuth';
import {
  ChatMessage,
  ChatRequestError,
  GUEST_MESSAGE_LIMIT,
  SearchInfo,
  streamChat,
} from '@/lib/chat';
import type { DisplayMessage } from '@/components/ChatBubble';
import type { PendingImage } from '@/components/ChatInput';

function randomId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 11);
}

export function useChatSession(model: string, contextHint?: string) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [guestCount, setGuestCount] = useState(0);
  const [guestBlocked, setGuestBlocked] = useState(false);
  const conversationId = useRef<number | undefined>(undefined);

  const remaining = Math.max(0, GUEST_MESSAGE_LIMIT - guestCount);

  const send = useCallback(async () => {
    const text = inputText.trim();
    if (!text && !pendingImage) return;
    if (!user && guestBlocked) return;

    const userMessage: DisplayMessage = {
      id: randomId(),
      role: 'user',
      text,
      imageUri: pendingImage?.uri,
    };
    const assistantId = randomId();

    const historyForRequest: ChatMessage[] = [...messages, userMessage]
      .filter((m) => m.text.length > 0 || m.imageUri)
      .map((m) => {
        if (m.role === 'user' && m.imageUri && pendingImage && m.id === userMessage.id) {
          return {
            role: 'user',
            content: [
              ...(text ? [{ type: 'text' as const, text }] : []),
              {
                type: 'image_url' as const,
                image_url: { url: `data:${pendingImage.mimeType};base64,${pendingImage.base64}` },
              },
            ],
          };
        }
        return { role: m.role, content: m.text };
      });

    setMessages((prev) => [...prev, userMessage, { id: assistantId, role: 'assistant', text: '', pending: true }]);
    setInputText('');
    setPendingImage(null);
    setBusy(true);

    try {
      await streamChat(
        {
          messages: historyForRequest,
          model,
          conversationId: conversationId.current,
          contextHint,
        },
        {
          onToken: (chunk) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + chunk, pending: false } : m)),
            );
          },
          onMeta: (searchInfo: SearchInfo) => {
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, searchInfo } : m)));
          },
          onDone: (done) => {
            if (done.conversationId) conversationId.current = done.conversationId;
            if (typeof done.guestMessageCount === 'number') setGuestCount(done.guestMessageCount);
          },
        },
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      if (err instanceof ChatRequestError && err.status === 429) {
        setGuestBlocked(true);
        const data = err.data as { guestMessageCount?: number } | undefined;
        if (data?.guestMessageCount) setGuestCount(data.guestMessageCount);
      }
      const message =
        err instanceof ChatRequestError
          ? err.status === 429
            ? "You've used all your free guest messages. Sign in to keep chatting."
            : err.message
          : 'Something went wrong. Please try again.';
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, text: message, pending: false } : m)),
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  }, [inputText, pendingImage, messages, model, contextHint, user, guestBlocked]);

  return {
    messages,
    inputText,
    setInputText,
    pendingImage,
    setPendingImage,
    busy,
    send,
    isGuest: !user,
    remaining,
    guestBlocked,
  };
}
