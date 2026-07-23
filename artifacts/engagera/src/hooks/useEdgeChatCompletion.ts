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
  useAfuBot?: boolean;
  stream?: boolean;
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
  crawledUrls?: string[];
}

export interface TimeInfo {
  ianaZone: string;
  label: string;
}

export interface WeatherInfo {
  label: string;
  tempC: number;
  feelsLikeC: number;
  condition: string;
  icon: string;
  windKph: number;
  humidity: number;
  isDay: boolean;
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
  weatherInfo?: WeatherInfo;
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

  // Always include x-guest-session-id alongside the bearer token.
  // The server prefers a valid JWT but falls back to the guest session
  // if the token is expired/invalid — this prevents a 401 when the browser
  // has a stale session that hasn't been cleared yet.
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token ?? SUPABASE_ANON_KEY}`,
    "x-guest-session-id": guestId,
  };
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

// ── Real streaming ───────────────────────────────────────────────────────────
// The edge function responds with `Content-Type: text/event-stream` and
// emits one `data: {...}\n\n` frame per token as the upstream LLM produces
// it (see supabase/functions/chat/index.ts). This reads that stream
// incrementally via `body.getReader()` instead of buffering the whole
// response with `res.json()`, so the UI can render tokens as they arrive.
export interface StreamDoneEvent {
  model: string;
  conversationId?: number;
  searchInfo?: SearchInfo;
  crawledUrls?: string[];
  crawledSources?: SearchSource[];
  timeInfo?: TimeInfo;
  weatherInfo?: WeatherInfo;
  guestMessageCount?: number;
  guestMessageLimit?: number;
}

export interface StreamHandlers {
  onToken?: (content: string) => void;
  onMeta?: (searchInfo: SearchInfo) => void;
  onSearchStatus?: (message: string) => void;
  onDone?: (done: StreamDoneEvent) => void;
}

export async function streamEdgeChat(
  request: ChatRequest,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const headers = await buildHeaders();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw Object.assign(new Error(err.error ?? "Chat request failed"), {
        status: res.status,
        data: err,
      });
    }

    // Image generation always answers with a single application/json body
    // (never text/event-stream) even when the request asked for stream:
    // true, because the backend has to wait for the whole image before it
    // can reply. Detect that here and synthesize the same token/done events
    // the SSE path would have produced, instead of trying to parse JSON as
    // SSE frames (which previously threw "Stream ended unexpectedly").
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const data = await res.json();
      const content: string = typeof data?.message?.content === "string" ? data.message.content : "";
      if (content) handlers.onToken?.(content);
      handlers.onDone?.({
        model: data?.model,
        conversationId: data?.conversationId,
        searchInfo: data?.searchInfo,
        crawledUrls: data?.crawledUrls,
        crawledSources: data?.crawledSources,
        timeInfo: data?.timeInfo,
        weatherInfo: data?.weatherInfo,
        guestMessageCount: data?.guestMessageCount,
        guestMessageLimit: data?.guestMessageLimit,
      });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sawDone = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sepIdx: number;
      while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);

        const dataLine = rawEvent
          .split("\n")
          .find((line) => line.startsWith("data:"));
        if (!dataLine) continue;
        const payload = dataLine.slice(5).trim();
        if (payload === "[DONE]") { sawDone = true; continue; }

        let evt: { type: string; content?: string; searchInfo?: SearchInfo; error?: string } & Partial<StreamDoneEvent>;
        try {
          evt = JSON.parse(payload);
        } catch {
          continue;
        }

        if (evt.type === "token" && evt.content) handlers.onToken?.(evt.content);
        else if (evt.type === "meta" && evt.searchInfo) handlers.onMeta?.(evt.searchInfo);
        else if (evt.type === "searchStatus" && (evt as any).message) handlers.onSearchStatus?.((evt as any).message);
        else if (evt.type === "error") throw new Error(evt.error ?? "Stream error");
        else if (evt.type === "done") handlers.onDone?.(evt as StreamDoneEvent);
      }
    }

    if (!sawDone) {
      throw new Error("Stream ended unexpectedly before completion.");
    }
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
