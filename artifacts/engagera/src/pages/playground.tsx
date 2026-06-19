import React, { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEdgeChatCompletion, type SearchInfo } from "@/hooks/useEdgeChatCompletion";
import { MessageContent } from "@/components/MessageContent";
import { WebSearchIndicator } from "@/components/WebSearchIndicator";
import { WebCrawlIndicator } from "@/components/WebCrawlIndicator";
import { detectModel } from "@/lib/autoModel";
import { Send, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
  searchInfo?: SearchInfo;
  crawledUrls?: string[];
}

export default function Playground() {
  const chatMutation = useEdgeChatCompletion();

  const [activeModel, setActiveModel] = useState<string>("engagera-lite");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [lastUsage, setLastUsage] = useState<{ inputTokens: number; outputTokens: number; totalTokens: number } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatMutation.isPending]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || chatMutation.isPending) return;

    const autoModel = detectModel(input.trim());
    setActiveModel(autoModel);

    const userMessage: Message = { role: "user", content: input.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setLastUsage(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    chatMutation.mutate(
      { messages: updatedMessages, model: autoModel },
      {
        onSuccess: (response) => {
          setMessages([...updatedMessages, {
            role: "assistant",
            content: response.message.content,
            searchInfo: response.searchInfo,
            crawledUrls: response.crawledUrls,
          }]);
          setLastUsage(response.usage);
        },
        onError: (err: any) => {
          const msg = err?.data?.error ?? err?.message ?? "Something went wrong. Please try again.";
          setMessages([...updatedMessages, { role: "assistant", content: `⚠️ ${msg}` }]);
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
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  };

  const handleReset = () => {
    setMessages([]);
    setLastUsage(null);
    setInput("");
  };

  return (
    <AppLayout requireAuth showSidebar>
      <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-[calc(100vh-3.5rem)]">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
          <div>
            <h1 className="text-sm font-semibold tracking-tight">Playground</h1>
            <p className="text-xs text-muted-foreground">Test models interactively</p>
          </div>
          <div className="flex items-center gap-3">
            {messages.length > 0 && (
              <>
                <span className="text-[11px] text-muted-foreground/50 hidden sm:inline">
                  Auto: <span className="text-muted-foreground font-medium">{activeModel}</span>
                </span>
                <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1.5 h-8 text-xs text-muted-foreground">
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <img src="/logo.png" alt="Engagera" className="h-12 w-12 object-contain opacity-20 mb-5" />
              <p className="text-sm font-medium text-muted-foreground">Start a conversation</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Type a message — the best model is chosen automatically</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-6">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "flex gap-3",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {msg.role === "assistant" && (
                    <div className="h-7 w-7 rounded-md flex items-center justify-center shrink-0 mt-0.5">
                      <img src="/logo.png" alt="" className="h-4 w-4 object-contain opacity-70" />
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
                          : "bg-card border border-border text-foreground rounded-bl-sm"
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

              {chatMutation.isPending && (
                <div className="flex gap-3 justify-start">
                  <div className="h-7 w-7 rounded-md flex items-center justify-center shrink-0 mt-0.5">
                    <img src="/logo.png" alt="" className="h-4 w-4 object-contain opacity-70" />
                  </div>
                  <div className="bg-card border border-border rounded-xl rounded-bl-sm px-4 py-3 flex gap-1.5 items-center">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
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
              ref={textareaRef as any}
              placeholder="Send a message… (Enter to send, Shift+Enter for newline)"
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              disabled={chatMutation.isPending}
              rows={1}
              className="resize-none pr-12 text-sm min-h-[42px] max-h-40 scrollbar-thin"
            />
            <Button
              type="button"
              size="icon"
              onClick={() => handleSend()}
              disabled={!input.trim() || chatMutation.isPending}
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
