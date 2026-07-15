import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [conversationId, setConversationId] = useState<number | undefined>(undefined);

  const remaining = Math.max(0, GUEST_MESSAGE_LIMIT - guestCount);

  // The edge function can deliver several model tokens in one SSE frame
  // (network/upstream batching we don't control), which would otherwise
  // make the message pop in as a nearly-finished block instead of typing
  // in. To always render token-by-token like the website, incoming text
  // is queued here and drained onto the screen a few characters at a
  // time on a fixed clock, independent of how big each network chunk is.
  const revealQueueRef = useRef('');
  const revealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamEndedRef = useRef(false);

  const stopReveal = useCallback(() => {
    if (revealTimerRef.current != null) {
      clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    revealQueueRef.current = '';
  }, []);

  useEffect(() => stopReveal, [stopReveal]);

  const startReveal = useCallback(
    (assistantId: string) => {
      if (revealTimerRef.current != null) return;
      revealTimerRef.current = setInterval(() => {
        const queued = revealQueueRef.current;
        if (queued.length === 0) {
          if (streamEndedRef.current) {
            stopReveal();
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)));
          }
          return;
        }
        // Reveal a handful of characters per tick; scale up when a big
        // backlog has piled up so a fast/complete response still catches
        // up quickly instead of trailing behind for seconds.
        const step = Math.max(2, Math.ceil(queued.length / 8));
        const piece = queued.slice(0, step);
        revealQueueRef.current = queued.slice(step);
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + piece, pending: false } : m)),
        );
      }, 24);
    },
    [stopReveal],
  );

  /** Resets to a fresh, empty conversation in this mode. */
  const startNewConversation = useCallback(() => {
    stopReveal();
    setMessages([]);
    setConversationId(undefined);
    setInputText('');
    setPendingImage(null);
  }, [stopReveal]);

  /** Hydrates this session from a previously-saved conversation. */
  const loadConversation = useCallback(
    (id: number, history: DisplayMessage[]) => {
      stopReveal();
      setConversationId(id);
      setMessages(history);
      setInputText('');
      setPendingImage(null);
    },
    [stopReveal],
  );

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

    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: 'assistant', text: '', pending: true, streaming: true },
    ]);
    setInputText('');
    setPendingImage(null);
    setBusy(true);

    revealQueueRef.current = '';
    streamEndedRef.current = false;

    try {
      await streamChat(
        {
          messages: historyForRequest,
          model,
          conversationId,
          contextHint,
        },
        {
          // Queue each arriving chunk instead of applying it straight to
          // state — startReveal's clock drains the queue a few characters
          // at a time so the message always types in, even if the network
          // delivers several tokens (or a whole sentence) in one frame.
          onToken: (chunk) => {
            revealQueueRef.current += chunk;
            startReveal(assistantId);
          },
          onMeta: (searchInfo: SearchInfo) => {
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, searchInfo } : m)));
          },
          onDone: (done) => {
            if (done.conversationId) setConversationId(done.conversationId);
            if (typeof done.guestMessageCount === 'number') setGuestCount(done.guestMessageCount);
          },
        },
      );
      // The reveal clock keeps draining any queued text after this point;
      // it flips `streaming` off itself once the queue is fully drained.
      streamEndedRef.current = true;
      if (revealQueueRef.current.length === 0) {
        stopReveal();
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)));
      }
    } catch (err) {
      stopReveal();
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
        prev.map((m) => (m.id === assistantId ? { ...m, text: message, pending: false, streaming: false } : m)),
      );
    } finally {
      setBusy(false);
    }
  }, [inputText, pendingImage, messages, model, contextHint, user, guestBlocked, conversationId, startReveal, stopReveal]);

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
    conversationId,
    startNewConversation,
    loadConversation,
  };
}
