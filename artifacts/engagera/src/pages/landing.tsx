import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { Menu, Plus, Send, Trash2, Image as ImageIcon, ChevronDown, MessageSquare, Search, UserCircle } from "lucide-react";
import { logoSrc } from "@/lib/assets";
import {
  useListConversations,
  useGetConversationMessages,
  getGetConversationMessagesQueryKey,
  useDeleteConversation
} from "@workspace/api-client-react";
import { streamEdgeChat, ChatMessage, TimeInfo } from "@/hooks/useEdgeChatCompletion";
import { useAuth } from "@/hooks/useAuth";
import { MessageContent, Source } from "@/components/MessageContent";
import { WebCrawlIndicator } from "@/components/WebCrawlIndicator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { detectModel, MODEL_LABELS, EngageraModel } from "@/lib/autoModel";
import PublicLayout from "@/components/layout/PublicLayout";

interface DisplayMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  crawledUrls?: string[];
  timeInfo?: TimeInfo;
  streaming?: boolean; // true while the SSE stream is open
  imageGenerating?: boolean; // true while an image-generation reply is in flight
  searchStatus?: string; // live search progress message shown while tools are running
}

// ── Agent definitions for the selector ──────────────────────────────────────
const AGENTS = [
  { id: "assistant", label: "Assistant",   icon: "✦", description: "General AI conversation" },
  { id: "research",  label: "Research",    icon: "🔍", description: "Deep web research & analysis" },
  { id: "coding",    label: "Coding",      icon: "⌨", description: "Write, debug & review code" },
  { id: "writing",   label: "Writing",     icon: "✍", description: "Articles, emails & content" },
  { id: "planner",   label: "Planner",     icon: "📋", description: "Goals into actionable plans" },
  { id: "data",      label: "Data",        icon: "📊", description: "Analyze data & find insights" },
  { id: "document",  label: "Document",    icon: "📄", description: "Read, summarize & extract docs" },
  { id: "automation",label: "Automation",  icon: "⚡", description: "Workflows & process automation" },
] as const;
type AgentId = (typeof AGENTS)[number]["id"];

