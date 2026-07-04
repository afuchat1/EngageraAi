import React, { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { useListModels } from "@workspace/api-client-react";
import { useEdgeChatCompletion, ChatMessage } from "@/hooks/useEdgeChatCompletion";
import { MessageContent } from "@/components/MessageContent";
import { Play, Settings2, Send, Save, Trash2, SlidersHorizontal } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Playground() {
  const { data: models = [] } = useListModels();
  const [selectedModel, setSelectedModel] = useState<string>("engagera-pro");
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful and concise AI assistant.");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [temperature, setTemperature] = useState(0.7);

  const chatCompletion = useEdgeChatCompletion();

  const handleSend = () => {
    if (!input.trim() || chatCompletion.isPending) return;

    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    const conversation = messages.length === 0 && systemPrompt.trim()
      ? [{ role: "system" as const, content: systemPrompt }, userMsg]
      : [...messages, userMsg];

    setMessages(conversation);
    setInput("");

    chatCompletion.mutate(
      { messages: conversation, model: selectedModel },
      {
        onSuccess: (res) => {
          setMessages([...conversation, { role: "assistant", content: res.message.content }]);
        },
        onError: (err) => {
          alert("Error: " + err.message);
          setMessages([...conversation]); // keep user msg
        }
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    setMessages([]);
  };

  return (
    <AppLayout title="Playground">
      <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)]">
        {/* Settings Panel */}
        <div className="w-full lg:w-80 flex flex-col gap-6 shrink-0 overflow-y-auto scrollbar-thin">
          <div className="border border-white/15 p-4 bg-white/[0.02]">
            <h3 className="text-sm font-medium flex items-center gap-2 mb-4">
              <Settings2 className="w-4 h-4" />
              Configuration
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-white/60 uppercase font-mono tracking-wider">Model</label>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="w-full bg-black border-white/20 rounded-none text-sm">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent className="bg-black border-white/20 rounded-none">
                    {models.map(m => (
                      <SelectItem key={m.id} value={m.id} className="rounded-none hover:bg-white/10">
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-white/60 uppercase font-mono tracking-wider">Temperature</label>
                  <span className="text-xs font-mono">{temperature.toFixed(2)}</span>
                </div>
                <input 
                  type="range" 
                  min="0" max="2" step="0.1" 
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-white"
                />
              </div>
            </div>
          </div>

          <div className="border border-white/15 p-4 bg-white/[0.02] flex-1 flex flex-col min-h-[200px]">
            <h3 className="text-sm font-medium flex items-center gap-2 mb-4 shrink-0">
              <SlidersHorizontal className="w-4 h-4" />
              System Prompt
            </h3>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Enter system prompt..."
              className="w-full flex-1 bg-black border border-white/20 p-3 text-sm focus:border-white outline-none resize-none scrollbar-thin transition-colors"
            />
          </div>
        </div>

        {/* Chat Panel */}
        <div className="flex-1 border border-white/15 flex flex-col min-w-0 bg-black">
          <div className="flex items-center justify-between p-3 border-b border-white/15 bg-white/[0.02] shrink-0">
            <span className="text-sm font-medium">Session</span>
            <button 
              onClick={handleClear}
              className="text-white/40 hover:text-white transition-colors"
              title="Clear Session"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-white/30 text-sm">
                No messages in this session.
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx} className={`p-4 border ${msg.role === 'system' ? 'border-white/10 bg-white/5' : msg.role === 'user' ? 'border-white/20 ml-8' : 'border-white/10 bg-white/[0.02] mr-8'}`}>
                  <div className="text-[10px] uppercase font-mono tracking-wider text-white/40 mb-2">
                    {msg.role}
                  </div>
                  {msg.role === "assistant" ? (
                    <MessageContent content={msg.content as string} />
                  ) : (
                    <div className="text-sm whitespace-pre-wrap font-mono">{msg.content as string}</div>
                  )}
                </div>
              ))
            )}
            {chatCompletion.isPending && (
              <div className="p-4 border border-white/10 bg-white/[0.02] mr-8">
                <div className="text-[10px] uppercase font-mono tracking-wider text-white/40 mb-2">
                  Assistant
                </div>
                <div className="flex gap-2">
                  <span className="w-1.5 h-1.5 bg-white/40 animate-pulse"></span>
                  <span className="w-1.5 h-1.5 bg-white/40 animate-pulse" style={{ animationDelay: "150ms" }}></span>
                  <span className="w-1.5 h-1.5 bg-white/40 animate-pulse" style={{ animationDelay: "300ms" }}></span>
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-white/15 shrink-0 bg-white/[0.02]">
            <div className="relative flex items-end max-w-full">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="User message... (Ctrl+Enter to send)"
                className="w-full bg-black border border-white/30 focus:border-white outline-none resize-none py-2.5 pl-3 pr-10 text-sm max-h-32 scrollbar-thin min-h-[44px] transition-colors"
                rows={1}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
                }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || chatCompletion.isPending}
                className="absolute right-2 bottom-2 p-1 text-white/60 hover:text-white disabled:opacity-30 transition-colors bg-white/10"
              >
                <Play className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
