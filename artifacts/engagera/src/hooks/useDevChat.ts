import { useMutation } from "@tanstack/react-query";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";

export interface DevChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface DevChatRequest {
  messages: DevChatMessage[];
}

interface DevChatResponse {
  id: string;
  model: string;
  message: { role: "assistant"; content: string };
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  conversationId?: number;
  guestMessageCount?: number;
  guestMessageLimit?: number;
}

const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/chat`;

async function callDevChat(request: DevChatRequest): Promise<DevChatResponse> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const guestId =
    sessionStorage.getItem("engagera_guest_id") ??
    (() => {
      const id = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem("engagera_guest_id", id);
      return id;
    })();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token ?? SUPABASE_ANON_KEY}`,
  };

  if (!token) {
    headers["x-guest-session-id"] = guestId;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90_000);

  try {
    const res = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages: request.messages,
        model: "engagera-code",
        mode: "dev",
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw Object.assign(new Error(err.error ?? "Dev chat request failed"), {
        status: res.status,
        data: err,
      });
    }

    return res.json();
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw Object.assign(
        new Error("Request timed out — the AI is taking too long. Please try again."),
        { status: 408, data: { error: "timeout" } },
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function useDevChat() {
  return useMutation<DevChatResponse, Error, DevChatRequest>({
    mutationFn: callDevChat,
  });
}
