import React, { useState, useRef, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import {
  useListModels,
  useChatCompletion,
  useListConversations,
  useGetConversationMessages,
  useDeleteConversation,
  setGuestSessionId,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Activity,
  FileText,
  Send,
  Plus,
  ChevronDown,
  LogIn,
  LogOut,
  Sparkles,
  Zap,
  Code2,
  Eye,
  Brain,
  Mic,
  SquarePen,
  Trash2,
  MessageSquare,
} from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };

const GUEST_MESSAGE_LIMIT = 5;
const GUEST_SESSION_KEY = "engagera_guest_session_id";

function getOrCreateGuestSessionId(): string {
  let id = localStorage.getItem(GUEST_SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(GUEST_SESSION_KEY, id);
  }
  return id;
}

const MODEL_ICONS: Record<string, React.ReactNode> = {
  "engagera-lite": <Zap className="h-3.5 w-3.5" />,
  "engagera-pro": <Sparkles className="h-3.5 w-3.5" />,
  "engagera-reason": <Brain className="h-3.5 w-3.5" />,
  "engagera-code": <Code2 className="h-3.5 w-3.5" />,
  "engagera-vision": <Eye className="h-3.5 w-3.5" />,
  "engagera-voice": <Mic className="h-3.5 w-3.5" />,
};