export default function Landing() {
  const { user, displayName } = useAuth();
  const [location, setLocation] = useLocation();
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [autoModel, setAutoModel] = useState<EngageraModel>("engagera-pro");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentId>("assistant");
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const agentMenuRef = useRef<HTMLDivElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const AUTH_DRAFT_KEY = "engagera_auth_prompt_draft";

  useEffect(() => {
    if (!user) return;
    const draft = sessionStorage.getItem(AUTH_DRAFT_KEY);
    if (!draft) return;
    setInput(draft);
    sessionStorage.removeItem(AUTH_DRAFT_KEY);
    requestAnimationFrame(() => chatInputRef.current?.focus());
  }, [user]);

  // Close agent menu on outside click
  useEffect(() => {
    if (!showAgentMenu) return;
    const handler = (e: MouseEvent) => {
      if (agentMenuRef.current && !agentMenuRef.current.contains(e.target as Node)) {
        setShowAgentMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAgentMenu]);

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
  const chatConversations = conversations.filter((conversation) =>
    conversation.model !== "engagera-reason" &&
    conversation.model !== "engagera-2.1"
  );
  const filteredChatConversations = useMemo(() => {
    const query = historyQuery.trim().toLowerCase();
    if (!query) return chatConversations;
    return chatConversations.filter((conversation) =>
      (conversation.title || "New Conversation").toLowerCase().includes(query)
    );
  }, [chatConversations, historyQuery]);
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
    if (!input.trim() || isLoading) return;
    if (!user) {
      sessionStorage.setItem(AUTH_DRAFT_KEY, input);
      setLocation("/sign-in?returnTo=/");
      return;
    }

    const msgModel = detectModel(input.trim());
    // detectModel already routes unambiguous image requests to
    // "engagera-image" — reuse that instead of a second heuristic. Image
    // replies never stream token-by-token (the backend waits for the whole
    // image before responding), so the placeholder shows a distinct
    // "creating your image" frame instead of the generic thinking dots.
    const isImageReq = msgModel === "engagera-image";
    const userMsg: DisplayMessage = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    chatInputRef.current?.focus();

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
    setMessages([
      ...newMessages,
      { role: "assistant", content: "", streaming: !isImageReq, imageGenerating: isImageReq },
    ]);
    if (!isImageReq) startRevealLoop(assistantIndex);

    try {
      await streamEdgeChat(
        {
          messages: apiMessages,
          model: msgModel,
          conversationId,
          stream: true,
          useAfuBot: true,
          agent: selectedAgent !== "assistant" ? selectedAgent : undefined,
        },
        {
          onToken: (chunk) => {
            streamedAny = true;
            // Image replies arrive as one already-finished chunk (a full
            // data: URI, often 100KB+) rather than a token stream — apply
            // it straight to state instead of the char-by-char reveal
            // queue, which would be slow and pointless for a value that
            // was never actually streamed.
            if (isImageReq) {
              setMessages((prev) => {
                if (!prev[assistantIndex]) return prev;
                const next = [...prev];
                next[assistantIndex] = {
                  ...next[assistantIndex],
                  content: next[assistantIndex].content + chunk,
                  imageGenerating: false,
                };
                return next;
              });
              return;
            }
            pendingCharsRef.current += chunk;
          },
          onSearchStatus: (message) => {
            if (assistantIndex === -1) return;
            setMessages((prev) => {
              const next = [...prev];
              next[assistantIndex] = { ...next[assistantIndex], searchStatus: message };
              return next;
            });
          },
          onMeta: (searchInfo) => {
            if (assistantIndex === -1) return;
            setMessages((prev) => {
              const next = [...prev];
              next[assistantIndex] = {
                ...next[assistantIndex],
                sources: searchInfo.sources as Source[],
                crawledUrls: searchInfo.crawledUrls,
                searchStatus: undefined,
              };
              return next;
            });
          },
          onDone: (doneEvt) => {
            const rawSources = doneEvt.crawledSources?.length ? doneEvt.crawledSources : doneEvt.searchInfo?.sources;
            setMessages((prev) => {
              const next = [...prev];
              if (!next[assistantIndex]) return prev;
              next[assistantIndex] = {
                ...next[assistantIndex],
                streaming: false,
                sources: rawSources?.length ? (rawSources as Source[]) : next[assistantIndex].sources,
                crawledUrls: doneEvt.crawledUrls ?? next[assistantIndex].crawledUrls,
                timeInfo: doneEvt.timeInfo ?? next[assistantIndex].timeInfo,
              };
              return next;
            });

            if (!conversationId && doneEvt.conversationId) {
              setConversationId(doneEvt.conversationId);
              if (user) refetchConversations();
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
        setMessages((prev) => prev.slice(0, assistantIndex - 1)); // remove user msg + placeholder
      } else if (!streamedAny) {
        setMessages(newMessages.slice(0, -1)); // remove user msg + empty placeholder
      } else {
        // Partial reply — keep it but clear the streaming flag so the cursor disappears
        setMessages((prev) => {
          const next = [...prev];
          if (next[assistantIndex]) next[assistantIndex] = { ...next[assistantIndex], streaming: false };
          return next;
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, conversationId, user, refetchConversations, setLocation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    setConversationId(undefined);
    setMessages([]);
    setInput("");
    setHistoryQuery("");
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
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 pt-5 pb-3">
        <img src={logoSrc} alt="Engagera" className="w-6 h-6 rounded-md shrink-0" />
        <span className="font-bold text-sm tracking-tight">Engagera</span>
      </div>
      <div className="p-3">
        <button
          onClick={handleNewChat}
          className="w-full flex items-center gap-2 px-4 py-2.5 bg-white/[0.07] hover:bg-white/[0.12] transition-colors text-sm font-medium rounded-xl"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>
      </div>
      <div className="px-3 pb-3">
        <div className="flex items-center gap-2 px-3 h-9 rounded-xl border border-white/[0.10] bg-white/[0.03]">
          <Search className="w-3.5 h-3.5 shrink-0 text-white/35" />
          <input
            value={historyQuery}
            onChange={(event) => setHistoryQuery(event.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="w-full bg-transparent outline-none text-xs text-white placeholder:text-white/30"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-2 space-y-0.5">
        {filteredChatConversations.length === 0 ? (
          <div className="p-4 text-center text-white/30 text-sm">
            {historyQuery ? "No matching chats." : "No conversations yet."}
          </div>
        ) : (
          filteredChatConversations.map((conv) => (
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
      <div className="shrink-0 border-t border-white/[0.08] p-2">
        <button
          onClick={() => {
            setIsMobileSidebarOpen(false);
            setLocation("/settings");
          }}
          aria-label="Open profile and settings"
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors ${
            location === "/settings"
              ? "bg-white text-black"
              : "text-white/65 hover:text-white hover:bg-white/[0.07]"
          }`}
        >
          <UserCircle className="w-4 h-4 shrink-0" />
          <span className="truncate text-sm font-medium">{displayName ?? user?.email ?? "Profile"}</span>
        </button>
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

          {/* Top bar — mobile sidebar trigger only */}
          {user && (
            <div className="shrink-0 flex items-center px-3 py-2 bg-black">
              <Sheet open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
                <SheetTrigger asChild>
                  <button className="md:hidden p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/[0.07] transition-colors">
                    <Menu className="w-4 h-4" />
                  </button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 bg-[#080808] border-0 w-72 rounded-none sm:max-w-none">
                  <SidebarContent />
                </SheetContent>
              </Sheet>
            </div>
          )}

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
                    Sign in to send messages and save your conversations
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
                        msg.imageGenerating && !msg.content ? (
                          /* Image requests never stream tokens — show a distinct
                             "creating your image" frame so it's clear the model
                             is actively drawing something, not just thinking. */
                          <div className="flex items-center gap-3 py-2">
                            <div className="w-[72px] h-[54px] rounded-xl border border-dashed border-white/25 flex items-center justify-center image-gen-pulse">
                              <ImageIcon className="w-5 h-5 text-white/70" />
                            </div>
                            <span className="thinking-shimmer text-[13px] font-medium tracking-wide">
                              Creating your image…
                            </span>
                          </div>
                        ) : msg.streaming && !msg.content ? (
                          /* Waiting for first token — show search status if a tool is running,
                             orb only if the model is reasoning internally (no label per spec) */
                          <div className="flex items-center gap-2.5 py-2">
                            <span className="relative flex items-center justify-center w-3.5 h-3.5 shrink-0">
                              <span className="thinking-orb-ring absolute inset-0 rounded-full border border-white/40" />
                              <span className="thinking-orb-core absolute inset-[3px] rounded-full bg-white" />
                            </span>
                            {msg.searchStatus && (
                              <span className="thinking-shimmer text-[13px] font-medium tracking-wide">
                                {msg.searchStatus}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="relative">
                            {msg.crawledUrls?.length ? <WebCrawlIndicator urls={msg.crawledUrls} /> : null}
                            <MessageContent content={msg.content} sources={msg.sources} timeInfo={msg.timeInfo} />
                            {msg.streaming && (
                              <span className="inline-block w-[2px] h-[1em] bg-white/60 rounded-full ml-0.5 align-text-bottom animate-pulse" />
                            )}
                          </div>
                        )
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
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input footer */}
          <div className="shrink-0 p-3 md:p-4 bg-black">
            <div className="max-w-3xl mx-auto space-y-2">
              {/* Agent selector */}
              <div className="relative" ref={agentMenuRef}>
                <button
                  onClick={() => setShowAgentMenu(v => !v)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.08] hover:border-white/[0.16] transition-all text-[12px] text-white/60 hover:text-white/80"
                >
                  <span className="text-sm leading-none">{AGENTS.find(a => a.id === selectedAgent)?.icon ?? "✦"}</span>
                  <span className="font-medium">{AGENTS.find(a => a.id === selectedAgent)?.label ?? "Assistant"}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${showAgentMenu ? "rotate-180" : ""}`} />
                </button>

                {/* Agent dropdown */}
                {showAgentMenu && (
                  <div className="absolute bottom-full mb-2 left-0 z-50 w-72 rounded-2xl border border-white/[0.10] bg-[#0e0e0e] shadow-2xl p-1.5 grid grid-cols-2 gap-1">
                    {AGENTS.map(agent => (
                      <button
                        key={agent.id}
                        onClick={() => { setSelectedAgent(agent.id); setShowAgentMenu(false); }}
                        className={`flex items-start gap-2 px-2.5 py-2 rounded-xl text-left transition-all ${
                          selectedAgent === agent.id
                            ? "bg-white/[0.10] border border-white/[0.14]"
                            : "hover:bg-white/[0.06] border border-transparent"
                        }`}
                      >
                        <span className="text-base leading-none mt-0.5 shrink-0">{agent.icon}</span>
                        <div className="min-w-0">
                          <div className="text-[12px] font-semibold text-white/85 leading-tight">{agent.label}</div>
                          <div className="text-[10px] text-white/35 leading-snug mt-0.5 truncate">{agent.description}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Text input row */}
              <div className="relative flex items-end gap-2">
                <div className="flex-1 relative flex items-end">
                  <textarea
                    ref={chatInputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Message ${AGENTS.find(a => a.id === selectedAgent)?.label ?? "Engagera"}…`}
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
                    disabled={!input.trim() || isLoading}
                    className="absolute right-2 bottom-2 p-1.5 text-white/40 hover:text-white disabled:opacity-20 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            <p className="text-center mt-2 text-[10px] text-white/20">
              Engagera AI can make mistakes. Verify important information.
            </p>
          </div>
        </div>
      </div>

    </PublicLayout>
  );
}
