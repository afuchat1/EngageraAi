import React, { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEdgeChatCompletion, type SearchInfo } from "@/hooks/useEdgeChatCompletion";
import { useDevChat, type DevChatMessage } from "@/hooks/useDevChat";
import { MessageContent } from "@/components/MessageContent";
import { WebSearchIndicator } from "@/components/WebSearchIndicator";
import { WebCrawlIndicator } from "@/components/WebCrawlIndicator";
import { detectModel } from "@/lib/autoModel";
import { Send, RotateCcw, Code2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { logoSrc } from "@/lib/assets";

interface Message {
  role: "user" | "assistant";
  content: string;
  searchInfo?: SearchInfo;
  crawledUrls?: string[];
}

export default function Playground() {
  const chatMutation = useEdgeChatCompletion();
  const devChatMutation = useDevChat();

  const [devMode, setDevMode] = useState(false);
  const [activeModel, setActiveModel] = useState<string>("engagera-2.0");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [lastUsage, setLastUsage] = useState<{
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isPending = devMode ? devChatMutation.isPending : chatMutation.isPending;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isPending]);

  const handleModeSwitch = (toDevMode: boolean) => {
    setDevMode(toDevMode);
    setMessages([]);
    setLastUsage(null);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isPending) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setLastUsage(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    if (devMode) {
      const devMessages: DevChatMessage[] = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      devChatMutation.mutate(
        { messages: devMessages },
        {
          onSuccess: (response) => {
            setMessages([
              ...updatedMessages,
              { role: "assistant", content: response.message.content },
            ]);
            setLastUsage(response.usage);
          },
          onError: (err: unknown) => {
            const e = err as { data?: { error?: string }; message?: string };
            const msg =
              e?.data?.error ?? e?.message ?? "Something went wrong. Please try again.";
            setMessages([
              ...updatedMessages,
              { role: "assistant", content: `⚠️ ${msg}` },
            ]);
          },
        },
      );
    } else {
      const autoModel = detectModel(input.trim());
      setActiveModel(autoModel);

      chatMutation.mutate(
        { messages: updatedMessages, model: autoModel },
        {
          onSuccess: (response) => {
            setMessages([
              ...updatedMessages,
              {
                role: "assistant",
                content: response.message.content,
                searchInfo: response.searchInfo,
                crawledUrls: response.crawledUrls,
              },
            ]);
            setLastUsage(response.usage);
          },
          onError: (err: unknown) => {
            const e = err as { data?: { error?: string }; message?: string };
            const msg =
              e?.data?.error ?? e?.message ?? "Something went wrong. Please try again.";
            setMessages([
              ...updatedMessages,
              { role: "assistant", content: `⚠️ ${msg}` },
            ]);
          },
        },
      );
    }
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
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  };

  const handleReset = () => {
    setMessages([]);
    setLastUsage(null);
    setInput("");
  };

  return (
    <AppLayout requireAuth showSidebar>
      <div className="flex flex-col h-[calc(100vh-3.5rem)]">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
          <div>
            <h1 className="text-sm font-semibold tracking-tight">Playground</h1>
            <p className="text-xs text-muted-foreground">
              {devMode ? "Engagera Dev — AI Product Engineering Agent" : "Test models interactively"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode toggle */}
            <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 gap-0.5">
              <button
                onClick={() => handleModeSwitch(false)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  !devMode
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Zap className="h-3 w-3" />
                Standard
              </button>
              <button
                onClick={() => handleModeSwitch(true)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  devMode
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Code2 className="h-3 w-3" />
                Dev Mode
              </button>
            </div>

            {messages.length > 0 && (
              <>
                {!devMode && (
                  <span className="text-[11px] text-muted-foreground/50 hidden sm:inline">
                    Auto:{" "}
                    <span className="text-muted-foreground font-medium">{activeModel}</span>
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  className="gap-1.5 h-8 text-xs text-muted-foreground"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Dev Mode banner */}
        {devMode && messages.length === 0 && (
          <div className="shrink-0 mx-6 mt-4 rounded-lg border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-md bg-foreground/5 flex items-center justify-center shrink-0">
                <Code2 className="h-4 w-4 text-foreground/70" />
              </div>
              <div>
                <p className="text-sm font-semibold">Engagera Dev</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  World-class autonomous AI Product Engineering Agent. Combines software
                  architecture, full-stack development, database engineering, UI/UX, DevOps,
                  code review, and project management to ship production-ready software.
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {[
                    "Build full apps",
                    "Review & refactor code",
                    "Design databases",
                    "Generate APIs",
                    "Debug & test",
                    "Plan architecture",
                  ].map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 text-[11px] rounded-full border border-border bg-muted/40 text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              {devMode ? (
                <>
                  <div className="h-12 w-12 rounded-xl bg-foreground/5 flex items-center justify-center mb-5">
                    <Code2 className="h-6 w-6 text-foreground/40" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Engagera Dev is ready
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs">
                    Describe what you want to build, or paste code to review
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-6 max-w-lg w-full">
                    {[
                      {
                        title: "Build a REST API",
                        sub: "with auth, validation & error handling",
                      },
                      {
                        title: "Review my code",
                        sub: "for security, performance & best practices",
                      },
                      {
                        title: "Design a database schema",
                        sub: "with relationships, indexes & RLS policies",
                      },
                      {
                        title: "Generate a React component",
                        sub: "responsive, accessible & production-ready",
                      },
                    ].map((s) => (
                      <button
                        key={s.title}
                        onClick={() => {
                          setInput(s.title + " " + s.sub);
                          textareaRef.current?.focus();
                        }}
                        className="text-left px-4 py-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
                      >
                        <p className="text-xs font-medium">{s.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{s.sub}</p>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <img
                    src={logoSrc}
                    alt="Engagera"
                    className="h-12 w-12 object-contain opacity-20 mb-5"
                  />
                  <p className="text-sm font-medium text-muted-foreground">
                    Start a conversation
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Type a message — the best model is chosen automatically
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-6">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "flex gap-3",
                    msg.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  {msg.role === "assistant" && (
                    <div className="h-7 w-7 rounded-md flex items-center justify-center shrink-0 mt-0.5">
                      {devMode ? (
                        <Code2 className="h-4 w-4 text-foreground/50" />
                      ) : (
                        <img
                          src={logoSrc}
                          alt=""
                          className="h-4 w-4 object-contain opacity-70"
                        />
                      )}
                    </div>
                  )}
                  <div className={cn("max-w-[80%]", msg.role === "user" ? "" : "space-y-0")}>
                    {msg.role === "assistant" && msg.crawledUrls && msg.crawledUrls.length > 0 && (
                      <WebCrawlIndicator urls={msg.crawledUrls} />
                    )}
                    {msg.role === "assistant" && msg.searchInfo && (
                      <WebSearchIndicator searchInfo={msg.searchInfo} />
                    )}
                    <div
                      className={cn(
                        "rounded-xl px-4 py-3 text-sm leading-relaxed",
                        msg.role === "user"
                          ? "bg-foreground text-background rounded-br-sm"
                          : "bg-card border border-border text-foreground rounded-bl-sm",
                      )}
                    >
                      {msg.role === "user" ? (
                        <div className="whitespace-pre-wrap font-sans">{msg.content}</div>
                      ) : (
                        <MessageContent content={msg.content} />
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {isPending && (
                <div className="flex gap-3 justify-start">
                  <div className="h-7 w-7 rounded-md flex items-center justify-center shrink-0 mt-0.5">
                    {devMode ? (
                      <Code2 className="h-4 w-4 text-foreground/50" />
                    ) : (
                      <img
                        src={logoSrc}
                        alt=""
                        className="h-4 w-4 object-contain opacity-70"
                      />
                    )}
                  </div>
                  <div className="bg-card border border-border rounded-xl rounded-bl-sm px-4 py-3 flex gap-1.5 items-center">
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-border px-4 md:px-6 py-4">
          {lastUsage && (
            <div className="flex items-center justify-end gap-3 mb-2 text-xs text-muted-foreground/60">
              <span>{lastUsage.totalTokens.toLocaleString()} tokens total</span>
              <span className="text-border">|</span>
              <span>↑ {lastUsage.inputTokens} in</span>
              <span>↓ {lastUsage.outputTokens} out</span>
            </div>
          )}
          <div className="max-w-3xl mx-auto relative">
            <Textarea
              ref={textareaRef as React.RefObject<HTMLTextAreaElement>}
              placeholder={
                devMode
                  ? "Describe what to build, or paste code to review…"
                  : "Send a message… (Enter to send, Shift+Enter for newline)"
              }
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              disabled={isPending}
              rows={1}
              className="resize-none pr-12 text-sm min-h-[42px] max-h-40 scrollbar-thin"
            />
            <Button
              type="button"
              size="icon"
              onClick={() => handleSend()}
              disabled={!input.trim() || isPending}
              className="absolute right-2 bottom-2 h-7 w-7"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