const SUGGESTED_PROMPTS = [
  { label: "Explain quantum computing", sub: "in simple terms" },
  { label: "Write a Python function", sub: "to parse JSON from an API" },
  { label: "Debug my code", sub: "and explain the issue" },
  { label: "Draft a project proposal", sub: "for a new feature" },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Landing() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { data: models } = useListModels();
  const chatMutation = useChatCompletion();
  const deleteConvMutation = useDeleteConversation();
  const [, navigate] = useLocation();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState("engagera-pro");
  const [modelOpen, setModelOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [loadingConvId, setLoadingConvId] = useState<number | null>(null);

  const [guestSessionId] = useState<string>(() => getOrCreateGuestSessionId());
  const [guestMessageCount, setGuestMessageCount] = useState<number>(0);
  const [showGuestLimit, setShowGuestLimit] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  const isGuest = !user && !authLoading;

  // ── Register guest session ID with the fetch client ───────────────────────
  useEffect(() => {
    if (!user && !authLoading) {
      setGuestSessionId(guestSessionId);
    } else {
      setGuestSessionId(null);
    }
  }, [user, authLoading, guestSessionId]);

  // ── Conversation list ──────────────────────────────────────────────────────
  const { data: conversations, refetch: refetchConversations } = useListConversations();

  // ── Load messages for a conversation when clicking it ─────────────────────
  // Generated hook has enabled: !!(id) built-in; passing 0 disables it.
  const { data: loadedMessages } = useGetConversationMessages(loadingConvId ?? 0);

  useEffect(() => {
    if (loadingConvId !== null && Array.isArray(loadedMessages)) {
      setMessages(
        loadedMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
      );
      setActiveConversationId(loadingConvId);
      setLoadingConvId(null);
    }
  }, [loadedMessages, loadingConvId]);

  useEffect(() => {
    if (Array.isArray(models) && models.length > 0 && !models.find((m) => m.id === selectedModel)) {
      setSelectedModel(models[0].id);
    }
  }, [models]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatMutation.isPending]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedModelData = Array.isArray(models) ? models.find((m) => m.id === selectedModel) : undefined;

  const handleSelectConversation = useCallback((id: number) => {
    setLoadingConvId(id);
    setMessages([]);
  }, []);

  const handleDeleteConversation = useCallback(
    async (e: React.MouseEvent, id: number) => {
      e.stopPropagation();
      deleteConvMutation.mutate(
        { id },
        { onSuccess: () => { refetchConversations(); if (activeConversationId === id) handleNewChat(); } }
      );
    },
    [activeConversationId]
  );

  const handleSend = (text?: string) => {
    const content = (text ?? input).trim();
    if (!content) return;

    if (isGuest && guestMessageCount >= GUEST_MESSAGE_LIMIT) {
      setShowGuestLimit(true);
      return;
    }

    const userMsg: Message = { role: "user", content };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    chatMutation.mutate(
      {
        data: {
          messages: updated,
          model: selectedModel,
          ...(activeConversationId ? { conversationId: activeConversationId } : {}),
        },
      },
      {
        onSuccess: (res) => {
          setMessages([...updated, { role: "assistant", content: res.message.content }]);
          if (res.conversationId) setActiveConversationId(res.conversationId);
          if (res.guestMessageCount !== undefined) {
            setGuestMessageCount(res.guestMessageCount);
            if (res.guestMessageCount >= GUEST_MESSAGE_LIMIT) setShowGuestLimit(true);
          }
          refetchConversations();
        },
        onError: (err: unknown) => {
          const e = err as { response?: { data?: { error?: string; guestMessageCount?: number } } };
          if (e?.response?.data?.error === "GUEST_LIMIT_REACHED") {
            setShowGuestLimit(true);
            setGuestMessageCount(GUEST_MESSAGE_LIMIT);
          }
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
  };

  const handleNewChat = () => {
    setMessages([]);
    setInput("");
    setActiveConversationId(null);
    setShowGuestLimit(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.focus();
    }
  };

  const navLinks = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/usage", label: "Usage", icon: Activity },
    { href: "/docs", label: "Documentation", icon: FileText },
  ];

  const guestRemaining = Math.max(0, GUEST_MESSAGE_LIMIT - guestMessageCount);

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-foreground overflow-hidden">
      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside
        className={cn(
          "flex flex-col border-r border-white/[0.06] bg-[#111111] transition-all duration-200 shrink-0",
          sidebarOpen ? "w-64" : "w-0 overflow-hidden"
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Engagera" className="h-7 w-7 object-contain" />
            <span className="font-bold text-sm tracking-tight">Engagera</span>
          </div>
        </div>

        {/* New Chat */}
        <div className="px-3 pt-3 shrink-0">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors"
          >
            <SquarePen className="h-4 w-4" />
            New chat
          </button>
        </div>

        {/* Model picker */}
        <div className="px-3 pt-2 shrink-0" ref={modelDropdownRef}>
          <div className="relative">
            <button
              onClick={() => setModelOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
            >
              <div className="flex items-center gap-2 text-primary">
                {MODEL_ICONS[selectedModel]}
                <span className="text-foreground">{selectedModelData?.name ?? "Select model"}</span>
              </div>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-muted-foreground transition-transform",
                  modelOpen && "rotate-180"
                )}
              />
            </button>

            {modelOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border border-white/[0.08] bg-[#1a1a1a] shadow-xl overflow-hidden">
                {Array.isArray(models) && models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setSelectedModel(m.id);
                      setModelOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-white/[0.06] transition-colors text-left",
                      selectedModel === m.id ? "text-primary bg-primary/10" : "text-muted-foreground"
                    )}
                  >
                    <span className={selectedModel === m.id ? "text-primary" : "text-muted-foreground"}>
                      {MODEL_ICONS[m.id]}
                    </span>
                    <div>
                      <div className="font-medium text-foreground">{m.name}</div>
                      <div className="text-xs text-muted-foreground/70 capitalize">{m.category}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Conversation history ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-2 py-3 min-h-0">
          {Array.isArray(conversations) && conversations.length > 0 ? (
            <div>
              <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
                Recent chats
              </p>
              <div className="space-y-0.5">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv.id)}
                    className={cn(
                      "group flex items-start gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors",
                      activeConversationId === conv.id
                        ? "bg-white/[0.08] text-foreground"
                        : "hover:bg-white/[0.05] text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-60" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate leading-tight">{conv.title}</p>
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                        {timeAgo(conv.updatedAt)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleDeleteConversation(e, conv.id)}
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/60 hover:text-red-400 p-0.5 rounded"
                      title="Delete conversation"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-3 py-6 opacity-40">
              <MessageSquare className="h-6 w-6 mb-2 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">No conversations yet</p>
            </div>
          )}
        </div>

        {/* Guest usage meter */}
        {isGuest && (
          <div className="px-3 pb-2 shrink-0">
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-medium text-muted-foreground">Free messages</p>
                <p className="text-[10px] font-semibold text-foreground">
                  {guestMessageCount}/{GUEST_MESSAGE_LIMIT}
                </p>
              </div>
              <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    guestMessageCount >= GUEST_MESSAGE_LIMIT ? "bg-red-500" : "bg-primary"
                  )}
                  style={{ width: `${Math.min(100, (guestMessageCount / GUEST_MESSAGE_LIMIT) * 100)}%` }}
                />
              </div>
              {guestRemaining > 0 ? (
                <p className="text-[10px] text-muted-foreground/60 mt-1.5">
                  {guestRemaining} message{guestRemaining !== 1 ? "s" : ""} remaining
                </p>
              ) : (
                <Link href="/sign-up">
                  <p className="text-[10px] text-primary mt-1.5 cursor-pointer hover:underline font-medium">
                    Sign up for unlimited access →
                  </p>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Nav links */}
        <nav className="px-3 pb-2 space-y-0.5 border-t border-white/[0.06] pt-3 shrink-0">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}>
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors cursor-pointer">
                <Icon className="h-4 w-4" />
                {label}
              </div>
            </Link>
          ))}
        </nav>

        {/* Auth */}
        <div className="px-3 pb-4 pt-1 shrink-0">
          {authLoading ? null : user ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg">
              <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-primary">
                  {user.email?.[0]?.toUpperCase() ?? "U"}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{user.email}</p>
              </div>
              <button
                onClick={() => signOut()}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <Link href="/sign-in">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors cursor-pointer">
                <LogIn className="h-4 w-4" />
                Sign in
              </div>
            </Link>
          )}
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 relative">
        {/* Top bar */}
        <header className="h-14 border-b border-white/[0.06] flex items-center px-4 gap-3 shrink-0">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="3" width="14" height="1.5" rx="0.75" fill="currentColor" />
              <rect x="1" y="7.25" width="14" height="1.5" rx="0.75" fill="currentColor" />
              <rect x="1" y="11.5" width="14" height="1.5" rx="0.75" fill="currentColor" />
            </svg>
          </button>

          {!sidebarOpen && (
            <div className="flex items-center gap-2.5">
              <img src="/logo.png" alt="Engagera" className="h-6 w-6 object-contain" />
              <span className="font-bold text-sm tracking-tight">Engagera</span>
            </div>
          )}

          <div className="flex-1" />

          {!user && !authLoading && (
            <div className="flex items-center gap-2">
              <Link href="/sign-in">
                <button className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md hover:bg-white/[0.06]">
                  Sign in
                </button>
              </Link>
              <Link href="/sign-up">
                <button className="text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-md font-medium hover:bg-primary/90 transition-colors">
                  Get API Key
                </button>
              </Link>
            </div>
          )}

          {user && (
            <button
              onClick={handleNewChat}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md hover:bg-white/[0.06]"
            >
              <Plus className="h-4 w-4" />
              New chat
            </button>
          )}
        </header>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-4 pb-32">
              <div className="mb-8 text-center">
                <div className="h-14 w-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-5">
                  <img src="/logo.png" alt="Engagera" className="h-8 w-8 object-contain" />
                </div>
                <h1 className="text-2xl font-semibold tracking-tight mb-1">
                  What can I help with?
                </h1>
                <p className="text-sm text-muted-foreground">
                  Powered by{" "}
                  <span className="text-primary font-medium">
                    {selectedModelData?.name ?? "Engagera"}
                  </span>
                </p>
                {isGuest && (
                  <p className="text-xs text-muted-foreground/50 mt-2">
                    Try {guestRemaining} free message{guestRemaining !== 1 ? "s" : ""} ·{" "}
                    <Link href="/sign-up">
                      <span className="text-primary cursor-pointer hover:underline">
                        Sign up for unlimited
                      </span>
                    </Link>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 w-full max-w-xl">
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => handleSend(p.label + " " + p.sub)}
                    className="text-left p-3.5 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.14] transition-all group"
                  >
                    <p className="text-sm font-medium text-foreground/90 group-hover:text-foreground">
                      {p.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.sub}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn("flex gap-4", msg.role === "user" ? "justify-end" : "justify-start")}
                >
                  {msg.role === "assistant" && (
                    <div className="h-8 w-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0 mt-0.5">
                      <img src="/logo.png" alt="" className="h-4 w-4 object-contain" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                      msg.role === "user"
                        ? "bg-white/[0.08] text-foreground rounded-br-sm"
                        : "text-foreground/90 rounded-bl-sm"
                    )}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                  {msg.role === "user" && (
                    <div className="h-8 w-8 rounded-lg bg-white/[0.08] flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs font-semibold">
                        {user?.email?.[0]?.toUpperCase() ?? "G"}
                      </span>
                    </div>
                  )}
                </div>
              ))}

              {chatMutation.isPending && (
                <div className="flex gap-4 justify-start">
                  <div className="h-8 w-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0 mt-0.5">
                    <img src="/logo.png" alt="" className="h-4 w-4 object-contain" />
                  </div>
                  <div className="flex items-center gap-1.5 px-4 py-3">
                    <span className="h-1.5 w-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-1.5 w-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "120ms" }} />
                    <span className="h-1.5 w-1.5 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "240ms" }} />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="px-4 pb-6 pt-2 max-w-3xl mx-auto w-full">
          <div className="relative rounded-2xl border border-white/[0.1] bg-white/[0.04] focus-within:border-white/[0.2] focus-within:bg-white/[0.06] transition-all shadow-lg">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder={
                isGuest && guestMessageCount >= GUEST_MESSAGE_LIMIT
                  ? "Sign up to continue chatting..."
                  : "Message Engagera..."
              }
              disabled={chatMutation.isPending || (isGuest && guestMessageCount >= GUEST_MESSAGE_LIMIT)}
              rows={1}
              className="w-full resize-none bg-transparent px-4 pt-3.5 pb-12 text-sm placeholder:text-muted-foreground/50 focus:outline-none disabled:opacity-50 max-h-[200px]"
            />

            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 pb-3 pointer-events-none">
              <div className="flex items-center gap-1.5 pointer-events-auto">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/[0.08] text-xs text-muted-foreground">
                  {MODEL_ICONS[selectedModel]}
                  <span>{selectedModelData?.name ?? selectedModel}</span>
                </div>
              </div>

              <button
                onClick={() => handleSend()}
                disabled={
                  !input.trim() ||
                  chatMutation.isPending ||
                  (isGuest && guestMessageCount >= GUEST_MESSAGE_LIMIT)
                }
                className="pointer-events-auto h-8 w-8 flex items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-primary/90 transition-all"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground/40 mt-3">
            Engagera can make mistakes. Verify important information.
          </p>
        </div>

        {/* ── Guest limit overlay ────────────────────────────────────────────── */}
        {showGuestLimit && (
          <div className="absolute inset-0 flex items-end justify-center pb-32 z-40 pointer-events-none">
            <div className="pointer-events-auto w-full max-w-md mx-4">
              <div className="rounded-2xl border border-white/[0.1] bg-[#161616] shadow-2xl p-6 text-center">
                <div className="h-12 w-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-4">
                  <img src="/logo.png" alt="Engagera" className="h-7 w-7 object-contain" />
                </div>
                <h3 className="font-semibold text-lg mb-1">You've used your free messages</h3>
                <p className="text-sm text-muted-foreground mb-5">
                  Create a free account to unlock unlimited conversations, API access, and more.
                </p>
                <div className="flex gap-3">
                  <Link href="/sign-up" className="flex-1">
                    <button className="w-full px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
                      Create free account
                    </button>
                  </Link>
                  <Link href="/sign-in" className="flex-1">
                    <button className="w-full px-4 py-2.5 rounded-xl border border-white/[0.1] bg-white/[0.04] text-sm font-medium hover:bg-white/[0.08] transition-colors">
                      Sign in
                    </button>
                  </Link>
                </div>
                <button
                  onClick={() => setShowGuestLimit(false)}
                  className="mt-3 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
