import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  ChatMessage,
  ChatRequestError,
  GUEST_MESSAGE_LIMIT,
  SearchInfo,
  looksLikeImageRequest,
  streamChat,
} from '@/lib/chat';
import { fetchConversationMessages, listConversations } from '@/lib/conversations';
import type { DisplayMessage } from '@/components/ChatBubble';
import type { PendingImage } from '@/components/ChatInput';

/**
 * Image-generation replies are large (a full base64 JPEG in one JSON body)
 * and can outlast a flaky/slow mobile connection even though the backend
 * already finished generating *and persisting* the reply before the client
 * finished downloading/parsing it — the request only fails locally. Rather
 * than surface a false "something went wrong" for a reply that actually
 * exists, re-fetch the conversation from the server and recover the
 * assistant message that's already there. Returns null if nothing usable
 * was found, so the caller can fall back to the normal error message.
 */
async function tryRecoverPersistedReply(
  conversationId: number | undefined,
): Promise<{ conversationId: number; text: string } | null> {
  try {
    let targetId = conversationId;
    if (!targetId) {
      const conversations = await listConversations();
      if (conversations.length === 0) return null;
      targetId = conversations.reduce((latest, c) =>
        new Date(c.updatedAt) > new Date(latest.updatedAt) ? c : latest,
      ).id;
    }
    const history = await fetchConversationMessages(targetId);
    const last = history[history.length - 1];
    if (!last || last.role !== 'assistant' || !last.content) return null;
    return { conversationId: targetId, text: last.content };
  } catch {
    return null;
  }
}

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
        // Reveal only a couple of characters per tick, at a deliberately
        // unhurried pace, so a reply always reads like it's being typed at
        // a comfortable reading speed rather than flashing onto the
        // screen. Only a very large backlog (a huge response arriving in
        // one big network chunk) speeds up slightly, and only enough to
        // avoid trailing minutes behind — normal replies stay slow and
        // readable throughout.
        const step = queued.length > 400 ? 4 : queued.length > 120 ? 3 : 2;
        const piece = queued.slice(0, step);
        revealQueueRef.current = queued.slice(step);
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + piece, pending: false } : m)),
        );
      }, 45);
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
    // Best-effort guess so the placeholder can show a "creating your
    // image" frame instead of the generic thinking dots. The backend
    // decides for real; this only affects which loading state is shown.
    const isImageReq = looksLikeImageRequest(text);

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
      {
        id: assistantId,
        role: 'assistant',
        text: '',
        pending: true,
        streaming: !isImageReq,
        imageGenerating: isImageReq,
      },
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
          //
          // Image replies arrive as one giant already-finished chunk (a
          // full data: URI, sometimes 100KB+) rather than a token stream —
          // typing that in char-by-char would be slow and pointless, so it
          // is applied straight to state instead of going through the
          // reveal queue.
          onToken: (chunk) => {
            if (isImageReq) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, text: m.text + chunk, pending: false, imageGenerating: false }
                    : m,
                ),
              );
              return;
            }
            revealQueueRef.current += chunk;
            startReveal(assistantId);
          },
          onMeta: (searchInfo: SearchInfo) => {
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, searchInfo } : m)));
          },
          onDone: (done) => {
            if (done.conversationId) setConversationId(done.conversationId);
            if (typeof done.guestMessageCount === 'number') setGuestCount(done.guestMessageCount);
            if (done.timeInfo) {
              setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, timeInfo: done.timeInfo } : m)));
            }
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

      // Image replies are especially likely to fail locally (slow network
      // downloading a large base64 payload) after the backend has already
      // generated and saved them — check the server before showing an error.
      const isRateLimited = err instanceof ChatRequestError && err.status === 429;
      if (isImageReq && !isRateLimited) {
        const recovered = await tryRecoverPersistedReply(conversationId);
        if (recovered) {
          setConversationId(recovered.conversationId);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, text: recovered.text, pending: false, streaming: false, imageGenerating: false }
                : m,
            ),
          );
          setBusy(false);
          return;
        }
      }

      const message =
        err instanceof ChatRequestError
          ? err.status === 429
            ? "You've used all your free guest messages. Sign in to keep chatting."
            : err.message
          : err instanceof Error && err.message
            ? `Something went wrong: ${err.message}`
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
