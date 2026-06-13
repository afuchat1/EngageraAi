import React, { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "wouter";
import {
  useListModels,
  useListConversations,
  useDeleteConversation,
  useGetConversationMessages,
  setGuestSessionId,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useEdgeChatCompletion, ContentPart } from "@/hooks/useEdgeChatCompletion";
import { usePhoneVoice, type PhoneState } from "@/hooks/usePhoneVoice";
import { cn } from "@/lib/utils";
import { detectModel } from "@/lib/autoModel";
import { MessageContent } from "@/components/MessageContent";
import {
  LayoutDashboard,
  Activity,
  FileText,
  Send,
  Plus,
  LogIn,
  Mic,
  PhoneOff,
  SquarePen,
  Trash2,
  Clock,
  AlignJustify,
  Paperclip,
  X,
} from "lucide-react";

type MessageContent = string | ContentPart[];
type Message = { role: "user" | "assistant"; content: MessageContent };

interface Attachment {
  id: string;
  name: string;
  kind: "image" | "text";
  preview?: string;
  content: string;
  mimeType: string;
}

function getTextContent(content: MessageContent): string {
  if (typeof content === "string") return content;
  return content.filter((p): p is { type: "text"; text: string } => p.type === "text").map((p) => p.text).join(" ");
}

const GUEST_DAILY_LIMIT = 5;
const GUEST_SESSION_KEY = "engagera_guest_session_id";

function getOrCreateGuestSessionId(): string {
  let id = localStorage.getItem(GUEST_SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(GUEST_SESSION_KEY, id);
  }
  return id;
}

function loadGuestMessages(sessionId: string): Message[] {
  try {
    const raw = localStorage.getItem(`engagera_chat_${sessionId}`);
    return raw ? (JSON.parse(raw) as Message[]) : [];
  } catch {
    return [];
  }
}

function saveGuestMessages(sessionId: string, msgs: Message[]): void {
  try {
    localStorage.setItem(`engagera_chat_${sessionId}`, JSON.stringify(msgs));
  } catch { /* storage full */ }
}

function loadGuestMeta(sessionId: string): { count: number; resetAt: string | null } {
  try {
    const count = parseInt(localStorage.getItem(`engagera_gcount_${sessionId}`) ?? "0", 10);
    const resetAt = localStorage.getItem(`engagera_greset_${sessionId}`);
    const stillValid = resetAt && new Date(resetAt) > new Date();
    return { count: stillValid ? count : 0, resetAt: stillValid ? resetAt : null };
  } catch {
    return { count: 0, resetAt: null };
  }
}

function formatCountdown(resetAt: string): string {
  const diff = new Date(resetAt).getTime() - Date.now();
  if (diff <= 0) return "now";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

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
  const { user, loading: authLoading } = useAuth();
  const { data: models } = useListModels();
  const chatMutation = useEdgeChatCompletion();
  const deleteConvMutation = useDeleteConversation();
  const { recordMessage, getContextHint } = useUserPreferences();

  const [guestSessionId] = useState<string>(() => getOrCreateGuestSessionId());
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState("engagera-2.0");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [loadingConvId, setLoadingConvId] = useState<number | null>(null);
  const [guestMessageCount, setGuestMessageCount] = useState(0);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [windowResetAt, setWindowResetAt] = useState<string | null>(null);
  const [countdown, setCountdown] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isGuest = !user && !authLoading;
  const isLimited = isGuest && !!windowResetAt;

  // ── Register guest session ID with the fetch client ───────────────────────
  useEffect(() => {
    if (!user && !authLoading) setGuestSessionId(guestSessionId);
    else setGuestSessionId(null);
  }, [user, authLoading, guestSessionId]);

  // ── Load guest messages + meta from localStorage on mount ─────────────────
  useEffect(() => {
    if (!user && !authLoading) {
      const stored = loadGuestMessages(guestSessionId);
      if (stored.length > 0) setMessages(stored);

      const meta = loadGuestMeta(guestSessionId);
      setGuestMessageCount(meta.count);
      if (meta.resetAt) setWindowResetAt(meta.resetAt);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  // ── Save guest messages to localStorage whenever they change ──────────────
  useEffect(() => {
    if (isGuest && messages.length > 0) {
      saveGuestMessages(guestSessionId, messages);
    }
  }, [messages, isGuest, guestSessionId]);

  // ── Persist guest meta (count + resetAt) to localStorage ─────────────────
  useEffect(() => {
    if (!isGuest) return;
    localStorage.setItem(`engagera_gcount_${guestSessionId}`, String(guestMessageCount));
  }, [guestMessageCount, isGuest, guestSessionId]);

  useEffect(() => {
    if (!isGuest) return;
    if (windowResetAt) localStorage.setItem(`engagera_greset_${guestSessionId}`, windowResetAt);
    else localStorage.removeItem(`engagera_greset_${guestSessionId}`);
  }, [windowResetAt, isGuest, guestSessionId]);

  // ── 24hr countdown ticker ─────────────────────────────────────────────────
  useEffect(() => {
    if (!windowResetAt) { setCountdown(""); return; }

    const tick = () => {
      if (new Date(windowResetAt) <= new Date()) {
        setWindowResetAt(null);
        setGuestMessageCount(0);
        setCountdown("");
      } else {
        setCountdown(formatCountdown(windowResetAt));
      }
    };

    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [windowResetAt]);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatMutation.isPending]);

  // ── Default model guard ───────────────────────────────────────────────────
  useEffect(() => {
    if (Array.isArray(models) && models.length > 0 && !models.find((m) => m.id === selectedModel)) {
      setSelectedModel(models[0].id);
    }
  }, [models]);

  const { data: conversations, refetch: refetchConversations } = useListConversations();
  const { data: loadedMessages } = useGetConversationMessages(loadingConvId ?? 0);

  useEffect(() => {
    if (loadingConvId !== null && Array.isArray(loadedMessages)) {
      setMessages(loadedMessages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })));
      setActiveConversationId(loadingConvId);
      setLoadingConvId(null);
    }
  }, [loadedMessages, loadingConvId]);

  const handleSelectConversation = useCallback((id: number) => {
    setLoadingConvId(id);
    setMessages([]);
  }, []);

  const handleDeleteConversation = useCallback(async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    deleteConvMutation.mutate(
      { id },
      { onSuccess: () => { refetchConversations(); if (activeConversationId === id) handleNewChat(); } }
    );
  }, [activeConversationId]);

  const handleNewChat = () => {
    setMessages([]);
    setInput("");
    setAttachments([]);
    setActiveConversationId(null);
    if (isGuest) saveGuestMessages(guestSessionId, []);
    textareaRef.current?.focus();
  };

  // ── Phone voice hook ─────────────────────────────────────────────────────
  const phoneVoice = usePhoneVoice({
    onSend: (text) => {
      handleSendWithContent(text, []);
    },
  });

  const compressImage = (dataUrl: string): Promise<string> =>
    new Promise((resolve) => {
      const MAX_PX = 800;
      const QUALITY = 0.82;
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_PX || height > MAX_PX) {
          const ratio = Math.min(MAX_PX / width, MAX_PX / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", QUALITY));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => {
      const reader = new FileReader();
      const isImage = file.type.startsWith("image/");
      if (isImage) {
        reader.onload = async () => {
          const compressed = await compressImage(reader.result as string);
          setAttachments((prev) => [
            ...prev,
            { id: crypto.randomUUID(), name: file.name, kind: "image", content: compressed, preview: compressed, mimeType: "image/jpeg" },
          ]);
          setSelectedModel("engagera-2.1");
        };
        reader.readAsDataURL(file);
      } else {
        reader.onload = () => {
          setAttachments((prev) => [
            ...prev,
            { id: crypto.randomUUID(), name: file.name, kind: "text", content: reader.result as string, mimeType: file.type },
          ]);
        };
        reader.readAsText(file);
      }
    });
    e.target.value = "";
  };

  const buildContent = (text: string, atts: Attachment[]): MessageContent => {
    const textFiles = atts.filter((a) => a.kind === "text");
    const images = atts.filter((a) => a.kind === "image");
    let finalText = text;
    if (textFiles.length > 0) {
      finalText = textFiles.map((f) => `File: ${f.name}\n\`\`\`\n${f.content}\n\`\`\``).join("\n\n") + (text ? "\n\n" + text : "");
    }
    if (images.length === 0) return finalText;
    const parts: ContentPart[] = [];
    if (finalText) parts.push({ type: "text", text: finalText });
    images.forEach((img) => parts.push({ type: "image_url", image_url: { url: img.content } }));
    return parts;
  };

  const handleSendWithContent = (text: string, atts: Attachment[]) => {
    const rawText = text.trim();
    if ((!rawText && atts.length === 0) || chatMutation.isPending || isLimited) return;
    if (isGuest && guestMessageCount >= GUEST_DAILY_LIMIT && !windowResetAt) return;

    const autoModel = detectModel(rawText, atts);
    setSelectedModel(autoModel);

    const msgContent = buildContent(rawText, atts);
    const userMsg: Message = { role: "user", content: msgContent };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    recordMessage(rawText || "image", autoModel);

    const contextHint = getContextHint();
    chatMutation.mutate(
      {
        messages: updated as any,
        model: autoModel,
        ...(activeConversationId ? { conversationId: activeConversationId } : {}),
        ...(contextHint ? { contextHint } : {}),
      },
      {
        onSuccess: (res) => {
          const withReply: Message[] = [...updated, { role: "assistant", content: res.message.content }];
          setMessages(withReply);
          if (res.conversationId) setActiveConversationId(res.conversationId);
          if (res.guestMessageCount !== undefined) setGuestMessageCount(res.guestMessageCount);
          if (voiceOpen) phoneVoice.speakResponse(res.message.content);
          refetchConversations();
        },
        onError: (err: unknown) => {
          const e = err as { status?: number; data?: { error?: string; windowResetAt?: string; guestMessageCount?: number } };
          if (e?.status === 429) {
            if (e?.data?.windowResetAt) setWindowResetAt(e.data.windowResetAt);
            if (e?.data?.guestMessageCount !== undefined) setGuestMessageCount(e.data.guestMessageCount);
            setMessages(messages);
          } else {
            setMessages([...updated, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
          }
        },
      }
    );
  };

  const handleSend = (text?: string) => handleSendWithContent(text ?? input, attachments);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
  };

  const guestRemaining = Math.max(0, GUEST_DAILY_LIMIT - guestMessageCount);

  return (
    <div className="flex h-screen h-dvh bg-[#0a0a0a] text-foreground overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className={cn(
        "flex flex-col border-r border-[#1a1a1a] bg-[#0d0d0d] transition-all duration-200 shrink-0 overflow-hidden",
        sidebarOpen ? "w-60" : "w-0"
      )}>
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 h-12 border-b border-[#1a1a1a] shrink-0">
          <img src="/logo.png" alt="Engagera" className="h-6 w-6 object-contain" />
          <span className="font-semibold text-sm tracking-tight">Engagera</span>
        </div>

        {/* New chat */}
        <div className="px-3 pt-2 shrink-0">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium text-muted-foreground hover:bg-[#1a1a1a] hover:text-foreground transition-colors"
          >
            <SquarePen className="h-3.5 w-3.5" />
            New chat
          </button>
        </div>


        {/* Conversations */}
        <div className="flex-1 overflow-y-auto px-3 pt-3 pb-2">
          {!user && !authLoading ? (
            <p className="text-[11px] text-muted-foreground/40 px-3">Sign in to see history</p>
          ) : Array.isArray(conversations) && conversations.length > 0 ? (
            <>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 px-3 mb-2">Recent</p>
              {conversations.map((conv: { id: number; title: string; updated_at?: string }) => (
                <div
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={cn(
                    "group flex items-center justify-between gap-1 px-3 py-2 rounded-md cursor-pointer text-xs transition-colors",
                    activeConversationId === conv.id
                      ? "bg-[#1a1a1a] text-foreground"
                      : "text-muted-foreground hover:bg-[#161616] hover:text-foreground"
                  )}
                >
                  <span className="truncate flex-1">{conv.title ?? "Untitled"}</span>
                  <button
                    onClick={(e) => handleDeleteConversation(e, conv.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/50 hover:text-foreground"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground/40 px-3">No conversations yet</p>
          )}
        </div>

        {/* Guest counter */}
        {isGuest && (
          <div className="px-4 py-3 border-t border-[#1a1a1a] shrink-0">
            {windowResetAt ? (
              <div className="flex items-center gap-2 text-[11px] text-amber-400/70">
                <Clock className="h-3 w-3 shrink-0" />
                <span>Resets in {countdown}</span>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground/60 mb-1.5">
                  <span>Free messages</span>
                  <span>{guestRemaining}/{GUEST_DAILY_LIMIT}</span>
                </div>
                <div className="h-0.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/60 rounded-full transition-all"
                    style={{ width: `${(guestRemaining / GUEST_DAILY_LIMIT) * 100}%` }}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* Nav */}
        <nav className="px-3 py-2 border-t border-[#1a1a1a] shrink-0">
          {[
            { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
            { href: "/usage", label: "Usage", icon: Activity },
            { href: "/docs", label: "Documentation", icon: FileText },
          ].map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}>
              <div className="flex items-center gap-2 px-3 py-2 rounded-md text-xs text-muted-foreground hover:bg-[#1a1a1a] hover:text-foreground transition-colors cursor-pointer">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </div>
            </Link>
          ))}
        </nav>

        {/* Auth */}
        <div className="px-3 pb-3 shrink-0">
          {authLoading ? null : user ? (
            <div className="flex items-center gap-2 px-3 py-2">
              {user.user_metadata?.avatar_url ? (
                <img
                  src={user.user_metadata.avatar_url}
                  alt=""
                  className="h-5 w-5 rounded-full object-cover shrink-0 border border-border/50"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-semibold text-primary">
                    {user.email?.[0]?.toUpperCase() ?? "U"}
                  </span>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground flex-1 truncate">
                {user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email}
              </p>
            </div>
          ) : (
            <Link href="/sign-in">
              <div className="flex items-center gap-2 px-3 py-2 rounded-md text-xs text-muted-foreground hover:bg-[#1a1a1a] hover:text-foreground transition-colors cursor-pointer">
                <LogIn className="h-3.5 w-3.5" />
                Sign in
              </div>
            </Link>
          )}
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 relative overflow-hidden">

        {/* Top bar */}
        <header className="h-12 border-b border-[#1a1a1a] flex items-center px-3 gap-2 shrink-0">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-[#1a1a1a] hover:text-foreground transition-colors"
          >
            <AlignJustify className="h-4 w-4" />
          </button>

          {!sidebarOpen && (
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Engagera" className="h-5 w-5 object-contain" />
              <span className="font-semibold text-sm tracking-tight">Engagera</span>
            </div>
          )}

          <div className="flex-1" />

          {!user && !authLoading && (
            <div className="flex items-center gap-1.5">
              <Link href="/sign-in">
                <button className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md hover:bg-[#1a1a1a]">
                  Sign in
                </button>
              </Link>
              <Link href="/sign-up">
                <button className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md font-medium hover:bg-primary/90 transition-colors">
                  Get API Key
                </button>
              </Link>
            </div>
          )}

          {user && (
            <button
              onClick={handleNewChat}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md hover:bg-[#1a1a1a]"
            >
              <Plus className="h-3.5 w-3.5" />
              New chat
            </button>
          )}
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 pb-2">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-4 py-8">
              <div className="mb-7 text-center">
                <div className="h-12 w-12 border border-[#1a1a1a] flex items-center justify-center mx-auto mb-4">
                  <img src="/logo.png" alt="Engagera" className="h-7 w-7 object-contain" />
                </div>
                <h1 className="text-xl font-semibold tracking-tight mb-1">What can I help with?</h1>
                <p className="text-xs text-muted-foreground">
                  Powered by <span className="text-foreground/80 font-medium">Engagera AI</span>
                </p>
                {isGuest && !windowResetAt && (
                  <p className="text-[11px] text-muted-foreground/50 mt-2">
                    {guestRemaining} free message{guestRemaining !== 1 ? "s" : ""} remaining ·{" "}
                    <Link href="/sign-up">
                      <span className="text-primary cursor-pointer hover:underline">Sign up for unlimited</span>
                    </Link>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 w-full max-w-xl">
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => handleSend(p.label + " " + p.sub)}
                    disabled={isLimited}
                    className="text-left p-3 border border-[#1a1a1a] bg-[#0d0d0d] hover:bg-[#111] hover:border-[#222] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <p className="text-xs font-medium text-foreground/80">{p.label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{p.sub}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
              {messages.map((msg, i) => (
                <div key={i} className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}>
                  {msg.role === "assistant" && (
                    <div className="h-7 w-7 flex items-center justify-center shrink-0 mt-0.5">
                      <img src="/logo.png" alt="" className="h-4 w-4 object-contain opacity-70" />
                    </div>
                  )}
                  <div className={cn(
                    "max-w-[80%] px-4 py-2.5 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-[#1a1a1a] text-foreground"
                      : "text-foreground/90"
                  )}>
                    {msg.role === "user" ? (
                      <div>
                        {Array.isArray(msg.content) ? (
                          <>
                            {msg.content.map((part, pi) =>
                              part.type === "text" ? (
                                <div key={pi} className="whitespace-pre-wrap">{part.text}</div>
                              ) : part.type === "image_url" ? (
                                <img key={pi} src={part.image_url.url} alt="attachment" className="mt-2 max-w-[200px] rounded-lg" />
                              ) : null
                            )}
                          </>
                        ) : (
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                        )}
                      </div>
                    ) : (
                      <MessageContent content={typeof msg.content === "string" ? msg.content : getTextContent(msg.content)} />
                    )}
                  </div>
                </div>
              ))}

              {chatMutation.isPending && (
                <div className="flex gap-3 justify-start">
                  <div className="h-7 w-7 flex items-center justify-center shrink-0 mt-0.5">
                    <img src="/logo.png" alt="" className="h-4 w-4 object-contain opacity-70" />
                  </div>
                  <div className="flex items-center gap-1.5 px-4 py-3">
                    <span className="h-1.5 w-1.5 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-1.5 w-1.5 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: "120ms" }} />
                    <span className="h-1.5 w-1.5 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: "240ms" }} />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── Bottom: voice strip (during call) or text input ─────────────────── */}
        {voiceOpen ? (
          <VoiceCallStrip
            state={phoneVoice.state}
            callDuration={phoneVoice.callDuration}
            transcript={phoneVoice.transcript}
            whisperReady={phoneVoice.whisperReady}
            aiPending={chatMutation.isPending}
            onEnd={() => { phoneVoice.endCall(); setVoiceOpen(false); }}
          />
        ) : (
          <div className="shrink-0 px-4 pb-4 pt-2 max-w-2xl mx-auto w-full">

            {/* 24hr limit notice */}
            {isGuest && windowResetAt && (
              <div className="flex items-center justify-between mb-3 px-4 py-2 border border-[#1a1a1a] bg-[#0d0d0d] text-xs">
                <div className="flex items-center gap-2 text-amber-400/80">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>Daily limit reached · Resets in <span className="font-semibold">{countdown}</span></span>
                </div>
                <Link href="/sign-up">
                  <span className="text-primary cursor-pointer hover:underline font-medium">Sign up free →</span>
                </Link>
              </div>
            )}

            {/* Attachment preview strip */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2 px-1">
                {attachments.map((att) => (
                  <div key={att.id} className="relative group flex items-center gap-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-xs text-muted-foreground">
                    {att.kind === "image" && att.preview ? (
                      <img src={att.preview} alt="" className="h-6 w-6 rounded object-cover shrink-0" />
                    ) : (
                      <Paperclip className="h-3 w-3 shrink-0" />
                    )}
                    <span className="max-w-[100px] truncate">{att.name}</span>
                    <button
                      onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                      className="ml-0.5 text-muted-foreground/40 hover:text-foreground transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.txt,.md,.csv,.json,.js,.ts,.py,.html,.css,.xml,.yaml,.yml"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Pill input */}
            <div className={cn(
              "flex items-end rounded-full border transition-colors",
              isLimited
                ? "border-[#1a1a1a] opacity-50 pointer-events-none"
                : "border-[#222] focus-within:border-[#333] bg-[#111]"
            )}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  isLimited
                    ? `Available in ${countdown}`
                    : isGuest && guestMessageCount >= GUEST_DAILY_LIMIT
                    ? "Sign up to continue..."
                    : attachments.length > 0
                    ? "Add a message (optional)…"
                    : "Message Engagera..."
                }
                disabled={chatMutation.isPending || isLimited}
                rows={1}
                className="flex-1 bg-transparent text-sm pl-4 pr-3 py-3 placeholder:text-muted-foreground/40 focus:outline-none resize-none max-h-[120px] min-h-0"
              />

              <div className="pr-2 pb-2 pl-1 flex items-end gap-1">
                {/* File upload */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={chatMutation.isPending || isLimited}
                  title="Attach file"
                  className="h-8 w-8 flex items-center justify-center rounded-full text-muted-foreground/40 hover:text-muted-foreground disabled:opacity-20 transition-colors"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                </button>

                {/* Voice call button */}
                {phoneVoice.supported && (
                  <button
                    onClick={() => { setVoiceOpen(true); phoneVoice.beginCall(); }}
                    disabled={chatMutation.isPending || isLimited}
                    title="Start voice call"
                    className={cn(
                      "h-8 w-8 flex items-center justify-center rounded-full transition-all",
                      "text-muted-foreground/40 hover:text-primary",
                      (chatMutation.isPending || isLimited) && "opacity-20"
                    )}
                  >
                    <Mic className="h-3.5 w-3.5" />
                  </button>
                )}

                {/* Send */}
                <button
                  onClick={() => handleSend()}
                  disabled={(!input.trim() && attachments.length === 0) || chatMutation.isPending || isLimited}
                  className="h-8 w-8 flex items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:bg-primary/90 transition-all"
                >
                  {chatMutation.isPending ? (
                    <span className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>

            <p className="text-center text-[11px] text-muted-foreground/30 mt-2">
              Engagera can make mistakes. Verify important information.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}

/* ── Voice Call Strip — inline, replaces the text input during a call ─────── */
interface VoiceCallStripProps {
  state: PhoneState;
  transcript: string;
  callDuration: number;
  whisperReady: boolean;
  aiPending: boolean;
  onEnd: () => void;
}

function fmt(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

function VoiceCallStrip({
  state,
  transcript,
  callDuration,
  whisperReady,
  aiPending,
  onEnd,
}: VoiceCallStripProps) {
  const effectiveState: PhoneState = aiPending ? "thinking" : state;

  const stateLabel: Record<PhoneState, string> = {
    idle:       "Connecting…",
    connecting: "Connecting…",
    listening:  "Listening…",
    processing: "Transcribing…",
    thinking:   "Thinking…",
    speaking:   "Speaking…",
  };

  const dotColor =
    effectiveState === "listening"  ? "bg-green-400 animate-pulse" :
    effectiveState === "speaking"   ? "bg-emerald-400 animate-pulse" :
    effectiveState === "thinking" || effectiveState === "processing"
                                    ? "bg-yellow-400 animate-pulse" :
    "bg-zinc-600";

  return (
    <div className="shrink-0 px-4 pb-4 pt-2 max-w-2xl mx-auto w-full">
      <div className="flex items-center gap-3 px-4 py-3 rounded-full bg-[#111] border border-[#222]">

        {/* State dot */}
        <span className={cn("h-2 w-2 rounded-full shrink-0", dotColor)} />

        {/* Middle: waveform animation OR transcript OR state label */}
        <div className="flex-1 min-w-0 flex items-center">
          {transcript ? (
            <p className="text-xs text-muted-foreground/70 truncate italic">"{transcript}"</p>
          ) : effectiveState === "listening" ? (
            <div className="flex items-end gap-[2px] h-4">
              {[3, 5, 4, 6, 3, 5, 4, 6, 3, 5].map((h, i) => (
                <span
                  key={i}
                  className="w-[2px] rounded-full bg-green-400/60 animate-bounce"
                  style={{ height: `${h * 2}px`, animationDelay: `${i * 0.07}s`, animationDuration: "0.7s" }}
                />
              ))}
            </div>
          ) : effectiveState === "speaking" ? (
            <div className="flex items-end gap-[2px] h-4">
              {[4, 7, 5, 8, 6, 4, 7, 5, 8, 6].map((h, i) => (
                <span
                  key={i}
                  className="w-[2px] rounded-full bg-emerald-400/60 animate-bounce"
                  style={{ height: `${h * 2}px`, animationDelay: `${i * 0.05}s`, animationDuration: "0.5s" }}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/40">
              {!whisperReady ? "Warming up…" : stateLabel[effectiveState]}
            </p>
          )}
        </div>

        {/* Timer */}
        <span className="text-xs text-muted-foreground/30 shrink-0 font-mono tabular-nums">
          {fmt(callDuration)}
        </span>

        {/* Mic indicator */}
        <Mic className={cn(
          "h-3.5 w-3.5 shrink-0 transition-colors",
          effectiveState === "listening" ? "text-green-400" : "text-muted-foreground/20"
        )} />

        {/* Hang up */}
        <button
          onClick={onEnd}
          title="End voice call"
          className="h-8 w-8 rounded-full bg-red-500 hover:bg-red-600 active:bg-red-700 flex items-center justify-center transition-colors shrink-0"
        >
          <PhoneOff className="h-3.5 w-3.5 text-white" />
        </button>
      </div>

      <p className="text-center text-[11px] text-muted-foreground/30 mt-2">
        Engagera can make mistakes. Verify important information.
      </p>
    </div>
  );
}

