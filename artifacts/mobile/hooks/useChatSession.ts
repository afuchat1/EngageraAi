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

  /**
   * Core streaming runner shared by send() and regenerateMessage().
   * Takes an already-built messages array, the placeholder assistant ID,
   * whether this is an image-gen request, and the current conversation ID.
   */
  const runStreamRequest = useCallback(
    async (
      historyForRequest: ChatMessage[],
      assistantId: string,
      isImageReq: boolean,
      convId: number | undefined,
    ) => {
      setBusy(true);
      revealQueueRef.current = '';
      streamEndedRef.current = false;

      try {
        await streamChat(
          { messages: historyForRequest, model, conversationId: convId, contextHint },
          {
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
            onSearchStatus: (message: string) => {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, searchStatus: message } : m)),
              );
            },
            onMeta: (searchInfo: SearchInfo) => {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, searchInfo, searchStatus: undefined } : m)),
              );
            },
            onDone: (done) => {
              if (done.conversationId) setConversationId(done.conversationId);
              if (typeof done.guestMessageCount === 'number') setGuestCount(done.guestMessageCount);
              if (done.timeInfo || done.weatherInfo) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          ...(done.timeInfo ? { timeInfo: done.timeInfo } : {}),
                          ...(done.weatherInfo ? { weatherInfo: done.weatherInfo } : {}),
                        }
                      : m,
                  ),
                );
              }
            },
          },
        );
        streamEndedRef.current = true;
        if (revealQueueRef.current.length === 0) {
          stopReveal();
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)),
          );
        }
      } catch (err) {
        stopReveal();
        if (err instanceof ChatRequestError && err.status === 429) {
          setGuestBlocked(true);
          const data = err.data as { guestMessageCount?: number } | undefined;
          if (data?.guestMessageCount) setGuestCount(data.guestMessageCount);
        }

        const isRateLimited = err instanceof ChatRequestError && err.status === 429;
        if (isImageReq && !isRateLimited) {
          const recovered = await tryRecoverPersistedReply(convId);
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
          prev.map((m) =>
            m.id === assistantId ? { ...m, text: message, pending: false, streaming: false } : m,
          ),
        );
      } finally {
        setBusy(false);
      }
    },
    [model, contextHint, startReveal, stopReveal],
  );

  /** Removes a single assistant message from the thread. */
  const deleteMessage = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  /**
   * Re-runs the request for an existing assistant message.
   * Strips the old reply (and any messages after it), replaces it with a
   * fresh placeholder, then streams a new response using the same history
   * that produced the original.
   */
  const regenerateMessage = useCallback(
    async (id: string) => {
      if (busy) return;
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === id);
        if (idx === -1) return prev;
        return prev.slice(0, idx); // remove assistant msg + anything after it
      });

      // Capture current messages synchronously before the state update lands
      // by reading from a stable snapshot — we re-derive history from the
      // trimmed array below using a functional update pattern.
      setMessages((prev) => {
        // At this point prev is already trimmed (above update applied).
        // Build the request history from everything still in the thread.
        const historyForRequest: ChatMessage[] = prev
          .filter((m) => m.text.length > 0 || m.imageUri)
          .map((m) => ({ role: m.role, content: m.text }));

        if (historyForRequest.length === 0) return prev;

        const assistantId = randomId();
        const lastUserText = prev.filter((m) => m.role === 'user').at(-1)?.text ?? '';
        const isImageReq = looksLikeImageRequest(lastUserText);

        // Schedule the network call after this render — we can't await inside
        // a setState updater, so we kick it off asynchronously.
        setTimeout(() => {
          setConversationId((convId) => {
            runStreamRequest(historyForRequest, assistantId, isImageReq, convId);
            return convId; // no change to conversationId itself
          });
        }, 0);

        return [
          ...prev,
          {
            id: assistantId,
            role: 'assistant' as const,
            text: '',
            pending: true,
            streaming: !isImageReq,
            imageGenerating: isImageReq,
          },
        ];
      });
    },
    [busy, runStreamRequest],
  );

  const send = useCallback(async () => {
    const text = inputText.trim();
    if (!text && !pendingImage) return;
    if (!user && guestBlocked) return;

    // Image generation is for signed-in users only. Intercept here so
    // the request never hits the backend — just drop a canned reply and
    // a sign-in nudge into the thread instead.
    const isImageReq = looksLikeImageRequest(text);
    if (!user && isImageReq) {
      const userMsg: DisplayMessage = { id: randomId(), role: 'user', text, imageUri: pendingImage?.uri };
      const signInMsg: DisplayMessage = {
        id: randomId(),
        role: 'assistant',
        text: 'Image generation is only available to signed-in users. Create a free account to unlock it — it only takes a moment.',
      };
      setMessages((prev) => [...prev, userMsg, signInMsg]);
      setInputText('');
      setPendingImage(null);
      return;
    }

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

    await runStreamRequest(historyForRequest, assistantId, isImageReq, conversationId);
  }, [inputText, pendingImage, messages, user, guestBlocked, conversationId, runStreamRequest]);

  return {
    messages,
    inputText,
    setInputText,
    pendingImage,
    setPendingImage,
    busy,
    send,
    deleteMessage,
    regenerateMessage,
    isGuest: !user,
    remaining,
    guestBlocked,
    conversationId,
    startNewConversation,
    loadConversation,
  };
}
