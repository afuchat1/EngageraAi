import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Menu, Plus, MessageSquare, Send, Settings2, Trash2, Cpu, FileText } from "lucide-react";
import { 
  useListModels, 
  useListConversations, 
  useGetConversationMessages,
  getGetConversationMessagesQueryKey,
  useDeleteConversation
} from "@workspace/api-client-react";
import { useEdgeChatCompletion, ChatMessage } from "@/hooks/useEdgeChatCompletion";
import { useAuth } from "@/hooks/useAuth";
import { MessageContent } from "@/components/MessageContent";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { detectModel } from "@/lib/autoModel";
import PublicLayout from "@/components/layout/PublicLayout";

export default function Landing() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState<string>("engagera-pro");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [guestLimitReached, setGuestLimitReached] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  const { data: models = [] } = useListModels();
  const { data: conversations = [], refetch: refetchConversations } = useListConversations();
  const { data: historyMessages } = useGetConversationMessages(conversationId!, {
    query: { enabled: !!conversationId, queryKey: getGetConversationMessagesQueryKey(conversationId!) }
  });
  const deleteConversation = useDeleteConversation();
  const chatCompletion = useEdgeChatCompletion();

  useEffect(() => {
    if (historyMessages && historyMessages.length > 0) {
      setMessages(historyMessages.map(m => ({ role: m.role as any, content: m.content })));
    } else if (!conversationId) {
      setMessages([]);
    }
  }, [historyMessages, conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatCompletion.isPending]);

  const availableModels = models.length > 0 ? models : [{ id: "engagera-pro", name: "Engagera Pro" }];

  const handleSend = async () => {
    if (!input.trim() || chatCompletion.isPending || guestLimitReached) return;
    
    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    
    // Auto-detect model if we're starting a new conversation and haven't explicitly chosen one
    // Actually the brief says: Model selector in chat: dropdown using useListModels() data.
    // Let's just use the selected model from the dropdown.

    chatCompletion.mutate(
      { messages: newMessages, model: selectedModel, conversationId },
      {
        onSuccess: (res) => {
          setMessages([...newMessages, { role: "assistant", content: res.message.content }]);
          if (!conversationId && res.conversationId) {
            setConversationId(res.conversationId);
            if (user) refetchConversations();
          }
        },
        onError: (err: any) => {
          if (err.status === 403 || err?.data?.guestMessageLimit) {
            setGuestLimitReached(true);
          } else {
            // Remove user message if failed
            setMessages(messages);
            alert("Failed to send message: " + (err.message || "Unknown error"));
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
        if (conversationId === id) {
          handleNewChat();
        }
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
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1">
        {conversations.length === 0 ? (
          <div className="p-4 text-center text-white/40 text-sm">No conversations yet.</div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => loadConversation(conv.id)}
              className={`flex items-center justify-between p-3 cursor-pointer text-sm transition-colors ${
                conversationId === conv.id ? "bg-white/10" : "hover:bg-white/5"
              }`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <MessageSquare className="w-4 h-4 shrink-0 text-white/60" />
                <span className="truncate">{conv.title || "New Conversation"}</span>
              </div>
              <button
                onClick={(e) => handleDeleteConversation(conv.id, e)}
                className="text-white/40 hover:text-white shrink-0 ml-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
      <div className="p-4 border-t border-white/15">
        <Select value={selectedModel} onValueChange={setSelectedModel}>
          <SelectTrigger className="w-full bg-transparent border-white/20 rounded-none h-10">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-white/60" />
              <SelectValue placeholder="Select Model" />
            </div>
          </SelectTrigger>
          <SelectContent className="bg-black border-white/20 rounded-none">
            {availableModels.map((m: any) => (
              <SelectItem key={m.id} value={m.id} className="rounded-none hover:bg-white/10 focus:bg-white/10">
                {m.name || m.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <PublicLayout>
      <div className="flex h-full w-full overflow-hidden">
        {/* Desktop Sidebar (Only if user is auth'd) */}
        {user && (
          <div className="hidden md:block w-64 shrink-0 h-full">
            <SidebarContent />
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 flex flex-col h-full min-w-0 bg-black overflow-hidden">
          {/* Top bar — model selector for guests OR mobile sidebar toggle for auth'd users */}
          <div className="shrink-0 flex items-center px-3 py-2 border-b border-white/15 bg-black gap-3">
            {user ? (
              <Sheet open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
                <SheetTrigger asChild>
                  <button className="md:hidden p-2 rounded-full border border-white/20 hover:bg-white/10">
                    <Menu className="w-4 h-4" />
                  </button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 bg-black border-r border-white/15 w-72 rounded-none sm:max-w-none">
                  <SidebarContent />
                </SheetContent>
              </Sheet>
            ) : null}
            <div className="flex-1" />
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="w-44 bg-black border-white/20 rounded-full h-8 text-xs px-3">
                <div className="flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5 text-white/60 shrink-0" />
                  <SelectValue placeholder="Select Model" />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-black border-white/20 rounded-xl text-xs">
                {availableModels.map((m: any) => (
                  <SelectItem key={m.id} value={m.id} className="rounded-lg hover:bg-white/10 focus:bg-white/10">
                    {m.name || m.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 md:p-8 scrollbar-thin">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
                <div className="w-16 h-16 border border-white/20 flex items-center justify-center mb-6">
                  <MessageSquare className="w-8 h-8 text-white/60" />
                </div>
                <h2 className="text-2xl font-light mb-2 tracking-tight">How can I help you today?</h2>
                <p className="text-white/60 text-sm leading-relaxed mb-8">
                  Engagera provides unified access to top-tier AI models. Type a message below to start a conversation.
                </p>
                {!user && (
                  <div className="text-xs text-white/40 font-mono uppercase tracking-widest px-4 py-2 border border-white/10 bg-white/5">
                    Guest Mode: 5 free messages available
                  </div>
                )}
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-6">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div 
                      className={`max-w-[85%] break-words whitespace-pre-wrap ${
                        msg.role === "user" 
                          ? "bg-white text-black px-4 py-3 rounded-2xl rounded-br-sm" 
                          : "text-white"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <MessageContent content={msg.content as string} />
                      ) : (
                        <div className="text-[0.875rem] leading-relaxed">{msg.content as string}</div>
                      )}
                    </div>
                  </div>
                ))}
                {chatCompletion.isPending && (
                  <div className="flex justify-start">
                    <div className="text-white/40 text-sm flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-white/40 animate-pulse" style={{ animationDelay: "0ms" }}></span>
                      <span className="w-1.5 h-1.5 bg-white/40 animate-pulse" style={{ animationDelay: "150ms" }}></span>
                      <span className="w-1.5 h-1.5 bg-white/40 animate-pulse" style={{ animationDelay: "300ms" }}></span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Guest Limit Overlay */}
          {guestLimitReached && !user && (
            <div className="absolute inset-x-0 bottom-full mb-4 mx-4 md:mx-auto max-w-xl bg-black border border-white p-6 shadow-2xl z-20">
              <h3 className="text-xl font-medium mb-2">Guest Limit Reached</h3>
              <p className="text-white/60 text-sm mb-6">
                You've used all 5 free messages. Sign up to continue chatting, access the API, and explore more models.
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setLocation("/sign-up")}
                  className="flex-1 py-2 bg-white text-black font-medium hover:bg-white/90 text-sm rounded-full"
                >
                  Sign Up Free
                </button>
                <button 
                  onClick={() => setLocation("/sign-in")}
                  className="flex-1 py-2 border border-white/20 hover:bg-white/10 text-sm rounded-full"
                >
                  Sign In
                </button>
              </div>
            </div>
          )}

          {/* Input Footer */}
          <div className="shrink-0 p-4 bg-black border-t border-white/15">
            <div className="max-w-3xl mx-auto relative flex items-end">
              <textarea
                ref={chatInputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={guestLimitReached ? "Sign up to continue..." : "Message Engagera..."}
                disabled={guestLimitReached || chatCompletion.isPending}
                className="w-full bg-transparent border border-white/30 focus:border-white outline-none resize-none py-3 pl-4 pr-12 text-sm max-h-48 scrollbar-thin min-h-[50px] transition-colors disabled:opacity-50 rounded-2xl"
                rows={1}
                style={{
                  height: "auto",
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
                }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || chatCompletion.isPending || guestLimitReached}
                className="absolute right-2 bottom-2 p-1.5 text-white/60 hover:text-white disabled:opacity-30 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <div className="max-w-3xl mx-auto text-center mt-3">
              <p className="text-[10px] text-white/30 font-mono uppercase tracking-wider">
                Engagera AI can make mistakes. Verify important information.
              </p>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
