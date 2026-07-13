import { useMutation } from "@tanstack/react-query";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string | ContentPart[];
}

export interface ChatRequest {
  messages: ChatMessage[];
  model: string;
  conversationId?: number;
  contextHint?: string;
}

export interface SearchSource {
  title: string;
  url: string;
  snippet: string;
  image?: string;  // og:image / twitter:image extracted from the crawled page
}

export interface SearchInfo {
  query: string;
  sources: SearchSource[];
}

export interface TimeInfo {
  ianaZone: string;
  label: string;
}

export interface ChatResponse {
  id: string;
  model: string;
  message: { role: "assistant"; content: string };
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  conversationId?: number;
  guestMessageCount?: number;
  guestMessageLimit?: number;
  searchInfo?: SearchInfo;
  crawledUrls?: string[];
  crawledSources?: SearchSource[];  // rich source objects with og:image for user-pasted URLs
  timeInfo?: TimeInfo;
}

const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/chat`;
const REQUEST_TIMEOUT_MS = 60_000;

async function buildHeaders(): Promise<Record<string, string>> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const guestId =
    localStorage.getItem("engagera_guest_session_id") ??
    (() => {
      const id = crypto.randomUUID();
      localStorage.setItem("engagera_guest_session_id", id);
      return id;
    })();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token ?? SUPABASE_ANON_KEY}`,
  };

  if (!token) {
    headers["x-guest-session-id"] = guestId;
  }

  return headers;
}

export async function callEdgeChat(request: ChatRequest): Promise<ChatResponse> {
  const headers = await buildHeaders();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw Object.assign(new Error(err.error ?? "Chat request failed"), {
        status: res.status,
        data: err,
      });
    }

    return res.json();
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw Object.assign(
        new Error("Request timed out. The AI is taking too long — please try again."),
        { status: 408, data: { error: "timeout" } },
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function useEdgeChatCompletion() {
  return useMutation<ChatResponse, Error, ChatRequest>({
    mutationFn: callEdgeChat,
  });
}
