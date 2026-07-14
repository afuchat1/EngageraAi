import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Menu, Plus, MessageSquare, Send, Trash2, Cpu } from "lucide-react";
import {
  useListConversations,
  useGetConversationMessages,
  getGetConversationMessagesQueryKey,
  useDeleteConversation
} from "@workspace/api-client-react";
import { streamEdgeChat, ChatMessage, TimeInfo } from "@/hooks/useEdgeChatCompletion";
import { useAuth } from "@/hooks/useAuth";
import { MessageContent, Source } from "@/components/MessageContent";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { detectModel, MODEL_LABELS, EngageraModel } from "@/lib/autoModel";
import PublicLayout from "@/components/layout/PublicLayout";

interface DisplayMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  timeInfo?: TimeInfo;
}

export default function Landing() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [autoModel, setAutoModel] = useState<EngageraModel>("engagera-pro");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [guestLimitReached, setGuestLimitReached] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  // Real tokens arrive over the wire in genuine SSE frames (verified against
  // the edge function), but fast providers (e.g. Groq) can deliver an entire
  // reply within ~20-30ms — far faster than a render frame — which makes a
  // truly-streamed response look like it appeared all at once. This queue
  // decouples "data received" from "text shown": every arriving chunk is
  // appended to a buffer, and a rAF loop drains it onto the screen a few
  // characters per frame, so the reveal is visibly gradual regardless of how
  // bursty the underlying network delivery is. It never fabricates content or
  // delays past what has actually arrived — it only paces the reveal of real,
  // already-received data.
  const pendingCharsRef = useRef("");
  const streamClosedRef = useRef(true);
  const revealRafRef = useRef<number | null>(null);

  const stopRevealLoop = () => {
    if (revealRafRef.current != null) {
      cancelAnimationFrame(revealRafRef.current);
      revealRafRef.current = null;
    }
  };

  const startRevealLoop = (index: number) => {
    if (revealRafRef.current != null) return;
    const step = () => {
      const pending = pendingCharsRef.current;
      if (pending.length > 0) {
        // Reveal at a steady typewriter-ish pace (a few characters per
        // frame) regardless of how the network delivered them. Fast
        // providers (e.g. Groq) can flush an entire reply within ~20ms —
        // without this cap the whole backlog would drain in a couple of
        // frames and look like it "just appeared". Very long replies still
        // scale up slightly so they don't trail the done event for too long.
        const take = Math.min(pending.length, Math.max(3, Math.ceil(pending.length / 80)));
        const chunk = pending.slice(0, take);
        pendingCharsRef.current = pending.slice(take);
        setMessages((prev) => {
          if (!prev[index]) return prev;
          const next = [...prev];
          next[index] = { ...next[index], content: next[index].content + chunk };
          return next;
        });
      }
      if (pendingCharsRef.current.length > 0 || !streamClosedRef.current) {
        revealRafRef.current = requestAnimationFrame(step);
      } else {
        revealRafRef.current = null;
      }
    };
    revealRafRef.current = requestAnimationFrame(step);
  };

  useEffect(() => stopRevealLoop, []);

  const { data: conversations = [], refetch: refetchConversations } = useListConversations();
  const { data: historyMessages } = useGetConversationMessages(conversationId!, {
    query: { enabled: !!conversationId, queryKey: getGetConversationMessagesQueryKey(conversationId!) }
  });
  const deleteConversation = useDeleteConversation();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (historyMessages && historyMessages.length > 0) {
      setMessages(historyMessages.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        sources: m.sources?.length ? (m.sources as Source[]) : undefined,
        timeInfo: m.timeInfo as TimeInfo | undefined,
      })));
    } else if (!conversationId) {
      setMessages([]);
    }
  }, [historyMessages, conversationId]);

  useEffect(() => {
    if (input.trim().length > 2) {
      setAutoModel(detectModel(input.trim()));
    } else {
      setAutoModel("engagera-pro");
    }
  }, [input]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading || guestLimitReached) return;

    const msgModel = detectModel(input.trim());
    const userMsg: DisplayMessage = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");

    const apiMessages: ChatMessage[] = newMessages.map(m => ({ role: m.role, content: m.content }));
    setIsLoading(true);

    // We know exactly where the assistant placeholder will land: right after
    // the user message we just pushed. Compute this BEFORE streaming so that
    // all onToken callbacks see a valid index immediately — avoiding the race
    // where multiple rapid tokens each see assistantIndex === -1 and each
    // append a new empty bubble.
    const assistantIndex = newMessages.length;
    let streamedAny = false;
    pendingCharsRef.current = "";
    streamClosedRef.current = false;

    // Insert the empty placeholder now so the index is valid from the first token.
    setMessages([...newMessages, { role: "assistant", content: "" }]);
    startRevealLoop(assistantIndex);

    try {
      await streamEdgeChat(
        { messages: apiMessages, model: msgModel, conversationId, stream: true },
        {
          onToken: (chunk) => {
            streamedAny = true;
            pendingCharsRef.current += chunk;
          },
          onMeta: (searchInfo) => {
            if (assistantIndex === -1) return;
            setMessages((prev) => {
              const next = [...prev];
              next[assistantIndex] = { ...next[assistantIndex], sources: searchInfo.sources as Source[] };
              return next;
            });
          },
          onDone: (doneEvt) => {
            const rawSources = doneEvt.crawledSources?.length ? doneEvt.crawledSources : doneEvt.searchInfo?.sources;
            if (assistantIndex !== -1 && (rawSources?.length || doneEvt.timeInfo)) {
              setMessages((prev) => {
                const next = [...prev];
                next[assistantIndex] = {
                  ...next[assistantIndex],
                  sources: rawSources?.length ? (rawSources as Source[]) : next[assistantIndex].sources,
                  timeInfo: doneEvt.timeInfo ?? next[assistantIndex].timeInfo,
                };
                return next;
              });
            }

            if (!conversationId && doneEvt.conversationId) {
              setConversationId(doneEvt.conversationId);
              if (user) refetchConversations();
            }
            if (!user && doneEvt.guestMessageCount != null && doneEvt.guestMessageLimit != null) {
              if (doneEvt.guestMessageCount >= doneEvt.guestMessageLimit) {
                setGuestLimitReached(true);
              }
            }
          },
        },
      );

      streamClosedRef.current = true;

      if (!streamedAny) {
        // Stream produced no tokens at all (e.g. upstream failure) — drop the
        // empty assistant placeholder rather than showing a blank bubble.
        setMessages((prev) => prev.slice(0, assistantIndex));
      } else {
        // Let the reveal loop finish draining any buffered characters before
        // we consider the turn fully settled (isLoading only gates input).
        await new Promise<void>((resolve) => {
          const waitForDrain = () => {
            if (pendingCharsRef.current.length === 0) resolve();
            else requestAnimationFrame(waitForDrain);
          };
          waitForDrain();
        });
      }
    } catch (err: any) {
      streamClosedRef.current = true;
      const status = err?.status ?? err?.response?.status;
      if (status === 429 || status === 403) {
        setGuestLimitReached(true);
        setMessages((prev) => prev.slice(0, assistantIndex - 1)); // remove user msg + placeholder
      } else if (!streamedAny) {
        setMessages(newMessages.slice(0, -1)); // remove user msg only
      }
      // If tokens already streamed before the error (e.g. connection dropped
      // near the end), keep the partial reply visible rather than discarding it.
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, guestLimitReached, messages, conversationId, user, refetchConversations]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    setConversationId(undefined);
    setMessages([]);
    setGuestLimitReached(false);
    setInput("");
    if (isMobileSidebarOpen) setIsMobileSidebarOpen(false);
  };

  const loadConversation = (id: number) => {
    setConversationId(id);
    if (isMobileSidebarOpen) setIsMobileSidebarOpen(false);
  };

  const handleDeleteConversation = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteConversation.mutate({ id }, {
      onSuccess: () => {
        refetchConversations();
        if (conversationId === id) handleNewChat();
      }
    });
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-[#080808] w-full">
      <div className="p-3">
        <button
          onClick={handleNewChat}
          className="w-full flex items-center gap-2 px-4 py-2.5 bg-white/[0.07] hover:bg-white/[0.12] transition-colors text-sm font-medium rounded-xl"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-2 space-y-0.5">
        {conversations.length === 0 ? (
          <div className="p-4 text-center text-white/30 text-sm">No conversations yet.</div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => loadConversation(conv.id)}
              className={`flex items-center justify-between px-3 py-2.5 cursor-pointer text-sm transition-colors rounded-xl ${
                conversationId === conv.id ? "bg-white/[0.09]" : "hover:bg-white/[0.05]"
              }`}
            >
              <div className="flex items-center gap-2.5 overflow-hidden">
                <MessageSquare className="w-3.5 h-3.5 shrink-0 text-white/30" />
                <span className="truncate text-sm text-white/70">{conv.title || "New Conversation"}</span>
              </div>
              <button
                onClick={(e) => handleDeleteConversation(conv.id, e)}
                className="text-white/20 hover:text-white/50 shrink-0 ml-2 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <PublicLayout>
      <div className="flex h-full w-full overflow-hidden">

        {/* Desktop Sidebar — auth users only */}
        {user && (
          <div className="hidden md:block w-64 shrink-0 h-full">
            <SidebarContent />
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 flex flex-col h-full min-w-0 bg-black overflow-hidden">

          {/* Top bar */}
          <div className="shrink-0 flex items-center px-3 py-2 border-b border-white/10 bg-black gap-2">
            {user && (
              <Sheet open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
                <SheetTrigger asChild>
                  <button className="md:hidden p-2 rounded-full border border-white/20 hover:bg-white/10 transition-colors">
                    <Menu className="w-4 h-4" />
                  </button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 bg-black border-r border-white/15 w-72 rounded-none sm:max-w-none">
                  <SidebarContent />
                </SheetContent>
              </Sheet>
            )}
            <div className="flex-1" />
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03] text-white/45 text-xs">
              <Cpu className="w-3 h-3 shrink-0" />
              <span>{MODEL_LABELS[autoModel] ?? autoModel}</span>
              <span className="text-white/20 ml-0.5">· auto</span>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {messages.length === 0 && !isLoading ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto px-4">
                <div className="w-14 h-14 rounded-2xl border border-white/15 flex items-center justify-center mb-5">
                  <MessageSquare className="w-6 h-6 text-white/35" />
                </div>
                <h2 className="text-2xl font-semibold mb-2 tracking-tight">How can I help you today?</h2>
                <p className="text-white/45 text-sm leading-relaxed mb-7">
                  Engagera gives you access to advanced AI models with live web search, image generation, code, and more.
                </p>
                {!user && (
                  <div className="text-xs text-white/35 px-4 py-2 border border-white/10 rounded-full bg-white/[0.03]">
                    Guest mode · 5 free messages
                  </div>
                )}
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-6 px-4 md:px-8 py-6">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[88%] break-words ${
                        msg.role === "user"
                          ? "bg-white text-black px-4 py-3 rounded-2xl rounded-br-sm text-[0.875rem] leading-relaxed"
                          : "text-white w-full"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <MessageContent content={msg.content} sources={msg.sources} timeInfo={msg.timeInfo} />
                      ) : (
                        msg.content
                      )}
                    </div>
                  </div>
                ))}

                {/* Loading indicator only while waiting for the first token — once
                    streaming text starts arriving, the growing message itself is the indicator. */}
                {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
                  <div className="flex justify-start">
                    <div className="text-white w-full max-w-[88%] break-words">
                      <div className="flex items-center gap-2.5 py-2">
                        <span className="relative flex items-center justify-center w-3.5 h-3.5 shrink-0">
                          <span className="thinking-orb-ring absolute inset-0 rounded-full border border-white/40" />
                          <span className="thinking-orb-core absolute inset-[3px] rounded-full bg-white" />
                        </span>
                        <span className="thinking-shimmer text-[13px] font-medium tracking-wide">
                          Thinking
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input footer */}
          <div className="shrink-0 p-3 md:p-4 bg-black border-t border-white/10">
            <div className="max-w-3xl mx-auto relative flex items-end">
              <textarea
                ref={chatInputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={guestLimitReached ? "Sign up to continue..." : "Message Engagera..."}
                disabled={guestLimitReached || isLoading}
                className="w-full bg-transparent border border-white/20 focus:border-white/50 outline-none resize-none py-3 pl-4 pr-12 text-sm max-h-48 scrollbar-thin min-h-[50px] transition-colors disabled:opacity-40 rounded-2xl"
                rows={1}
                onInput={(e) => {
                  const t = e.target as HTMLTextAreaElement;
                  t.style.height = "auto";
                  t.style.height = `${Math.min(t.scrollHeight, 200)}px`;
                }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading || guestLimitReached}
                className="absolute right-2 bottom-2 p-1.5 text-white/40 hover:text-white disabled:opacity-20 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-center mt-2 text-[10px] text-white/20">
              Engagera AI can make mistakes. Verify important information.
            </p>
          </div>
        </div>
      </div>

      {/* Guest Limit Modal */}
      {guestLimitReached && !user && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-black border border-white/15 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="w-10 h-10 rounded-full border border-white/15 flex items-center justify-center mb-4 mx-auto">
              <MessageSquare className="w-5 h-5 text-white/50" />
            </div>
            <h3 className="text-lg font-semibold text-center mb-1">Free messages used up</h3>
            <p className="text-white/45 text-sm text-center mb-6">
              You've used all 5 guest messages. Create a free account to keep chatting, access the API, and unlock all models.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => setLocation("/sign-up")}
                className="w-full py-2.5 bg-white text-black font-semibold text-sm rounded-full hover:bg-white/90 transition-colors"
              >
                Create free account
              </button>
              <button
                onClick={() => setLocation("/sign-in")}
                className="w-full py-2.5 border border-white/20 text-sm rounded-full hover:bg-white/5 transition-colors"
              >
                Sign in
              </button>
            </div>
          </div>
        </div>
      )}
    </PublicLayout>
  );
}
