/**
 * usePollinations — React hooks for the Pollinations.AI gateway edge function.
 *
 * Exports:
 *   usePollinationsText()   — streaming or non-streaming text generation
 *   usePollinationsImage()  — image generation (returns URL)
 *   usePollinationsAudio()  — TTS → MP3 blob URL for playback
 *   usePollinationsVideo()  — video generation (returns URL)
 */

import { useState, useCallback } from "react";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";

export const POLLINATIONS_FN = `${SUPABASE_URL}/functions/v1/pollinations`;

// ── Shared auth header builder ────────────────────────────────────────────────
export async function buildPollinationsHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token   = data.session?.access_token ?? SUPABASE_ANON_KEY;
  const guestId = typeof localStorage !== "undefined"
    ? (localStorage.getItem("engagera_guest_session_id") ?? "")
    : "";
  return {
    "Content-Type":   "application/json",
    "Authorization":  `Bearer ${token}`,
    ...(guestId ? { "x-guest-session-id": guestId } : {}),
  };
}

async function callFn(body: object): Promise<Response> {
  const headers = await buildPollinationsHeaders();
  const res = await fetch(POLLINATIONS_FN, {
    method:  "POST",
    headers,
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res;
}

// ── Model catalogue types ─────────────────────────────────────────────────────
export interface TextModel {
  id: string;
  name: string;
  provider: string;
  category: string;
}
export interface ImageModel {
  id: string;
  name: string;
  description: string;
}

// ── Text generation ───────────────────────────────────────────────────────────
export function usePollinationsText() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const generate = useCallback(async (
    messages: Array<{ role: string; content: string }>,
    options: {
      model?:    string;
      system?:   string;
      stream?:   boolean;
      onToken?:  (token: string) => void;
    } = {},
  ): Promise<string> => {
    setLoading(true);
    setError(null);
    const { model = "openai", system, stream = true, onToken } = options;

    try {
      const headers = await buildPollinationsHeaders();
      const res = await fetch(POLLINATIONS_FN, {
        method:  "POST",
        headers,
        body:    JSON.stringify({ type: "text", model, messages, system, stream }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const ct = res.headers.get("content-type") ?? "";

      // SSE stream
      if (stream && ct.includes("text/event-stream") && res.body) {
        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buf  = "";
        let full = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const chunk   = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
              const content = chunk.choices?.[0]?.delta?.content ?? "";
              if (content) { full += content; onToken?.(content); }
            } catch { /* ignore malformed frames */ }
          }
        }
        return full;
      }

      // Non-streaming JSON
      const data    = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content ?? "";
      onToken?.(content);
      return content;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { generate, loading, error, setError };
}

// ── Image generation ──────────────────────────────────────────────────────────
export interface ImageResult {
  url:    string;
  prompt: string;
  model:  string;
  width:  number;
  height: number;
  seed?:  number;
}

export function usePollinationsImage() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const generate = useCallback(async (params: {
    prompt:           string;
    model?:           string;
    width?:           number;
    height?:          number;
    seed?:            number;
    enhance?:         boolean;
    negative_prompt?: string;
  }): Promise<ImageResult> => {
    setLoading(true);
    setError(null);
    try {
      const res = await callFn({ type: "image", ...params });
      return await res.json() as ImageResult;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Image generation failed";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { generate, loading, error, setError };
}

// ── Audio TTS ─────────────────────────────────────────────────────────────────
export const VOICE_OPTIONS = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
export type Voice = (typeof VOICE_OPTIONS)[number];

export function usePollinationsAudio() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  /** Returns a blob URL (audio/mpeg). Caller is responsible for revoking it. */
  const synthesize = useCallback(async (text: string, voice: Voice = "nova"): Promise<string> => {
    setLoading(true);
    setError(null);
    try {
      const res = await callFn({ type: "audio", text, voice });
      const buf  = await res.arrayBuffer();
      const blob = new Blob([buf], { type: "audio/mpeg" });
      return URL.createObjectURL(blob);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Audio generation failed";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { synthesize, loading, error, setError };
}

// ── Video generation ──────────────────────────────────────────────────────────
export interface VideoResult {
  url?:    string;
  raw?:    string;
  prompt:  string;
}

export function usePollinationsVideo() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const generate = useCallback(async (prompt: string): Promise<VideoResult> => {
    setLoading(true);
    setError(null);
    try {
      const res = await callFn({ type: "video", prompt });
      return await res.json() as VideoResult;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Video generation failed";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { generate, loading, error, setError };
}
