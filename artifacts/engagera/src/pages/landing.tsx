import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Menu, Plus, MessageSquare, Send, Trash2, Cpu } from "lucide-react";
import {
  useListConversations,
  useGetConversationMessages,
  getGetConversationMessagesQueryKey,
  useDeleteConversation
} from "@workspace/api-client-react";
import { streamEdgeChat, ChatMessage, TimeInfo, SearchInfo } from "@/hooks/useEdgeChatCompletion";
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

function sanitizeResponse(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
    .replace(/https?:\/\/[^\s)>\]"']+/g, "")
    .replace(/^(Based on (my )?(search results?|web search|the search data|research)[,:]?\s*)/gim, "")
    .replace(/^(The (search|web) results? (show|indicate|suggest|reveal)[s]?[,:]?\s*)/gim, "")
    .replace(/^(From my (search|research|training)[,:]?\s*)/gim, "")
    .replace(/^(I (searched|looked up|found) (that |online )?[,:]?\s*)/gim, "")
    .replace(/\[\d+\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
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

  // Streaming state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);
  // Ref so callbacks don't capture stale messages snapshot
  const messagesRef = useRef<DisplayMessage[]>(messages);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  const { data: conversations = [], refetch: refetchConversations } = useListConversations();
  const { data: historyMessages } = useGetConversationMessages(conversationId!, {
    query: { enabled: !!conversationId, queryKey: getGetConversationMessagesQueryKey(conversationId!) }
  });
  const deleteConversation = useDeleteConversation();

  // Keep ref in sync so streaming callbacks see the latest snapshot
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Merge streaming content into the display list so the assistant MessageContent
  // component stays at a stable tree position throughout the stream → no blank flash
  // when the transition from streaming to completed happens.
  const displayMessages: DisplayMessage[] = isStreaming
    ? [...messages, { role: "assistant" as const, content: streamingContent }]
    : messages;

  // Abort any in-flight stream on unmount
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  useEffect(() => {
    if (historyMessages && historyMessages.length > 0) {
      setMessages(historyMessages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })));
    } else if (!conversationId) {
      setMessages([]);
    }
  }, [historyMessages, conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, isStreaming]);

  useEffect(() => {
    if (input.trim().length > 2) {
      setAutoModel(detectModel(input.trim()));
    } else {
      setAutoModel("engagera-pro");
    }
  }, [input]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming || guestLimitReached) return;

    const msgModel = detectModel(input.trim());
    const userMsg: DisplayMessage = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");

    const apiMessages: ChatMessage[] = newMessages.map(m => ({ role: m.role, content: m.content }));

    setIsStreaming(true);
    setStreamingContent("");

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    let accumulated = "";
    let pendingSearchInfo: SearchInfo | undefined;

    try {
      await streamEdgeChat(
        { messages: apiMessages, model: msgModel, conversationId },
        {
          onMeta: (meta) => {
            if (meta.searchInfo) pendingSearchInfo = meta.searchInfo;
          },
          onToken: (chunk) => {
            accumulated += chunk;
            setStreamingContent(accumulated);
          },
          onDone: (evt) => {
            setIsStreaming(false);
            setStreamingContent("");
            const sources = (pendingSearchInfo ?? evt.searchInfo)?.sources;
            const assistantMsg: DisplayMessage = {
              role: "assistant",
              content: sanitizeResponse(accumulated),
              sources: sources?.length ? sources as Source[] : undefined,
            };
            setMessages([...newMessages, assistantMsg]);

            if (!conversationId && evt.conversationId) {
              setConversationId(evt.conversationId);
              if (user) refetchConversations();
            }
            if (!user && evt.guestMessageCount != null && evt.guestMessageLimit != null) {
              if (evt.guestMessageCount >= evt.guestMessageLimit) {
                setGuestLimitReached(true);
              }
            }
          },
          onError: (err: any) => {
            setIsStreaming(false);
            setStreamingContent("");
            const status = err?.status ?? err?.response?.status;
            if (status === 429 || status === 403) {
              setGuestLimitReached(true);
            } else {
              // Revert to the snapshot before this send (use ref to avoid stale closure)
              setMessages(messagesRef.current.slice(0, -1));
            }
          },
        },
        ctrl.signal,
      );
    } catch {
      setIsStreaming(false);
      setStreamingContent("");
    } finally {
      abortRef.current = null;
    }
  }, [input, isStreaming, guestLimitReached, messages, conversationId, user, refetchConversations]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setStreamingContent("");
    setConversationId(undefined);
    setMessages([]);
    setGuestLimitReached(false);
    setInput("");
    if (isMobileSidebarOpen) setIsMobileSidebarOpen(false);
  };

  const loadConversation = (id: number) => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setStreamingContent("");
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
            {messages.length === 0 && !isStreaming ? (
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
                {displayMessages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[88%] break-words ${
                        msg.role === "user"
                          ? "bg-white text-black px-4 py-3 rounded-2xl rounded-br-sm text-[0.875rem] leading-relaxed"
                          : "text-white w-full"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        // Show bouncing dots while waiting for the first streaming token
                        isStreaming && idx === displayMessages.length - 1 && !streamingContent ? (
                          <div className="flex items-center gap-1.5 py-2">
                            <span className="w-2 h-2 rounded-full bg-white/25 animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="w-2 h-2 rounded-full bg-white/25 animate-bounce" style={{ animationDelay: "120ms" }} />
                            <span className="w-2 h-2 rounded-full bg-white/25 animate-bounce" style={{ animationDelay: "240ms" }} />
                          </div>
                        ) : (
                          <MessageContent content={msg.content as string} sources={msg.sources} timeInfo={msg.timeInfo} />
                        )
                      ) : (
                        msg.content as string
                      )}
                    </div>
                  </div>
                ))}

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
                disabled={guestLimitReached || isStreaming}
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
                disabled={!input.trim() || isStreaming || guestLimitReached}
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
