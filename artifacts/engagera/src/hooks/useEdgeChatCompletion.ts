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
  timeInfo?: TimeInfo;
}

export interface StreamDoneEvent {
  type: "done";
  model: string;
  conversationId?: number;
  searchInfo?: SearchInfo;
  guestMessageCount?: number;
  guestMessageLimit?: number;
}

export interface StreamCallbacks {
  onMeta?: (data: { searchInfo?: SearchInfo }) => void;
  onToken: (chunk: string) => void;
  onDone: (event: StreamDoneEvent) => void;
  onError: (err: Error & { status?: number; data?: unknown }) => void;
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

// ── Non-streaming call (kept for backward compat) ─────────────────────────────
async function callEdgeChat(request: ChatRequest): Promise<ChatResponse> {
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

// ── Streaming call ─────────────────────────────────────────────────────────────
export async function streamEdgeChat(
  request: ChatRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  // Don't start if already aborted
  if (signal?.aborted) return;

  const headers = await buildHeaders();

  let res: Response;
  try {
    res = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...request, stream: true }),
      signal,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") return;
    callbacks.onError(
      Object.assign(new Error("Network error — please check your connection."), { status: 0 }),
    );
    return;
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: res.statusText }));
    callbacks.onError(
      Object.assign(new Error(errData.error ?? "Chat request failed"), {
        status: res.status,
        data: errData,
      }),
    );
    return;
  }

  if (!res.body) {
    callbacks.onError(Object.assign(new Error("No response body from server."), { status: 500 }));
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawDone = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal?.aborted) return;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") {
          if (!sawDone) {
            // Stream ended with [DONE] but no done event — emit a minimal done
            callbacks.onDone({ type: "done", model: request.model });
            sawDone = true;
          }
          return;
        }
        try {
          const evt = JSON.parse(raw);
          if (evt.type === "meta") {
            callbacks.onMeta?.({ searchInfo: evt.searchInfo });
          } else if (evt.type === "token") {
            if (evt.content) callbacks.onToken(evt.content);
          } else if (evt.type === "done") {
            sawDone = true;
            callbacks.onDone(evt as StreamDoneEvent);
          } else if (evt.type === "error") {
            callbacks.onError(Object.assign(new Error(evt.error ?? "Stream error"), { status: 500 }));
            return;
          }
        } catch { /* skip malformed SSE line */ }
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") return;
    if (!sawDone) {
      callbacks.onError(Object.assign(new Error("Stream connection interrupted."), { status: 0 }));
    }
    return;
  } finally {
    reader.releaseLock();
  }

  // Stream closed without [DONE] and without a done event
  if (!sawDone && !signal?.aborted) {
    callbacks.onDone({ type: "done", model: request.model });
  }
}

export function useEdgeChatCompletion() {
  return useMutation<ChatResponse, Error, ChatRequest>({
    mutationFn: callEdgeChat,
  });
}
