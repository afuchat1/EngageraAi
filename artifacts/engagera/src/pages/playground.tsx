import React, { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useListModels, useChatCompletion } from "@workspace/api-client-react";
import { Send, Bot, User, Sparkles, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Playground() {
  const { data: models, isLoading: modelsLoading } = useListModels();
  const chatMutation = useChatCompletion();
  
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{role: 'user'|'assistant'|'system', content: string}[]>([]);
  const [lastUsage, setLastUsage] = useState<{inputTokens: number, outputTokens: number, totalTokens: number} | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (Array.isArray(models) && models.length > 0 && !selectedModel) {
      setSelectedModel(models[0].id);
    }
  }, [models, selectedModel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatMutation.isPending]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !selectedModel) return;

    const userMessage = { role: 'user' as const, content: input };
    const updatedMessages = [...messages, userMessage];
    
    setMessages(updatedMessages);
    setInput("");
    setLastUsage(null);

    chatMutation.mutate(
      { 
        data: { 
          messages: updatedMessages,
          model: selectedModel 
        } 
      },
      {
        onSuccess: (response) => {
          setMessages([...updatedMessages, response.message]);
          setLastUsage(response.usage);
        }
      }
    );
  };

  return (
    <AppLayout requireAuth showSidebar>
      <div className="flex flex-col h-[calc(100vh-3.5rem)] max-w-5xl mx-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Playground</h1>
            <p className="text-sm text-muted-foreground">Test Engagera models interactively</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Model:</span>
            <Select value={selectedModel} onValueChange={setSelectedModel} disabled={modelsLoading}>
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {models?.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-50">
              <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center">
                <Terminal className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="text-lg font-medium">Start a conversation</p>
                <p className="text-sm">Select a model and send a message to test the API.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6 pb-6">
              {messages.map((msg, idx) => (
                <div 
                  key={idx} 
                  className={cn(
                    "flex gap-4 max-w-[85%]",
                    msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                  )}
                >
                  <div className={cn(
                    "flex-shrink-0 h-8 w-8 rounded-md flex items-center justify-center border",
                    msg.role === 'user' ? "bg-primary/10 border-primary/20 text-primary" : "bg-muted border-border"
                  )}>
                    {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>
                  <div className={cn(
                    "rounded-lg px-4 py-3 text-sm shadow-sm",
                    msg.role === 'user' 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-card border"
                  )}>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))}
              
              {chatMutation.isPending && (
                <div className="flex gap-4 max-w-[85%]">
                  <div className="flex-shrink-0 h-8 w-8 rounded-md flex items-center justify-center border bg-muted border-border">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="rounded-lg px-4 py-3 bg-card border flex items-center space-x-2">
                    <div className="h-2 w-2 bg-primary rounded-full animate-bounce"></div>
                    <div className="h-2 w-2 bg-primary rounded-full animate-bounce delay-75"></div>
                    <div className="h-2 w-2 bg-primary rounded-full animate-bounce delay-150"></div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-background">
          {lastUsage && (
            <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground justify-end px-2">
              <span className="flex items-center gap-1"><Sparkles className="h-3 w-3" /> {lastUsage.totalTokens} tokens</span>
              <span>(In: {lastUsage.inputTokens} | Out: {lastUsage.outputTokens})</span>
            </div>
          )}
          <form onSubmit={handleSend} className="flex gap-2">
            <Input
              placeholder="Message Engagera..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1"
              disabled={chatMutation.isPending || !selectedModel}
            />
            <Button 
              type="submit" 
              disabled={!input.trim() || chatMutation.isPending || !selectedModel}
              className="px-8"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
