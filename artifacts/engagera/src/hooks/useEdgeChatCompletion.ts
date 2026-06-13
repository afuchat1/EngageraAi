import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  model: string;
  conversationId?: number;
}

interface ChatResponse {
  id: string;
  model: string;
  message: { role: "assistant"; content: string };
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  conversationId?: number;
  guestMessageCount?: number;
  guestMessageLimit?: number;
}

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

async function callEdgeChat(request: ChatRequest): Promise<ChatResponse> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    const guestId = sessionStorage.getItem("engagera_guest_id") ??
      (() => {
        const id = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        sessionStorage.setItem("engagera_guest_id", id);
        return id;
      })();
    headers["x-guest-session-id"] = guestId;
  }

  const res = await fetch(EDGE_FUNCTION_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(err.error ?? "Chat request failed"), { status: res.status, data: err });
  }

  return res.json();
}

export function useEdgeChatCompletion() {
  return useMutation<ChatResponse, Error, ChatRequest>({
    mutationFn: callEdgeChat,
  });
}
