import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Menu, Plus, MessageSquare, Send, Trash2, Cpu } from "lucide-react";
import {
  useListConversations,
  useGetConversationMessages,
  getGetConversationMessagesQueryKey,
  useDeleteConversation
} from "@workspace/api-client-react";
import { useEdgeChatCompletion, ChatMessage } from "@/hooks/useEdgeChatCompletion";
import { useAuth } from "@/hooks/useAuth";
import { MessageContent, Source } from "@/components/MessageContent";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { detectModel, MODEL_LABELS, EngageraModel } from "@/lib/autoModel";
import PublicLayout from "@/components/layout/PublicLayout";

interface DisplayMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

/**
 * Strip citation artifacts the AI might still emit despite the system prompt —
 * e.g. [Title](https://example.com), "According to [Source]...", raw HTTP URLs.
 * The AI's knowledge is presented as its own; sources are never surfaced to users.
 */
function sanitizeResponse(text: string): string {
  return text
    // Remove markdown links: [Text](url) → just keep Text
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
    // Remove bare URLs
    .replace(/https?:\/\/[^\s)>\]"']+/g, "")
    // Remove leading phrases that expose research origins
    .replace(/^(According to |Based on (search results?|web search|research|the (search|data))[,:]?\s*)/gim, "")
    .replace(/^(The (search|web) results? (show|indicate|suggest|reveal)[s]?[,:]?\s*)/gim, "")
    .replace(/^(From my (search|research|knowledge base|training)[,:]?\s*)/gim, "")
    // Remove citation markers like [1], [2], etc.
    .replace(/\[\d+\]/g, "")
    // Clean up any double spaces / leading whitespace on lines
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  const { data: conversations = [], refetch: refetchConversations } = useListConversations();
  const { data: historyMessages } = useGetConversationMessages(conversationId!, {
    query: { enabled: !!conversationId, queryKey: getGetConversationMessagesQueryKey(conversationId!) }
  });
  const deleteConversation = useDeleteConversation();
  const chatCompletion = useEdgeChatCompletion();

  useEffect(() => {
    if (historyMessages && historyMessages.length > 0) {
      setMessages(historyMessages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })));
    } else if (!conversationId) {
      setMessages([]);
    }
  }, [historyMessages, conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatCompletion.isPending]);

  // Auto-detect best model from input text
  useEffect(() => {
    if (input.trim().length > 2) {
      setAutoModel(detectModel(input.trim()));
    } else {
      setAutoModel("engagera-pro");
    }
  }, [input]);

  const handleSend = async () => {
    if (!input.trim() || chatCompletion.isPending || guestLimitReached) return;

    const msgModel = detectModel(input.trim());
    const userMsg: DisplayMessage = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");

    // Only pass role+content to the API (no metadata fields)
    const apiMessages: ChatMessage[] = newMessages.map(m => ({ role: m.role, content: m.content }));

    chatCompletion.mutate(
      { messages: apiMessages, model: msgModel, conversationId },
      {
        onSuccess: (res: any) => {
          const assistantMsg: DisplayMessage = {
            role: "assistant",
            content: sanitizeResponse(res.message.content ?? ""),
            sources: res.searchInfo?.sources?.length ? res.searchInfo.sources : undefined,
          };
          setMessages([...newMessages, assistantMsg]);

          if (!conversationId && res.conversationId) {
            setConversationId(res.conversationId);
            if (user) refetchConversations();
          }
          // Show sign-up prompt after last free message
          if (!user && res.guestMessageCount != null && res.guestMessageLimit != null) {
            if (res.guestMessageCount >= res.guestMessageLimit) {
              setGuestLimitReached(true);
            }
          }
        },
        onError: (err: any) => {
          const status = err?.status ?? err?.response?.status;
          if (status === 429 || status === 403 || err?.data?.guestMessageLimit) {
            setGuestLimitReached(true);
          } else {
            setMessages(messages);
          }
        }
      }
    );
  };

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
    <div className="flex flex-col h-full bg-black border-r border-white/15 w-full">
      <div className="p-4 border-b border-white/15">
        <button
          onClick={handleNewChat}
          className="w-full flex items-center gap-2 px-4 py-2 border border-white/20 hover:bg-white/10 transition-colors text-sm font-medium rounded-full"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-0.5">
        {conversations.length === 0 ? (
          <div className="p-4 text-center text-white/30 text-sm">No conversations yet.</div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => loadConversation(conv.id)}
              className={`flex items-center justify-between p-2.5 cursor-pointer text-sm transition-colors rounded-xl ${
                conversationId === conv.id ? "bg-white/10" : "hover:bg-white/5"
              }`}
            >
              <div className="flex items-center gap-2.5 overflow-hidden">
                <MessageSquare className="w-3.5 h-3.5 shrink-0 text-white/35" />
                <span className="truncate text-sm text-white/80">{conv.title || "New Conversation"}</span>
              </div>
              <button
                onClick={(e) => handleDeleteConversation(conv.id, e)}
                className="text-white/25 hover:text-white/60 shrink-0 ml-2 transition-colors"
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

          {/* Top bar — mobile menu + auto model indicator */}
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
            {/* Auto-detected model pill */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03] text-white/45 text-xs">
              <Cpu className="w-3 h-3 shrink-0" />
              <span>{MODEL_LABELS[autoModel] ?? autoModel}</span>
              <span className="text-white/20 ml-0.5">· auto</span>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {messages.length === 0 ? (
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
                        <MessageContent content={msg.content as string} sources={msg.sources} />
                      ) : (
                        msg.content as string
                      )}
                    </div>
                  </div>
                ))}
                {chatCompletion.isPending && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-1.5 py-2">
                      <span className="w-2 h-2 rounded-full bg-white/25 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 rounded-full bg-white/25 animate-bounce" style={{ animationDelay: "120ms" }} />
                      <span className="w-2 h-2 rounded-full bg-white/25 animate-bounce" style={{ animationDelay: "240ms" }} />
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
                disabled={guestLimitReached || chatCompletion.isPending}
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
                disabled={!input.trim() || chatCompletion.isPending || guestLimitReached}
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
