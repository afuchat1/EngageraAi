import React, { useState, useCallback, useRef, useEffect } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { useListModels } from "@workspace/api-client-react";
import { callEdgeChat, ChatMessage } from "@/hooks/useEdgeChatCompletion";
import { MessageContent } from "@/components/MessageContent";
import { Trash2, SlidersHorizontal, Terminal, Send } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { useAlert } from "@/hooks/useAlert";

function Pill({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-white/40 font-mono uppercase tracking-wider">{label}</span>
      <span className="text-xs text-white/70">{value}</span>
    </div>
  );
}

export default function Playground() {
  const { data: models = [] } = useListModels();
  const [selectedModel, setSelectedModel] = useState<string>("engagera-pro");
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful and concise AI assistant.");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const confirm = useConfirm();
  const alert = useAlert();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    const conversation: ChatMessage[] =
      messages.length === 0 && systemPrompt.trim()
        ? [{ role: "system" as const, content: systemPrompt }, userMsg]
        : [...messages, userMsg];

    setMessages(conversation);
    setInput("");
    setIsLoading(true);

    try {
      const response = await callEdgeChat({ messages: conversation, model: selectedModel });
      setMessages([...conversation, { role: "assistant", content: response.message.content }]);
    } catch (err: any) {
      alert("Error: " + (err?.message ?? "Request failed"), "error");
      setMessages([...conversation]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, systemPrompt, selectedModel, alert]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = async () => {
    if (messages.length === 0) return;
    const ok = await confirm({
      title: "Clear session?",
      description: "All messages in this session will be removed.",
      confirmLabel: "Clear",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    setMessages([]);
  };

  return (
    <AppLayout title="Playground">
      <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-156px)]">

        {/* Config Panel */}
        <div className="w-full lg:w-72 flex flex-col gap-4 shrink-0 overflow-y-auto scrollbar-thin">
          <div className="rounded-2xl bg-white/[0.03] p-4">
            <p className="text-xs font-mono uppercase tracking-widest text-white/30 mb-4">Configuration</p>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-white/40">Model</label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full px-3 py-2 bg-white/[0.05] rounded-xl text-sm outline-none focus:bg-white/[0.08] transition-colors appearance-none cursor-pointer"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id} className="bg-black">
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-white/40">Temperature</label>
                  <span className="text-xs font-mono text-white/60">{temperature.toFixed(2)}</span>
                </div>
                <input
                  type="range" min="0" max="2" step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-white"
                />
                <div className="flex justify-between text-[10px] font-mono text-white/20">
                  <span>Precise</span>
                  <span>Creative</span>
                </div>
              </div>

              <Pill label="Mode" value="Standard" />
            </div>
          </div>

          <div className="rounded-2xl bg-white/[0.03] p-4 flex-1 flex flex-col min-h-[160px]">
            <div className="flex items-center gap-2 mb-3">
              <Terminal className="w-3.5 h-3.5 text-white/30" />
              <p className="text-xs font-mono uppercase tracking-widest text-white/30">System Prompt</p>
            </div>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are a helpful assistant…"
              className="w-full flex-1 bg-transparent text-sm outline-none resize-none placeholder:text-white/20 text-white/80 scrollbar-thin"
            />
          </div>
        </div>

        {/* Chat Panel */}
        <div className="flex-1 rounded-2xl bg-white/[0.03] flex flex-col min-w-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06] shrink-0">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-3.5 h-3.5 text-white/30" />
              <span className="text-xs font-mono uppercase tracking-widest text-white/30">Session</span>
            </div>
            <button
              onClick={handleClear}
              className="p-1.5 text-white/30 hover:text-white hover:bg-white/[0.07] rounded-lg transition-colors"
              title="Clear session"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 scrollbar-thin">
            {messages.length === 0 && !isLoading ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <Terminal className="w-8 h-8 text-white/15 mx-auto mb-3" />
                  <p className="text-sm text-white/30">No messages yet.</p>
                  <p className="text-xs text-white/20 mt-1">Type a message and press Enter to start.</p>
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`rounded-xl px-4 py-3 ${
                      msg.role === "system"
                        ? "bg-white/[0.04] border border-white/[0.08]"
                        : msg.role === "user"
                        ? "bg-white/[0.06] ml-8"
                        : "bg-transparent mr-4"
                    }`}
                  >
                    <p className="text-[9px] font-mono uppercase tracking-widest text-white/30 mb-2">
                      {msg.role}
                    </p>
                    {msg.role === "assistant" ? (
                      <MessageContent content={msg.content as string} />
                    ) : (
                      <p className="text-sm whitespace-pre-wrap text-white/80 font-mono leading-relaxed">
                        {msg.content as string}
                      </p>
                    )}
                  </div>
                ))}

                {/* Loading indicator */}
                {isLoading && (
                  <div className="rounded-xl px-4 py-3 bg-transparent mr-4">
                    <p className="text-[9px] font-mono uppercase tracking-widest text-white/30 mb-2">assistant</p>
                    <div className="flex gap-1.5 py-1">
                      <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-pulse" />
                      <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-pulse" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-pulse" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="px-4 py-3 border-t border-white/[0.06] shrink-0">
            <div className="relative flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="User message… (Enter to send, Shift+Enter for newline)"
                disabled={isLoading}
                className="w-full bg-white/[0.04] hover:bg-white/[0.06] focus:bg-white/[0.06] rounded-xl px-4 py-2.5 pr-10 text-sm outline-none resize-none max-h-32 min-h-[44px] scrollbar-thin disabled:opacity-40 transition-colors placeholder:text-white/20"
                rows={1}
                onInput={(e) => {
                  const t = e.target as HTMLTextAreaElement;
                  t.style.height = "auto";
                  t.style.height = `${Math.min(t.scrollHeight, 128)}px`;
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
      </div>
    </AppLayout>
  );
}
