import { useMutation } from "@tanstack/react-query";

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
  provider?: string;
  providerModel?: string;
}

async function callDevChat(request: DevChatRequest): Promise<DevChatResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90_000);

  try {
    const res = await fetch("/api/chat/dev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw Object.assign(
        new Error(err.error ?? "Dev chat request failed"),
        { status: res.status, data: err },
      );
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
